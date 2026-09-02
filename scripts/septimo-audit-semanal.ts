// =============================================================================
// scripts/septimo-audit-semanal.ts — READ-ONLY. Per-week audit of the most
// recent CLOSED pay period: activity pay, recomputed séptimo, and a
// reconciliation against the séptimo actually stored on PayrollEntry. Writes a
// CSV next to the repo root and prints the diagnostics the download can't show
// (cross-check against computeSeptimoForPeriod, devengado mismatches).
//
// The rules live in src/lib/planilla/septimo-semanal.ts — the same module the
// "Descargar Excel Séptimos" button uses, so this audit and that download can
// never disagree.
//
//   ./node_modules/.bin/tsx --env-file=.env.local scripts/septimo-audit-semanal.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { computeSeptimoForPeriod, getSeptimoAmount } from "../src/lib/payroll/septimo";
import {
  buildSeptimoReport,
  septimoTotals,
  weekGroupHeader,
  WEEK_SUB_HEADERS,
  TRAILING_HEADERS,
} from "../src/lib/planilla/septimo-semanal";
import { writeFileSync } from "node:fs";

const prisma = new PrismaClient();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const q = (n: number) => n.toFixed(2);
const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

(async () => {
  const period = await prisma.payPeriod.findFirst({ where: { isClosed: true }, orderBy: { endDate: "desc" } });
  if (!period) throw new Error("no hay períodos cerrados");

  const report = await buildSeptimoReport(prisma, period);
  const totals = septimoTotals(report);
  const { weeks, rows, amount } = report;

  // ── CSV: two header rows (week groups, then the three columns) ────────────
  const lines: string[] = [];
  lines.push(["", ...weeks.flatMap((w) => [weekGroupHeader(w), "", ""]), "", "", ""].map(esc).join(","));
  lines.push(
    ["Nombre completo", ...weeks.flatMap(() => [...WEEK_SUB_HEADERS]), ...TRAILING_HEADERS].map(esc).join(","),
  );
  for (const r of rows) {
    const cols = [r.workerName];
    for (const c of r.cells) cols.push(q(c.actividades), c.septimo === null ? "" : q(c.septimo), q(c.total));
    cols.push(q(r.septimoCalculado), q(r.septimoPlanilla), q(r.diferencia));
    lines.push(cols.map(esc).join(","));
  }
  const footer = ["TOTAL"];
  for (const t of totals.perWeek) footer.push(q(t.actividades), t.septimo === null ? "" : q(t.septimo), q(t.total));
  footer.push(q(totals.septimoCalculado), q(totals.septimoPlanilla), q(totals.diferencia));
  lines.push(footer.map(esc).join(","));

  const out = `periodo-${period.periodNumber}-${period.agriculturalYear}-septimos-por-semana.csv`;
  writeFileSync(out, lines.join("\n") + "\n", "utf8");

  // ── Diagnostics ───────────────────────────────────────────────────────────
  console.log(`\n=== Período CERRADO más reciente: #${period.periodNumber} (${period.agriculturalYear}) ${iso(period.startDate)} … ${iso(period.endDate)} ===`);
  console.log(`séptimo configurado: Q${amount} · feriados registrados: ${report.holidayCount} · cerrado: ${period.closedAt ? iso(period.closedAt) : "—"}`);
  console.log(`trabajadores: ${rows.length}`);
  for (const w of weeks) {
    console.log(`  semana ${w.monday}…${w.saturday} → días en el período ${w.clipFrom}…${w.clipTo} · séptimo ${w.ownsSeptimo ? "SÍ (sábado dentro del período)" : "NO (sábado fuera del período)"}`);
  }

  // The shared séptimo engine must agree with the per-week attribution.
  const libEarned = await computeSeptimoForPeriod(prisma, period.id, await getSeptimoAmount());
  let libTotal = 0;
  for (const v of libEarned.values()) libTotal += v;
  const agree = Math.abs(libTotal - totals.septimoCalculado) < 0.01;
  console.log(`\ncross-check computeSeptimoForPeriod: Q${q(libTotal)} · este audit: Q${q(totals.septimoCalculado)} · ${agree ? "OK" : "MISMATCH"}`);

  const septimoOff = rows.filter((r) => Math.abs(r.diferencia) >= 0.01);
  console.log(`diferencias séptimo calculado vs planilla: ${septimoOff.length}`);
  for (const r of septimoOff) console.log(`   • ${r.workerName}: calculado Q${q(r.septimoCalculado)} vs planilla Q${q(r.septimoPlanilla)} (dif Q${q(r.diferencia)})`);

  // Not a séptimo problem, but the same query answers it: a devengado that no
  // activity record backs means the payroll row drifted from the capture.
  const devengadoOff = rows.filter((r) => Math.abs(r.actividadesTotal - r.devengadoPlanilla) >= 0.01);
  console.log(`diferencias actividades (suma semanal vs devengado en planilla): ${devengadoOff.length}`);
  for (const r of devengadoOff) console.log(`   • ${r.workerName}: semanal Q${q(r.actividadesTotal)} vs planilla Q${q(r.devengadoPlanilla)}`);

  console.log(`\nCSV: ${out}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("FAILED:", e);
  await prisma.$disconnect();
  process.exit(1);
});
