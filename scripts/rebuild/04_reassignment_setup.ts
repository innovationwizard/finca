// =============================================================================
// scripts/rebuild/04_reassignment_setup.ts — Build the worker-reassignment
// worksheet (Batch 9, AFTER the swap).
//
// After the swap: backup.workers = the old 216 dirty rows; public.activity_records
// and public.payroll_entries hold OLD v4 worker_ids (transient). This builds
// public.worker_reassignment — one row per old dirty worker, with its old name,
// old id number, and how many activity/payroll records (+ payroll total) hang off
// it — so Jorge can map each to a canonical SSOT worker (public.workers), and so
// the dropped-veteran gate can flag any record-bearing old worker left unmapped.
//
// Dry-run (default): READ-ONLY preview (counts only). --commit creates + populates
// (idempotent: ON CONFLICT DO NOTHING — never clobbers a mapping Jorge has filled).
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/04_reassignment_setup.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

(async () => {
  console.log(`\n=== reassignment setup — ${COMMIT ? "COMMIT" : "DRY-RUN (read-only)"} ===\n`);

  // Preview (read-only): old workers + how many carry records.
  const [{ total }] = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `SELECT COUNT(*)::bigint AS total FROM backup.workers`,
  );
  const [{ with_records }] = await prisma.$queryRawUnsafe<{ with_records: bigint }[]>(
    `SELECT COUNT(*)::bigint AS with_records FROM backup.workers w
     WHERE EXISTS (SELECT 1 FROM public.activity_records a WHERE a.worker_id = w.id)
        OR EXISTS (SELECT 1 FROM public.payroll_entries p WHERE p.worker_id = w.id)`,
  );
  console.log(`old workers (backup.workers): ${total}`);
  console.log(`  …carrying activity/payroll records (must be mapped — dropped-veteran gate): ${with_records}`);

  if (!COMMIT) {
    console.log("\nDRY-RUN — nothing written. Re-run with --commit to create + populate public.worker_reassignment.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.worker_reassignment (
      old_worker_id   uuid PRIMARY KEY,
      old_full_name   text,
      old_dpi         text,
      activity_count  integer NOT NULL DEFAULT 0,
      payroll_count   integer NOT NULL DEFAULT 0,
      payroll_total   numeric(12,2) NOT NULL DEFAULT 0,
      new_worker_id   uuid REFERENCES public.workers(id),
      notes           text,
      resolved_at     timestamptz
    )`);

  await prisma.$executeRawUnsafe(`
    INSERT INTO public.worker_reassignment
      (old_worker_id, old_full_name, old_dpi, activity_count, payroll_count, payroll_total)
    SELECT w.id, w.full_name, w.dpi,
           COALESCE(ac.cnt, 0), COALESCE(pc.cnt, 0), COALESCE(pt.total, 0)
    FROM backup.workers w
    LEFT JOIN (SELECT worker_id, COUNT(*)::int AS cnt FROM public.activity_records GROUP BY worker_id) ac ON ac.worker_id = w.id
    LEFT JOIN (SELECT worker_id, COUNT(*)::int AS cnt FROM public.payroll_entries GROUP BY worker_id) pc ON pc.worker_id = w.id
    LEFT JOIN (SELECT worker_id, SUM(total_to_pay) AS total FROM public.payroll_entries GROUP BY worker_id) pt ON pt.worker_id = w.id
    ON CONFLICT (old_worker_id) DO NOTHING`);

  const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM public.worker_reassignment`,
  );
  console.log(`\n✓ public.worker_reassignment ready — ${n} rows. Fill new_worker_id per old worker (Batch 9.1), then apply (06).`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("\nREASSIGNMENT SETUP FAILED:", e);
  await prisma.$disconnect();
  process.exit(1);
});
