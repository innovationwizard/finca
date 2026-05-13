// =============================================================================
// One-shot: map handwritten "arixa" and "arica" to Yaritza in the dictionary.
// Run: npx tsx scripts/seed-arixa-yaritza.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const worker = await prisma.worker.findFirst({
    where: { fullName: { contains: "Yaritza", mode: "insensitive" }, isActive: true },
    select: { id: true, fullName: true },
  });

  if (!worker) {
    console.error("No active worker found with 'Yaritza' in their name. Check spelling.");
    process.exit(1);
  }

  console.log(`Found: ${worker.fullName} (${worker.id})`);

  const handwrittenVariants = ["arixa", "arica", "yaritza"];

  for (const hw of handwrittenVariants) {
    await prisma.notebookDictionary.upsert({
      where: { category_handwritten: { category: "worker", handwritten: hw } },
      update: { canonical: worker.fullName, referenceId: worker.id },
      create: { category: "worker", handwritten: hw, canonical: worker.fullName, referenceId: worker.id },
    });
    console.log(`  ✓  "${hw}" → "${worker.fullName}"`);
  }

  console.log("Done. Re-upload the April photo to recover her rows.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
