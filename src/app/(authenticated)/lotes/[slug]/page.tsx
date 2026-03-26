// =============================================================================
// src/app/(authenticated)/lotes/[slug]/page.tsx — Lot detail page
// =============================================================================

import { notFound } from "next/navigation";
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
  ArrowLeft,
  MapPin,
  TreePine,
  Sprout,
  Mountain,
  Grape,
  DollarSign,
  Coffee,
  TrendingUp,
} from "lucide-react";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const lote = await prisma.lote.findUnique({
    where: { slug },
    select: { name: true },
  });
  return { title: lote ? `Lote ${lote.name}` : "Lote" };
}

export default async function LoteDetailPage({ params }: PageProps) {
  await requireRole(...READ_ALL_ROLES);
  const { slug } = await params;

  const currentYear = getCurrentAgriculturalYear();
  const yearStart = getAgriculturalYearStart(currentYear);
  const yearEnd = getAgriculturalYearEnd(currentYear);

  const lote = await prisma.lote.findUnique({
    where: { slug },
  });

  if (!lote) {
    notFound();
  }

  // Fetch KPI aggregates
  const [laborAgg, coffeeAgg] = await Promise.all([
    prisma.activityRecord.aggregate({
      where: {
        loteId: lote.id,
        date: { gte: yearStart, lte: yearEnd },
      },
      _sum: { totalEarned: true },
    }),
    prisma.coffeeIntake.aggregate({
      where: {
        loteId: lote.id,
        date: { gte: yearStart, lte: yearEnd },
      },
      _sum: { pesoNetoQq: true },
    }),
  ]);

  const latestEstimate = await prisma.productionEstimate.findFirst({
    where: {
      loteId: lote.id,
      agriculturalYear: currentYear,
    },
    orderBy: { estimateDate: "desc" },
    select: {
      qqOroPerManzana: true,
      estimateType: true,
    },
  });

  // Fetch recent activity records
  const activityRecords = await prisma.activityRecord.findMany({
    where: {
      loteId: lote.id,
      date: { gte: yearStart, lte: yearEnd },
    },
    orderBy: { date: "desc" },
    take: 20,
    select: {
      id: true,
      date: true,
      quantity: true,
      totalEarned: true,
      worker: { select: { fullName: true } },
      activity: { select: { name: true } },
    },
  });

  // Fetch recent coffee intakes
  const coffeeIntakes = await prisma.coffeeIntake.findMany({
    where: {
      loteId: lote.id,
      date: { gte: yearStart, lte: yearEnd },
    },
    orderBy: { date: "desc" },
    take: 10,
    select: {
      id: true,
      date: true,
      code: true,
      coffeeType: true,
      pesoNetoQq: true,
      status: true,
    },
  });

  const totalLaborCost = laborAgg._sum.totalEarned
    ? Number(laborAgg._sum.totalEarned)
    : 0;
  const totalCoffeeQq = coffeeAgg._sum.pesoNetoQq
    ? Number(coffeeAgg._sum.pesoNetoQq)
    : 0;
  const qqOroPerManzana = latestEstimate?.qqOroPerManzana
    ? Number(latestEstimate.qqOroPerManzana)
    : null;
  const areaMz = lote.areaManzanas ? Number(lote.areaManzanas) : null;

  const coffeeTypeLabels: Record<string, string> = {
    CEREZA: "Cereza",
    PERGAMINO: "Pergamino",
    ORO: "Oro",
  };

  const statusLabels: Record<string, string> = {
    RECIBIDO: "Recibido",
    DESPULPADO: "Despulpado",
    SECANDO: "Secando",
    PERGAMINO: "Pergamino",
    ENVASADO: "Envasado",
    DESPACHADO: "Despachado",
  };

  const statusColors: Record<string, string> = {
    RECIBIDO: "bg-blue-50 text-blue-700",
    DESPULPADO: "bg-purple-50 text-purple-700",
    SECANDO: "bg-amber-50 text-amber-700",
    PERGAMINO: "bg-earth-50 text-earth-700",
    ENVASADO: "bg-finca-50 text-finca-700",
    DESPACHADO: "bg-green-50 text-green-700",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        href={"/lotes" as never}
        className="mb-6 inline-flex items-center gap-1 text-sm text-finca-500 hover:text-finca-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Lotes
      </Link>

      {/* Lot info header */}
      <div className="rounded-xl border border-finca-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
              {lote.name}
            </h1>
            <p className="mt-1 text-sm text-finca-500">
              Año agrícola {formatAgriculturalYear(currentYear)}
            </p>
          </div>
          <div>
            {lote.isActive ? (
              <span className="inline-flex items-center rounded-full bg-finca-100 px-3 py-1 text-xs font-medium text-finca-700">
                Activo
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                Inactivo
              </span>
            )}
          </div>
        </div>

        {/* Lot attributes */}
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <div className="flex items-center gap-1.5 text-finca-600">
            <MapPin className="h-4 w-4 text-finca-400" />
            <span className="font-medium">Área:</span>
            <span>{areaMz !== null ? `${areaMz} mz` : "Sin registrar"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-finca-600">
            <TreePine className="h-4 w-4 text-finca-400" />
            <span className="font-medium">Plantas:</span>
            <span>
              {lote.plantCount !== null
                ? lote.plantCount.toLocaleString("es-GT")
                : "Sin registrar"}
            </span>
          </div>
          {lote.density && (
            <div className="flex items-center gap-1.5 text-finca-600">
              <Sprout className="h-4 w-4 text-finca-400" />
              <span className="font-medium">Densidad:</span>
              <span>{lote.density}</span>
            </div>
          )}
          {lote.variety && (
            <div className="flex items-center gap-1.5 text-finca-600">
              <Grape className="h-4 w-4 text-finca-400" />
              <span className="font-medium">Variedad:</span>
              <span>{lote.variety}</span>
            </div>
          )}
          {lote.altitudeMasl && (
            <div className="flex items-center gap-1.5 text-finca-600">
              <Mountain className="h-4 w-4 text-finca-400" />
              <span className="font-medium">Altitud:</span>
              <span>{lote.altitudeMasl} msnm</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Labor cost */}
        <div className="rounded-xl border border-finca-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-earth-50">
              <DollarSign className="h-5 w-5 text-earth-600" />
            </div>
            <span className="text-sm font-medium text-finca-600">
              Costo Laboral
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-finca-900">
            {totalLaborCost > 0
              ? `Q${totalLaborCost.toLocaleString("es-GT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "Q0.00"}
          </p>
          <p className="mt-1 text-xs text-finca-400">
            GTQ esta temporada
          </p>
        </div>

        {/* Coffee received */}
        <div className="rounded-xl border border-finca-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-earth-50">
              <Coffee className="h-5 w-5 text-earth-600" />
            </div>
            <span className="text-sm font-medium text-finca-600">
              Café Recibido
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-finca-900">
            {totalCoffeeQq > 0
              ? totalCoffeeQq.toLocaleString("es-GT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "0.00"}
          </p>
          <p className="mt-1 text-xs text-finca-400">
            qq esta temporada
          </p>
        </div>

        {/* Production estimate */}
        <div className="rounded-xl border border-finca-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-finca-50">
              <TrendingUp className="h-5 w-5 text-finca-600" />
            </div>
            <span className="text-sm font-medium text-finca-600">
              Estimación Producción
            </span>
          </div>
          <p
            className={`mt-3 text-2xl font-bold ${
              qqOroPerManzana === null
                ? "text-finca-300"
                : qqOroPerManzana >= 25
                  ? "text-green-600"
                  : qqOroPerManzana >= 15
                    ? "text-amber-600"
                    : "text-red-600"
            }`}
          >
            {qqOroPerManzana !== null
              ? qqOroPerManzana.toLocaleString("es-GT", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })
              : "Sin estimación"}
          </p>
          <p className="mt-1 text-xs text-finca-400">
            {latestEstimate
              ? `qq oro/mz · ${latestEstimate.estimateType}`
              : "qq oro/mz"}
          </p>
        </div>
      </div>

      {/* Recent Activity Records */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-finca-900">
          Actividades Recientes
        </h2>
        <p className="mt-1 text-sm text-finca-500">
          Últimos 20 registros de esta temporada
        </p>

        {activityRecords.length === 0 ? (
          <div className="mt-4 rounded-lg border border-finca-100 bg-finca-50 p-6 text-center text-sm text-finca-400">
            No hay registros de actividad para este lote en la temporada actual.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-finca-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-finca-100 bg-finca-50">
                  <th className="px-4 py-3 text-left font-medium text-finca-600">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-finca-600">
                    Trabajador
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-finca-600">
                    Actividad
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    Cantidad
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-finca-100 bg-white">
                {activityRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-finca-50/50">
                    <td className="whitespace-nowrap px-4 py-3 text-finca-700">
                      {record.date.toISOString().split("T")[0]}
                    </td>
                    <td className="px-4 py-3 text-finca-700">
                      {record.worker.fullName}
                    </td>
                    <td className="px-4 py-3 text-finca-700">
                      {record.activity.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-finca-700">
                      {Number(record.quantity).toLocaleString("es-GT", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-finca-900">
                      Q{Number(record.totalEarned).toLocaleString("es-GT", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Coffee Intakes */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-finca-900">
          Ingresos de Café Recientes
        </h2>
        <p className="mt-1 text-sm text-finca-500">
          Últimos 10 ingresos de esta temporada
        </p>

        {coffeeIntakes.length === 0 ? (
          <div className="mt-4 rounded-lg border border-finca-100 bg-finca-50 p-6 text-center text-sm text-finca-400">
            No hay ingresos de café para este lote en la temporada actual.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-finca-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-finca-100 bg-finca-50">
                  <th className="px-4 py-3 text-left font-medium text-finca-600">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-finca-600">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-finca-600">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    Peso QQ
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-finca-600">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-finca-100 bg-white">
                {coffeeIntakes.map((intake) => (
                  <tr key={intake.id} className="hover:bg-finca-50/50">
                    <td className="whitespace-nowrap px-4 py-3 text-finca-700">
                      {intake.date.toISOString().split("T")[0]}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-finca-700">
                      {intake.code}
                    </td>
                    <td className="px-4 py-3 text-finca-700">
                      {coffeeTypeLabels[intake.coffeeType] ?? intake.coffeeType}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-finca-700">
                      {Number(intake.pesoNetoQq).toLocaleString("es-GT", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusColors[intake.status] ??
                          "bg-gray-50 text-gray-600"
                        }`}
                      >
                        {statusLabels[intake.status] ?? intake.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
