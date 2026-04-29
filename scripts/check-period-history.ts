import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const periodId = "e9d4a5ed-9c28-49d6-82a5-6f7d015245d2";
  const batchAt = new Date("2026-04-18T01:30:00.000Z");

  const period = await prisma.payPeriod.findUnique({
    where: { id: periodId },
    include: {
      _count: { select: { activityRecords: true, payrollEntries: true } },
    },
  });

  console.log("\n=== Period 2627 / SEMANAL #6 ===");
  console.log(`  id=${periodId}`);
  console.log(`  startDate=${period?.startDate.toISOString().slice(0, 10)}  endDate=${period?.endDate.toISOString().slice(0, 10)}`);
  console.log(`  createdAt=${period?.createdAt.toISOString()}`);
  console.log(`  isClosed=${period?.isClosed}`);
  console.log(`  total activity_records=${period?._count.activityRecords}`);
  console.log(`  total payroll_entries=${period?._count.payrollEntries}`);

  const preTraining = await prisma.activityRecord.count({
    where: { payPeriodId: periodId, createdAt: { lt: batchAt } },
  });
  const fromTraining = await prisma.activityRecord.count({
    where: { payPeriodId: periodId, createdAt: { gte: batchAt } },
  });

  console.log(`\n  rows createdAt < ${batchAt.toISOString()}  (pre-training): ${preTraining}`);
  console.log(`  rows createdAt >= ${batchAt.toISOString()} (training):     ${fromTraining}`);

  const otherPeriods = await prisma.payPeriod.findMany({
    where: { agriculturalYear: "2627" },
    orderBy: [{ type: "asc" }, { periodNumber: "asc" }],
    select: {
      id: true,
      type: true,
      periodNumber: true,
      startDate: true,
      endDate: true,
      isClosed: true,
      _count: { select: { activityRecords: true } },
    },
  });

  console.log(`\n=== All periods in year 2627 (${otherPeriods.length}) ===`);
  for (const p of otherPeriods) {
    const flag = p.id === periodId ? "  <-- TARGET" : "";
    console.log(
      `  ${p.type}#${p.periodNumber}  ${p.startDate.toISOString().slice(0, 10)} — ${p.endDate.toISOString().slice(0, 10)}  closed=${p.isClosed}  records=${p._count.activityRecords}${flag}`,
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
