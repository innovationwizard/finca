// =============================================================================
// src/app/api/pay-periods/[id]/route.ts — Edit a pay period's dates.
// MASTER/ADMIN only (SETTINGS_ROLES). Allows changing startDate and/or endDate
// of an existing period.
//
// WHY dates are editable (pay periods are normally preset & met; these are
// exceptional):
//   • Early payment — unexpected cash-flow requirements; employees agree to be
//     paid a few days BEFORE the preset date → end date moves earlier.
//   • Extension — government/political matters block transactions on the preset
//     date; the period extends until the first future day transactions are
//     possible → end date moves later.
//
// Per Jorge's decision, no record-range guard — records may fall outside the new
// range; the next "Recalcular nómina" re-derives séptimo week-ownership by date
// (séptimo is keyed to calendar weeks, not the period boundary).
// agriculturalYear / periodNumber are left untouched (grouping labels).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json();
  const startDate: string | undefined = body.startDate;
  const endDate: string | undefined = body.endDate;

  if (startDate === undefined && endDate === undefined) {
    return NextResponse.json({ error: "Indique startDate y/o endDate" }, { status: 400 });
  }
  for (const [label, v] of [["startDate", startDate], ["endDate", endDate]] as const) {
    if (v !== undefined && !ISO.test(v)) {
      return NextResponse.json({ error: `${label} debe tener formato YYYY-MM-DD` }, { status: 400 });
    }
  }

  const existing = await prisma.payPeriod.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
  }

  // Resolve the effective dates (only the provided ones change).
  const newStart = startDate ? new Date(`${startDate}T00:00:00.000Z`) : existing.startDate;
  const newEnd = endDate ? new Date(`${endDate}T00:00:00.000Z`) : existing.endDate;
  if (newEnd.getTime() < newStart.getTime()) {
    return NextResponse.json({ error: "La fecha de fin no puede ser anterior a la de inicio" }, { status: 400 });
  }

  const iso = (d: Date) => d.toISOString().split("T")[0];

  await prisma.auditLog.create({
    data: {
      userId: auth.id,
      action: "UPDATE",
      tableName: "pay_periods",
      recordId: id,
      oldValues: { startDate: iso(existing.startDate), endDate: iso(existing.endDate) },
      newValues: { startDate: iso(newStart), endDate: iso(newEnd) },
    },
  });

  const updated = await prisma.payPeriod.update({
    where: { id },
    data: { startDate: newStart, endDate: newEnd },
  });

  return NextResponse.json({
    id: updated.id,
    periodNumber: updated.periodNumber,
    agriculturalYear: updated.agriculturalYear,
    type: updated.type,
    startDate: iso(updated.startDate),
    endDate: iso(updated.endDate),
    isClosed: updated.isClosed,
  });
}
