// =============================================================================
// src/app/(authenticated)/planilla/captura/page.tsx
// Weekly grid data-entry — emulates the farm's PLANILLAFINCA.xlsx entry sheet.
// One row per worker; per day a Lote · Actividad · Unidades triplet. Desktop-first.
// Access: WRITE_ROLES (data entry).
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, WRITE_ROLES } from "@/lib/auth/guards";
import { toPriceSchedule } from "@/lib/pricing/activity-prices";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";
import { CapturaGrid } from "./grid-client";

export const metadata = { title: "Captura Semanal — Finca Danilandia" };

export default async function CapturaPage() {
  const user = await requireRole(...WRITE_ROLES);
  // MASTER/ADMIN can open/extend pay periods inline when days are uncovered.
  const canManagePeriods = user.role === "MASTER" || user.role === "ADMIN";

  const [workers, activities, lotes, periods] = await Promise.all([
    prisma.worker.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.activity.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, unit: true, defaultPrice: true, prices: { select: { effectiveFrom: true, price: true }, orderBy: { effectiveFrom: "asc" } } },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    prisma.lote.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    prisma.payPeriod.findMany({
      where: { agriculturalYear: getCurrentAgriculturalYear(), isClosed: false },
      select: { id: true, periodNumber: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-finca-900">Captura Semanal</h1>
      <p className="mt-1 text-sm text-finca-500">
        Cuadrícula semanal — una fila por trabajador, y por cada día: Lote · Actividad · Unidades.
        Igual que la planilla en Excel, pero con listas para evitar errores.
      </p>
      <CapturaGrid
        workers={workers.map((w) => ({ id: w.id, name: w.fullName }))}
        activities={activities.map((a) => ({
          id: a.id,
          name: a.name,
          code: a.code,
          unit: a.unit,
          defaultPrice: a.defaultPrice != null ? Number(a.defaultPrice) : 0,
          priceSchedule: toPriceSchedule(a.prices),
        }))}
        lotes={lotes}
        periods={periods.map((p) => ({ id: p.id, periodNumber: p.periodNumber, startDate: p.startDate.toISOString().split("T")[0], endDate: p.endDate.toISOString().split("T")[0] }))}
        canManagePeriods={canManagePeriods}
      />
    </div>
  );
}
