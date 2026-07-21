// =============================================================================
// src/app/(authenticated)/planilla/resumen/page.tsx — Payroll summary
// Per-worker net pay for the OPEN period, read from PayrollEntry (the same rows
// that feed the bank file) — never re-derived from ActivityRecord. Every term of
//   totalToPay = devengado + séptimo + bonificación − anticipos − descuentos
// gets its own column so the figure is auditable on screen.
// PayrollEntry is the base of the query, not ActivityRecord: a worker may have a
// pure-adjustment entry (a descuento with no activity at all) and must still
// appear — that case is exactly how a negative net pay arises.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { getCurrentPayPeriod } from "@/lib/payroll/current-period";
import { formatGTQ } from "@/lib/utils/format";
import Link from "next/link";

export const metadata = { title: "Resumen de Pago" };

export default async function ResumenPage() {
  await requireRole(...READ_ALL_ROLES);

  const currentPeriod = await getCurrentPayPeriod();

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

  // The payroll rows themselves — what will actually be paid.
  const entries = await prisma.payrollEntry.findMany({
    where: { payPeriodId: currentPeriod.id },
    select: {
      workerId: true,
      totalEarned: true,
      seventhDayPay: true,
      bonification: true,
      advances: true,
      deductions: true,
      totalToPay: true,
      worker: { select: { fullName: true } },
    },
  });

  // Record counts are context only (how much capture backs the figure).
  const counts = await prisma.activityRecord.groupBy({
    by: ["workerId"],
    where: { payPeriodId: currentPeriod.id },
    _count: { id: true },
  });
  const countByWorker = new Map(counts.map((c) => [c.workerId, c._count.id]));

  // One row per worker. The (period, worker, category) unique key allows a
  // worker to hold more than one entry, so sum across them rather than assuming.
  type Row = {
    workerId: string;
    workerName: string;
    recordCount: number;
    totalEarned: number;
    seventhDayPay: number;
    bonification: number;
    advances: number;
    deductions: number;
    totalToPay: number;
  };
  const byWorker = new Map<string, Row>();
  for (const e of entries) {
    const row = byWorker.get(e.workerId) ?? {
      workerId: e.workerId,
      workerName: e.worker.fullName,
      recordCount: countByWorker.get(e.workerId) ?? 0,
      totalEarned: 0,
      seventhDayPay: 0,
      bonification: 0,
      advances: 0,
      deductions: 0,
      totalToPay: 0,
    };
    row.totalEarned += Number(e.totalEarned);
    row.seventhDayPay += Number(e.seventhDayPay);
    row.bonification += Number(e.bonification);
    row.advances += Number(e.advances);
    row.deductions += Number(e.deductions);
    row.totalToPay += Number(e.totalToPay);
    byWorker.set(e.workerId, row);
  }
  const rows = [...byWorker.values()].sort((a, b) => b.totalEarned - a.totalEarned);

  const sum = (pick: (r: Row) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const totals = {
    recordCount: sum((r) => r.recordCount),
    totalEarned: sum((r) => r.totalEarned),
    seventhDayPay: sum((r) => r.seventhDayPay),
    bonification: sum((r) => r.bonification),
    advances: sum((r) => r.advances),
    deductions: sum((r) => r.deductions),
    totalToPay: sum((r) => r.totalToPay),
  };

  // A negative net pay is never payable — surfaced here so it is caught before
  // the bank file, not after.
  const negativos = rows.filter((r) => r.totalToPay < 0);

  const num = (n: number, muted = false) =>
    n === 0 ? <span className="text-finca-300">—</span> : <span className={muted ? "text-finca-500" : undefined}>{formatGTQ(n)}</span>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Resumen de Pago
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          {/* The period's OWN year — it may differ from today's at the
              Feb/Mar boundary, since the year comes from the start date. */}
          Semana {currentPeriod.periodNumber} · Año {currentPeriod.agriculturalYear} ·{" "}
          {currentPeriod.startDate.toLocaleDateString("es-GT")} —{" "}
          {currentPeriod.endDate.toLocaleDateString("es-GT")}
        </p>
      </div>

      {/* Grand total — the NET figure, which is what actually gets paid. */}
      <div className="mb-6 rounded-xl border border-earth-200 bg-earth-50 px-6 py-4">
        <p className="text-sm font-medium text-earth-600">Total a pagar del período</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-earth-900">
          {formatGTQ(totals.totalToPay)}
        </p>
        <p className="mt-1 text-xs text-earth-500">
          {rows.length} trabajadores · {totals.recordCount} registros · devengado{" "}
          {formatGTQ(totals.totalEarned)} + séptimo {formatGTQ(totals.seventhDayPay)} + bonificación{" "}
          {formatGTQ(totals.bonification)} − anticipos {formatGTQ(totals.advances)} − descuentos{" "}
          {formatGTQ(totals.deductions)}
        </p>
      </div>

      {negativos.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-6 py-4">
          <p className="text-sm font-semibold text-red-800">
            {negativos.length}{" "}
            {negativos.length === 1 ? "trabajador tiene" : "trabajadores tienen"} un total a pagar
            negativo
          </p>
          <p className="mt-1 text-sm text-red-700">
            {negativos.map((r) => `${r.workerName} (${formatGTQ(r.totalToPay)})`).join(" · ")}
          </p>
          <p className="mt-1 text-xs text-red-600">
            Un monto negativo no se puede pagar. Revise los descuentos en Ajustes antes de
            autorizar el período.
          </p>
        </div>
      )}

      {/* Per-worker table */}
      <div className="overflow-x-auto rounded-xl border border-finca-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-finca-100 bg-finca-50/50">
              <th className="px-4 py-3 font-medium text-finca-600">Trabajador</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Registros</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Total Devengado</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Séptimo</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Bonificación</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Anticipos</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">Descuentos</th>
              <th className="px-4 py-3 text-right font-medium text-finca-600">A Pagar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-finca-50">
            {rows.map((r) => (
              <tr key={r.workerId} className="hover:bg-finca-50/30">
                <td className="whitespace-nowrap px-4 py-2.5 font-medium text-finca-900">
                  {r.workerName}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-500">
                  {r.recordCount}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-700">
                  {formatGTQ(r.totalEarned)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-600">
                  {num(r.seventhDayPay)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-600">
                  {num(r.bonification)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-600">
                  {num(r.advances)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-finca-600">
                  {num(r.deductions)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                    r.totalToPay < 0 ? "text-red-600" : "text-finca-900"
                  }`}
                >
                  {formatGTQ(r.totalToPay)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-finca-200 bg-finca-50/30">
              <td className="px-4 py-3 font-semibold text-finca-900">Total</td>
              <td className="px-4 py-3 text-right tabular-nums text-finca-500">
                {totals.recordCount}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-900">
                {formatGTQ(totals.totalEarned)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-700">
                {formatGTQ(totals.seventhDayPay)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-700">
                {formatGTQ(totals.bonification)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-700">
                {formatGTQ(totals.advances)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-finca-700">
                {formatGTQ(totals.deductions)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-finca-900">
                {formatGTQ(totals.totalToPay)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-4 text-xs text-finca-400">
        Montos del período abierto, tomados de la planilla que alimenta el archivo bancario.
        Los descuentos y adicionales se editan en{" "}
        <Link href="/planilla/ajustes" className="underline hover:text-finca-600">
          Ajustes
        </Link>
        .
      </p>
    </div>
  );
}
