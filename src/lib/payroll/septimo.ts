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
/** The Monday (week anchor) of a date's Mon–Sun week, as a YYYY-MM-DD key. */
function weekKey(d: Date): string {
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return dateKey(new Date(d.getTime() - backToMonday * DAY_MS));
}

/**
 * Compute the séptimo bonus per worker for a pay period.
 *
 * Rule (verbatim intent): "If employee comes to work all six days required, and
 * does paid job all six days required, then a seventh day is paid as some sort
 * of commitment prize." So, per WEEK in the period:
 *   • Required workdays = the Mon–Sat dates within the period range, minus any
 *     official holiday (holidays REDUCE the requirement).
 *   • A day is "attended" if the worker has ≥1 activity record that day (any
 *     work, any amount/type — pure attendance).
 *   • If the worker attended every required day of the week → they earn the
 *     configured amount for that week. One séptimo per week (a catorcena can
 *     yield up to two). Sunday is never a workday and is never required.
 *
 * Returns workerId → total séptimo (GTQ). Workers who earn nothing are omitted.
 * Going-forward only is enforced by the caller (recalc refuses closed periods).
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

  // Required workdays per week (Mon–Sat in range, excluding holidays).
  const requiredByWeek = new Map<string, Set<string>>();
  for (let t = startMs; t <= endMs; t += DAY_MS) {
    const d = new Date(t);
    if (d.getUTCDay() === 0) continue; // Sunday — never a workday
    const k = dateKey(d);
    if (isHoliday(k)) continue;        // holiday reduces the requirement
    const wk = weekKey(d);
    (requiredByWeek.get(wk) ?? requiredByWeek.set(wk, new Set()).get(wk)!).add(k);
  }

  // Attendance: distinct (worker, date) from this period's activity records.
  const records = await db.activityRecord.findMany({
    where: { payPeriodId },
    select: { workerId: true, date: true },
  });
  const attendedByWorker = new Map<string, Set<string>>();
  for (const r of records) {
    (attendedByWorker.get(r.workerId) ?? attendedByWorker.set(r.workerId, new Set()).get(r.workerId)!).add(dateKey(r.date));
  }

  // Earn: per worker, each week whose required days are ALL attended → +amount.
  for (const [workerId, attended] of attendedByWorker) {
    let total = 0;
    for (const required of requiredByWeek.values()) {
      if (required.size === 0) continue; // a fully-holiday week earns nothing
      let allAttended = true;
      for (const day of required) {
        if (!attended.has(day)) { allAttended = false; break; }
      }
      if (allAttended) total += amount;
    }
    if (total > 0) earned.set(workerId, Math.round(total * 100) / 100);
  }

  return earned;
}
