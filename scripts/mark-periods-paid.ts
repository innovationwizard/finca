// =============================================================================
// scripts/mark-periods-paid.ts — Mark closed periods #7 and #8 as PAID so the
// app reflects reality (both were fully disbursed: #8 via the bank run, #7 incl.
// the +Q2,925 MG back-pay settled in the weekly review). Sets isPaid=true +
// paidAt on entries not already flagged. This also activates the /pagos export
// guard (paid entries are excluded → no accidental double-pay).
//
// paidAt is stamped "now" as the recorded-paid timestamp (actual disbursement
// was earlier). Idempotent: skips already-paid entries. Dry-run by default.
//   npx dotenv -e .env.local -- npx tsx scripts/mark-periods-paid.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");
const PERIODS = [7, 8];

(async () => {
  console.log(`\n=== mark periods ${PERIODS.join(", ")} as paid — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const n of PERIODS) {
        const per = await tx.payPeriod.findFirst({ where: { periodNumber: n }, select: { id: true, isClosed: true } });
        if (!per) { console.log(`SKIP #${n} — no existe`); continue; }
        const total = await tx.payrollEntry.count({ where: { payPeriodId: per.id } });
        const res = await tx.payrollEntry.updateMany({
          where: { payPeriodId: per.id, isPaid: false },
          data: { isPaid: true, paidAt: now },
        });
        console.log(`#${n} (cerrado=${per.isClosed}): ${res.count} marcados pagados ahora; ${total - res.count} ya estaban; total ${total}`);
      }
      if (!COMMIT) throw new RollbackSignal();
    });
  } catch (e) {
    if (e instanceof RollbackSignal) console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    else { console.error("\nFAILED (sin cambios):", e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1); }
  }
  await prisma.$disconnect();
})();
