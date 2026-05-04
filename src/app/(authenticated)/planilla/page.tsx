// =============================================================================
// src/app/(authenticated)/planilla/page.tsx — Activity records list
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";
import { PlanillaList } from "./planilla-list";
import { NewPeriodModal } from "./new-period-modal";
import Link from "next/link";

export const metadata = { title: "Planilla" };

export default async function PlanillaPage() {
  const user = await requireRole(...READ_ALL_ROLES);

  const year = getCurrentAgriculturalYear();

  const canWrite = user.role === "MASTER" || user.role === "ADMIN" || user.role === "FIELD";
  const canCreatePeriod = user.role === "MASTER" || user.role === "ADMIN";

  // Get current open period + last closed period to suggest next start date
  const [currentPeriod, lastPeriod] = await Promise.all([
    prisma.payPeriod.findFirst({
      where: { agriculturalYear: year, isClosed: false },
      orderBy: { periodNumber: "desc" },
    }),
    prisma.payPeriod.findFirst({
      where: { agriculturalYear: year },
      orderBy: { periodNumber: "desc" },
      select: { endDate: true },
    }),
  ]);

  // Day after the last period ended
  const suggestedStartDate = lastPeriod
    ? new Date(lastPeriod.endDate.getTime() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
    : null;

  // Get recent records (last 7 days or current period)
  const records = await prisma.activityRecord.findMany({
    where: currentPeriod
      ? { payPeriodId: currentPeriod.id }
      : {
          date: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
    include: {
      worker: { select: { id: true, fullName: true } },
      activity: { select: { id: true, name: true, unit: true } },
      lote: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  // Aggregate stats
  const totalEarned = records.reduce(
    (sum, r) => sum + Number(r.totalEarned),
    0,
  );
  const uniqueWorkers = new Set(records.map((r) => r.workerId)).size;
  const uniqueDays = new Set(
    records.map((r) => r.date.toISOString().split("T")[0]),
  ).size;

  const serialized = records.map((r) => ({
    ...r,
    date: r.date.toISOString().split("T")[0],
    quantity: Number(r.quantity),
    unitPrice: Number(r.unitPrice),
    totalEarned: Number(r.totalEarned),
    syncedAt: r.syncedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
            Planilla
          </h1>
          <p className="mt-1 text-sm text-finca-500">
            {currentPeriod
              ? `Semana ${currentPeriod.periodNumber} · Año ${year}`
              : `Año agrícola ${year} · Sin período abierto`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreatePeriod && currentPeriod && (
            <NewPeriodModal suggestedStartDate={suggestedStartDate} />
          )}
          {canWrite && (
            <Link
              href="/planilla/nueva"
              className="inline-flex items-center justify-center rounded-lg bg-finca-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 touch-target"
            >
              + Nuevo Registro
            </Link>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Total Devengado
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            Q{totalEarned.toLocaleString("es-GT", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Trabajadores
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {uniqueWorkers}
          </p>
        </div>
        <div className="hidden rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm sm:block">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Días Registrados
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {uniqueDays}
          </p>
        </div>
      </div>

      {/* Records table */}
      <div className="mt-6">
        {currentPeriod ? (
          <PlanillaList records={serialized} canWrite={canWrite} />
        ) : canCreatePeriod ? (
          <NewPeriodModal inline suggestedStartDate={suggestedStartDate} />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
            <p className="text-sm text-amber-800">
              No hay un período de pago abierto. Contacte a un administrador para crear uno.
            </p>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-6 flex gap-3">
        <Link
          href="/planilla/resumen"
          className="rounded-lg border border-finca-200 bg-white px-4 py-2 text-sm font-medium text-finca-700 transition-colors hover:bg-finca-50"
        >
          Ver Resumen de Pago
        </Link>
      </div>
    </div>
  );
}
