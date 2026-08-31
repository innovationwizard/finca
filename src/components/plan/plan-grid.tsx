"use client";

// =============================================================================
// src/components/plan/plan-grid.tsx — Editable plan grid
// Inline editing with save-on-blur and semáforo (plan vs actual) indicators.
// Each cell shows planned value (top) and actual/executed value (bottom).
//
// The (month, week) pair here is grid geometry — which box to draw where — and
// nothing else. What identifies a cell to the server is its weekStart date,
// resolved from the cosecha this grid is pinned to; see lib/plan/plan-week.ts.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { weekStartOfCell, weekStartIso } from "@/lib/plan/plan-week";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityInfo = {
  id: string;
  name: string;
  sortOrder: number;
};

type MonthInfo = {
  agMonth: number;
  label: string;
};

type PlanEntryRow = {
  activityId: string;
  loteId: string;
  month: number;
  week: number;
  plannedJornales: number;
};

type ActualRow = {
  loteId: string | null;
  activityId: string;
  month: number;
  week: number;
  actualJornales: number;
};

export type PlanGridProps = {
  agriculturalYear: string;
  loteId: string | null; // null = aggregated (GENERAL)
  loteIds: string[]; // all lote IDs for aggregation
  activities: ActivityInfo[];
  months: MonthInfo[];
  initialPlan: PlanEntryRow[];
  initialActual: ActualRow[];
  canEdit: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cellKey(activityId: string, month: number, week: number) {
  return `${activityId}_${month}_${week}`;
}

// Round to max 2 decimal places, strip trailing zeros.
// Prevents floating-point artifacts (e.g. 99.75000000000003 → "99.75").
function fmtJ(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

/**
 * Read what the user typed. `null` means "this is not a number" — including an
 * empty field — and a null NEVER writes.
 *
 * The cell used to be an <input type="number"> read with `parseFloat(v) || 0`.
 * A number input reports its value as "" whenever the browser considers the text
 * bad input, and a comma is bad input: on a Spanish-locale keyboard — and on the
 * es-GT numeric keypad this PWA gets on a phone or tablet — "1,5" arrives here
 * as "". `|| 0` turned that into a 0, and since 0 differed from the cell's
 * value it was saved, silently overwriting the week. That is how half of the
 * 26/27 plan (251 of 500 cells) became zeros in a single evening's data entry.
 *
 * So: plain text input, parsed here, comma accepted as the decimal separator the
 * farm actually types. Anything unparseable leaves the cell alone.
 */
function parseJornales(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "" || s === ".") return null;
  if (!/^\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// The summary table and KPI cards above this grid are server-rendered from the
// same rows the grid edits, and nothing re-reads them when a cell saves — they
// sat stale for the whole session, still totalling the plan as it was on load.
// Refresh on a trailing debounce so a fast run of entries costs one round-trip
// instead of one per cell.
const REFRESH_DEBOUNCE_MS = 900;

// Over-execution (actual >= planned) is good (green).
// Under-execution uses deficit ratio for RAG coloring.
function semaforoClass(planned: number, actual: number): string {
  if (planned === 0 && actual === 0) return "";
  if (planned === 0 && actual > 0) return "bg-yellow-100 text-yellow-800";
  if (actual >= planned) return "bg-green-100 text-green-800";
  const deficit = (planned - actual) / planned;
  if (deficit <= 0.2) return "bg-green-100 text-green-800";
  if (deficit <= 0.5) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlanGrid({
  agriculturalYear,
  loteId,
  loteIds,
  activities,
  months,
  initialPlan,
  initialActual,
  canEdit,
}: PlanGridProps) {
  // Build lookup maps
  const [planMap, setPlanMap] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const e of initialPlan) {
      const k = cellKey(e.activityId, e.month, e.week);
      map[k] = (map[k] ?? 0) + e.plannedJornales;
    }
    return map;
  });

  const [actualMap] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const e of initialActual) {
      const k = cellKey(e.activityId, e.month, e.week);
      map[k] = (map[k] ?? 0) + e.actualJornales;
    }
    return map;
  });

  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(
      () => router.refresh(),
      REFRESH_DEBOUNCE_MS,
    );
  }, [router]);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  // Both writers below post to the same cell address. `planMap` is seeded once
  // from props and owned by this component from then on, so a router.refresh()
  // updating the totals above never fights the values on screen.
  const writeCell = useCallback(
    async (
      activityId: string,
      month: number,
      week: number,
      body: { plannedJornales: number } | null, // null = clear the cell
    ) => {
      const k = cellKey(activityId, month, week);
      setSaving(k);
      setError(null);

      const targetLoteId = loteId ?? loteIds[0];
      if (!targetLoteId) {
        setError("No se puede guardar sin lote específico");
        setSaving(null);
        return;
      }

      try {
        const res = await fetch("/api/plan", {
          method: body ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            loteId: targetLoteId,
            activityId,
            weekStart: weekStartIso(
              weekStartOfCell(agriculturalYear, month, week),
            ),
            ...(body ?? {}),
          }),
        });

        if (!res.ok) {
          // A dead session used to arrive here as HTML from /login, and .json()
          // threw a parse error on top of the real one. Middleware now answers
          // /api/* with a 401 JSON body, but stay defensive: never let the
          // error path swallow the fact that the write failed.
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error ?? `Error al guardar (HTTP ${res.status})`,
          );
        }

        setPlanMap((prev) => {
          if (body) return { ...prev, [k]: body.plannedJornales };
          const next = { ...prev };
          delete next[k];
          return next;
        });
        scheduleRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      } finally {
        setSaving(null);
      }
    },
    [agriculturalYear, loteId, loteIds, scheduleRefresh],
  );

  const saveCell = useCallback(
    (activityId: string, month: number, week: number, value: number) =>
      writeCell(activityId, month, week, { plannedJornales: value }),
    [writeCell],
  );

  const clearCell = useCallback(
    (activityId: string, month: number, week: number) =>
      writeCell(activityId, month, week, null),
    [writeCell],
  );

  const weeks = [1, 2, 3, 4] as const;

  return (
    <div className="w-full overflow-x-auto">
      {error && (
        <div className="mb-3 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <table className="min-w-[1400px] border-collapse text-xs">
        <thead>
          {/* Month header row */}
          <tr className="bg-finca-900 text-white">
            <th
              className="sticky left-0 z-20 bg-finca-900 px-3 py-2 text-left font-semibold"
              rowSpan={2}
            >
              Actividad
            </th>
            {months.map((m) => (
              <th
                key={m.agMonth}
                colSpan={4}
                className="border-l border-finca-700 px-1 py-1 text-center font-medium capitalize"
              >
                {m.label.split(" ")[0]}
              </th>
            ))}
            <th
              className="border-l border-finca-700 px-3 py-2 text-center font-semibold"
              rowSpan={2}
            >
              Total
            </th>
          </tr>
          {/* Week sub-header row */}
          <tr className="bg-finca-800 text-finca-200">
            {months.map((m) =>
              weeks.map((w) => (
                <th
                  key={`${m.agMonth}-${w}`}
                  className="border-l border-finca-700 px-1 py-1 text-center font-normal"
                >
                  S{w}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {activities.map((act, rowIdx) => {
            let rowTotal = 0;
            let rowActualTotal = 0;
            return (
              <tr
                key={act.id}
                className={
                  rowIdx % 2 === 0
                    ? "bg-white hover:bg-finca-50"
                    : "bg-finca-50/50 hover:bg-finca-100/50"
                }
              >
                <td className="sticky left-0 z-10 whitespace-nowrap bg-inherit px-3 py-1.5 font-medium text-finca-900">
                  {act.name}
                </td>
                {months.map((m) =>
                  weeks.map((w) => {
                    const k = cellKey(act.id, m.agMonth, w);
                    const planned = planMap[k] ?? 0;
                    const actual = actualMap[k] ?? 0;
                    rowTotal += planned;
                    rowActualTotal += actual;
                    const semaforo = semaforoClass(planned, actual);
                    const isSaving = saving === k;

                    return (
                      <td
                        key={`${m.agMonth}-${w}`}
                        className={`border-l border-gray-200 px-0.5 py-0.5 text-center ${semaforo}`}
                      >
                        {canEdit && loteId ? (
                          <EditableCell
                            value={planned}
                            actualValue={actual}
                            isSaving={isSaving}
                            onSave={(val) =>
                              saveCell(act.id, m.agMonth, w, val)
                            }
                            onClear={() => clearCell(act.id, m.agMonth, w)}
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-px py-0.5 leading-none">
                            <span className="tabular-nums">
                              {planned > 0
                                ? fmtJ(planned)
                                : actual > 0
                                  ? <span className="text-gray-300">—</span>
                                  : ""}
                            </span>
                            {actual > 0 && (
                              <span className="text-[10px] tabular-nums leading-none text-gray-500">
                                {fmtJ(actual)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  }),
                )}
                {/* Total column: plan (top) + actual (bottom) */}
                <td className="border-l border-gray-300 px-2 py-1.5 text-center font-semibold tabular-nums text-finca-900">
                  <div className="flex flex-col items-center gap-px leading-none">
                    <span>{rowTotal > 0 ? fmtJ(rowTotal) : ""}</span>
                    {rowActualTotal > 0 && (
                      <span className="text-[10px] font-normal text-gray-500">
                        {fmtJ(rowActualTotal)}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
        <span className="font-medium">Semáforo (plan vs ejecutado):</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-green-200" />
          ≤ 20% déficit o sobre-plan
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-yellow-200" />
          20–50% déficit
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-red-200" />
          &gt; 50% déficit
        </span>
        <span className="ml-2 border-l border-gray-300 pl-4">
          Celda: <strong>número superior</strong> = plan ·{" "}
          <strong>número inferior</strong> = ejecutado
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable cell — save on blur, shows actual as reference below the input
// ---------------------------------------------------------------------------

function EditableCell({
  value,
  actualValue,
  isSaving,
  onSave,
  onClear,
}: {
  value: number;
  actualValue: number;
  isSaving: boolean;
  onSave: (val: number) => void;
  onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ? fmtJ(value) : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value ? fmtJ(value) : "");
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const parsed = parseJornales(draft);
  const invalid = draft.trim() !== "" && parsed === null;

  const commit = () => {
    setEditing(false);

    // No number, no write. An empty or unreadable field means the user typed
    // something this cell cannot store — a comma the browser rejected, a stray
    // keystroke, a field they blanked and then thought better of — and the one
    // thing it must never mean is "set this week to zero". Emptying a cell that
    // holds a value is done deliberately, with the × button.
    if (parsed === null) {
      setDraft(value ? fmtJ(value) : "");
      return;
    }

    // A typed 0 means "nothing planned that week" — which is absence, not a row
    // holding zero. The grid draws the two identically, so storing 0 is what
    // made 251 wiped cells look untouched instead of wrong; keep it impossible.
    if (parsed === 0) {
      if (value > 0) onClear();
      return;
    }

    if (parsed !== value) onSave(parsed);
  };

  if (isSaving) {
    return (
      <span className="flex items-center justify-center py-0.5">
        <Loader2 className="h-3 w-3 animate-spin text-finca-600" />
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col items-center gap-px py-0.5">
        <div className="flex w-full items-center gap-0.5">
          <input
            ref={inputRef}
            // Deliberately text, not number: a number input hides bad input
            // behind an empty string, which is what made "1,5" save as 0.
            // inputMode="decimal" still raises the numeric keypad on mobile.
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={`w-full min-w-[2.5rem] rounded border px-1 py-0.5 text-center text-xs tabular-nums focus:outline-none focus:ring-1 ${
              invalid
                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                : "border-finca-300 focus:border-earth-500 focus:ring-earth-500"
            }`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(value ? fmtJ(value) : "");
                setEditing(false);
              }
            }}
          />
          {value > 0 && (
            <button
              type="button"
              tabIndex={-1}
              // preventDefault keeps focus in the input, so the blur/commit
              // path does not race the clear.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setEditing(false);
                onClear();
              }}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-100 hover:text-red-600"
              title="Borrar el valor de esta semana"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {invalid && (
          <span className="text-[10px] leading-none text-red-600">
            Solo números
          </span>
        )}
        {!invalid && actualValue > 0 && (
          <span className="text-[10px] tabular-nums leading-none text-gray-400">
            R:{fmtJ(actualValue)}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="flex w-full flex-col items-center gap-px rounded px-1 py-0.5 hover:bg-earth-100"
      onClick={() => setEditing(true)}
      title="Clic para editar"
    >
      <span className="min-w-[2rem] tabular-nums">
        {value > 0 ? fmtJ(value) : <span className="text-gray-300">–</span>}
      </span>
      {actualValue > 0 && (
        <span className="text-[10px] tabular-nums leading-none text-gray-500">
          {fmtJ(actualValue)}
        </span>
      )}
    </button>
  );
}
