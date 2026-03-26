// =============================================================================
// src/app/(authenticated)/planilla/resumen/page.tsx — Payroll summary
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";
import { formatGTQ } from "@/lib/utils/format";

export const metadata = { title: "Resumen de Pago" };

export default async function ResumenPage() {
  await requireRole(...READ_ALL_ROLES);

  const year = getCurrentAgriculturalYear();

  const currentPeriod = await prisma.payPeriod.findFirst({
    where: { agriculturalYear: year, isClosed: false },
    orderBy: { periodNumber: "desc" },
  });

  if (!currentPeriod) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-finca-900">Resumen de Pago</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
          <p className="text-sm text-amber-800">
            No hay un período de pago abierto.
          </p>
        </div>
      </div>
    );
  }

  // Aggregate by worker
  const summary = await prisma.activityRecord.groupBy({
    by: ["workerId"],
    where: { payPeriodId: currentPeriod.id },
    _sum: { totalEarned: true },
    _count: { id: true },
  });

  // Get worker names
  const workerIds = summary.map((s) => s.workerId);
  const workers = await prisma.worker.findMany({
    where: { id: { in: workerIds } },
    select: { id: true, fullName: true },
  });

  const workerMap = new Map(workers.map((w) => [w.id, w.fullName]));

  const rows = summary
    .map((s) => ({
      workerId: s.workerId,
      workerName: workerMap.get(s.workerId) ?? "Desconocido",
      totalEarned: Number(s._sum.totalEarned ?? 0),
      recordCount: s._count.id,
    }))
    .sort((a, b) => b.totalEarned - a.totalEarned);

  const grandTotal = rows.reduce((s, r) => s + r.totalEarned, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Resumen de Pago
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Semana {currentPeriod.periodNumber} · Año {year} ·{" "}
          {currentPeriod.startDate.toLocaleDateString("es-GT")} —{" "}
          {currentPeriod.endDate.toLocaleDateString("es-GT")}
        </p>
      </div>

      {/* Grand total */}
      <div className="mb-6 rounded-xl border border-earth-200 bg-earth-50 px-6 py-4">
        <p className="text-sm font-medium text-earth-600">Total del período</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-earth-900">
          {formatGTQ(grandTotal)}
        </p>
        <p className="mt-1 text-xs text-earth-500">
          {rows.length} trabajadores · {rows.reduce((s, r) => s + r.recordCount, 0)}{" "}
          registros
        </p>
      </div>

      {/* Per-worker table */}
      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-finca-100 bg-finca-50/50">
              <th className="px-4 py-3 font-medium text-finca-600">Trabajador</th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Registros
              </th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Total Devengado
              </th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Bonificación
              </th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                Anticipos
              </th>
              <th className="px-4 py-3 font-medium text-finca-600 text-right">
                A Pagar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-50">
            {rows.map((r) => (
              <tr key={r.workerId} className="hover:bg-finca-50/30">
                <td className="px-4 py-2.5 font-medium text-finca-900">
                  {r.workerName}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-500">
                  {r.recordCount}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                  {formatGTQ(r.totalEarned)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-400">
                  Q0.00
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-400">
                  Q0.00
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-finca-900">
                  {formatGTQ(r.totalEarned)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-finca-200 bg-finca-50/30">
              <td className="px-4 py-3 font-semibold text-finca-900">Total</td>
              <td className="px-4 py-3 text-right tabular-nums text-finca-500">
                {rows.reduce((s, r) => s + r.recordCount, 0)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-900">
                {formatGTQ(grandTotal)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-finca-400">
                Q0.00
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-finca-400">
                Q0.00
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-finca-900">
                {formatGTQ(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-4 text-xs text-finca-400">
        Bonificaciones y anticipos se editan en la vista de detalle del período. Los
        montos mostrados son del período actual abierto.
      </p>
    </div>
  );
}
