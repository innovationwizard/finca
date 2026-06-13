// =============================================================================
// scripts/finalize-septimo-cutover.ts — Séptimo cutover finalize (Batch 6.1 + 7.2).
//   (a) Deactivate the "Septimo"/SP activity (isActive=false) so séptimo can
//       never again be entered as work (it is now a computed bonus). 0 records
//       reference it, so this only prevents future mis-entry.
//   (b) Close all currently-open pay periods (isClosed=true, closedAt=now) so
//       séptimo/recalc are going-forward only — closed periods are refused by
//       the recalc API and never restated. #7 was recalc'd just before this.
//
// Dry-run by default (transaction + rollback). --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/finalize-septimo-cutover.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const k = (d: Date) => d.toISOString().slice(0, 10);

(async () => {
  console.log(`\n=== séptimo cutover finalize — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);
  try {
    await prisma.$transaction(async (tx) => {
      // (a) deactivate SP
      const sp = await tx.activity.findFirst({ where: { OR: [{ code: "SP" }, { name: { equals: "Septimo" } }] } });
      if (!sp) {
        console.log("(a) SP activity: none found — nothing to deactivate.");
      } else if (!sp.isActive) {
        console.log(`(a) SP activity "${sp.name}" (${sp.code}) already inactive.`);
      } else {
        await tx.activity.update({ where: { id: sp.id }, data: { isActive: false } });
        console.log(`(a) SP activity "${sp.name}" (${sp.code}) → isActive=false.`);
      }

      // (b) close all open periods
      const open = await tx.payPeriod.findMany({ where: { isClosed: false }, orderBy: [{ agriculturalYear: "asc" }, { periodNumber: "asc" }] });
      console.log(`(b) open periods to close: ${open.length}`);
      for (const p of open) console.log(`    #${p.periodNumber} (${p.agriculturalYear}) ${k(p.startDate)}…${k(p.endDate)}`);
      const res = await tx.payPeriod.updateMany({ where: { isClosed: false }, data: { isClosed: true, closedAt: new Date() } });
      console.log(`    closed: ${res.count}`);

      const remaining = await tx.payPeriod.count({ where: { isClosed: false } });
      if (remaining !== 0) throw new Error(`expected 0 open after close, found ${remaining}`);
      console.log(`\n✓ all periods closed; séptimo/recalc now apply only to periods opened from here on.`);

      if (!COMMIT) throw new RollbackSignal();
    }, { timeout: 120_000 });
  } catch (e) {
    if (e instanceof RollbackSignal) { console.log("\nDRY-RUN complete — rolled back. Re-run with --commit."); }
    else { console.error("\nFINALIZE FAILED:", e); await prisma.$disconnect(); process.exit(1); }
  }
  await prisma.$disconnect();
})();
