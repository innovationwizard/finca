"use client";

// =============================================================================
// src/components/planilla/septimo-drawer.tsx
// Drill-down for a "Séptimo" cell: where one worker's séptimo amount comes
// from, week by week. Shared by Revisión y Autorización (open period) and
// Planillas anteriores (closed periods), so both explain it identically.
//
// The séptimo is the only figure on this screen that is DERIVED rather than
// CAPTURED — it generates no ActivityRecord, so "Detalle de registros" cannot
// show it and "Acumulados" deliberately excludes it. Without this drawer the
// authorizer approves a number with no on-screen path to its evidence.
//
// Encoding: the séptimo is not money-shaped, it is RULE-shaped — one boolean
// test per owned week, each paying a fixed amount. So each week renders as a
// discrete state (ganado / faltó N / en curso / otro período), never as a bar
// or a colour ramp over the money. The missing DATES are the evidence a
// reviewer asks for first, so they are named, not just counted.
//
// Rules and figures come from @/lib/planilla/septimo-semanal — the same module
// behind the Excel Séptimos export, so this drawer can never disagree with it.
// =============================================================================

import { useEffect } from "react";
import { X, AlertTriangle, Check } from "lucide-react";
import { formatGTQ } from "@/lib/utils/format";

export type SeptimoWeekMeta = {
  label: string; // "Semana del 10/08 al 15/08" (clipped to the period)
  monday: string;
  saturday: string;
  requiredDays: number; // Mon–Sat minus holidays
  ownsSeptimo: boolean; // the Saturday falls inside this period
  inProgress: boolean; // the Saturday has not happened yet
};

export type SeptimoCellDetail = {
  attendedRequired: number;
  missingDays: string[];
  septimo: number | null;
  actividades: number;
};

export type SeptimoDetail = {
  cells: SeptimoCellDetail[]; // one per week, in order
  calculado: number;
  planilla: number;
  diferencia: number;
};

/** "15/08" from "2026-08-15" — no Date parsing, so no timezone can shift it. */
const dm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** "jue 20/08" — weekday from the ISO date via UTC, matching the @db.Date model. */
const namedDay = (iso: string): string =>
  `${DOW[new Date(`${iso}T00:00:00.000Z`).getUTCDay()]} ${dm(iso)}`;

type WeekState = "ganado" | "casi" | "noGanado" | "enCurso" | "otroPeriodo";

function weekState(w: SeptimoWeekMeta, c: SeptimoCellDetail): WeekState {
  if (!w.ownsSeptimo) return "otroPeriodo";
  if (w.inProgress) return "enCurso";
  if (c.missingDays.length === 0 && w.requiredDays > 0) return "ganado";
  return c.missingDays.length === 1 ? "casi" : "noGanado";
}

const STATE_STYLE: Record<WeekState, { row: string; chip: string; label: string }> = {
  ganado: {
    row: "bg-emerald-50/60",
    chip: "bg-emerald-100 text-emerald-800",
    label: "Ganado",
  },
  casi: {
    // The analytically interesting case: one absence from the whole amount.
    row: "bg-amber-50/60",
    chip: "bg-amber-100 text-amber-800",
    label: "Faltó 1 día",
  },
  noGanado: {
    row: "",
    chip: "bg-finca-100 text-finca-600",
    label: "No ganado",
  },
  enCurso: {
    // Must never read as "no ganado": the week simply has not finished.
    row: "",
    chip: "bg-sky-100 text-sky-800",
    label: "Semana en curso",
  },
  otroPeriodo: {
    row: "",
    chip: "bg-finca-100 text-finca-500",
    label: "Séptimo en otro período",
  },
};

export function SeptimoDrawer({
  workerName,
  amount,
  weeks,
  detail,
  onClose,
}: {
  workerName: string;
  amount: number; // the configured séptimo per qualifying week
  weeks: SeptimoWeekMeta[];
  detail: SeptimoDetail | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reconciled = detail ? Math.abs(detail.diferencia) < 0.005 : true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle del séptimo de ${workerName}`}
        className="w-full max-w-3xl rounded-xl border border-finca-200 bg-white shadow-lg"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-finca-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-finca-900">Séptimo · {workerName}</h2>
            <p className="mt-0.5 text-xs text-finca-500">
              Se gana {formatGTQ(amount)} por cada semana en que se asiste a todos los días requeridos
              (lunes a sábado, menos feriados).
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-finca-400 hover:bg-finca-50 hover:text-finca-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {detail === null ? (
          <div className="px-5 py-10 text-center text-sm text-finca-400">
            Este trabajador no tiene registros de actividad ni entrada de planilla en el período.
          </div>
        ) : (
          <>
            {/* Weekly evidence */}
            <div className="max-h-[60vh] overflow-auto px-5 py-4">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="text-finca-600">
                    <th className="border-b border-finca-100 py-2 pr-3 font-medium">Semana</th>
                    <th className="border-b border-finca-100 px-2 py-2 text-center font-medium">Sábado</th>
                    <th className="border-b border-finca-100 px-2 py-2 text-center font-medium">Días asistidos</th>
                    <th className="border-b border-finca-100 px-2 py-2 font-medium">Días sin registro</th>
                    <th className="border-b border-finca-100 px-2 py-2 font-medium">Estado</th>
                    <th className="border-b border-finca-100 py-2 pl-2 text-right font-medium">Séptimo</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w, i) => {
                    const c = detail.cells[i];
                    if (!c) return null;
                    const st = weekState(w, c);
                    const style = STATE_STYLE[st];
                    return (
                      <tr key={w.monday} className={style.row}>
                        <td className="whitespace-nowrap border-b border-finca-50 py-2 pr-3 text-finca-800">
                          {dm(w.monday)} – {dm(w.saturday)}
                        </td>
                        <td className="border-b border-finca-50 px-2 py-2 text-center tabular-nums text-finca-500">
                          {dm(w.saturday)}
                        </td>
                        <td className="border-b border-finca-50 px-2 py-2 text-center tabular-nums">
                          <span className={st === "ganado" ? "font-semibold text-finca-900" : "text-finca-700"}>
                            {c.attendedRequired}/{w.requiredDays}
                          </span>
                        </td>
                        <td className="border-b border-finca-50 px-2 py-2 text-finca-600">
                          {/* Only weeks this period actually DECIDES list their
                              absences. A week still running, or one whose
                              séptimo belongs to another period, would otherwise
                              show days that have not happened yet as faltas. */}
                          {st === "enCurso" || st === "otroPeriodo" || c.missingDays.length === 0
                            ? "—"
                            : c.missingDays.map(namedDay).join(", ")}
                        </td>
                        <td className="border-b border-finca-50 px-2 py-2">
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${style.chip}`}>
                            {style.label}
                          </span>
                        </td>
                        <td className="border-b border-finca-50 py-2 pl-2 text-right tabular-nums">
                          {st === "ganado" ? (
                            <span className="font-semibold text-finca-900">{formatGTQ(amount)}</span>
                          ) : (
                            <span className="text-finca-400">{w.ownsSeptimo ? formatGTQ(0) : "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="py-2 pr-3 text-right font-medium text-finca-700">
                      Séptimo calculado
                    </td>
                    <td className="py-2 pl-2 text-right font-semibold tabular-nums text-finca-900">
                      {formatGTQ(detail.calculado)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* The two boundary rules, stated where they are read — a reviewer
                  who does not know them reads the first column as a bug. */}
              {weeks.some((w) => !w.ownsSeptimo) && (
                <p className="mt-3 text-[11px] leading-relaxed text-finca-400">
                  Una semana pertenece al período que contiene su <strong>sábado</strong>. La asistencia se cuenta
                  sobre la semana completa (lunes a sábado) aunque cruce el límite del período, por lo que la
                  primera semana puede empezar antes de la fecha inicial.
                </p>
              )}
            </div>

            {/* Reconciliation: recompute vs what payroll stored. */}
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t px-5 py-3 text-xs ${
                reconciled ? "border-finca-100 bg-finca-50/60" : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="text-finca-600">
                  Calculado aquí:{" "}
                  <span className="font-semibold tabular-nums text-finca-900">{formatGTQ(detail.calculado)}</span>
                </span>
                <span className="text-finca-600">
                  En planilla:{" "}
                  <span className="font-semibold tabular-nums text-finca-900">{formatGTQ(detail.planilla)}</span>
                </span>
              </div>
              {reconciled ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> Reconciliado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Diferencia de {formatGTQ(detail.diferencia)} — vuelva a calcular la planilla
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
