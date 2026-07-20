// =============================================================================
// src/app/(authenticated)/planilla/page.tsx — "Planillas anteriores"
// Read-only historical review of CLOSED pay periods. Three tiers:
//   1. Period navigation: one button per closed period, labeled by number alone.
//   2. Week selection: one button per Mon–Sat calendar week the period spans
//      (full-week labels, séptimo model) plus "Período completo".
//   3. Body: a compact Captura-style grid (rows = active roster, columns = days
//      × Lote · Actividad · Unidades) for the chosen week, or every week when
//      "Período completo" (horizontal overflow is expected there).
// Pure server component — all selection is via search params + <Link>, no client
// JS. Closed periods are immutable, so the grid is strictly read-only.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";
import { formatGTQ } from "@/lib/utils/format";
import Link from "next/link";
import type { Route } from "next";
import { Download } from "lucide-react";
import { WorkerFilter } from "./worker-filter";
import {
  DAY_LABELS,
  dayMsUTC,
  dm,
  isoUTC,
  weekLabel,
  periodWeeks,
  buildGrid,
  cellKey,
  entryActivityLabel,
  entryDetailLabel,
} from "@/lib/planilla/history";

export const metadata = { title: "Planillas anteriores" };

type Props = { searchParams: Promise<{ periodo?: string; semana?: string; trabajador?: string }> };

export default async function PlanillasAnterioresPage({ searchParams }: Props) {
  // FIELD (caporal) reviews history alongside the read-all roles, as before.
  await requireRole(...READ_ALL_ROLES, "FIELD");
  const params = await searchParams;
  const year = getCurrentAgriculturalYear();

  // Closed periods only — the open period lives on Captura Semanal.
  const periods = await prisma.payPeriod.findMany({
    where: { agriculturalYear: year, isClosed: true },
    orderBy: { periodNumber: "desc" },
    select: { id: true, periodNumber: true, startDate: true, endDate: true },
  });

  if (periods.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">Planillas anteriores</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
          <p className="text-sm text-amber-800">
            Aún no hay períodos cerrados en el año agrícola {year}. Al cerrar un período en{" "}
            <b>Captura Semanal</b> aparecerá aquí.
          </p>
        </div>
      </div>
    );
  }

  // Selected period (default: most recent closed).
  const period = periods.find((p) => p.id === params.periodo) ?? periods[0];
  const weeks = periodWeeks(period.startDate, period.endDate);

  // Selected view: "all" (completo) or a week index (default: most recent week).
  const completo = params.semana === "all";
  let selWeekIdx = weeks.length - 1;
  if (!completo && params.semana != null) {
    const n = Number(params.semana);
    if (Number.isInteger(n) && n >= 0 && n < weeks.length) selWeekIdx = n;
  }

  const visibleWeeks = completo ? weeks : [weeks[selWeekIdx]];
  const visibleDays = visibleWeeks.flatMap((w) => w.days);
  const rangeStart = visibleDays[0];
  const rangeEnd = visibleDays[visibleDays.length - 1];

  // Records BY DATE over the visible range — so a full calendar week shows even
  // the days that spilled in from an adjacent period (séptimo model).
  const records = await prisma.activityRecord.findMany({
    where: { date: { gte: new Date(`${rangeStart}T00:00:00.000Z`), lte: new Date(`${rangeEnd}T00:00:00.000Z`) } },
    select: {
      workerId: true,
      date: true,
      quantity: true,
      totalEarned: true,
      activity: { select: { name: true, code: true, unit: true } },
      lote: { select: { name: true } },
    },
  });

  // Full active roster (every active worker shows, even with an empty week).
  const workers = await prisma.worker.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });

  // Per-worker filter (?trabajador=). Empty/unknown id → show everyone.
  const selectedWorker = workers.some((w) => w.id === params.trabajador) ? params.trabajador! : "";
  const displayWorkers = selectedWorker ? workers.filter((w) => w.id === selectedWorker) : workers;

  // Cell map + per-worker totals (shared with the xlsx export so the download
  // can never diverge from what this grid shows). A worker may have >1 activity
  // in a day; entries are never collapsed — every record is shown.
  const { cells, workerTotals } = buildGrid(records);
  const grandTotal = displayWorkers.reduce((s, w) => s + (workerTotals.get(w.id) ?? 0), 0);

  // Cast to Route: typedRoutes can't infer literal routes from dynamic query
  // strings, so these built-at-runtime hrefs come out as `string`.
  const periodHref = (id: string) => `/planilla?periodo=${id}` as Route;
  const weekHref = (i: number) => `/planilla?periodo=${period.id}&semana=${i}` as Route;
  const completoHref = `/planilla?periodo=${period.id}&semana=all` as Route;

  // xlsx download of every view of THIS period (one sheet per week + Período
  // completo), honoring the active worker filter. Always all weeks — the week
  // selection above only chooses what's on screen, not what's downloaded.
  const exportHref = `/api/planilla/export?periodo=${period.id}${
    selectedWorker ? `&trabajador=${selectedWorker}` : ""
  }`;

  return (
    <div className="mx-auto max-w-full px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Tier 1: period navigation ─────────────────────────────────────── */}
      <h1 className="text-2xl font-semibold tracking-tight text-finca-900">Planillas anteriores</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {periods.map((p) => {
          const active = p.id === period.id;
          return (
            <Link
              key={p.id}
              href={periodHref(p.id)}
              aria-current={active ? "page" : undefined}
              title={`Período ${p.periodNumber} · ${dm(isoUTC(dayMsUTC(p.startDate)))}–${dm(isoUTC(dayMsUTC(p.endDate)))}`}
              className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-sm font-semibold tabular-nums transition-colors ${
                active
                  ? "bg-finca-900 text-white"
                  : "border border-finca-200 bg-white text-finca-700 hover:bg-finca-50"
              }`}
            >
              {p.periodNumber}
            </Link>
          );
        })}
      </div>

      {/* ── Tier 2: week selection ────────────────────────────────────────── */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-finca-500">
        Semanas del período
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {weeks.map((w) => {
          const active = !completo && w.index === selWeekIdx;
          return (
            <Link
              key={w.index}
              href={weekHref(w.index)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors ${
                active
                  ? "bg-earth-600 text-white"
                  : "border border-finca-200 bg-white text-finca-700 hover:bg-finca-50"
              }`}
            >
              {weekLabel(w.monday, w.saturday)}
            </Link>
          );
        })}
        <Link
          href={completoHref}
          aria-current={completo ? "page" : undefined}
          className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors ${
            completo
              ? "bg-earth-600 text-white"
              : "border border-finca-200 bg-white text-finca-700 hover:bg-finca-50"
          }`}
        >
          Período completo
        </Link>
      </div>

      {/* Per-worker filter + xlsx download */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <WorkerFilter
          workers={workers.map((w) => ({ id: w.id, name: w.fullName }))}
          selected={selectedWorker}
        />
        <a
          href={exportHref}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-finca-200 bg-white px-4 text-sm font-medium text-finca-700 transition-colors hover:bg-finca-50"
          title={`Descargar el período ${period.periodNumber} en Excel: una hoja por semana más el período completo${
            selectedWorker ? " (solo el trabajador filtrado)" : ""
          }`}
        >
          <Download className="h-4 w-4" />
          Descargar Excel
        </a>
      </div>

      {/* ── Tier 3: the grid ──────────────────────────────────────────────── */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="border-collapse text-[11px] leading-tight">
          <thead>
            {/* Week band — only when several weeks are shown (Período completo). */}
            {visibleWeeks.length > 1 && (
              <tr className="bg-finca-100/70">
                <th className="sticky left-0 z-20 border border-finca-100 bg-finca-100/70" />
                <th className="sticky left-8 z-20 border border-finca-100 bg-finca-100/70" />
                {visibleWeeks.map((w) => (
                  <th
                    key={w.monday}
                    colSpan={6}
                    className="border border-finca-100 px-2 py-1 text-center text-[11px] font-semibold text-finca-600"
                  >
                    {weekLabel(w.monday, w.saturday)}
                  </th>
                ))}
                <th className="border border-finca-100 bg-finca-100/70" />
              </tr>
            )}
            <tr className="bg-finca-50 text-finca-600">
              <th className="sticky left-0 z-20 w-8 border border-finca-100 bg-finca-50 px-2 py-1.5 text-left font-medium">#</th>
              <th className="sticky left-8 z-20 border border-finca-100 bg-finca-50 px-2 py-1.5 text-left font-medium">Trabajador</th>
              {visibleDays.map((d, i) => (
                <th key={d} className="min-w-[6.5rem] max-w-[9rem] border border-finca-100 px-2 py-1.5 text-center font-medium">
                  {DAY_LABELS[i % 6]} {dm(d)}
                </th>
              ))}
              <th className="border border-finca-100 px-2 py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {displayWorkers.map((w, idx) => (
              <tr key={w.id} className="align-top hover:bg-finca-50/40">
                <td className="sticky left-0 z-10 w-8 border border-finca-100 bg-white px-2 py-1 text-finca-400">{idx + 1}</td>
                <td className="sticky left-8 z-10 whitespace-nowrap border border-finca-100 bg-white px-2 py-1 font-medium text-finca-900">
                  {w.fullName}
                </td>
                {visibleDays.map((d) => {
                  const entries = cells.get(cellKey(w.id, d));
                  return (
                    <td key={d} className="min-w-[6.5rem] max-w-[9rem] border border-finca-100 px-1.5 py-1 align-top">
                      {entries
                        ? entries.map((e, i) => (
                            <div key={i} className={i > 0 ? "mt-1 border-t border-finca-50 pt-1" : ""}>
                              <div className="truncate font-medium text-finca-700" title={entryActivityLabel(e)}>
                                {entryActivityLabel(e)}
                              </div>
                              <div className="truncate text-finca-400" title={entryDetailLabel(e)}>
                                {entryDetailLabel(e)}
                              </div>
                            </div>
                          ))
                        : <span className="text-finca-200">·</span>}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap border border-finca-100 px-2 py-1 text-right font-medium tabular-nums text-finca-900">
                  {formatGTQ(workerTotals.get(w.id) ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-finca-200 bg-finca-50/60">
              <td className="sticky left-0 z-10 border border-finca-100 bg-finca-50/60" />
              <td className="sticky left-8 z-10 border border-finca-100 bg-finca-50/60 px-2 py-2 text-right text-xs font-semibold text-finca-600" colSpan={1}>
                Total
              </td>
              <td className="border border-finca-100" colSpan={visibleDays.length} />
              <td className="whitespace-nowrap border border-finca-100 px-2 py-2 text-right text-xs font-semibold tabular-nums text-finca-900">
                {formatGTQ(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Quick link */}
      <div className="mt-6">
        <Link
          href="/planilla/resumen"
          className="rounded-lg border border-finca-200 bg-white px-4 py-2 text-sm font-medium text-finca-700 transition-colors hover:bg-finca-50"
        >
          Ver Resumen de Pago del Período Actual
        </Link>
      </div>
    </div>
  );
}
