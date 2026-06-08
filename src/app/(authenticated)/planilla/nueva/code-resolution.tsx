"use client";

// =============================================================================
// Resolution tree for unrecognized activity / lote CODES from a planilla import.
//
// One row per code: "¿Existe o es nuevo?"
//   Existe → search/autocomplete the catalog → select.
//   Nuevo  → create it (activity: nombre + unidad + precio · lote: nombre).
// Every choice is LEARNED server-side (NotebookDictionary), so the same code
// resolves automatically on every future import — the user is asked only once.
// Mirrors worker-resolution.tsx; default here is "Existe" since most codes exist.
// =============================================================================

import { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, Plus, Search, Loader2 } from "lucide-react";
import type { PriceVigencia } from "@/lib/pricing/resolve-price";

const UNIT_OPTIONS = [
  { value: "QUINTAL", label: "Quintal (qq)" },
  { value: "MANZANA", label: "Manzana (mz)" },
  { value: "HECTAREA", label: "Hectárea (ha)" },
  { value: "DIA", label: "Día" },
] as const;

export type CodeItem = { kind: "activity" | "lote"; code: string; count: number };

export type CodeResolved = {
  kind: "activity" | "lote";
  code: string;
  id: string;
  name: string;
  priceSchedule?: PriceVigencia[];
  defaultPrice?: number;
};

type CatalogOption = { id: string; name: string };

type RowState = {
  mode: "map" | "create" | "none";
  mapToId: string;
  mapToName: string;
  search: string;
  newName: string;
  newUnit: string;
  newPrice: string;
};

type Props = {
  items: CodeItem[];
  activities: CatalogOption[];
  lotes: CatalogOption[];
  onResolved: (resolved: Record<string, CodeResolved>) => void;
  onCancel: () => void;
};

const keyOf = (it: CodeItem) => `${it.kind}::${it.code}`;

export function CodeResolution({ items, activities, lotes, onResolved, onCancel }: Props) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, RowState> = {};
    for (const it of items) {
      initial[keyOf(it)] = {
        mode: "map",
        mapToId: "",
        mapToName: "",
        search: "",
        newName: it.code,
        newUnit: "DIA",
        newPrice: "",
      };
    }
    setRows(initial);
  }, [items]);

  function update(key: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setErrors((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  }

  function isResolved(it: CodeItem): boolean {
    const r = rows[keyOf(it)];
    if (!r) return false;
    if (r.mode === "none") return true;
    if (r.mode === "map") return Boolean(r.mapToId);
    return Boolean(r.newName.trim()) && (it.kind === "lote" || Boolean(r.newUnit));
  }

  const resolvedCount = items.filter(isResolved).length;
  const allResolved = resolvedCount === items.length;

  function catalogFor(kind: "activity" | "lote"): CatalogOption[] {
    return kind === "activity" ? activities : lotes;
  }

  function filtered(it: CodeItem): CatalogOption[] {
    const s = (rows[keyOf(it)]?.search ?? "").toLowerCase();
    const list = catalogFor(it.kind);
    return s ? list.filter((o) => o.name.toLowerCase().includes(s)) : list;
  }

  async function handleContinue() {
    setSaving(true);
    setErrors({});
    const resolved: Record<string, CodeResolved> = {};
    const newErrors: Record<string, string> = {};

    for (const it of items) {
      const key = keyOf(it);
      const r = rows[key];
      if (!r) continue;

      const body =
        r.mode === "none"
          ? { kind: it.kind, code: it.code, mode: "none" }
          : r.mode === "map"
            ? { kind: it.kind, code: it.code, mode: "map", targetId: r.mapToId }
            : it.kind === "activity"
              ? { kind: "activity", code: it.code, mode: "create", name: r.newName.trim(), unit: r.newUnit, price: parseFloat(r.newPrice) || 0 }
              : { kind: "lote", code: it.code, mode: "create", name: r.newName.trim() };

      try {
        const res = await fetch("/api/planilla/resolve-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          newErrors[key] = data.error || "Error al resolver";
          continue;
        }
        resolved[key] = {
          kind: it.kind,
          code: it.code,
          id: data.id,
          name: data.name,
          priceSchedule: data.priceSchedule,
          defaultPrice: data.defaultPrice,
        };
      } catch {
        newErrors[key] = "Error de conexión";
      }
    }

    setSaving(false);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onResolved(resolved);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-finca-900">Códigos no reconocidos</h2>
        <p className="mt-1 text-sm text-finca-500">
          Para cada código: indique si <strong>ya existe</strong> (búsquelo y selecciónelo) o
          si es <strong>nuevo</strong> (créelo). El sistema lo recordará — no se le volverá a
          preguntar en futuras planillas.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-finca-100">
          <div className="h-2 rounded-full bg-finca-600 transition-all" style={{ width: `${(resolvedCount / items.length) * 100}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-finca-500">{resolvedCount} / {items.length}</span>
      </div>

      <div className="divide-y divide-finca-100 rounded-lg border border-finca-200">
        {items.map((it) => {
          const key = keyOf(it);
          const r = rows[key];
          if (!r) return null;
          const resolved = isResolved(it);
          const rowError = errors[key];

          return (
            <div key={key} className={`px-4 py-3 ${resolved ? "bg-white" : "border-l-2 border-l-amber-400 bg-amber-50/30"}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {resolved ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-finca-900">
                    <span className="font-mono">{it.code}</span>
                    <span className="ml-2 rounded-full bg-finca-100 px-2 py-0.5 text-xs font-normal text-finca-500">
                      {it.kind === "activity" ? "actividad" : "lote"} · {it.count} fila(s)
                    </span>
                  </p>

                  {/* Mode toggle */}
                  <div className="mt-2 inline-flex rounded-lg border border-finca-200 bg-finca-50 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => update(key, { mode: "map" })}
                      className={`flex items-center gap-1 rounded-md px-3 py-1 font-medium ${r.mode === "map" ? "bg-white text-finca-900 shadow-sm" : "text-finca-500"}`}
                    >
                      <Search className="h-3 w-3" /> Ya existe
                    </button>
                    <button
                      type="button"
                      onClick={() => update(key, { mode: "create" })}
                      className={`flex items-center gap-1 rounded-md px-3 py-1 font-medium ${r.mode === "create" ? "bg-white text-finca-900 shadow-sm" : "text-finca-500"}`}
                    >
                      <Plus className="h-3 w-3" /> Es nuevo
                    </button>
                    {it.kind === "lote" && (
                      <button
                        type="button"
                        onClick={() => update(key, { mode: "none" })}
                        className={`rounded-md px-3 py-1 font-medium ${r.mode === "none" ? "bg-white text-finca-900 shadow-sm" : "text-finca-500"}`}
                      >
                        Sin lote
                      </button>
                    )}
                  </div>

                  {r.mode === "none" && (
                    <p className="mt-2 text-xs text-finca-500">Estas filas quedarán sin lote.</p>
                  )}

                  {/* Existe → search + select */}
                  {r.mode === "map" && (
                    <div className="mt-2 space-y-1.5">
                      <input
                        type="text"
                        placeholder={`Buscar ${it.kind === "activity" ? "actividad" : "lote"}...`}
                        value={r.search}
                        onChange={(e) => update(key, { search: e.target.value })}
                        className="w-full rounded-md border border-finca-200 px-3 py-1.5 text-sm focus:border-finca-400 focus:outline-none focus:ring-1 focus:ring-finca-400"
                      />
                      <div className="max-h-44 overflow-y-auto rounded-md border border-finca-200 bg-white">
                        {filtered(it).length === 0 ? (
                          <p className="px-3 py-2 text-sm text-finca-400">Sin resultados</p>
                        ) : (
                          filtered(it).map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => update(key, { mapToId: o.id, mapToName: o.name })}
                              className={`flex w-full px-3 py-2 text-left text-sm hover:bg-finca-50 ${r.mapToId === o.id ? "bg-finca-100 font-medium" : ""}`}
                            >
                              {o.name}
                            </button>
                          ))
                        )}
                      </div>
                      {r.mapToId && (
                        <p className="text-xs text-finca-600">Vinculado a: <span className="font-medium">{r.mapToName}</span></p>
                      )}
                    </div>
                  )}

                  {/* Nuevo → create form */}
                  {r.mode === "create" && (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div>
                        <label className="mb-0.5 block text-xs text-finca-500">Nombre</label>
                        <input
                          type="text"
                          value={r.newName}
                          onChange={(e) => update(key, { newName: e.target.value })}
                          className="w-48 rounded-md border border-finca-200 px-2 py-1 text-sm focus:border-finca-400 focus:outline-none focus:ring-1 focus:ring-finca-400"
                        />
                      </div>
                      {it.kind === "activity" && (
                        <>
                          <div>
                            <label className="mb-0.5 block text-xs text-finca-500">Unidad</label>
                            <select
                              value={r.newUnit}
                              onChange={(e) => update(key, { newUnit: e.target.value })}
                              className="rounded-md border border-finca-200 px-2 py-1 text-sm focus:border-finca-400 focus:outline-none focus:ring-1 focus:ring-finca-400"
                            >
                              {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs text-finca-500">Precio (Q)</label>
                            <input
                              type="number" step="0.01" min="0" inputMode="decimal"
                              value={r.newPrice}
                              onChange={(e) => update(key, { newPrice: e.target.value })}
                              placeholder="0.00"
                              className="w-24 rounded-md border border-finca-200 px-2 py-1 text-right text-sm tabular-nums focus:border-finca-400 focus:outline-none focus:ring-1 focus:ring-finca-400"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {rowError && <p className="mt-1.5 text-xs text-red-600">{rowError}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleContinue}
          disabled={!allResolved || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
        >
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <><CheckCircle className="h-4 w-4" /> Continuar</>}
        </button>
        <button onClick={onCancel} disabled={saving} className="rounded-lg border border-finca-200 px-4 py-2.5 text-sm font-medium text-finca-600 hover:bg-finca-50 disabled:opacity-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}
