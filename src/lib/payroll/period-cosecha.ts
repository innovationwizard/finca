// =============================================================================
// src/lib/payroll/period-cosecha.ts — A pay period's cosecha, derived from its
// dates. NEVER read `pay_periods.agricultural_year` to answer this.
//
// WHY: that column stores whatever rule was in force the day the period was
// created. Ten rows still carry the year the old March→February rule derived,
// and they cannot be re-stamped — every period would land in cosecha 25/26,
// where period numbers 1, 2 and 3 already exist twice, violating
// @@unique([agriculturalYear, periodNumber, type]). Renumbering is not an option
// either: the period number is baked into the export filename
// (api/planilla/export/route.ts) of workbooks already downloaded and circulated.
//
// So the column stays as a creation-time artifact and the truth is derived here.
// A period belongs to the cosecha its START date falls in — the same rule
// lib/payroll/current-period.ts documents, and the same reason that file gives
// for never scoping the open-period lookup by year: a period starting in
// September and ending in October belongs to the earlier cosecha even though
// "today" is already in the next one.
// =============================================================================

import type { Prisma } from "@prisma/client";
import {
  getAgriculturalYear,
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
} from "@/lib/utils/agricultural-year";

/** The cosecha code ("2526") a period belongs to, from its start date. */
export function periodCosecha(period: { startDate: Date }): string {
  const d = period.startDate;
  // Dates are stored as @db.Date and read back at UTC midnight; read the UTC
  // parts so a negative local offset cannot roll the day (and the month, and
  // therefore the cosecha) backwards.
  return getAgriculturalYear(
    new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * Where-clause selecting the periods of one cosecha by date rather than by the
 * stored stamp. Use for reports scoped to a season; do NOT use to find the open
 * period — that is `getCurrentPayPeriod()`, unscoped, always.
 */
export function periodsOfCosecha(yearCode: string): Prisma.PayPeriodWhereInput {
  return {
    startDate: {
      gte: getAgriculturalYearStart(yearCode),
      lte: getAgriculturalYearEnd(yearCode),
    },
  };
}
