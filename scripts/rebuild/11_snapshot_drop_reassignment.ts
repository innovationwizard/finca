// =============================================================================
// scripts/rebuild/11_snapshot_drop_reassignment.ts — Final cleanup (Batch 9.4).
// Jorge's decision (2026-06-13): SNAPSHOT then DROP the transient
// worker_reassignment audit table so the live DB matches schema.prisma exactly
// (clean Prisma baseline). The full audit trail (96 mappings + 120 purges with
// purged_at, old names, counts, money) is written to a gitignored backups/ file
// first; it also survives in the *_backup tables + backups/reassignment-map.json.
//
// Snapshot ALWAYS runs (read-only + file write). DROP only with --commit.
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/11_snapshot_drop_reassignment.ts [--commit]
// =============================================================================

import { writeFileSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const OUT = "backups/worker_reassignment-audit.json";

(async () => {
  console.log(`\n=== snapshot + ${COMMIT ? "DROP" : "(no drop — dry-run)"} worker_reassignment ===\n`);

  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM public.worker_reassignment ORDER BY old_full_name`);
  const mapped = rows.filter((r) => r.new_worker_id != null).length;
  const purged = rows.filter((r) => r.purged_at != null).length;

  // Serialize (BigInt-safe) and write the snapshot.
  const json = JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2);
  writeFileSync(OUT, json);

  // Verify the file round-trips and the row count matches before any drop.
  const readBack = JSON.parse(readFileSync(OUT, "utf8")) as unknown[];
  if (readBack.length !== rows.length) throw new Error(`snapshot verify failed: wrote ${rows.length}, read ${readBack.length}`);
  console.log(`✓ snapshot written: ${OUT} — ${rows.length} rows (mapped=${mapped}, purged=${purged}). Verified.`);

  if (!COMMIT) {
    console.log("\nDry-run — table NOT dropped. Re-run with --commit to drop after snapshot.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$executeRawUnsafe(`DROP TABLE public.worker_reassignment`);
  const [{ exists }] = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='worker_reassignment') AS exists`,
  );
  if (exists) throw new Error("DROP reported success but table still exists");
  console.log("✓ worker_reassignment dropped. Live DB now matches schema.prisma (app tables).");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("FAILED:", e); await prisma.$disconnect(); process.exit(1); });
