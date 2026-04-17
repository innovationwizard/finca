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

  const acumuladoVerde = intakes.reduce(
    (sum, i) => sum + (i.pesoVerdeQq ? Number(i.pesoVerdeQq) : 0),
    0,
  );

  const totalCosecha = acumuladoCereza + acumuladoVerde;

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
    pesoVerdeQq: i.pesoVerdeQq ? Number(i.pesoVerdeQq) : null,
    pesoPergaminoQq: i.pesoPergaminoQq ? Number(i.pesoPergaminoQq) : null,
    rendimiento: i.rendimiento ? Number(i.rendimiento) : null,
    status: i.status,
    lote: i.lote,
  }));

  // Resumen por Lote — aggregate by lote
  const loteAgg = new Map<
    string,
    { name: string; totalQq: number; verdeQq: number; days: Set<string> }
  >();
  for (const i of intakes) {
    if (i.coffeeType !== "CEREZA" || !i.loteId) continue;
    const key = i.loteId;
    const existing = loteAgg.get(key) ?? {
      name: i.lote?.name ?? "—",
      totalQq: 0,
      verdeQq: 0,
      days: new Set<string>(),
    };
    existing.totalQq += Number(i.pesoNetoQq);
    existing.verdeQq += i.pesoVerdeQq ? Number(i.pesoVerdeQq) : 0;
    existing.days.add(i.date.toISOString().split("T")[0]);
    loteAgg.set(key, existing);
  }
  const loteResumen = [...loteAgg.values()]
    .map((l) => ({
      ...l,
      diasCorte: l.days.size,
      pct: acumuladoCereza > 0 ? (l.totalQq / acumuladoCereza) * 100 : 0,
    }))
    .sort((a, b) => b.totalQq - a.totalQq);

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
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Maduro (qq)
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {acumuladoCereza.toLocaleString("es-GT", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Verde (qq)
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-finca-900">
            {acumuladoVerde.toLocaleString("es-GT", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Total Cosecha (qq)
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-earth-700">
            {totalCosecha.toLocaleString("es-GT", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="rounded-xl border border-finca-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-finca-400">
            Pergamino (qq)
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

      {/* Resumen por Lote */}
      {loteResumen.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold text-finca-900">
            Cosecha por Lote
          </h2>
          <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-finca-100 bg-finca-50/50">
                  <th className="px-4 py-3 font-medium text-finca-600">Lote</th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    Cereza (qq)
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    %
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    Verde (qq)
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-finca-600">
                    Días de Corte
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-finca-50">
                {loteResumen.map((l) => (
                  <tr key={l.name} className="hover:bg-finca-50/30">
                    <td className="px-4 py-2.5 font-medium text-finca-900">
                      {l.name}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                      {l.totalQq.toLocaleString("es-GT", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-finca-500">
                      {l.pct.toLocaleString("es-GT", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      %
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-finca-500">
                      {l.verdeQq > 0
                        ? l.verdeQq.toLocaleString("es-GT", {
                            minimumFractionDigits: 2,
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                      {l.diasCorte}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-finca-200 bg-finca-50/30">
                  <td className="px-4 py-3 font-semibold text-finca-900">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-900">
                    {acumuladoCereza.toLocaleString("es-GT", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-900">
                    100%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-900">
                    {acumuladoVerde > 0
                      ? acumuladoVerde.toLocaleString("es-GT", {
                          minimumFractionDigits: 2,
                        })
                      : "—"}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
