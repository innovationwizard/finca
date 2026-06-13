// =============================================================================
// src/lib/payroll/septimo.ts — Séptimo (seventh-day commitment bonus).
// The séptimo is NOT pay for work on a 7th day; it is an attendance prize:
// when a worker attends all required workdays of a week, they earn a configured
// bonus. The amount is a SystemSetting (group "payroll"), editable on the config
// page. The per-week attendance computation lives in computeSeptimoForPeriod().
// =============================================================================

import { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

export const SEPTIMO_AMOUNT_KEY = "septimo_amount";
export const SEPTIMO_AMOUNT_GROUP = "payroll";
export const SEPTIMO_AMOUNT_LABEL = "Monto del séptimo (Q)";
// Initial value tied to the xlsx PAGOS rule (75 × 2). Configurable thereafter.
export const SEPTIMO_AMOUNT_DEFAULT = 150;

/**
 * Current séptimo bonus amount in GTQ. Falls back to the default when the
 * setting row does not exist yet (e.g., before it is first saved in config).
 */
export async function getSeptimoAmount(): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key: SEPTIMO_AMOUNT_KEY } });
  if (!s) return SEPTIMO_AMOUNT_DEFAULT;
  const n = Number(s.value);
  return Number.isFinite(n) && n >= 0 ? n : SEPTIMO_AMOUNT_DEFAULT;
}

// ── Date helpers (all UTC: @db.Date values arrive as UTC midnight; UTC has no
//    DST, so day-stepping by 86_400_000 ms always lands on the next midnight) ──
const DAY_MS = 86_400_000;
/** YYYY-MM-DD for a @db.Date value. */
const dateKey = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Compute the séptimo bonus per worker, for the calendar weeks OWNED by a pay
 * period. (Used by recomputePayroll.)
 *
 * Rule (verbatim intent): "If employee comes to work all six days required, and
 * does paid job all six days required, then a seventh day is paid as some sort
 * of commitment prize." The qualifying unit is a CALENDAR week (Mon–Sat) — NOT
 * the pay period — and the required days ACCUMULATE ACROSS pay-period boundaries
 * (Jorge, 2026-06-13). Specifically:
 *   • A week is "owned" by the period that contains its **Saturday** (the week's
 *     end). Each week therefore has exactly one owning period → paid once, no
 *     double-pay, and only once the week has completed.
 *   • Required workdays of a week = its Mon–Sat dates minus official holidays
 *     (holidays REDUCE the requirement; recurringAnnual matches by month-day).
 *   • A day is "attended" if the worker has ≥1 activity record that day — read
 *     BY DATE across ALL periods, so a week split over a boundary still counts.
 *   • Attended every required day of an owned week → earn the configured amount.
 *
 * Returns workerId → total séptimo (GTQ) attributable to this period. Workers
 * who earn nothing are omitted. Going-forward only is enforced by the caller
 * (recalc refuses closed periods).
 */
export async function computeSeptimoForPeriod(db: Db, payPeriodId: string, amount: number): Promise<Map<string, number>> {
  const earned = new Map<string, number>();
  if (!(amount > 0)) return earned; // disabled / non-positive → no séptimo

  const period = await db.payPeriod.findUnique({
    where: { id: payPeriodId },
    select: { startDate: true, endDate: true },
  });
  if (!period) return earned;
  const startMs = Date.UTC(period.startDate.getUTCFullYear(), period.startDate.getUTCMonth(), period.startDate.getUTCDate());
  const endMs = Date.UTC(period.endDate.getUTCFullYear(), period.endDate.getUTCMonth(), period.endDate.getUTCDate());

  // Holidays: exact dates always match; recurringAnnual matches by month-day.
  const holidays = await db.holiday.findMany({ select: { date: true, recurringAnnual: true } });
  const exactHolidays = new Set<string>();      // YYYY-MM-DD
  const recurringHolidays = new Set<string>();  // MM-DD
  for (const h of holidays) {
    const k = dateKey(h.date);
    exactHolidays.add(k);
    if (h.recurringAnnual) recurringHolidays.add(k.slice(5));
  }
  const isHoliday = (k: string): boolean => exactHolidays.has(k) || recurringHolidays.has(k.slice(5));

  // Weeks OWNED by this period = calendar Mon–Sat weeks whose Saturday is in the
  // period range. Each owned week's required days span the full Mon–Sat (Sat-5…
  // Sat), which may reach back into the PREVIOUS period — that's the cross-period
  // accumulation. Track the overall date span to query attendance once.
  const ownedWeeks: string[][] = []; // each: required day-keys (Mon–Sat minus holidays)
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (let t = startMs; t <= endMs; t += DAY_MS) {
    if (new Date(t).getUTCDay() !== 6) continue; // Saturdays (week-ends) in this period
    const required: string[] = [];
    for (let i = 5; i >= 0; i--) {               // Mon (Sat-5) … Sat (Sat-0)
      const dayMs = t - i * DAY_MS;
      if (dayMs < minMs) minMs = dayMs;
      if (dayMs > maxMs) maxMs = dayMs;
      const k = dateKey(new Date(dayMs));
      if (!isHoliday(k)) required.push(k);       // holiday reduces the requirement
    }
    if (required.length > 0) ownedWeeks.push(required);
  }
  if (ownedWeeks.length === 0) return earned; // no week-end falls in this period

  // Attendance: distinct (worker, date) BY DATE across all periods over the span.
  const records = await db.activityRecord.findMany({
    where: { date: { gte: new Date(minMs), lte: new Date(maxMs) } },
    select: { workerId: true, date: true },
  });
  const attendedByWorker = new Map<string, Set<string>>();
  for (const r of records) {
    (attendedByWorker.get(r.workerId) ?? attendedByWorker.set(r.workerId, new Set()).get(r.workerId)!).add(dateKey(r.date));
  }

  // Earn: per worker, each owned week whose required days are ALL attended → +amount.
  for (const [workerId, attended] of attendedByWorker) {
    let total = 0;
    for (const required of ownedWeeks) {
      if (required.every((day) => attended.has(day))) total += amount;
    }
    if (total > 0) earned.set(workerId, Math.round(total * 100) / 100);
  }

  return earned;
}
