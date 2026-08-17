"use client";

// =============================================================================
// src/app/(authenticated)/planilla/autorizacion/acumulados-grupo-table.tsx
// "Acumulados por actividad" and "Acumulados por lote" — the same money as
// "Acumulados por trabajador", regrouped. One component serves both; the lote
// view adds the Q/manzana column.
//
//   Acumulado a la fecha        = Σ of the group's activity records (devengado),
//                                 OPEN period only.
//   Promedio por día-trabajador = acumulado ÷ distinct (trabajador × día) pairs.
//                                 The average day's wage this activity/lote paid.
//                                 Comparable between rows, and comparable with
//                                 the per-worker tab, which is the same kind of
//                                 number.
//   Promedio por día calendario = acumulado ÷ distinct dates with a record.
//                                 What the farm spent per day while work ran.
//                                 NOT comparable between rows: a 30-person
//                                 cuadrilla and a 2-person one differ by crew
//                                 size, not by cost.
//   Q por manzana (lote only)   = acumulado ÷ the lote's manzanas.
//
// Both readings are shown because they answer different questions and differ by
// an order of magnitude — in period 10, Siembra was Q129.13 per día-trabajador
// and Q2,379.64 per día calendario. Showing only one invites reading it as the
// other.
//
// The two sub-header rows follow the same rule as the per-worker tab: each cell
// is the average OF the column above it (mean of per-row figures, not
// total ÷ total). See acumulados-table.tsx for the full reasoning — it applies
// here unchanged; do not "fix" one into the other.
//
// Q/manzana averages only the rows that HAVE an area. Beneficio, Finca Generales
// and Hacienda are cost centres, not planted land: their Q/manzana is undefined,
// not zero, and counting them as zero would drag the average down with a number
// that means nothing.
//
// Filters are the search box and the sort selector only. "Categoría",
// "Solo excepciones" and "Solo con ajustes" from the per-worker tab are
// attributes of a WORKER; they have no meaning for an activity or a lote.
// =============================================================================

import { useMemo, useState } from "react";
import { formatGTQ } from "@/lib/utils/format";

export type GrupoRow = {
  key: string;
  name: string;
  acumulado: number;
  dias: number;
  diasTrabajador: number;
  promedioDiaTrabajador: number;
  promedioDiaCalendario: number;
  manzanas: number | null;
  qPorManzana: number | null;
};

type SortKey = "name" | "acumulado" | "diaTrabajador" | "diaCalendario" | "manzana";

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;

const money = (v: number | null) => (v == null ? "—" : formatGTQ(v));

export function AcumuladosGrupoTable({
  rows,
  groupLabel,
  showManzanas = false,
}: {
  rows: GrupoRow[];
  /** Header of the first column: "Actividad" or "Lote". */
  groupLabel: string;
  showManzanas?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
    out.sort((a, b) => {
      switch (sort) {
        case "acumulado":
          return b.acumulado - a.acumulado;
        case "diaTrabajador":
          return b.promedioDiaTrabajador - a.promedioDiaTrabajador;
        case "diaCalendario":
          return b.promedioDiaCalendario - a.promedioDiaCalendario;
        case "manzana":
          // Rows without an area sort last instead of pretending to be Q0.
          return (b.qPorManzana ?? -Infinity) - (a.qPorManzana ?? -Infinity);
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return out;
  }, [rows, search, sort]);

  const averagesOf = (set: GrupoRow[]) =>
    set.length === 0
      ? null
      : {
          acumulado: mean(set.map((r) => r.acumulado))!,
          diaTrabajador: mean(set.map((r) => r.promedioDiaTrabajador))!,
          diaCalendario: mean(set.map((r) => r.promedioDiaCalendario))!,
          manzana: mean(
            set.filter((r) => r.qPorManzana != null).map((r) => r.qPorManzana!),
          ),
        };

  const avgAll = useMemo(() => averagesOf(rows), [rows]);
  const avgFiltered = useMemo(() => averagesOf(filtered), [filtered]);

  const filteredTotal = useMemo(
    () => filtered.reduce((s, r) => s + r.acumulado, 0),
    [filtered],
  );

  const colCount = showManzanas ? 5 : 4;

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Buscar ${groupLabel.toLowerCase()}…`}
          className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm placeholder:text-finca-300 focus:border-earth-400 focus:outline-none sm:w-64"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none"
        >
          <option value="name">Ordenar: Nombre</option>
          <option value="acumulado">Ordenar: Acumulado</option>
          <option value="diaTrabajador">Ordenar: Promedio por día-trabajador</option>
          <option value="diaCalendario">Ordenar: Promedio por día calendario</option>
          {showManzanas && <option value="manzana">Ordenar: Q por manzana</option>}
        </select>
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
                {groupLabel}
              </th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium">
                Acumulado a la fecha
              </th>
              <th
                className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium"
                title="Acumulado ÷ (trabajador × día) — el jornal promedio que pagó"
              >
                Promedio por día-trabajador
              </th>
              <th
                className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium"
                title="Acumulado ÷ días distintos con registro — el gasto diario mientras hubo trabajo"
              >
                Promedio por día calendario
              </th>
              {showManzanas && (
                <th
                  className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium"
                  title="Acumulado ÷ manzanas del lote. Los centros de costo sin área muestran «—»."
                >
                  Q por manzana
                </th>
              )}
            </tr>
            <AverageRow label="Promedio de todos" averages={avgAll} showManzanas={showManzanas} />
            <AverageRow label="Promedio de los filtrados" averages={avgFiltered} showManzanas={showManzanas} />
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.key} className="hover:bg-finca-50/40">
                <td className="sticky left-0 z-10 whitespace-nowrap border border-finca-100 bg-white px-3 py-1.5 font-medium text-finca-900">
                  {r.name}
                </td>
                <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums font-semibold text-finca-900">
                  {formatGTQ(r.acumulado)}
                </td>
                <td
                  className="border border-finca-100 px-2 py-1.5 text-right tabular-nums text-finca-700"
                  title={`${formatGTQ(r.acumulado)} ÷ ${r.diasTrabajador} día(s)-trabajador`}
                >
                  {formatGTQ(r.promedioDiaTrabajador)}
                </td>
                <td
                  className="border border-finca-100 px-2 py-1.5 text-right tabular-nums text-finca-700"
                  title={`${formatGTQ(r.acumulado)} ÷ ${r.dias} día(s) con registro`}
                >
                  {formatGTQ(r.promedioDiaCalendario)}
                </td>
                {showManzanas && (
                  <td
                    className="border border-finca-100 px-2 py-1.5 text-right tabular-nums text-finca-700"
                    title={
                      r.manzanas != null
                        ? `${formatGTQ(r.acumulado)} ÷ ${r.manzanas} mz`
                        : "Sin área registrada — no es terreno sembrado"
                    }
                  >
                    {money(r.qPorManzana)}
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={colCount} className="border border-finca-100 px-3 py-8 text-center text-finca-400">
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

function AverageRow({
  label,
  averages,
  showManzanas,
}: {
  label: string;
  averages: { acumulado: number; diaTrabajador: number; diaCalendario: number; manzana: number | null } | null;
  showManzanas: boolean;
}) {
  return (
    <tr className="bg-earth-50/60 text-finca-700">
      <th
        scope="row"
        className="sticky left-0 z-20 whitespace-nowrap border border-finca-100 bg-earth-50 px-3 py-1.5 text-left font-medium"
      >
        {label}
      </th>
      <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums font-semibold">
        {money(averages?.acumulado ?? null)}
      </td>
      <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums font-semibold">
        {money(averages?.diaTrabajador ?? null)}
      </td>
      <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums font-semibold">
        {money(averages?.diaCalendario ?? null)}
      </td>
      {showManzanas && (
        <td
          className="border border-finca-100 px-2 py-1.5 text-right tabular-nums font-semibold"
          title="Promedio solo de los lotes con área registrada"
        >
          {money(averages?.manzana ?? null)}
        </td>
      )}
    </tr>
  );
}
