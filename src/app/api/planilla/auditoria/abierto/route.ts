// =============================================================================
// src/app/api/planilla/auditoria/abierto/route.ts
// Revisión y Autorización → Excel Auditoría of the OPEN period.
// The same workbook the Planillas Anteriores download produces (one builder —
// @/lib/planilla/auditoria-xlsx), for the period still being reviewed, so the
// file an authorizer studies BEFORE authorizing has the same shape as the one
// filed AFTER the close and the two can be compared line for line.
//
// The only difference is the stamp: an open period's numbers move, so the
// Información sheet marks the file PROVISIONAL with the time it was generated,
// names the weeks still in course, and the filename carries "-provisional".
//
// Audience: PAYROLL_REVIEW_ROLES — everyone who can open the page. Reviewing is
// exactly what the file is for, and CFO/MANAGER already see every figure in it
// on screen; only "Autorizar pago" is narrower (SETTINGS_ROLES).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, PAYROLL_REVIEW_ROLES } from "@/lib/auth/guards";
import { getCurrentPayPeriod } from "@/lib/payroll/current-period";
import { buildAuditoriaWorkbook } from "@/lib/planilla/auditoria-xlsx";

export const runtime = "nodejs"; // the xlsx writer needs Node APIs, not edge
export const dynamic = "force-dynamic"; // auth + always-fresh period data

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...PAYROLL_REVIEW_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("trabajador");

  // THE open period — the same one the page under review renders. Not "newest
  // by date": getCurrentPayPeriod is the single definition of open (isClosed
  // false), and only one period may be open at a time (partial unique index
  // pay_periods_single_open).
  const period = await getCurrentPayPeriod();
  if (!period) {
    return NextResponse.json({ error: "No hay un período de pago abierto" }, { status: 404 });
  }

  const { buffer, filename } = await buildAuditoriaWorkbook(
    prisma,
    {
      id: period.id,
      periodNumber: period.periodNumber,
      startDate: period.startDate,
      endDate: period.endDate,
      isClosed: period.isClosed,
    },
    workerId ?? undefined,
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
