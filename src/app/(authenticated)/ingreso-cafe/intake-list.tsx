"use client";

// =============================================================================
// src/app/(authenticated)/ingreso-cafe/intake-list.tsx — Filterable intake table
// =============================================================================

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatDateShort, formatDecimal } from "@/lib/utils/format";

type IntakeRecord = {
  id: string;
  code: string;
  date: string;
  coffeeType: string;
  source: string;
  loteId: string | null;
  supplierName: string | null;
  procedencia: string | null;
  bultos: number | null;
  pesoNetoQq: number;
  pesoVerdeQq: number | null;
  pesoPergaminoQq: number | null;
  rendimiento: number | null;
  status: string;
  lote: { id: string; name: string } | null;
};

type FilterState = {
  search: string;
  coffeeType: string;
  source: string;
  status: string;
};

const STATUS_LABELS: Record<string, string> = {
  RECIBIDO: "Recibido",
  DESPULPADO: "Despulpado",
  SECANDO: "Secando",
  PERGAMINO: "Pergamino",
  ENVASADO: "Envasado",
  DESPACHADO: "Despachado",
};

const STATUS_COLORS: Record<string, string> = {
  RECIBIDO: "bg-blue-100 text-blue-800",
  DESPULPADO: "bg-amber-100 text-amber-800",
  SECANDO: "bg-yellow-100 text-yellow-800",
  PERGAMINO: "bg-emerald-100 text-emerald-800",
  ENVASADO: "bg-teal-100 text-teal-800",
  DESPACHADO: "bg-finca-100 text-finca-800",
};

const COFFEE_TYPE_LABELS: Record<string, string> = {
  CEREZA: "Cereza",
  PERGAMINO: "Pergamino",
  ORO: "Oro",
};

export function IntakeList({ records }: { records: IntakeRecord[] }) {
  const [filter, setFilter] = useState<FilterState>({
    search: "",
    coffeeType: "",
    source: "",
    status: "",
  });

  // Compute running total (acumulado) based on date-ascending order
  const acumuladoMap = useMemo(() => {
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
    const map = new Map<string, number>();
    let running = 0;
    for (const r of sorted) {
      running += r.pesoNetoQq;
      map.set(r.id, running);
    }
    return map;
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filter.search) {
        const q = filter.search.toLowerCase();
        const matchCode = r.code.toLowerCase().includes(q);
        const matchLote = r.lote?.name.toLowerCase().includes(q);
        const matchSupplier = r.supplierName?.toLowerCase().includes(q);
        if (!matchCode && !matchLote && !matchSupplier) return false;
      }
      if (filter.coffeeType && r.coffeeType !== filter.coffeeType) return false;
      if (filter.source && r.source !== filter.source) return false;
      if (filter.status && r.status !== filter.status) return false;
      return true;
    });
  }, [records, filter]);

  const hasFilters =
    filter.search || filter.coffeeType || filter.source || filter.status;

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-finca-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-finca-500">No hay ingresos registrados.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar código, lote o proveedor..."
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm placeholder:text-finca-300 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400 sm:w-64"
        />
        <select
          value={filter.coffeeType}
          onChange={(e) => setFilter({ ...filter, coffeeType: e.target.value })}
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none"
        >
          <option value="">Todos los tipos</option>
          <option value="CEREZA">Cereza</option>
          <option value="PERGAMINO">Pergamino</option>
          <option value="ORO">Oro</option>
        </select>
        <select
          value={filter.source}
          onChange={(e) => setFilter({ ...filter, source: e.target.value })}
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none"
        >
          <option value="">Todo origen</option>
          <option value="COSECHA">Cosecha</option>
          <option value="COMPRA">Compra</option>
        </select>
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() =>
              setFilter({ search: "", coffeeType: "", source: "", status: "" })
            }
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
              <th className="px-4 py-3 font-medium text-finca-600">Código</th>
              <th className="px-4 py-3 font-medium text-finca-600">Tipo</th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Bultos
              </th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Peso QQ
              </th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Verde QQ
              </th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Acumulado
              </th>
              <th className="px-4 py-3 font-medium text-finca-600">
                Lote / Proveedor
              </th>
              <th className="px-4 py-3 font-medium text-finca-600">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-50">
            {filtered.map((r) => (
              <tr
                key={r.id}
                className="transition-colors hover:bg-finca-50/30"
              >
                <td className="px-4 py-2.5 text-finca-600">
                  {formatDateShort(r.date)}
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/ingreso-cafe/${r.id}` as never}
                    className="font-medium text-earth-600 hover:text-earth-700 hover:underline"
                  >
                    {r.code}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-finca-700">
                  {COFFEE_TYPE_LABELS[r.coffeeType] ?? r.coffeeType}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                  {r.bultos ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                  {formatDecimal(r.pesoNetoQq)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-500">
                  {r.pesoVerdeQq ? formatDecimal(r.pesoVerdeQq) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-400">
                  {formatDecimal(acumuladoMap.get(r.id) ?? 0)}
                </td>
                <td className="px-4 py-2.5 text-finca-700">
                  {r.source === "COSECHA"
                    ? r.lote?.name ?? "—"
                    : r.supplierName ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-800"}`}
                  >
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-finca-200 bg-finca-50/30">
              <td
                colSpan={4}
                className="px-4 py-3 text-right text-sm font-medium text-finca-600"
              >
                Total
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-finca-900">
                {formatDecimal(
                  filtered.reduce((s, r) => s + r.pesoNetoQq, 0),
                )}{" "}
                qq
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-finca-900">
                {formatDecimal(
                  filtered.reduce((s, r) => s + (r.pesoVerdeQq ?? 0), 0),
                )}{" "}
                qq
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
