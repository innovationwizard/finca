// =============================================================================
// src/lib/plan/plan-week.ts — The week a plan cell belongs to, as a real date.
//
// A plan cell is one activity, on one lote, during one week. The week is stored
// as its FIRST DAY (plan_entries.week_start): the 1st, 8th, 15th or 22nd of a
// calendar month, week 4 running to the end of the month. Four weeks per month
// is the farm's own planning grid, inherited from PLANILLAFINCA.xlsx.
//
// The cosecha and the month index of a cell are computed here from that date and
// never stored. That is the whole point: this table used to hold
// (agriculturalYear, month, week) — positions inside a window — so when the
// cosecha moved from March→February to October→September, `month = 9` silently
// went from November to June on rows nobody had touched.
//
// EVERYTHING HERE IS UTC. Prisma hands back @db.Date columns as UTC midnight, so
// reading them with local getters in Guatemala (UTC-6) rolls the date to the
// previous day — turning the 8th into the 7th, and week 2 into week 1. Same
// reason lib/planilla/history.ts works in UTC day-milliseconds.
// =============================================================================

import { getAgriculturalYear, getAgriculturalMonth } from "@/lib/utils/agricultural-year";

/** Weeks per month in the planning grid. Week 4 absorbs days 22 → month end. */
export const WEEKS_PER_MONTH = 4;

/** Week index (1-4) of a day-of-month. */
function weekOfDay(day: number): number {
  return Math.min(Math.ceil(day / 7), WEEKS_PER_MONTH);
}

/** First day of the week a given index falls on: 1, 8, 15 or 22. */
function firstDayOfWeek(week: number): number {
  return (week - 1) * 7 + 1;
}

/**
 * The week_start of the week that contains `date` — i.e. the value a plan cell
 * would carry for it. Use to line an ActivityRecord up against the plan.
 */
export function weekStartOf(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  return new Date(Date.UTC(y, m, firstDayOfWeek(weekOfDay(date.getUTCDate()))));
}

/**
 * The week_start for a cell of the grid: month index 1-12 within `yearCode`'s
 * cosecha, week 1-4 within that month.
 */
export function weekStartOfCell(
  yearCode: string,
  agMonth: number,
  week: number,
): Date {
  const firstCalendarYear = 2000 + parseInt(yearCode.slice(0, 2), 10);
  // Cosecha month 1 is October, calendar month 10 → 0-indexed 9.
  const monthsFromOctober = 9 + (agMonth - 1);
  return new Date(
    Date.UTC(
      firstCalendarYear + Math.floor(monthsFromOctober / 12),
      monthsFromOctober % 12,
      firstDayOfWeek(week),
    ),
  );
}

/** Which grid cell a week_start lands in: its cosecha, month index and week. */
export function cellOf(weekStart: Date): {
  agriculturalYear: string;
  agMonth: number;
  week: number;
} {
  // Rebuilt as a local Date first: getAgriculturalYear/Month read local parts,
  // and the stored value is UTC midnight.
  const asLocal = new Date(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate(),
  );
  return {
    agriculturalYear: getAgriculturalYear(asLocal),
    agMonth: getAgriculturalMonth(asLocal),
    week: weekOfDay(weekStart.getUTCDate()),
  };
}

/** "2026-11-08" — the wire and cache-key form of a week_start. */
export function weekStartIso(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}

/** Parse a "YYYY-MM-DD" week_start back to a UTC-midnight Date. */
export function parseWeekStartIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
