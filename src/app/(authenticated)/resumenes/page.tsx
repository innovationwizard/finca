// =============================================================================
// src/app/(authenticated)/resumenes/page.tsx — Resúmenes (read-only)
// Three tabs: Por Semana, Por Persona, Por Lote
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear, formatAgriculturalYear } from "@/lib/utils/agricultural-year";
import { ResumenTabs } from "./resumen-tabs";

export const metadata = { title: "Resúmenes" };

export default async function ResumenesPage() {
  await requireRole(...READ_ALL_ROLES);

  const agYear = getCurrentAgriculturalYear();

  // All open periods for current ag year
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

  const periodIds = periods.map((p) => p.id);

  // ── Por Semana: group by payPeriodId + workerId ───────────────────────────
  const weeklyRaw = await prisma.activityRecord.groupBy({
    by: ["payPeriodId", "workerId"],
    where: { payPeriodId: { in: periodIds } },
    _sum: { totalEarned: true },
  });

  // ── Por Persona: group by workerId across all periods ─────────────────────
  const personalRaw = await prisma.activityRecord.groupBy({
    by: ["workerId"],
    where: { payPeriodId: { in: periodIds } },
    _sum: { totalEarned: true },
  });

  // ── Por Lote: group by loteId + activityId ────────────────────────────────
  const loteRaw = await prisma.activityRecord.groupBy({
    by: ["loteId", "activityId"],
    where: { payPeriodId: { in: periodIds }, loteId: { not: null } },
    _sum: { totalEarned: true },
  });

  // Fetch reference data
  const workerIds = [
    ...new Set([
      ...weeklyRaw.map((r) => r.workerId),
      ...personalRaw.map((r) => r.workerId),
    ]),
  ];
  const activityIds = [...new Set(loteRaw.map((r) => r.activityId))];
  const loteIds = [...new Set(loteRaw.map((r) => r.loteId).filter(Boolean))] as string[];

  const [workers, activities, lotes, payrollEntries] = await Promise.all([
    prisma.worker.findMany({
      where: { id: { in: workerIds } },
      select: { id: true, fullName: true, dpi: true, bankAccount: true },
    }),
    prisma.activity.findMany({
      where: { id: { in: activityIds } },
      select: { id: true, name: true },
    }),
    prisma.lote.findMany({
      where: { id: { in: loteIds } },
      select: { id: true, name: true },
    }),
    prisma.payrollEntry.findMany({
      where: { payPeriodId: { in: periodIds } },
      select: {
        workerId: true,
        payPeriodId: true,
        bonification: true,
        advances: true,
        deductions: true,
        totalToPay: true,
      },
    }),
  ]);

  const workerMap = new Map(workers.map((w) => [w.id, w]));
  const activityMap = new Map(activities.map((a) => [a.id, a.name]));
  const loteMap = new Map(lotes.map((l) => [l.id, l.name]));
  const periodMap = new Map(periods.map((p) => [p.id, p]));

  // Build payroll lookup: workerId → aggregated bonification/advances
  const payrollByWorker = new Map<string, { bonification: number; advances: number; deductions: number; totalToPay: number }>();
  for (const pe of payrollEntries) {
    const existing = payrollByWorker.get(pe.workerId) ?? { bonification: 0, advances: 0, deductions: 0, totalToPay: 0 };
    existing.bonification += Number(pe.bonification);
    existing.advances += Number(pe.advances);
    existing.deductions += Number(pe.deductions);
    existing.totalToPay += Number(pe.totalToPay);
    payrollByWorker.set(pe.workerId, existing);
  }

  // ── Build tab data ────────────────────────────────────────────────────────

  // Por Semana
  type WeeklyRow = { periodNumber: number; startDate: string; endDate: string; workerName: string; totalEarned: number; totalToPay: number };
  const weeklyRows: WeeklyRow[] = weeklyRaw
    .map((r) => {
      const period = periodMap.get(r.payPeriodId);
      const worker = workerMap.get(r.workerId);
      return {
        periodNumber: period?.periodNumber ?? 0,
        startDate: period?.startDate.toISOString().split("T")[0] ?? "",
        endDate: period?.endDate.toISOString().split("T")[0] ?? "",
        workerName: worker?.fullName ?? "Desconocido",
        totalEarned: Number(r._sum.totalEarned ?? 0),
        totalToPay: Number(r._sum.totalEarned ?? 0),
      };
    })
    .sort((a, b) => a.periodNumber - b.periodNumber || a.workerName.localeCompare(b.workerName));

  // Por Persona
  type PersonalRow = { workerName: string; totalEarned: number; bonification: number; advances: number; totalToPay: number; dpi: string; bankAccount: string; bank: string };
  const personalRows: PersonalRow[] = personalRaw
    .map((r) => {
      const worker = workerMap.get(r.workerId);
      const payroll = payrollByWorker.get(r.workerId);
      const totalEarned = Number(r._sum.totalEarned ?? 0);
      const bonification = payroll?.bonification ?? 0;
      const advances = payroll?.advances ?? 0;
      return {
        workerName: worker?.fullName ?? "Desconocido",
        totalEarned,
        bonification,
        advances,
        totalToPay: totalEarned + bonification - advances,
        dpi: worker?.dpi ?? "",
        bankAccount: worker?.bankAccount ?? "",
        bank: "",
      };
    })
    .sort((a, b) => a.workerName.localeCompare(b.workerName));

  // Por Lote
  type LoteRow = { loteName: string; activityName: string; totalEarned: number };
  const loteRows: LoteRow[] = loteRaw
    .map((r) => ({
      loteName: loteMap.get(r.loteId!) ?? "Sin lote",
      activityName: activityMap.get(r.activityId) ?? "Desconocida",
      totalEarned: Number(r._sum.totalEarned ?? 0),
    }))
    .sort((a, b) => a.loteName.localeCompare(b.loteName) || b.totalEarned - a.totalEarned);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Resúmenes
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Año agrícola {formatAgriculturalYear(agYear)} · {periods.length} períodos
        </p>
      </div>

      <ResumenTabs
        weeklyRows={weeklyRows}
        personalRows={personalRows}
        loteRows={loteRows}
      />
    </div>
  );
}
