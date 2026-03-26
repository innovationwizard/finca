"use client";

// =============================================================================
// src/app/(authenticated)/planilla/planilla-list.tsx — Records table
// =============================================================================

import { useState, useMemo } from "react";
import { formatGTQ, formatQuantity, formatDateShort } from "@/lib/utils/format";

type Record = {
  id: string;
  date: string;
  quantity: number;
  unitPrice: number;
  totalEarned: number;
  notes: string | null;
  syncedAt: string | null;
  worker: { id: string; fullName: string };
  activity: { id: string; name: string; unit: string };
  lote: { id: string; name: string } | null;
};

type FilterState = {
  search: string;
  date: string;
  lote: string;
};

export function PlanillaList({ records }: { records: Record[] }) {
  const [filter, setFilter] = useState<FilterState>({
    search: "",
    date: "",
    lote: "",
  });

  // Unique dates and lotes for filter dropdowns
  const uniqueDates = useMemo(
    () => [...new Set(records.map((r) => r.date))].sort().reverse(),
    [records],
  );
  const uniqueLotes = useMemo(
    () =>
      [...new Set(records.filter((r) => r.lote).map((r) => r.lote!.name))].sort(),
    [records],
  );

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filter.search) {
        const q = filter.search.toLowerCase();
        if (
          !r.worker.fullName.toLowerCase().includes(q) &&
          !r.activity.name.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (filter.date && r.date !== filter.date) return false;
      if (filter.lote && r.lote?.name !== filter.lote) return false;
      return true;
    });
  }, [records, filter]);

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-finca-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-finca-500">
          No hay registros en este período.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar trabajador o actividad..."
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm placeholder:text-finca-300 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 sm:w-64"
        />
        <select
          value={filter.date}
          onChange={(e) => setFilter({ ...filter, date: e.target.value })}
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none"
        >
          <option value="">Todas las fechas</option>
          {uniqueDates.map((d) => (
            <option key={d} value={d}>
              {formatDateShort(d)}
            </option>
          ))}
        </select>
        <select
          value={filter.lote}
          onChange={(e) => setFilter({ ...filter, lote: e.target.value })}
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none"
        >
          <option value="">Todos los lotes</option>
          {uniqueLotes.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {(filter.search || filter.date || filter.lote) && (
          <button
            onClick={() => setFilter({ search: "", date: "", lote: "" })}
            className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-xs font-medium text-finca-500 hover:bg-finca-50"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Count */}
      <p className="mb-2 text-xs text-finca-400">
        {filtered.length} de {records.length} registros
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-finca-100 bg-finca-50/50">
              <th className="px-4 py-3 font-medium text-finca-600">Fecha</th>
              <th className="px-4 py-3 font-medium text-finca-600">Trabajador</th>
              <th className="px-4 py-3 font-medium text-finca-600">Actividad</th>
              <th className="px-4 py-3 font-medium text-finca-600">Lote</th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Cantidad
              </th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Precio
              </th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Total
              </th>
              <th className="w-8 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-50">
            {filtered.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-finca-50/30">
                <td className="px-4 py-2.5 text-finca-600">
                  {formatDateShort(r.date)}
                </td>
                <td className="px-4 py-2.5 font-medium text-finca-900">
                  {r.worker.fullName}
                </td>
                <td className="px-4 py-2.5 text-finca-700">{r.activity.name}</td>
                <td className="px-4 py-2.5 text-finca-500">
                  {r.lote?.name ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                  {formatQuantity(r.quantity, r.activity.unit)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-500">
                  {formatGTQ(r.unitPrice)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-finca-900">
                  {formatGTQ(r.totalEarned)}
                </td>
                <td className="px-2 py-2.5 text-center">
                  {!r.syncedAt && (
                    <span
                      className="inline-flex h-2 w-2 rounded-full bg-amber-400"
                      title="Pendiente de sincronizar"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-finca-200 bg-finca-50/30">
              <td colSpan={6} className="px-4 py-3 text-right text-sm font-medium text-finca-600">
                Total
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-finca-900">
                {formatGTQ(filtered.reduce((s, r) => s + r.totalEarned, 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
