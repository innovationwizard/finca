// =============================================================================
// src/app/api/pagos/route.ts — Payment data API (CFO only)
//
// Returns every payroll entry for a single pay period (one row per worker),
// including workers with no bank account or zero pay. Partitioning into "goes in
// the file" vs "excluded" is done client-side so excluded workers can be warned
// about by name — they are never dropped here.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole("CFO", "MASTER", "CONSULTANT");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");

  if (!periodId) {
    return NextResponse.json(
      { error: "Falta el período de pago" },
      { status: 400 },
    );
  }

  // Payroll entries for the period, with the worker's bank info. Ordered by
  // full name so the preview and file read alphabetically (by first name).
  const entries = await prisma.payrollEntry.findMany({
    where: { payPeriodId: periodId },
    include: {
      worker: {
        select: { id: true, fullName: true, bankAccount: true },
      },
    },
    orderBy: [{ worker: { fullName: "asc" } }],
  });

  const rows = entries.map((e) => ({
    workerId: e.worker.id,
    workerName: e.worker.fullName,
    bankAccount: e.worker.bankAccount ?? "",
    totalToPay: Number(e.totalToPay),
    isPaid: e.isPaid,
  }));

  return NextResponse.json({ rows });
}
