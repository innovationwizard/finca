// =============================================================================
// src/app/api/planilla/export/route.ts — Planillas Anteriores → Excel Diario
// Streams a single .xlsx workbook for one CLOSED pay period: one sheet per
// Mon–Sat week the period spans, plus a "Período completo" sheet, each a ledger
// of one row per activity record (Fecha, Trabajador, Lote, Actividad, Unidades,
// UdM, Costo unitario, Costo) with a grand-total footer. Shares
// @/lib/planilla/history so the weeks it splits on are the weeks the screen
// shows. Honors ?trabajador= (single-worker filter).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { unitAbbr } from "@/lib/utils/format";
import { dm, dmy, periodWeeks, activityLabel, type Week } from "@/lib/planilla/history";

export const runtime = "nodejs"; // the xlsx writer needs Node APIs, not edge
export const dynamic = "force-dynamic"; // auth + always-fresh period data

// Quetzal number format (2 decimals, thousands separator) for every money cell.
const MONEY_FMT = "#,##0.00";

// Excel sheet names: ≤31 chars, and none of : \\ / ? * [ ]. dm() uses "/", so
// swap it for "." here. The week index keeps names unique within the workbook.
const sheetName = (w: Week): string => `Sem ${w.index + 1} ${dm(w.monday).replace("/", ".")}-${dm(w.saturday).replace("/", ".")}`;

// ── Ledger ("Diario") format ─────────────────────────────────────────────────
// One row per activity record instead of one row per worker, with Lote and
// Actividad in their own columns. Same records, same period/worker scope.
type LedgerRecord = {
  workerId: string;
  date: Date;
  quantity: unknown; // Prisma Decimal
  unitPrice: unknown; // Prisma Decimal
  totalEarned: unknown; // Prisma Decimal
  activity: { name: string; shortName: string | null; unit: string };
  lote: { name: string } | null;
};

const LEDGER_HEADER = ["#", "Fecha", "Trabajador", "Lote", "Actividad", "Unidades", "UdM", "Costo unitario", "Costo"];

// Build one ledger worksheet from a set of records (already scoped to a week or
// the whole period). Rows are ordered by date, then worker name, then activity.
function buildLedgerSheet(records: LedgerRecord[], workerName: Map<string, string>): XLSX.WorkSheet {
  const isoOf = (d: Date) => d.toISOString().slice(0, 10);
  const rows = [...records].sort((a, b) => {
    const byDate = isoOf(a.date).localeCompare(isoOf(b.date));
    if (byDate) return byDate;
    const byWorker = (workerName.get(a.workerId) ?? "").localeCompare(workerName.get(b.workerId) ?? "", "es");
    if (byWorker) return byWorker;
    return activityLabel(a.activity.shortName, a.activity.name).localeCompare(activityLabel(b.activity.shortName, b.activity.name), "es");
  });

  const aoa: (string | number)[][] = [LEDGER_HEADER];
  let grandTotal = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const total = Number(r.totalEarned);
    grandTotal += total;
    aoa.push([
      i + 1,
      dmy(isoOf(r.date)),
      workerName.get(r.workerId) ?? "",
      r.lote?.name ?? "—",
      activityLabel(r.activity.shortName, r.activity.name),
      Number(r.quantity),
      unitAbbr(r.activity.unit),
      Number(r.unitPrice),
      total,
    ]);
  }
  // Grand-total footer: label under "Actividad", sum under "Costo".
  const footer: (string | number)[] = ["", "", "", "", "Total", "", "", "", grandTotal];
  aoa.push(footer);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 5 }, { wch: 12 }, { wch: 26 }, { wch: 16 }, { wch: 28 },
    { wch: 11 }, { wch: 8 }, { wch: 14 }, { wch: 13 },
  ];

  // Money/quantity number format on the numeric columns (Unidades=5, Costo
  // unitario=7, Costo=8), skipping the header row.
  for (let r = 1; r < aoa.length; r++) {
    for (const c of [5, 7, 8]) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = MONEY_FMT;
    }
  }

  return ws;
}

// Strip a worker name down to a filename-safe ASCII token (accents removed,
// runs of non-alphanumerics collapsed to "-").
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

  // Closed periods only — exactly what the page exposes, and the guard that
  // matters: the open period must not be exportable via a hand-crafted URL.
  // NOT scoped by agricultural year. It was, and that silently made every period
  // of an earlier cosecha un-exportable — the whole point of Planillas Anteriores
  // is reaching them. The id already identifies one period; the year added no
  // authorization, only an expiry date on history.
  const period = await prisma.payPeriod.findFirst({
    where: { id: periodId, isClosed: true },
    select: { id: true, periodNumber: true, startDate: true, endDate: true },
  });
  if (!period) {
    return NextResponse.json({ error: "Período no encontrado o no está cerrado" }, { status: 404 });
  }

  const weeks = periodWeeks(period.startDate, period.endDate);
  const days = weeks.flatMap((w) => w.days);
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  // Records BY DATE over the full period range (séptimo model: a calendar week
  // may include days that spilled in from an adjacent period).
  const records = await prisma.activityRecord.findMany({
    where: { date: { gte: new Date(`${rangeStart}T00:00:00.000Z`), lte: new Date(`${rangeEnd}T00:00:00.000Z`) } },
    select: {
      workerId: true,
      date: true,
      quantity: true,
      unitPrice: true,
      totalEarned: true,
      activity: { select: { name: true, shortName: true, unit: true } },
      lote: { select: { name: true } },
    },
  });

  // Full active roster, then the optional single-worker filter (honoring the
  // page's ?trabajador=). Unknown id → everyone, same as the page.
  const roster = await prisma.worker.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  const selectedWorker = workerId && roster.some((w) => w.id === workerId) ? workerId : "";
  const workers = selectedWorker ? roster.filter((w) => w.id === selectedWorker) : roster;

  const wb = XLSX.utils.book_new();

  // One ledger sheet per week, scoped to the same worker set the page shows.
  const workerName = new Map(workers.map((w) => [w.id, w.fullName]));
  const scoped = records.filter((r) => workerName.has(r.workerId));
  for (const w of weeks) {
    const daySet = new Set(w.days);
    const weekRecords = scoped.filter((r) => daySet.has(r.date.toISOString().slice(0, 10)));
    XLSX.utils.book_append_sheet(wb, buildLedgerSheet(weekRecords, workerName), sheetName(w));
  }
  if (weeks.length > 1) {
    XLSX.utils.book_append_sheet(wb, buildLedgerSheet(scoped, workerName), "Período completo");
  }

  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const workerSuffix = selectedWorker
    ? `-${fileToken(roster.find((w) => w.id === selectedWorker)!.fullName)}`
    : "";
  const filename = `planilla-diario-${period.periodNumber}${workerSuffix}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
