"use client";

// =============================================================================
// src/app/(authenticated)/planilla/autorizacion/autorizacion-client.tsx
// Shared payroll review screen. KPI cards → exception catalog → charts → dense
// sortable/filterable table (sticky header + sticky worker column). MASTER/ADMIN
// see "Autorizar pago" (warn-only: always enabled), which closes the period.
// =============================================================================

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, X, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatGTQ } from "@/lib/utils/format";

type FlagKey = "sinCuenta" | "cuentaCompartida" | "pagoSinTrabajo" | "inactivoConPago" | "ajusteSinNota" | "variacion";
type Row = {
  workerId: string;
  name: string;
  category: "VOLUNTARIO" | "FIJO";
  devengado: number;
  septimo: number;
  adicionales: number;
  descuentos: number;
  totalToPay: number;
  banco: string;
  cuenta: string;
  isActive: boolean;
  prevTotal: number | null;
  flags: Record<FlagKey, boolean>;
};
type Period = { id: string; periodNumber: number; startDate: string; endDate: string };

const FLAG_META: Record<FlagKey, { label: string; severity: "alta" | "media" }> = {
  sinCuenta: { label: "Sin cuenta", severity: "alta" },
  inactivoConPago: { label: "Inactivo con pago", severity: "alta" },
  pagoSinTrabajo: { label: "Pago sin trabajo", severity: "alta" },
  cuentaCompartida: { label: "Cuenta compartida", severity: "media" },
  ajusteSinNota: { label: "Ajuste sin nota", severity: "media" },
  variacion: { label: "Variación alta", severity: "media" },
};
const FLAG_ORDER = Object.keys(FLAG_META) as FlagKey[];

const sevClass = (s: "alta" | "media") =>
  s === "alta" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";

export function AutorizacionClient({
  period,
  canAuthorize,
  rows,
  kpis,
  histogram,
  composition,
  prevPeriodNumber,
}: {
  period: Period;
  canAuthorize: boolean;
  rows: Row[];
  kpis: { totalToPay: number; workerCount: number; exceptionWorkerCount: number; sinCuentaCount: number };
  histogram: { label: string; count: number }[];
  composition: { category: string; total: number; count: number }[];
  prevPeriodNumber: number | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"" | "VOLUNTARIO" | "FIJO">("");
  const [onlyExceptions, setOnlyExceptions] = useState(false);
  const [onlyAdjustments, setOnlyAdjustments] = useState(false);
  const [flagFilter, setFlagFilter] = useState<FlagKey | null>(null);
  const [sort, setSort] = useState<"name" | "pay">("name");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Count per flag for the exception panel.
  const flagCounts = useMemo(() => {
    const c = Object.fromEntries(FLAG_ORDER.map((k) => [k, 0])) as Record<FlagKey, number>;
    for (const r of rows) for (const k of FLAG_ORDER) if (r.flags[k]) c[k]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (category && r.category !== category) return false;
      if (onlyExceptions && !Object.values(r.flags).some(Boolean)) return false;
      if (onlyAdjustments && r.adicionales === 0 && r.descuentos === 0) return false;
      if (flagFilter && !r.flags[flagFilter]) return false;
      return true;
    });
    out.sort((a, b) => (sort === "pay" ? b.totalToPay - a.totalToPay : a.name.localeCompare(b.name)));
    return out;
  }, [rows, search, category, onlyExceptions, onlyAdjustments, flagFilter, sort]);

  const filteredTotal = useMemo(() => filtered.reduce((s, r) => s + r.totalToPay, 0), [filtered]);

  const authorize = useCallback(async () => {
    setAuthorizing(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay-periods/${period.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al autorizar"); setAuthorizing(false); return; }
      setConfirmOpen(false);
      router.refresh();
    } catch {
      setError("Error de conexión");
      setAuthorizing(false);
    }
  }, [period.id, router]);

  const maxComposition = Math.max(1, ...composition.map((c) => c.total));

  return (
    <div className="mx-auto max-w-full px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-finca-900">Revisión y Autorización</h1>
          <p className="mt-1 text-sm text-finca-500">
            Semana {period.periodNumber} · {period.startDate} — {period.endDate} · Coteje contra el estado de cuenta BANRURAL antes de autorizar.
          </p>
        </div>
        {canAuthorize && (
          <button
            onClick={() => { setError(null); setConfirmOpen(true); }}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-finca-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800"
          >
            <ShieldCheck className="h-4 w-4" />
            Autorizar pago
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total a Pagar" value={formatGTQ(kpis.totalToPay)} />
        <Kpi label="Trabajadores" value={String(kpis.workerCount)} />
        <Kpi label="Con excepciones" value={String(kpis.exceptionWorkerCount)} tone={kpis.exceptionWorkerCount > 0 ? "warn" : undefined} />
        <Kpi label="Sin cuenta bancaria" value={String(kpis.sinCuentaCount)} tone={kpis.sinCuentaCount > 0 ? "danger" : undefined} />
      </div>

      {/* Exception catalog (click to filter) */}
      <div className="mt-4 rounded-xl border border-finca-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-finca-500">Excepciones (clic para filtrar)</p>
        <div className="flex flex-wrap gap-2">
          {FLAG_ORDER.map((k) => {
            const count = flagCounts[k];
            const active = flagFilter === k;
            return (
              <button
                key={k}
                onClick={() => setFlagFilter(active ? null : k)}
                disabled={count === 0 && !active}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                  active ? "bg-finca-900 text-white" : `${sevClass(FLAG_META[k].severity)} hover:opacity-80`
                }`}
              >
                {FLAG_META[k].label}
                <span className="tabular-nums">{count}</span>
              </button>
            );
          })}
          {flagFilter && (
            <button onClick={() => setFlagFilter(null)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-finca-500 hover:text-finca-800">
              <X className="h-3 w-3" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-finca-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-finca-500">Distribución de pago (Q)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={histogram} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={48} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [`${Number(v)} trabajador(es)`, "Cantidad"]} labelFormatter={(l) => `Q${l}`} />
              <Bar dataKey="count" fill="#5b7c5b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-finca-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-finca-500">Composición por categoría</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={composition} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 24 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, maxComposition]} hide />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={72} />
              <Tooltip formatter={(v) => [formatGTQ(Number(v)), "Total"]} />
              <Bar dataKey="total" radius={[0, 3, 3, 0]}>
                {composition.map((_, i) => <Cell key={i} fill={i === 0 ? "#5b7c5b" : "#a98467"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar trabajador…"
          className="w-full rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm placeholder:text-finca-300 focus:border-earth-400 focus:outline-none sm:w-64"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none">
          <option value="">Todas las categorías</option>
          <option value="VOLUNTARIO">Voluntario</option>
          <option value="FIJO">Fijo</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none">
          <option value="name">Ordenar: Nombre</option>
          <option value="pay">Ordenar: Total a Pagar</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-finca-600">
          <input type="checkbox" checked={onlyExceptions} onChange={(e) => setOnlyExceptions(e.target.checked)} className="h-4 w-4 rounded border-finca-300" />
          Solo excepciones
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm text-finca-600">
          <input type="checkbox" checked={onlyAdjustments} onChange={(e) => setOnlyAdjustments(e.target.checked)} className="h-4 w-4 rounded border-finca-300" />
          Solo con ajustes
        </label>
        <span className="ml-auto text-sm text-finca-500">
          {filtered.length} de {rows.length} · <span className="font-semibold tabular-nums text-finca-900">{formatGTQ(filteredTotal)}</span>
        </span>
      </div>

      {/* Detail table */}
      <div className="mt-3 max-h-[calc(100vh-16rem)] overflow-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-finca-50 text-finca-600">
              <th className="sticky left-0 top-0 z-30 border border-finca-100 bg-finca-50 px-3 py-2 font-medium">Trabajador</th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 font-medium">Cat.</th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium">Devengado</th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium">Séptimo</th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium">Adicionales</th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium">Descuentos</th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 text-right font-medium">Total a Pagar</th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 font-medium">Banco</th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 font-medium">Cuenta</th>
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-2 font-medium">Excepciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.workerId} className="hover:bg-finca-50/40">
                <td className="sticky left-0 z-10 whitespace-nowrap border border-finca-100 bg-white px-3 py-1.5 font-medium text-finca-900">{r.name}</td>
                <td className="border border-finca-100 px-2 py-1.5 text-finca-500">{r.category === "VOLUNTARIO" ? "Vol." : "Fijo"}</td>
                <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums text-finca-700">{formatGTQ(r.devengado)}</td>
                <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums text-finca-700">{formatGTQ(r.septimo)}</td>
                <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums text-finca-700">{r.adicionales ? formatGTQ(r.adicionales) : "—"}</td>
                <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums text-finca-700">{r.descuentos ? formatGTQ(r.descuentos) : "—"}</td>
                <td className="border border-finca-100 px-2 py-1.5 text-right tabular-nums font-semibold text-finca-900">{formatGTQ(r.totalToPay)}</td>
                <td className="whitespace-nowrap border border-finca-100 px-2 py-1.5 text-finca-500">{r.banco || "—"}</td>
                <td className="whitespace-nowrap border border-finca-100 px-2 py-1.5 tabular-nums text-finca-500">{r.cuenta || "—"}</td>
                <td className="border border-finca-100 px-2 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {FLAG_ORDER.filter((k) => r.flags[k]).map((k) => (
                      <span key={k} className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${sevClass(FLAG_META[k].severity)}`} title={FLAG_META[k].label}>
                        {FLAG_META[k].label}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="border border-finca-100 px-3 py-8 text-center text-finca-400">Sin resultados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!canAuthorize && (
        <p className="mt-3 text-xs text-finca-400">Vista de auditoría (solo lectura). La autorización la realiza un administrador.</p>
      )}

      {/* Authorize confirm */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={(e) => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-finca-100 px-5 py-4">
              <h2 className="text-base font-semibold text-finca-900">Autorizar pago — período {period.periodNumber}</h2>
              <button onClick={() => setConfirmOpen(false)} className="rounded-lg p-1.5 text-finca-400 hover:bg-finca-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-finca-700">
                Vas a autorizar el pago de <b>{formatGTQ(kpis.totalToPay)}</b> a <b>{kpis.workerCount}</b> trabajador(es).
              </p>
              {kpis.exceptionWorkerCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Hay <b>{kpis.exceptionWorkerCount}</b> trabajador(es) con excepciones sin resolver. Puedes autorizar de todas formas, pero revísalas primero.</span>
                </div>
              )}
              <div className="rounded-lg border border-finca-200 bg-finca-50 px-4 py-3 text-sm text-finca-700">
                Al autorizar, el período queda <b>cerrado y bloqueado</b> (no más captura ni ajustes) y se abre automáticamente el siguiente. Hazlo solo tras cotejar con el estado de cuenta.
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setConfirmOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-finca-600 hover:bg-finca-50">Cancelar</button>
                <button onClick={authorize} disabled={authorizing} className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-4 py-2 text-sm font-medium text-white hover:bg-finca-800 disabled:opacity-50">
                  {authorizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {authorizing ? "Autorizando…" : "Autorizar pago"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {prevPeriodNumber == null && (
        <p className="mt-2 text-xs text-finca-400">No hay período anterior para comparar variación.</p>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" }) {
  const valueColor = tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-finca-900";
  return (
    <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-finca-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}
