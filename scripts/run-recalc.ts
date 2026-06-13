// =============================================================================
// scripts/run-recalc.ts — Run recomputePayroll for one period (incl. séptimo).
// Dry-run by default (transaction + rollback, prints the resulting entries);
// --commit persists. Select the period by start date (content, not position).
//   npx dotenv -e .env.local -- npx tsx scripts/run-recalc.ts --start 2026-04-13 [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { recomputePayroll } from "../src/lib/payroll/recalc";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const startArg = argv[argv.indexOf("--start") + 1];
const k = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;

(async () => {
  if (!startArg || startArg.startsWith("--")) { console.error("--start <YYYY-MM-DD> required"); process.exit(1); }
  const period = await prisma.payPeriod.findFirst({ where: { startDate: new Date(`${startArg}T00:00:00.000Z`) } });
  if (!period) { console.error(`no period with startDate ${startArg}`); process.exit(1); }
  if (period.isClosed) { console.error(`period #${period.periodNumber} is CLOSED — recalc refuses closed periods`); process.exit(1); }
  console.log(`\n=== recalc #${period.periodNumber} (${period.agriculturalYear}) ${k(period.startDate)}…${k(period.endDate)} — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  try {
    await prisma.$transaction(async (tx) => {
      const summary = await recomputePayroll(tx, period.id);
      const entries = await tx.payrollEntry.findMany({ where: { payPeriodId: period.id } });
      const sums = entries.reduce((a, e) => ({
        earned: a.earned + Number(e.totalEarned),
        septimo: a.septimo + Number(e.seventhDayPay),
        toPay: a.toPay + Number(e.totalToPay),
      }), { earned: 0, septimo: 0, toPay: 0 });
      const withSeptimo = entries.filter((e) => Number(e.seventhDayPay) > 0).length;

      console.log(`summary: ${JSON.stringify(summary)}`);
      console.log(`entries: ${entries.length} · with séptimo: ${withSeptimo}`);
      console.log(`Σ totalEarned   : Q${r2(sums.earned)}`);
      console.log(`Σ seventhDayPay : Q${r2(sums.septimo)}`);
      console.log(`Σ totalToPay    : Q${r2(sums.toPay)}`);
      if (!COMMIT) throw new RollbackSignal();
    }, { timeout: 300_000 });
  } catch (e) {
    if (e instanceof RollbackSignal) { console.log("\nDRY-RUN complete — rolled back. Re-run with --commit."); }
    else { console.error("\nRECALC FAILED:", e); await prisma.$disconnect(); process.exit(1); }
  }
  await prisma.$disconnect();
})();
