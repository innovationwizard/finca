"use client";

// =============================================================================
// Weekly capture grid — emulates DATA MANUEL FLORES from PLANILLAFINCA.xlsx.
// Rows = workers, columns = days × (Lote, Actividad, Unidades). Dropdowns prevent
// the dirty free-text codes the xlsx suffers from. A worker may do more than one
// activity in a day: each day cell holds one LINE per activity, and each line is
// one ActivityRecord identified by its own id (UUIDv7, generated here for a new
// line). Saves via POST /api/planilla/captura (price resolved by work date).
// =============================================================================

import { useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, ArrowRight, X, Plus, ChevronLeft, ChevronRight, CalendarPlus } from "lucide-react";
import { resolveActivityPrice, type PriceVigencia } from "@/lib/pricing/resolve-price";
import { activityLabel } from "@/lib/planilla/history";
import { uuidv7 } from "@/lib/utils/uuidv7";

type Worker = { id: string; name: string };
type Activity = { id: string; name: string; shortName: string | null; unit: string; defaultPrice: number; priceSchedule: PriceVigencia[] };
type Lote = { id: string; name: string };
type Period = { id: string; periodNumber: number; startDate: string; endDate: string; isClosed: boolean };
type Line = { id: string; loteId: string; activityId: string; units: string };

const ROSTER_KEY = "finca-captura-roster";
const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function isoOf(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d); }
function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return isoOf(d);
}
function mondayOfToday(): string { return mondayOf(isoOf(new Date())); }
function dm(iso: string) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }

type ExistingRecord = { id: string; workerId: string; date: string; loteId: string; activityId: string; units: string };

const NO_LINES: Line[] = [];

export function CapturaGrid({ workers, activities, lotes, periods, canWrite, canManagePeriods, existing }: { workers: Worker[]; activities: Activity[]; lotes: Lote[]; periods: Period[]; canWrite: boolean; canManagePeriods: boolean; existing: ExistingRecord[] }) {
  const router = useRouter();
  // Open on the most recent week that already has entries (so saved data is
  // visible immediately); fall back to the current week when there are none.
  const [weekStart, setWeekStart] = useState(() => {
    if (existing.length) {
      const latest = existing.reduce((a, b) => (a.date > b.date ? a : b)).date;
      return mondayOf(latest);
    }
    return mondayOfToday();
  });
  // Seed from already-saved records so the grid shows existing entries (it was
  // write-only before, which made saved data look lost). Keyed worker|date; a
  // day keeps EVERY record it has, one line each — none may be hidden, or it
  // would still be paid without anyone seeing it.
  const [cells, setCells] = useState<Record<string, Line[]>>(() => {
    const seed: Record<string, Line[]> = {};
    for (const e of existing) (seed[`${e.workerId}|${e.date}`] ??= []).push({ id: e.id, loteId: e.loteId, activityId: e.activityId, units: e.units });
    return seed;
  });
  // Ids that exist in the database (loaded, or written by a save from here).
  // Only these need a delete when their line is removed or emptied.
  const [persisted, setPersisted] = useState<Set<string>>(() => new Set(existing.map((e) => e.id)));
  // Lines the user removed with ×, or replaced via "Copiar lunes".
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [resolving, setResolving] = useState(false);
  const [workerFilter, setWorkerFilter] = useState(""); // view a single worker; display-only (save still covers all)

  // Roster: persisted client-side; defaults to all active workers. Always
  // include workers who already have records this period, so saved entries are
  // never hidden by a narrowed roster.
  const [rosterIds, setRosterIds] = useState<string[]>(() => {
    let base: string[] | null = null;
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(ROSTER_KEY);
      if (saved) { try { const ids = JSON.parse(saved) as string[]; if (Array.isArray(ids) && ids.length) base = ids; } catch { /* ignore */ } }
    }
    if (!base) base = workers.map((w) => w.id);
    return [...new Set([...base, ...existing.map((e) => e.workerId)])];
  });
  const persistRoster = useCallback((ids: string[]) => {
    setRosterIds(ids);
    if (typeof window !== "undefined") window.localStorage.setItem(ROSTER_KEY, JSON.stringify(ids));
  }, []);

  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const roster = useMemo(() => rosterIds.map((id) => workerById.get(id)).filter(Boolean) as Worker[], [rosterIds, workerById]);
  // Display-only narrowing: filtering never changes `roster`, so totals and save
  // still cover everyone (no typed data is lost behind the filter).
  const visibleRoster = useMemo(() => (workerFilter ? roster.filter((w) => w.id === workerFilter) : roster), [roster, workerFilter]);

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
  const getLines = (workerId: string, iso: string): Line[] => cells[key(workerId, iso)] ?? NO_LINES;
  // An empty day shows one blank line. Its id is fixed per worker-day so the
  // first keystroke turns it into a real line WITHOUT remounting the input
  // (a new React key would drop focus mid-typing).
  const placeholderIds = useRef(new Map<string, string>());
  const placeholderId = (workerId: string, iso: string): string => {
    const k = key(workerId, iso);
    let id = placeholderIds.current.get(k);
    if (!id) { id = uuidv7(); placeholderIds.current.set(k, id); }
    return id;
  };
  // Editing an id the day does not hold yet (its placeholder, or a line just
  // added) appends it as a new line.
  const setLine = useCallback((workerId: string, iso: string, lineId: string, patch: Partial<Line>) => {
    setCells((prev) => {
      const k = key(workerId, iso);
      const lines = prev[k] ?? NO_LINES;
      if (!lines.some((l) => l.id === lineId)) return { ...prev, [k]: [...lines, { id: lineId, loteId: "", activityId: "", units: "", ...patch }] };
      return { ...prev, [k]: lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) };
    });
  }, []);
  const addLine = useCallback((workerId: string, iso: string) => setLine(workerId, iso, uuidv7(), {}), [setLine]);
  const removeLine = useCallback((workerId: string, iso: string, lineId: string) => {
    setCells((prev) => ({ ...prev, [key(workerId, iso)]: (prev[key(workerId, iso)] ?? NO_LINES).filter((l) => l.id !== lineId) }));
    setRemovedIds((prev) => [...prev, lineId]);
    // A removed id must never come back as the day's next placeholder: it
    // would be sent to save and to delete at once.
    placeholderIds.current.delete(key(workerId, iso));
  }, []);

  // Copy a worker's first-day activities across the rest of the week (the xlsx
  // is repetitive). Replaces what those days held; closed days are left alone.
  const fillAcross = useCallback((workerId: string) => {
    const src = (cells[key(workerId, days[0])] ?? NO_LINES).filter((l) => l.activityId);
    if (src.length === 0) return;
    const next = { ...cells };
    const replaced: string[] = [];
    for (const d of days.slice(1)) {
      if (dayClosed(d)) continue;
      replaced.push(...(cells[key(workerId, d)] ?? NO_LINES).map((l) => l.id));
      next[key(workerId, d)] = src.map((l) => ({ ...l, id: uuidv7() }));
    }
    setCells(next);
    setRemovedIds((prev) => [...prev, ...replaced]);
  }, [cells, days, dayClosed]);

  const priceFor = useCallback((activityId: string, iso: string) => {
    const a = activityById.get(activityId);
    return a ? resolveActivityPrice(a.priceSchedule, a.defaultPrice, iso) : 0;
  }, [activityById]);

  // Cost preview per worker.
  const workerTotal = useCallback((workerId: string) => {
    let t = 0;
    for (const d of days) {
      for (const l of getLines(workerId, d)) {
        if (l.activityId) { const u = parseFloat(l.units) || 1; t += u * priceFor(l.activityId, d); }
      }
    }
    return t;
  }, [days, cells, priceFor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Días of DIA-unit work in one worker-day. Above 1 is allowed (extra shift or
  // hours) but flagged, so it is a decision and never a typo.
  const diasOf = useCallback((lines: Line[]) => lines.reduce((s, l) => (l.activityId && activityById.get(l.activityId)?.unit === "DIA" ? s + (parseFloat(l.units) || 1) : s), 0), [activityById]);

  const grandTotal = useMemo(() => roster.reduce((s, w) => s + workerTotal(w.id), 0), [roster, workerTotal]);

  const filledCount = useMemo(() => Object.values(cells).reduce((s, lines) => s + lines.filter((l) => l.activityId).length, 0), [cells]);

  // Saved records to delete: lines removed with ×, plus saved lines whose
  // activity was cleared (an emptied line means "this record goes away").
  const pendingDeleteIds = useMemo(() => {
    const ids = new Set(removedIds.filter((id) => persisted.has(id)));
    for (const lines of Object.values(cells)) for (const l of lines) if (!l.activityId && persisted.has(l.id)) ids.add(l.id);
    return [...ids];
  }, [cells, removedIds, persisted]);

  const handleSave = useCallback(async () => {
    // Block only when typed data sits on an uncovered day — the `if (!period)
    // continue` below would drop it silently. An EMPTY uncovered day has nothing
    // to lose, so it must not hold hostage the covered days of the same week
    // (a week straddling a period boundary is normal). The amber banner still
    // warns about every uncovered day regardless.
    const blocked = uncovered.filter((d) => roster.some((w) => getLines(w.id, d).some((l) => l.activityId)));
    if (blocked.length > 0) { setMsg({ kind: "err", text: `Hay datos capturados en días sin período de pago (${blocked.map(dm).join(", ")}). Resuélvalo en el aviso de arriba antes de guardar.` }); return; }
    const rows: Record<string, unknown>[] = [];
    for (const w of roster) {
      for (const d of days) {
        const period = openPeriodFor(d);
        if (!period) continue; // closed day (inputs disabled) or uncovered day (`blocked` above proved it empty)
        for (const l of getLines(w.id, d)) {
          if (!l.activityId) continue;
          const units = parseFloat(l.units) || 1;
          const price = priceFor(l.activityId, d);
          rows.push({
            id: l.id, workerId: w.id, activityId: l.activityId, loteId: l.loteId || null,
            date: d, quantity: units, unitPrice: price,
            totalEarned: Math.round(units * price * 100) / 100, payPeriodId: period.id,
          });
        }
      }
    }
    // An id that is back on a filled line (e.g. a day's placeholder after
    // "Copiar lunes" replaced that line) is an update, not a delete.
    const rowIds = new Set(rows.map((r) => r.id as string));
    const deleteIds = pendingDeleteIds.filter((id) => !rowIds.has(id));
    if (rows.length === 0 && deleteIds.length === 0) { setMsg({ kind: "err", text: "No hay celdas llenas para guardar." }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/planilla/captura", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, deleteIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        const details = Array.isArray(data.details) ? ` ${data.details.slice(0, 3).join(" · ")}` : "";
        setMsg({ kind: "err", text: `${data.error || "Error al guardar"}${details}` });
        return;
      }
      const deleted = new Set(deleteIds);
      setPersisted((prev) => {
        const n = new Set(prev);
        for (const r of rows) n.add(r.id as string);
        for (const id of deleted) n.delete(id);
        return n;
      });
      setRemovedIds((prev) => prev.filter((id) => !deleted.has(id)));
      setCells((prev) => {
        const next: Record<string, Line[]> = {};
        for (const [k, lines] of Object.entries(prev)) next[k] = lines.filter((l) => !deleted.has(l.id));
        return next;
      });
      const deletedText = data.deleted ? `, ${data.deleted} eliminado(s)` : "";
      setMsg({ kind: "ok", text: `${data.count ?? rows.length} registro(s) guardado(s)${deletedText}.` });
      router.refresh();
    } catch {
      setMsg({ kind: "err", text: "Error de conexión" });
    } finally { setSaving(false); }
  }, [roster, days, cells, uncovered, priceFor, openPeriodFor, pendingDeleteIds, router]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // No open period: append one ending on the last uncovered day. The start
        // is DERIVED server-side as max(endDate)+1 — a period may never begin
        // after a gap, so the client must not choose it (minU could skip days).
        res = await fetch(`/api/pay-periods`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endDate: maxU }),
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
        {canWrite ? (
          <button onClick={() => setAddOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-finca-200 px-2 py-1 text-finca-600 hover:bg-finca-50"><Plus className="h-3.5 w-3.5" /> Trabajador</button>
        ) : (
          <span className="rounded-md bg-finca-100 px-2 py-1 text-xs font-medium text-finca-600">Solo lectura</span>
        )}
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

      {/* Per-worker filter (display-only) — right above the titles row. */}
      <div className="mb-3">
        <select
          value={workerFilter}
          onChange={(e) => setWorkerFilter(e.target.value)}
          aria-label="Filtrar por trabajador"
          className="rounded-lg border border-finca-200 bg-white px-3 py-2 text-sm text-finca-700 focus:border-earth-400 focus:outline-none sm:w-72"
        >
          <option value="">Todos los trabajadores</option>
          {roster.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {/* The grid — scrolls in both axes inside a bounded height so the header
          rows (top) and the #/Trabajador columns (left) all stay pinned. */}
      <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="border-collapse text-xs">
          <thead>
            <tr className="h-8 bg-finca-50">
              <th className="sticky left-0 top-0 z-30 h-8 border border-finca-100 bg-finca-50 px-2 py-1.5 text-left font-medium text-finca-600">#</th>
              <th className="sticky left-8 top-0 z-30 border border-finca-100 bg-finca-50 px-2 py-1.5 text-left font-medium text-finca-600">Trabajador</th>
              {days.map((d, i) => (
                <th key={d} colSpan={3} className={`sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-1.5 text-center font-medium ${dayClosed(d) ? "text-finca-300" : "text-finca-700"}`} title={dayClosed(d) ? "Período cerrado — histórico" : undefined}>
                  {DAY_LABELS[i]} {dm(d)}{dayClosed(d) ? " 🔒" : ""}
                </th>
              ))}
              <th className="sticky top-0 z-20 border border-finca-100 bg-finca-50 px-2 py-1.5 text-right font-medium text-finca-600">Total</th>
            </tr>
            <tr className="bg-finca-50 text-finca-400">
              <th className="sticky left-0 top-8 z-30 border border-finca-100 bg-finca-50"></th>
              <th className="sticky left-8 top-8 z-30 border border-finca-100 bg-finca-50"></th>
              {days.map((d) => (
                <FragmentHeader key={d} />
              ))}
              <th className="sticky top-8 z-20 border border-finca-100 bg-finca-50"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRoster.map((w, idx) => (
              <tr key={w.id} className="hover:bg-finca-50/40">
                <td className="sticky left-0 z-10 border border-finca-100 bg-white px-2 py-1 text-finca-400">{idx + 1}</td>
                <td className="sticky left-8 z-10 border border-finca-100 bg-white px-2 py-1 font-medium text-finca-900 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {w.name}
                    {canWrite && (
                      <>
                        <button onClick={() => fillAcross(w.id)} title="Copiar lunes a toda la semana" className="text-finca-300 hover:text-finca-600"><ArrowRight className="h-3 w-3" /></button>
                        <button onClick={() => persistRoster(rosterIds.filter((id) => id !== w.id))} title="Quitar de la lista" className="text-finca-300 hover:text-red-500"><X className="h-3 w-3" /></button>
                      </>
                    )}
                  </span>
                </td>
                {days.map((d) => {
                  const lines = getLines(w.id, d);
                  const closed = dayClosed(d);
                  const editable = canWrite && !closed;
                  const dias = diasOf(lines);
                  // An empty day still shows one blank line to type into.
                  const shown: (Line | null)[] = lines.length ? lines : [null];
                  const blankId = lines.length ? "" : placeholderId(w.id, d);
                  return (
                    <td key={d} colSpan={3} className={`border border-finca-100 p-0 align-top ${closed ? "bg-finca-50/70" : dias > 1 ? "bg-amber-50" : ""}`}>
                      {shown.map((l, li) => (
                        <div key={l?.id ?? blankId} className={`flex ${li > 0 ? "border-t border-dashed border-finca-100" : ""}`}>
                          <select value={l?.loteId ?? ""} disabled={!editable} onChange={(e) => setLine(w.id, d, l?.id ?? blankId, { loteId: e.target.value })} aria-label="Lote" className="w-20 border-r border-finca-100 bg-transparent px-1 py-1 text-xs focus:bg-amber-50 focus:outline-none disabled:cursor-not-allowed disabled:text-finca-300">
                            <option value="">—</option>
                            {lotes.map((lo) => <option key={lo.id} value={lo.id}>{lo.name}</option>)}
                          </select>
                          <select value={l?.activityId ?? ""} disabled={!editable} onChange={(e) => setLine(w.id, d, l?.id ?? blankId, { activityId: e.target.value, units: l?.units || (e.target.value ? "1" : "") })} aria-label="Actividad" className="w-24 border-r border-finca-100 bg-transparent px-1 py-1 text-xs focus:bg-amber-50 focus:outline-none disabled:cursor-not-allowed disabled:text-finca-300">
                            <option value=""></option>
                            {activities.map((a) => <option key={a.id} value={a.id}>{activityLabel(a.shortName, a.name)}</option>)}
                          </select>
                          <input value={l?.units ?? ""} disabled={!editable} onChange={(e) => setLine(w.id, d, l?.id ?? blankId, { units: e.target.value })} inputMode="decimal" aria-label="Unidades" className="w-10 bg-transparent px-1 py-1 text-right text-xs tabular-nums focus:bg-amber-50 focus:outline-none disabled:cursor-not-allowed disabled:text-finca-300" placeholder="1" />
                          {editable && (
                            <span className="flex w-8 shrink-0 items-center justify-end gap-0.5 pr-0.5">
                              {l && <button onClick={() => removeLine(w.id, d, l.id)} title="Quitar esta actividad" aria-label="Quitar esta actividad" className="text-finca-300 hover:text-red-500"><X className="h-3 w-3" /></button>}
                              {li === shown.length - 1 && lines.length > 0 && <button onClick={() => addLine(w.id, d)} title="Agregar otra actividad este día" aria-label="Agregar otra actividad este día" className="text-finca-300 hover:text-finca-700"><Plus className="h-3 w-3" /></button>}
                            </span>
                          )}
                        </div>
                      ))}
                      {dias > 1 && (
                        <div className="border-t border-amber-200 px-1 text-right text-[10px] font-medium text-amber-700" title="Más de un día de trabajo en la misma fecha (turno u horas extra)">
                          {dias.toLocaleString("es-GT", { maximumFractionDigits: 2 })} días
                        </div>
                      )}
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
        {canWrite && (
          <button onClick={handleSave} disabled={saving || (filledCount === 0 && pendingDeleteIds.length === 0)} className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-finca-800 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Guardar {filledCount} registro(s){pendingDeleteIds.length > 0 ? ` · eliminar ${pendingDeleteIds.length}` : ""}
          </button>
        )}
        <span className="text-sm text-finca-500">Total semana: <span className="font-semibold text-finca-900">Q{grandTotal.toLocaleString("es-GT", { minimumFractionDigits: 2 })}</span></span>
      </div>
    </div>
  );
}

function FragmentHeader() {
  return (
    <>
      <th className="sticky top-8 z-20 border border-finca-100 bg-finca-50 px-1 py-1 text-center font-normal">Lote</th>
      <th className="sticky top-8 z-20 border border-finca-100 bg-finca-50 px-1 py-1 text-center font-normal">Activ.</th>
      <th className="sticky top-8 z-20 border border-finca-100 bg-finca-50 px-1 py-1 text-center font-normal">Un.</th>
    </>
  );
}
