// =============================================================================
// scripts/seed-plan-2627-from-2526.ts
//
// Seeds the field-work half of the 26/27 plan by copying the same calendar
// months from 25/26 — the farm's stated starting point, to be edited on screen.
//
// CONTEXT. The plan captured in April–May 2026 covers March 2026 → February 2027.
// Under the cosecha window (1 oct → 30 sep) that spans two seasons, and because
// plan cells are stored as real dates, no data had to move for that: cosecha
// 25/26 simply contains its mar-2026 → sep-2026 weeks, and 26/27 already
// contains its oct-2026 → feb-2027 harvest weeks. What 26/27 lacks is
// mar-2027 → sep-2027. This copies those weeks across, shifting each date by
// exactly one year onto the same day-of-month.
//
// Only weeks with no existing 26/27 entry are written, so anything already
// planned by hand for 2027 wins and re-running is safe.
//
// Dry run by default; --apply commits in one transaction.
//
//   npx dotenv -e .env.local -- npx tsx scripts/seed-plan-2627-from-2526.ts
//   npx dotenv -e .env.local -- npx tsx scripts/seed-plan-2627-from-2526.ts --apply
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { weekStartIso } from "../src/lib/plan/plan-week";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// The stretch being copied and where it lands: March–September 2026 → 2027.
const SOURCE_FROM = new Date(Date.UTC(2026, 2, 1)); // 1 mar 2026
const SOURCE_TO = new Date(Date.UTC(2026, 8, 30)); // 30 sep 2026

/** Same day and month, one calendar year later. */
function oneYearLater(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()),
  );
}

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const label = (d: Date) =>
  `${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()} d${String(d.getUTCDate()).padStart(2, "0")}`;

(async () => {
  const source = await prisma.planEntry.findMany({
    where: { weekStart: { gte: SOURCE_FROM, lte: SOURCE_TO } },
    select: {
      loteId: true,
      activityId: true,
      weekStart: true,
      plannedJornales: true,
    },
    orderBy: { weekStart: "asc" },
  });

  if (source.length === 0) {
    console.log(
      "No hay filas de plan entre mar-2026 y sep-2026. ¿Corrió ya la migración de week_start?",
    );
    return;
  }

  const candidates = source.map((r) => ({
    loteId: r.loteId,
    activityId: r.activityId,
    weekStart: oneYearLater(r.weekStart),
    plannedJornales: Number(r.plannedJornales),
    fromWeekStart: r.weekStart,
  }));

  // Skip weeks already planned by hand for 2027 — they win.
  const existing = await prisma.planEntry.findMany({
    where: {
      weekStart: {
        gte: oneYearLater(SOURCE_FROM),
        lte: oneYearLater(SOURCE_TO),
      },
    },
    select: { loteId: true, activityId: true, weekStart: true },
  });
  const taken = new Set(
    existing.map((e) => `${e.loteId}|${e.activityId}|${weekStartIso(e.weekStart)}`),
  );

  const toWrite = candidates.filter(
    (c) => !taken.has(`${c.loteId}|${c.activityId}|${weekStartIso(c.weekStart)}`),
  );
  const skipped = candidates.length - toWrite.length;

  const sum = (rows: { plannedJornales: number }[]) =>
    Math.round(rows.reduce((s, r) => s + r.plannedJornales, 0) * 100) / 100;

  console.log(`\n${APPLY ? "APLICANDO" : "SIMULACIÓN (no escribe nada)"}\n`);
  console.log(
    `Origen  mar-2026 → sep-2026: ${source.length} filas · ${sum(source.map((r) => ({ plannedJornales: Number(r.plannedJornales) })))} jornales`,
  );
  console.log(
    `Destino mar-2027 → sep-2027: ${toWrite.length} filas a crear · ${sum(toWrite)} jornales`,
  );
  if (skipped > 0) {
    console.log(`Respetadas (ya existían en 2027): ${skipped} filas`);
  }

  const byMonth = new Map<string, number>();
  for (const c of toWrite) {
    const k = `${MONTHS[c.weekStart.getUTCMonth()]}-${c.weekStart.getUTCFullYear()}`;
    byMonth.set(k, (byMonth.get(k) ?? 0) + c.plannedJornales);
  }
  console.log("\nPor mes destino:");
  for (const [k, v] of byMonth) console.log(`   ${k.padEnd(9)} ${String(v).padStart(7)} jornales`);

  console.log("\nMuestra (origen → destino):");
  for (const c of toWrite.slice(0, 5)) {
    console.log(`   ${label(c.fromWeekStart)} → ${label(c.weekStart)}   ${c.plannedJornales} jornales`);
  }

  if (!APPLY) {
    console.log(
      "\nSimulación terminada. Vuelva a correr con --apply para escribir.",
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.planEntry.createMany({
      data: toWrite.map(({ fromWeekStart: _drop, ...row }) => row),
    });
  });

  const total = await prisma.planEntry.count({
    where: {
      weekStart: {
        gte: new Date(Date.UTC(2026, 9, 1)),
        lte: new Date(Date.UTC(2027, 8, 30)),
      },
    },
  });
  console.log(`\nEscrito. Cosecha 26/27 tiene ahora ${total} filas de plan.`);
})().finally(() => prisma.$disconnect());
