// =============================================================================
// src/app/api/pay-periods/[id]/close/route.ts — Close a pay period AND auto-open
// the next one. MASTER/ADMIN only (SETTINGS_ROLES). Atomic (single transaction).
//
// Closing sets isClosed=true, closedAt=now, closedBy=current user, audited.
// Closing LOCKS the period (captura/recalc/planilla refuse it) — do it after
// payment is confirmed.
//
// Immediately after closing, a new period is created with:
//   • start = HARD default = the next calendar day (zero gap, no days skipped)
//   • end   = SOFT default = the 4th Saturday on/after the start — i.e. a ~4-week
//     period ending ON a Saturday, so all four weekly séptimos fall inside it.
//     (Editable afterwards via "Editar fechas".)
// If a period already overlaps the proposed range, creation is skipped (the
// close still commits) and nextPeriod is null.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { getAgriculturalYear } from "@/lib/utils/agricultural-year";

const isoUTC = (d: Date) => d.toISOString().split("T")[0];

// Next period's default range, computed in UTC to match @db.Date storage.
function nextRange(prevEnd: Date): { start: Date; end: Date } {
  const start = new Date(prevEnd);
  start.setUTCDate(start.getUTCDate() + 1); // hard: next calendar day, zero gap
  // Soft default end: 4th Saturday on/after start (4 weeks, ends on Saturday).
  const toFirstSat = (6 - start.getUTCDay() + 7) % 7; // 0 if start is Saturday
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + toFirstSat + 21); // 1st Saturday + 3 weeks
  return { start, end };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const period = await prisma.payPeriod.findUnique({ where: { id } });
  if (!period) {
    return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
  }
  if (period.isClosed) {
    return NextResponse.json({ error: "El período ya está cerrado." }, { status: 409 });
  }

  const typeSetting = await prisma.systemSetting.findUnique({ where: { key: "pay_period_type" } });
  const defaultType = typeSetting ? JSON.parse(typeSetting.value) : "SEMANAL";

  const result = await prisma.$transaction(async (tx) => {
    // 1) Close the period.
    const closed = await tx.payPeriod.update({
      where: { id },
      data: { isClosed: true, closedAt: new Date(), closedBy: auth.id },
    });
    await tx.auditLog.create({
      data: {
        userId: auth.id,
        action: "CLOSE_PAY_PERIOD",
        tableName: "pay_periods",
        recordId: id,
        oldValues: { isClosed: false },
        newValues: { isClosed: true, closedAt: closed.closedAt?.toISOString() ?? null },
      },
    });

    // 2) Auto-open the next period (skip if the range would overlap one).
    const { start, end } = nextRange(period.endDate);
    const overlap = await tx.payPeriod.findFirst({
      where: { startDate: { lte: end }, endDate: { gte: start } },
      select: { id: true },
    });
    if (overlap) return { closed, created: null as null | typeof closed };

    const year = getAgriculturalYear(new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const maxPeriod = await tx.payPeriod.aggregate({ where: { agriculturalYear: year }, _max: { periodNumber: true } });
    const created = await tx.payPeriod.create({
      data: {
        type: defaultType,
        periodNumber: (maxPeriod._max.periodNumber ?? 0) + 1,
        agriculturalYear: year,
        startDate: start,
        endDate: end,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: auth.id,
        action: "CREATE_PAY_PERIOD",
        tableName: "pay_periods",
        recordId: created.id,
        newValues: { startDate: isoUTC(start), endDate: isoUTC(end), autoCreatedAfter: id },
      },
    });
    return { closed, created };
  });

  return NextResponse.json({
    id: result.closed.id,
    periodNumber: result.closed.periodNumber,
    isClosed: result.closed.isClosed,
    nextPeriod: result.created
      ? { id: result.created.id, periodNumber: result.created.periodNumber, startDate: isoUTC(result.created.startDate), endDate: isoUTC(result.created.endDate) }
      : null,
  });
}
