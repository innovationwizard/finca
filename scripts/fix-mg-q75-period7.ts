// =============================================================================
// scripts/fix-mg-q75-period7.ts — Retroactive MG fix for the CLOSED/paid period.
// MG is a Q75 paid activity but #7's MG records were snapshotted at Q0, so those
// workers were UNDERPAID by exactly the MG amount.
//
// MG-ONLY adjustment (NOT a full recompute): a blanket recomputePayroll would
// also re-rate #7's séptimo at the CURRENT Q300 amount (séptimo was already
// settled at its historical rate at closure), inflating the back-pay ~5x. So we
// add ONLY the MG difference to each entry's totalEarned + totalToPay and leave
// seventhDayPay / bonification / advances / deductions exactly as paid.
//
// Per worker: Δ = (their #7 MG records) × Q75. Reprices the records too. Selects
// by content (MG records with unitPrice≠75 in a closed period; asserts ONE
// period). Dry-run by default, --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/fix-mg-q75-period7.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { calcTotalEarned } from "../src/lib/utils/calculations";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");
const MG_PRICE = 75;
const r2 = (x: number) => Math.round(x * 100) / 100;

(async () => {
  console.log(`\n=== retroactive MG→Q75 (MG-ONLY, séptimo preserved) — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  try {
    await prisma.$transaction(async (tx) => {
      const mg = await tx.activity.findUnique({ where: { code: "MG" }, select: { id: true } });
      if (!mg) throw new Error('No existe actividad code="MG".');

      const bad = await tx.activityRecord.findMany({
        where: { activityId: mg.id, unitPrice: { not: MG_PRICE }, payPeriod: { isClosed: true } },
        select: { id: true, workerId: true, quantity: true, totalEarned: true, payPeriodId: true, payPeriod: { select: { periodNumber: true } } },
      });
      if (bad.length === 0) { console.log("Nada que corregir. (idempotente)"); if (!COMMIT) throw new RollbackSignal(); return; }
      const periodIds = [...new Set(bad.map((b) => b.payPeriodId))];
      if (periodIds.length !== 1) throw new Error(`ABORT: abarca ${periodIds.length} períodos; se esperaba 1.`);
      const periodId = periodIds[0];
      const periodNum = bad[0].payPeriod.periodNumber;

      // Reprice records + accumulate per-worker MG delta.
      const deltaByWorker = new Map<string, number>();
      for (const b of bad) {
        const newTotal = calcTotalEarned(Number(b.quantity), MG_PRICE);
        const add = newTotal - Number(b.totalEarned);
        deltaByWorker.set(b.workerId, r2((deltaByWorker.get(b.workerId) ?? 0) + add));
        await tx.activityRecord.update({ where: { id: b.id }, data: { unitPrice: MG_PRICE, totalEarned: newTotal } });
      }

      // Apply MG delta to each entry's totalEarned + totalToPay; leave séptimo etc.
      let total = 0;
      const lines: string[] = [];
      for (const [workerId, delta] of deltaByWorker) {
        const e = await tx.payrollEntry.findFirst({ where: { payPeriodId: periodId, workerId }, include: { worker: { select: { fullName: true, bankAccount: true } } } });
        if (!e) throw new Error(`ABORT: worker ${workerId} sin entry en #${periodNum}`);
        await tx.payrollEntry.update({
          where: { id: e.id },
          data: { totalEarned: r2(Number(e.totalEarned) + delta), totalToPay: r2(Number(e.totalToPay) + delta) },
        });
        total += delta;
        lines.push(`  ${e.worker.fullName.padEnd(38)} +Q${delta.toFixed(2).padStart(8)}  (${e.worker.bankAccount ?? "SIN CUENTA"})`);
      }

      console.log(`período #${periodNum}: ${bad.length} registros MG repreciados; séptimo intacto.\n`);
      console.log("Back-pay MG por trabajador:");
      lines.sort().forEach((l) => console.log(l));
      console.log(`\nTOTAL back-pay MG: +Q${r2(total)} a ${deltaByWorker.size} trabajador(es)`);

      if (!COMMIT) throw new RollbackSignal();
    }, { timeout: 300_000 });
  } catch (e) {
    if (e instanceof RollbackSignal) console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    else { console.error("\nFAILED (sin cambios):", e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1); }
  }
  await prisma.$disconnect();
})();
