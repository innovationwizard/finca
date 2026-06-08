// =============================================================================
// scripts/import-planilla-mayo2.ts
//
// Imports the manually-reviewed CSV planilla for week May 11–13 2026.
//
// Default:  dry-run — prints a full report, writes nothing.
// Commit:   add --commit flag to create workers and insert ActivityRecords.
//
// Run:
//   npx dotenv -e .env.local -- npx tsx scripts/import-planilla-mayo2.ts
//   npx dotenv -e .env.local -- npx tsx scripts/import-planilla-mayo2.ts --commit
// =============================================================================

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { matchAllWorkers } from "../src/lib/ai/match-workers";

const prisma = new PrismaClient();
const COMMIT   = process.argv.includes("--commit");
const CSV_FILE = path.join(__dirname, "../docs/mayo2/planilla_semana_11-13_mayo_2026.csv");

// ── Activity abbreviation table (mirrors docs/abbr.txt) ──────────────────────
const ACTIVITY_ABBR: Record<string, string> = {
  CC: "Corte de Café",        PP: "Pepena",              CP: "Caporal",
  BE: "Beneficio",            EB: "Encargado Beneficio", MU: "Muestreo de Suelos",
  RP: "Repaso Poda",          CD: "Chapea y Desbejucar", FE: "Fertilización 1.5 oz",
  LM: "Limpia Manual",        DH: "Deshije",             MS: "Manejo de Sombra",
  HB: "Herbicida",            MIP: "Monitoreo de Plagas y Enfermedades",
  FG: "Aplicación de Fungicida",
  AN: "Análisis de Suelos y Foliar",
  FF: "Fertilización Foliar", EM: "Enmiendas",           MG: "Mantenimiento General",
  MT: "Manejo de Tejido",     LL: "Limpia lote",         TZ: "Trazado para siembra",
  AH: "Ahoyado",              SI: "Siembra",             CA: "Trabajos varios Carbón",
};

function resolveAbbrToName(raw: string): string {
  const abbr = raw.trim().replace(/\s+\d+$/, "").toUpperCase();
  return ACTIVITY_ABBR[abbr] ?? raw.trim();
}

// ── Lote aliases — maps CSV lote values to DB slugs ──────────────────────────
const LOTE_SLUG_ALIASES: Record<string, string> = {
  "canoa":          "canoa-1",
  "canada":         "canada",
  "cañada":         "canada",
  "vg1":            "vg1",
  "vg2":            "vg2",
  "hacienda":       "hacienda",
  "mirasol":        "mirasol",
  "corona":         "corona",
  "arenera":        "arenera",
  "galera":         "galera",
  "cruz 1":         "cruz-1",
  "cruz 2":         "cruz2",
  "san emiliano":   "san-emiliano-cruz",
};

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function resolveLoteSlug(raw: string): string | null {
  if (!raw) return null;
  const n = normalize(raw);
  return LOTE_SLUG_ALIASES[n] ?? null;
}

// ── Known spelling differences between CSV and DB worker names ───────────────
const NAME_CORRECTIONS: Record<string, string> = {
  "enma perez najera":                "Enma Mannolia Perez Najera",
  "maria floridaina alvarez morales": "Maria Floridalma Alvarez Morales",
  "wilfredo hernandez ralios":        "Wilfrido Hernandez Ralios",
  "wilson orlando garcia mendez":     "Vilson Orlando Garcia Mendez",
  "jose eduardo hernandez navas":     "Elderr Eduardo Hernandez Navas",
  "fernando adeider guamush perez":   "Fernando Adelder Guamush Perez",
};

function correctWorkerName(raw: string): string {
  const key = normalize(raw);
  return NAME_CORRECTIONS[key] ?? raw;
}

// ── CSV parser ────────────────────────────────────────────────────────────────
type CsvRow = { fecha: string; trabajador: string; lote: string; actividad: string; unidades: number };

function parseCsv(filePath: string): CsvRow[] {
  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const [fecha, trabajador, lote, actividad, unidades] = parts;
    if (!fecha?.trim() || !trabajador?.trim() || !actividad?.trim()) continue;
    rows.push({
      fecha:      fecha.trim(),
      trabajador: trabajador.trim(),
      lote:       (lote ?? "").trim(),
      actividad:  actividad.trim(),
      unidades:   parseFloat((unidades ?? "1").trim()) || 1,
    });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  PLANILLA IMPORT Mayo 11-13 2026 — ${COMMIT ? "⚠  COMMIT MODE — writing to DB" : "DRY RUN (read-only)"}`);
  console.log(`${"=".repeat(70)}\n`);

  // 1. Parse CSV
  const csvRows = parseCsv(CSV_FILE);
  console.log(`CSV: ${csvRows.length} rows\n`);

  // 2. Fetch reference data
  const [dbWorkers, dbActivities, dbLotes, dbPeriods] = await Promise.all([
    prisma.worker.findMany({ where: { isActive: true }, select: { id: true, fullName: true } }),
    prisma.activity.findMany({ where: { isActive: true }, select: { id: true, name: true, defaultPrice: true } }),
    prisma.lote.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true } }),
    prisma.payPeriod.findMany({
      where: { isClosed: false },
      select: { id: true, periodNumber: true, startDate: true, endDate: true, agriculturalYear: true },
      orderBy: { startDate: "asc" },
    }),
  ]);

  const activityByName = new Map(dbActivities.map((a) => [normalize(a.name), a]));
  const loteBySlug     = new Map(dbLotes.map((l) => [l.slug, l]));

  function findPeriod(dateStr: string) {
    return dbPeriods.find((p) =>
      dateStr >= p.startDate.toISOString().split("T")[0] &&
      dateStr <= p.endDate.toISOString().split("T")[0],
    ) ?? null;
  }

  // 3. Apply name corrections and match workers
  const correctedRows  = csvRows.map((r) => ({ ...r, trabajador: correctWorkerName(r.trabajador) }));
  const uniqueNames    = [...new Set(correctedRows.map((r) => r.trabajador))];
  const workerMatches  = matchAllWorkers(uniqueNames, dbWorkers);
  const unmatchedNames = uniqueNames.filter((n) => !workerMatches[n]?.exactMatch);
  const matchedNames   = uniqueNames.filter((n) =>  workerMatches[n]?.exactMatch);

  console.log(`Worker matching: ${matchedNames.length} matched, ${unmatchedNames.length} unmatched`);
  if (unmatchedNames.length) {
    console.log("  Unmatched (will be created as new workers):");
    unmatchedNames.forEach((n) => console.log(`    + ${n}`));
  }
  console.log();

  // 4. Create new workers (commit mode only)
  const createdWorkers = new Map<string, { id: string; fullName: string }>();
  if (unmatchedNames.length > 0) {
    if (COMMIT) {
      console.log("Creating new workers...");
      for (const name of unmatchedNames) {
        const w = await prisma.worker.create({ data: { fullName: name } });
        createdWorkers.set(name, { id: w.id, fullName: w.fullName });
        console.log(`  ✓ Created: ${w.fullName} (${w.id})`);
      }
    } else {
      console.log("  (dry-run: new workers would be created on --commit)");
    }
    console.log();
  }

  // 5. Resolve all IDs and build candidates
  const unresolvedActivities = new Set<string>();
  const unresolvedLotes      = new Set<string>();
  const missingPeriods       = new Set<string>();

  type Candidate = {
    trabajador: string; workerId: string | null;
    fecha: string; loteRaw: string; loteId: string | null;
    activityId: string | null; activityName: string;
    unitPrice: number; units: number;
    payPeriodId: string | null; skipReason: string | null;
  };

  const candidates: Candidate[] = correctedRows.map((r) => {
    const matchResult   = workerMatches[r.trabajador];
    const matchedWorker = matchResult?.exactMatch ?? createdWorkers.get(r.trabajador) ?? null;
    const workerId      = matchedWorker?.id ?? null;

    const canonicalName = resolveAbbrToName(r.actividad);
    const act           = activityByName.get(normalize(canonicalName));
    if (!act) unresolvedActivities.add(r.actividad);
    const activityId = act?.id ?? null;
    const unitPrice  = act?.defaultPrice ? Number(act.defaultPrice) : 0;

    const slug   = resolveLoteSlug(r.lote);
    const lote   = slug ? (loteBySlug.get(slug) ?? null) : null;
    if (r.lote && !lote) unresolvedLotes.add(r.lote);
    const loteId = lote?.id ?? null;

    const period = findPeriod(r.fecha);
    if (!period) missingPeriods.add(r.fecha);

    let skipReason: string | null = null;
    if (!workerId)   skipReason = `no worker ID (dry-run — would be created)`;
    if (!activityId) skipReason = `activity "${r.actividad}" not found in DB`;
    if (!period)     skipReason = `no open pay period for ${r.fecha}`;

    return {
      trabajador: r.trabajador, workerId, fecha: r.fecha,
      loteRaw: r.lote, loteId, activityId, activityName: canonicalName,
      unitPrice, units: r.unidades, payPeriodId: period?.id ?? null, skipReason,
    };
  });

  // 6. Deduplication — skip any (date, workerId) pair already in DB
  const uniqueDates = [...new Set(candidates.filter((c) => c.workerId).map((c) => c.fecha))];
  const existingRecords = await prisma.activityRecord.findMany({
    where: { date: { in: uniqueDates.map((d) => new Date(d)) } },
    select: { date: true, workerId: true },
  });
  const existingKeySet = new Set(
    existingRecords.map((r) => `${r.date.toISOString().split("T")[0]}|${r.workerId}`),
  );

  let duplicateCount = 0;
  const toInsert = candidates.filter((c) => {
    if (c.skipReason) return false;
    const key = `${c.fecha}|${c.workerId}`;
    if (existingKeySet.has(key)) { duplicateCount++; return false; }
    return true;
  });

  // 7. Summary
  const skipped    = candidates.filter((c) => c.skipReason);
  const noActivity = skipped.filter((c) => c.skipReason?.includes("activity"));
  const noPeriod   = skipped.filter((c) => c.skipReason?.includes("period"));

  console.log("─".repeat(70));
  console.log("SUMMARY");
  console.log("─".repeat(70));
  console.log(`  Total CSV rows:        ${csvRows.length}`);
  console.log(`  Already in DB (dedup): ${duplicateCount}`);
  console.log(`  Unresolved activities: ${noActivity.length}${noActivity.length ? " → " + [...unresolvedActivities].join(", ") : ""}`);
  console.log(`  No open period:        ${noPeriod.length}${noPeriod.length ? " → dates: " + [...missingPeriods].join(", ") : ""}`);
  if (unresolvedLotes.size) {
    console.log(`  Unresolved lotes:      ${[...unresolvedLotes].join(", ")} (rows inserted WITHOUT lote)`);
  }
  console.log(`  ─────────────────────`);
  console.log(`  Records to insert:     ${toInsert.length}`);
  console.log();

  if (toInsert.length === 0) {
    console.log("Nothing to insert. Exiting.");
    return;
  }

  if (!COMMIT) {
    console.log("─".repeat(70));
    console.log("DRY RUN complete. Re-run with --commit to write to the database.");
    console.log("─".repeat(70));
    return;
  }

  // 8. Insert
  console.log("─".repeat(70));
  console.log("Inserting records...");

  const rows = toInsert.map((c, i) => ({
    date:         new Date(c.fecha),
    payPeriodId:  c.payPeriodId!,
    workerId:     c.workerId!,
    activityId:   c.activityId!,
    loteId:       c.loteId,
    quantity:     c.units,
    unitPrice:    c.unitPrice,
    totalEarned:  Math.round(c.units * c.unitPrice * 100) / 100,
    clientId:     `csv-mayo2-${c.fecha}-${c.workerId}-${c.activityId}-${i}`,
    syncedAt:     new Date(),
  }));

  const result = await prisma.activityRecord.createMany({ data: rows, skipDuplicates: true });

  console.log(`\n✓ Inserted ${result.count} records.`);
  if (unmatchedNames.length) {
    console.log(`✓ Created ${unmatchedNames.length} new worker(s): ${unmatchedNames.join(", ")}`);
  }
  console.log();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
