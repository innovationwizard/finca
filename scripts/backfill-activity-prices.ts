// =============================================================================
// scripts/backfill-activity-prices.ts
//
// Seeds one baseline price vigencia per activity from its current defaultPrice,
// anchored at the start of the current agricultural year. Idempotent: skips any
// activity that already has a vigencia at that date. No amounts change on day one
// (dates before the anchor fall back to defaultPrice, the same number).
//
// MUST run AFTER the migration `add_activity_prices` is applied.
//
// Run:
//   npx dotenv -e .env.local -- npx tsx scripts/backfill-activity-prices.ts
//   npx dotenv -e .env.local -- npx tsx scripts/backfill-activity-prices.ts --commit
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { getAgriculturalYearStart, getCurrentAgriculturalYear } from "../src/lib/utils/agricultural-year";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

async function main() {
  const anchor = getAgriculturalYearStart(getCurrentAgriculturalYear()); // e.g. 2026-03-01
  const anchorISO = anchor.toISOString().split("T")[0];
  console.log(`\nBackfill activity prices — anchor ${anchorISO} — ${COMMIT ? "COMMIT" : "DRY RUN"}\n`);

  const activities = await prisma.activity.findMany({
    select: { id: true, name: true, defaultPrice: true, prices: { select: { effectiveFrom: true } } },
    orderBy: { sortOrder: "asc" },
  });

  let toCreate = 0;
  let skipped = 0;
  for (const a of activities) {
    const hasAny = a.prices.length > 0;
    const price = a.defaultPrice != null ? Number(a.defaultPrice) : 0;
    if (hasAny) {
      skipped++;
      continue;
    }
    toCreate++;
    console.log(`  + ${a.name.padEnd(30)} Q${price}  @ ${anchorISO}`);
    if (COMMIT) {
      await prisma.activityPrice.create({
        data: { activityId: a.id, price, effectiveFrom: anchor, note: "Backfill base" },
      });
    }
  }

  console.log(`\n  Actividades: ${activities.length} · con precios ya: ${skipped} · a crear: ${toCreate}`);
  if (!COMMIT) console.log("\nDry run — re-run with --commit to write.\n");
  else console.log("\n✓ Backfill aplicado.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
