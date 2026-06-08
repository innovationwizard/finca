// =============================================================================
// scripts/seed-poda-activity.ts
//
// Creates the "Poda" activity. The .xlsx planilla writes "Poda" (Q110 / Manzana),
// but the active catalog only had "Repaso Poda" — so "Poda" went unresolved.
// Unit/price are taken from the source data (Q110/Manzana) and the original seed
// (Poda: MANZANA, 110), not assumed.
//
// Idempotent: if an activity named "Poda" already exists it reactivates/leaves it
// and exits. Dry-run by default; pass --commit to write.
//
// Run:
//   npx dotenv -e .env.local -- npx tsx scripts/seed-poda-activity.ts
//   npx dotenv -e .env.local -- npx tsx scripts/seed-poda-activity.ts --commit
// =============================================================================

import { PrismaClient, ActivityUnit } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

const ACTIVITY = {
  name: "Poda",
  unit: ActivityUnit.MANZANA,
  defaultPrice: 110,
  isHarvest: false,
  isBeneficio: false,
} as const;

async function main() {
  console.log(`\nSeed "Poda" activity — ${COMMIT ? "COMMIT" : "DRY RUN"}\n`);

  const existing = await prisma.activity.findUnique({ where: { name: ACTIVITY.name } });
  if (existing) {
    console.log(`Already exists: "${existing.name}" (${existing.unit}, Q${existing.defaultPrice ?? "—"}, active=${existing.isActive}).`);
    if (!existing.isActive) {
      console.log(COMMIT ? "Reactivating…" : "(dry-run: would reactivate)");
      if (COMMIT) await prisma.activity.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return;
  }

  const maxSort = await prisma.activity.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

  console.log(`Would create: ${ACTIVITY.name} · ${ACTIVITY.unit} · Q${ACTIVITY.defaultPrice} · sortOrder ${sortOrder}`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to write.\n");
    return;
  }

  const created = await prisma.activity.create({ data: { ...ACTIVITY, sortOrder, isActive: true } });
  console.log(`\n✓ Created "${created.name}" (${created.id}).\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
