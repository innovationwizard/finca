// =============================================================================
// prisma/seed.ts — Seed with REAL data from Finca Danilandia Excels
// =============================================================================
// Sources:
//   - ACTIVIDADES_EDUARDO_Z_-_FCA_DANILANDIA.xlsx (GENERAL sheet)
//   - Planilla_Finca_Cafe_Semanal_CON_Lotes_feb-marz.xlsx (Control_Actividades)
//   - Ingresos_de_Cafe__por_Corte__2025_2026_acumulado_maduro.xlsx
//   - MegaEstrategiaFINCA.txt (transcription)
// =============================================================================

import { PrismaClient, ActivityUnit, PayPeriodType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Finca Danilandia database...\n");

  // =========================================================================
  // LOTES — from GENERAL sheet of ACTIVIDADES Excel
  // =========================================================================
  // Data extracted directly from: ACTIVIDADES_EDUARDO_Z_-_FCA_DANILANDIA.xlsx
  // CANOA 1: 7 mz used (latest data from 2627+ projections)
  // Lots without data: defaulted to 1 mz, 0 plants (to be updated via admin)

  // OPEN: CANOA 1 area is ambiguous (18 mz in 2425/2526, 7 mz in 2627+) — set null
  // OPEN: 6 lots (CANOA 2 through SAN EMILIANO CRUZ) have no area/plant data — set null
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
  for (const lote of lotesData) {
    await prisma.lote.upsert({
      where: { slug: lote.slug },
      update: { areaManzanas: lote.areaManzanas, plantCount: lote.plantCount, density: lote.density, sortOrder: lote.sortOrder },
      create: { name: lote.name, slug: lote.slug, areaManzanas: lote.areaManzanas, plantCount: lote.plantCount, density: lote.density, sortOrder: lote.sortOrder },
    });
  }
  console.log(`   ✓ ${lotesData.length} lotes upserted\n`);

  // =========================================================================
  // ACTIVITIES — from Control_Actividades sheet + plan sheets
  // =========================================================================
  // First 10: exact data from Planilla_Finca_Cafe_Semanal_CON_Lotes_feb-marz.xlsx
  // Remaining 9: from per-lote plan sheets in ACTIVIDADES Excel
  //   - Unit: DIA (per user instruction)
  //   - Prices: researched defaults based on Guatemala CE2 agricultural
  //     labor market. Reference: 2026 minimum agricultural wage = Q119.21/day.
  //     However, actual finca rates are below minimum (Caporal Q100/day,
  //     Beneficio Q100/day). Defaults aligned to existing price structure.
  //     THESE ARE EDITABLE via the management page.

  const activitiesData = [
    // === FROM CONTROL_ACTIVIDADES (exact from Excel) ===
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

    // === FROM PLAN SHEETS — OPEN: prices unknown, set to null ===
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
  for (const activity of activitiesData) {
    await prisma.activity.upsert({
      where: { name: activity.name },
      update: {
        unit: activity.unit,
        defaultPrice: activity.defaultPrice,
        isHarvest: activity.isHarvest,
        isBeneficio: activity.isBeneficio,
        sortOrder: activity.sortOrder,
      },
      create: activity,
    });
  }
  console.log(`   ✓ ${activitiesData.length} activities upserted\n`);

  // =========================================================================
  // SYSTEM SETTINGS
  // =========================================================================

  const settingsData = [
    {
      key: "pay_period_type",
      value: JSON.stringify("SEMANAL"),
      label: "Tipo de período de pago",
      group: "payroll",
    },
    {
      key: "agricultural_year_start_month",
      value: JSON.stringify(3), // March
      label: "Mes de inicio del año agrícola",
      group: "general",
    },
    {
      key: "production_target_qq_oro_per_mz",
      value: JSON.stringify(25),
      label: "Meta de producción (qq oro/mz)",
      group: "production",
    },
    {
      key: "average_price_per_lb",
      value: JSON.stringify(2.8),
      label: "Precio promedio por libra (GTQ)",
      group: "production",
    },
    {
      key: "rendimiento_alert_min",
      value: JSON.stringify(4.0),
      label: "Rendimiento mínimo antes de alerta",
      group: "alerts",
    },
    {
      key: "rendimiento_alert_max",
      value: JSON.stringify(7.0),
      label: "Rendimiento máximo antes de alerta",
      group: "alerts",
    },
    {
      key: "corte_max_qq_per_person_per_day",
      value: JSON.stringify(5.0),
      label: "Máximo qq corte por persona por día (alerta)",
      group: "alerts",
    },
    {
      key: "bonificacion_incentivo",
      value: JSON.stringify(250),
      label: "Bonificación incentivo legal (GTQ/mes)",
      group: "payroll",
    },
    {
      key: "currency",
      value: JSON.stringify("GTQ"),
      label: "Moneda",
      group: "general",
    },
  ] as const;

  console.log("⚙️  Seeding system settings...");
  for (const setting of settingsData) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, label: setting.label, group: setting.group },
      create: setting,
    });
  }
  console.log(`   ✓ ${settingsData.length} settings upserted\n`);

  // =========================================================================
  // WORKERS — from Planilla Excel (real names, real data)
  // =========================================================================
  // Extracted from: Planilla_Finca_Cafe_Semanal_CON_Lotes_feb-marz.xlsx
  // DPIs not in Excel — left null for admin to fill

  const workersData = [
    "GILDABERTO SOLANO",
    "HENRY RANDOLFO HERNANDEZ",
    "CARMELO GUAMUCH",
    "LUZ DE MARIA MARTINEZ",
    "JAIME ANIBAL MARROQUIN",
    "SUSANA SOLANO",
    "ENMA PEREZ",
    "EDGAR ROLANDO NAVAS",
    "SULEIMA MARROQUIN",
    "FERNANDO GUAMUCH",
    "GERMAN SOLANO",
    "CARLOS GARCIA",
    "JULIA MARROQUIN",
    "BALDOMERO SOLANO",
    "OLIVER AGUILAR",
    "ELMER MANUEL HERNANDEZ",
    "IRIS PEREZ",
    "JONATHAN AGUILAR",
  ];

  console.log("👷 Seeding workers...");
  for (const name of workersData) {
    const existing = await prisma.worker.findFirst({ where: { fullName: name } });
    if (!existing) {
      await prisma.worker.create({ data: { fullName: name } });
    }
  }
  console.log(`   ✓ ${workersData.length} workers upserted\n`);

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
