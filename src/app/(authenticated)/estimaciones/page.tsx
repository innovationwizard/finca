// =============================================================================
// src/app/(authenticated)/estimaciones/page.tsx — Multi-year production estimates
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES, WRITE_ROLES } from "@/lib/auth/guards";
import { EstimatesTable } from "./estimates-table";
import { AGRICULTURAL_YEARS } from "@/lib/validators/estimate";

export const metadata = { title: "Estimaciones de Producción" };

export default async function EstimacionesPage() {
  const user = await requireRole(...READ_ALL_ROLES);

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

  // Fetch estimates for all 5 years
  const estimates = await prisma.productionEstimate.findMany({
    where: {
      agriculturalYear: { in: [...AGRICULTURAL_YEARS] },
    },
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
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Estimaciones de Producción
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Estimaciones por lote y año agrícola · lb/planta → qq maduro/lote → qq oro/mz
        </p>
      </div>

      {/* Interactive table */}
      <EstimatesTable
        lotes={serializedLotes}
        estimates={serializedEstimates}
        canWrite={canWrite}
      />
    </div>
  );
}
