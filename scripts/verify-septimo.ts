// =============================================================================
// scripts/verify-septimo.ts — READ-ONLY. Exercise computeSeptimoForPeriod
// against the real open + future periods and print a human-reviewable
// breakdown (weeks, required days, holidays, earners). Writes nothing.
//   npx dotenv -e .env.local -- npx tsx scripts/verify-septimo.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { computeSeptimoForPeriod, getSeptimoAmount } from "../src/lib/payroll/septimo";

const prisma = new PrismaClient();
const k = (d: Date) => d.toISOString().slice(0, 10);

(async () => {
  const amount = await getSeptimoAmount();
  console.log(`\n=== séptimo verification — amount Q${amount} ===`);

  const holidays = await prisma.holiday.findMany({ select: { date: true, name: true, recurringAnnual: true } });
  console.log(`holidays on file: ${holidays.length}${holidays.length ? " — " + holidays.map((h) => `${k(h.date)}${h.recurringAnnual ? "(anual)" : ""}`).join(", ") : ""}`);

  // Verify ALL periods read-only (computeSeptimoForPeriod never writes); recalc
  // itself still refuses closed periods at the API layer (going-forward only).
  const periods = await prisma.payPeriod.findMany({
    orderBy: { startDate: "asc" },
    select: { id: true, periodNumber: true, agriculturalYear: true, type: true, startDate: true, endDate: true, isClosed: true },
  });
  console.log(`periods (all): ${periods.length}\n`);

  for (const p of periods) {
    const earned = await computeSeptimoForPeriod(prisma, p.id, amount);
    const recs = await prisma.activityRecord.count({ where: { payPeriodId: p.id } });
    const workersWithActivity = (await prisma.activityRecord.findMany({ where: { payPeriodId: p.id }, select: { workerId: true }, distinct: ["workerId"] })).length;
    let totalSeptimo = 0;
    for (const v of earned.values()) totalSeptimo += v;

    console.log(`── período ${p.agriculturalYear}-#${p.periodNumber} (${p.type}) ${k(p.startDate)}…${k(p.endDate)}`);
    console.log(`   activity records: ${recs} · workers w/ activity: ${workersWithActivity}`);
    console.log(`   séptimo earners: ${earned.size} · total séptimo: Q${Math.round(totalSeptimo * 100) / 100}`);

    if (earned.size) {
      const ids = [...earned.keys()];
      const names = new Map((await prisma.worker.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((w) => [w.id, w.fullName]));
      for (const [id, v] of earned) console.log(`     • ${names.get(id) ?? id}: Q${v} (${Math.round(v / amount)} sem.)`);
    }
  }

  await prisma.$disconnect();
})().catch(async (e) => { console.error("FAILED:", e); await prisma.$disconnect(); process.exit(1); });
