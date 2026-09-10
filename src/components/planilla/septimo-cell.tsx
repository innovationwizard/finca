"use client";

// =============================================================================
// src/components/planilla/septimo-cell.tsx — the séptimo verdict of ONE worker
// in ONE week of the Planillas anteriores grid, and the drill-down it opens.
//
// The grid to its left is the evidence: six day columns of captured activity.
// This cell is the verdict those days produce — "5/6 · Q0" — and clicking it
// opens the full period derivation for that worker (SeptimoDrawer, shared with
// Revisión y Autorización).
//
// A client island so the surrounding grid stays a server component: the page
// renders one of these per worker × week, each owning only its own open state.
// =============================================================================

import { useState } from "react";
import { formatGTQ } from "@/lib/utils/format";
import { SeptimoDrawer, type SeptimoWeekMeta, type SeptimoDetail } from "./septimo-drawer";

export function SeptimoCell({
  workerName,
  amount,
  weeks,
  detail,
  /** Index into `weeks`/`detail.cells` for the week this cell sits in, or null
   *  when the grid's week has no counterpart in the séptimo lens. */
  weekIndex,
}: {
  workerName: string;
  amount: number;
  weeks: SeptimoWeekMeta[];
  detail: SeptimoDetail | null;
  weekIndex: number | null;
}) {
  const [open, setOpen] = useState(false);

  const week = weekIndex === null ? null : (weeks[weekIndex] ?? null);
  const cell = weekIndex === null || !detail ? null : (detail.cells[weekIndex] ?? null);

  // Nothing to explain: this grid week is not a séptimo week of the period, or
  // the worker has no payroll/activity footprint in it.
  if (!week || !cell) {
    return <span className="text-finca-200">·</span>;
  }

  const decided = week.ownsSeptimo && !week.inProgress;
  const earned = decided && cell.missingDays.length === 0 && week.requiredDays > 0;
  const near = decided && cell.missingDays.length === 1;

  const label = !week.ownsSeptimo
    ? "otro per."
    : week.inProgress
      ? "en curso"
      : `${cell.attendedRequired}/${week.requiredDays}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Ver de dónde viene el séptimo de ${workerName}`}
        className={`flex w-full flex-col items-center gap-0.5 rounded px-1 py-1 leading-tight transition-colors hover:ring-1 hover:ring-finca-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-finca-400 ${
          earned ? "bg-emerald-50" : near ? "bg-amber-50" : ""
        }`}
      >
        <span
          className={`tabular-nums ${
            earned
              ? "font-semibold text-emerald-800"
              : near
                ? "font-medium text-amber-800"
                : "text-finca-500"
          }`}
        >
          {label}
        </span>
        <span className={`tabular-nums ${earned ? "text-emerald-700" : "text-finca-400"}`}>
          {decided ? formatGTQ(earned ? amount : 0) : "—"}
        </span>
      </button>

      {open && (
        <SeptimoDrawer
          workerName={workerName}
          amount={amount}
          weeks={weeks}
          detail={detail}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
