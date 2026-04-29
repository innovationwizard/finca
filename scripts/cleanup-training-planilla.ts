import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

const PERIOD_ID = "e9d4a5ed-9c28-49d6-82a5-6f7d015245d2";
const BATCH_AT = new Date("2026-04-18T01:30:00.000Z");
const STORAGE_BUCKET = "notebook-photos";
const STORAGE_FILES = [
  "planilla/2627/1776475721013.jpg",
  "planilla/2627/1776475721013.csv",
];

async function main() {
  console.log("\n=== Cleanup: training planilla upload (2026-04-18) ===\n");

  // Resolve the actor who performed the training upload (for audit log).
  const actor = await prisma.user.findFirst({
    where: { email: "luis.castellanos@fincadanilandia.com.gt" },
    select: { id: true, email: true },
  });
  if (!actor) throw new Error("Actor user not found");
  console.log(`Actor: ${actor.email} (${actor.id})`);

  const [result, storage] = await Promise.all([
    (async () => {
      return prisma.$transaction(async (tx) => {
        const doomed = await tx.activityRecord.findMany({
          where: { payPeriodId: PERIOD_ID, createdAt: { gte: BATCH_AT } },
          select: { id: true, totalEarned: true },
        });
        const totalEarned = doomed.reduce((s, r) => s + Number(r.totalEarned), 0);

        const del = await tx.activityRecord.deleteMany({
          where: { payPeriodId: PERIOD_ID, createdAt: { gte: BATCH_AT } },
        });

        const audit = await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: "BATCH_DELETE",
            tableName: "activity_records",
            recordId: "training-cleanup-2026-04-18",
            newValues: {
              reason: "Training-session planilla cleanup",
              payPeriodId: PERIOD_ID,
              createdAtGte: BATCH_AT.toISOString(),
              deletedCount: del.count,
              deletedTotalEarned: totalEarned,
              originalBatchAuditId: "0adf5c6f-d4ce-4472-a979-8ca2d3a36b0d",
              storageFiles: STORAGE_FILES,
            },
          },
          select: { id: true },
        });

        return { deletedCount: del.count, totalEarned, auditId: audit.id };
      });
    })(),
    (async () => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(STORAGE_FILES);
      return { data, error };
    })(),
  ]);

  console.log(`\n  DB: deleted ${result.deletedCount} activity_records`);
  console.log(`  DB: freed Q${result.totalEarned.toFixed(2)} of bogus earnings`);
  console.log(`  DB: audit_log id=${result.auditId} (BATCH_DELETE)`);

  if (storage.error) {
    console.log(`\n  STORAGE ERROR: ${storage.error.message}`);
  } else {
    const removed = storage.data?.map((f) => f.name) ?? [];
    console.log(`\n  STORAGE: removed ${removed.length} files from bucket "${STORAGE_BUCKET}"`);
    for (const name of removed) console.log(`    - ${name}`);
  }

  // Post-check
  const [remainingInPeriod, remainingTraining] = await Promise.all([
    prisma.activityRecord.count({ where: { payPeriodId: PERIOD_ID } }),
    prisma.activityRecord.count({
      where: { payPeriodId: PERIOD_ID, createdAt: { gte: BATCH_AT } },
    }),
  ]);
  console.log(`\n  VERIFY: activity_records remaining in period = ${remainingInPeriod}`);
  console.log(`  VERIFY: activity_records remaining from training window = ${remainingTraining}  (expect 0)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
