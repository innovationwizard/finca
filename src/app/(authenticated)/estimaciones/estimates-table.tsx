"use client";

// =============================================================================
// src/app/(authenticated)/estimaciones/estimates-table.tsx — Interactive table
// =============================================================================

import { useState, useCallback } from "react";
import { Save, X, Pencil } from "lucide-react";
import {
  ESTIMATE_TYPE_LABELS,
  ESTIMATE_TYPES,
  DEFAULT_RENDIMIENTO,
  TARGET_QQ_ORO_MZ,
  AGRICULTURAL_YEARS,
} from "@/lib/validators/estimate";
import { formatDecimal } from "@/lib/utils/format";
import { formatAgriculturalYear } from "@/lib/utils/agricultural-year";

// ── Types ────────────────────────────────────────────────────────────────────

type EstimateData = {
  id: string;
  agriculturalYear: string;
  loteId: string;
  estimateType: string;
  estimateDate: string;
  lbPerPlant: number;
  qqMaduroPerLote: number | null;
  qqOroPerManzana: number | null;
  qqOroPerLote: number | null;
  notes: string | null;
};

type LoteData = {
  id: string;
  name: string;
  areaManzanas: number | null;
  plantCount: number | null;
  isActive: boolean;
  sortOrder: number;
};

export type EstimatesTableProps = {
  lotes: LoteData[];
  estimates: EstimateData[];
  canWrite: boolean;
};

type EditingCell = {
  loteId: string;
  year: string;
  type: string;
} | null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getQqOroMzColor(value: number | null): string {
  if (value === null) return "text-finca-400";
  if (value >= TARGET_QQ_ORO_MZ) return "text-emerald-700 bg-emerald-50";
  if (value >= 15) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

// ── Component ────────────────────────────────────────────────────────────────

export function EstimatesTable({ lotes, estimates, canWrite }: EstimatesTableProps) {
  const [activeYear, setActiveYear] = useState<string>(
    AGRICULTURAL_YEARS.find((y) => y === "2526") ?? AGRICULTURAL_YEARS[0],
  );
  const [editing, setEditing] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [localEstimates, setLocalEstimates] = useState<EstimateData[]>(estimates);

  // Build lookup: year+lote+type → estimate
  const lookup = new Map<string, EstimateData>();
  for (const e of localEstimates) {
    lookup.set(`${e.agriculturalYear}:${e.loteId}:${e.estimateType}`, e);
  }

  const getEstimate = (year: string, loteId: string, type: string) =>
    lookup.get(`${year}:${loteId}:${type}`) ?? null;

  // Get the "most recent" estimate for a lote+year (FINAL > CUARTA > ... > PRIMERA)
  const getLatestEstimate = (year: string, loteId: string) => {
    for (let i = ESTIMATE_TYPES.length - 1; i >= 0; i--) {
      const e = getEstimate(year, loteId, ESTIMATE_TYPES[i]);
      if (e) return e;
    }
    return null;
  };

  const handleStartEdit = (loteId: string, year: string, type: string) => {
    if (!canWrite) return;
    const existing = getEstimate(year, loteId, type);
    setEditing({ loteId, year, type });
    setEditValue(existing ? String(existing.lbPerPlant) : "");
  };

  const handleCancelEdit = () => {
    setEditing(null);
    setEditValue("");
  };

  const handleSave = useCallback(async () => {
    if (!editing) return;
    const value = parseFloat(editValue);
    if (isNaN(value) || value < 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/estimaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agriculturalYear: editing.year,
          loteId: editing.loteId,
          estimateType: editing.type,
          estimateDate: new Date().toISOString().split("T")[0],
          lbPerPlant: value,
        }),
      });

      if (res.ok) {
        const saved: EstimateData = await res.json();
        setLocalEstimates((prev) => {
          const key = `${saved.agriculturalYear}:${saved.loteId}:${saved.estimateType}`;
          const filtered = prev.filter(
            (e) =>
              `${e.agriculturalYear}:${e.loteId}:${e.estimateType}` !== key,
          );
          return [...filtered, saved];
        });
      }
    } catch {
      // silent fail — user can retry
    }
    setSaving(false);
    setEditing(null);
    setEditValue("");
  }, [editing, editValue]);

  const activeLotes = lotes.filter((l) => l.isActive);

  // Totals for the active year
  let totalQqMaduro = 0;
  let totalQqOro = 0;
  for (const lote of activeLotes) {
    const latest = getLatestEstimate(activeYear, lote.id);
    if (latest?.qqMaduroPerLote) totalQqMaduro += latest.qqMaduroPerLote;
    if (latest?.qqOroPerLote) totalQqOro += latest.qqOroPerLote;
  }

  return (
    <div>
      {/* Year tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-finca-100 p-1">
        {AGRICULTURAL_YEARS.map((y) => (
          <button
            key={y}
            onClick={() => setActiveYear(y)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeYear === y
                ? "bg-white text-finca-900 shadow-sm"
                : "text-finca-500 hover:text-finca-700"
            }`}
          >
            {formatAgriculturalYear(y)}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Total qq Maduro
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {formatDecimal(totalQqMaduro)}
          </p>
        </div>
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Total qq Oro
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {formatDecimal(totalQqOro)}
          </p>
        </div>
        <div className="hidden rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm sm:block">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Meta
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-earth-600">
            {TARGET_QQ_ORO_MZ} qq oro/mz
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-finca-100 bg-finca-50/50">
              <th className="sticky left-0 z-10 bg-finca-50/50 px-4 py-3 font-medium text-finca-600">
                Lote
              </th>
              <th className="px-3 py-3 text-right font-medium text-finca-600">Área (mz)</th>
              <th className="px-3 py-3 text-right font-medium text-finca-600">Plantas</th>
              {ESTIMATE_TYPES.map((type) => (
                <th
                  key={type}
                  className="px-3 py-3 text-center font-medium text-finca-600"
                >
                  {ESTIMATE_TYPE_LABELS[type]}
                </th>
              ))}
              <th className="px-3 py-3 text-right font-medium text-finca-600">
                qq Mad/Lote
              </th>
              <th className="px-3 py-3 text-right font-medium text-finca-600">
                qq Oro/mz
              </th>
              <th className="px-3 py-3 text-right font-medium text-finca-600">
                qq Oro/Lote
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-50">
            {activeLotes.map((lote) => {
              const latest = getLatestEstimate(activeYear, lote.id);
              const derived = latest
                ? {
                    qqMaduroPerLote: latest.qqMaduroPerLote,
                    qqOroPerLote: latest.qqOroPerLote,
                    qqOroPerManzana: latest.qqOroPerManzana,
                  }
                : { qqMaduroPerLote: null, qqOroPerLote: null, qqOroPerManzana: null };

              return (
                <tr key={lote.id} className="transition-colors hover:bg-finca-50/30">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-finca-900">
                    {lote.name}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-finca-600">
                    {lote.areaManzanas !== null ? formatDecimal(lote.areaManzanas) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-finca-600">
                    {lote.plantCount !== null
                      ? lote.plantCount.toLocaleString("es-GT")
                      : "—"}
                  </td>
                  {ESTIMATE_TYPES.map((type) => {
                    const est = getEstimate(activeYear, lote.id, type);
                    const isEditing =
                      editing?.loteId === lote.id &&
                      editing?.year === activeYear &&
                      editing?.type === type;

                    return (
                      <td
                        key={type}
                        className="px-1 py-1 text-center"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSave();
                                if (e.key === "Escape") handleCancelEdit();
                              }}
                              autoFocus
                              className="w-16 rounded border border-earth-400 px-1.5 py-1 text-center text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-earth-400"
                              disabled={saving}
                            />
                            <button
                              onClick={handleSave}
                              disabled={saving}
                              className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50"
                            >
                              <Save className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="rounded p-0.5 text-finca-400 hover:bg-finca-50"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              handleStartEdit(lote.id, activeYear, type)
                            }
                            disabled={!canWrite}
                            className={`group inline-flex items-center gap-1 rounded px-2 py-1 text-xs tabular-nums transition-colors ${
                              est
                                ? "font-medium text-finca-900 hover:bg-finca-50"
                                : "text-finca-300 hover:bg-finca-50 hover:text-finca-500"
                            } ${!canWrite ? "cursor-default" : "cursor-pointer"}`}
                            title={
                              est
                                ? `${est.lbPerPlant} lb/planta`
                                : "Sin estimación"
                            }
                          >
                            {est ? formatDecimal(est.lbPerPlant) : "—"}
                            {canWrite && (
                              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50" />
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right tabular-nums text-finca-700">
                    {derived.qqMaduroPerLote !== null
                      ? formatDecimal(derived.qqMaduroPerLote)
                      : "—"}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums font-medium ${getQqOroMzColor(derived.qqOroPerManzana)} rounded`}
                  >
                    {derived.qqOroPerManzana !== null
                      ? formatDecimal(derived.qqOroPerManzana)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-finca-700">
                    {derived.qqOroPerLote !== null
                      ? formatDecimal(derived.qqOroPerLote)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-finca-200 bg-finca-50/30">
              <td
                colSpan={3 + ESTIMATE_TYPES.length}
                className="px-4 py-3 text-right text-sm font-medium text-finca-600"
              >
                Totales
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-sm font-semibold text-finca-900">
                {formatDecimal(totalQqMaduro)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-sm font-semibold text-earth-600">
                —
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-sm font-semibold text-finca-900">
                {formatDecimal(totalQqOro)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-finca-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          {"\u2265"} {TARGET_QQ_ORO_MZ} qq oro/mz
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          15 – {TARGET_QQ_ORO_MZ - 1} qq oro/mz
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          {"<"} 15 qq oro/mz
        </span>
        <span className="text-finca-400">
          Rendimiento: {DEFAULT_RENDIMIENTO}:1
        </span>
      </div>
    </div>
  );
}
