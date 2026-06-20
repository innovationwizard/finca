// =============================================================================
// scripts/delete-plan-only-activities.ts — Hard-delete remnant activities that
// have NO work records (only plan entries, or nothing). Per Jorge: "if plan
// only, hard delete; plan is reviewed weekly, voids handled by standard
// procedure." Deletes each target's plan_entries, then the activity (price
// vigencias cascade).
//
// HARD SAFETY: refuses to delete any target that has ≥1 activity_record — those
// carry payroll history and need a separate migration decision (e.g. EN/EE/RE).
// Selects by exact name. Dry-run by default, --commit persists. Audited.
//   npx dotenv -e .env.local -- npx tsx scripts/delete-plan-only-activities.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");

// Plan-only / zero-reference remnants confirmed for hard delete.
const TARGETS = ["oooooo", "desombre", "Monitoreo de Plagas y Enfermedades"];

(async () => {
  console.log(`\n=== hard-delete plan-only remnants — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  try {
    await prisma.$transaction(async (tx) => {
      for (const name of TARGETS) {
        const a = await tx.activity.findUnique({ where: { name }, select: { id: true, name: true, code: true } });
        if (!a) { console.log(`SKIP "${name}" — no existe`); continue; }

        const recordCount = await tx.activityRecord.count({ where: { activityId: a.id } });
        if (recordCount > 0) {
          throw new Error(`ABORT: "${name}" tiene ${recordCount} registro(s) de trabajo — NO es plan-only. No se elimina aquí.`);
        }

        const planCount = await tx.planEntry.count({ where: { activityId: a.id } });
        await tx.planEntry.deleteMany({ where: { activityId: a.id } });
        await tx.activity.delete({ where: { id: a.id } }); // activity_prices cascade
        // No audit row: scripts have no user session and AuditLog.userId is a
        // required User FK. Provenance = this committed script + dry-run output.
        console.log(`DELETE "${name}" — borradas ${planCount} entrada(s) de plan + actividad (vigencias en cascada)`);
      }
      if (!COMMIT) throw new RollbackSignal();
    });
  } catch (e) {
    if (e instanceof RollbackSignal) console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    else { console.error("\nFAILED (sin cambios):", e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1); }
  }
  await prisma.$disconnect();
})();
