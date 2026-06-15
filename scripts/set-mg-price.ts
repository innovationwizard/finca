// =============================================================================
// scripts/set-mg-price.ts — Make activity MG (Mantenimiento General) pay Q75.00
// per jornal for the WHOLE agricultural year.
//
// Why this exists: MG already has defaultPrice=Q75, but its effective-dated price
// schedule had a Q0 vigencia from 2026-03-01 and a Q75 vigencia from 2026-06-08,
// so the grid resolved MG to Q0 for any work date before 2026-06-08 ("no marca
// valor"). Per decision, MG must be Q75 from 2026-03-01 onward.
//
// Target state (reconciled): MG has exactly ONE vigencia → 2026-03-01 @ Q75.
//   • the 2026-03-01 vigencia is set to Q75 (was Q0)
//   • every other vigencia is removed (the 2026-06-08 @ Q75 is now redundant)
// A "jornal" here is one attendance/participation event, not a full legal
// workday (see docs/glosario.md), so Q75 < Q119.21/día is intentional.
//
// Already-saved activity_records keep their snapshotted unitPrice — unchanged.
// Selects by content (code = "MG"), dry-run by default, --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/set-mg-price.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");

const MG_CODE = "MG";
const MG_PRICE = 75.0;
const EFFECTIVE_FROM = "2026-03-01";
const EFF_DATE = new Date(`${EFFECTIVE_FROM}T00:00:00.000Z`);
const d = (x: Date) => x.toISOString().slice(0, 10);

(async () => {
  console.log(`\n=== ${MG_CODE} → Q${MG_PRICE.toFixed(2)} desde ${EFFECTIVE_FROM} (todo el año) — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  try {
    await prisma.$transaction(async (tx) => {
      const mg = await tx.activity.findUnique({
        where: { code: MG_CODE },
        include: { prices: { orderBy: { effectiveFrom: "asc" } } },
      });
      if (!mg) throw new Error(`No existe actividad con code="${MG_CODE}". Verificar el catálogo (no se asume).`);
      if (mg.unit !== "DIA") {
        console.warn(`⚠ unidad de ${MG_CODE} es ${mg.unit}, no DIA — un jornal corresponde a Día. Revisar en /admin/actividades.`);
      }

      console.log("vigencias actuales:");
      for (const v of mg.prices) console.log(`   ${d(v.effectiveFrom)} -> Q${Number(v.price).toFixed(2)}${v.note ? ` (${v.note})` : ""}`);

      // Remove every vigencia except the target date (declaratively reconcile).
      for (const v of mg.prices) {
        if (d(v.effectiveFrom) !== EFFECTIVE_FROM) {
          console.log(`DELETE ${d(v.effectiveFrom)} -> Q${Number(v.price).toFixed(2)}${v.note ? ` (${v.note})` : ""}`);
        }
      }
      await tx.activityPrice.deleteMany({ where: { activityId: mg.id, effectiveFrom: { not: EFF_DATE } } });

      // Upsert the single target vigencia to Q75.
      await tx.activityPrice.upsert({
        where: { activityId_effectiveFrom: { activityId: mg.id, effectiveFrom: EFF_DATE } },
        update: { price: MG_PRICE, note: "MG Q75/jornal — todo el año agrícola" },
        create: { activityId: mg.id, effectiveFrom: EFF_DATE, price: MG_PRICE, note: "MG Q75/jornal — todo el año agrícola" },
      });
      console.log(`UPSERT ${EFFECTIVE_FROM} -> Q${MG_PRICE.toFixed(2)}`);

      // Keep defaultPrice consistent as the denormalized "current" value.
      if (mg.defaultPrice === null || Number(mg.defaultPrice) !== MG_PRICE) {
        await tx.activity.update({ where: { id: mg.id }, data: { defaultPrice: MG_PRICE } });
        console.log(`defaultPrice -> Q${MG_PRICE.toFixed(2)}`);
      }

      const after = await tx.activityPrice.findMany({ where: { activityId: mg.id }, orderBy: { effectiveFrom: "asc" } });
      console.log("vigencias resultantes:");
      for (const v of after) console.log(`   ${d(v.effectiveFrom)} -> Q${Number(v.price).toFixed(2)}`);

      if (!COMMIT) throw new RollbackSignal();
    });
  } catch (e) {
    if (e instanceof RollbackSignal) {
      console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    } else {
      console.error("\nFAILED:", e instanceof Error ? e.message : e);
      await prisma.$disconnect();
      process.exit(1);
    }
  }
  await prisma.$disconnect();
})();
