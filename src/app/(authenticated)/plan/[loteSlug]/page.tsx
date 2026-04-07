// =============================================================================
// src/app/(authenticated)/plan/[loteSlug]/page.tsx — Single-lote plan detail
// Plan vs Actual side by side, total jornales per activity
// =============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES, WRITE_ROLES } from "@/lib/auth/guards";
import {
  getCurrentAgriculturalYear,
  formatAgriculturalYear,
  getAgriculturalMonths,
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
  getAgriculturalMonth,
  getWeekInMonth,
} from "@/lib/utils/agricultural-year";
import { PlanGrid } from "../plan-grid";
import { YearSelector } from "../year-lote-selector";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ loteSlug: string }>;
}) {
  const { loteSlug } = await params;
  const lote = await prisma.lote.findUnique({
    where: { slug: loteSlug },
    select: { name: true },
  });
  return { title: lote ? `Plan — ${lote.name}` : "Plan — Lote" };
}

type Props = {
  params: Promise<{ loteSlug: string }>;
  searchParams: Promise<{ year?: string }>;
};

export default async function LotePlanPage({ params, searchParams }: Props) {
  const user = await requireRole(...READ_ALL_ROLES);
  const { loteSlug } = await params;
  const query = await searchParams;

  const lote = await prisma.lote.findUnique({
    where: { slug: loteSlug },
    select: { id: true, name: true, slug: true, areaManzanas: true },
  });

  if (!lote) notFound();

  const currentYear = getCurrentAgriculturalYear();
  const selectedYear = query.year ?? currentYear;

  // Generate available years
  const yearStart = parseInt(currentYear.slice(0, 2), 10);
  const availableYears: { code: string; label: string }[] = [];
  for (let i = yearStart - 2; i <= yearStart + 1; i++) {
    const code = `${String(i).padStart(2, "0")}${String(i + 1).padStart(2, "0")}`;
    availableYears.push({ code, label: formatAgriculturalYear(code) });
  }

  // Fetch activities
  const activities = await prisma.activity.findMany({
    where: { isActive: true },
    select: { id: true, name: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  // Fetch plan entries for this lote
  const planEntries = await prisma.planEntry.findMany({
    where: {
      agriculturalYear: selectedYear,
      loteId: lote.id,
    },
    select: {
      activityId: true,
      loteId: true,
      month: true,
      week: true,
      plannedJornales: true,
    },
  });

  // Fetch actual activity records for this lote
  const startDate = getAgriculturalYearStart(selectedYear);
  const endDate = getAgriculturalYearEnd(selectedYear);

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
    const d = new Date(rec.date);
    return {
      loteId: rec.loteId,
      activityId: rec.activityId,
      month: getAgriculturalMonth(d),
      week: getWeekInMonth(d),
      actualJornales: Number(rec.quantity),
    };
  });

  const months = getAgriculturalMonths(selectedYear);
  const canEdit = WRITE_ROLES.includes(user.role);

  // Compute per-activity totals for the summary table
  const planByActivity: Record<string, number> = {};
  const actualByActivity: Record<string, number> = {};

  for (const e of planEntries) {
    planByActivity[e.activityId] =
      (planByActivity[e.activityId] ?? 0) + Number(e.plannedJornales);
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
          href={`/plan?year=${selectedYear}` as never}
          className="mb-3 inline-flex items-center gap-1 text-sm text-finca-600 hover:text-finca-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al plan general
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-finca-900">
              <MapPin className="h-6 w-6 text-earth-600" />
              Plan — {lote.name}
            </h1>
            <p className="mt-1 text-sm text-finca-600">
              {lote.areaManzanas
                ? `${Number(lote.areaManzanas)} mz · `
                : ""}
              Año agrícola {formatAgriculturalYear(selectedYear)}
            </p>
          </div>

          <YearSelector
            availableYears={availableYears}
            selectedYear={selectedYear}
            basePath={`/plan/${lote.slug}`}
          />
        </div>
      </div>

      {/* Summary table: Plan vs Actual per activity */}
      <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-finca-50">
              <th className="px-4 py-2 text-left font-medium text-finca-800">
                Actividad
              </th>
              <th className="px-4 py-2 text-right font-medium text-finca-800">
                Plan (jornales)
              </th>
              <th className="px-4 py-2 text-right font-medium text-finca-800">
                Real (jornales)
              </th>
              <th className="px-4 py-2 text-right font-medium text-finca-800">
                Diferencia
              </th>
              <th className="px-4 py-2 text-center font-medium text-finca-800">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {activities.map((act) => {
              const planned = planByActivity[act.id] ?? 0;
              const actual = actualByActivity[act.id] ?? 0;
              const diff = actual - planned;
              const deviation =
                planned > 0 ? Math.abs(diff) / planned : actual > 0 ? 1 : 0;

              let statusColor = "bg-gray-100 text-gray-500";
              let statusLabel = "Sin datos";
              if (planned > 0 || actual > 0) {
                if (deviation <= 0.2) {
                  statusColor = "bg-green-100 text-green-800";
                  statusLabel = "En rango";
                } else if (deviation <= 0.5) {
                  statusColor = "bg-yellow-100 text-yellow-800";
                  statusLabel = "Desviación";
                } else {
                  statusColor = "bg-red-100 text-red-800";
                  statusLabel = "Alerta";
                }
              }

              if (planned === 0 && actual === 0) return null;

              return (
                <tr
                  key={act.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="px-4 py-2 font-medium text-finca-900">
                    {act.name}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {planned.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {actual.toFixed(1)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : ""
                    }`}
                  >
                    {diff > 0 ? "+" : ""}
                    {diff.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
                    >
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300 bg-finca-50 font-semibold">
              <td className="px-4 py-2 text-finca-900">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {totalPlanned.toFixed(1)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {totalActual.toFixed(1)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {(totalActual - totalPlanned).toFixed(1)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Detailed week-by-week grid */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-finca-800">
          Detalle semanal
        </h2>
        <PlanGrid
          key={`${selectedYear}_${lote.id}`}
          agriculturalYear={selectedYear}
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
          initialPlan={planEntries.map((e) => ({
            activityId: e.activityId,
            loteId: e.loteId,
            month: e.month,
            week: e.week,
            plannedJornales: Number(e.plannedJornales),
          }))}
          initialActual={actualData}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}
