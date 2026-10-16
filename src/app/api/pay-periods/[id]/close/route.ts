// =============================================================================
// src/app/api/pay-periods/[id]/close/route.ts — Authorize payment: close the
// period on that day AND auto-open the next one. MASTER/ADMIN only
// (SETTINGS_ROLES). Atomic (single transaction).
//
// The authorization IS the close. A day's pay is quantity × rate, both unknown
// until the day has happened, so the inclusive end date written here is the
// authorization's calendar day in America/Guatemala — or the stored end, when
// that end is already on or before that day. A planned Saturday still in the
// future is cut. Days after the cut belong to the successor, which starts the
// next morning (no gap). See src/lib/payroll/authorization-date.ts.
//
// When the end date moves, payroll is recomputed BEFORE the lock, so the
// séptimo of a week whose Saturday leaves this period is not paid here. It is
// paid later, in the period that contains that Saturday, once the week has
// actually finished (src/lib/payroll/septimo.ts).
//
// Closing LOCKS the period (captura/recalc/planilla refuse it).
//
// The successor's end is a SOFT default: the 4th Saturday on/after its start,
// so a ~4-week period ends on a Saturday. Editable afterwards via "Editar
// fechas" while it is still open. If a period already overlaps the proposed
// range, creation is skipped (the close still commits) and nextPeriod is null.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { getAgriculturalYear } from "@/lib/utils/agricultural-year";
import { recomputePayroll } from "@/lib/payroll/recalc";
import {
  formatDmy,
  isoToUtcDate,
  payableEndISO,
} from "@/lib/payroll/authorization-date";

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

  const now = new Date();
  const startISO = isoUTC(period.startDate);
  const plannedEnd = isoUTC(period.endDate);
  const payableEnd = payableEndISO(startISO, plannedEnd, now);
  if (!payableEnd) {
    return NextResponse.json(
      {
        error:
          `Este período empieza el ${formatDmy(startISO)}. ` +
          `Autorizar cierra el período en el día de hoy, que todavía no cae dentro de él.`,
      },
      { status: 409 },
    );
  }

  const futureRecords = await prisma.activityRecord.count({
    where: { payPeriodId: id, date: { gt: isoToUtcDate(payableEnd) } },
  });
  if (futureRecords > 0) {
    return NextResponse.json(
      {
        error:
          `Hay ${futureRecords} registro(s) de actividad después del ${formatDmy(payableEnd)}. ` +
          `Esos días ya tienen trabajo; no se pueden dejar fuera de este pago ni dentro de un período que se cierra hoy.`,
      },
      { status: 409 },
    );
  }

  const typeSetting = await prisma.systemSetting.findUnique({ where: { key: "pay_period_type" } });
  const defaultType = typeSetting ? JSON.parse(typeSetting.value) : "SEMANAL";
  const truncating = payableEnd !== plannedEnd;

  const result = await prisma.$transaction(async (tx) => {
    // 1) Cut a future planned end BEFORE the lock, then recompute so the
    //    séptimo follows the Saturday that still falls inside the period.
    if (truncating) {
      await tx.payPeriod.update({
        where: { id },
        data: { endDate: isoToUtcDate(payableEnd) },
      });
      await recomputePayroll(tx, id);
    }

    // 2) Close. endDate is already the authorization day (or earlier).
    const closed = await tx.payPeriod.update({
      where: { id },
      data: { isClosed: true, closedAt: now, closedBy: auth.id },
    });
    await tx.auditLog.create({
      data: {
        userId: auth.id,
        action: "CLOSE_PAY_PERIOD",
        tableName: "pay_periods",
        recordId: id,
        oldValues: { isClosed: false, endDate: plannedEnd },
        newValues: {
          isClosed: true,
          endDate: payableEnd,
          closedAt: now.toISOString(),
          ...(truncating ? { plannedEndDate: plannedEnd } : {}),
        },
      },
    });

    // 3) Auto-open the next period from the end actually written.
    const { start, end } = nextRange(closed.endDate);
    const overlap = await tx.payPeriod.findFirst({
      where: { startDate: { lte: end }, endDate: { gte: start } },
      select: { id: true },
    });
    if (overlap) return { closed, created: null as null | typeof closed };

    const year = getAgriculturalYear(new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    // Max across ALL periods, not within the year — see POST /api/pay-periods:
    // per-year numbering restarts at the cosecha boundary and would follow #10
    // with #4, on a number the farm says out loud and the export filename carries.
    const maxPeriod = await tx.payPeriod.aggregate({ _max: { periodNumber: true } });
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
  }, { timeout: 120_000 });

  return NextResponse.json({
    id: result.closed.id,
    periodNumber: result.closed.periodNumber,
    endDate: isoUTC(result.closed.endDate),
    isClosed: result.closed.isClosed,
    nextPeriod: result.created
      ? { id: result.created.id, periodNumber: result.created.periodNumber, startDate: isoUTC(result.created.startDate), endDate: isoUTC(result.created.endDate) }
      : null,
  });
}
