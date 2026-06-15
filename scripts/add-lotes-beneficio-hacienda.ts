// =============================================================================
// scripts/add-lotes-beneficio-hacienda.ts — Add two cost-center "lotes" where
// activities are recorded frequently but which are NOT coffee plots: "Beneficio"
// and "Hacienda". Plot fields (área, plantas, altitud, variedad) stay null on
// purpose — they don't apply to a processing/estate center.
//
// Idempotent: matches existing rows by slug, skips any that already exist, never
// overwrites. Dry-run by default (transaction + rollback, prints what it would
// do); --commit persists. Mirrors scripts/run-recalc.ts safety pattern.
//   npx dotenv -e .env.local -- npx tsx scripts/add-lotes-beneficio-hacienda.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");

// Identity by content (name + slug), not position. Add new centers here.
const LOTES = [
  { name: "Beneficio", slug: "beneficio" },
  { name: "Hacienda", slug: "hacienda" },
];

(async () => {
  console.log(
    `\n=== add lotes: ${LOTES.map((l) => l.name).join(", ")} — ${
      COMMIT ? "COMMIT" : "DRY-RUN (rollback)"
    } ===\n`,
  );

  try {
    await prisma.$transaction(async (tx) => {
      // Append after existing lotes, preserving their order.
      const maxOrder = await tx.lote.aggregate({ _max: { sortOrder: true } });
      let nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

      for (const l of LOTES) {
        const existing = await tx.lote.findFirst({
          where: { OR: [{ slug: l.slug }, { name: l.name }] },
          select: { id: true, name: true, slug: true },
        });
        if (existing) {
          console.log(
            `SKIP  ${l.name} — already exists (name="${existing.name}", slug="${existing.slug}")`,
          );
          continue;
        }
        const created = await tx.lote.create({
          data: { name: l.name, slug: l.slug, sortOrder: nextOrder },
          select: { id: true, name: true, slug: true, sortOrder: true },
        });
        nextOrder++;
        console.log(
          `CREATE ${created.name} — id=${created.id} slug="${created.slug}" sortOrder=${created.sortOrder}`,
        );
      }

      if (!COMMIT) throw new RollbackSignal();
    });
  } catch (e) {
    if (e instanceof RollbackSignal) {
      console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    } else {
      console.error("\nFAILED:", e);
      await prisma.$disconnect();
      process.exit(1);
    }
  }
  await prisma.$disconnect();
})();
