import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const since = new Date(Date.now() - 120 * 60 * 1000);
  console.log(`\n=== Window: activity since ${since.toISOString()} (last 120 min) ===\n`);

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      tableName: "activity_records",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { email: true, name: true } } },
  });

  console.log(`--- audit_logs (activity_records) : ${auditLogs.length} entries ---`);
  for (const log of auditLogs) {
    console.log(
      `  [${log.createdAt.toISOString()}] action=${log.action} user=${log.user?.email ?? log.userId} recordId=${log.recordId}`,
    );
    if (log.newValues) console.log(`     newValues=${JSON.stringify(log.newValues)}`);
  }

  const records = await prisma.activityRecord.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    include: {
      worker: { select: { fullName: true } },
      activity: { select: { name: true } },
      payPeriod: { select: { id: true, periodNumber: true, agriculturalYear: true, type: true, startDate: true, endDate: true } },
    },
  });

  console.log(`\n--- activity_records created in window : ${records.length} rows ---`);

  const byPeriod = new Map<string, typeof records>();
  for (const r of records) {
    const key = r.payPeriodId;
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key)!.push(r);
  }

  for (const [periodId, rows] of byPeriod) {
    const p = rows[0].payPeriod;
    const total = rows.reduce((s, r) => s + Number(r.totalEarned), 0);
    const firstAt = rows[0].createdAt.toISOString();
    const lastAt = rows[rows.length - 1].createdAt.toISOString();
    console.log(
      `\n  Period ${p.agriculturalYear}/${p.type}#${p.periodNumber} (${p.startDate.toISOString().slice(0,10)} — ${p.endDate.toISOString().slice(0,10)})`,
    );
    console.log(`    payPeriodId=${periodId}`);
    console.log(`    rows=${rows.length}  totalEarned=Q${total.toFixed(2)}`);
    console.log(`    first createdAt=${firstAt}`);
    console.log(`    last  createdAt=${lastAt}`);
    const workers = new Set(rows.map((r) => r.worker.fullName));
    const acts = new Set(rows.map((r) => r.activity.name));
    console.log(`    workers=${workers.size} (${[...workers].slice(0, 6).join(", ")}${workers.size > 6 ? ", ..." : ""})`);
    console.log(`    activities=${[...acts].join(", ")}`);
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
