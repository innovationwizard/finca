// =============================================================================
// src/app/(authenticated)/plan/page.tsx — Plan Anual overview (Server Component)
// =============================================================================

import Link from "next/link";
import { CalendarRange, ChevronRight } from "lucide-react";
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
import { PlanGrid } from "./plan-grid";
import { YearSelector, LoteSelector } from "./year-lote-selector";

export const metadata = { title: "Plan Anual" };

type Props = {
  searchParams: Promise<{ year?: string; loteId?: string }>;
};

export default async function PlanPage({ searchParams }: Props) {
  const user = await requireRole(...READ_ALL_ROLES);
  const params = await searchParams;

  const currentYear = getCurrentAgriculturalYear();
  const selectedYear = params.year ?? currentYear;
  const selectedLoteId = params.loteId ?? null;

  // Generate available years: current ± 2
  const yearStart = parseInt(currentYear.slice(0, 2), 10);
  const availableYears: { code: string; label: string }[] = [];
  for (let i = yearStart - 2; i <= yearStart + 1; i++) {
    const code = `${String(i).padStart(2, "0")}${String(i + 1).padStart(2, "0")}`;
    availableYears.push({ code, label: formatAgriculturalYear(code) });
  }

  // Fetch lotes
  const lotes = await prisma.lote.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { sortOrder: "asc" },
  });

  // Fetch activities
  const activities = await prisma.activity.findMany({
    where: { isActive: true },
    select: { id: true, name: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  // Fetch plan entries
  const planWhere: Record<string, unknown> = { agriculturalYear: selectedYear };
  if (selectedLoteId) planWhere.loteId = selectedLoteId;

  const planEntries = await prisma.planEntry.findMany({
    where: planWhere,
    select: {
      activityId: true,
      loteId: true,
      month: true,
      week: true,
      plannedJornales: true,
    },
  });

  // Fetch actual activity records for comparison
  const startDate = getAgriculturalYearStart(selectedYear);
  const endDate = getAgriculturalYearEnd(selectedYear);
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

  // Transform actual records to the format expected by PlanGrid
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
            Plan Anual de Actividades
          </h1>
          <p className="mt-1 text-sm text-finca-600">
            Planificación de jornales por actividad, lote y semana.
            Comparativa plan vs. ejecutado.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <YearSelector
          availableYears={availableYears}
          selectedYear={selectedYear}
          preserveParams={selectedLoteId ? { loteId: selectedLoteId } : undefined}
        />
        <LoteSelector
          lotes={lotes.map((l) => ({ id: l.id, name: l.name }))}
          selectedLoteId={selectedLoteId}
          selectedYear={selectedYear}
        />
      </div>

      {/* Lote detail links */}
      {!selectedLoteId && lotes.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {lotes.map((l) => (
            <Link
              key={l.id}
              href={`/plan/${l.slug}?year=${selectedYear}` as never}
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
              href={"/admin/actividades" as never}
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
            agriculturalYear={selectedYear}
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
      )}
    </div>
  );
}
