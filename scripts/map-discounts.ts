// =============================================================================
// scripts/map-discounts.ts — ANALYSIS ONLY (no writes). Match the non-zero
// discounts in Descuentos_PLANILLA.csv to DB workers (normalized + fuzzy), and
// verify each has a PayrollEntry in the OPEN period (#8). "Q-" = zero → skipped.
//   npx dotenv -e .env.local -- npx tsx scripts/map-discounts.ts
// =============================================================================

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CSV = "Descuentos_PLANILLA.csv";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const tokens = (s: string) => new Set(norm(s).split(" ").filter((t) => t.length >= 3));

// "Q40.00" → 40 ; "Q-   " / "" → 0
function parseAmount(raw: string): number {
  const c = raw.replace(/q/gi, "").replace(/,/g, "").replace(/\s/g, "");
  if (c === "" || c === "-") return 0;
  const n = parseFloat(c);
  return Number.isFinite(n) ? n : 0;
}

(async () => {
  const lines = readFileSync(CSV, "utf8").split(/\r?\n/);
  type Row = { line: number; name: string; amount: number };
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [name = "", amt = ""] = lines[i].split(";");
    if (!name.trim()) continue;
    const amount = parseAmount(amt);
    if (amount > 0) rows.push({ line: i + 1, name: name.trim(), amount });
  }

  // Open period (= #8) and its payroll entries.
  const openPeriods = await prisma.payPeriod.findMany({ where: { isClosed: false }, select: { id: true, periodNumber: true, startDate: true, endDate: true } });
  if (openPeriods.length !== 1) { console.log(`⚠ se esperaba 1 período abierto, hay ${openPeriods.length}`); }
  const period = openPeriods[0];
  console.log(`Período abierto: #${period.periodNumber} ${period.startDate.toISOString().slice(0,10)}..${period.endDate.toISOString().slice(0,10)}\n`);

  const entries = await prisma.payrollEntry.findMany({ where: { payPeriodId: period.id }, include: { worker: { select: { id: true, fullName: true } } } });
  const entryByWorker = new Map(entries.map((e) => [e.worker.id, e]));

  const workers = await prisma.worker.findMany({ select: { id: true, fullName: true } });
  const wn = workers.map((w) => ({ ...w, n: norm(w.fullName), t: tokens(w.fullName) }));

  console.log(`Filas con descuento > 0: ${rows.length}\n`);
  let totalDisc = 0;
  for (const r of rows) {
    totalDisc += r.amount;
    const exact = wn.filter((w) => w.n === norm(r.name));
    let cls: string, match: typeof wn;
    if (exact.length === 1) { cls = "EXACT"; match = exact; }
    else if (exact.length > 1) { cls = "MULTIPLE-EXACT"; match = exact; }
    else {
      const ct = tokens(r.name);
      const scored = wn.map((w) => ({ w, score: [...ct].filter((t) => w.t.has(t)).length })).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
      const top = scored.filter((s) => s.score === scored[0]?.score).map((s) => s.w);
      if (top.length === 1 && scored[0].score >= 2) { cls = "FUZZY"; match = top; }
      else if (top.length > 1) { cls = "MULTIPLE-FUZZY"; match = top; }
      else if (top.length === 1) { cls = "WEAK"; match = top; }
      else { cls = "NONE"; match = []; }
    }
    console.log(`L${r.line} "${r.name}" → Q${r.amount.toFixed(2)} [${cls}]`);
    for (const m of match) {
      const e = entryByWorker.get(m.id);
      const inP8 = e ? `entry#8 OK (deduc actual Q${Number(e.deductions).toFixed(2)}, aPagar Q${Number(e.totalToPay).toFixed(2)})` : "❌ SIN entry en #8";
      console.log(`     ↳ ${m.fullName}  id=${m.id}  ${inP8}`);
    }
    if (cls === "NONE") console.log("     ↳ (sin coincidencia)");
  }
  console.log(`\nΣ descuentos: Q${totalDisc.toFixed(2)} en ${rows.length} trabajadores`);
  console.log("(análisis sin escritura — nada se modificó)");
  await prisma.$disconnect();
})();
