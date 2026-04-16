// =============================================================================
// GET /api/resumenes?periodIds=id1,id2,...
// Returns aggregated data for the selected pay periods.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { apiRequireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...READ_ALL_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  const raw = searchParams.get("periodIds");

  if (!raw) {
    return NextResponse.json({ error: "periodIds requeridos" }, { status: 400 });
  }

  const periodIds = raw.split(",").filter(Boolean);
  if (periodIds.length === 0) {
    return NextResponse.json({ weeklyRows: [], personalRows: [], loteRows: [] });
  }

  // Validate periods exist
  const periods = await prisma.payPeriod.findMany({
    where: { id: { in: periodIds } },
    orderBy: { periodNumber: "asc" },
  });
  const validIds = periods.map((p) => p.id);

  // Run all queries sequentially to stay within Supabase pool_size (15).
  // Each await releases the connection before the next query starts.

  const weeklyRaw = await prisma.activityRecord.groupBy({
    by: ["payPeriodId", "workerId"],
    where: { payPeriodId: { in: validIds } },
    _sum: { totalEarned: true },
  });

  const loteRaw = await prisma.activityRecord.groupBy({
    by: ["loteId", "activityId"],
    where: { payPeriodId: { in: validIds }, loteId: { not: null } },
    _sum: { totalEarned: true },
  });

  // Derive personalRaw from weeklyRaw instead of a separate query
  const personalMap = new Map<string, number>();
  for (const r of weeklyRaw) {
    personalMap.set(r.workerId, (personalMap.get(r.workerId) ?? 0) + Number(r._sum.totalEarned ?? 0));
  }
  const personalRaw = [...personalMap.entries()].map(([workerId, total]) => ({
    workerId,
    _sum: { totalEarned: total },
  }));

  // Reference data
  const workerIds = [...new Set(weeklyRaw.map((r) => r.workerId))];
  const activityIds = [...new Set(loteRaw.map((r) => r.activityId))];
  const loteIds = [...new Set(loteRaw.map((r) => r.loteId).filter(Boolean))] as string[];

  const workers = await prisma.worker.findMany({
    where: { id: { in: workerIds.length > 0 ? workerIds : ["_"] } },
    select: { id: true, fullName: true, dpi: true, bankAccount: true, bankName: true },
  });

  const activities = await prisma.activity.findMany({
    where: { id: { in: activityIds.length > 0 ? activityIds : ["_"] } },
    select: { id: true, name: true },
  });

  const lotes = await prisma.lote.findMany({
    where: { id: { in: loteIds.length > 0 ? loteIds : ["_"] } },
    select: { id: true, name: true },
  });

  const payrollEntries = await prisma.payrollEntry.findMany({
    where: { payPeriodId: { in: validIds } },
    select: { workerId: true, bonification: true, advances: true, deductions: true, totalToPay: true },
  });

  const workerMap = new Map(workers.map((w) => [w.id, w]));
  const activityMap = new Map(activities.map((a) => [a.id, a.name]));
  const loteMap = new Map(lotes.map((l) => [l.id, l.name]));
  const periodMap = new Map(periods.map((p) => [p.id, p]));

  // Payroll aggregation
  const payrollByWorker = new Map<string, { bonification: number; advances: number }>();
  for (const pe of payrollEntries) {
    const existing = payrollByWorker.get(pe.workerId) ?? { bonification: 0, advances: 0 };
    existing.bonification += Number(pe.bonification);
    existing.advances += Number(pe.advances);
    payrollByWorker.set(pe.workerId, existing);
  }

  // Build rows
  const weeklyRows = weeklyRaw
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

  const personalRows = personalRaw
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
        bank: worker?.bankName ?? "",
      };
    })
    .sort((a, b) => a.workerName.localeCompare(b.workerName));

  const loteRows = loteRaw
    .map((r) => ({
      loteName: loteMap.get(r.loteId!) ?? "Sin lote",
      activityName: activityMap.get(r.activityId) ?? "Desconocida",
      totalEarned: Number(r._sum.totalEarned ?? 0),
    }))
    .sort((a, b) => a.loteName.localeCompare(b.loteName) || b.totalEarned - a.totalEarned);

  return NextResponse.json({ weeklyRows, personalRows, loteRows });
}
