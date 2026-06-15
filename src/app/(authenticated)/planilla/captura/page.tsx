// =============================================================================
// src/app/(authenticated)/planilla/captura/page.tsx
// Weekly grid data-entry — emulates the farm's PLANILLAFINCA.xlsx entry sheet.
// One row per worker; per day a Lote · Actividad · Unidades triplet. Desktop-first.
// Access: read-all roles (e.g. CFO/CONSULTANT auditors) may VIEW the grid
// read-only; WRITE_ROLES may edit and save. Writes are independently enforced by
// /api/planilla/captura, so read-only roles cannot persist anything.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, WRITE_ROLES, READ_ALL_ROLES } from "@/lib/auth/guards";
import { toPriceSchedule } from "@/lib/pricing/activity-prices";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";
import { CapturaGrid } from "./grid-client";

export const metadata = { title: "Captura Semanal — Finca Danilandia" };

// View access = anyone who can write OR can read all data (auditors included).
const VIEW_ROLES = [...new Set([...READ_ALL_ROLES, ...WRITE_ROLES])];

export default async function CapturaPage() {
  const user = await requireRole(...VIEW_ROLES);
  const canWrite = WRITE_ROLES.includes(user.role);
  // MASTER/ADMIN can open/extend pay periods inline when days are uncovered.
  const canManagePeriods = user.role === "MASTER" || user.role === "ADMIN";

  const [workers, activities, lotes, periods, existingRecords] = await Promise.all([
    prisma.worker.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.activity.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, unit: true, defaultPrice: true, prices: { select: { effectiveFrom: true, price: true }, orderBy: { effectiveFrom: "asc" } } },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    prisma.lote.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    // ALL periods (open + closed) for the current ag year: the grid needs to
    // know closed-period days too, so they show as historical/locked instead of
    // looking "uncovered" (which previously let an extend swallow them).
    prisma.payPeriod.findMany({
      where: { agriculturalYear: getCurrentAgriculturalYear() },
      select: { id: true, periodNumber: true, startDate: true, endDate: true, isClosed: true },
      orderBy: { startDate: "asc" },
    }),
    // Existing records of the OPEN period(s) so the grid shows what's already
    // saved instead of looking empty (it was write-only before). One record per
    // (worker, day) — matches the grid's cell model.
    prisma.activityRecord.findMany({
      where: { payPeriod: { agriculturalYear: getCurrentAgriculturalYear(), isClosed: false } },
      select: { workerId: true, date: true, loteId: true, activityId: true, quantity: true },
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
        periods={periods.map((p) => ({ id: p.id, periodNumber: p.periodNumber, startDate: p.startDate.toISOString().split("T")[0], endDate: p.endDate.toISOString().split("T")[0], isClosed: p.isClosed }))}
        canWrite={canWrite}
        canManagePeriods={canManagePeriods}
        existing={existingRecords.map((r) => ({ workerId: r.workerId, date: r.date.toISOString().split("T")[0], loteId: r.loteId ?? "", activityId: r.activityId, units: String(Number(r.quantity)) }))}
      />
    </div>
  );
}
