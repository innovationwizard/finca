// =============================================================================
// scripts/verify-xlsx-parse.ts
//
// Dry-run visual verification of the .xlsx planilla parser against a REAL file.
// Writes nothing. Prints the format report, the balanced row counts (the
// "nothing left behind" proof), sample entries, and every anomaly bucket.
//
// Reference data (workers/activities/lotes) is pulled from the live DB so the
// value-based column detection is exercised exactly as in production. If the DB
// is unreachable, it falls back to an empty vocab (header-based detection only)
// and says so.
//
// Run:
//   npx dotenv -e .env.local -- npx tsx scripts/verify-xlsx-parse.ts
//   npx dotenv -e .env.local -- npx tsx scripts/verify-xlsx-parse.ts "path/to/file.xlsx"
// =============================================================================

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { parsePlanillaWorkbook, type Vocab } from "../src/lib/xlsx/parse-planilla";
import { buildActivityResolver } from "../src/lib/xlsx/activity-aliases";

const FILE = process.argv[2] || path.join(__dirname, "../Planilla_marzo_abril.xlsx");
const prisma = new PrismaClient();

async function loadVocab(): Promise<{ vocab: Vocab; activities: { id: string; name: string }[]; lotes: { name: string; slug: string }[]; live: boolean }> {
  try {
    const [activities, lotes, workers] = await Promise.all([
      prisma.activity.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prisma.lote.findMany({ where: { isActive: true }, select: { name: true, slug: true } }),
      prisma.worker.findMany({ where: { isActive: true }, select: { fullName: true } }),
    ]);
    return {
      vocab: {
        activityNames: activities.map((a) => a.name),
        loteNames: lotes.flatMap((l) => [l.name, l.slug]),
        workerNames: workers.map((w) => w.fullName),
      },
      activities,
      lotes,
      live: true,
    };
  } catch {
    return { vocab: { activityNames: [], loteNames: [], workerNames: [] }, activities: [], lotes: [], live: false };
  }
}

async function main() {
  console.log("=".repeat(78));
  console.log(`  VERIFY XLSX PARSE — ${path.basename(FILE)}`);
  console.log("=".repeat(78));

  const { vocab, activities, live } = await loadVocab();
  console.log(live
    ? `Vocabulario DB: ${vocab.activityNames.length} actividades, ${vocab.loteNames.length} lotes, ${vocab.workerNames.length} trabajadores.\n`
    : "⚠ Sin conexión a la DB — detección solo por encabezados (vocabulario vacío).\n");

  const buffer = fs.readFileSync(FILE);
  const parsed = parsePlanillaWorkbook(buffer, vocab);
  const { formatReport: fr, counts, anomalies } = parsed;

  console.log("── HOJAS (puntaje) ────────────────────────────────────────────────────────");
  for (const s of fr.sheetScores) {
    const mark = s.sheet === fr.sheetChosen ? "▶" : " ";
    console.log(`  ${mark} ${s.sheet.padEnd(22)} score=${String(s.score).padStart(6)}  filas≈${s.dataRowEstimate}  roles=[${s.rolesFound.join(",")}]`);
  }

  console.log("\n── COLUMNAS DETECTADAS ─────────────────────────────────────────────────────");
  for (const role of Object.keys(fr.columnRoles)) {
    const cr = fr.columnRoles[role as keyof typeof fr.columnRoles]!;
    console.log(`  ${role.padEnd(9)} → col ${String(cr.index).padStart(2)} "${cr.header}"  (${cr.via}, conf ${cr.confidence.toFixed(2)})`);
  }
  if (fr.missingRoles.length) console.log(`  FALTANTES (core): ${fr.missingRoles.join(", ")}`);
  if (fr.unknownColumns.length) {
    console.log("  NO CLASIFICADAS:");
    for (const u of fr.unknownColumns) console.log(`    col ${u.index} "${u.header}"  ej: ${u.sample.join(" | ")}`);
  }
  console.log(`  DRIFT: ${fr.driftDetected ? "SÍ" : "no"}${fr.driftReasons.length ? " → " + fr.driftReasons.join(" ") : ""}`);

  console.log("\n── CONTEO (prueba de balance) ──────────────────────────────────────────────");
  console.log(`  Filas con contenido: ${counts.contentRows}`);
  console.log(`  Registros (entries): ${counts.entries}   (de los cuales marcados: ${counts.flagged})`);
  console.log(`  Ignoradas:           ${counts.ignored}`);
  console.log(`  Incompletas:         ${counts.incomplete}`);
  console.log(`  Sin clasificar:      ${counts.unparseable}`);
  console.log(`  BALANCE: ${counts.balanced ? "✓ CUADRA" : "✗ NO CUADRA"}  (${counts.entries}+${counts.ignored}+${counts.incomplete}+${counts.unparseable} = ${counts.entries + counts.ignored + counts.incomplete + counts.unparseable} vs ${counts.contentRows})`);

  console.log(`\n  Rango de fechas: ${parsed.dateRange.start} → ${parsed.dateRange.end}`);
  console.log(`  Trabajadores distintos: ${parsed.rows.length}`);

  // Activity resolution preview
  if (live) {
    const resolve = buildActivityResolver(activities);
    const rawActs = [...new Set(parsed.rows.flatMap((r) => r.entries.map((e) => e.activity)))];
    console.log("\n── RESOLUCIÓN DE ACTIVIDADES ───────────────────────────────────────────────");
    for (const a of rawActs) {
      const m = resolve(a);
      console.log(`  "${a}" → ${m ? m.name : "❌ NO RESUELTA (se marca para mapeo manual)"}`);
    }
  }

  console.log("\n── MUESTRA DE REGISTROS (primeros 6) ───────────────────────────────────────");
  let shown = 0;
  for (const rw of parsed.rows) {
    for (const e of rw.entries) {
      if (shown++ >= 6) break;
      console.log(`  ${e.date} | ${rw.workerName.padEnd(26)} | ${e.activity.padEnd(20)} | ${String(e.units).padStart(5)} | lote="${e.lote}" | precioHoja=${e.sheetPrice ?? "—"}`);
    }
    if (shown >= 6) break;
  }

  const printBucket = (label: string, items: { row: { rowNumber: number; cells: string[] }; reason: string }[]) => {
    if (!items.length) return;
    console.log(`\n── ${label} (${items.length}) ────────────────────────────────────────────`);
    for (const it of items.slice(0, 10)) {
      console.log(`  fila ${it.row.rowNumber}: ${it.reason}`);
      console.log(`    [${it.row.cells.map((c) => c || "·").join(" | ")}]`);
    }
  };
  printBucket("MARCADAS (entraron como registro, cantidad vacía/cero)", anomalies.flagged);
  printBucket("IGNORADAS", anomalies.ignored);
  printBucket("INCOMPLETAS", anomalies.incomplete);
  printBucket("SIN CLASIFICAR", anomalies.unparseable);

  console.log("\n" + "=".repeat(78));
  console.log(counts.balanced ? "  ✓ Parser OK — ninguna fila quedó atrás." : "  ✗ REVISAR — el balance no cuadra.");
  console.log("=".repeat(78) + "\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
