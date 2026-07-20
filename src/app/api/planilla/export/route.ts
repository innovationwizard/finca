// =============================================================================
// src/app/api/planilla/export/route.ts — Planillas Anteriores → Excel
// Streams a single .xlsx workbook for one CLOSED pay period: one sheet per
// Mon–Sat week the period spans, plus a "Período completo" sheet with every
// week side by side. Rows = active roster; each day is three columns —
// Actividad, Costo unitario, Costo (units × unit price) — so the math behind
// every day's pay is on the sheet, plus a per-worker Total column and a
// grand-total footer. Shares @/lib/planilla/history so the download can never
// diverge from the screen. Honors ?trabajador= (single-worker filter).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, READ_ALL_ROLES } from "@/lib/auth/guards";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";
import { formatDecimal } from "@/lib/utils/format";
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

// Quetzal number format (2 decimals, thousands separator) for every money cell.
const MONEY_FMT = "#,##0.00";

// Each day breaks into 3 columns: what was done, its unit price, and the
// resulting cost (units × unit price). Returns [Actividad, Costo unitario,
// Costo]; the two cost cells are numbers on a single-activity day (so Excel
// treats them as money) and stacked text when a worker had several activities
// that day (line N of each column is the same activity).
const COLS_PER_DAY = 3;
function dayTriple(entries: Entry[] | undefined): [string, string | number, string | number] {
  if (!entries || entries.length === 0) return ["", "", ""];
  const actividad = entries.map((e) => `${entryActivityLabel(e)}\n${entryDetailLabel(e)}`).join("\n\n");
  if (entries.length === 1) {
    const e = entries[0];
    return [actividad, e.unitPrice, e.total]; // numeric → money-formatted
  }
  const costoUnit = entries.map((e) => formatDecimal(e.unitPrice)).join("\n\n");
  const costo = entries.map((e) => formatDecimal(e.total)).join("\n\n");
  return [actividad, costoUnit, costo];
}

// Excel sheet names: ≤31 chars, and none of : \ / ? * [ ]. dm() uses "/", so
// swap it for "." here. The week index keeps names unique within the workbook.
const sheetName = (w: Week): string => `Sem ${w.index + 1} ${dm(w.monday).replace("/", ".")}-${dm(w.saturday).replace("/", ".")}`;

type SheetWorker = { id: string; fullName: string };

// Build one worksheet from a contiguous run of weeks (one week → a weekly sheet;
// all weeks → "Período completo"). Every day is three columns (Actividad ·
// Costo unitario · Costo). Header stack, top-down: an optional week band (only
// for Período completo), a day band, then the per-day sub-headers. "#",
// "Trabajador" and "Total" span the whole header stack.
function buildSheet(
  weeks: Week[],
  workers: SheetWorker[],
  grid: ReturnType<typeof buildGrid>,
): XLSX.WorkSheet {
  const days = weeks.flatMap((w) => w.days);
  const showBand = weeks.length > 1;
  const totalCol = 2 + days.length * COLS_PER_DAY; // last column index
  const width = totalCol + 1;
  const merges: XLSX.Range[] = [];

  const dayBaseCol = (dayPos: number) => 2 + dayPos * COLS_PER_DAY;

  // ── Header stack ───────────────────────────────────────────────────────────
  const headerRows = showBand ? 3 : 2;
  const weekBandR = 0;
  const dayBandR = showBand ? 1 : 0;
  const subR = showBand ? 2 : 1;
  const head: (string | number)[][] = Array.from({ length: headerRows }, () => Array(width).fill(""));

  // "#", "Trabajador", "Total" span the full header stack.
  head[0][0] = "#";
  head[0][1] = "Trabajador";
  head[0][totalCol] = "Total";
  for (const c of [0, 1, totalCol]) merges.push({ s: { r: 0, c }, e: { r: headerRows - 1, c } });

  // Week band (Período completo only): the week label over its 18 columns.
  if (showBand) {
    for (let wi = 0; wi < weeks.length; wi++) {
      const c = dayBaseCol(wi * 6);
      head[weekBandR][c] = weekLabel(weeks[wi].monday, weeks[wi].saturday);
      merges.push({ s: { r: weekBandR, c }, e: { r: weekBandR, c: c + 6 * COLS_PER_DAY - 1 } });
    }
  }

  // Day band: "Lun 05/05" over that day's 3 columns; then the sub-headers.
  for (let p = 0; p < days.length; p++) {
    const c = dayBaseCol(p);
    head[dayBandR][c] = `${DAY_LABELS[p % 6]} ${dm(days[p])}`;
    merges.push({ s: { r: dayBandR, c }, e: { r: dayBandR, c: c + COLS_PER_DAY - 1 } });
    head[subR][c] = "Actividad";
    head[subR][c + 1] = "Costo unitario";
    head[subR][c + 2] = "Costo";
  }

  const aoa: (string | number)[][] = [...head];

  // ── One row per roster worker ──────────────────────────────────────────────
  let grandTotal = 0;
  for (let idx = 0; idx < workers.length; idx++) {
    const w = workers[idx];
    const row: (string | number)[] = Array(width).fill("");
    row[0] = idx + 1;
    row[1] = w.fullName;
    for (let p = 0; p < days.length; p++) {
      const [actividad, costoUnit, costo] = dayTriple(grid.cells.get(cellKey(w.id, days[p])));
      const c = dayBaseCol(p);
      row[c] = actividad;
      row[c + 1] = costoUnit;
      row[c + 2] = costo;
    }
    const total = grid.workerTotals.get(w.id) ?? 0;
    row[totalCol] = total;
    grandTotal += total;
    aoa.push(row);
  }

  // Grand-total footer row.
  const footer: (string | number)[] = Array(width).fill("");
  footer[1] = "Total";
  footer[totalCol] = grandTotal;
  aoa.push(footer);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;

  // Column widths: "#", name, then (Actividad, Costo unitario, Costo) per day, Total.
  ws["!cols"] = [
    { wch: 4 },
    { wch: 26 },
    ...days.flatMap(() => [{ wch: 24 }, { wch: 13 }, { wch: 12 }]),
    { wch: 13 },
  ];

  // Money format on every numeric cell (Costo unitario, Costo, per-worker Total,
  // grand total). Text cells — labels, multi-activity stacks — are left as-is.
  for (let r = headerRows; r < aoa.length; r++) {
    for (let c = 2; c <= totalCol; c++) {
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
      unitPrice: true,
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
