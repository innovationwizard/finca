// =============================================================================
// scripts/rebuild/06_apply_reassignment.ts — Apply the worker reassignment
// (Batch 9, AFTER the swap and AFTER Jorge fills public.worker_reassignment).
//
// Remaps the transient old v4 worker_id on records to the canonical SSOT worker:
//   • activity_records   — plain remap (no per-worker unique key).
//   • payroll_entries    — remap; where two old workers map to ONE canonical
//                          person in the SAME (pay_period, category), MERGE by
//                          SUMMING the money (proven merge semantics) — the
//                          unique key (pay_period_id, worker_id, category) would
//                          otherwise collide. total_to_pay is RECOMPUTED.
//   • worker soft-refs   — notebook_dictionary.reference_id (category='worker'),
//                          audit_logs.record_id (table_name='workers').
//
// DROPPED-VETERAN GATE: if any worker_reassignment row carries records
// (activity/payroll) but has no new_worker_id, ABORT — no real person is left
// behind. (Runs in dry-run too.)
//
// Dry-run by default (transaction + rollback). --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/06_apply_reassignment.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const r2 = (n: number) => Math.round(n * 100) / 100;

(async () => {
  console.log(`\n=== apply reassignment — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  // ── Dropped-veteran gate (precondition; always enforced) ───────────────────
  const orphans = await prisma.$queryRawUnsafe<{ old_worker_id: string; old_full_name: string; activity_count: number; payroll_count: number }[]>(
    `SELECT old_worker_id, old_full_name, activity_count, payroll_count
     FROM public.worker_reassignment
     WHERE (activity_count > 0 OR payroll_count > 0) AND new_worker_id IS NULL`,
  );
  if (orphans.length > 0) {
    console.error(`⛔ DROPPED-VETERAN GATE: ${orphans.length} record-bearing old worker(s) have no mapping. ABORTING.`);
    for (const o of orphans) console.error(`   ${o.old_full_name} (${o.activity_count} act, ${o.payroll_count} pay)`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log("✓ dropped-veteran gate passed (every record-bearing old worker is mapped).");

  const mapRows = await prisma.$queryRawUnsafe<{ old_worker_id: string; new_worker_id: string }[]>(
    `SELECT old_worker_id, new_worker_id FROM public.worker_reassignment WHERE new_worker_id IS NOT NULL`,
  );
  const map = new Map(mapRows.map((m) => [m.old_worker_id, m.new_worker_id]));
  console.log(`mappings: ${map.size}\n`);

  try {
    await prisma.$transaction(async (tx) => {
      // (a) activity_records — plain remap
      let arUpdated = 0;
      for (const [oldId, newId] of map) {
        const res = await tx.activityRecord.updateMany({ where: { workerId: oldId }, data: { workerId: newId } });
        arUpdated += res.count;
      }
      console.log(`activity_records remapped: ${arUpdated}`);

      // (b) payroll_entries — remap with merge-by-sum on (new worker, period, category)
      const entries = await tx.payrollEntry.findMany();
      type Acc = {
        payPeriodId: string; workerId: string; category: "VOLUNTARIO" | "FIJO";
        totalEarned: number; bonification: number; seventhDayPay: number;
        advances: number; deductions: number; isPaid: boolean; paidAt: Date | null; createdAt: Date;
        memberIds: string[];
      };
      const groups = new Map<string, Acc>();
      for (const e of entries) {
        const newWorker = map.get(e.workerId) ?? e.workerId; // gate guarantees mapped
        const key = `${e.payPeriodId}|${newWorker}|${e.category}`;
        const g = groups.get(key);
        if (!g) {
          groups.set(key, {
            payPeriodId: e.payPeriodId, workerId: newWorker, category: e.category,
            totalEarned: Number(e.totalEarned), bonification: Number(e.bonification), seventhDayPay: Number(e.seventhDayPay),
            advances: Number(e.advances), deductions: Number(e.deductions),
            isPaid: e.isPaid, paidAt: e.paidAt, createdAt: e.createdAt, memberIds: [e.id],
          });
        } else {
          g.totalEarned = r2(g.totalEarned + Number(e.totalEarned));
          g.bonification = r2(g.bonification + Number(e.bonification));
          g.seventhDayPay = r2(g.seventhDayPay + Number(e.seventhDayPay));
          g.advances = r2(g.advances + Number(e.advances));
          g.deductions = r2(g.deductions + Number(e.deductions));
          g.isPaid = g.isPaid || e.isPaid;
          g.paidAt = !g.paidAt ? e.paidAt : !e.paidAt ? g.paidAt : (e.paidAt > g.paidAt ? e.paidAt : g.paidAt);
          g.createdAt = e.createdAt < g.createdAt ? e.createdAt : g.createdAt;
          g.memberIds.push(e.id);
        }
      }
      await tx.payrollEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
      let merged = 0;
      for (const g of groups.values()) {
        await tx.payrollEntry.create({
          data: {
            payPeriodId: g.payPeriodId, workerId: g.workerId, category: g.category,
            totalEarned: g.totalEarned, bonification: g.bonification, seventhDayPay: g.seventhDayPay,
            advances: g.advances, deductions: g.deductions,
            totalToPay: r2(g.totalEarned + g.bonification + g.seventhDayPay - g.advances - g.deductions),
            isPaid: g.isPaid, paidAt: g.paidAt, createdAt: g.createdAt,
          },
        });
        merged++;
      }
      console.log(`payroll_entries: ${entries.length} source → ${merged} after merge`);

      // (c) worker soft-refs
      let nd = 0, al = 0;
      for (const [oldId, newId] of map) {
        nd += (await tx.notebookDictionary.updateMany({ where: { category: "worker", referenceId: oldId }, data: { referenceId: newId } })).count;
        al += (await tx.auditLog.updateMany({ where: { tableName: "workers", recordId: oldId }, data: { recordId: newId } })).count;
      }
      console.log(`soft-refs remapped: notebook_dictionary=${nd}, audit_logs=${al}`);

      // conservation: every activity_record now points at a real (SSOT) worker
      const [{ orphaned }] = await tx.$queryRawUnsafe<{ orphaned: bigint }[]>(
        `SELECT COUNT(*)::bigint AS orphaned FROM public.activity_records a
         WHERE NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id = a.worker_id)`,
      );
      if (Number(orphaned) > 0) throw new Error(`${orphaned} activity_records still point at a non-existent worker after remap`);
      console.log("\n✓ no orphaned activity_records — every record points at a canonical worker.");
      console.log("  (worker FKs are added next, Batch 9.2 — they will hard-validate this.)");

      if (!COMMIT) throw new RollbackSignal();
    }, { timeout: 600_000 });
  } catch (e) {
    if (e instanceof RollbackSignal) {
      console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    } else {
      console.error("\nAPPLY FAILED:", e);
      await prisma.$disconnect();
      process.exit(1);
    }
  }
  await prisma.$disconnect();
})();
