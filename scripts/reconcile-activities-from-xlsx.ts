// =============================================================================
// scripts/reconcile-activities-from-xlsx.ts
//
// Reconciles the app's activity catalog with the farm's source-of-truth
// ACTIVIDADES sheet (format/PLANILLAFINCA.xlsx): assigns the farm CODE to each
// activity, aligns prices (as effective-dated vigencias — NOT retroactive), and
// creates the activities the farm uses that the app lacks.
//
// The mapping below is EXPLICIT (grounded in the reviewed diff), not guessed:
//   - RP = "Repaso Sombra" (NEW) — the farm's RP is Repaso SOMBRA, distinct from
//     the app's existing "Repaso Poda".
//   - FE → existing "Fertilización 1.5 oz" (price Q17.5 matches exactly).
//   - BN → alias of Beneficio (dictionary), since BE already carries the code.
//
// Idempotent. Dry-run by default; --commit writes. MUST run after the migration
// add_activity_code is applied.
//
// Run:
//   npx dotenv -e .env.local -- npx tsx scripts/reconcile-activities-from-xlsx.ts
//   npx dotenv -e .env.local -- npx tsx scripts/reconcile-activities-from-xlsx.ts --commit
// =============================================================================

import { PrismaClient, ActivityUnit } from "@prisma/client";
import { learnCorrection } from "../src/lib/ai/notebook-dictionary";
import { todayISOGuatemala } from "../src/lib/pricing/activity-prices";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

type PlanRow =
  | { code: string; appName: string; price: number }                 // match existing → set code + align price
  | { code: string; create: { name: string; unit: ActivityUnit; price: number } } // create new
  | { code: string; aliasOf: string };                               // dictionary alias only

const PLAN: PlanRow[] = [
  { code: "CP", appName: "Caporal", price: 100 },
  { code: "BE", appName: "Beneficio", price: 75 },
  { code: "BN", aliasOf: "Beneficio" },
  { code: "CA", appName: "Trabajos varios Carbón", price: 75 },
  { code: "FE", appName: "Fertilización 1.5 oz", price: 17.5 },
  { code: "FERIADO", appName: "FERIADO", price: 75 },
  { code: "FG", appName: "Aplicación de Fungicida", price: 75 },
  { code: "LL", appName: "Limpia lote", price: 75 },
  { code: "MG", appName: "Mantenimiento General", price: 75 },
  { code: "MS", appName: "Manejo de Sombra", price: 75 },
  { code: "AH", appName: "Ahoyado", price: 1.5 },
  { code: "HERIDO", appName: "HERIDO", price: 0 },
  { code: "TZ", appName: "Trazado para siembra", price: 75 },
  { code: "HA", create: { name: "Hacienda", unit: ActivityUnit.DIA, price: 65 } },
  { code: "SP", create: { name: "Septimo", unit: ActivityUnit.DIA, price: 75 } },
  { code: "RP", create: { name: "Repaso Sombra", unit: ActivityUnit.DIA, price: 75 } },
  { code: "DESCONOCIDA", create: { name: "Desconocida", unit: ActivityUnit.DIA, price: 0 } },
];

async function setCode(id: string, code: string) {
  if (!COMMIT) return; // dry-run: avoid touching the `code` column (migration may not be applied yet)
  const clash = await prisma.activity.findUnique({ where: { code } });
  if (clash && clash.id !== id) {
    console.log(`   ⚠ code ${code} already on "${clash.name}" — skipping code set`);
    return;
  }
  await prisma.activity.update({ where: { id }, data: { code } });
}

async function alignPrice(id: string, name: string, target: number, today: Date) {
  const a = await prisma.activity.findUnique({ where: { id }, select: { defaultPrice: true } });
  const cur = a?.defaultPrice != null ? Number(a.defaultPrice) : null;
  if (cur === target) return;
  console.log(`   precio "${name}": ${cur ?? "—"} → ${target} (vigencia ${today.toISOString().split("T")[0]})`);
  if (COMMIT) {
    await prisma.activityPrice.upsert({
      where: { activityId_effectiveFrom: { activityId: id, effectiveFrom: today } },
      create: { activityId: id, price: target, effectiveFrom: today, note: "Reconciliación ACTIVIDADES" },
      update: { price: target },
    });
    await prisma.activity.update({ where: { id }, data: { defaultPrice: target } });
  }
}

async function main() {
  console.log(`\nReconcile activities ← ACTIVIDADES — ${COMMIT ? "COMMIT" : "DRY RUN"}\n`);
  const today = new Date(todayISOGuatemala());

  for (const row of PLAN) {
    if ("aliasOf" in row) {
      console.log(`alias ${row.code} → "${row.aliasOf}"`);
      if (COMMIT) {
        const target = await prisma.activity.findUnique({ where: { name: row.aliasOf }, select: { id: true } });
        if (target) await learnCorrection("activity", row.code, row.aliasOf, target.id);
      }
      continue;
    }
    if ("create" in row) {
      const existing = await prisma.activity.findUnique({ where: { name: row.create.name } });
      if (existing) {
        console.log(`exists "${row.create.name}" — set code ${row.code}, align price`);
        await setCode(existing.id, row.code);
        await alignPrice(existing.id, row.create.name, row.create.price, today);
      } else {
        console.log(`CREATE "${row.create.name}" (${row.create.unit}, Q${row.create.price}, code ${row.code})`);
        if (COMMIT) {
          const maxSort = await prisma.activity.aggregate({ _max: { sortOrder: true } });
          const a = await prisma.activity.create({
            data: { name: row.create.name, code: row.code, unit: row.create.unit, defaultPrice: row.create.price, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
          });
          await prisma.activityPrice.create({ data: { activityId: a.id, price: row.create.price, effectiveFrom: today, note: "Reconciliación ACTIVIDADES" } });
        }
      }
      continue;
    }
    // match existing by exact name
    const a = await prisma.activity.findUnique({ where: { name: row.appName } });
    if (!a) { console.log(`❌ "${row.appName}" no existe en la app (code ${row.code}) — revisar`); continue; }
    console.log(`map ${row.code} → "${row.appName}"`);
    await setCode(a.id, row.code);
    await alignPrice(a.id, row.appName, row.price, today);
  }

  console.log(COMMIT ? "\n✓ Reconciliación aplicada.\n" : "\nDry run — re-run con --commit para escribir.\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
