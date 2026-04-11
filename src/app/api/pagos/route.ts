// =============================================================================
// src/app/api/pagos/route.ts — Payment data API (CFO only)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole("CFO", "MASTER");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode"); // "period" | "month" | "week" | "range"
  const periodId = searchParams.get("periodId");
  const month = searchParams.get("month"); // 1-12
  const year = searchParams.get("year"); // e.g. "2026"
  const week = searchParams.get("week"); // ISO week number
  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to"); // YYYY-MM-DD

  // Build pay period filter based on mode
  let periodFilter: { id?: string; startDate?: object; endDate?: object } = {};

  if (mode === "period" && periodId) {
    periodFilter = { id: periodId };
  } else if (mode === "month" && month && year) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0);
    periodFilter = {
      startDate: { gte: startOfMonth },
      endDate: { lte: endOfMonth },
    };
  } else if (mode === "week" && week && year) {
    // ISO week to date range
    const w = parseInt(week, 10);
    const y = parseInt(year, 10);
    const jan4 = new Date(y, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const weekStart = new Date(jan4);
    weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (w - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    periodFilter = {
      startDate: { lte: weekEnd },
      endDate: { gte: weekStart },
    };
  } else if (mode === "range" && from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    periodFilter = {
      startDate: { lte: toDate },
      endDate: { gte: fromDate },
    };
  } else {
    return NextResponse.json(
      { error: "Parámetros de filtro inválidos" },
      { status: 400 },
    );
  }

  // Get matching pay periods
  const periods = await prisma.payPeriod.findMany({
    where: periodFilter,
    select: { id: true, periodNumber: true, startDate: true, endDate: true, type: true },
    orderBy: { periodNumber: "asc" },
  });

  if (periods.length === 0) {
    return NextResponse.json({ rows: [], periods: [], bankCode: "" });
  }

  const periodIds = periods.map((p) => p.id);

  // Get payroll entries for those periods, with worker bank info
  const entries = await prisma.payrollEntry.findMany({
    where: { payPeriodId: { in: periodIds } },
    include: {
      worker: {
        select: {
          id: true,
          fullName: true,
          bankAccount: true,
          isActive: true,
        },
      },
      payPeriod: {
        select: { periodNumber: true, startDate: true, endDate: true },
      },
    },
    orderBy: [{ worker: { fullName: "asc" } }],
  });

  // Get bank code from system settings
  const bankCodeSetting = await prisma.systemSetting.findUnique({
    where: { key: "bank_code" },
  });
  const bankCode = bankCodeSetting ? JSON.parse(bankCodeSetting.value) : "";

  const rows = entries.map((e) => ({
    workerId: e.worker.id,
    workerName: e.worker.fullName,
    bankAccount: e.worker.bankAccount ?? "",
    totalToPay: Number(e.totalToPay),
    totalEarned: Number(e.totalEarned),
    bonification: Number(e.bonification),
    advances: Number(e.advances),
    deductions: Number(e.deductions),
    periodNumber: e.payPeriod.periodNumber,
    periodStart: e.payPeriod.startDate.toISOString().split("T")[0],
    periodEnd: e.payPeriod.endDate.toISOString().split("T")[0],
    payPeriodId: e.payPeriodId,
  }));

  const serializedPeriods = periods.map((p) => ({
    id: p.id,
    periodNumber: p.periodNumber,
    startDate: p.startDate.toISOString().split("T")[0],
    endDate: p.endDate.toISOString().split("T")[0],
    type: p.type,
  }));

  return NextResponse.json({
    rows,
    periods: serializedPeriods,
    bankCode,
  });
}
