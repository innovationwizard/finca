"use client";

import { useMemo, useState } from "react";
import type { LedgerRow } from "@/lib/harvest/ledger";
import { guatemalaTodayISO, mondaySaturdayContaining, monthBounds } from "@/lib/harvest/dates";
import { formatCoffeeWeight } from "@/lib/harvest/weight";
import { formatGTQ } from "@/lib/utils/format";
import { categoryLabel } from "@/lib/workers/category-label";

type Mode = "period" | "week" | "month";

export function ContabilidadClient({
  rows,
  openPeriod,
}: {
  rows: LedgerRow[];
  openPeriod: { startDate: string; endDate: string; periodNumber: number } | null;
}) {
  const today = guatemalaTodayISO();
  const [mode, setMode] = useState<Mode>("period");
  const [weekDate, setWeekDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));

  const range = useMemo(() => {
    if (mode === "week") return mondaySaturdayContaining(weekDate);
    if (mode === "month") return monthBounds(month);
    if (openPeriod) return { from: openPeriod.startDate, to: openPeriod.endDate };
    return null;
  }, [mode, weekDate, month, openPeriod]);

  const summaryRows = range
    ? rows.filter((row) => row.date >= range.from && row.date <= range.to)
    : [];
  const total = summaryRows.reduce((sum, row) => sum + row.totalEarned, 0);
  const libras = summaryRows.reduce((sum, row) => sum + row.libras, 0);
  const quintales = summaryRows.reduce((sum, row) => sum + row.quintales, 0);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-finca-700">
          Filtro
          <select value={mode} onChange={(event) => setMode(event.target.value as Mode)} className="mt-1 block rounded-lg border border-finca-200 bg-white px-3 py-2">
            <option value="period">Período abierto{openPeriod ? ` #${openPeriod.periodNumber}` : ""}</option>
            <option value="week">Semana</option>
            <option value="month">Mes</option>
          </select>
        </label>
        {mode === "week" && (
          <label className="text-sm text-finca-700">
            Día de la semana
            <input type="date" value={weekDate} onChange={(event) => setWeekDate(event.target.value)} className="mt-1 block rounded-lg border border-finca-200 px-3 py-2" />
          </label>
        )}
        {mode === "month" && (
          <label className="text-sm text-finca-700">
            Mes
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block rounded-lg border border-finca-200 px-3 py-2" />
          </label>
        )}
        <a href="/api/cosecha/contabilidad/export" className="rounded-lg bg-finca-900 px-3 py-2 text-sm font-medium text-white">
          Exportar libro (xlsx)
        </a>
      </div>
      <div className="mt-4 rounded-xl border border-finca-200 bg-white px-4 py-4">
        <p className="text-xs uppercase tracking-wide text-finca-400">
          A pagar {range ? `${range.from} a ${range.to}` : "sin período abierto"}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-finca-900">{formatGTQ(total)}</p>
        <p className="mt-1 text-sm text-finca-600">{formatCoffeeWeight(libras, quintales)} · {summaryRows.length} entregas</p>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-finca-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-finca-50 text-finca-600">
            <tr>
              {["Fecha", "Trabajador", "Cuadrilla", "Pante", "Peso", "Madurez", "Sacos", "Total"].map((label) => (
                <th key={label} className="px-3 py-2 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-50">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                <td className="px-3 py-2">{row.workerName}<span className="block text-xs text-finca-400">{categoryLabel(row.category)}</span></td>
                <td className="px-3 py-2">{row.cuadrilla ?? "—"}</td>
                <td className="px-3 py-2">{row.pante || "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatCoffeeWeight(row.libras, row.quintales)}</td>
                <td className="px-3 py-2">{row.madurez ?? "—"}</td>
                <td className="px-3 py-2">{row.sacos ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatGTQ(row.totalEarned)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-3 py-8 text-center text-sm text-finca-400">Sin entregas</p>}
      </div>
    </div>
  );
}
