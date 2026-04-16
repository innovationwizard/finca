// =============================================================================
// src/app/(authenticated)/resumenes/page.tsx — Resúmenes (read-only)
// Server component: fetches pay periods, delegates to client for selection.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear, formatAgriculturalYear } from "@/lib/utils/agricultural-year";
import { ResumenesClient } from "./resumenes-client";

export const metadata = { title: "Resúmenes" };

export default async function ResumenesPage() {
  await requireRole(...READ_ALL_ROLES);

  const agYear = getCurrentAgriculturalYear();

  const periods = await prisma.payPeriod.findMany({
    where: { agriculturalYear: agYear },
    orderBy: { periodNumber: "asc" },
  });

  if (periods.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-finca-900">Resúmenes</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
          <p className="text-sm text-amber-800">
            No hay períodos de pago para el año agrícola {formatAgriculturalYear(agYear)}.
          </p>
        </div>
      </div>
    );
  }

  const serialized = periods.map((p) => ({
    id: p.id,
    periodNumber: p.periodNumber,
    startDate: p.startDate.toISOString().split("T")[0],
    endDate: p.endDate.toISOString().split("T")[0],
    isClosed: p.isClosed,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Resúmenes
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Año agrícola {formatAgriculturalYear(agYear)}
        </p>
      </div>

      <ResumenesClient periods={serialized} />
    </div>
  );
}
