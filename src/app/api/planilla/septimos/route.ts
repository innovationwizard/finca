// =============================================================================
// src/app/api/planilla/septimos/route.ts — Planillas Anteriores → Excel Séptimos
// Streams a one-sheet .xlsx reconciling the séptimo of one CLOSED pay period:
// per Mon–Sun week, what each worker was paid by activity, what séptimo they
// earned, and the weekly total — then Séptimo calculado vs Séptimo en planilla
// vs Diferencia, so "¿se pagaron los séptimos?" is answered by reading the last
// column. Rules live in @/lib/planilla/septimo-semanal (shared with
// scripts/septimo-audit-semanal.ts), the sheet itself in septimo-xlsx.
// Honors ?trabajador= (single-worker filter).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { buildSeptimoReport } from "@/lib/planilla/septimo-semanal";
import { buildSeptimoSheet } from "@/lib/planilla/septimo-xlsx";

export const runtime = "nodejs"; // the xlsx writer needs Node APIs, not edge
export const dynamic = "force-dynamic"; // auth + always-fresh period data

// Strip a worker name down to a filename-safe ASCII token.
function fileToken(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export async function GET(request: NextRequest) {
  // Same audience as the Planillas Anteriores page (read-all roles + FIELD).
  const auth = await apiRequireRole(...READ_ALL_ROLES, "FIELD");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodo");
  const workerId = searchParams.get("trabajador");
  if (!periodId) {
    return NextResponse.json({ error: "Falta el parámetro 'periodo'" }, { status: 400 });
  }

  // Closed periods only — the open period is still being recomputed, so its
  // séptimo is not yet a figure to reconcile against.
  const period = await prisma.payPeriod.findFirst({
    where: { id: periodId, isClosed: true },
    select: { id: true, periodNumber: true, startDate: true, endDate: true },
  });
  if (!period) {
    return NextResponse.json({ error: "Período no encontrado o no está cerrado" }, { status: 404 });
  }

  // Unknown worker id → everyone, same as the page and the diario export.
  const selected = workerId
    ? await prisma.worker.findUnique({ where: { id: workerId }, select: { id: true, fullName: true } })
    : null;

  const report = await buildSeptimoReport(prisma, period, selected?.id);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSeptimoSheet(report), "Séptimos por semana");
  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const workerSuffix = selected ? `-${fileToken(selected.fullName)}` : "";
  const filename = `planilla-septimos-${period.periodNumber}${workerSuffix}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
