// =============================================================================
// src/app/(authenticated)/dashboard/page.tsx — Executive dashboard
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import {
  getCurrentAgriculturalYear,
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
} from "@/lib/utils/agricultural-year";
import {
  WeeklyCoffeeChart,
  CostPerLoteChart,
} from "./dashboard-charts";
import type { WeeklyCoffeeData, CostPerLoteData } from "./dashboard-charts";
import {
  Users,
  Wallet,
  Coffee,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";

export const metadata = { title: "Dashboard" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtGTQ(value: number): string {
  return `Q${value.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtQQ(value: number): string {
  return `${value.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} qq`;
}

/** ISO week number (Mon-based). */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  await requireRole(...READ_ALL_ROLES);

  const year = getCurrentAgriculturalYear();
  const seasonStart = getAgriculturalYearStart(year);
  const seasonEnd = getAgriculturalYearEnd(year);

  // -------------------------------------------------------------------------
  // KPI 1: Active workers
  // -------------------------------------------------------------------------
  const activeWorkers = await prisma.worker.count({
    where: { isActive: true },
  });

  // -------------------------------------------------------------------------
  // KPI 2: Current open pay period total
  // -------------------------------------------------------------------------
  const currentPeriod = await prisma.payPeriod.findFirst({
    where: { agriculturalYear: year, isClosed: false },
    orderBy: { periodNumber: "desc" },
  });

  let periodTotal = 0;
  if (currentPeriod) {
    const agg = await prisma.activityRecord.aggregate({
      where: { payPeriodId: currentPeriod.id },
      _sum: { totalEarned: true },
    });
    periodTotal = Number(agg._sum.totalEarned ?? 0);
  }

  // -------------------------------------------------------------------------
  // KPI 3: Accumulated coffee (qq) for current agricultural year
  // -------------------------------------------------------------------------
  const coffeeAgg = await prisma.coffeeIntake.aggregate({
    where: {
      date: { gte: seasonStart, lte: seasonEnd },
    },
    _sum: { pesoNetoQq: true },
  });
  const totalCoffeeQQ = Number(coffeeAgg._sum.pesoNetoQq ?? 0);

  // -------------------------------------------------------------------------
  // KPI 4: Production vs Target (25 qq oro/mz)
  // -------------------------------------------------------------------------
  const TARGET_QQ_ORO_PER_MZ = 25;

  const estimates = await prisma.productionEstimate.findMany({
    where: { agriculturalYear: year },
    include: { lote: { select: { areaManzanas: true } } },
    orderBy: { estimateDate: "desc" },
  });

  // Take the latest estimate per lote
  const latestByLote = new Map<
    string,
    { qqOroPerManzana: number; areaManzanas: number }
  >();
  for (const est of estimates) {
    if (!latestByLote.has(est.loteId) && est.qqOroPerManzana != null && est.lote.areaManzanas != null) {
      latestByLote.set(est.loteId, {
        qqOroPerManzana: Number(est.qqOroPerManzana),
        areaManzanas: Number(est.lote.areaManzanas),
      });
    }
  }

  let productionPct = 0;
  if (latestByLote.size > 0) {
    let totalWeightedQQ = 0;
    let totalArea = 0;
    for (const { qqOroPerManzana, areaManzanas } of latestByLote.values()) {
      totalWeightedQQ += qqOroPerManzana * areaManzanas;
      totalArea += areaManzanas;
    }
    const weightedAvg = totalArea > 0 ? totalWeightedQQ / totalArea : 0;
    productionPct = Math.round((weightedAvg / TARGET_QQ_ORO_PER_MZ) * 100);
  }

  // -------------------------------------------------------------------------
  // Chart 1: Weekly coffee intake for the season
  // -------------------------------------------------------------------------
  const coffeeIntakes = await prisma.coffeeIntake.findMany({
    where: {
      date: { gte: seasonStart, lte: seasonEnd },
    },
    select: { date: true, pesoNetoQq: true },
    orderBy: { date: "asc" },
  });

  const weeklyMap = new Map<number, number>();
  for (const intake of coffeeIntakes) {
    const w = getISOWeek(intake.date);
    weeklyMap.set(w, (weeklyMap.get(w) ?? 0) + Number(intake.pesoNetoQq));
  }
  const weeklyCoffeeData: WeeklyCoffeeData[] = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([week, qq]) => ({
      week: String(week),
      qq: Math.round(qq * 100) / 100,
    }));

  // -------------------------------------------------------------------------
  // Chart 2: Cost per lote for the season
  // -------------------------------------------------------------------------
  const loteRecords = await prisma.activityRecord.findMany({
    where: {
      date: { gte: seasonStart, lte: seasonEnd },
      loteId: { not: null },
    },
    select: { loteId: true, totalEarned: true },
  });

  const costByLoteId = new Map<string, number>();
  for (const r of loteRecords) {
    if (r.loteId) {
      costByLoteId.set(
        r.loteId,
        (costByLoteId.get(r.loteId) ?? 0) + Number(r.totalEarned),
      );
    }
  }

  const lotes = await prisma.lote.findMany({
    where: { id: { in: Array.from(costByLoteId.keys()) } },
    select: { id: true, name: true },
  });

  const loteNameMap = new Map(lotes.map((l) => [l.id, l.name]));
  const costPerLoteData: CostPerLoteData[] = Array.from(costByLoteId.entries())
    .map(([id, costo]) => ({
      lote: loteNameMap.get(id) ?? "Desconocido",
      costo: Math.round(costo * 100) / 100,
    }))
    .sort((a, b) => b.costo - a.costo);

  // -------------------------------------------------------------------------
  // Alerts
  // -------------------------------------------------------------------------

  // Rendimiento outliers
  const rendimientoOutliers = await prisma.coffeeIntake.findMany({
    where: {
      date: { gte: seasonStart, lte: seasonEnd },
      rendimiento: { not: null },
      OR: [
        { rendimiento: { lt: 4.0 } },
        { rendimiento: { gt: 7.0 } },
      ],
    },
    select: { code: true, date: true, rendimiento: true },
    orderBy: { date: "desc" },
    take: 10,
  });

  // Suspicious "Corte de Cafe" quantities > 5
  const suspiciousRecords = await prisma.activityRecord.findMany({
    where: {
      date: { gte: seasonStart, lte: seasonEnd },
      quantity: { gt: 5 },
      activity: { name: "Corte de Café" },
    },
    select: {
      date: true,
      quantity: true,
      worker: { select: { fullName: true } },
    },
    orderBy: { date: "desc" },
    take: 10,
  });

  type Alert = {
    type: "warning" | "critical";
    message: string;
  };

  const alerts: Alert[] = [];

  if (!currentPeriod) {
    alerts.push({
      type: "warning",
      message: "No hay periodo de pago abierto.",
    });
  }

  for (const o of rendimientoOutliers) {
    const rend = Number(o.rendimiento);
    const dateStr = o.date.toISOString().split("T")[0];
    alerts.push({
      type: rend < 4.0 ? "critical" : "warning",
      message: `Rendimiento atipico en ingreso ${o.code} (${dateStr}): ${rend.toFixed(2)}`,
    });
  }

  for (const s of suspiciousRecords) {
    const dateStr = s.date.toISOString().split("T")[0];
    alerts.push({
      type: "warning",
      message: `Cantidad alta en Corte de Cafe: ${Number(s.quantity)} qq por ${s.worker.fullName} (${dateStr})`,
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Vista ejecutiva &middot; Cosecha {year}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Active Workers */}
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-finca-500" />
            <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
              Trabajadores Activos
            </p>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-finca-900">
            {activeWorkers}
          </p>
        </div>

        {/* Period Payroll */}
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-finca-500" />
            <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
              Planilla Periodo Actual
            </p>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-finca-900">
            {currentPeriod ? fmtGTQ(periodTotal) : "—"}
          </p>
          {currentPeriod && (
            <p className="mt-0.5 text-xs text-finca-400">
              Semana {currentPeriod.periodNumber}
            </p>
          )}
        </div>

        {/* Accumulated Coffee */}
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Coffee className="h-4 w-4 text-finca-500" />
            <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
              Cafe Acumulado
            </p>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-finca-900">
            {fmtQQ(totalCoffeeQQ)}
          </p>
        </div>

        {/* Production vs Target */}
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-finca-500" />
            <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
              Produccion vs Meta
            </p>
          </div>
          <p
            className={`mt-2 text-2xl font-semibold tabular-nums ${
              productionPct >= 100
                ? "text-finca-700"
                : productionPct >= 70
                  ? "text-earth-600"
                  : "text-red-600"
            }`}
          >
            {latestByLote.size > 0 ? `${productionPct}%` : "—"}
          </p>
          <p className="mt-0.5 text-xs text-finca-400">
            Meta: {TARGET_QQ_ORO_PER_MZ} qq oro/mz
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Weekly Coffee Intake */}
        <div className="rounded-xl border border-finca-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-finca-900">
            Cafe Semanal
          </h2>
          <p className="mb-3 text-xs text-finca-400">
            Ingreso semanal de cafe (qq) &middot; Cosecha {year}
          </p>
          <WeeklyCoffeeChart data={weeklyCoffeeData} />
        </div>

        {/* Cost per Lote */}
        <div className="rounded-xl border border-finca-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-finca-900">
            Costo por Lote
          </h2>
          <p className="mb-3 text-xs text-finca-400">
            Costo de mano de obra por lote (GTQ) &middot; Cosecha {year}
          </p>
          <CostPerLoteChart data={costPerLoteData} />
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-finca-900">
            Alertas
          </h2>
          <div className="mt-3 space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                  alert.type === "critical"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {alert.type === "critical" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                )}
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when no alerts */}
      {alerts.length === 0 && (
        <div className="mt-8 rounded-xl border border-finca-200 bg-finca-50 px-6 py-6 text-center">
          <p className="text-sm text-finca-600">
            Sin alertas activas. Todo en orden.
          </p>
        </div>
      )}
    </div>
  );
}
