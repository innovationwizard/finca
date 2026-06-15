// =============================================================================
// scripts/assign-ha-to-hacienda.ts — Assign every "HA · Hacienda" activity
// record in the OPEN period (#8) to the "Hacienda" lote. Analysis showed all 54
// are currently "—" (null) and HA appears in no other period, so this is a clean
// fill (no plot overwrite, single period). loteId doesn't affect pay → no recalc.
//
// Selects by content (activity code HA; lote slug hacienda; the open period).
// updateMany has NO loteId filter on purpose (a != filter would skip NULL rows).
// Dry-run by default, --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/assign-ha-to-hacienda.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");

(async () => {
  console.log(`\n=== HA (Hacienda) → lote Hacienda, período abierto — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  try {
    await prisma.$transaction(async (tx) => {
      const ha = await tx.activity.findUnique({ where: { code: "HA" }, select: { id: true, name: true } });
      if (!ha) throw new Error('No existe actividad code="HA".');
      const lote = await tx.lote.findFirst({ where: { slug: "hacienda" }, select: { id: true, name: true } });
      if (!lote) throw new Error('No existe lote slug="hacienda".');
      const open = await tx.payPeriod.findMany({ where: { isClosed: false }, select: { id: true, periodNumber: true } });
      if (open.length !== 1) throw new Error(`Se esperaba 1 período abierto, hay ${open.length}`);
      const period = open[0];

      const before = await tx.activityRecord.count({ where: { activityId: ha.id, payPeriodId: period.id } });
      const res = await tx.activityRecord.updateMany({
        where: { activityId: ha.id, payPeriodId: period.id },
        data: { loteId: lote.id },
      });
      const nowInLote = await tx.activityRecord.count({ where: { activityId: ha.id, payPeriodId: period.id, loteId: lote.id } });
      const remaining = before - nowInLote;

      console.log(`período #${period.periodNumber}: ${ha.name} = ${before} registros · actualizados: ${res.count} · ahora en ${lote.name}: ${nowInLote}`);
      console.log(`HA que NO quedan en ${lote.name}: ${remaining} (debe ser 0)`);
      if (remaining !== 0) throw new Error("Quedaron registros HA sin reasignar — abortando.");

      if (!COMMIT) throw new RollbackSignal();
    }, { timeout: 120_000 });
  } catch (e) {
    if (e instanceof RollbackSignal) {
      console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    } else {
      console.error("\nFAILED (sin cambios):", e instanceof Error ? e.message : e);
      await prisma.$disconnect();
      process.exit(1);
    }
  }
  await prisma.$disconnect();
})();
