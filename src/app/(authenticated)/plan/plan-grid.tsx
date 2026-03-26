"use client";

// =============================================================================
// src/app/(authenticated)/plan/plan-grid.tsx — Editable plan grid
// Inline editing with save-on-blur and semáforo (plan vs actual) indicators
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Save, Loader2 } from "lucide-react";

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

function semaforoClass(planned: number, actual: number): string {
  if (planned === 0 && actual === 0) return "";
  if (planned === 0 && actual > 0) return "bg-yellow-100 text-yellow-800";
  const deviation = Math.abs(actual - planned) / planned;
  if (deviation <= 0.2) return "bg-green-100 text-green-800";
  if (deviation <= 0.5) return "bg-yellow-100 text-yellow-800";
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

      // Determine target loteId: if single lote view, use that lote
      // For GENERAL view with a single lote in loteIds, use that one
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

        // Update the aggregated map
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

  // Column count: 48 weeks + 1 activity label + 1 total
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
                            isSaving={isSaving}
                            onSave={(val) =>
                              saveCell(act.id, m.agMonth, w, val)
                            }
                          />
                        ) : (
                          <span
                            className="inline-block min-w-[2rem] tabular-nums"
                            title={`Plan: ${planned} | Real: ${actual}`}
                          >
                            {planned > 0 ? planned : ""}
                          </span>
                        )}
                      </td>
                    );
                  }),
                )}
                <td className="border-l border-gray-300 px-2 py-1.5 text-center font-semibold tabular-nums text-finca-900">
                  {rowTotal > 0 ? rowTotal : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-600">
        <span className="font-medium">Semáforo (plan vs real):</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-green-200" />
          ≤ 20% desviación
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-yellow-200" />
          20–50% desviación
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-red-200" />
          &gt; 50% desviación
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable cell — save on blur
// ---------------------------------------------------------------------------

function EditableCell({
  value,
  isSaving,
  onSave,
}: {
  value: number;
  isSaving: boolean;
  onSave: (val: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value || ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(String(value || ""));
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
      <span className="flex items-center justify-center">
        <Loader2 className="h-3 w-3 animate-spin text-finca-600" />
      </span>
    );
  }

  if (editing) {
    return (
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
    );
  }

  return (
    <button
      type="button"
      className="w-full min-w-[2rem] cursor-pointer rounded px-1 py-0.5 tabular-nums hover:bg-earth-100"
      onClick={() => setEditing(true)}
      title="Clic para editar"
    >
      {value > 0 ? value : <span className="text-gray-300">–</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Saving indicator (unused export kept for potential reuse)
// ---------------------------------------------------------------------------

export function SaveIndicator({ saving }: { saving: boolean }) {
  if (!saving) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-finca-600">
      <Save className="h-3 w-3" />
      Guardando...
    </span>
  );
}
