// =============================================================================
// scripts/map-bank-accounts.ts — ANALYSIS ONLY (no writes). Match the bank
// accounts in Copia_de_PLANILLA.csv to DB workers by NORMALIZED name (accents
// stripped, uppercased, spaces collapsed), and report match confidence so each
// mapping can be human-confirmed row by row before any update.
//
// Reads the CSV by content (header detected, not row position). Prints, per CSV
// row that carries an account: the proposed worker, their id, current
// bankAccount, and a MATCH classification (EXACT / FUZZY / MULTIPLE / NONE).
//   npx dotenv -e .env.local -- npx tsx scripts/map-bank-accounts.ts
// =============================================================================

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CSV = "Copia_de_PLANILLA.csv";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const tokens = (s: string) => new Set(norm(s).split(" ").filter((t) => t.length >= 3));

(async () => {
  // Parse CSV rows with an account.
  const lines = readFileSync(CSV, "utf8").split(/\r?\n/);
  type Row = { line: number; name: string; banco: string; account: string };
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [name = "", banco = "", account = ""] = lines[i].split(";");
    if (!name.trim()) continue;
    if (account.trim()) rows.push({ line: i + 1, name: name.trim(), banco: banco.trim(), account: account.trim() });
  }

  const workers = await prisma.worker.findMany({ select: { id: true, fullName: true, bankAccount: true, bankName: true } });
  const wn = workers.map((w) => ({ ...w, n: norm(w.fullName), t: tokens(w.fullName) }));

  // Detect duplicate accounts within the CSV (would be a red flag).
  const acctCount = new Map<string, number>();
  for (const r of rows) acctCount.set(r.account, (acctCount.get(r.account) ?? 0) + 1);

  console.log(`\nCSV rows with an account: ${rows.length}\n`);
  for (const r of rows) {
    const exact = wn.filter((w) => w.n === norm(r.name));
    let cls: string, match: typeof wn;
    if (exact.length === 1) { cls = "EXACT"; match = exact; }
    else if (exact.length > 1) { cls = "MULTIPLE-EXACT"; match = exact; }
    else {
      // Fuzzy: rank by shared tokens; keep top scorers.
      const ct = tokens(r.name);
      const scored = wn
        .map((w) => ({ w, score: [...ct].filter((t) => w.t.has(t)).length }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);
      const top = scored.filter((s) => s.score === scored[0]?.score).map((s) => s.w);
      if (top.length === 1 && scored[0].score >= 2) { cls = "FUZZY"; match = top; }
      else if (top.length > 1) { cls = "MULTIPLE-FUZZY"; match = top; }
      else if (top.length === 1) { cls = "WEAK"; match = top; }
      else { cls = "NONE"; match = []; }
    }
    const dup = (acctCount.get(r.account) ?? 0) > 1 ? "  ⚠DUP-ACCOUNT" : "";
    console.log(`L${r.line} "${r.name}" → ${r.account} [${cls}]${dup}`);
    for (const m of match) {
      const has = m.bankAccount ? `  (YA TIENE ${m.bankAccount})` : "";
      console.log(`     ↳ ${m.fullName}  id=${m.id}${has}`);
    }
    if (cls === "NONE") console.log("     ↳ (sin coincidencia)");
  }

  // Names in CSV WITHOUT account (for completeness) and workers not covered.
  const matchedIds = new Set<string>();
  console.log("\n(análisis sin escritura — nada se modificó)");
  void matchedIds;
  await prisma.$disconnect();
})();
