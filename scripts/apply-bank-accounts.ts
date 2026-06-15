// =============================================================================
// scripts/apply-bank-accounts.ts — Assign BANRURAL accounts to 25 workers,
// HUMAN-CONFIRMED row by row from Copia_de_PLANILLA.csv (2026-06-15).
//
// Writes by worker ID (resolved + confirmed during analysis), NOT by name. Each
// row carries the expected name; the script re-fetches the worker and ABORTS the
// whole transaction if the stored name doesn't match — so a mistyped id can
// never write an account onto the wrong person. Also asserts: all accounts are
// distinct, and warns if a worker already has an account. Dry-run by default.
//   npx dotenv -e .env.local -- npx tsx scripts/apply-bank-accounts.ts [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");
const BANK = "BANRURAL";

// id → { name (as stored in DB, for the safety assert), account (verbatim) }
const MAP: { id: string; name: string; account: string }[] = [
  // 22 exact-name matches
  { id: "019ebe2b-9994-7881-b417-2149e7414a68", name: "AXEL AMILDO ALVAREZ MORALES", account: "4029152135" },
  { id: "019ebe2b-abfc-7ee2-92d9-5440ed13042e", name: "BALDOMERO SOLANO MARROQUIN", account: "4029163700" },
  { id: "019ebe2b-8f56-7553-a211-3226920e3998", name: "CINDY ROXANA ALVAREZ LOPEZ", account: "4029166385" },
  { id: "019ebe2b-9da9-7f01-83ca-3d8ecf8c59ce", name: "DIXON RENE HERNANDEZ MARTINEZ", account: "4029157433" },
  { id: "019ebe2b-8d4c-72d1-ad63-f7657cd33dcf", name: "EDGAR ROLANDO NAVAS CHACON", account: "4029152117" },
  { id: "019ebe2b-957b-7db0-8c76-e0b111a7bb51", name: "ERICA YANIRA ALVAREZ LOPEZ", account: "4029166371" },
  { id: "019ebe2b-9387-7de0-9f2b-af3efe49e834", name: "ERICK RONALDO HERNANDEZ MARTINEZ", account: "4029166399" },
  { id: "019ebe2b-bf9c-72b0-bca1-ada2536e044e", name: "FRANCISCO ALEXANDER NAVAS JUAREZ", account: "3029028689" },
  { id: "019ebe2b-b642-70c1-b6c1-d09a91991af6", name: "GABY MAIDELY ALVAREZ JIMENEZ", account: "4029165827" },
  { id: "019ebe2b-a9f6-7eb0-bcb0-f2c70b832911", name: "JORGE LUIS MARROQUIN SALAZAR", account: "4029159358" },
  { id: "019ebe2b-9fbb-77e3-b4b1-23182dffdd40", name: "JOSE ALEXANDER NAVAS MARTINEZ", account: "4029152167" },
  { id: "019ebe2b-7cee-7922-8f2e-294f74545c57", name: "JULIA YANIRA MARROQUIN", account: "4029152153" },
  { id: "019ebe2b-78e4-7f12-963c-afa222563388", name: "MARCO ANTONIO SOLANO", account: "4029152218" },
  { id: "019ebe2b-810a-74d1-9837-e34ed4f5ee56", name: "MARIA FLORIDALMA ALVAREZ MORALES", account: "4029151948" },
  { id: "019ebe2b-ba58-7841-827e-f63e23062d34", name: "MARIA MARLENI MARROQUIN SALAZAR", account: "4029161922" },
  { id: "019ebe2b-b430-7251-bfe7-4f83d1740c0f", name: "OLIVER GERARDO AGUILAR SANCHEZ", account: "4029157516" },
  { id: "019ebe2b-b228-7572-b332-b2a794078070", name: "RUTH NOHEMI ALVAREZ JIMENEZ", account: "4029165845" },
  { id: "019ebe2b-c7c9-7523-9fce-c0afee6cc5bd", name: "SULEYMA ARELI GUAMUSH MARROQUIN", account: "3029026017" },
  { id: "019ebe2b-a7e7-7b63-8251-136e0f947aba", name: "TELMA ELIZABETH HERNANDEZ MARTINEZ", account: "4396067306" },
  { id: "019ebe2b-a1c5-76c1-b362-b6eb1472f89f", name: "WILFRIDO HERNANDEZ RALIOS", account: "4015403844" },
  { id: "019ebe2b-c3b0-7ec3-a4b9-40cbd81deccf", name: "WILSON ORLANDO GARCIA MENDEZ", account: "3029029349" },
  { id: "019ebe2b-a3d3-71e1-b927-a82f4e70cd80", name: "YARITZA AMARILIS NAVAS SANCHEZ", account: "4029165592" },
  // 3 fuzzy matches, explicitly confirmed with Jorge
  { id: "019ebe2b-bc63-7900-ab26-67f7d3975750", name: "ELDER EDUARDO HERNANDEZ NAVAS", account: "3029028657" },
  { id: "019ebe2b-b849-7023-83cb-8a92b9a91ae6", name: "MARTA ROSMERY HERNANDEZ PEREZ DE SOLANO", account: "4029159110" },
  { id: "019ebedd-2291-7a83-bdd2-cfbf185e595f", name: "JONATAN ARNOLDO AGUILAR SANCHEZ", account: "4029161954" },
];

(async () => {
  console.log(`\n=== assign ${MAP.length} BANRURAL accounts — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  // Pre-flight: all accounts distinct.
  const accts = new Set<string>();
  for (const m of MAP) {
    if (accts.has(m.account)) throw new Error(`Cuenta duplicada en el mapeo: ${m.account}`);
    accts.add(m.account);
  }
  if (MAP.length !== 25) throw new Error(`Se esperaban 25 filas, hay ${MAP.length}`);

  try {
    await prisma.$transaction(async (tx) => {
      let updated = 0;
      for (const m of MAP) {
        const w = await tx.worker.findUnique({ where: { id: m.id }, select: { fullName: true, bankAccount: true } });
        if (!w) throw new Error(`ABORT: no existe worker id=${m.id} (${m.name})`);
        if (w.fullName !== m.name) {
          throw new Error(`ABORT: nombre no coincide para id=${m.id}. BD="${w.fullName}" esperado="${m.name}". No se escribe nada.`);
        }
        const warn = w.bankAccount ? `  ⚠ YA TENÍA ${w.bankAccount} → ${m.account}` : "";
        await tx.worker.update({ where: { id: m.id }, data: { bankAccount: m.account, bankName: BANK } });
        updated++;
        console.log(`OK  ${m.name}  →  ${BANK} ${m.account}${warn}`);
      }
      console.log(`\nactualizados: ${updated}/${MAP.length}`);
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
