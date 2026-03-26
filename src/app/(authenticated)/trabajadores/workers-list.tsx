"use client";

// =============================================================================
// src/app/(authenticated)/trabajadores/workers-list.tsx — Filterable worker table
// =============================================================================

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Filter } from "lucide-react";
import { formatDateShort } from "@/lib/utils/format";

type WorkerRow = {
  id: string;
  fullName: string;
  dpi: string | null;
  phone: string | null;
  isActive: boolean;
  isMinor: boolean;
  startDate: string | null;
};

type FilterMode = "all" | "active" | "inactive";

export function WorkersList({ workers }: { workers: WorkerRow[] }) {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("active");

  const filtered = useMemo(() => {
    return workers.filter((w) => {
      // Status filter
      if (filterMode === "active" && !w.isActive) return false;
      if (filterMode === "inactive" && w.isActive) return false;

      // Text search
      if (search) {
        const q = search.toLowerCase();
        if (
          !w.fullName.toLowerCase().includes(q) &&
          !(w.dpi?.includes(q)) &&
          !(w.phone?.includes(q))
        ) {
          return false;
        }
      }

      return true;
    });
  }, [workers, search, filterMode]);

  const activeCount = workers.filter((w) => w.isActive).length;
  const inactiveCount = workers.length - activeCount;

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-finca-300" />
          <input
            type="text"
            placeholder="Buscar por nombre, DPI o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-finca-200 bg-white py-2 pl-10 pr-3 text-sm placeholder:text-finca-300 focus:border-earth-400 focus:outline-none focus:ring-1 focus:ring-earth-400"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-finca-100 p-1">
          <Filter className="ml-2 h-3.5 w-3.5 text-finca-400" />
          {(
            [
              { key: "active", label: `Activos (${activeCount})` },
              { key: "inactive", label: `Inactivos (${inactiveCount})` },
              { key: "all", label: `Todos (${workers.length})` },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterMode(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterMode === key
                  ? "bg-white text-finca-900 shadow-sm"
                  : "text-finca-500 hover:text-finca-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="mb-2 text-xs text-finca-400">
        {filtered.length} trabajador{filtered.length !== 1 ? "es" : ""}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-finca-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-finca-500">
            {search
              ? "No se encontraron trabajadores con esa búsqueda."
              : "No hay trabajadores en esta categoría."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-finca-100 bg-finca-50/50">
                <th className="px-4 py-3 font-medium text-finca-600">Nombre</th>
                <th className="px-4 py-3 font-medium text-finca-600">DPI</th>
                <th className="px-4 py-3 font-medium text-finca-600">Teléfono</th>
                <th className="px-4 py-3 font-medium text-finca-600">Estado</th>
                <th className="px-4 py-3 font-medium text-finca-600">Fecha Inicio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-finca-50">
              {filtered.map((w) => (
                <tr
                  key={w.id}
                  className="transition-colors hover:bg-finca-50/30"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/trabajadores/${w.id}` as never}
                      className="font-medium text-finca-900 hover:text-earth-600 hover:underline"
                    >
                      {w.fullName}
                    </Link>
                    {w.isMinor && (
                      <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        Menor
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-finca-600">
                    {w.dpi ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-finca-600">
                    {w.phone ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        w.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-finca-100 text-finca-500"
                      }`}
                    >
                      {w.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-finca-600">
                    {w.startDate ? formatDateShort(w.startDate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
