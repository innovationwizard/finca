// =============================================================================
// src/app/api/planilla/export/route.ts — Planillas Anteriores → Excel
// Streams a single .xlsx workbook for one CLOSED pay period: one sheet per
// Mon–Sat week the period spans, plus a "Período completo" sheet with every
// week side by side. Rows = active roster, columns = days × (Actividad · Lote ·
// Unidades), with a per-worker Total column and a grand-total footer — the same
// grid the page renders, sharing @/lib/planilla/history so the download can
// never diverge from the screen. Honors ?trabajador= (single-worker filter).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";
import {
  DAY_LABELS,
  dm,
  periodWeeks,
  buildGrid,
  cellKey,
  entryActivityLabel,
  entryDetailLabel,
  weekLabel,
  type Week,
  type Entry,
} from "@/lib/planilla/history";

export const runtime = "nodejs"; // the xlsx writer needs Node APIs, not edge
export const dynamic = "force-dynamic"; // auth + always-fresh period data

// One day-cell's text: every activity the worker did that day, "Actividad" line
// over "Lote · Unidades" line, blank line between multiple activities. Empty
// string when the worker had no record that day.
function dayCellText(entries: Entry[] | undefined): string {
  if (!entries || entries.length === 0) return "";
  return entries.map((e) => `${entryActivityLabel(e)}\n${entryDetailLabel(e)}`).join("\n\n");
}

// Excel sheet names: ≤31 chars, and none of : \ / ? * [ ]. dm() uses "/", so
// swap it for "." here. The week index keeps names unique within the workbook.
const sheetName = (w: Week): string => `Sem ${w.index + 1} ${dm(w.monday).replace("/", ".")}-${dm(w.saturday).replace("/", ".")}`;

type SheetWorker = { id: string; fullName: string };

// Build one worksheet from a contiguous run of weeks (one week → a weekly sheet;
// all weeks → "Período completo"). Mirrors the page: a week-band header row is
// added only when more than one week is shown.
function buildSheet(
  weeks: Week[],
  workers: SheetWorker[],
  grid: ReturnType<typeof buildGrid>,
): XLSX.WorkSheet {
  const days = weeks.flatMap((w) => w.days);
  const showBand = weeks.length > 1;
  const aoa: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];

  // Optional week-band row (only for Período completo): the week label spanning
  // its 6 day columns.
  if (showBand) {
    const band: (string | number)[] = ["", ""];
    let col = 2; // after "#" and "Trabajador"
    for (const w of weeks) {
      band.push(weekLabel(w.monday, w.saturday));
      merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + 5 } });
      for (let i = 1; i < 6; i++) band.push("");
      col += 6;
    }
    band.push(""); // Total column
    aoa.push(band);
  }

  // Day-label header row: "#", "Trabajador", "Lun 05/05" …, "Total".
  const header: (string | number)[] = ["#", "Trabajador"];
  for (let i = 0; i < days.length; i++) header.push(`${DAY_LABELS[i % 6]} ${dm(days[i])}`);
  header.push("Total");
  aoa.push(header);

  // One row per roster worker.
  let grandTotal = 0;
  for (let idx = 0; idx < workers.length; idx++) {
    const w = workers[idx];
    const row: (string | number)[] = [idx + 1, w.fullName];
    for (const d of days) row.push(dayCellText(grid.cells.get(cellKey(w.id, d))));
    const total = grid.workerTotals.get(w.id) ?? 0;
    row.push(total);
    grandTotal += total;
    aoa.push(row);
  }

  // Grand-total footer row.
  const footer: (string | number)[] = ["", "Total"];
  for (let i = 0; i < days.length; i++) footer.push("");
  footer.push(grandTotal);
  aoa.push(footer);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (merges.length) ws["!merges"] = merges;

  // Column widths: narrow "#", wide name, roomy day cells, roomy total.
  ws["!cols"] = [{ wch: 4 }, { wch: 26 }, ...days.map(() => ({ wch: 22 })), { wch: 13 }];

  // Quetzal number format on every Total cell (day-label row is at index
  // showBand?1:0; totals live in the last column of each subsequent row).
  const totalCol = 2 + days.length;
  const firstDataRow = showBand ? 2 : 1; // rows before this are band/header
  for (let r = firstDataRow; r < aoa.length; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: totalCol });
    const cell = ws[ref];
    if (cell && typeof cell.v === "number") cell.z = "#,##0.00";
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

  // Closed periods of the current agricultural year only — exactly what the page
  // exposes. Guards against exporting the open period or a stale year via a
  // hand-crafted URL.
  const period = await prisma.payPeriod.findFirst({
    where: { id: periodId, agriculturalYear: getCurrentAgriculturalYear(), isClosed: true },
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
      totalEarned: true,
      activity: { select: { name: true, code: true, unit: true } },
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

  const grid = buildGrid(records);

  const wb = XLSX.utils.book_new();
  for (const w of weeks) {
    XLSX.utils.book_append_sheet(wb, buildSheet([w], workers, grid), sheetName(w));
  }
  if (weeks.length > 1) {
    XLSX.utils.book_append_sheet(wb, buildSheet(weeks, workers, grid), "Período completo");
  }

  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const workerSuffix = selectedWorker
    ? `-${fileToken(roster.find((w) => w.id === selectedWorker)!.fullName)}`
    : "";
  const filename = `planilla-periodo-${period.periodNumber}${workerSuffix}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
