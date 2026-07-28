// =============================================================================
// src/components/plan/plan-lote-detail.tsx — Single-lote plan detail
// Plan vs Ejecutado summary table + detailed week-by-week grid, for one lote of
// one cosecha. Pinned to the cosecha its route names; see plan-overview.tsx.
// =============================================================================

import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES, WRITE_ROLES } from "@/lib/auth/guards";
import {
  formatAgriculturalYear,
  formatAgriculturalYearShort,
  getAgriculturalMonths,
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
} from "@/lib/utils/agricultural-year";
import { cellOf, weekStartOf } from "@/lib/plan/plan-week";
import { PlanGrid } from "./plan-grid";
import { PlanSummaryTable } from "./plan-summary-table";

export type PlanLoteDetailProps = {
  /** Cosecha code this page is pinned to, e.g. "2526". */
  agriculturalYear: string;
  /** The parent plan route, e.g. "/plan2526". */
  basePath: string;
  loteSlug: string;
};

export async function PlanLoteDetail({
  agriculturalYear,
  basePath,
  loteSlug,
}: PlanLoteDetailProps) {
  const user = await requireRole(...READ_ALL_ROLES);

  const lote = await prisma.lote.findUnique({
    where: { slug: loteSlug },
    select: { id: true, name: true, slug: true, areaManzanas: true },
  });

  if (!lote) notFound();

  const activities = await prisma.activity.findMany({
    where: { isActive: true },
    select: { id: true, name: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  // Both the plan and the executed records are selected by date over the
  // cosecha's window — a row's cosecha is derived from its date, never stored.
  const startDate = getAgriculturalYearStart(agriculturalYear);
  const endDate = getAgriculturalYearEnd(agriculturalYear);

  const planEntries = await prisma.planEntry.findMany({
    where: {
      weekStart: { gte: startDate, lte: endDate },
      loteId: lote.id,
    },
    select: {
      activityId: true,
      loteId: true,
      weekStart: true,
      plannedJornales: true,
    },
  });

  const activityRecords = await prisma.activityRecord.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      loteId: lote.id,
    },
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

  // Plan cells carry a date; the grid draws a month x week matrix. Translate
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

  const months = getAgriculturalMonths(agriculturalYear);
  const canEdit = WRITE_ROLES.includes(user.role);

  // Per-activity totals for the summary table
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

  return (
    <div className="mx-auto max-w-full px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={basePath as Route}
          className="mb-3 inline-flex items-center gap-1 text-sm text-finca-600 hover:text-finca-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al plan general {formatAgriculturalYearShort(agriculturalYear)}
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-finca-900">
              <MapPin className="h-6 w-6 text-earth-600" />
              Plan {formatAgriculturalYearShort(agriculturalYear)} — {lote.name}
            </h1>
            <p className="mt-1 text-sm text-finca-600">
              {lote.areaManzanas ? `${Number(lote.areaManzanas)} mz · ` : ""}
              Cosecha {formatAgriculturalYear(agriculturalYear)}
            </p>
          </div>
        </div>
      </div>

      {/* Summary table: Plan vs Ejecutado per activity */}
      <div className="mb-6">
        <PlanSummaryTable
          activities={activities}
          planByActivity={planByActivity}
          actualByActivity={actualByActivity}
          totalPlanned={totalPlanned}
          totalActual={totalActual}
        />
      </div>

      {/* Detailed week-by-week grid */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-finca-800">
          Detalle semanal
        </h2>
        <PlanGrid
          key={`${agriculturalYear}_${lote.id}`}
          agriculturalYear={agriculturalYear}
          loteId={lote.id}
          loteIds={[lote.id]}
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
    </div>
  );
}
