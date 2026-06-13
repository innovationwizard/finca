// =============================================================================
// src/lib/payroll/recalc.ts — "Recalcular nómina": (re)generate payroll_entries
// for a pay period from its activity_records. Idempotent and re-runnable.
//
//   • For each worker with activity in the period: sum their activity_records →
//     totalEarned; the entry's category is a SNAPSHOT of worker.category
//     (current, toggleable); totalToPay is recomputed via calcNetPay.
//   • Manual adjustments (bonification, advances, deductions) are PRESERVED on
//     existing entries — never overwritten.
//   • seventhDayPay is COMPUTED (attendance-based, per week) and written on every
//     run — it is derived, not manual. Closed periods are refused by the caller
//     (recalc API), so this is going-forward only.
//   • An existing entry whose worker now has no activity is zeroed (earnings and
//     séptimo removed) but kept, so manual adjustments aren't lost silently.
//
// Assumes ≤1 payroll_entry per (worker, period) — guaranteed post-reassignment.
// =============================================================================

import { PrismaClient, Prisma } from "@prisma/client";
import { calcNetPay } from "@/lib/utils/calculations";
import { computeSeptimoForPeriod, getSeptimoAmount } from "@/lib/payroll/septimo";

type Db = PrismaClient | Prisma.TransactionClient;

export type RecalcSummary = { workersWithActivity: number; created: number; updated: number; zeroed: number };

export async function recomputePayroll(db: Db, payPeriodId: string): Promise<RecalcSummary> {
  const agg = await db.activityRecord.groupBy({
    by: ["workerId"],
    where: { payPeriodId },
    _sum: { totalEarned: true },
  });

  const workerIds = agg.map((a) => a.workerId);
  const workers = workerIds.length
    ? await db.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, category: true } })
    : [];
  const categoryOf = new Map(workers.map((w) => [w.id, w.category]));

  const existing = await db.payrollEntry.findMany({ where: { payPeriodId } });
  const existingByWorker = new Map(existing.map((e) => [e.workerId, e]));

  // Computed séptimo (attendance bonus) per worker for this period.
  const septimoByWorker = await computeSeptimoForPeriod(db, payPeriodId, await getSeptimoAmount());

  let created = 0, updated = 0, zeroed = 0;
  const seen = new Set<string>();

  for (const a of agg) {
    seen.add(a.workerId);
    const totalEarned = Number(a._sum.totalEarned ?? 0);
    const category = categoryOf.get(a.workerId) ?? "VOLUNTARIO";
    const seventhDayPay = septimoByWorker.get(a.workerId) ?? 0;
    const e = existingByWorker.get(a.workerId);
    if (e) {
      await db.payrollEntry.update({
        where: { id: e.id },
        data: {
          category,
          totalEarned,
          seventhDayPay,
          totalToPay: calcNetPay(totalEarned, Number(e.bonification), seventhDayPay, Number(e.advances), Number(e.deductions)),
        },
      });
      updated++;
    } else {
      await db.payrollEntry.create({
        data: {
          payPeriodId, workerId: a.workerId, category, totalEarned, seventhDayPay,
          totalToPay: calcNetPay(totalEarned, 0, seventhDayPay, 0, 0),
        },
      });
      created++;
    }
  }

  for (const e of existing) {
    if (seen.has(e.workerId)) continue;
    // No activity → no earnings and no séptimo (attendance can't be met).
    await db.payrollEntry.update({
      where: { id: e.id },
      data: {
        totalEarned: 0,
        seventhDayPay: 0,
        totalToPay: calcNetPay(0, Number(e.bonification), 0, Number(e.advances), Number(e.deductions)),
      },
    });
    zeroed++;
  }

  return { workersWithActivity: agg.length, created, updated, zeroed };
}
