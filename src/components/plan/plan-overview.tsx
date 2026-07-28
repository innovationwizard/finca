// =============================================================================
// src/components/plan/plan-overview.tsx — Plan Anual overview (Server Component)
// The whole body of a cosecha's plan page: KPIs, Plan vs Ejecutado summary, the
// per-lote links and the editable week grid.
//
// One cosecha per route (/plan2526, /plan2627, ...), each passing its own
// `agriculturalYear`. This used to be a single /plan page with a year dropdown,
// which meant the page title said one cosecha while the grid could be showing
// another. The season is now in the URL, so it cannot drift.
// =============================================================================

import Link from "next/link";
import type { Route } from "next";
import { CalendarRange, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES, WRITE_ROLES } from "@/lib/auth/guards";
import {
  getCurrentAgriculturalYear,
  formatAgriculturalYear,
  formatAgriculturalYearShort,
  getAgriculturalMonths,
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
} from "@/lib/utils/agricultural-year";
import { cellOf, weekStartOf } from "@/lib/plan/plan-week";
import { PlanGrid } from "./plan-grid";
import { LoteSelector } from "./lote-selector";
import { PlanSummaryTable } from "./plan-summary-table";
import { PlanKpiCards } from "./plan-kpi-cards";

export type PlanOverviewProps = {
  /** Cosecha code this page is pinned to, e.g. "2526". */
  agriculturalYear: string;
  /** This page's own route, e.g. "/plan2526". */
  basePath: string;
  /** Lote filter from the URL; null = GENERAL (all lotes aggregated). */
  loteId: string | null;
};

export async function PlanOverview({
  agriculturalYear,
  basePath,
  loteId,
}: PlanOverviewProps) {
  const user = await requireRole(...READ_ALL_ROLES);

  const currentYear = getCurrentAgriculturalYear();
  const selectedLoteId = loteId;

  const lotes = await prisma.lote.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { sortOrder: "asc" },
  });

  const activities = await prisma.activity.findMany({
    where: { isActive: true },
    select: { id: true, name: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  // The cosecha's date window. Plan cells and executed records are both selected
  // by date — the cosecha a row belongs to is derived from its date, never
  // stored, so moving the window moves nothing in the database.
  const startDate = getAgriculturalYearStart(agriculturalYear);
  const endDate = getAgriculturalYearEnd(agriculturalYear);

  const planWhere: Record<string, unknown> = {
    weekStart: { gte: startDate, lte: endDate },
  };
  if (selectedLoteId) planWhere.loteId = selectedLoteId;

  const planEntries = await prisma.planEntry.findMany({
    where: planWhere,
    select: {
      activityId: true,
      loteId: true,
      weekStart: true,
      plannedJornales: true,
    },
  });

  const actualWhere: Record<string, unknown> = {
    date: { gte: startDate, lte: endDate },
  };
  if (selectedLoteId) actualWhere.loteId = selectedLoteId;

  const activityRecords = await prisma.activityRecord.findMany({
    where: actualWhere,
    select: {
      date: true,
      activityId: true,
      loteId: true,
      quantity: true,
    },
  });

  const actualData = activityRecords.map((rec) => {
    const cell = cellOf(weekStartOf(rec.date));
    return {
      loteId: rec.loteId,
      activityId: rec.activityId,
      month: cell.agMonth,
      week: cell.week,
      actualJornales: Number(rec.quantity),
    };
  });

  // Plan cells carry a date; the grid draws a month × week matrix. Translate
  // once, here, so geometry stays a rendering concern.
  const planCells = planEntries.map((e) => {
    const cell = cellOf(e.weekStart);
    return {
      activityId: e.activityId,
      loteId: e.loteId,
      month: cell.agMonth,
      week: cell.week,
      plannedJornales: Number(e.plannedJornales),
    };
  });

  // ---------------------------------------------------------------------------
  // Per-activity aggregates for the summary table
  // ---------------------------------------------------------------------------
  const planByActivity: Record<string, number> = {};
  const actualByActivity: Record<string, number> = {};

  for (const e of planCells) {
    planByActivity[e.activityId] =
      (planByActivity[e.activityId] ?? 0) + e.plannedJornales;
  }
  for (const e of actualData) {
    actualByActivity[e.activityId] =
      (actualByActivity[e.activityId] ?? 0) + e.actualJornales;
  }

  const totalPlanned = Object.values(planByActivity).reduce((s, v) => s + v, 0);
  const totalActual = Object.values(actualByActivity).reduce((s, v) => s + v, 0);

  // ---------------------------------------------------------------------------
  // YTD calculations for KPI cards
  // Plan YTD: only planned jornales for weeks that have already started.
  // - Past cosecha: all weeks have elapsed → planYtd = full year total
  // - Current cosecha: filter by today's agricultural month/week position
  // - Future cosecha: no weeks have started → planYtd = 0
  // Actual YTD: all recorded jornales (records can only be past dates)
  // ---------------------------------------------------------------------------
  let planYtd: number;

  if (agriculturalYear < currentYear) {
    planYtd = planCells.reduce((sum, e) => sum + e.plannedJornales, 0);
  } else if (agriculturalYear > currentYear) {
    planYtd = 0;
  } else {
    const todayCell = cellOf(weekStartOf(new Date()));
    const todayAgMonth = todayCell.agMonth;
    const todayWeek = todayCell.week;
    planYtd = planCells.reduce((sum, e) => {
      const elapsed =
        e.month < todayAgMonth ||
        (e.month === todayAgMonth && e.week <= todayWeek);
      return elapsed ? sum + e.plannedJornales : sum;
    }, 0);
  }

  const actualYtd = actualData.reduce((sum, e) => sum + e.actualJornales, 0);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const months = getAgriculturalMonths(agriculturalYear);
  const canEdit = WRITE_ROLES.includes(user.role);
  const loteIds = lotes.map((l) => l.id);
  const selectedLote = selectedLoteId
    ? lotes.find((l) => l.id === selectedLoteId)
    : null;

  return (
    <div className="mx-auto max-w-full px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-finca-900">
            <CalendarRange className="h-6 w-6 text-earth-600" />
            Plan Anual de Actividades{" "}
            {formatAgriculturalYearShort(agriculturalYear)}
          </h1>
          <p className="mt-1 text-sm text-finca-600">
            Cosecha {formatAgriculturalYear(agriculturalYear)} · 1 de octubre al
            30 de septiembre. Planificación de jornales por actividad, lote y
            semana. Comparativa plan vs. ejecutado.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <LoteSelector
          lotes={lotes.map((l) => ({ id: l.id, name: l.name }))}
          selectedLoteId={selectedLoteId}
          basePath={basePath}
        />
      </div>

      {/* KPI Cards */}
      <PlanKpiCards planYtd={planYtd} actualYtd={actualYtd} />

      {/* Summary table: Plan vs Ejecutado per activity */}
      {activities.length > 0 && (
        <div className="mb-6">
          <PlanSummaryTable
            activities={activities}
            planByActivity={planByActivity}
            actualByActivity={actualByActivity}
            totalPlanned={totalPlanned}
            totalActual={totalActual}
          />
        </div>
      )}

      {/* Lote detail links */}
      {!selectedLoteId && lotes.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {lotes.map((l) => (
            <Link
              key={l.id}
              href={`${basePath}/${l.slug}` as Route}
              className="inline-flex items-center gap-1 rounded-md border border-finca-200 bg-white px-3 py-1.5 text-xs font-medium text-finca-700 transition-colors hover:border-earth-400 hover:bg-earth-50 hover:text-earth-700"
            >
              {l.name}
              <ChevronRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      )}

      {/* Grid */}
      {activities.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">
            No hay actividades configuradas. Configure actividades en{" "}
            <Link
              href={"/admin/actividades" as Route}
              className="font-medium text-earth-600 underline hover:text-earth-700"
            >
              Administración &rarr; Actividades
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          {selectedLote && (
            <h2 className="mb-3 text-sm font-semibold text-finca-800">
              Lote: {selectedLote.name}
            </h2>
          )}
          <PlanGrid
            key={`${agriculturalYear}_${selectedLoteId ?? "general"}`}
            agriculturalYear={agriculturalYear}
            loteId={selectedLoteId}
            loteIds={loteIds}
            activities={activities.map((a) => ({
              id: a.id,
              name: a.name,
              sortOrder: a.sortOrder,
            }))}
            months={months.map((m) => ({
              agMonth: m.agMonth,
              label: m.label,
            }))}
            initialPlan={planCells}
            initialActual={actualData}
            canEdit={canEdit}
          />
        </div>
      )}
    </div>
  );
}
