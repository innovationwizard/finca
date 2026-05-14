// =============================================================================
// scripts/import-planilla-imagesofnewformat.ts
//
// Processes every image in docs/imagesofnewformat/ using the same logic as
// the Planilla Semanal upload flow and imports the data into the production DB.
//
// Default:  dry-run — prints a full report, writes nothing.
// Commit:   add --commit flag to create workers and insert ActivityRecords.
//
// Run:
//   npx dotenv -e .env.local -- npx tsx scripts/import-planilla-imagesofnewformat.ts
//   npx dotenv -e .env.local -- npx tsx scripts/import-planilla-imagesofnewformat.ts --commit
// =============================================================================

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { extractPlanillaData } from "../src/lib/ai/extract-planilla";
import { matchAllWorkers } from "../src/lib/ai/match-workers";

const prisma = new PrismaClient();
const COMMIT      = process.argv.includes("--commit");
const FRESH       = process.argv.includes("--fresh");   // bypass cache, re-extract
const IMAGES_DIR  = path.join(__dirname, "../docs/imagesofnewformat");
const CACHE_FILE  = path.join(__dirname, "../.planilla-extraction-cache.json");

type CachedRow = {
  workerName: string;
  entries: Array<{ date: string; lote: string; activity: string; units: number }>;
};
type CachedImage = {
  file: string;
  rows: CachedRow[];
  dateRange: { start: string; end: string };
  confidence: string;
  notes?: string;
};

// ── Activity abbreviation table (mirrors docs/abbr.txt) ───────────────────────
const ACTIVITY_ABBR: Record<string, string> = {
  CC: "Corte de Café",   PP: "Pepena",             CP: "Caporal",
  BE: "Beneficio",       EB: "Encargado Beneficio", MU: "Muestreo de Suelos",
  RP: "Repaso Poda",     CD: "Chapea y Desbejucar", FE: "Fertilización 1.5 oz",
  LM: "Limpia Manual",   DH: "Deshije",             MS: "Manejo de Sombra",
  HB: "Herbicida",       MIP: "Monitoreo de Plagas y Enfermedades",
  FG: "Aplicación de Fungicida",
  AN: "Análisis de Suelos y Foliar",
  FF: "Fertilización Foliar",
  EM: "Enmiendas",       MG: "Mantenimiento General",
  MT: "Manejo de Tejido",
  LL: "Limpia lote",     TZ: "Trazado para siembra",
  AH: "Ahoyado",         SI: "Siembra",             CA: "Trabajos varios Carbón",
  // OCR variants resolved here so they match the DB activity names
  FERRADO: "FERIADO",
  D:       "HERIDO",
};

function resolveAbbrToName(raw: string): string {
  const abbr = raw.trim().replace(/\s+\d+$/, "").toUpperCase();
  return ACTIVITY_ABBR[abbr] ?? raw.trim();
}

// ── Canonical name corrections — maps OCR variants to confirmed spellings ─────
// Keys are normalize()'d.
const NAME_CORRECTIONS: Record<string, string> = {
  // Row 3 — Henry Randolfo
  "henry fandolfo hernandez solano":  "Henry Randolfo Hernandez Solano",
  "henry pandolfo hernandez solano":  "Henry Randolfo Hernandez Solano",
  "henri rodolfo hernandez solano":   "Henry Randolfo Hernandez Solano",
  "henry randolfo hernandez solano":  "Henry Randolfo Hernandez Solano",
  // Row 6 — Enma Mannolia
  "erma mamolita perez najera":       "Enma Mannolia Perez Najera",
  "erma marisolla perez najera":      "Enma Mannolia Perez Najera",
  "erma manriolla perez najera":      "Enma Mannolia Perez Najera",
  "ervin marcolin perez najera":      "Enma Mannolia Perez Najera",
  "emma mannolia perez najera":       "Enma Mannolia Perez Najera",
  "enma manriolla perez najera":      "Enma Mannolia Perez Najera",
  // Row 9 — Adister Arcenio
  "adister acencio marroquin":        "Adister Arcenio Marroquin",
  "alditer alfonso marroquin":        "Adister Arcenio Marroquin",
  // Row 10 — Edgar Rolando Navas Chacon
  "edgar rolando navas almacion":     "Edgar Rolando Navas Chacon",
  "edgar rolando navas almasion":     "Edgar Rolando Navas Chacon",
  // Row 13 — Erick Ronaldo
  "erick dionicio hernandez martinez": "Erick Ronaldo Hernandez Martinez",
  "ervin hernandez martinez":          "Erick Ronaldo Hernandez Martinez",
  // Row 18 — Dixon Rene (different person from row 13)
  "dionicio rene hernandez martinez": "Dixon Rene Hernandez Martinez",
  "ervin dionicio hernandez":         "Dixon Rene Hernandez Martinez",
  // Row 15 — Elmer Alexander Hernandez Raliois
  "elmer alexander hernandez pallaos":  "Elmer Alexander Hernandez Raliois",
  "elmer alejandro hernandez palacio":  "Elmer Alexander Hernandez Raliois",
  "elmer alexander hernandez flattoni": "Elmer Alexander Hernandez Raliois",
  "elmer alexander hernandez raliceo":  "Elmer Alexander Hernandez Raliois",
  "elmer alexander hernandez palicio":  "Elmer Alexander Hernandez Raliois",
  // Row 16 — Axel Amildo
  "axel amleto alvarez morales":      "Axel Amildo Alvarez Morales",
  "jose amilcar alvarez morales":     "Axel Amildo Alvarez Morales",
  "axel amilcar alvarez morales":     "Axel Amildo Alvarez Morales",
  // Row 20 — Wilfrido Hernandez Ralios
  "valitrido hernandez rallios":      "Wilfrido Hernandez Ralios",
  "wilfredo hernandez pallaos":       "Wilfrido Hernandez Ralios",
  "wilfredo hernandez palacio":       "Wilfrido Hernandez Ralios",
  "wilfredo hernandez carias":        "Wilfrido Hernandez Ralios",
  "vilitrido hernandez rallios":      "Wilfrido Hernandez Ralios",
  // Row 24 — Elderr Eduardo
  "eldert eduardo hernandez navas":   "Elderr Eduardo Hernandez Navas",
  "elder eduardo hernandez navas":    "Elderr Eduardo Hernandez Navas",
  "elden eduardo hernandez navas":    "Elderr Eduardo Hernandez Navas",
  // Row 26 — Fernando Adelder Guamush Perez
  "fernando aceitles guamuch perez":  "Fernando Adelder Guamush Perez",
  "fernando adalmer guamuch perez":   "Fernando Adelder Guamush Perez",
  "fernando adelder guamuch perez":   "Fernando Adelder Guamush Perez",
  // Row 29 — Leidy Susana
  "ledy suzana solano perez":         "Leidy Susana Solano Perez",
  "lady suzana solano perez":         "Leidy Susana Solano Perez",
  "ledy susana solano perez":         "Leidy Susana Solano Perez",
  "lady susana solano perez":         "Leidy Susana Solano Perez",
  // Row 31 — Maria Floridalma
  "maria flordalma alvarez morales":  "Maria Floridalma Alvarez Morales",
  "maria floridaima alvarez morales": "Maria Floridalma Alvarez Morales",
  // Row 32 — Oliver Gerardo
  "edney orlando aguilar sanchez":    "Oliver Gerardo Aguilar Sanchez",
  "oliver orlando aguilar sanchez":   "Oliver Gerardo Aguilar Sanchez",
  // Row 34 — Marta Rosmery Hernandez Perez De Solano
  "maria rosmery hernandez perez de solano":    "Marta Rosmery Hernandez Perez De Solano",
  "maria esmeralda hernandez perez de solano":  "Marta Rosmery Hernandez Perez De Solano",
  "maria florentina hernandez perez de solano": "Marta Rosmery Hernandez Perez De Solano",
  "maria marta hernandez perez de solano":      "Marta Rosmery Hernandez Perez De Solano",
  "marta esmeralda hernandez perez de solano":  "Marta Rosmery Hernandez Perez De Solano",
  // Row 35 — Maria Marleni
  "iliana marroquin salazar":         "Maria Marleni Marroquin Salazar",
  "balvina marroquin salazar":        "Maria Marleni Marroquin Salazar",
  "maria delein marroquin salazar":   "Maria Marleni Marroquin Salazar",
  // Row 37 — Suleyma Areli Guamush Marroquin
  "sulexna areli guamuch marroquin":  "Suleyma Areli Guamush Marroquin",
  "sulexna arely guamuch marroquin":  "Suleyma Areli Guamush Marroquin",
  "suleyma arely guamush marroquin":  "Suleyma Areli Guamush Marroquin",
  "suleyma areli guamuch marroquin":  "Suleyma Areli Guamush Marroquin",
  "suleyma arely guamuch marroquin":  "Suleyma Areli Guamush Marroquin",
  "sulbdyna arefi guamuch marroquin": "Suleyma Areli Guamush Marroquin",
  "sulema areli guantam marroquin":   "Suleyma Areli Guamush Marroquin",

  // Additional OCR variants confirmed in second-pass review
  // Row 6 — Enma Mannolia
  "erma marmolia perez najera":       "Enma Mannolia Perez Najera",
  "ermy farinola perez najera":       "Enma Mannolia Perez Najera",
  // Row 14 — Erica Yanira Alvarez Lopez
  "erica yarina rivas lopez":         "Erica Yanira Alvarez Lopez",
  // Row 13 — Erick Ronaldo
  "elmer elenaldo hernandez martinez": "Erick Ronaldo Hernandez Martinez",
  // Row 18 — Dixon Rene
  "elian rene hernandez martinez":    "Dixon Rene Hernandez Martinez",
  "eliseo rene hernandez martinez":   "Dixon Rene Hernandez Martinez",
  "elmer nery hernandez martinez":    "Dixon Rene Hernandez Martinez",
  // Row 15 — Elmer Alexander Hernandez Raliois
  "elmer alexander hernandez pallais":  "Elmer Alexander Hernandez Raliois",
  "elmer alexander hernandez fialloss": "Elmer Alexander Hernandez Raliois",
  "elmer alexander hernandez ralicios": "Elmer Alexander Hernandez Raliois",
  "elmer alejandro hernandez ralios":   "Elmer Alexander Hernandez Raliois",
  // Row 16 — Axel Amildo
  "avel arnulfo alvarez morales":     "Axel Amildo Alvarez Morales",
  // Row 20 — Wilfrido Hernandez Ralios
  "milton hernandez ralios":          "Wilfrido Hernandez Ralios",
  "wilfredo hernandez melgar":        "Wilfrido Hernandez Ralios",
  // Row 26 — Fernando Adelder Guamush Perez
  "fernando adelmo guzman perez":     "Fernando Adelder Guamush Perez",
  // Row 29 — Leidy Susana Solano Perez
  "leidg susana solano perez":        "Leidy Susana Solano Perez",
  "leidy suriana solano perez":       "Leidy Susana Solano Perez",
  "ludy susana solano perez":         "Leidy Susana Solano Perez",
  // Row 31 — Maria Floridalma
  "maria flordarma alvarez morales":  "Maria Floridalma Alvarez Morales",
  "maria floridaina alvarez morales": "Maria Floridalma Alvarez Morales",
  // Row 32 — Oliver Gerardo Aguilar Sanchez
  "edwin gerardo aguilar sanchez":    "Oliver Gerardo Aguilar Sanchez",
  "oiver gerardo garcia sanchez":     "Oliver Gerardo Aguilar Sanchez",
  // Row 34 — Marta Rosmery
  "marta prosperity hernandez perez de solano": "Marta Rosmery Hernandez Perez De Solano",
  // Row 35 — Maria Marleni
  "marlon maleni marroquin salazar":  "Maria Marleni Marroquin Salazar",
  // Row 36 — Vilson Orlando Garcia Mendez
  "wilson orlando garcia mendez":     "Vilson Orlando Garcia Mendez",
  // Row 39 — Artemio Danilo Solano Marroquin
  "artemic danilo solano marroquin":  "Artemio Danilo Solano Marroquin",
  "artemio eliseo juano marroquin":   "Artemio Danilo Solano Marroquin",
  // Row 5 — Gaby Maidely Alvarez Jimenez
  "baby madelyl alvarez jimenez":     "Gaby Maidely Alvarez Jimenez",
  "gady mardely alvarez jimenez":     "Gaby Maidely Alvarez Jimenez",
  // Row 27 — Jorge Luis Marroquin Salazar
  "jorge luz marroquin salazar":      "Jorge Luis Marroquin Salazar",
  // Row 28 — Baldomero Solano Marroquin
  "baldemerlo solano marroquin":      "Baldomero Solano Marroquin",
  // Row 25 — Francisco Alexander Navas Juarez
  "francisco alejandro navas juarez": "Francisco Alexander Navas Juarez",
  // Row 33 — Julia Yanira Marroquin
  "julia yadira marroquin":           "Julia Yanira Marroquin",
  // Row 23 — Telma Elizabeth Hernandez Martinez
  "telma elizabeth hernandez madrid": "Telma Elizabeth Hernandez Martinez",

  // ── Third-pass corrections (from stable cache extraction) ──────────────────
  // Row 3 — Henry Randolfo
  "henri randolfo hernandez solano":  "Henry Randolfo Hernandez Solano",
  // Row 5 — Gaby Maidely Alvarez Jimenez
  "gaby miadeld alvarez jimenez":     "Gaby Maidely Alvarez Jimenez",
  "gudy mariselly alvarez jimenez":   "Gaby Maidely Alvarez Jimenez",
  // Row 6 — Enma Mannolia Perez Najera
  "erma mamolia perez najera":        "Enma Mannolia Perez Najera",
  // Row 15 — Elmer Alexander Hernandez Raliois
  "elmer alexander hernandez fiallos":  "Elmer Alexander Hernandez Raliois",
  "elmer alexander hernandez pallozo":  "Elmer Alexander Hernandez Raliois",
  "elmer alexander hernandez ralicos":  "Elmer Alexander Hernandez Raliois",
  "elmer alejandro hernandez rallon":   "Elmer Alexander Hernandez Raliois",
  // Row 20 — Wilfrido Hernandez Ralios
  "vilfrido hernandez ralicos":       "Wilfrido Hernandez Ralios",
  "villindo hernandez pallozo":       "Wilfrido Hernandez Ralios",
  "wilfredo hernandez rallon":        "Wilfrido Hernandez Ralios",
  "wulfing hernandez palma":          "Wilfrido Hernandez Ralios",
  // Row 26 — Fernando Adelder Guamush Perez
  "fernando adelbel guamuush perez":  "Fernando Adelder Guamush Perez",
  "fernando adelber guamush perez":   "Fernando Adelder Guamush Perez",
  // Row 27 — Jorge Luis Marroquin Salazar
  "jorge luis marroquin marroquin":   "Jorge Luis Marroquin Salazar",
  "jorge luiz marroquin salazar":     "Jorge Luis Marroquin Salazar",
  // Row 29 — Leidy Susana Solano Perez
  "lesly susana solano perez":        "Leidy Susana Solano Perez",
  // Row 31 — Maria Floridalma Alvarez Morales
  "maria flordelma alvarez morales":  "Maria Floridalma Alvarez Morales",
  // Row 36 — Vilson Orlando Garcia Mendez
  "willson orlando garcia mendez":    "Vilson Orlando Garcia Mendez",
  // Row 37 — Suleyma Areli Guamush Marroquin
  "suleima areli guamush marroquin":  "Suleyma Areli Guamush Marroquin",
  "suleima arely guanaun marroquin":  "Suleyma Areli Guamush Marroquin",
  "skulemja arol guamush marroquin":  "Suleyma Areli Guamush Marroquin",
  // Row 39 — Artemio Danilo Solano Marroquin
  "artemio daniel solano marroquin":  "Artemio Danilo Solano Marroquin",
  "artemio david solano marroquin":   "Artemio Danilo Solano Marroquin",

  // ── Final confirmed corrections ────────────────────────────────────────────
  // Row 11 — Cindy Rosana Alvarez Lopez
  "dioly rosana alvarez lopez":       "Cindy Rosana Alvarez Lopez",
  // Row 13 — Erick Ronaldo Hernandez Martinez
  "fredy ronaldo hernandez martinez": "Erick Ronaldo Hernandez Martinez",
  "elmer ronaldo hernandez martinez": "Erick Ronaldo Hernandez Martinez",
  // Row 14 — Erica Yanira Alvarez Lopez
  "erica yaned miranda lopez":        "Erica Yanira Alvarez Lopez",
  // Row 16 — Axel Amildo Alvarez Morales
  "axel arnulfo morales morales":     "Axel Amildo Alvarez Morales",
  // Row 18 — Dixon Rene Hernandez Martinez
  "diory rene hernandez martinez":    "Dixon Rene Hernandez Martinez",
  "elmer rene hernandez martinez":    "Dixon Rene Hernandez Martinez",
  // Row 7 — German Nolberto Solano Marroquin
  "german nehemis solano marroquin":  "German Nolberto Solano Marroquin",
  // Row 32 — Oliver Gerardo Aguilar Sanchez
  "oliver gerardo perez sanchez":     "Oliver Gerardo Aguilar Sanchez",
  "olivar gerardo aguilar sanchez":   "Oliver Gerardo Aguilar Sanchez",
  "oliver gerardo yoc sanchez":       "Oliver Gerardo Aguilar Sanchez",
  // Row 19 — Jose Alexander Navas Martinez (case normalization)
  "jose alexander navas martinez":    "Jose Alexander Navas Martinez",
  // Row 31 — Maria Floridalma (missed variant)
  "maria floridama alvarez morales":  "Maria Floridalma Alvarez Morales",
  // Row 35 — Maria Marleni Marroquin Salazar
  "rolando marfrlin marroquin salazar": "Maria Marleni Marroquin Salazar",
};

function correctWorkerName(raw: string): string {
  const key = normalize(raw);
  return NAME_CORRECTIONS[key] ?? raw;
}

// ── Lote aliases — maps known planilla values to DB slugs ─────────────────────
// Keys are normalized (lowercase, accent-stripped).
const LOTE_SLUG_ALIASES: Record<string, string> = {
  "canoa":          "canoa-1",
  "cruz 2":         "cruz2",
  "cruz2":          "cruz2",
  "cruz 1":         "cruz-1",
  "cruz1":          "cruz-1",
  "san emilia":     "san-emiliano-cruz",
  "san emiliano":   "san-emiliano-cruz",
  "canada":         "canada",
  "cañada":         "canada",
  "arenera":        "arenera",
  "arener":         "arenera",
  "arener rp":      "arenera",
  "mirasol":        "mirasol",
  "corona":         "corona",
  "galera":         "galera",
  "vg1":            "vg1",
  "vg2":            "vg2",
};

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function resolveLoteSlug(raw: string): string | null {
  if (!raw || raw === "CP") return null;   // Caporal rows have no lote
  const n = normalize(raw);
  if (LOTE_SLUG_ALIASES[n]) return LOTE_SLUG_ALIASES[n];
  const noSpace = n.replace(/\s/g, "");
  if (LOTE_SLUG_ALIASES[noSpace]) return LOTE_SLUG_ALIASES[noSpace];
  return null;   // genuinely unknown — record will be inserted without lote
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  PLANILLA IMPORT — ${COMMIT ? "⚠  COMMIT MODE — writing to DB" : "DRY RUN (read-only)"}`);
  console.log(`${"=".repeat(70)}\n`);

  // 1. Fetch reference data
  const [dbWorkers, dbActivities, dbLotes, dbPeriods] = await Promise.all([
    prisma.worker.findMany({ where: { isActive: true }, select: { id: true, fullName: true } }),
    prisma.activity.findMany({ where: { isActive: true }, select: { id: true, name: true, defaultPrice: true } }),
    prisma.lote.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true } }),
    prisma.payPeriod.findMany({ where: { isClosed: false }, select: { id: true, periodNumber: true, startDate: true, endDate: true, agriculturalYear: true }, orderBy: { startDate: "asc" } }),
  ]);

  const activityByName = new Map(dbActivities.map((a) => [normalize(a.name), a]));
  const loteBySlug = new Map(dbLotes.map((l) => [l.slug, l]));

  function findPeriod(dateStr: string) {
    return dbPeriods.find((p) =>
      dateStr >= p.startDate.toISOString().split("T")[0] &&
      dateStr <= p.endDate.toISOString().split("T")[0],
    ) ?? null;
  }

  // 2. Collect image files
  const imageFiles = fs.readdirSync(IMAGES_DIR)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort();

  console.log(`Found ${imageFiles.length} image(s): ${imageFiles.join(", ")}\n`);

  // 3. Extract from all images (or load from cache for stable, deterministic runs)
  type RawEntry = {
    file: string;
    workerName: string;
    date: string;
    loteRaw: string;
    activityRaw: string;
    units: number;
  };

  const rawEntries: RawEntry[] = [];
  const extractionNotes: string[] = [];

  const cacheExists = fs.existsSync(CACHE_FILE);
  let cachedImages: CachedImage[] | null = null;
  if (cacheExists && !FRESH) {
    cachedImages = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as CachedImage[];
    console.log(`Using cached extraction (${CACHE_FILE}). Pass --fresh to re-extract.\n`);
  }

  const freshImages: CachedImage[] = [];

  for (const file of imageFiles) {
    let imageData: CachedImage;

    if (cachedImages) {
      const cached = cachedImages.find((c) => c.file === file);
      if (!cached) {
        console.warn(`  WARNING: no cache entry for ${file}, skipping`);
        continue;
      }
      imageData = cached;
      const entryCount = cached.rows.reduce((s, r) => s + r.entries.length, 0);
      console.log(`  [cache] ${file}: ${cached.rows.length} workers, ${entryCount} entries, range: ${cached.dateRange.start} – ${cached.dateRange.end}`);
    } else {
      const imgPath = path.join(IMAGES_DIR, file);
      const ext = path.extname(file).toLowerCase();
      const mediaType =
        ext === ".png" ? "image/png" :
        ext === ".webp" ? "image/webp" : "image/jpeg";

      process.stdout.write(`  Extracting ${file} ... `);
      const base64 = fs.readFileSync(imgPath).toString("base64");

      let result;
      try {
        result = await extractPlanillaData(base64, mediaType);
      } catch (e) {
        console.error(`FAILED: ${e instanceof Error ? e.message : e}`);
        continue;
      }

      const entryCount = result.rows.reduce((s, r) => s + r.entries.length, 0);
      console.log(`OK  (${result.rows.length} workers, ${entryCount} entries, range: ${result.dateRange.start} – ${result.dateRange.end}, confidence: ${result.confidence})`);

      imageData = {
        file,
        rows: result.rows.map((r) => ({
          workerName: r.workerName,
          entries: r.entries.map((e) => ({ date: e.date, lote: e.lote, activity: e.activity, units: e.units })),
        })),
        dateRange: result.dateRange,
        confidence: result.confidence,
        notes: result.notes,
      };
      if (result.notes) extractionNotes.push(`${file}: ${result.notes}`);
      freshImages.push(imageData);
    }

    for (const row of imageData.rows) {
      const canonicalName = correctWorkerName(row.workerName);
      for (const entry of row.entries) {
        rawEntries.push({
          file,
          workerName: canonicalName,
          date: entry.date,
          loteRaw: entry.lote,
          activityRaw: entry.activity,
          units: entry.units,
        });
      }
    }
  }

  // Save fresh extraction to cache so future runs are deterministic
  if (!cachedImages && freshImages.length > 0) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(freshImages, null, 2));
    console.log(`\nExtraction cached to ${CACHE_FILE} (future runs will use this unless --fresh is passed).`);
  }

  console.log(`\nTotal raw entries: ${rawEntries.length}\n`);
  if (extractionNotes.length) {
    console.log("Extraction notes:");
    extractionNotes.forEach((n) => console.log(`  ${n}`));
    console.log();
  }

  // 4. Match workers
  const uniqueNames = [...new Set(rawEntries.map((e) => e.workerName))];
  const workerMatches = matchAllWorkers(uniqueNames, dbWorkers);

  const unmatchedNames = uniqueNames.filter((n) => !workerMatches[n]?.exactMatch);
  const matchedNames   = uniqueNames.filter((n) =>  workerMatches[n]?.exactMatch);

  console.log(`Worker matching: ${matchedNames.length} matched, ${unmatchedNames.length} unmatched`);
  if (unmatchedNames.length) {
    console.log("  Unmatched (will be created as new workers):");
    unmatchedNames.forEach((n) => console.log(`    + ${n}`));
  }
  console.log();

  // 5. Create new workers (commit) or simulate (dry-run)
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
      console.log("  (dry-run: workers would be created on --commit)");
    }
    console.log();
  }

  // 6. Resolve all IDs and build candidate records
  type Candidate = {
    file: string;
    workerName: string;
    workerId: string | null;
    date: string;
    loteId: string | null;
    loteRaw: string;
    activityId: string | null;
    activityName: string;
    unitPrice: number;
    units: number;
    payPeriodId: string | null;
    skipReason: string | null;
  };

  // Unresolved tracking
  const unresolvedActivities = new Set<string>();
  const unresolvedLotes      = new Set<string>();
  const missingPeriods        = new Set<string>();

  const candidates: Candidate[] = rawEntries.map((e, i) => {
    // Worker
    const matchResult = workerMatches[e.workerName];
    const matchedWorker = matchResult?.exactMatch ?? createdWorkers.get(e.workerName) ?? null;
    const workerId = matchedWorker?.id ?? null;

    // Activity
    const canonicalName = resolveAbbrToName(e.activityRaw);
    const act = activityByName.get(normalize(canonicalName));
    if (!act) unresolvedActivities.add(e.activityRaw);
    const activityId = act?.id ?? null;
    const unitPrice = act?.defaultPrice ? Number(act.defaultPrice) : 0;

    // Lote
    const slug = resolveLoteSlug(e.loteRaw);
    const lote = slug ? (loteBySlug.get(slug) ?? null) : null;
    if (e.loteRaw && !lote && e.loteRaw !== "CP") unresolvedLotes.add(e.loteRaw);
    const loteId = lote?.id ?? null;

    // Period
    const period = findPeriod(e.date);
    if (!period) missingPeriods.add(e.date);

    // Skip reason
    let skipReason: string | null = null;
    if (!workerId)    skipReason = `no worker ID (dry-run — would be created)`;
    if (!activityId)  skipReason = `activity "${e.activityRaw}" not found in DB`;
    if (!period)      skipReason = `no open pay period for ${e.date}`;

    return {
      file: e.file,
      workerName: e.workerName,
      workerId,
      date: e.date,
      loteRaw: e.loteRaw,
      loteId,
      activityId,
      activityName: canonicalName,
      unitPrice,
      units: e.units,
      payPeriodId: period?.id ?? null,
      skipReason,
    };
  });

  // 7. Deduplication: check which (date, workerId) pairs already exist
  const datesWithWorkers = candidates
    .filter((c) => c.workerId && c.date)
    .map((c) => c.date);
  const uniqueDates = [...new Set(datesWithWorkers)];

  const existingRecords = await prisma.activityRecord.findMany({
    where: { date: { in: uniqueDates.map((d) => new Date(d)) } },
    select: { date: true, workerId: true },
  });
  const existingKeySet = new Set(
    existingRecords.map((r) => `${r.date.toISOString().split("T")[0]}|${r.workerId}`),
  );

  let duplicateCount = 0;
  const toInsert = candidates.filter((c, i) => {
    if (c.skipReason) return false;
    const key = `${c.date}|${c.workerId}`;
    if (existingKeySet.has(key)) { duplicateCount++; return false; }
    return true;
  });

  // 8. Summary
  const skipped     = candidates.filter((c) => c.skipReason);
  const noActivity  = skipped.filter((c) => c.skipReason?.includes("activity"));
  const noPeriod    = skipped.filter((c) => c.skipReason?.includes("period"));
  const noWorker    = COMMIT ? [] : skipped.filter((c) => c.skipReason?.includes("worker"));

  console.log("─".repeat(70));
  console.log("SUMMARY");
  console.log("─".repeat(70));
  console.log(`  Total raw entries:     ${rawEntries.length}`);
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

  // 9. Per-image breakdown
  const byFile = new Map<string, typeof toInsert>();
  for (const r of toInsert) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file)!.push(r);
  }
  for (const [file, recs] of byFile) {
    const workers = [...new Set(recs.map((r) => r.workerName))];
    const dates   = [...new Set(recs.map((r) => r.date))].sort();
    console.log(`  ${file}:`);
    console.log(`    ${recs.length} records · ${workers.length} workers · dates ${dates[0]} – ${dates[dates.length-1]}`);
  }
  console.log();

  if (!COMMIT) {
    console.log("─".repeat(70));
    console.log("DRY RUN complete. Re-run with --commit to write to the database.");
    console.log("─".repeat(70));
    return;
  }

  // 10. Insert
  console.log("─".repeat(70));
  console.log("Inserting records...");

  const rows = toInsert.map((c, i) => ({
    date: new Date(c.date),
    payPeriodId: c.payPeriodId!,
    workerId: c.workerId!,
    activityId: c.activityId!,
    loteId: c.loteId,
    quantity: c.units,
    unitPrice: c.unitPrice,
    totalEarned: Math.round(c.units * c.unitPrice * 100) / 100,
    clientId: `planilla-import-${c.date}-${c.workerId}-${c.activityId}-${i}`,
    syncedAt: new Date(),
  }));

  const result = await prisma.activityRecord.createMany({
    data: rows,
    skipDuplicates: true,
  });

  console.log(`\n✓ Inserted ${result.count} records.`);
  if (unmatchedNames.length) {
    console.log(`✓ Created ${unmatchedNames.length} new worker(s): ${unmatchedNames.join(", ")}`);
  }
  console.log();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
