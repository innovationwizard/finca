// =============================================================================
// scripts/delete-zero-value-activities.ts — Hard-delete remnant activities
// EN / EE / RE together with their work records. Authorized by Jorge: these
// never carried monetary value (unitPrice/totalEarned = 0 across all records,
// all in closed periods), so deletion is pay-neutral now and historically.
//
// INVARIANT GATE: refuses to delete if ANY record of a target has totalEarned≠0
// or unitPrice≠0 — i.e. it can ONLY remove zero-value history. This operationally
// guarantees "monetary sums are preserved." Plan entries (none expected) and
// price vigencias are also removed (vigencias cascade with the activity).
// Selects by exact name. Dry-run by default, --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/delete-zero-value-activities.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");

const TARGETS = ["EN", "EE", "RE"];

(async () => {
  console.log(`\n=== hard-delete zero-value remnants ${TARGETS.join("/")} — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  try {
    await prisma.$transaction(async (tx) => {
      for (const name of TARGETS) {
        const a = await tx.activity.findUnique({ where: { name }, select: { id: true, name: true } });
        if (!a) { console.log(`SKIP "${name}" — no existe`); continue; }

        // INVARIANT: every record must be monetary-zero, else ABORT (no deletion).
        const recs = await tx.activityRecord.findMany({
          where: { activityId: a.id },
          select: { unitPrice: true, totalEarned: true },
        });
        const nonZero = recs.filter((r) => Number(r.unitPrice) !== 0 || Number(r.totalEarned) !== 0).length;
        if (nonZero > 0) {
          throw new Error(`ABORT: "${name}" tiene ${nonZero} registro(s) con monto ≠ 0 — NO se elimina (preservar sumas monetarias).`);
        }

        const planCount = await tx.planEntry.count({ where: { activityId: a.id } });
        await tx.planEntry.deleteMany({ where: { activityId: a.id } });
        const del = await tx.activityRecord.deleteMany({ where: { activityId: a.id } });
        await tx.activity.delete({ where: { id: a.id } }); // price vigencias cascade

        console.log(`DELETE "${name}" — ${del.count} registro(s) Q0 + ${planCount} plan + actividad (vigencias en cascada)`);
      }
      if (!COMMIT) throw new RollbackSignal();
    }, { timeout: 120_000 });
  } catch (e) {
    if (e instanceof RollbackSignal) console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    else { console.error("\nFAILED (sin cambios):", e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1); }
  }
  await prisma.$disconnect();
})();
