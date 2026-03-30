// =============================================================================
// prisma/seed-marzo.ts — Import March 14-31 planilla data from CSV
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// CSV data: worker rows with daily values
const CSV_ROWS = [
  { num: 1,  name: "Jildaverto Solano", values: ["mg","","mg","mg","mg","mg","mg","","","mg","mg","mg","mg","mg","","","",""] },
  { num: 2,  name: "Henri Randolfo",    values: ["B","*","B","B","B","B","B","*","","B","B","B","B","B","","","",""] },
  { num: 3,  name: "Carmelo",           values: ["X","","45","X","125","125","130","100","","140","160","150","125","","","","",""] },
  { num: 4,  name: "Luz de Maria",      values: ["X","","50","115","125","125","125","85","","145","165","150","125","","","","",""] },
  { num: 5,  name: "Jaime Anibal",      values: ["50","","50","X","X","105","105","135","","135","155","150","140","","","","",""] },
  { num: 6,  name: "Leidy Susana",      values: ["X","","50","110","115","130","105","80","","120","130","105","90","","","","",""] },
  { num: 7,  name: "Enma Perez",        values: ["X","","50","170","200","130","160","130","","150","195","145","130","","","","",""] },
  { num: 8,  name: "Edgar Rolando",     values: ["mg/Poda","","mg","Horno","mg","mg","mg","Poda","","Poda/Canoa","mg/Poda","Poda/Canoa","260","","","","",""] },
  { num: 9,  name: "Zuleyma",           values: ["40","","25","105","100","75","80","","","110","110","125","110","","","","",""] },
  { num: 10, name: "Fernando Guamuch",  values: ["X","","50","145","110","140","110","95","","125","165","140","130","","","","",""] },
  { num: 11, name: "German Solano",     values: ["80","","50","160","150","125","155","130","","150","190","140","130","","","","",""] },
  { num: 12, name: "Carlos Garcia",     values: ["65","","X","X","85","95","90","100","","105","150","160","110","","","","",""] },
  { num: 13, name: "Julia",             values: ["65","","40","X","90","100","90","100","","105","150","165","110","","","","",""] },
  { num: 14, name: "Baldomero Solano",  values: ["70","","50","110","115","130","105","75","","120","130","105","90","","","","",""] },
  { num: 15, name: "Adister",           values: ["Poda/Cruz","V","","Poda/Cruz","X","Poda/Cruz","Poda","Poda/Cruz","","Poda/Cruz","Poda/galera","Poda/galera","Poda/galera","Poda/galera","Poda","","",""] },
  { num: 16, name: "Oliver Aguilar",    values: ["X","","55","160","120","X","120","130","","120","155","100","150","mg","","","",""] },
  { num: 17, name: "Elmer Alexander",   values: ["B","*","B","B","B","B","B","B","*","B","B","B","B","B","","","",""] },
  { num: 18, name: "Iris Perez",        values: ["X","","60","200","185","180","135","X","","X","X","","","","","","",""] },
  { num: 19, name: "Jonathan",          values: ["B","*","B","B","Horno","Horno","Horno","Horno","","Horno","105","110","135","","","","",""] },
  { num: 20, name: "Axel Alvarez",      values: ["Poda/Cruz","","Poda/Cruz","X","Poda/Cruz","Poda","Poda","Poda/Cruz","","Poda/Cruz","Poda/galera","Poda/galera","Poda/galera","Poda/galera","","","",""] },
  { num: 21, name: "Maria Marleni",     values: ["55","","50","X","105","70","100","105","","100","110","120","100","","","","",""] },
  { num: 22, name: "Jorge Odilio",      values: ["115","","50","145","255","115","60","135","","165","205","195","220","","","","",""] },
  { num: 23, name: "Danilo",            values: ["55","","35","120","105","X","105","75","","110","100","100","100","","","","",""] },
  { num: 24, name: "Alicia Yanet",      values: ["mg","","mg","","mg","","mg","mg","","mg","mg","mg","mg","mg","","","",""] },
  { num: 25, name: "Keylin Yanet",      values: ["mg","","mg","","mg","mg","mg","mg","","mg","mg","mg","mg","mg","","","",""] },
  { num: 26, name: "Jorge Marroquin",   values: ["","","","","mg/Canoa","mg/Poda","mg","Poda","Poda","","Poda/Canoa","160","150","120","","","",""] },
  { num: 27, name: "Francisco Navas",   values: ["","","","","","Horno","Horno","Horno","","Horno","110","110","100","mg","","","",""] },
  { num: 28, name: "Alexander Navas",   values: ["","","","","","","","","","","Poda/Canoa","160","180","195","","","",""] },
  { num: 29, name: "Dixon Hernandez",   values: ["","","","","","","","","","260","345","270","330","","","","",""] },
  { num: 30, name: "Telmo Hernandez",   values: ["","","","","","","","","","245","365","265","","","","","",""] },
  { num: 31, name: "Floridalma",        values: ["","","","","","","","","","","175","120","95","","","","",""] },
  { num: 32, name: "Wuilfido",          values: ["","","","","","","","","","","","","","175","","","",""] },
];

// Dates: March 14-31
const DATES = [14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31];

// Worker name mapping: CSV name → DB canonical name
const WORKER_MAP: Record<string, string> = {
  "Jildaverto Solano": "GILDABERTO SOLANO",
  "Henri Randolfo": "HENRY RANDOLFO HERNANDEZ",
  "Carmelo": "CARMELO GUAMUCH",
  "Luz de Maria": "LUZ DE MARIA MARTINEZ",
  "Jaime Anibal": "JAIME ANIBAL MARROQUIN",
  "Leidy Susana": "LEIDY SUSANA",
  "Enma Perez": "ENMA PEREZ",
  "Edgar Rolando": "EDGAR ROLANDO NAVAS",
  "Zuleyma": "SULEIMA MARROQUIN",
  "Fernando Guamuch": "FERNANDO GUAMUCH",
  "German Solano": "GERMAN SOLANO",
  "Carlos Garcia": "CARLOS GARCIA",
  "Julia": "JULIA MARROQUIN",
  "Baldomero Solano": "BALDOMERO SOLANO",
  "Adister": "ADISTER ARCENIO",
  "Oliver Aguilar": "OLIVER AGUILAR",
  "Elmer Alexander": "ELMER MANUEL HERNANDEZ",
  "Iris Perez": "IRIS PEREZ",
  "Jonathan": "JONATHAN AGUILAR",
  "Axel Alvarez": "AXEL ALVAREZ",
  "Maria Marleni": "MARLENI SALAZAR",
  "Jorge Odilio": "JORGE ODILIO SOLANO",
  "Danilo": "DANILO SOLANO",
  "Alicia Yanet": "ALICIA YANET",
  "Keylin Yanet": "KEYLIN YANET",
  "Jorge Marroquin": "JORGE MARROQUIN",
  "Francisco Navas": "FRANCISCO NAVAS",
  "Alexander Navas": "ALEXANDER NAVAS",
  "Dixon Hernandez": "DIXON HERNANDEZ",
  "Telmo Hernandez": "TELMO HERNANDEZ",
  "Floridalma": "FLORIDALMA",
  "Wuilfido": "WUILFIDO",
};

// Lote slug mapping
const LOTE_SLUGS: Record<string, string> = {
  "Cruz": "cruz2",
  "Canoa": "canoa-1",
  "galera": "galera",
};

// Value interpretation
type ParsedCell = {
  activity: string;
  quantity: number;
  unitPrice: number;
  loteSlug: string | null;
} | null;

function parseCell(val: string): ParsedCell {
  const v = val.trim();
  if (!v || v === "X" || v === "*" || v === "V") return null;

  // "B" = Beneficio
  if (v === "B") return { activity: "Beneficio", quantity: 1, unitPrice: 100, loteSlug: null };

  // "mg" = Caporal (general daily maintenance)
  if (v === "mg") return { activity: "Caporal", quantity: 1, unitPrice: 100, loteSlug: null };

  // "Horno" = Beneficio (oven/drying work at beneficio)
  if (v === "Horno") return { activity: "Beneficio", quantity: 1, unitPrice: 100, loteSlug: null };

  // "mg/Poda" = Poda (Mantenimiento General Poda)
  if (v === "mg/Poda") return { activity: "Poda", quantity: 1, unitPrice: 110, loteSlug: null };

  // "mg/Canoa" = Caporal at Canoa
  if (v === "mg/Canoa") return { activity: "Caporal", quantity: 1, unitPrice: 100, loteSlug: "canoa-1" };

  // "Poda/Cruz" = Poda at Cruz 2
  if (v === "Poda/Cruz") return { activity: "Poda", quantity: 1, unitPrice: 110, loteSlug: "cruz2" };

  // "Poda/Canoa" = Poda at Canoa
  if (v === "Poda/Canoa") return { activity: "Poda", quantity: 1, unitPrice: 110, loteSlug: "canoa-1" };

  // "Poda/galera" = Poda at Galera
  if (v === "Poda/galera") return { activity: "Poda", quantity: 1, unitPrice: 110, loteSlug: "galera" };

  // "Poda" alone
  if (v === "Poda") return { activity: "Poda", quantity: 1, unitPrice: 110, loteSlug: null };

  // Numeric = Libras of coffee (Corte de Café)
  const num = parseInt(v, 10);
  if (!isNaN(num) && num > 0) {
    const qq = num / 100; // Convert libras to quintales
    return { activity: "Corte de Café", quantity: qq, unitPrice: 70, loteSlug: null };
  }

  console.warn(`  ⚠ Unknown cell value: "${v}"`);
  return null;
}

// Week assignment: which pay period week does a March date belong to?
function getWeekNumber(day: number): number {
  if (day <= 15) return 11;
  if (day <= 22) return 12;
  if (day <= 29) return 13;
  return 14;
}

async function main() {
  console.log("📋 Importing March 14-31 planilla data...\n");

  // 1. Ensure all workers exist
  console.log("👷 Ensuring workers exist...");
  const workerIdMap: Record<string, string> = {};
  for (const [csvName, canonName] of Object.entries(WORKER_MAP)) {
    let worker = await prisma.worker.findFirst({ where: { fullName: canonName } });
    if (!worker) {
      worker = await prisma.worker.create({ data: { fullName: canonName } });
      console.log(`   + Created worker: ${canonName}`);
    }
    workerIdMap[csvName] = worker.id;

    // Save to dictionary for future OCR
    await prisma.notebookDictionary.upsert({
      where: { category_handwritten: { category: "worker", handwritten: csvName.toLowerCase() } },
      update: { canonical: canonName, referenceId: worker.id },
      create: { category: "worker", handwritten: csvName.toLowerCase(), canonical: canonName, referenceId: worker.id },
    });
  }
  console.log(`   ✓ ${Object.keys(workerIdMap).length} workers ready\n`);

  // 2. Get activity IDs
  console.log("🔧 Loading activities...");
  const activityIdMap: Record<string, string> = {};
  const activities = await prisma.activity.findMany();
  for (const a of activities) {
    activityIdMap[a.name] = a.id;
  }
  console.log(`   ✓ ${activities.length} activities loaded\n`);

  // 3. Get lote IDs
  console.log("📍 Loading lotes...");
  const loteIdMap: Record<string, string> = {};
  const lotes = await prisma.lote.findMany();
  for (const l of lotes) {
    loteIdMap[l.slug] = l.id;
  }
  console.log(`   ✓ ${lotes.length} lotes loaded\n`);

  // 4. Create pay periods for weeks 11-14
  console.log("📅 Ensuring pay periods...");
  const periodIdMap: Record<number, string> = {};
  const weekRanges: Record<number, { start: string; end: string }> = {
    11: { start: "2026-03-09", end: "2026-03-15" },
    12: { start: "2026-03-16", end: "2026-03-22" },
    13: { start: "2026-03-23", end: "2026-03-29" },
    14: { start: "2026-03-30", end: "2026-04-05" },
  };

  for (const [weekStr, range] of Object.entries(weekRanges)) {
    const week = parseInt(weekStr, 10);
    const period = await prisma.payPeriod.upsert({
      where: { agriculturalYear_periodNumber_type: { agriculturalYear: "2526", periodNumber: week, type: "SEMANAL" } },
      update: {},
      create: {
        type: "SEMANAL",
        periodNumber: week,
        agriculturalYear: "2526",
        startDate: new Date(range.start),
        endDate: new Date(range.end),
      },
    });
    periodIdMap[week] = period.id;
  }
  console.log(`   ✓ 4 pay periods ready (weeks 11-14)\n`);

  // 5. Save abbreviation dictionary entries
  console.log("📖 Saving dictionary entries...");
  const abbreviations = [
    { handwritten: "b", canonical: "Beneficio" },
    { handwritten: "x", canonical: "Ausente" },
    { handwritten: "mg", canonical: "Caporal" },
    { handwritten: "mg/poda", canonical: "Mantenimiento General Poda" },
    { handwritten: "poda/cruz", canonical: "Poda Cruz 2" },
    { handwritten: "poda/canoa", canonical: "Poda Canoa 1" },
    { handwritten: "poda/galera", canonical: "Poda Galera" },
    { handwritten: "horno", canonical: "Beneficio" },
    { handwritten: "mg/canoa", canonical: "Caporal Canoa 1" },
  ];
  for (const a of abbreviations) {
    await prisma.notebookDictionary.upsert({
      where: { category_handwritten: { category: "abbreviation", handwritten: a.handwritten } },
      update: { canonical: a.canonical },
      create: { category: "abbreviation", handwritten: a.handwritten, canonical: a.canonical },
    });
  }
  console.log(`   ✓ ${abbreviations.length} abbreviations saved\n`);

  // 6. Insert activity records
  console.log("📋 Inserting activity records...");
  let inserted = 0;
  let skipped = 0;

  for (const row of CSV_ROWS) {
    const workerId = workerIdMap[row.name];
    if (!workerId) {
      console.warn(`  ⚠ No worker ID for: ${row.name}`);
      continue;
    }

    for (let i = 0; i < DATES.length; i++) {
      const day = DATES[i];
      const val = row.values[i];
      const parsed = parseCell(val);
      if (!parsed) continue;

      const activityId = activityIdMap[parsed.activity];
      if (!activityId) {
        console.warn(`  ⚠ Activity not found: "${parsed.activity}" for ${row.name} on Mar ${day}`);
        skipped++;
        continue;
      }

      const loteId = parsed.loteSlug ? loteIdMap[parsed.loteSlug] || null : null;
      const weekNum = getWeekNumber(day);
      const periodId = periodIdMap[weekNum];
      const dateStr = `2026-03-${String(day).padStart(2, "0")}`;
      const totalEarned = Math.round(parsed.quantity * parsed.unitPrice * 100) / 100;

      const clientId = `marzo-${dateStr}-${workerId}-${activityId}-${parsed.quantity}`;

      const existing = await prisma.activityRecord.findUnique({ where: { clientId } });
      if (existing) {
        skipped++;
        continue;
      }

      await prisma.activityRecord.create({
        data: {
          date: new Date(dateStr),
          payPeriodId: periodId,
          workerId,
          activityId,
          loteId,
          quantity: parsed.quantity,
          unitPrice: parsed.unitPrice,
          totalEarned,
          clientId,
          syncedAt: new Date(),
        },
      });
      inserted++;
    }
  }

  console.log(`   ✓ ${inserted} records inserted (${skipped} skipped)\n`);
  console.log("✅ March planilla import complete.");
}

main()
  .catch((e) => {
    console.error("❌ Import failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
