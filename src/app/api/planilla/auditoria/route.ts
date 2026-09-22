// =============================================================================
// src/app/api/planilla/auditoria/route.ts — Planillas Anteriores → Excel Auditoría
// Streams the audit workbook for the MOST RECENT ALREADY-ENDED pay period — the
// same period the Pagos page shows first as "más reciente", picked by the same
// query (endDate < today, newest first), so the dates on the button always equal
// the dates on that page's chip.
//
// The workbook itself is built by @/lib/planilla/auditoria-xlsx, shared with the
// open-period download on Revisión y Autorización (./abierto). This route only
// picks the period and enforces the audience.
//
// Honors ?trabajador= (single-worker filter), like the other two downloads.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { buildAuditoriaWorkbook } from "@/lib/planilla/auditoria-xlsx";

export const runtime = "nodejs"; // the xlsx writer needs Node APIs, not edge
export const dynamic = "force-dynamic"; // auth + always-fresh period data

export async function GET(request: NextRequest) {
  // Same audience as the Planillas Anteriores page (read-all roles + FIELD).
  const auth = await apiRequireRole(...READ_ALL_ROLES, "FIELD");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("trabajador");

  // THE period: newest already-ended one — the identical query the Pagos page
  // runs for its "más reciente" chip (pagos/page.tsx), so the dates on the
  // button and the dates in this file are the same dates by construction.
  // Deliberately NOT scoped by agricultural year, and NOT filtered on isClosed:
  // Pagos does neither, and matching it is the requirement. A period that has
  // ended but is not yet closed can still change, so the workbook says which.
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const period = await prisma.payPeriod.findFirst({
    where: { endDate: { lt: todayUtc } },
    orderBy: { endDate: "desc" },
    select: { id: true, periodNumber: true, startDate: true, endDate: true, isClosed: true },
  });
  if (!period) {
    return NextResponse.json({ error: "No hay ningún período de pago finalizado" }, { status: 404 });
  }

  const { buffer, filename } = await buildAuditoriaWorkbook(prisma, period, workerId ?? undefined, now);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
