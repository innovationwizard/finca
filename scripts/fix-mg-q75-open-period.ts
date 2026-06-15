// =============================================================================
// scripts/fix-mg-q75-open-period.ts — Re-price already-saved MG records to Q75
// in OPEN pay periods only, then recompute those periods' payroll.
//
// Context: MG's price was Q0 before 2026-06-08, so MG records captured earlier in
// the open period were snapshotted at unitPrice=0. The catalog price is now Q75
// for the whole year, but past records keep their snapshot — this fixes them.
//
// Scope guard (deliberate): touches ONLY periods with isClosed=false. CLOSED/paid
// periods (e.g. #7) are left intact for a separate retroactive decision. Selects
// by content (MG by code; open periods; rows where unitPrice != 75), so it is
// idempotent and re-runnable. Dry-run by default, --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/fix-mg-q75-open-period.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { calcTotalEarned } from "../src/lib/utils/calculations";
import { recomputePayroll } from "../src/lib/payroll/recalc";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");
const MG_CODE = "MG";
const MG_PRICE = 75.0;
const r2 = (x: number) => Math.round(x * 100) / 100;

(async () => {
  console.log(`\n=== fix MG → Q${MG_PRICE.toFixed(2)} in OPEN periods + recalc — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  try {
    await prisma.$transaction(async (tx) => {
      const mg = await tx.activity.findUnique({ where: { code: MG_CODE }, select: { id: true, name: true } });
      if (!mg) throw new Error(`No existe actividad con code="${MG_CODE}".`);

      // MG records in OPEN periods that are not already Q75.
      const recs = await tx.activityRecord.findMany({
        where: { activityId: mg.id, unitPrice: { not: MG_PRICE }, payPeriod: { isClosed: false } },
        select: { id: true, quantity: true, unitPrice: true, totalEarned: true, payPeriodId: true,
          payPeriod: { select: { periodNumber: true, startDate: true, endDate: true } } },
      });

      if (recs.length === 0) {
        console.log("No hay registros MG por corregir en períodos abiertos. (idempotente)");
      }

      const affectedPeriods = new Map<string, { num: number; start: Date; end: Date }>();
      let deltaEarned = 0;
      for (const rec of recs) {
        const qty = Number(rec.quantity);
        const newTotal = calcTotalEarned(qty, MG_PRICE);
        deltaEarned += newTotal - Number(rec.totalEarned);
        affectedPeriods.set(rec.payPeriodId, { num: rec.payPeriod.periodNumber, start: rec.payPeriod.startDate, end: rec.payPeriod.endDate });
        await tx.activityRecord.update({ where: { id: rec.id }, data: { unitPrice: MG_PRICE, totalEarned: newTotal } });
      }

      console.log(`registros MG corregidos: ${recs.length} (Σ Δdevengado +Q${r2(deltaEarned)})`);
      for (const [, p] of affectedPeriods) {
        console.log(`   período #${p.num} ${p.start.toISOString().slice(0,10)}..${p.end.toISOString().slice(0,10)} (abierto)`);
      }

      // Recompute payroll for each affected open period (preserves manual
      // bonification/advances/deductions; recomputes séptimo + totals).
      for (const [periodId, p] of affectedPeriods) {
        const summary = await recomputePayroll(tx, periodId);
        console.log(`recalc #${p.num}: ${JSON.stringify(summary)}`);
      }

      if (!COMMIT) throw new RollbackSignal();
    }, { timeout: 300_000 });
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
