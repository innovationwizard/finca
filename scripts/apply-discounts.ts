// =============================================================================
// scripts/apply-discounts.ts — Apply HUMAN-CONFIRMED discounts to PayrollEntry
// .deductions for the open period (#8), from Descuentos_PLANILLA.csv (2026-06-15).
//
// Writes by worker ID (resolved + confirmed in analysis), NOT by name. Per row:
//   • re-fetch worker → ABORT whole tx if stored name ≠ expected (no wrong-person)
//   • require a PayrollEntry in #8 → ABORT if missing
//   • idempotent: skip if deductions already == amount; ABORT if a DIFFERENT
//     non-zero deduction already exists (never silently overwrite a manual value)
//   • set deductions and recompute totalToPay via calcNetPay
// Dry-run by default, --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/apply-discounts.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { calcNetPay } from "../src/lib/utils/calculations";

const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");
const r2 = (x: number) => Math.round(x * 100) / 100;

// id → { name (as stored in DB), amount (confirmed discount) }
const MAP: { id: string; name: string; amount: number }[] = [
  { id: "019ebe2b-8b3a-7811-b3a6-64f37cca47a7", name: "ADISTER ARCENIO MARROQUIN", amount: 40 },
  { id: "019ebe2b-9994-7881-b417-2149e7414a68", name: "AXEL AMILDO ALVAREZ MORALES", amount: 40 },
  { id: "019ebe2b-7ef7-76e3-bb52-9ba10b348e84", name: "CARLOS ALBINO GARCIA MENDEZ", amount: 40 },
  { id: "019ebe2b-916d-7a90-9ead-9b2f8c257a8d", name: "CARMELO MARROQUIN SALAZAR", amount: 40 },
  { id: "019ebe2b-9da9-7f01-83ca-3d8ecf8c59ce", name: "DIXON RENE HERNANDEZ MARTINEZ", amount: 40 },
  { id: "019ebe2b-bc63-7900-ab26-67f7d3975750", name: "ELDER EDUARDO HERNANDEZ NAVAS", amount: 40 },
  { id: "019ebe2b-957b-7db0-8c76-e0b111a7bb51", name: "ERICA YANIRA ALVAREZ LOPEZ", amount: 500 },
  { id: "019ebe2b-9387-7de0-9f2b-af3efe49e834", name: "ERICK RONALDO HERNANDEZ MARTINEZ", amount: 500 },
  { id: "019ebe2b-bf9c-72b0-bca1-ada2536e044e", name: "FRANCISCO ALEXANDER NAVAS JUAREZ", amount: 40 },
  { id: "019ebe2b-8728-72b3-b4d4-90b06893f079", name: "GERMAN NOLBERTO SOLANO MARROQUIN", amount: 40 },
  { id: "019ebe2b-8939-7d02-a35d-ef10bfcd964d", name: "JAIME ANIBAL MARROQUIN SALAZAR", amount: 40 },
  { id: "019ebe2b-a9f6-7eb0-bcb0-f2c70b832911", name: "JORGE LUIS MARROQUIN SALAZAR", amount: 40 },
  { id: "019ebe2b-b015-7ea2-a1fa-102c597f6aea", name: "JORGE ODILIO SOLANO MARROQUIN", amount: 40 },
  { id: "019ebe2b-9fbb-77e3-b4b1-23182dffdd40", name: "JOSE ALEXANDER NAVAS MARTINEZ", amount: 40 },
  { id: "019ebe2b-b430-7251-bfe7-4f83d1740c0f", name: "OLIVER GERARDO AGUILAR SANCHEZ", amount: 40 },
  { id: "019ebe2b-c3b0-7ec3-a4b9-40cbd81deccf", name: "WILSON ORLANDO GARCIA MENDEZ", amount: 40 },
];

(async () => {
  const expectSum = 1560;
  const sum = MAP.reduce((s, m) => s + m.amount, 0);
  if (MAP.length !== 16) throw new Error(`Se esperaban 16 filas, hay ${MAP.length}`);
  if (sum !== expectSum) throw new Error(`Σ esperado Q${expectSum}, calculado Q${sum}`);

  const open = await prisma.payPeriod.findMany({ where: { isClosed: false }, select: { id: true, periodNumber: true } });
  if (open.length !== 1) throw new Error(`Se esperaba 1 período abierto, hay ${open.length}`);
  const period = open[0];
  console.log(`\n=== aplicar ${MAP.length} descuentos (Σ Q${sum}) a período #${period.periodNumber} — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  try {
    await prisma.$transaction(async (tx) => {
      let applied = 0, skipped = 0;
      for (const m of MAP) {
        const w = await tx.worker.findUnique({ where: { id: m.id }, select: { fullName: true } });
        if (!w) throw new Error(`ABORT: no existe worker id=${m.id} (${m.name})`);
        if (w.fullName !== m.name) throw new Error(`ABORT: nombre no coincide id=${m.id}. BD="${w.fullName}" esperado="${m.name}".`);

        const e = await tx.payrollEntry.findFirst({ where: { payPeriodId: period.id, workerId: m.id } });
        if (!e) throw new Error(`ABORT: ${m.name} no tiene entry en período #${period.periodNumber}`);

        const cur = Number(e.deductions);
        if (cur === m.amount) { console.log(`SKIP ${m.name} — ya tiene deduc Q${cur.toFixed(2)}`); skipped++; continue; }
        if (cur !== 0) throw new Error(`ABORT: ${m.name} ya tiene una deducción distinta (Q${cur.toFixed(2)}); no se sobrescribe.`);

        const newTotal = calcNetPay(Number(e.totalEarned), Number(e.bonification), Number(e.seventhDayPay), Number(e.advances), m.amount);
        await tx.payrollEntry.update({ where: { id: e.id }, data: { deductions: m.amount, totalToPay: newTotal } });
        console.log(`OK   ${m.name}  −Q${m.amount.toFixed(2)}  aPagar Q${Number(e.totalToPay).toFixed(2)} → Q${newTotal.toFixed(2)}`);
        applied++;
      }
      console.log(`\naplicados: ${applied} · sin cambio: ${skipped} · Σ deducido: Q${r2(sum)}`);
      if (!COMMIT) throw new (class extends Error {})();
    }, { timeout: 120_000 });
  } catch (e) {
    if (e instanceof Error && e.message === "") {
      console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    } else {
      console.error("\nFAILED (sin cambios):", e instanceof Error ? e.message : e);
      await prisma.$disconnect();
      process.exit(1);
    }
  }
  await prisma.$disconnect();
})();
