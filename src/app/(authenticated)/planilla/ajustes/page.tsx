// =============================================================================
// src/app/(authenticated)/planilla/ajustes/page.tsx — Descuentos y Adicionales
// Per-worker manual adjustments for the OPEN pay period, mirroring the SSOT:
//   TOTAL (devengado + séptimo) − DESCUENTOS + ADICIONALES = TOTAL A PAGAR.
// Sets PayrollEntry.deductions / .bonification (→ bank file). View: MASTER,
// MANAGER, ADMIN, CFO. Edit: MASTER, MANAGER (others see it read-only).
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, PAY_ADJUST_VIEW_ROLES, PAY_ADJUST_WRITE_ROLES } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";
import { AjustesGrid } from "./ajustes-grid";

export const metadata = { title: "Descuentos y Adicionales" };

export default async function AjustesPage() {
  const user = await requireRole(...PAY_ADJUST_VIEW_ROLES);
  const canWrite = PAY_ADJUST_WRITE_ROLES.includes(user.role);
  const year = getCurrentAgriculturalYear();

  const period = await prisma.payPeriod.findFirst({
    where: { agriculturalYear: year, isClosed: false },
    orderBy: { periodNumber: "desc" },
    select: { id: true, periodNumber: true, startDate: true, endDate: true },
  });

  if (!period) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">Descuentos y Adicionales</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
          <p className="text-sm text-amber-800">
            No hay un período de pago abierto. Los ajustes solo se editan sobre el período abierto.
          </p>
        </div>
      </div>
    );
  }

  // Full active roster so any worker can receive an adjustment, joined with the
  // open period's payroll entries (gross = devengado + séptimo) when present.
  const [workers, entries] = await Promise.all([
    prisma.worker.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.payrollEntry.findMany({
      where: { payPeriodId: period.id },
      select: { workerId: true, totalEarned: true, seventhDayPay: true, deductions: true, bonification: true, deductionsNote: true, bonificationNote: true },
    }),
  ]);
  const entryByWorker = new Map(entries.map((e) => [e.workerId, e]));

  const rows = workers.map((w) => {
    const e = entryByWorker.get(w.id);
    return {
      workerId: w.id,
      name: w.fullName,
      gross: e ? Number(e.totalEarned) + Number(e.seventhDayPay) : 0,
      deductions: e ? Number(e.deductions) : 0,
      bonification: e ? Number(e.bonification) : 0,
      deductionsNote: e?.deductionsNote ?? "",
      bonificationNote: e?.bonificationNote ?? "",
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-finca-900">Descuentos y Adicionales</h1>
      <p className="mt-1 text-sm text-finca-500">
        Semana {period.periodNumber} · Año {year} ·{" "}
        {period.startDate.toLocaleDateString("es-GT")} — {period.endDate.toLocaleDateString("es-GT")}
        {!canWrite && " · Solo lectura"}
      </p>

      <div className="mt-5">
        <AjustesGrid periodId={period.id} rows={rows} canWrite={canWrite} />
      </div>
    </div>
  );
}
