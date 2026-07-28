// =============================================================================
// src/lib/utils/agricultural-year.ts — Year calculation helpers
// =============================================================================
// The agricultural year IS the cosecha, and it runs October 1 → September 30.
// "2526" means October 1, 2025 → September 30, 2026.
//
// It ran March → February until 2026-07-27, which was wrong: the farm's cosecha
// has always started in October (the first coffee intake of 25/26 is dated
// 2025-10-02). Two consequences of that fix are load-bearing and easy to undo
// by accident:
//
//   1. Stored month indices moved. `getAgriculturalMonth` returned 1 for March;
//      it now returns 1 for October. Anything persisting a month index — today
//      only `plan_entries.month` — was remapped by calendar month in
//      scripts/migrate-plan-cosecha-split.ts. A future change to this window
//      needs the same treatment or the data silently shifts.
//   2. `pay_periods.agricultural_year` was NOT re-stamped. Ten historical rows
//      still carry the year the old rule derived. That is deliberate: nothing
//      queries payroll by agricultural year (see lib/payroll/current-period.ts),
//      period numbers are globally sequential and appear in already-circulated
//      export filenames, and re-stamping would collide on
//      @@unique([agriculturalYear, periodNumber, type]). Screens derive a
//      period's cosecha from its start date instead of reading that column.

import { format, addMonths, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Get the agricultural year code for a given date.
 * October 2025 → "2526", September 2026 → "2526", October 2026 → "2627"
 */
export function getAgriculturalYear(date: Date): string {
  const month = date.getMonth(); // 0-indexed: 0=Jan, 9=Oct
  const year = date.getFullYear();

  // October (9) through December (11) → year/year+1
  // January (0) through September (8) → year-1/year
  const startYear = month >= 9 ? year : year - 1;
  const endYear = startYear + 1;

  return `${String(startYear).slice(2)}${String(endYear).slice(2)}`;
}

/**
 * Get the start date of an agricultural year.
 * "2526" → October 1, 2025
 *
 * UTC MIDNIGHT, deliberately. These two bounds exist to filter @db.Date columns,
 * and Postgres compares those by calendar day: a bound carrying a time is cast
 * to whatever day that instant lands on. The end bound used to be
 * endOfMonth(...) — the 30th at 23:59:59.999 LOCAL, which in Guatemala (UTC-6)
 * is 05:59 on October 1st, so the first week of the next cosecha was pulled into
 * the previous one and counted in both. Keep both bounds at UTC midnight.
 */
export function getAgriculturalYearStart(yearCode: string): Date {
  const startYear = 2000 + parseInt(yearCode.slice(0, 2), 10);
  return new Date(Date.UTC(startYear, 9, 1)); // October 1
}

/**
 * Get the end date of an agricultural year.
 * "2526" → September 30, 2026. UTC midnight — see getAgriculturalYearStart.
 */
export function getAgriculturalYearEnd(yearCode: string): Date {
  const endYear = 2000 + parseInt(yearCode.slice(2, 4), 10);
  return new Date(Date.UTC(endYear, 9, 0)); // day 0 of October = September 30
}

/**
 * Check if a date falls within a given agricultural year.
 */
export function isInAgriculturalYear(date: Date, yearCode: string): boolean {
  return isWithinInterval(date, {
    start: getAgriculturalYearStart(yearCode),
    end: getAgriculturalYearEnd(yearCode),
  });
}

/**
 * Get the current agricultural year code.
 */
export function getCurrentAgriculturalYear(): string {
  return getAgriculturalYear(new Date());
}

/**
 * Get the agricultural month number (1-12) where October=1, September=12.
 */
export function getAgriculturalMonth(date: Date): number {
  const month = date.getMonth(); // 0-indexed
  // October(9)=1, November(10)=2, December(11)=3, January(0)=4, ..., September(8)=12
  return month >= 9 ? month - 8 : month + 4;
}

/**
 * Get week number within month (1-4).
 */
export function getWeekInMonth(date: Date): number {
  const day = date.getDate();
  return Math.min(Math.ceil(day / 7), 4);
}

/**
 * Format agricultural year for display: "2526" → "2025/2026"
 */
export function formatAgriculturalYear(yearCode: string): string {
  const startYear = 2000 + parseInt(yearCode.slice(0, 2), 10);
  const endYear = 2000 + parseInt(yearCode.slice(2, 4), 10);
  return `${startYear}/${endYear}`;
}

/**
 * Short display form, the way the farm says it out loud: "2526" → "25/26".
 * Used in page titles and navigation labels.
 */
export function formatAgriculturalYearShort(yearCode: string): string {
  return `${yearCode.slice(0, 2)}/${yearCode.slice(2, 4)}`;
}

/**
 * Generate list of months for an agricultural year.
 * Returns [{month: 3, year: 2025, label: "Marzo 2025"}, ...]
 */
export function getAgriculturalMonths(yearCode: string): Array<{
  month: number;
  year: number;
  label: string;
  agMonth: number;
}> {
  // Built from a LOCAL date, not from getAgriculturalYearStart: these are column
  // headings, and date-fns formats in local time. Handed the UTC-midnight bound
  // the filters use, a negative offset would render October as "septiembre".
  const startYear = 2000 + parseInt(yearCode.slice(0, 2), 10);
  const start = new Date(startYear, 9, 1); // October 1, local
  const months: Array<{ month: number; year: number; label: string; agMonth: number }> = [];

  for (let i = 0; i < 12; i++) {
    const d = addMonths(start, i);
    months.push({
      month: d.getMonth() + 1, // 1-indexed
      year: d.getFullYear(),
      label: format(d, "MMMM yyyy", { locale: es }),
      agMonth: i + 1,
    });
  }

  return months;
}
