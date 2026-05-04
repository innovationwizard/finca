// =============================================================================
// src/app/(authenticated)/lotes/page.tsx — Lot operational overview
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import {
  getCurrentAgriculturalYear,
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
  formatAgriculturalYear,
} from "@/lib/utils/agricultural-year";
import Link from "next/link";
import {
  MapPin,
  TreePine,
  Sprout,
  Mountain,
  Scissors,
  AlertTriangle,
  ArrowRight,
  DollarSign,
  Coffee,
  TrendingUp,
} from "lucide-react";

export const metadata = { title: "Lotes" };

export default async function LotesPage() {
  await requireRole(...READ_ALL_ROLES);

  const currentYear = getCurrentAgriculturalYear();
  const yearStart = getAgriculturalYearStart(currentYear);
  const yearEnd = getAgriculturalYearEnd(currentYear);

  // Fetch pruning activity name dynamically so renaming it in the DB propagates here
  const [pruningActivity, lotes] = await Promise.all([
    prisma.activity.findFirst({ where: { sortOrder: 5 }, select: { name: true } }),
    prisma.lote.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      activityRecords: {
        where: {
          date: { gte: yearStart, lte: yearEnd },
        },
        select: { totalEarned: true },
      },
      coffeeIntakes: {
        where: {
          date: { gte: yearStart, lte: yearEnd },
        },
        select: { pesoNetoQq: true },
      },
      productionEstimates: {
        where: { agriculturalYear: currentYear },
        select: {
          qqOroPerManzana: true,
          estimateType: true,
          estimateDate: true,
        },
        orderBy: { estimateDate: "desc" },
        take: 1,
      },
    },
  }),
  ]);

  const pruningLabel = pruningActivity?.name ?? "Manejo de Tejido";

  // Also include inactive lotes
  const inactiveLotes = await prisma.lote.findMany({
    where: { isActive: false },
    orderBy: { sortOrder: "asc" },
    include: {
      activityRecords: {
        where: {
          date: { gte: yearStart, lte: yearEnd },
        },
        select: { totalEarned: true },
      },
      coffeeIntakes: {
        where: {
          date: { gte: yearStart, lte: yearEnd },
        },
        select: { pesoNetoQq: true },
      },
      productionEstimates: {
        where: { agriculturalYear: currentYear },
        select: {
          qqOroPerManzana: true,
          estimateType: true,
          estimateDate: true,
        },
        orderBy: { estimateDate: "desc" },
        take: 1,
      },
    },
  });

  const allLotes = [...lotes, ...inactiveLotes];

  // Compute KPIs
  const lotesWithKpis = allLotes.map((lote) => {
    const totalLaborCost = lote.activityRecords.reduce(
      (sum, r) => sum + Number(r.totalEarned),
      0
    );
    const totalCoffeeQq = lote.coffeeIntakes.reduce(
      (sum, i) => sum + Number(i.pesoNetoQq),
      0
    );
    const latestEstimate = lote.productionEstimates[0];
    const qqOroPerManzana = latestEstimate?.qqOroPerManzana
      ? Number(latestEstimate.qqOroPerManzana)
      : null;

    const hasMissingData =
      lote.areaManzanas === null || lote.plantCount === null;

    return {
      id: lote.id,
      name: lote.name,
      slug: lote.slug,
      areaManzanas: lote.areaManzanas ? Number(lote.areaManzanas) : null,
      podaPercent: lote.podaPercent ? Number(lote.podaPercent) : null,
      plantCount: lote.plantCount,
      density: lote.density,
      variety: lote.variety,
      altitudeMasl: lote.altitudeMasl,
      isActive: lote.isActive,
      hasMissingData,
      totalLaborCost,
      totalCoffeeQq,
      qqOroPerManzana,
      estimateType: latestEstimate?.estimateType ?? null,
    };
  });

  const totalLotes = allLotes.length;
  const activeLotes = allLotes.filter((l) => l.isActive).length;

  // Summary totals (active lotes only)
  const activeKpis = lotesWithKpis.filter((l) => l.isActive);
  const totalAreaMz = activeKpis.reduce((s, l) => s + (l.areaManzanas ?? 0), 0);
  const totalPlants = activeKpis.reduce((s, l) => s + (l.plantCount ?? 0), 0);
  const totalPodaMz = activeKpis.reduce(
    (s, l) => s + (l.areaManzanas !== null && l.podaPercent !== null ? l.areaManzanas * l.podaPercent / 100 : 0),
    0,
  );
  const avgPodaPct = totalAreaMz > 0 ? (totalPodaMz / totalAreaMz) * 100 : 0;
  const totalLaborCost = activeKpis.reduce((s, l) => s + l.totalLaborCost, 0);
  const totalCoffeeQq = activeKpis.reduce((s, l) => s + l.totalCoffeeQq, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Lotes
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Vista operativa por lote · Año agrícola{" "}
          {formatAgriculturalYear(currentYear)} · {activeLotes} activos de{" "}
          {totalLotes} total
        </p>
      </div>

      {/* Summary card */}
      {activeKpis.length > 0 && (
        <div className="mb-8 rounded-xl border border-earth-200 bg-earth-50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-earth-700">Totales Finca</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="flex items-center gap-1 text-xs text-earth-500">
                <MapPin className="h-3 w-3" /> Área total
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-earth-900">
                {totalAreaMz.toLocaleString("es-GT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} mz
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-earth-500">
                <TreePine className="h-3 w-3" /> Plantas
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-earth-900">
                {totalPlants.toLocaleString("es-GT")}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-earth-500">
                <Scissors className="h-3 w-3" /> {pruningLabel}
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-earth-900">
                {avgPodaPct.toLocaleString("es-GT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%
                <span className="ml-1 text-sm font-normal text-earth-500">
                  · {totalPodaMz.toLocaleString("es-GT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mz
                </span>
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-earth-500">
                <DollarSign className="h-3 w-3" /> Costo Laboral
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-earth-900">
                Q{totalLaborCost.toLocaleString("es-GT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-earth-500">
                <Coffee className="h-3 w-3" /> Café total
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-earth-900">
                {totalCoffeeQq.toLocaleString("es-GT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} qq
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-earth-500">
                <TrendingUp className="h-3 w-3" /> Lotes activos
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-earth-900">
                {activeLotes}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Grid of lot cards */}
      {lotesWithKpis.length === 0 ? (
        <div className="rounded-lg border border-finca-200 bg-finca-50 p-8 text-center">
          <MapPin className="mx-auto h-10 w-10 text-finca-300" />
          <p className="mt-3 text-sm text-finca-500">
            No hay lotes registrados. Agrega lotes desde Administración.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {lotesWithKpis.map((lote) => (
            <Link
              key={lote.id}
              href={`/lotes/${lote.slug}` as never}
              className="group relative flex flex-col rounded-xl border border-finca-200 bg-white p-5 shadow-sm transition-all hover:border-finca-400 hover:shadow-md"
            >
              {/* Card header */}
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-finca-900 group-hover:text-finca-700">
                    {lote.name}
                  </h2>
                  {lote.variety && (
                    <p className="mt-0.5 text-xs text-finca-500">
                      {lote.variety}
                    </p>
                  )}
                </div>
                <div className="ml-2 flex flex-col items-end gap-1">
                  {lote.isActive ? (
                    <span className="inline-flex items-center rounded-full bg-finca-100 px-2 py-0.5 text-xs font-medium text-finca-700">
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                      Inactivo
                    </span>
                  )}
                  {lote.hasMissingData && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      Datos pendientes
                    </span>
                  )}
                </div>
              </div>

              {/* Lot attributes */}
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex items-center gap-1.5 text-finca-600">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-finca-400" />
                  <span>
                    {lote.areaManzanas !== null
                      ? `${lote.areaManzanas} mz`
                      : "— mz"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-finca-600">
                  <TreePine className="h-3.5 w-3.5 flex-shrink-0 text-finca-400" />
                  <span>
                    {lote.plantCount !== null
                      ? `${lote.plantCount.toLocaleString("es-GT")} plantas`
                      : "— plantas"}
                  </span>
                </div>
                {lote.podaPercent !== null && (
                  <div className="flex items-center gap-1.5 text-finca-600">
                    <Scissors className="h-3.5 w-3.5 flex-shrink-0 text-finca-400" />
                    <span>
                      {pruningLabel} {lote.podaPercent}%
                      {lote.areaManzanas !== null && (
                        <span className="text-finca-400">
                          {" "}· {(lote.areaManzanas * lote.podaPercent / 100).toLocaleString("es-GT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mz
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {lote.density && (
                  <div className="flex items-center gap-1.5 text-finca-600">
                    <Sprout className="h-3.5 w-3.5 flex-shrink-0 text-finca-400" />
                    <span>{lote.density}</span>
                  </div>
                )}
                {lote.altitudeMasl && (
                  <div className="flex items-center gap-1.5 text-finca-600">
                    <Mountain className="h-3.5 w-3.5 flex-shrink-0 text-finca-400" />
                    <span>{lote.altitudeMasl} msnm</span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="my-4 border-t border-finca-100" />

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                {/* Labor cost */}
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-earth-500" />
                    <span className="text-xs text-finca-500">
                      Costo Laboral
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-finca-900">
                    {lote.totalLaborCost > 0
                      ? `Q${lote.totalLaborCost.toLocaleString("es-GT", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}`
                      : "—"}
                  </p>
                </div>

                {/* Coffee received */}
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Coffee className="h-3.5 w-3.5 text-earth-600" />
                    <span className="text-xs text-finca-500">Café qq</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-finca-900">
                    {lote.totalCoffeeQq > 0
                      ? lote.totalCoffeeQq.toLocaleString("es-GT", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })
                      : "—"}
                  </p>
                </div>

                {/* Production estimate */}
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 text-finca-500" />
                    <span className="text-xs text-finca-500">qq oro/mz</span>
                  </div>
                  <p
                    className={`mt-1 text-sm font-semibold ${
                      lote.qqOroPerManzana === null
                        ? "text-finca-300"
                        : lote.qqOroPerManzana >= 25
                          ? "text-green-600"
                          : lote.qqOroPerManzana >= 15
                            ? "text-amber-600"
                            : "text-red-600"
                    }`}
                  >
                    {lote.qqOroPerManzana !== null
                      ? lote.qqOroPerManzana.toLocaleString("es-GT", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Card footer */}
              <div className="mt-4 flex items-center justify-end text-xs text-finca-400 group-hover:text-finca-600">
                <span>Ver detalle</span>
                <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
