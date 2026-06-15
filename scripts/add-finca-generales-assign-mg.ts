// =============================================================================
// scripts/add-finca-generales-assign-mg.ts
//   1) Create the "Finca Generales" cost-center lote (like Beneficio/Hacienda —
//      a non-plot center; plot fields left null). Idempotent by slug/name.
//   2) Reassign ALL MG (Mantenimiento General) records in the OPEN period (#8)
//      to that lote — confirmed with Jorge to overwrite the 35 that currently
//      point to real plots, since MG is a farm-general expense.
//
// loteId does not affect pay, so no payroll recompute is needed. Selects by
// content (MG by code; the open period). Dry-run by default, --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/add-finca-generales-assign-mg.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");

const LOTE_NAME = "Finca Generales";
const LOTE_SLUG = "finca-generales";

(async () => {
  console.log(`\n=== "${LOTE_NAME}" + reasignar MG del período abierto — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  try {
    await prisma.$transaction(async (tx) => {
      // 1) Create or find the lote.
      let lote = await tx.lote.findFirst({ where: { OR: [{ slug: LOTE_SLUG }, { name: LOTE_NAME }] }, select: { id: true, name: true } });
      if (lote) {
        console.log(`lote ya existe: ${lote.name} (${lote.id})`);
      } else {
        const maxOrder = await tx.lote.aggregate({ _max: { sortOrder: true } });
        lote = await tx.lote.create({
          data: { name: LOTE_NAME, slug: LOTE_SLUG, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
          select: { id: true, name: true },
        });
        console.log(`CREATE lote ${lote.name} (${lote.id})`);
      }

      // 2) Reassign all MG records in the open period.
      const mg = await tx.activity.findUnique({ where: { code: "MG" }, select: { id: true, name: true } });
      if (!mg) throw new Error('No existe actividad code="MG".');
      const open = await tx.payPeriod.findMany({ where: { isClosed: false }, select: { id: true, periodNumber: true } });
      if (open.length !== 1) throw new Error(`Se esperaba 1 período abierto, hay ${open.length}`);
      const period = open[0];

      const before = await tx.activityRecord.count({ where: { activityId: mg.id, payPeriodId: period.id } });

      // Update ALL MG records in the period (no loteId filter — a NOT/!= filter
      // would skip NULL rows due to SQL NULL semantics, leaving the "—" ones).
      const res = await tx.activityRecord.updateMany({
        where: { activityId: mg.id, payPeriodId: period.id },
        data: { loteId: lote.id },
      });

      // Verify end-state by COUNTING matches (null-safe), not a != filter.
      const nowInLote = await tx.activityRecord.count({ where: { activityId: mg.id, payPeriodId: period.id, loteId: lote.id } });
      const remaining = before - nowInLote;
      console.log(`período #${period.periodNumber}: ${before} registros MG · actualizados: ${res.count} · ahora en ${LOTE_NAME}: ${nowInLote}`);
      console.log(`MG en #${period.periodNumber} que NO quedan en ${LOTE_NAME}: ${remaining} (debe ser 0)`);
      if (remaining !== 0) throw new Error("Quedaron registros MG sin reasignar — abortando.");

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
