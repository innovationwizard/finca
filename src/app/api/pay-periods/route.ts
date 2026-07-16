// =============================================================================
// src/app/api/pay-periods/route.ts — Pay period management
//
// INVARIANT (Jorge, 2026-07-16): "no gap is ever allowed". A new period must
// start the day after the LAST existing period ends — startDate is constrained
// to max(endDate) + 1. Omit it and it is derived; supply a different date and
// the request is refused. Only the very first period ever (no periods exist) may
// choose its own start.
//
// The other two doors onto the same invariant: close/route.ts auto-creates the
// successor at prevEnd + 1, and PATCH [id] cascades the successor chain when an
// end date moves. Legacy gaps predate the invariant and are NOT repairable here
// (a create can only ever append) — close them by editing dates: the period
// after a gap has no strict predecessor, so its start is still editable.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES, SETTINGS_ROLES } from "@/lib/auth/guards";
import { getAgriculturalYear, getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const currentOnly = searchParams.get("current") === "true";
  const year = searchParams.get("year") ?? getCurrentAgriculturalYear();

  const where: Record<string, unknown> = { agriculturalYear: year };
  if (currentOnly) {
    where.isClosed = false;
  }

  const periods = await prisma.payPeriod.findMany({
    where,
    orderBy: { periodNumber: "desc" },
  });

  return NextResponse.json(
    periods.map((p) => ({
      ...p,
      startDate: p.startDate.toISOString().split("T")[0],
      endDate: p.endDate.toISOString().split("T")[0],
    })),
  );
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { startDate, endDate } = body;
  const iso = (d: Date) => d.toISOString().split("T")[0];

  if (!endDate) {
    return NextResponse.json({ error: "endDate es requerido" }, { status: 400 });
  }
  for (const [label, v] of [["startDate", startDate], ["endDate", endDate]] as const) {
    if (v != null && !ISO.test(v)) {
      return NextResponse.json({ error: `${label} debe tener formato YYYY-MM-DD` }, { status: 400 });
    }
  }

  // No gap: a new period appends to the last one. Derived when not supplied.
  const last = await prisma.payPeriod.aggregate({ _max: { endDate: true } });
  const requiredStart = last._max.endDate ? new Date(last._max.endDate.getTime() + DAY_MS) : null;

  if (!startDate && !requiredStart) {
    return NextResponse.json(
      { error: "startDate es requerido: no existe un período previo del cual derivarlo." },
      { status: 400 },
    );
  }
  const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : requiredStart!;
  if (requiredStart && start.getTime() !== requiredStart.getTime()) {
    return NextResponse.json(
      { error: `El período debe empezar el ${iso(requiredStart)} — el día siguiente al fin del último período (${iso(last._max.endDate!)}). No se permiten huecos entre períodos.` },
      { status: 400 },
    );
  }

  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (end.getTime() < start.getTime()) {
    return NextResponse.json({ error: "La fecha de fin no puede ser anterior a la de inicio" }, { status: 400 });
  }

  // Integrity: no overlap with an existing period (two ranges overlap iff each
  // starts on or before the other ends). `start` is already max(endDate)+1, so
  // this can only fire on a bad endDate — kept as the last line of defense.
  const conflict = await prisma.payPeriod.findFirst({
    where: { startDate: { lte: end }, endDate: { gte: start } },
    select: { periodNumber: true, startDate: true, endDate: true },
  });
  if (conflict) {
    return NextResponse.json(
      { error: `El rango se traslapa con el período ${conflict.periodNumber} (${iso(conflict.startDate)}…${iso(conflict.endDate)}). Ajuste las fechas para que no se encimen.` },
      { status: 409 },
    );
  }

  // Derive agricultural year from the period's start date, not from "today"
  const year = getAgriculturalYear(new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));

  // Get next period number
  const maxPeriod = await prisma.payPeriod.aggregate({
    where: { agriculturalYear: year },
    _max: { periodNumber: true },
  });
  const nextNumber = (maxPeriod._max.periodNumber ?? 0) + 1;

  // Read pay period type from settings
  const typeSetting = await prisma.systemSetting.findUnique({
    where: { key: "pay_period_type" },
  });
  const type = typeSetting
    ? JSON.parse(typeSetting.value)
    : "SEMANAL";

  const period = await prisma.payPeriod.create({
    data: {
      type,
      periodNumber: nextNumber,
      agriculturalYear: year,
      // The validated/derived values — NOT the raw body (startDate may be absent).
      startDate: start,
      endDate: end,
    },
  });

  return NextResponse.json(period, { status: 201 });
}
