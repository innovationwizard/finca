// =============================================================================
// src/app/api/pay-periods/[id]/route.ts — Edit a pay period's dates.
// MASTER/ADMIN only (SETTINGS_ROLES). Allows changing endDate — and startDate
// only for a period that has no predecessor (see the invariant below).
//
// WHY dates are editable (pay periods are normally preset & met; these are
// exceptional):
//   • Early payment — unexpected cash-flow requirements; employees agree to be
//     paid a few days BEFORE the preset date → end date moves earlier.
//   • Extension — government/political matters block transactions on the preset
//     date; the period extends until the first future day transactions are
//     possible → end date moves later.
//
// INVARIANT (Jorge, 2026-07-16): "no gap is ever allowed". A successor's start
// is DERIVED, never independently set: successor.startDate ≡ predecessor.endDate
// + 1 day. Two rules hold it:
//   1. On close, the successor is auto-created at prevEnd + 1 (close/route.ts).
//   2. Here: changing a period's endDate MOVES its successor chain to match.
// Therefore startDate is rejected for any period that HAS a strict predecessor —
// editing that start is really editing the predecessor's end. A period with no
// strict predecessor (the first ever, or one after a legacy gap) may still set
// its start, so pre-existing gaps remain repairable.
//
// The move PRESERVES DURATION (Jorge, 2026-07-16): the whole successor chain
// shifts by the same delta, start AND end. Because each successor's end moves
// too, the shift must cascade down the entire chain, not just one period.
//
// Per Jorge's decision, no record-range guard — records may fall outside the new
// range; the next "Recalcular nómina" re-derives séptimo week-ownership by date
// (séptimo is keyed to calendar weeks, not the period boundary). Note this
// applies to the cascade as well: moving a boundary changes which weeks a period
// owns, so séptimo is re-derived on the next recalc, not here.
// agriculturalYear / periodNumber are left untouched (grouping labels).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

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

  const iso = (d: Date) => d.toISOString().split("T")[0];

  // Resolve the effective dates (only the provided ones change).
  const newStart = startDate ? new Date(`${startDate}T00:00:00.000Z`) : existing.startDate;
  const newEnd = endDate ? new Date(`${endDate}T00:00:00.000Z`) : existing.endDate;
  if (newEnd.getTime() < newStart.getTime()) {
    return NextResponse.json({ error: "La fecha de fin no puede ser anterior a la de inicio" }, { status: 400 });
  }

  // A start that is DERIVED may not be set directly (see INVARIANT above). Only
  // enforced when the value actually changes, so clients may echo it back.
  const predecessor = await prisma.payPeriod.findFirst({
    where: { endDate: addDays(existing.startDate, -1) },
    select: { periodNumber: true, endDate: true },
  });
  if (predecessor && newStart.getTime() !== existing.startDate.getTime()) {
    return NextResponse.json(
      { error: `La fecha de inicio del período ${existing.periodNumber} se deriva del período ${predecessor.periodNumber} (termina ${iso(predecessor.endDate)}) y no se edita directamente. Para moverla, cambie la fecha de fin del período ${predecessor.periodNumber}.` },
      { status: 400 },
    );
  }

  // The successor chain, walked by the ORIGINAL boundaries (each link starts the
  // day after the previous ends). A gap breaks the chain — periods beyond it are
  // NOT moved, and the overlap guard below protects them.
  const deltaDays = Math.round((newEnd.getTime() - existing.endDate.getTime()) / DAY_MS);
  const chain: { id: string; periodNumber: number; startDate: Date; endDate: Date; isClosed: boolean }[] = [];
  if (deltaDays !== 0) {
    let cursorEnd = existing.endDate;
    // Bounded by the number of periods; each step advances to a strictly later start.
    for (;;) {
      const next = await prisma.payPeriod.findFirst({
        where: { startDate: addDays(cursorEnd, 1) },
        select: { id: true, periodNumber: true, startDate: true, endDate: true, isClosed: true },
      });
      if (!next) break;
      chain.push(next);
      cursorEnd = next.endDate;
    }
  }

  // Never silently move a paid period.
  const closedInChain = chain.find((c) => c.isClosed);
  if (closedInChain) {
    return NextResponse.json(
      { error: `Mover el período ${existing.periodNumber} desplazaría el período ${closedInChain.periodNumber}, que ya está CERRADO (pagado). Ciérrelo/ajústelo aparte o revise las fechas.` },
      { status: 409 },
    );
  }

  // New ranges: the edited period, then the chain shifted by the same delta
  // (duration preserved — start AND end move).
  const moved = [
    { id, periodNumber: existing.periodNumber, start: newStart, end: newEnd, oldStart: existing.startDate, oldEnd: existing.endDate },
    ...chain.map((c) => ({
      id: c.id, periodNumber: c.periodNumber,
      start: addDays(c.startDate, deltaDays), end: addDays(c.endDate, deltaDays),
      oldStart: c.startDate, oldEnd: c.endDate,
    })),
  ];

  // Integrity: no moved range may overlap a period outside the moved set
  // (overlap → ambiguous which period a date's records belong to). Ranges within
  // the set keep their spacing, since they all shift by the same delta.
  const movedIds = moved.map((m) => m.id);
  const others = await prisma.payPeriod.findMany({
    where: { id: { notIn: movedIds } },
    select: { periodNumber: true, startDate: true, endDate: true },
  });
  for (const m of moved) {
    const conflict = others.find((o) => m.start <= o.endDate && m.end >= o.startDate);
    if (conflict) {
      return NextResponse.json(
        { error: `El rango ${iso(m.start)}…${iso(m.end)} del período ${m.periodNumber} se traslapa con el período ${conflict.periodNumber} (${iso(conflict.startDate)}…${iso(conflict.endDate)}). Ajuste las fechas para que no se encimen.` },
        { status: 409 },
      );
    }
  }

  // Atomic: the edit and every cascaded move land together, each audited.
  await prisma.$transaction(async (tx) => {
    for (const m of moved) {
      await tx.auditLog.create({
        data: {
          userId: auth.id,
          action: "UPDATE",
          tableName: "pay_periods",
          recordId: m.id,
          oldValues: { startDate: iso(m.oldStart), endDate: iso(m.oldEnd) },
          newValues: {
            startDate: iso(m.start),
            endDate: iso(m.end),
            // Mark the cascade so the chain is reconstructable from the log.
            ...(m.id === id ? {} : { movedByEditOf: id, deltaDays }),
          },
        },
      });
      await tx.payPeriod.update({ where: { id: m.id }, data: { startDate: m.start, endDate: m.end } });
    }
  });

  const updated = await prisma.payPeriod.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({
    id: updated.id,
    periodNumber: updated.periodNumber,
    agriculturalYear: updated.agriculturalYear,
    type: updated.type,
    startDate: iso(updated.startDate),
    endDate: iso(updated.endDate),
    isClosed: updated.isClosed,
    // Cascade result, so the caller can report/refresh accurately.
    movedSuccessors: moved.slice(1).map((m) => ({ periodNumber: m.periodNumber, startDate: iso(m.start), endDate: iso(m.end) })),
  });
}
