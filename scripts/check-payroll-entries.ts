import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const periodId = "e9d4a5ed-9c28-49d6-82a5-6f7d015245d2";
  const batchAt = new Date("2026-04-18T01:30:00.000Z");

  const entries = await prisma.payrollEntry.findMany({
    where: { payPeriodId: periodId },
    orderBy: { createdAt: "asc" },
    include: { worker: { select: { fullName: true } } },
  });

  console.log(`\n=== payroll_entries in period 2627 / SEMANAL #6 (${entries.length}) ===\n`);

  const before = entries.filter((e) => e.createdAt < batchAt);
  const after = entries.filter((e) => e.createdAt >= batchAt);

  console.log(`  created BEFORE training (${batchAt.toISOString()}): ${before.length}`);
  console.log(`  created AFTER  training:                             ${after.length}`);

  if (entries.length > 0) {
    console.log(`\n  earliest createdAt: ${entries[0].createdAt.toISOString()}`);
    console.log(`  latest   createdAt: ${entries[entries.length - 1].createdAt.toISOString()}`);
    console.log(`  earliest updatedAt: ${entries.reduce((m, e) => (e.updatedAt < m ? e.updatedAt : m), entries[0].updatedAt).toISOString()}`);
    console.log(`  latest   updatedAt: ${entries.reduce((m, e) => (e.updatedAt > m ? e.updatedAt : m), entries[0].updatedAt).toISOString()}`);
  }

  const paidCount = entries.filter((e) => e.isPaid).length;
  const totalToPay = entries.reduce((s, e) => s + Number(e.totalToPay), 0);
  const totalEarned = entries.reduce((s, e) => s + Number(e.totalEarned), 0);

  console.log(`\n  isPaid=true:       ${paidCount}`);
  console.log(`  sum(totalEarned):  Q${totalEarned.toFixed(2)}`);
  console.log(`  sum(totalToPay):   Q${totalToPay.toFixed(2)}`);

  console.log(`\n  sample entries:`);
  for (const e of entries.slice(0, 6)) {
    console.log(
      `    [${e.createdAt.toISOString()}]  ${e.worker.fullName.padEnd(30)}  earned=Q${Number(e.totalEarned).toFixed(2)}  toPay=Q${Number(e.totalToPay).toFixed(2)}  paid=${e.isPaid}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
