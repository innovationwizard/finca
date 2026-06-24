"use client";

// =============================================================================
// src/app/(authenticated)/planilla/autorizacion/records-table.tsx
// Granular activity-record table for the open period, with Excel-style per-column
// dropdown filters (multi-select distinct values) — parity with the xlsx
// autofilter the auditor relies on. One row per (worker · día · actividad).
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { Filter, ArrowUp, ArrowDown, X } from "lucide-react";
import { formatGTQ } from "@/lib/utils/format";

export type RecordRow = {
  id: string;
  date: string; // ISO yyyy-mm-dd
  worker: string;
  lote: string;
  code: string;
  activity: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type ColKey = "date" | "worker" | "lote" | "code" | "activity" | "quantity" | "unitPrice" | "total";

const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const qty = (q: number) => q.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Col = { key: ColKey; label: string; numeric?: boolean; text: (r: RecordRow) => string; sortVal: (r: RecordRow) => string | number };

const COLUMNS: Col[] = [
  { key: "date", label: "Fecha", text: (r) => fmtDate(r.date), sortVal: (r) => r.date },
  { key: "worker", label: "Trabajador", text: (r) => r.worker, sortVal: (r) => r.worker },
  { key: "lote", label: "Lote", text: (r) => r.lote || "—", sortVal: (r) => r.lote || "" },
  { key: "code", label: "Actividad", text: (r) => r.code || "—", sortVal: (r) => r.code || "" },
  { key: "activity", label: "Nombre Actividad", text: (r) => r.activity, sortVal: (r) => r.activity },
  { key: "quantity", label: "Cantidad", numeric: true, text: (r) => qty(r.quantity), sortVal: (r) => r.quantity },
  { key: "unitPrice", label: "Costo/Unidad", numeric: true, text: (r) => formatGTQ(r.unitPrice), sortVal: (r) => r.unitPrice },
  { key: "total", label: "Costo Total", numeric: true, text: (r) => formatGTQ(r.total), sortVal: (r) => r.total },
];

export function RecordsTable({ records }: { records: RecordRow[] }) {
  const [filters, setFilters] = useState<Partial<Record<ColKey, Set<string>>>>({});
  const [sort, setSort] = useState<{ key: ColKey; dir: "asc" | "desc" }>({ key: "date", dir: "asc" });
  const [open, setOpen] = useState<{ key: ColKey; top: number; left: number } | null>(null);
  const [popSearch, setPopSearch] = useState("");

  useEffect(() => { setPopSearch(""); }, [open?.key]);

  // Distinct display values per column, sorted by the column's natural order.
  const distinct = useMemo(() => {
    const out = {} as Record<ColKey, string[]>;
    for (const c of COLUMNS) {
      const map = new Map<string, string | number>();
      for (const r of records) { const t = c.text(r); if (!map.has(t)) map.set(t, c.sortVal(r)); }
      out[c.key] = [...map.entries()]
        .sort((a, b) => (typeof a[1] === "number" && typeof b[1] === "number" ? a[1] - b[1] : String(a[1]).localeCompare(String(b[1]))))
        .map(([t]) => t);
    }
    return out;
  }, [records]);

  const colOf = (k: ColKey) => COLUMNS.find((c) => c.key === k)!;

  const isActive = (k: ColKey) => { const s = filters[k]; return !!s && s.size > 0 && s.size < distinct[k].length; };

  const toggleValue = (k: ColKey, val: string) => {
    setFilters((prev) => {
      const all = distinct[k];
      const cur = prev[k] ? new Set(prev[k]) : new Set(all);
      if (cur.has(val)) cur.delete(val); else cur.add(val);
      const next = { ...prev };
      if (cur.size === all.length) delete next[k]; else next[k] = cur;
      return next;
    });
  };
  const clearCol = (k: ColKey) => setFilters((prev) => { const n = { ...prev }; delete n[k]; return n; });
  const clearAll = () => setFilters({});
  const anyActive = COLUMNS.some((c) => isActive(c.key));

  const visible = useMemo(() => {
    const rows = records.filter((r) => COLUMNS.every((c) => { const s = filters[c.key]; return !s || s.size === 0 || s.has(c.text(r)); }));
    const c = colOf(sort.key);
    rows.sort((a, b) => {
      const av = c.sortVal(a), bv = c.sortVal(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [records, filters, sort]);

  const totalCost = useMemo(() => visible.reduce((s, r) => s + r.total, 0), [visible]);

  const toggleSort = (k: ColKey) => setSort((prev) => (prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

  const openFilter = (k: ColKey, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOpen(open?.key === k ? null : { key: k, top: rect.bottom + 4, left: rect.left });
  };

  const popValues = open ? distinct[open.key].filter((v) => v.toLowerCase().includes(popSearch.trim().toLowerCase())) : [];

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-sm text-finca-500">
        <span>{visible.length} de {records.length} registros</span>
        {anyActive && (
          <button onClick={clearAll} className="inline-flex items-center gap-1 rounded-md border border-finca-200 px-2 py-1 text-xs text-finca-600 hover:bg-finca-50">
            <X className="h-3 w-3" /> Limpiar filtros
          </button>
        )}
        <span className="ml-auto">Costo total: <span className="font-semibold tabular-nums text-finca-900">{formatGTQ(totalCost)}</span></span>
      </div>

      <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-finca-50 text-finca-600">
              {COLUMNS.map((c) => (
                <th key={c.key} className={`sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 font-medium ${c.numeric ? "text-right" : ""}`}>
                  <div className={`flex items-center gap-1 ${c.numeric ? "justify-end" : ""}`}>
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-0.5 hover:text-finca-900">
                      {c.label}
                      {sort.key === c.key && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                    <button
                      onClick={(e) => openFilter(c.key, e)}
                      title="Filtrar"
                      className={`rounded p-0.5 hover:bg-finca-100 ${isActive(c.key) ? "text-earth-600" : "text-finca-300"}`}
                    >
                      <Filter className="h-3 w-3" fill={isActive(c.key) ? "currentColor" : "none"} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="hover:bg-finca-50/40">
                <td className="whitespace-nowrap border border-finca-100 px-2 py-1.5 tabular-nums text-finca-600">{fmtDate(r.date)}</td>
                <td className="whitespace-nowrap border border-finca-100 px-2 py-1.5 font-medium text-finca-900">{r.worker}</td>
                <td className="whitespace-nowrap border border-finca-100 px-2 py-1.5 text-finca-600">{r.lote || "—"}</td>
                <td className="border border-finca-100 px-2 py-1.5 text-finca-600">{r.code || "—"}</td>
                <td className="whitespace-nowrap border border-finca-100 px-2 py-1.5 text-finca-700">{r.activity}</td>
                <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums text-finca-700">{qty(r.quantity)}</td>
                <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums text-finca-600">{formatGTQ(r.unitPrice)}</td>
                <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums font-semibold text-finca-900">{formatGTQ(r.total)}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={COLUMNS.length} className="border border-finca-100 px-3 py-8 text-center text-finca-400">Sin registros que coincidan con los filtros.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-finca-50/60 font-semibold text-finca-900">
              <td colSpan={COLUMNS.length - 1} className="border border-finca-100 px-2 py-2 text-right">Costo total</td>
              <td className="border border-finca-100 px-2 py-2 text-right tabular-nums">{formatGTQ(totalCost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Excel-style column filter popover (fixed, so the scroll container can't clip it) */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />
          <div className="fixed z-50 w-60 rounded-lg border border-finca-200 bg-white p-2 shadow-xl" style={{ top: open.top, left: open.left }}>
            <input
              type="text"
              autoFocus
              value={popSearch}
              onChange={(e) => setPopSearch(e.target.value)}
              placeholder="Buscar…"
              className="mb-2 w-full rounded border border-finca-200 px-2 py-1 text-xs focus:border-earth-400 focus:outline-none"
            />
            <div className="mb-2 flex items-center justify-between text-xs">
              <button onClick={() => clearCol(open.key)} className="text-earth-600 hover:underline">Seleccionar todo</button>
              <span className="text-finca-400">{distinct[open.key].length} valores</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {popValues.map((v) => {
                const sel = filters[open.key];
                const checked = !sel || sel.has(v);
                return (
                  <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-finca-50">
                    <input type="checkbox" checked={checked} onChange={() => toggleValue(open.key, v)} className="h-3.5 w-3.5 rounded border-finca-300" />
                    <span className="truncate" title={v}>{v}</span>
                  </label>
                );
              })}
              {popValues.length === 0 && <p className="px-1 py-2 text-xs text-finca-400">Sin valores.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
