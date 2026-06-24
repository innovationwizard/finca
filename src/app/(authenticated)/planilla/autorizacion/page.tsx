// =============================================================================
// src/app/(authenticated)/planilla/autorizacion/page.tsx
// Revisión y Autorización — one shared screen for the OPEN pay period.
//   • CFO audits read-only; MASTER/ADMIN additionally "Autorizar pago" (which
//     closes the period via the existing close endpoint).
//   • Whole period at once: KPI cards + exception catalog + charts + a dense,
//     sortable, sticky table. Bank cross-check is manual (view-only).
// Design grounded in docs/payroll-audit-dashboard-research.md.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, PAYROLL_REVIEW_ROLES, SETTINGS_ROLES } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";
import { AutorizacionClient } from "./autorizacion-client";

export const metadata = { title: "Revisión y Autorización" };

// Period-over-period swing above this fraction flags "variación alta". Piece-rate
// pay varies seasonally, so this is intentionally loose; tune later (see research
// open questions). 0.5 = a >50% change vs the same worker's previous period.
const VARIANCE_THRESHOLD = 0.5;

export default async function AutorizacionPage() {
  const user = await requireRole(...PAYROLL_REVIEW_ROLES);
  const canAuthorize = SETTINGS_ROLES.includes(user.role);
  const year = getCurrentAgriculturalYear();

  const period = await prisma.payPeriod.findFirst({
    where: { agriculturalYear: year, isClosed: false },
    orderBy: { periodNumber: "desc" },
    select: { id: true, periodNumber: true, startDate: true, endDate: true },
  });

  if (!period) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">Revisión y Autorización</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
          <p className="text-sm text-amber-800">No hay un período de pago abierto para revisar.</p>
        </div>
      </div>
    );
  }

  const entries = await prisma.payrollEntry.findMany({
    where: { payPeriodId: period.id },
    select: {
      workerId: true,
      category: true,
      totalEarned: true,
      seventhDayPay: true,
      bonification: true,
      deductions: true,
      bonificationNote: true,
      deductionsNote: true,
      totalToPay: true,
      worker: { select: { fullName: true, bankAccount: true, bankName: true, isActive: true } },
    },
  });

  // Previous period (most recent one starting before this one) → per-worker
  // totalToPay for the variance flag.
  const prev = await prisma.payPeriod.findFirst({
    where: { startDate: { lt: period.startDate } },
    orderBy: { startDate: "desc" },
    select: { id: true, periodNumber: true },
  });
  const prevTotals = new Map<string, number>();
  if (prev) {
    const grouped = await prisma.payrollEntry.groupBy({
      by: ["workerId"],
      where: { payPeriodId: prev.id },
      _sum: { totalToPay: true },
    });
    for (const g of grouped) prevTotals.set(g.workerId, Number(g._sum.totalToPay ?? 0));
  }

  // Bank-account occurrence count → "cuenta compartida" (surface, never block:
  // family-shared BANRURAL accounts are legitimate here).
  const acctCount = new Map<string, number>();
  for (const e of entries) {
    const a = e.worker.bankAccount?.trim();
    if (a) acctCount.set(a, (acctCount.get(a) ?? 0) + 1);
  }

  const rows = entries
    .map((e) => {
      const totalToPay = Number(e.totalToPay);
      const devengado = Number(e.totalEarned);
      const septimo = Number(e.seventhDayPay);
      const adicionales = Number(e.bonification);
      const descuentos = Number(e.deductions);
      const cuenta = e.worker.bankAccount?.trim() ?? "";
      const prevTotal = prevTotals.has(e.workerId) ? prevTotals.get(e.workerId)! : null;
      return {
        workerId: e.workerId,
        name: e.worker.fullName,
        category: e.category as "VOLUNTARIO" | "FIJO",
        devengado,
        septimo,
        adicionales,
        descuentos,
        totalToPay,
        banco: e.worker.bankName ?? "",
        cuenta,
        isActive: e.worker.isActive,
        prevTotal,
        flags: {
          sinCuenta: cuenta === "",
          cuentaCompartida: cuenta !== "" && (acctCount.get(cuenta) ?? 0) > 1,
          pagoSinTrabajo: totalToPay > 0 && devengado === 0 && septimo === 0,
          inactivoConPago: !e.worker.isActive && totalToPay !== 0,
          ajusteSinNota:
            (descuentos > 0 && !(e.deductionsNote?.trim())) ||
            (adicionales > 0 && !(e.bonificationNote?.trim())),
          variacion:
            prevTotal != null && prevTotal > 0 &&
            Math.abs(totalToPay - prevTotal) / prevTotal > VARIANCE_THRESHOLD,
        },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // KPIs
  const totalToPay = rows.reduce((s, r) => s + r.totalToPay, 0);
  const exceptionWorkerCount = rows.filter((r) => Object.values(r.flags).some(Boolean)).length;
  const sinCuentaCount = rows.filter((r) => r.flags.sinCuenta).length;

  // Net-pay distribution histogram (numeric GTQ bins of 500).
  const BIN = 500;
  const maxPay = rows.reduce((m, r) => Math.max(m, r.totalToPay), 0);
  const binCount = Math.max(1, Math.ceil((maxPay + 1) / BIN));
  const histogram = Array.from({ length: binCount }, (_, i) => ({
    label: `${(i * BIN).toLocaleString("es-GT")}–${((i + 1) * BIN).toLocaleString("es-GT")}`,
    count: 0,
  }));
  for (const r of rows) {
    const i = Math.min(binCount - 1, Math.max(0, Math.floor(r.totalToPay / BIN)));
    histogram[i].count++;
  }

  // Composition by category (≤ few categories, per research).
  const composition = (["VOLUNTARIO", "FIJO"] as const).map((cat) => {
    const rs = rows.filter((r) => r.category === cat);
    return {
      category: cat === "VOLUNTARIO" ? "Voluntario" : "Fijo",
      total: rs.reduce((s, r) => s + r.totalToPay, 0),
      count: rs.length,
    };
  });

  return (
    <AutorizacionClient
      period={{
        id: period.id,
        periodNumber: period.periodNumber,
        startDate: period.startDate.toISOString().split("T")[0],
        endDate: period.endDate.toISOString().split("T")[0],
      }}
      canAuthorize={canAuthorize}
      rows={rows}
      kpis={{ totalToPay, workerCount: rows.length, exceptionWorkerCount, sinCuentaCount }}
      histogram={histogram}
      composition={composition}
      prevPeriodNumber={prev?.periodNumber ?? null}
    />
  );
}
