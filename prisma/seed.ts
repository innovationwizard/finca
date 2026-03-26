// =============================================================================
// prisma/seed.ts — Seed with ALL real data from Finca Danilandia Excels
// =============================================================================
// Sources:
//   - ACTIVIDADES_EDUARDO_Z_-_FCA_DANILANDIA.xlsx (GENERAL sheet)
//   - Planilla_Finca_Cafe_Semanal_CON_Lotes_feb-marz.xlsx (all sheets)
//   - Ingresos_de_Cafe__por_Corte__2025_2026_acumulado_maduro.xlsx (all sheets)
// =============================================================================

import { PrismaClient, ActivityUnit } from "@prisma/client";
import seedData from "./seed-data.json";

const prisma = new PrismaClient();

// Normalize activity names from Excel (case variations)
function normalizeActivity(name: string): string {
  const map: Record<string, string> = {
    "encargado beneficio": "Encargado Beneficio",
    "Encargado beneficio": "Encargado Beneficio",
    "repaso poda": "Repaso Poda",
    "Repaso poda": "Repaso Poda",
    "Muestreo de suelos": "Muestreo de Suelos",
  };
  return map[name] || name;
}

// Normalize lote names from Excel to match seed slugs
function normalizeLote(name: string): string | null {
  const map: Record<string, string> = {
    "Canoa": "canoa-1",
    "canoa": "canoa-1",
    "Cruz 1": "cruz-1",
    "Cruz 2": "cruz2",
    "Mirasol": "mirasol",
    "Vuelta Grande": "vg1",
    "General": null as unknown as string,
    "beneficio": null as unknown as string,
  };
  if (name in map) return map[name];
  // Try slug-ifying
  return name.toLowerCase().replace(/\s+/g, "-");
}

// Map pante/lote names from Ingresos Excel to lote slugs
function panteToLoteSlug(pante: string): string | null {
  const map: Record<string, string> = {
    "Cañada": "canada",
    "Canoa": "canoa-1",
    "Canoa 1": "canoa-1",
    "Cruz 1": "cruz-1",
    "Cruz1": "cruz-1",
    "Cruz 2": "cruz2",
    "Cruz2": "cruz2",
    "Mirasol": "mirasol",
    "Corona": "corona",
    "Arenera": "arenera",
    "Galera": "galera",
    "San Emiliano": "san-emiliano-cruz",
    "VG1": "vg1",
    "VG2": "vg2",
    "Vuelta Grande": "vg1",
  };
  if (!pante) return null;
  return map[pante.trim()] || null;
}

// Map coffee type string to enum
function coffeeTypeEnum(t: string): "CEREZA" | "PERGAMINO" | "ORO" {
  const upper = t.toUpperCase();
  if (upper.includes("PERGAMINO")) return "PERGAMINO";
  if (upper.includes("ORO")) return "ORO";
  return "CEREZA";
}

async function main() {
  console.log("🌱 Seeding Finca Danilandia database...\n");

  // =========================================================================
  // LOTES
  // =========================================================================
  const lotesData = [
    { name: "VG1",               slug: "vg1",               areaManzanas: 10,   plantCount: 35000, density: "3888 pl/mz", sortOrder: 1  },
    { name: "VG2",               slug: "vg2",               areaManzanas: 5,    plantCount: 17500, density: "3500 pl/mz", sortOrder: 2  },
    { name: "CRUZ2",             slug: "cruz2",              areaManzanas: 12,   plantCount: 57737, density: null,         sortOrder: 3  },
    { name: "CRUZ 1",            slug: "cruz-1",             areaManzanas: 14,   plantCount: 64392, density: null,         sortOrder: 4  },
    { name: "MIRASOL",           slug: "mirasol",            areaManzanas: 7,    plantCount: 24318, density: null,         sortOrder: 5  },
    { name: "CANOA 1",           slug: "canoa-1",            areaManzanas: null,  plantCount: 67116, density: null,         sortOrder: 6  },
    { name: "CANOA 2",           slug: "canoa-2",            areaManzanas: null,  plantCount: null,  density: null,         sortOrder: 7  },
    { name: "CAÑADA",            slug: "canada",             areaManzanas: null,  plantCount: null,  density: null,         sortOrder: 8  },
    { name: "CORONA",            slug: "corona",             areaManzanas: null,  plantCount: null,  density: null,         sortOrder: 9  },
    { name: "ARENERA",           slug: "arenera",            areaManzanas: null,  plantCount: null,  density: null,         sortOrder: 10 },
    { name: "GALERA",            slug: "galera",             areaManzanas: null,  plantCount: null,  density: null,         sortOrder: 11 },
    { name: "SAN EMILIANO CRUZ", slug: "san-emiliano-cruz",  areaManzanas: null,  plantCount: null,  density: null,         sortOrder: 12 },
  ];

  console.log("📍 Seeding lotes...");
  const loteMap: Record<string, string> = {};
  for (const lote of lotesData) {
    const row = await prisma.lote.upsert({
      where: { slug: lote.slug },
      update: { areaManzanas: lote.areaManzanas, plantCount: lote.plantCount, density: lote.density, sortOrder: lote.sortOrder },
      create: lote,
    });
    loteMap[lote.slug] = row.id;
  }
  console.log(`   ✓ ${lotesData.length} lotes\n`);

  // =========================================================================
  // ACTIVITIES
  // =========================================================================
  const activitiesData = [
    { name: "Corte de Café",       unit: ActivityUnit.QUINTAL,  defaultPrice: 70,  isHarvest: true,  isBeneficio: false, sortOrder: 1  },
    { name: "Pepena",              unit: ActivityUnit.QUINTAL,  defaultPrice: 0,   isHarvest: true,  isBeneficio: false, sortOrder: 2  },
    { name: "Fertilización",       unit: ActivityUnit.HECTAREA, defaultPrice: 150, isHarvest: false, isBeneficio: false, sortOrder: 3  },
    { name: "Limpia Manual",       unit: ActivityUnit.JORNAL,   defaultPrice: 50,  isHarvest: false, isBeneficio: false, sortOrder: 4  },
    { name: "Poda",                unit: ActivityUnit.MANZANA,  defaultPrice: 110, isHarvest: false, isBeneficio: false, sortOrder: 5  },
    { name: "Caporal",             unit: ActivityUnit.DIA,      defaultPrice: 100, isHarvest: false, isBeneficio: false, sortOrder: 6  },
    { name: "Beneficio",           unit: ActivityUnit.DIA,      defaultPrice: 100, isHarvest: false, isBeneficio: true,  sortOrder: 7  },
    { name: "Encargado Beneficio", unit: ActivityUnit.DIA,      defaultPrice: 130, isHarvest: false, isBeneficio: true,  sortOrder: 8  },
    { name: "Muestreo de Suelos",  unit: ActivityUnit.DIA,      defaultPrice: 75,  isHarvest: false, isBeneficio: false, sortOrder: 9  },
    { name: "Repaso Poda",         unit: ActivityUnit.MANZANA,  defaultPrice: 100, isHarvest: false, isBeneficio: false, sortOrder: 10 },
    { name: "Deshije",                             unit: ActivityUnit.DIA, defaultPrice: null, isHarvest: false, isBeneficio: false, sortOrder: 11 },
    { name: "Manejo de Sombra",                    unit: ActivityUnit.DIA, defaultPrice: null, isHarvest: false, isBeneficio: false, sortOrder: 12 },
    { name: "Chapea y Desbejucar",                 unit: ActivityUnit.DIA, defaultPrice: null, isHarvest: false, isBeneficio: false, sortOrder: 13 },
    { name: "Herbicida",                           unit: ActivityUnit.DIA, defaultPrice: null, isHarvest: false, isBeneficio: false, sortOrder: 14 },
    { name: "Monitoreo de Plagas y Enfermedades",  unit: ActivityUnit.DIA, defaultPrice: null, isHarvest: false, isBeneficio: false, sortOrder: 15 },
    { name: "Control Roya",                        unit: ActivityUnit.DIA, defaultPrice: null, isHarvest: false, isBeneficio: false, sortOrder: 16 },
    { name: "Análisis de Suelos y Foliar",         unit: ActivityUnit.DIA, defaultPrice: null, isHarvest: false, isBeneficio: false, sortOrder: 17 },
    { name: "Fertilización Foliar",                unit: ActivityUnit.DIA, defaultPrice: null, isHarvest: false, isBeneficio: false, sortOrder: 18 },
    { name: "Enmiendas",                           unit: ActivityUnit.DIA, defaultPrice: null, isHarvest: false, isBeneficio: false, sortOrder: 19 },
  ];

  console.log("🔧 Seeding activities...");
  const activityMap: Record<string, string> = {};
  for (const activity of activitiesData) {
    const row = await prisma.activity.upsert({
      where: { name: activity.name },
      update: { unit: activity.unit, defaultPrice: activity.defaultPrice, isHarvest: activity.isHarvest, isBeneficio: activity.isBeneficio, sortOrder: activity.sortOrder },
      create: activity,
    });
    activityMap[activity.name] = row.id;
  }
  console.log(`   ✓ ${activitiesData.length} activities\n`);

  // =========================================================================
  // SYSTEM SETTINGS
  // =========================================================================
  const settingsData = [
    { key: "pay_period_type", value: JSON.stringify("SEMANAL"), label: "Tipo de período de pago", group: "payroll" },
    { key: "agricultural_year_start_month", value: JSON.stringify(3), label: "Mes de inicio del año agrícola", group: "general" },
    { key: "production_target_qq_oro_per_mz", value: JSON.stringify(25), label: "Meta de producción (qq oro/mz)", group: "production" },
    { key: "average_price_per_lb", value: JSON.stringify(2.8), label: "Precio promedio por libra (GTQ)", group: "production" },
    { key: "rendimiento_alert_min", value: JSON.stringify(4.0), label: "Rendimiento mínimo antes de alerta", group: "alerts" },
    { key: "rendimiento_alert_max", value: JSON.stringify(7.0), label: "Rendimiento máximo antes de alerta", group: "alerts" },
    { key: "corte_max_qq_per_person_per_day", value: JSON.stringify(5.0), label: "Máximo qq corte por persona por día (alerta)", group: "alerts" },
    { key: "bonificacion_incentivo", value: JSON.stringify(250), label: "Bonificación incentivo legal (GTQ/mes)", group: "payroll" },
    { key: "currency", value: JSON.stringify("GTQ"), label: "Moneda", group: "general" },
  ] as const;

  console.log("⚙️  Seeding system settings...");
  for (const s of settingsData) {
    await prisma.systemSetting.upsert({ where: { key: s.key }, update: { value: s.value, label: s.label, group: s.group }, create: s });
  }
  console.log(`   ✓ ${settingsData.length} settings\n`);

  // =========================================================================
  // WORKERS — all 23 from Planilla Excel
  // =========================================================================
  const allWorkerNames = [
    ...new Set(seedData.records.map((r: { worker: string }) => r.worker)),
  ] as string[];

  console.log("👷 Seeding workers...");
  const workerMap: Record<string, string> = {};
  for (const name of allWorkerNames) {
    let worker = await prisma.worker.findFirst({ where: { fullName: name } });
    if (!worker) {
      worker = await prisma.worker.create({ data: { fullName: name } });
    }
    workerMap[name] = worker.id;
  }
  console.log(`   ✓ ${allWorkerNames.length} workers\n`);

  // =========================================================================
  // PAY PERIODS — weeks 7-10, year 2526 (Feb-Mar 2026)
  // =========================================================================
  const weeks = [...new Set(seedData.records.map((r: { week: number | null }) => r.week).filter(Boolean))] as number[];
  weeks.sort((a, b) => a - b);

  // Calculate date ranges per week from the actual data
  const weekDates: Record<number, { min: string; max: string }> = {};
  for (const r of seedData.records as Array<{ date: string; week: number | null }>) {
    if (!r.week) continue;
    if (!weekDates[r.week]) weekDates[r.week] = { min: r.date, max: r.date };
    if (r.date < weekDates[r.week].min) weekDates[r.week].min = r.date;
    if (r.date > weekDates[r.week].max) weekDates[r.week].max = r.date;
  }

  console.log("📅 Seeding pay periods...");
  const periodMap: Record<number, string> = {};
  for (const w of weeks) {
    const dates = weekDates[w];
    const period = await prisma.payPeriod.upsert({
      where: { agriculturalYear_periodNumber_type: { agriculturalYear: "2526", periodNumber: w, type: "SEMANAL" } },
      update: {},
      create: {
        type: "SEMANAL",
        periodNumber: w,
        agriculturalYear: "2526",
        startDate: new Date(dates.min),
        endDate: new Date(dates.max),
      },
    });
    periodMap[w] = period.id;
  }
  console.log(`   ✓ ${weeks.length} pay periods (weeks ${weeks.join(", ")})\n`);

  // =========================================================================
  // ACTIVITY RECORDS — 424 records from Planilla Registro_Actividades
  // =========================================================================
  console.log("📋 Seeding activity records...");
  let arCount = 0;
  let arSkipped = 0;

  for (const r of seedData.records as Array<{
    date: string; week: number | null; worker: string;
    activity: string | null; lote: string | null;
    quantity: number; unitPrice: number; totalEarned: number;
  }>) {
    if (!r.activity || !r.week) { arSkipped++; continue; }

    const activityName = normalizeActivity(r.activity);
    const activityId = activityMap[activityName];
    if (!activityId) { arSkipped++; continue; }

    const workerId = workerMap[r.worker];
    if (!workerId) { arSkipped++; continue; }

    const periodId = periodMap[r.week];
    if (!periodId) { arSkipped++; continue; }

    let loteId: string | null = null;
    if (r.lote) {
      const slug = normalizeLote(r.lote);
      if (slug && loteMap[slug]) loteId = loteMap[slug];
    }

    // Use a deterministic clientId to allow re-running seed without duplicates
    const clientId = `seed-ar-${r.date}-${r.worker}-${activityName}-${r.quantity}`.substring(0, 200);

    const existing = await prisma.activityRecord.findUnique({ where: { clientId } });
    if (!existing) {
      await prisma.activityRecord.create({
        data: {
          date: new Date(r.date),
          payPeriodId: periodId,
          workerId,
          activityId,
          loteId,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          totalEarned: r.totalEarned,
          clientId,
          syncedAt: new Date(),
        },
      });
      arCount++;
    } else {
      arSkipped++;
    }
  }
  console.log(`   ✓ ${arCount} activity records created (${arSkipped} skipped/duplicated)\n`);

  // =========================================================================
  // COFFEE INTAKES — 162 cosecha + 5 compra records
  // =========================================================================
  console.log("☕ Seeding coffee intakes...");
  let ciCount = 0;

  // Cosecha (own harvest)
  for (const r of seedData.intakes as Array<{
    date: string; type: string; code: string; bultos: number | null;
    pesoNetoQq: number; pesoPergaminoQq: number | null;
    rendimiento: number | null; pante: string | null; notes: string | null;
  }>) {
    const existing = await prisma.coffeeIntake.findUnique({ where: { code: r.code } });
    if (existing) continue;

    const loteSlug = panteToLoteSlug(r.pante || "");
    const loteId = loteSlug ? loteMap[loteSlug] || null : null;

    // Compute rendimiento if we have both weights
    let rendimiento = r.rendimiento;
    if (!rendimiento && r.pesoPergaminoQq && r.pesoPergaminoQq > 0 && r.pesoNetoQq > 0) {
      rendimiento = Math.round((r.pesoNetoQq / r.pesoPergaminoQq) * 100) / 100;
    }

    await prisma.coffeeIntake.create({
      data: {
        code: r.code,
        date: new Date(r.date),
        coffeeType: coffeeTypeEnum(r.type),
        source: "COSECHA",
        loteId,
        bultos: r.bultos,
        pesoNetoQq: r.pesoNetoQq,
        pesoPergaminoQq: r.pesoPergaminoQq,
        rendimiento,
        status: "RECIBIDO",
        notes: [r.pante, r.notes].filter(Boolean).join(" · ") || null,
        syncedAt: new Date(),
      },
    });
    ciCount++;
  }

  // Compra (purchased)
  for (const r of seedData.compras as Array<{
    date: string; type: string; code: string; bultos: number | null;
    pesoNetoQq: number; supplier: string | null; procedencia: string | null;
    notes: string | null; pricePerQq: number | null; paymentStatus: string | null;
  }>) {
    const existing = await prisma.coffeeIntake.findUnique({ where: { code: r.code } });
    if (existing) continue;

    await prisma.coffeeIntake.create({
      data: {
        code: r.code,
        date: new Date(r.date),
        coffeeType: coffeeTypeEnum(r.type),
        source: "COMPRA",
        supplierName: r.supplier,
        procedencia: r.procedencia,
        pricePerQq: r.pricePerQq,
        paymentStatus: r.paymentStatus,
        bultos: r.bultos,
        pesoNetoQq: r.pesoNetoQq,
        status: "RECIBIDO",
        notes: r.notes,
        syncedAt: new Date(),
      },
    });
    ciCount++;
  }
  console.log(`   ✓ ${ciCount} coffee intakes\n`);

  // =========================================================================
  // PRODUCTION ESTIMATES — from GENERAL sheet
  // =========================================================================
  // Real data: 2425 has FINAL values, 2627 has 1st estimate (lb/plant)
  const estimatesData = [
    // 2425 — historical (qq maduro/lote as qqMaduroPerLote)
    { year: "2425", lote: "vg1",      type: "FINAL" as const, lbPerPlant: 0, qqMad: 37,     qqOroMz: 0.617,  qqOro: 6.167 },
    { year: "2425", lote: "cruz2",     type: "FINAL" as const, lbPerPlant: 0, qqMad: 237,    qqOroMz: 3.292,  qqOro: 39.5 },
    { year: "2425", lote: "cruz-1",    type: "FINAL" as const, lbPerPlant: 0, qqMad: 501.3,  qqOroMz: 5.968,  qqOro: 83.55 },
    { year: "2425", lote: "mirasol",   type: "FINAL" as const, lbPerPlant: 0, qqMad: 227.55, qqOroMz: 5.418,  qqOro: 37.925 },
    { year: "2425", lote: "canoa-1",   type: "FINAL" as const, lbPerPlant: 0, qqMad: 253.83, qqOroMz: 2.350,  qqOro: 42.305 },
    { year: "2425", lote: "canada",    type: "FINAL" as const, lbPerPlant: 0, qqMad: 164.2,  qqOroMz: 2.105,  qqOro: 27.367 },
    { year: "2425", lote: "corona",    type: "FINAL" as const, lbPerPlant: 0, qqMad: 344.25, qqOroMz: 3.586,  qqOro: 57.375 },
    { year: "2425", lote: "arenera",   type: "FINAL" as const, lbPerPlant: 0, qqMad: 331.35, qqOroMz: 2.401,  qqOro: 55.225 },
    { year: "2425", lote: "san-emiliano-cruz", type: "FINAL" as const, lbPerPlant: 0, qqMad: 494.95, qqOroMz: 5.156, qqOro: 82.492 },

    // 2627 — first estimate (lb/plant from field sampling)
    { year: "2627", lote: "vg1",      type: "PRIMERA" as const, lbPerPlant: 1.33, qqMad: 465.5,    qqOroMz: 7.758,   qqOro: 77.583 },
    { year: "2627", lote: "vg2",      type: "PRIMERA" as const, lbPerPlant: 2.16, qqMad: 378,      qqOroMz: 12.6,    qqOro: 63 },
    { year: "2627", lote: "cruz2",     type: "PRIMERA" as const, lbPerPlant: 1.83, qqMad: 1056.587, qqOroMz: 14.675,  qqOro: 176.098 },
    { year: "2627", lote: "cruz-1",    type: "PRIMERA" as const, lbPerPlant: 1.83, qqMad: 1178.374, qqOroMz: 14.028,  qqOro: 196.396 },
    { year: "2627", lote: "mirasol",   type: "PRIMERA" as const, lbPerPlant: 2.5,  qqMad: 607.95,   qqOroMz: 14.475,  qqOro: 101.325 },
    { year: "2627", lote: "canoa-1",   type: "PRIMERA" as const, lbPerPlant: 1.83, qqMad: 1228.223, qqOroMz: 29.243,  qqOro: 204.704 },
    { year: "2627", lote: "canada",    type: "PRIMERA" as const, lbPerPlant: 1.83, qqMad: 1236.769, qqOroMz: 15.856,  qqOro: 206.128 },
    { year: "2627", lote: "corona",    type: "PRIMERA" as const, lbPerPlant: 2.8,  qqMad: 2051.644, qqOroMz: 21.371,  qqOro: 341.941 },
    { year: "2627", lote: "arenera",   type: "PRIMERA" as const, lbPerPlant: 2.8,  qqMad: 2661.148, qqOroMz: 19.284,  qqOro: 443.525 },
    { year: "2627", lote: "san-emiliano-cruz", type: "PRIMERA" as const, lbPerPlant: 2.0, qqMad: 820.74, qqOroMz: 8.549, qqOro: 136.79 },
    { year: "2627", lote: "galera",    type: "PRIMERA" as const, lbPerPlant: 1.83, qqMad: 621.614,  qqOroMz: 12.950,  qqOro: 103.602 },
  ];

  console.log("📊 Seeding production estimates...");
  let estCount = 0;
  for (const e of estimatesData) {
    const loteId = loteMap[e.lote];
    if (!loteId) continue;

    await prisma.productionEstimate.upsert({
      where: {
        agriculturalYear_loteId_estimateType: {
          agriculturalYear: e.year,
          loteId,
          estimateType: e.type,
        },
      },
      update: {
        lbPerPlant: e.lbPerPlant,
        qqMaduroPerLote: e.qqMad,
        qqOroPerManzana: e.qqOroMz,
        qqOroPerLote: e.qqOro,
      },
      create: {
        agriculturalYear: e.year,
        loteId,
        estimateType: e.type,
        estimateDate: new Date(e.year === "2425" ? "2025-02-28" : "2026-02-24"),
        lbPerPlant: e.lbPerPlant,
        qqMaduroPerLote: e.qqMad,
        qqOroPerManzana: e.qqOroMz,
        qqOroPerLote: e.qqOro,
      },
    });
    estCount++;
  }
  console.log(`   ✓ ${estCount} production estimates\n`);

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
