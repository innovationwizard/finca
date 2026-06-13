"use client";

// =============================================================================
// Weekly capture grid — emulates DATA MANUEL FLORES from PLANILLAFINCA.xlsx.
// Rows = workers, columns = days × (Lote, Actividad, Unidades). Dropdowns prevent
// the dirty free-text codes the xlsx suffers from. Saves one ActivityRecord per
// filled cell (price resolved by work date), reusing /api/planilla/batch.
// =============================================================================

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, ArrowRight, X, Plus, ChevronLeft, ChevronRight, CalendarPlus } from "lucide-react";
import { resolveActivityPrice, type PriceVigencia } from "@/lib/pricing/resolve-price";

type Worker = { id: string; name: string };
type Activity = { id: string; name: string; code: string | null; unit: string; defaultPrice: number; priceSchedule: PriceVigencia[] };
type Lote = { id: string; name: string };
type Period = { id: string; periodNumber: number; startDate: string; endDate: string; isClosed: boolean };
type Cell = { loteId: string; activityId: string; units: string };

const ROSTER_KEY = "finca-captura-roster";
const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function isoOf(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d); }
function mondayOfToday(): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return isoOf(d);
}
function dm(iso: string) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }

export function CapturaGrid({ workers, activities, lotes, periods, canManagePeriods }: { workers: Worker[]; activities: Activity[]; lotes: Lote[]; periods: Period[]; canManagePeriods: boolean }) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(mondayOfToday());
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [resolving, setResolving] = useState(false);

  // Roster: persisted client-side; defaults to all active workers.
  const [rosterIds, setRosterIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(ROSTER_KEY);
      if (saved) { try { const ids = JSON.parse(saved) as string[]; if (Array.isArray(ids) && ids.length) return ids; } catch { /* ignore */ } }
    }
    return workers.map((w) => w.id);
  });
  const persistRoster = useCallback((ids: string[]) => {
    setRosterIds(ids);
    if (typeof window !== "undefined") window.localStorage.setItem(ROSTER_KEY, JSON.stringify(ids));
  }, []);

  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const roster = useMemo(() => rosterIds.map((id) => workerById.get(id)).filter(Boolean) as Worker[], [rosterIds, workerById]);

  const days = useMemo(() => {
    // Mon–Sat (6 workdays). The séptimo is a computed attendance bonus, not an
    // enterable 7th day, so the grid never includes Sunday.
    return Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // A day may be in an OPEN period (enterable), a CLOSED period (historical,
  // locked), or NO period (truly uncovered → offer to open/extend). Distinguish
  // them so closed-period days are never mistaken for "uncovered".
  const coveringPeriod = useCallback((iso: string) => periods.find((p) => iso >= p.startDate && iso <= p.endDate) ?? null, [periods]);
  const openPeriodFor = useCallback((iso: string) => periods.find((p) => !p.isClosed && iso >= p.startDate && iso <= p.endDate) ?? null, [periods]);
  const dayClosed = useCallback((iso: string) => { const p = coveringPeriod(iso); return !!p && p.isClosed; }, [coveringPeriod]);
  const uncovered = useMemo(() => days.filter((d) => !coveringPeriod(d)), [days, coveringPeriod]);
  const closedDays = useMemo(() => days.filter((d) => dayClosed(d)), [days, dayClosed]);

  const key = (workerId: string, iso: string) => `${workerId}|${iso}`;
  const getCell = (workerId: string, iso: string): Cell => cells[key(workerId, iso)] ?? { loteId: "", activityId: "", units: "" };
  const setCell = useCallback((workerId: string, iso: string, patch: Partial<Cell>) => {
    setCells((prev) => ({ ...prev, [key(workerId, iso)]: { ...(prev[key(workerId, iso)] ?? { loteId: "", activityId: "", units: "" }), ...patch } }));
  }, []);

  // Copy a worker's first-day entry across the rest of the week (the xlsx is repetitive).
  const fillAcross = useCallback((workerId: string) => {
    setCells((prev) => {
      const src = prev[key(workerId, days[0])];
      if (!src?.activityId) return prev;
      const next = { ...prev };
      for (const d of days) next[key(workerId, d)] = { ...src };
      return next;
    });
  }, [days]);

  const priceFor = useCallback((activityId: string, iso: string) => {
    const a = activityById.get(activityId);
    return a ? resolveActivityPrice(a.priceSchedule, a.defaultPrice, iso) : 0;
  }, [activityById]);

  // Cost preview per worker.
  const workerTotal = useCallback((workerId: string) => {
    let t = 0;
    for (const d of days) {
      const c = getCell(workerId, d);
      if (c.activityId) { const u = parseFloat(c.units) || 1; t += u * priceFor(c.activityId, d); }
    }
    return t;
  }, [days, cells, priceFor]); // eslint-disable-line react-hooks/exhaustive-deps

  const grandTotal = useMemo(() => roster.reduce((s, w) => s + workerTotal(w.id), 0), [roster, workerTotal]);

  const filledCount = useMemo(() => Object.values(cells).filter((c) => c.activityId).length, [cells]);

  const handleSave = useCallback(async () => {
    if (uncovered.length > 0) { setMsg({ kind: "err", text: `Hay días sin período de pago (${uncovered.map(dm).join(", ")}). Resuélvalo en el aviso de arriba antes de guardar.` }); return; }
    const rows: Record<string, unknown>[] = [];
    for (const w of roster) {
      for (const d of days) {
        const c = getCell(w.id, d);
        if (!c.activityId) continue;
        const period = openPeriodFor(d);
        if (!period) continue; // closed/uncovered day — not enterable (inputs are disabled for these)
        const units = parseFloat(c.units) || 1;
        const price = priceFor(c.activityId, d);
        rows.push({
          workerId: w.id, activityId: c.activityId, loteId: c.loteId || null,
          date: d, quantity: units, unitPrice: price,
          totalEarned: Math.round(units * price * 100) / 100, payPeriodId: period.id,
        });
      }
    }
    if (rows.length === 0) { setMsg({ kind: "err", text: "No hay celdas llenas para guardar." }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/planilla/captura", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ kind: "err", text: data.error || "Error al guardar" }); setSaving(false); return; }
      setMsg({ kind: "ok", text: `${data.count ?? rows.length} registro(s) guardado(s).` });
      router.refresh();
    } catch {
      setMsg({ kind: "err", text: "Error de conexión" });
    } finally { setSaving(false); }
  }, [roster, days, cells, uncovered, priceFor, openPeriodFor, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const notInRoster = useMemo(() => {
    const set = new Set(rosterIds);
    const s = search.toLowerCase();
    return workers.filter((w) => !set.has(w.id) && (!s || w.name.toLowerCase().includes(s))).slice(0, 30);
  }, [workers, rosterIds, search]);

  // Resolve uncovered days in place (MASTER/ADMIN): extend the latest open
  // period to span them, or create one if none exists. Then refresh so the
  // days become coverable. Typed cells are preserved (client state survives).
  const resolveUncovered = useCallback(async () => {
    if (uncovered.length === 0) return;
    const minU = uncovered.reduce((a, b) => (a < b ? a : b));
    const maxU = uncovered.reduce((a, b) => (a > b ? a : b));
    setResolving(true);
    setMsg(null);
    try {
      let res: Response;
      const openPeriods = periods.filter((p) => !p.isClosed);
      if (openPeriods.length > 0) {
        const latest = openPeriods.reduce((a, b) => (a.endDate >= b.endDate ? a : b));
        const startDate = minU < latest.startDate ? minU : latest.startDate;
        const endDate = maxU > latest.endDate ? maxU : latest.endDate;
        res = await fetch(`/api/pay-periods/${latest.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate }),
        });
      } else {
        res = await fetch(`/api/pay-periods`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: minU, endDate: maxU }),
        });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg({ kind: "err", text: d.error || "No se pudo ajustar el período" });
        return;
      }
      router.refresh();
    } catch {
      setMsg({ kind: "err", text: "Error de red al ajustar el período" });
    } finally {
      setResolving(false);
    }
  }, [uncovered, periods, router]);

  return (
    <div className="mt-5">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded p-1 hover:bg-finca-50"><ChevronLeft className="h-4 w-4" /></button>
        <span className="font-medium text-finca-900">Semana {dm(days[0])} – {dm(days[days.length - 1])}</span>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded p-1 hover:bg-finca-50"><ChevronRight className="h-4 w-4" /></button>
        <span className="ml-auto text-finca-500">{roster.length} trabajadores · {filledCount} celdas · <span className="font-semibold text-finca-900">Q{grandTotal.toLocaleString("es-GT", { minimumFractionDigits: 2 })}</span></span>
        <button onClick={() => setAddOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-finca-200 px-2 py-1 text-finca-600 hover:bg-finca-50"><Plus className="h-3.5 w-3.5" /> Trabajador</button>
      </div>

      {uncovered.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>Sin período de pago para: <b>{uncovered.map(dm).join(", ")}</b>.</p>
          {canManagePeriods ? (
            <button
              onClick={resolveUncovered}
              disabled={resolving}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
              {periods.some((p) => !p.isClosed)
                ? `Extender período hasta ${dm(uncovered.reduce((a, b) => (a > b ? a : b)))}`
                : `Crear período ${dm(uncovered.reduce((a, b) => (a < b ? a : b)))} – ${dm(uncovered.reduce((a, b) => (a > b ? a : b)))}`}
            </button>
          ) : (
            <p className="mt-1 text-xs">Pídale a un administrador que extienda o abra el período para incluir estos días.</p>
          )}
        </div>
      )}
      {closedDays.length > 0 && (
        <div className="mb-3 rounded-lg border border-finca-200 bg-finca-50 px-4 py-2 text-sm text-finca-600">
          🔒 Días en período cerrado (histórico, no editable): <b>{closedDays.map(dm).join(", ")}</b>.
        </div>
      )}
      {msg && (
        <div className={`mb-3 rounded-lg border px-4 py-2 text-sm ${msg.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</div>
      )}

      {addOpen && (
        <div className="mb-3 rounded-lg border border-finca-200 bg-white p-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar trabajador para agregar..." className="mb-2 w-full rounded-md border border-finca-200 px-3 py-1.5 text-sm" />
          <div className="flex flex-wrap gap-1.5">
            {notInRoster.map((w) => (
              <button key={w.id} onClick={() => { persistRoster([...rosterIds, w.id]); setSearch(""); }} className="rounded-full border border-finca-200 px-2.5 py-1 text-xs text-finca-700 hover:bg-finca-50">+ {w.name}</button>
            ))}
            {notInRoster.length === 0 && <span className="text-xs text-finca-400">Sin resultados</span>}
          </div>
        </div>
      )}

      {/* The grid */}
      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="border-collapse text-xs">
          <thead>
            <tr className="bg-finca-50">
              <th className="sticky left-0 z-10 border border-finca-100 bg-finca-50 px-2 py-1.5 text-left font-medium text-finca-600">#</th>
              <th className="sticky left-8 z-10 border border-finca-100 bg-finca-50 px-2 py-1.5 text-left font-medium text-finca-600">Trabajador</th>
              {days.map((d, i) => (
                <th key={d} colSpan={3} className={`border border-finca-100 px-2 py-1.5 text-center font-medium ${dayClosed(d) ? "text-finca-300" : "text-finca-700"}`} title={dayClosed(d) ? "Período cerrado — histórico" : undefined}>
                  {DAY_LABELS[i]} {dm(d)}{dayClosed(d) ? " 🔒" : ""}
                </th>
              ))}
              <th className="border border-finca-100 px-2 py-1.5 text-right font-medium text-finca-600">Total</th>
            </tr>
            <tr className="bg-finca-50 text-finca-400">
              <th className="sticky left-0 z-10 border border-finca-100 bg-finca-50"></th>
              <th className="sticky left-8 z-10 border border-finca-100 bg-finca-50"></th>
              {days.map((d) => (
                <FragmentHeader key={d} />
              ))}
              <th className="border border-finca-100"></th>
            </tr>
          </thead>
          <tbody>
            {roster.map((w, idx) => (
              <tr key={w.id} className="hover:bg-finca-50/40">
                <td className="sticky left-0 z-10 border border-finca-100 bg-white px-2 py-1 text-finca-400">{idx + 1}</td>
                <td className="sticky left-8 z-10 border border-finca-100 bg-white px-2 py-1 font-medium text-finca-900 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {w.name}
                    <button onClick={() => fillAcross(w.id)} title="Copiar lunes a toda la semana" className="text-finca-300 hover:text-finca-600"><ArrowRight className="h-3 w-3" /></button>
                    <button onClick={() => persistRoster(rosterIds.filter((id) => id !== w.id))} title="Quitar de la lista" className="text-finca-300 hover:text-red-500"><X className="h-3 w-3" /></button>
                  </span>
                </td>
                {days.map((d) => {
                  const c = getCell(w.id, d);
                  const closed = dayClosed(d);
                  return (
                    <td key={d} colSpan={3} className={`border border-finca-100 p-0 ${closed ? "bg-finca-50/70" : ""}`}>
                      <div className="flex">
                        <select value={c.loteId} disabled={closed} onChange={(e) => setCell(w.id, d, { loteId: e.target.value })} className="w-20 border-r border-finca-100 bg-transparent px-1 py-1 text-xs focus:bg-amber-50 focus:outline-none disabled:cursor-not-allowed disabled:text-finca-300">
                          <option value="">—</option>
                          {lotes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <select value={c.activityId} disabled={closed} onChange={(e) => setCell(w.id, d, { activityId: e.target.value, units: c.units || (e.target.value ? "1" : "") })} className="w-24 border-r border-finca-100 bg-transparent px-1 py-1 text-xs focus:bg-amber-50 focus:outline-none disabled:cursor-not-allowed disabled:text-finca-300">
                          <option value=""></option>
                          {activities.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ${a.name}` : a.name}</option>)}
                        </select>
                        <input value={c.units} disabled={closed} onChange={(e) => setCell(w.id, d, { units: e.target.value })} inputMode="decimal" className="w-10 bg-transparent px-1 py-1 text-right text-xs tabular-nums focus:bg-amber-50 focus:outline-none disabled:cursor-not-allowed disabled:text-finca-300" placeholder="1" />
                      </div>
                    </td>
                  );
                })}
                <td className="border border-finca-100 px-2 py-1 text-right font-medium tabular-nums text-finca-900 whitespace-nowrap">Q{workerTotal(w.id).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={handleSave} disabled={saving || filledCount === 0} className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-finca-800 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
          Guardar {filledCount} registro(s)
        </button>
        <span className="text-sm text-finca-500">Total semana: <span className="font-semibold text-finca-900">Q{grandTotal.toLocaleString("es-GT", { minimumFractionDigits: 2 })}</span></span>
      </div>
    </div>
  );
}

function FragmentHeader() {
  return (
    <>
      <th className="border border-finca-100 px-1 py-1 text-center font-normal">Lote</th>
      <th className="border border-finca-100 px-1 py-1 text-center font-normal">Activ.</th>
      <th className="border border-finca-100 px-1 py-1 text-center font-normal">Un.</th>
    </>
  );
}
