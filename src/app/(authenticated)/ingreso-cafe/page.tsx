// =============================================================================
// src/app/(authenticated)/ingreso-cafe/page.tsx — Coffee intake list
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import {
  getCurrentAgriculturalYear,
  getAgriculturalYearStart,
  getAgriculturalYearEnd,
  formatAgriculturalYear,
} from "@/lib/utils/agricultural-year";
import { IntakeList } from "./intake-list";
import Link from "next/link";

export const metadata = { title: "Ingreso de Café" };

export default async function IngresoCafePage() {
  const user = await requireRole(...READ_ALL_ROLES);

  const year = getCurrentAgriculturalYear();
  const yearStart = getAgriculturalYearStart(year);
  const yearEnd = getAgriculturalYearEnd(year);

  // Fetch intakes for current agricultural year
  const intakes = await prisma.coffeeIntake.findMany({
    where: {
      date: { gte: yearStart, lte: yearEnd },
    },
    include: {
      lote: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  // KPIs — season accumulators
  const acumuladoCereza = intakes
    .filter((i) => i.coffeeType === "CEREZA")
    .reduce((sum, i) => sum + Number(i.pesoNetoQq), 0);

  const acumuladoPergamino = intakes.reduce(
    (sum, i) => sum + (i.pesoPergaminoQq ? Number(i.pesoPergaminoQq) : 0),
    0,
  );

  const totalIngresos = intakes.length;

  // Serialize for client
  const serialized = intakes.map((i) => ({
    id: i.id,
    code: i.code,
    date: i.date.toISOString().split("T")[0],
    coffeeType: i.coffeeType,
    source: i.source,
    loteId: i.loteId,
    supplierName: i.supplierName,
    procedencia: i.procedencia,
    bultos: i.bultos,
    pesoNetoQq: Number(i.pesoNetoQq),
    pesoPergaminoQq: i.pesoPergaminoQq ? Number(i.pesoPergaminoQq) : null,
    rendimiento: i.rendimiento ? Number(i.rendimiento) : null,
    status: i.status,
    lote: i.lote,
  }));

  const canWrite =
    user.role === "MASTER" || user.role === "ADMIN" || user.role === "FIELD";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
            Ingreso de Café
          </h1>
          <p className="mt-1 text-sm text-finca-500">
            Año agrícola {formatAgriculturalYear(year)}
          </p>
        </div>
        {canWrite && (
          <Link
            href={"/ingreso-cafe/nuevo" as never}
            className="inline-flex items-center justify-center rounded-lg bg-finca-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 touch-target"
          >
            + Nuevo Ingreso
          </Link>
        )}
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Acumulado Maduro (qq)
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {acumuladoCereza.toLocaleString("es-GT", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Acumulado Pergamino (qq)
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {acumuladoPergamino.toLocaleString("es-GT", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="hidden rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm sm:block">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            # Ingresos
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {totalIngresos}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="mt-6">
        {intakes.length > 0 ? (
          <IntakeList records={serialized} />
        ) : (
          <div className="rounded-xl border border-finca-200 bg-white px-6 py-12 text-center">
            <p className="text-sm text-finca-500">
              No hay ingresos de café registrados en este año agrícola.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
