"use client";

// =============================================================================
// src/app/(authenticated)/planilla/autorizacion/acumulados-table.tsx
// "Acumulados por trabajador" — running totals for the OPEN period only.
//
//   Acumulado a la fecha       = Σ of the worker's activity records (devengado).
//   Promedio diario a la fecha = that sum ÷ the number of distinct days on which
//                                the worker has a recorded activity.
//
// Two sub-header rows sit under the column headers: "Promedio de todos" (the
// whole period, fixed — a stable baseline to compare a worker against) and
// "Promedio de los filtrados" (recomputed as you search or filter).
//
// Both are averages OF the per-worker figures, not totals ÷ totals: "promedio
// diario" on the sub-header row is the mean of each worker's own daily average,
// so every worker weighs the same regardless of how many days they worked. That
// is what was asked for, and it is a different number from
// (total earned ÷ total days) — do not "fix" one into the other.
//
// Filters mirror "Resumen por trabajador"; like "Detalle de registros", this view
// owns its filter state rather than sharing it across tabs.
//
// -----------------------------------------------------------------------------
// WHY THE MEAN-OF-MEANS, IN FULL
//
// Decision taken 2026-08-17: "Keep as built." The analysis behind it is
// reproduced verbatim below, figures measured against real data through pay
// period 10. It is here so that whoever next wonders "shouldn't this be
// total ÷ total?" gets the answer without re-running the numbers.
//
//   Checked across every period with data, because the size of the gap decides
//   how much this matters:
//
//   | Período | Trabajadores | A — promedio de promedios (built) | B — total ÷ días | Diferencia |
//   |---|---|---|---|---|
//   | 6  | 27 | Q62.17  | Q62.17  | 0.0%  |
//   | 7  | 38 | Q105.04 | Q101.83 | +3.2% |
//   | 8  | 39 | Q72.50  | Q72.85  | −0.5% |
//   | 9  | 40 | Q66.92  | Q68.55  | −2.4% |
//   | 10 | 35 | Q81.10  | Q82.99  | −2.3% |
//
//   The two agree within ~3%, and in period 6 they're identical. That's the
//   useful fact: A and B converge when everyone works a similar number of days,
//   and period 6's workers were all clustered in the 6–10 day band. The gap only
//   opens when day counts vary between workers. So this is not a choice between a
//   right and a wrong number — it's a choice between two nearly-equal numbers,
//   which lowers the stakes a lot.
//
//   Easier to understand: A, the one built. Because the sub-header row then obeys
//   a single rule a field user can learn in one sentence: esta fila es el
//   promedio de la columna de arriba. Both cells work the same way. If the daily
//   column switched to B, the two cells sitting side by side in the same row
//   would follow different rules — the left one an average of the column, the
//   right one a ratio of two totals that appear nowhere. That inconsistency is
//   harder to explain than either formula on its own.
//
//   Easier to reproduce by hand: A, decisively. Everything needed is on screen —
//   add up the "Promedio diario" column, divide by the number of rows. To
//   reproduce B by hand you need total worker-days, which the table doesn't show;
//   with 35 workers you'd be opening 35 tooltips to sum the days first.
//
//   Recommendation: keep it as built. It also happens to be the right comparison
//   basis for the audit use — each worker counts once, so comparing a row against
//   the baseline row is a fair comparison. B is weighted by how much other people
//   worked, which is the correct figure for cost accounting ("what did a day of
//   labor cost the farm?") but the wrong yardstick for judging an individual.
//
//   The one honest weakness: A is more sensitive to someone with very few
//   recorded days. A worker with one day at an odd rate pulls A more than B. Your
//   data doesn't show this today because day counts are fairly uniform, but it's
//   the thing to watch if you ever see the baseline move without an obvious cause
//   — the per-row tooltip shows the day count, which is where you'd look first.
//
//   If you'd rather make both figures hand-checkable, the smallest change is a
//   "Días" column — that puts B's missing denominator on screen. You specified
//   three columns, so I haven't added it; say the word if you want it.
// =============================================================================

import { useMemo, useState } from "react";
import { formatGTQ } from "@/lib/utils/format";

export type AcumuladoRow = {
  workerId: string;
  name: string;
  acumulado: number;
  dias: number;
  promedioDiario: number;
  categories: string[];
  hasExceptions: boolean;
  hasAdjustments: boolean;
};

type Averages = { acumulado: number; promedioDiario: number } | null;

/** Mean of each worker's own figure. Null for an empty set — never 0, which would read as a real Q0.00. */
function averagesOf(rows: AcumuladoRow[]): Averages {
  if (rows.length === 0) return null;
  return {
    acumulado: rows.reduce((s, r) => s + r.acumulado, 0) / rows.length,
    promedioDiario: rows.reduce((s, r) => s + r.promedioDiario, 0) / rows.length,
  };
}

export function AcumuladosTable({ rows }: { rows: AcumuladoRow[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"" | "VOLUNTARIO" | "FIJO">("");
  const [onlyExceptions, setOnlyExceptions] = useState(false);
  const [onlyAdjustments, setOnlyAdjustments] = useState(false);
  const [sort, setSort] = useState<"name" | "acumulado" | "promedio">("name");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (category && !r.categories.includes(category)) return false;
      if (onlyExceptions && !r.hasExceptions) return false;
      if (onlyAdjustments && !r.hasAdjustments) return false;
      return true;
    });
    out.sort((a, b) => {
      if (sort === "acumulado") return b.acumulado - a.acumulado;
      if (sort === "promedio") return b.promedioDiario - a.promedioDiario;
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [rows, search, category, onlyExceptions, onlyAdjustments, sort]);

  // "Todos" = every worker of the period, independent of the filters.
  const avgAll = useMemo(() => averagesOf(rows), [rows]);
  const avgFiltered = useMemo(() => averagesOf(filtered), [filtered]);

  const filteredTotal = useMemo(
    () => filtered.reduce((s, r) => s + r.acumulado, 0),
    [filtered],
  );

  return (
    <div>
      {/* Filters — same set as "Resumen por trabajador" */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar trabajador…"
          className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm placeholder:text-finca-300 focus:border-earth-400 focus:outline-none sm:w-64"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none"
        >
          <option value="">Todas las categorías</option>
          <option value="VOLUNTARIO">Voluntario</option>
          <option value="FIJO">Fijo</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none"
        >
          <option value="name">Ordenar: Nombre</option>
          <option value="acumulado">Ordenar: Acumulado</option>
          <option value="promedio">Ordenar: Promedio diario</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-finca-600">
          <input
            type="checkbox"
            checked={onlyExceptions}
            onChange={(e) => setOnlyExceptions(e.target.checked)}
            className="h-4 w-4 rounded border-finca-300"
          />
          Solo excepciones
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm text-finca-600">
          <input
            type="checkbox"
            checked={onlyAdjustments}
            onChange={(e) => setOnlyAdjustments(e.target.checked)}
            className="h-4 w-4 rounded border-finca-300"
          />
          Solo con ajustes
        </label>
        <span className="ml-auto text-sm text-finca-500">
          {filtered.length} de {rows.length} ·{" "}
          <span className="font-semibold tabular-nums text-finca-900">
            {formatGTQ(filteredTotal)}
          </span>
        </span>
      </div>

      <div className="mt-3 max-h-[calc(100vh-16rem)] overflow-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-finca-50 text-finca-600">
              <th className="sticky left-0 top-0 z-30 border border-finca-100 bg-finca-50 px-3 py-2 font-medium">
                Trabajador
              </th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium">
                Acumulado a la fecha
              </th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium">
                Promedio diario a la fecha
              </th>
            </tr>
            <AverageRow label="Promedio de todos" averages={avgAll} />
            <AverageRow label="Promedio de los filtrados" averages={avgFiltered} />
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.workerId} className="hover:bg-finca-50/40">
                <td className="sticky left-0 z-10 whitespace-nowrap border border-finca-100 bg-white px-3 py-1.5 font-medium text-finca-900">
                  {r.name}
                </td>
                <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums font-semibold text-finca-900">
                  {formatGTQ(r.acumulado)}
                </td>
                <td
                  className="border border-finca-100 px-2 py-1.5 text-right tabular-nums text-finca-700"
                  title={`${formatGTQ(r.acumulado)} ÷ ${r.dias} día(s) con actividad registrada`}
                >
                  {formatGTQ(r.promedioDiario)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="border border-finca-100 px-3 py-8 text-center text-finca-400">
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AverageRow({ label, averages }: { label: string; averages: Averages }) {
  return (
    <tr className="bg-earth-50/60 text-finca-700">
      <th
        scope="row"
        className="sticky left-0 z-20 whitespace-nowrap border border-finca-100 bg-earth-50 px-3 py-1.5 text-left font-medium"
      >
        {label}
      </th>
      <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums font-semibold">
        {averages ? formatGTQ(averages.acumulado) : "—"}
      </td>
      <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums font-semibold">
        {averages ? formatGTQ(averages.promedioDiario) : "—"}
      </td>
    </tr>
  );
}
