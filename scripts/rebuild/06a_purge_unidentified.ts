// =============================================================================
// scripts/rebuild/06a_purge_unidentified.ts — Authorized removal of the
// UNIDENTIFIED (hallucinated-identity) records from the NEW prod tables.
//
// Jorge's decision (2026-06-13): "Do not bring unidentified records into the
// new tables." The mapping effort stopped at 96/216; the remaining unmapped old
// workers carry names no human in the finca operation recognizes. Their records
// are NOT attributable to a real person, so they must not enter the live system.
//
// The raw history is NOT lost: every one of these rows still exists, untouched,
// in the *_backup tables produced by the swap (07) and in Supabase PITR. This
// step only removes them from the NEW public tables.
//
// What it deletes (only rows whose worker_id is an UNMAPPED old worker):
//   • public.activity_records   (expected: 756)
//   • public.payroll_entries    (expected: 6)
//   • worker soft-refs: notebook_dictionary(category='worker'), audit_logs(table_name='workers')
// Then stamps worker_reassignment.purged_at on every unmapped row (record-bearing
// or not) so 06_apply's dropped-veteran gate recognizes the disposition as
// deliberate. Original activity_count/payroll_count are preserved for audit.
//
// HARD RECONCILIATION: deleted counts MUST equal the snapshot sums in
// worker_reassignment. Any mismatch ABORTS (the numbers must tie out).
//
// Dry-run by default (transaction + rollback). --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/06a_purge_unidentified.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const n = (v: bigint | number) => Number(v);

(async () => {
  console.log(`\n=== purge unidentified records — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  // Ensure the audit column exists (idempotent).
  await prisma.$executeRawUnsafe(`ALTER TABLE public.worker_reassignment ADD COLUMN IF NOT EXISTS purged_at timestamptz`);

  // Snapshot expectations from the reassignment table (computed at step 04).
  const unmapped = await prisma.$queryRawUnsafe<{ old_worker_id: string; activity_count: number; payroll_count: number }[]>(
    `SELECT old_worker_id, activity_count, payroll_count
     FROM public.worker_reassignment WHERE new_worker_id IS NULL`,
  );
  const ids = unmapped.map((u) => u.old_worker_id);
  const expAct = unmapped.reduce((s, u) => s + n(u.activity_count), 0);
  const expPay = unmapped.reduce((s, u) => s + n(u.payroll_count), 0);
  console.log(`unmapped old workers: ${ids.length} (record-bearing snapshot: ${expAct} activity, ${expPay} payroll)\n`);

  if (ids.length === 0) {
    console.log("Nothing unmapped — nothing to purge.");
    await prisma.$disconnect();
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      // (a) activity_records
      const delAct = await tx.activityRecord.deleteMany({ where: { workerId: { in: ids } } });
      // (b) payroll_entries
      const delPay = await tx.payrollEntry.deleteMany({ where: { workerId: { in: ids } } });
      // (c) worker soft-refs (no FK; clean them so nothing points at a vanished id)
      const delNd = await tx.notebookDictionary.deleteMany({ where: { category: "worker", referenceId: { in: ids } } });
      const delAl = await tx.auditLog.deleteMany({ where: { tableName: "workers", recordId: { in: ids } } });

      console.log(`deleted from NEW tables:`);
      console.log(`  activity_records      : ${delAct.count}   (expected ${expAct})`);
      console.log(`  payroll_entries       : ${delPay.count}   (expected ${expPay})`);
      console.log(`  notebook_dictionary   : ${delNd.count}`);
      console.log(`  audit_logs            : ${delAl.count}`);

      // HARD reconciliation — the numbers must tie out exactly.
      if (delAct.count !== expAct) throw new Error(`activity_records purge mismatch: deleted ${delAct.count} != snapshot ${expAct}`);
      if (delPay.count !== expPay) throw new Error(`payroll_entries purge mismatch: deleted ${delPay.count} != snapshot ${expPay}`);

      // Confirm NO record of an unmapped worker survives in the new tables.
      const [{ a }] = await tx.$queryRawUnsafe<{ a: bigint }[]>(
        `SELECT COUNT(*)::bigint AS a FROM public.activity_records WHERE worker_id = ANY($1::uuid[])`, ids);
      const [{ p }] = await tx.$queryRawUnsafe<{ p: bigint }[]>(
        `SELECT COUNT(*)::bigint AS p FROM public.payroll_entries WHERE worker_id = ANY($1::uuid[])`, ids);
      if (n(a) + n(p) > 0) throw new Error(`residual after purge: ${n(a)} activity, ${n(p)} payroll still reference unmapped workers`);
      console.log(`\n✓ no residual records reference any unmapped worker.`);

      // Stamp the disposition (preserve original counts for audit).
      const stamped = await tx.$executeRawUnsafe(
        `UPDATE public.worker_reassignment
         SET purged_at = now(), notes = COALESCE(NULLIF(notes,''),'') ||
             CASE WHEN notes IS NULL OR notes='' THEN '' ELSE ' | ' END ||
             'purged: unidentified (not brought into new tables) 2026-06-13'
         WHERE new_worker_id IS NULL`);
      console.log(`worker_reassignment stamped purged_at: ${stamped} rows`);

      if (!COMMIT) throw new RollbackSignal();
    }, { timeout: 600_000 });
  } catch (e) {
    if (e instanceof RollbackSignal) {
      console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    } else {
      console.error("\nPURGE FAILED:", e);
      await prisma.$disconnect();
      process.exit(1);
    }
  }
  await prisma.$disconnect();
})();
