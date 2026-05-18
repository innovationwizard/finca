"use client";

// =============================================================================
// src/app/(authenticated)/plan/plan-grid.tsx — Editable plan grid
// Inline editing with save-on-blur and semáforo (plan vs actual) indicators.
// Each cell shows planned value (top) and actual/executed value (bottom).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

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

  // Track per-lote plan entries for saving (keyed by loteId_activityId_month_week)
  const perLotePlanRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const map: Record<string, number> = {};
    for (const e of initialPlan) {
      map[`${e.loteId}_${e.activityId}_${e.month}_${e.week}`] = e.plannedJornales;
    }
    perLotePlanRef.current = map;
  }, [initialPlan]);

  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Save a single cell
  const saveCell = useCallback(
    async (activityId: string, month: number, week: number, value: number) => {
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
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agriculturalYear,
            loteId: targetLoteId,
            activityId,
            month,
            week,
            plannedJornales: value,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Error al guardar");
        }

        setPlanMap((prev) => ({ ...prev, [k]: value }));
        perLotePlanRef.current[`${targetLoteId}_${activityId}_${month}_${week}`] = value;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      } finally {
        setSaving(null);
      }
    },
    [agriculturalYear, loteId, loteIds],
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
}: {
  value: number;
  actualValue: number;
  isSaving: boolean;
  onSave: (val: number) => void;
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

  const commit = () => {
    setEditing(false);
    const num = parseFloat(draft) || 0;
    if (num !== value) {
      onSave(Math.max(0, num));
    }
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
        <input
          ref={inputRef}
          type="number"
          min={0}
          step={0.5}
          className="w-full min-w-[2.5rem] rounded border border-finca-300 px-1 py-0.5 text-center text-xs tabular-nums focus:border-earth-500 focus:outline-none focus:ring-1 focus:ring-earth-500"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(String(value || ""));
              setEditing(false);
            }
          }}
        />
        {actualValue > 0 && (
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
