// =============================================================================
// src/app/(authenticated)/estimaciones/[year]/page.tsx — Single year detail
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES, WRITE_ROLES } from "@/lib/auth/guards";
import { notFound } from "next/navigation";
import { AGRICULTURAL_YEARS } from "@/lib/validators/estimate";
import { formatAgriculturalYear } from "@/lib/utils/agricultural-year";
import { EstimatesTable } from "../estimates-table";
import Link from "next/link";

type PageProps = {
  params: Promise<{ year: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { year } = await params;
  return {
    title: `Estimaciones ${formatAgriculturalYear(year)}`,
  };
}

export default async function EstimacionesYearPage({ params }: PageProps) {
  const { year } = await params;
  const user = await requireRole(...READ_ALL_ROLES);

  // Validate year format
  if (!/^\d{4}$/.test(year)) {
    notFound();
  }

  // Fetch all active lotes
  const lotes = await prisma.lote.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      areaManzanas: true,
      plantCount: true,
      isActive: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  // Fetch estimates for this specific year
  const estimates = await prisma.productionEstimate.findMany({
    where: { agriculturalYear: year },
    orderBy: [{ lote: { sortOrder: "asc" } }, { estimateType: "asc" }],
  });

  const serializedLotes = lotes.map((l) => ({
    id: l.id,
    name: l.name,
    areaManzanas: l.areaManzanas ? Number(l.areaManzanas) : null,
    plantCount: l.plantCount,
    isActive: l.isActive,
    sortOrder: l.sortOrder,
  }));

  const serializedEstimates = estimates.map((e) => ({
    id: e.id,
    agriculturalYear: e.agriculturalYear,
    loteId: e.loteId,
    estimateType: e.estimateType,
    estimateDate: e.estimateDate.toISOString().split("T")[0],
    lbPerPlant: Number(e.lbPerPlant),
    qqMaduroPerLote: e.qqMaduroPerLote ? Number(e.qqMaduroPerLote) : null,
    qqOroPerManzana: e.qqOroPerManzana ? Number(e.qqOroPerManzana) : null,
    qqOroPerLote: e.qqOroPerLote ? Number(e.qqOroPerLote) : null,
    notes: e.notes,
  }));

  const canWrite = WRITE_ROLES.includes(user.role);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={"/estimaciones" as never}
          className="mb-4 inline-block text-sm text-finca-500 hover:text-finca-700"
        >
          ← Todas las estimaciones
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Estimaciones {formatAgriculturalYear(year)}
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Detalle de estimaciones por lote para el año agrícola {formatAgriculturalYear(year)}
        </p>
      </div>

      {/* Reuse the same interactive table — it will default to this year */}
      <EstimatesTable
        lotes={serializedLotes}
        estimates={serializedEstimates}
        canWrite={canWrite}
      />

      {/* Navigation to other years */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-finca-600">Otros años agrícolas</h2>
        <div className="flex flex-wrap gap-2">
          {AGRICULTURAL_YEARS.filter((y) => y !== year).map((y) => (
            <Link
              key={y}
              href={`/estimaciones/${y}` as never}
              className="rounded-lg border border-finca-200 bg-white px-4 py-2 text-sm font-medium text-finca-700 transition-colors hover:bg-finca-50"
            >
              {formatAgriculturalYear(y)}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
