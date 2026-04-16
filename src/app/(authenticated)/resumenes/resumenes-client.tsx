"use client";

// =============================================================================
// src/app/(authenticated)/resumenes/resumenes-client.tsx
// Period selector + data fetch + tab display
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { ResumenTabs } from "./resumen-tabs";

type Period = {
  id: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
  isClosed: boolean;
};

type ResumenData = {
  weeklyRows: { periodNumber: number; startDate: string; endDate: string; workerName: string; totalEarned: number; totalToPay: number }[];
  personalRows: { workerName: string; totalEarned: number; bonification: number; advances: number; totalToPay: number; dpi: string; bankAccount: string; bank: string }[];
  loteRows: { loteName: string; activityName: string; totalEarned: number }[];
};

export function ResumenesClient({ periods }: { periods: Period[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    // Default: select the two most recent periods (like the Excel's 2-week scope)
    const recent = periods.slice(-2);
    return new Set(recent.map((p) => p.id));
  });
  const [data, setData] = useState<ResumenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (ids: Set<string>) => {
    if (ids.size === 0) {
      setData({ weeklyRows: [], personalRows: [], loteRows: [] });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/resumenes?periodIds=${[...ids].join(",")}`);
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Error al cargar datos");
        setLoading(false);
        return;
      }
      setData(await res.json());
    } catch {
      setError("Error de conexión");
    }
    setLoading(false);
  }, []);

  // Fetch on mount and when selection changes
  useEffect(() => {
    fetchData(selectedIds);
  }, [selectedIds, fetchData]);

  const togglePeriod = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(periods.map((p) => p.id)));
  const selectNone = () => setSelectedIds(new Set());

  // Compute date range label from selected periods
  const selectedPeriods = periods
    .filter((p) => selectedIds.has(p.id))
    .sort((a, b) => a.periodNumber - b.periodNumber);
  const dateRange = selectedPeriods.length > 0
    ? `${fmtDate(selectedPeriods[0].startDate)} — ${fmtDate(selectedPeriods[selectedPeriods.length - 1].endDate)}`
    : null;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="rounded-xl border border-finca-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-finca-900">Períodos de pago</h2>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-xs font-medium text-finca-500 hover:text-finca-700"
            >
              Todos
            </button>
            <span className="text-finca-300">·</span>
            <button
              onClick={selectNone}
              className="text-xs font-medium text-finca-500 hover:text-finca-700"
            >
              Ninguno
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {periods.map((p) => {
            const selected = selectedIds.has(p.id);
            const start = fmtDateShort(p.startDate);
            const end = fmtDateShort(p.endDate);
            return (
              <button
                key={p.id}
                onClick={() => togglePeriod(p.id)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  selected
                    ? "border-earth-300 bg-earth-50 text-earth-800"
                    : "border-finca-200 bg-finca-50/50 text-finca-400 hover:border-finca-300 hover:text-finca-600"
                }`}
              >
                <span className="font-semibold">S{p.periodNumber}</span>
                <span className="ml-1.5">
                  {start} – {end}
                </span>
              </button>
            );
          })}
        </div>

        {dateRange && (
          <p className="mt-3 text-xs text-finca-500">
            {selectedPeriods.length} período{selectedPeriods.length !== 1 ? "s" : ""} seleccionado{selectedPeriods.length !== 1 ? "s" : ""} · {dateRange}
          </p>
        )}
      </div>

      {/* Content */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-finca-400" />
        </div>
      ) : data ? (
        <ResumenTabs
          weeklyRows={data.weeklyRows}
          personalRows={data.personalRows}
          loteRows={data.loteRows}
        />
      ) : null}
    </div>
  );
}

// ── Date formatting helpers ─────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-GT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtDateShort(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-GT", {
    day: "numeric",
    month: "short",
  });
}
