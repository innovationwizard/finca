// =============================================================================
// scripts/mark-paid-marco.ts — Mark MARCO ANTONIO SOLANO's open-period (#8)
// PayrollEntry as paid (isPaid=true, paidAt=now). He was already paid out-of-band,
// so the bank-file export (which now excludes isPaid entries) must skip him to
// avoid double-payment. Identified by CUI with a name-assert. No pay math changes.
//   npx dotenv -e .env.local -- npx tsx scripts/mark-paid-marco.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");

const CUI = "1966179950608";
const EXPECT_NAME = "MARCO ANTONIO SOLANO";

(async () => {
  console.log(`\n=== marcar pagado: ${EXPECT_NAME} (período abierto) — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);
  try {
    await prisma.$transaction(async (tx) => {
      const w = await tx.worker.findUnique({ where: { cui: CUI }, select: { id: true, fullName: true } });
      if (!w) throw new Error(`ABORT: no existe worker con CUI=${CUI}`);
      if (w.fullName !== EXPECT_NAME) throw new Error(`ABORT: nombre no coincide. BD="${w.fullName}" esperado="${EXPECT_NAME}"`);

      const open = await tx.payPeriod.findMany({ where: { isClosed: false }, select: { id: true, periodNumber: true } });
      if (open.length !== 1) throw new Error(`Se esperaba 1 período abierto, hay ${open.length}`);
      const period = open[0];

      const e = await tx.payrollEntry.findFirst({ where: { payPeriodId: period.id, workerId: w.id } });
      if (!e) throw new Error(`ABORT: ${EXPECT_NAME} no tiene entry en período #${period.periodNumber}`);

      if (e.isPaid) {
        console.log(`SKIP — ya estaba marcado pagado (aPagar Q${Number(e.totalToPay).toFixed(2)})`);
      } else {
        await tx.payrollEntry.update({ where: { id: e.id }, data: { isPaid: true, paidAt: new Date() } });
        console.log(`OK — ${EXPECT_NAME} marcado pagado en #${period.periodNumber} (aPagar Q${Number(e.totalToPay).toFixed(2)}, excluido del archivo)`);
      }

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
