// =============================================================================
// src/lib/payroll/current-period.ts — THE definition of "the current period".
//
// Exactly one pay period is open at any time — enforced in the DB by the partial
// unique index `pay_periods_single_open` (migration 20260716200000) and by
// POST /api/pay-periods. "The current period" is therefore simply: the open one.
//
// WHY THIS EXISTS: five pages each re-derived it independently, with two
// different definitions — autorizacion/ajustes/dashboard/resumen took the NEWEST
// open (`orderBy periodNumber desc`), captura the OLDEST. Identical while only
// one period is ever open, so the divergence was invisible. On 2026-07-16 a
// successor was briefly opened early and they split: the first four resolved to
// the EMPTY successor while captura resolved to the period actually awaiting
// payment. Revisión y Autorización would have authorized and closed the empty
// period, leaving Q67,010.61 owed to 41 workers unpaid. One definition, one
// place, so five copies can never drift again.
//
// NOT scoped by agricultural year. A period's year is derived from its START
// date, so a period starting in February and ending in March belongs to the
// PREVIOUS agricultural year while "today" is already in the next one — and a
// year-scoped lookup would report "no open period" for those days, every year,
// at the boundary. The open period is the open period.
//
// `orderBy startDate asc` is a deterministic tiebreak, not an expectation of
// ties: if the invariant is ever violated, this degrades to the OLDEST open
// period — the one awaiting payment — which is the safe answer for the
// authorization flow, and the one captura already used.
// =============================================================================

import { prisma } from "@/lib/prisma";
import type { PayPeriod } from "@prisma/client";

export function getCurrentPayPeriod(): Promise<PayPeriod | null> {
  return prisma.payPeriod.findFirst({
    where: { isClosed: false },
    orderBy: { startDate: "asc" },
  });
}
