// =============================================================================
// src/lib/utils/agricultural-year.ts — Year calculation helpers
// =============================================================================
// Agricultural year runs March → February.
// "2526" means March 2025 → February 2026.

import { format, endOfMonth, addMonths, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Get the agricultural year code for a given date.
 * March 2025 → "2526", February 2026 → "2526", March 2026 → "2627"
 */
export function getAgriculturalYear(date: Date): string {
  const month = date.getMonth(); // 0-indexed: 0=Jan, 2=Mar
  const year = date.getFullYear();

  // March (2) through December (11) → year/year+1
  // January (0) through February (1) → year-1/year
  const startYear = month >= 2 ? year : year - 1;
  const endYear = startYear + 1;

  return `${String(startYear).slice(2)}${String(endYear).slice(2)}`;
}

/**
 * Get the start date of an agricultural year.
 * "2526" → March 1, 2025
 */
export function getAgriculturalYearStart(yearCode: string): Date {
  const startYear = 2000 + parseInt(yearCode.slice(0, 2), 10);
  return new Date(startYear, 2, 1); // March 1
}

/**
 * Get the end date of an agricultural year.
 * "2526" → February 28/29, 2026
 */
export function getAgriculturalYearEnd(yearCode: string): Date {
  const endYear = 2000 + parseInt(yearCode.slice(2, 4), 10);
  return endOfMonth(new Date(endYear, 1, 1)); // Last day of February
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
 * Get the agricultural month number (1-12) where March=1, February=12.
 */
export function getAgriculturalMonth(date: Date): number {
  const month = date.getMonth(); // 0-indexed
  // March(2)=1, April(3)=2, ..., December(11)=10, January(0)=11, February(1)=12
  return month >= 2 ? month - 1 : month + 11;
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
 * Generate list of months for an agricultural year.
 * Returns [{month: 3, year: 2025, label: "Marzo 2025"}, ...]
 */
export function getAgriculturalMonths(yearCode: string): Array<{
  month: number;
  year: number;
  label: string;
  agMonth: number;
}> {
  const start = getAgriculturalYearStart(yearCode);
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
