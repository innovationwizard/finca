// =============================================================================
// scripts/restore-plan-2627-zeroed.ts
//
// Restores the 26/27 plan cells that were overwritten with 0 during data entry
// on 27–28 August 2026.
//
// WHAT HAPPENED. The plan grid read its cell with `parseFloat(v) || 0` from an
// <input type="number">. A number input reports "" for anything the browser
// calls bad input — including the comma a Spanish-locale keypad offers as the
// decimal separator — so "1,5" arrived as "", `|| 0` made it 0, and 0 differed
// from the cell's value, so it was saved. 172 cells were zeroed on the 27th and
// 13 more on the 28th. A 0 renders as "–", exactly like an empty week, so the
// damage looked like the plan simply never saved. Fixed in
// components/plan/plan-grid.tsx (parseJornales + an explicit clear).
//
// TWO SOURCES, no overlap in what they disagree about (checked: 0 conflicts):
//
//   1. SEED SOURCE — mar-2027 → sep-2027. Those rows were created by
//      seed-plan-2627-from-2526.ts, which copied 25/26 forward one calendar
//      year unchanged. The original value is therefore still sitting in the
//      row exactly 1 year earlier. 128 rows / 1,509 jornales.
//
//   2. BACKUP SCHEMA — oct-2026 → feb-2027. Those weeks predate the seed, but
//      backup.plan_entries holds a pre-migration snapshot of them. It stores
//      (agricultural_year, month, week), so week_start is reconstructed with
//      the SAME formula migration 20260727120000 used. Its lote_id/activity_id
//      are dead — the backup predates a rebuild that regenerated every id — so
//      rows are matched by NAME through backup.lotes / backup.activities.
//      63 rows / 123 jornales.
//
// NOT RECOVERABLE: cells the user created by hand on the 27th and then wiped
// the same session. Nothing holds the number they typed; the script lists them
// so they can be re-entered.
//
// Dry run by default; --apply commits in one transaction.
//   --all   widen past the incident window (every zeroed 26/27 cell with a
//           known previous value, including ones zeroed in April and July)
//
//   npx tsx scripts/restore-plan-2627-zeroed.ts
//   npx tsx scripts/restore-plan-2627-zeroed.ts --apply
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");

/** When the bad data entry happened. Rows zeroed before this are older edits. */
const INCIDENT_FROM = "2026-08-27";

/** The cosecha being repaired: 1 oct 2026 → 30 sep 2027. */
const YEAR_FROM = "2026-10-01";
const YEAR_TO = "2027-09-30";

type Candidate = {
  id: string;
  lote: string;
  actividad: string;
  week_start: string;
  valor: number;
  origen: "plan 25/26" | "respaldo";
  zeroed_at: string;
};

/**
 * Every zeroed cell we can put a number back into, from both sources.
 *
 * The month/week → week_start reconstruction mirrors migration
 * 20260727120000_plan_entries_week_start exactly: under the OLD March→February
 * window, '2627' month 1..10 was March..December 2026 and 11..12 was
 * January..February 2027.
 */
async function findCandidates(): Promise<Candidate[]> {
  return prisma.$queryRawUnsafe<Candidate[]>(`
    WITH zeroed AS (
      SELECT * FROM public.plan_entries
      WHERE planned_jornales = 0
        AND week_start BETWEEN '${YEAR_FROM}' AND '${YEAR_TO}'
        ${ALL ? "" : `AND updated_at >= '${INCIDENT_FROM}'`}
    ),
    backup_mapped AS (
      SELECT l.id AS lote_id, a.id AS activity_id, bp.planned_jornales AS v,
             (make_date(CASE WHEN bp.month <= 10 THEN 2026 ELSE 2027 END,
                        CASE WHEN bp.month <= 10 THEN bp.month + 2 ELSE bp.month - 10 END,
                        1) + ((bp.week - 1) * 7)) AS week_start
      FROM backup.plan_entries bp
      JOIN backup.lotes bl      ON bl.id = bp.lote_id
      JOIN backup.activities ba ON ba.id = bp.activity_id
      JOIN public.lotes l       ON l.name = bl.name
      JOIN public.activities a  ON a.name = ba.name
      WHERE bp.agricultural_year = '2627'
    ),
    from_backup AS (
      SELECT z.id, b.v, 'respaldo' AS origen
      FROM zeroed z
      JOIN backup_mapped b
        ON b.lote_id = z.lote_id AND b.activity_id = z.activity_id
       AND b.week_start = z.week_start
      WHERE b.v > 0
    ),
    from_seed AS (
      SELECT z.id, s.planned_jornales AS v, 'plan 25/26' AS origen
      FROM zeroed z
      JOIN public.plan_entries s
        ON s.lote_id = z.lote_id AND s.activity_id = z.activity_id
       AND z.week_start = (s.week_start + interval '1 year')::date
      WHERE s.planned_jornales > 0
        AND s.week_start BETWEEN '2026-03-01' AND '2026-09-30'
    ),
    -- Both sources agree wherever they overlap; DISTINCT ON just picks one.
    merged AS (
      SELECT DISTINCT ON (id) id, v, origen
      FROM (SELECT * FROM from_seed UNION ALL SELECT * FROM from_backup) x
      ORDER BY id, origen
    )
    SELECT m.id, l.name AS lote, a.name AS actividad,
           pe.week_start::text AS week_start, m.v::float AS valor,
           m.origen, pe.updated_at::text AS zeroed_at
    FROM merged m
    JOIN public.plan_entries pe ON pe.id = m.id
    JOIN public.lotes l         ON l.id = pe.lote_id
    JOIN public.activities a    ON a.id = pe.activity_id
    ORDER BY l.name, a.name, pe.week_start
  `);
}

/** Zeroed cells with no known previous value — these need re-entering by hand. */
async function findUnrecoverable(knownIds: string[]): Promise<
  { lote: string; actividad: string; week_start: string; created_at: string }[]
> {
  const exclusion = knownIds.length
    ? `AND pe.id NOT IN (${knownIds.map((id) => `'${id}'`).join(",")})`
    : "";
  return prisma.$queryRawUnsafe(`
    SELECT l.name AS lote, a.name AS actividad, pe.week_start::text AS week_start,
           pe.created_at::text AS created_at
    FROM public.plan_entries pe
    JOIN public.lotes l      ON l.id = pe.lote_id
    JOIN public.activities a ON a.id = pe.activity_id
    WHERE pe.planned_jornales = 0
      AND pe.week_start BETWEEN '${YEAR_FROM}' AND '${YEAR_TO}'
      AND pe.updated_at >= '${INCIDENT_FROM}'
      ${exclusion}
    ORDER BY l.name, a.name, pe.week_start
  `);
}

(async () => {
  const candidates = await findCandidates();

  if (candidates.length === 0) {
    console.log(
      "No hay celdas en cero con un valor anterior conocido. Nada que restaurar.",
    );
    return;
  }

  console.log(`\n${APPLY ? "APLICANDO" : "SIMULACIÓN (no escribe nada)"}`);
  console.log(
    ALL
      ? "Alcance: TODAS las celdas en cero de la cosecha 26/27\n"
      : `Alcance: celdas puestas en cero desde ${INCIDENT_FROM}\n`,
  );

  const total = candidates.reduce((s, c) => s + c.valor, 0);
  const bySource = new Map<string, { n: number; j: number }>();
  const byLote = new Map<string, { n: number; j: number }>();
  for (const c of candidates) {
    const s = bySource.get(c.origen) ?? { n: 0, j: 0 };
    bySource.set(c.origen, { n: s.n + 1, j: s.j + c.valor });
    const l = byLote.get(c.lote) ?? { n: 0, j: 0 };
    byLote.set(c.lote, { n: l.n + 1, j: l.j + c.valor });
  }

  console.log(
    `A restaurar: ${candidates.length} celdas · ${Math.round(total * 100) / 100} jornales\n`,
  );
  console.log("Por origen:");
  for (const [k, v] of bySource) {
    console.log(`   ${k.padEnd(12)} ${String(v.n).padStart(4)} celdas · ${v.j} jornales`);
  }
  console.log("\nPor lote:");
  for (const [k, v] of [...byLote].sort((a, b) => b[1].j - a[1].j)) {
    console.log(`   ${k.padEnd(20)} ${String(v.n).padStart(4)} celdas · ${v.j} jornales`);
  }

  console.log("\nDetalle:");
  for (const c of candidates) {
    console.log(
      `   ${c.lote.padEnd(18)} ${c.actividad.padEnd(26)} ${c.week_start}  0 → ${String(c.valor).padStart(5)}   (${c.origen})`,
    );
  }

  const unrecoverable = await findUnrecoverable(candidates.map((c) => c.id));
  if (unrecoverable.length > 0) {
    console.log(
      `\nSIN RESPALDO — ${unrecoverable.length} celdas puestas en cero cuyo valor anterior no se conserva.`,
    );
    console.log("Hay que volver a capturarlas a mano:");
    for (const u of unrecoverable) {
      console.log(
        `   ${u.lote.padEnd(18)} ${u.actividad.padEnd(26)} ${u.week_start}`,
      );
    }
  }

  if (!APPLY) {
    console.log(
      "\nSimulación terminada. Revise el detalle y vuelva a correr con --apply para escribir.",
    );
    return;
  }

  // updateMany guarded on planned_jornales = 0: if someone re-entered a cell
  // between the dry run and now, their number wins and this skips it.
  let restored = 0;
  let skipped = 0;
  await prisma.$transaction(async (tx) => {
    for (const c of candidates) {
      const { count } = await tx.planEntry.updateMany({
        where: { id: c.id, plannedJornales: 0 },
        data: { plannedJornales: c.valor },
      });
      if (count > 0) restored++;
      else skipped++;
    }
  });

  console.log(`\nRestauradas ${restored} celdas.`);
  if (skipped > 0) {
    console.log(
      `Omitidas ${skipped}: ya tenían un valor nuevo y no se tocaron.`,
    );
  }

  const after = await prisma.$queryRawUnsafe<{ n: number; j: number }[]>(`
    SELECT count(*)::int n, sum(planned_jornales)::float j
    FROM public.plan_entries WHERE week_start BETWEEN '${YEAR_FROM}' AND '${YEAR_TO}'
  `);
  console.log(
    `Cosecha 26/27: ${after[0].n} filas · ${after[0].j} jornales planificados.`,
  );
})().finally(() => prisma.$disconnect());
