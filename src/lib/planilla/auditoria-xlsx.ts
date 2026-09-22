// =============================================================================
// src/lib/planilla/auditoria-xlsx.ts — the "Excel Auditoría" workbook
// One builder, two callers: the CLOSED-period download on Planillas Anteriores
// (api/planilla/auditoria) and the OPEN-period one on Revisión y Autorización
// (api/planilla/auditoria/abierto). Sharing the builder is the point — an audit
// file whose layout depended on which button produced it could not be compared
// against itself across a period close.
//
// Each sheet carries TWO blocks:
//   · Bloque 1 — Detalle diario: one row per activity record (the same ledger
//     "Descargar Excel Diario" produces).
//   · Bloque 2 — Resumen por trabajador: one row per worker with the
//     period-level money that has no per-record existence — Devengado, Séptimos,
//     Adicionales, Anticipos, Descuentos, Total a pagar — plus the audit notes.
//
// Why two blocks and not extra columns on the ledger: Descuentos, Adicionales
// and Anticipos are stored ONCE per worker per period on payroll_entries. On a
// per-record ledger they could only be repeated (making every column sum wrong
// by the row count) or left blank after the first row (voids). Stacking the two
// grains keeps every figure present exactly once and every column summable.
//
// Both blocks are scoped by payPeriodId, so the ledger total EQUALS the Bloque 2
// devengado. Deliberately not the by-date sweep of the Diario export: that pulls
// whole Mon–Sáb weeks, including days owned by the neighbouring period — money
// already paid there, which would make the two totals disagree.
// =============================================================================

import { PrismaClient, Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { unitAbbr } from "@/lib/utils/format";
import { dm, dmy, periodWeeks, activityLabel, isoUTC, dayMsUTC, type Week } from "@/lib/planilla/history";
import { buildSeptimoReport } from "@/lib/planilla/septimo-semanal";

type Db = PrismaClient | Prisma.TransactionClient;

const MONEY_FMT = "#,##0.00";
const money = (n: number): number => Math.round(n * 100) / 100;

/** The period this workbook covers. `isClosed` decides the provisional stamp. */
export type AuditPeriod = {
  id: string;
  periodNumber: number;
  startDate: Date;
  endDate: Date;
  isClosed: boolean;
};

// Excel sheet names: ≤31 chars, and none of : \\ / ? * [ ]. dm() uses "/", so
// swap it for "." here. The week index keeps names unique within the workbook.
// Named from the week's CLIPPED days, not its Monday/Saturday: the first and
// last weeks of a period usually start or end mid-week, and a tab reading
// "10.08-15.08" over a sheet that holds 12.08–15.08 promises days it does not
// contain.
const sheetName = (w: Week): string => {
  const from = w.days[0];
  const to = w.days[w.days.length - 1];
  return `Sem ${w.index + 1} ${dm(from).replace("/", ".")}-${dm(to).replace("/", ".")}`;
};

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

// Column order follows the net-pay formula in @/lib/utils/calculations:
//   Devengado + Séptimos + Adicionales − Anticipos − Descuentos = Total a pagar
// so a reviewer can verify each row left to right. The three notes sit at the
// end because payroll requires one whenever its amount is non-zero.
const SUMMARY_HEADER = [
  "#",
  "Trabajador",
  "Devengado (actividades)",
  "Séptimos",
  "Adicionales",
  "Anticipos",
  "Descuentos",
  "Total a pagar",
  "Séptimo calculado",
  "Diferencia séptimo",
  "Nota adicionales",
  "Nota anticipos",
  "Nota descuentos",
];

// Money columns of each block (0-based), for the number format.
const LEDGER_MONEY_COLS = [5, 7, 8];
const SUMMARY_MONEY_COLS = [2, 3, 4, 5, 6, 7, 8, 9];

/** What payroll stored for one worker over the whole period, summed across categories. */
type SummaryRow = {
  workerId: string;
  name: string;
  devengado: number;
  septimos: number;
  adicionales: number;
  anticipos: number;
  descuentos: number;
  totalToPay: number;
  septimoCalculado: number;
  diferencia: number;
  notaAdicionales: string;
  notaAnticipos: string;
  notaDescuentos: string;
};

type Cell = string | number;

/**
 * One worksheet: the ledger for `records`, then a blank row, then the per-worker
 * period summary. The period-level money has no weekly breakdown to clip to a
 * week, so repeating Bloque 2 on every sheet would double-count across tabs:
 * only the "Período completo" sheet (or the sole sheet of a one-week period)
 * carries it, and the weekly sheets get the ledger alone.
 */
function buildSheet(
  records: LedgerRecord[],
  workerName: Map<string, string>,
  summary: SummaryRow[] | null,
): XLSX.WorkSheet {
  const isoOf = (d: Date) => d.toISOString().slice(0, 10);
  const rows = [...records].sort((a, b) => {
    const byDate = isoOf(a.date).localeCompare(isoOf(b.date));
    if (byDate) return byDate;
    const byWorker = (workerName.get(a.workerId) ?? "").localeCompare(workerName.get(b.workerId) ?? "", "es");
    if (byWorker) return byWorker;
    return activityLabel(a.activity.shortName, a.activity.name).localeCompare(activityLabel(b.activity.shortName, b.activity.name), "es");
  });

  const aoa: Cell[][] = [];
  const moneyCells: { r: number; c: number }[] = [];

  // ── Bloque 1 ───────────────────────────────────────────────────────────────
  aoa.push(["BLOQUE 1 — DETALLE DIARIO (una fila por registro de actividad)"]);
  const ledgerHeaderRow = aoa.length;
  aoa.push([...LEDGER_HEADER]);
  let grandTotal = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const total = Number(r.totalEarned);
    grandTotal += total;
    for (const c of LEDGER_MONEY_COLS) moneyCells.push({ r: aoa.length, c });
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
  moneyCells.push({ r: aoa.length, c: 8 });
  aoa.push(["", "", "", "", "Total", "", "", "", money(grandTotal)]);

  // ── Bloque 2 ───────────────────────────────────────────────────────────────
  let summaryHeaderRow = -1;
  if (summary) {
    aoa.push([]); // one blank row separating the two grains
    aoa.push(["BLOQUE 2 — RESUMEN POR TRABAJADOR (totales del período, no del día)"]);
    summaryHeaderRow = aoa.length;
    aoa.push([...SUMMARY_HEADER]);

    const t = {
      devengado: 0, septimos: 0, adicionales: 0, anticipos: 0,
      descuentos: 0, totalToPay: 0, septimoCalculado: 0, diferencia: 0,
    };
    for (let i = 0; i < summary.length; i++) {
      const s = summary[i];
      t.devengado += s.devengado;
      t.septimos += s.septimos;
      t.adicionales += s.adicionales;
      t.anticipos += s.anticipos;
      t.descuentos += s.descuentos;
      t.totalToPay += s.totalToPay;
      t.septimoCalculado += s.septimoCalculado;
      t.diferencia += s.diferencia;
      for (const c of SUMMARY_MONEY_COLS) moneyCells.push({ r: aoa.length, c });
      aoa.push([
        i + 1,
        s.name,
        s.devengado,
        s.septimos,
        s.adicionales,
        s.anticipos,
        s.descuentos,
        s.totalToPay,
        s.septimoCalculado,
        s.diferencia,
        s.notaAdicionales,
        s.notaAnticipos,
        s.notaDescuentos,
      ]);
    }
    for (const c of SUMMARY_MONEY_COLS) moneyCells.push({ r: aoa.length, c });
    aoa.push([
      "", "TOTAL",
      money(t.devengado), money(t.septimos), money(t.adicionales),
      money(t.anticipos), money(t.descuentos), money(t.totalToPay),
      money(t.septimoCalculado), money(t.diferencia),
      "", "", "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Widths: the wider of the two blocks' needs, column by column.
  ws["!cols"] = [
    { wch: 5 }, { wch: 26 }, { wch: 24 }, { wch: 16 }, { wch: 28 },
    { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
    { wch: 30 }, { wch: 30 }, { wch: 30 },
  ];

  // Bold the two block titles and both header rows.
  const bold = (r: number, cols: number) => {
    for (let c = 0; c < cols; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.s = { font: { bold: true } };
    }
  };
  bold(0, 1);
  bold(ledgerHeaderRow, LEDGER_HEADER.length);
  if (summaryHeaderRow >= 0) {
    bold(summaryHeaderRow - 1, 1);
    bold(summaryHeaderRow, SUMMARY_HEADER.length);
  }

  for (const { r, c } of moneyCells) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (cell && typeof cell.v === "number") cell.z = MONEY_FMT;
  }

  // Freeze the ledger header so long periods stay readable while scrolling.
  ws["!freeze"] = { xSplit: "0", ySplit: String(ledgerHeaderRow + 1) };

  return ws;
}

/** Strip a worker name down to a filename-safe ASCII token. */
export function fileToken(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export type AuditWorkbook = { buffer: Buffer; filename: string };

/**
 * Build the whole workbook for one period. `workerId` optionally narrows it to a
 * single worker (the pages' ?trabajador= filter).
 *
 * An OPEN period is exported exactly like a closed one, with one difference: the
 * Información sheet says so, in full, with the time of day. The numbers of an
 * open period move — captures land daily and adjustments are still editable —
 * and a provisional file that looks identical to a final one is the thing that
 * gets forwarded and acted on weeks later.
 */
export async function buildAuditoriaWorkbook(
  db: Db,
  period: AuditPeriod,
  workerId?: string,
  now: Date = new Date(),
): Promise<AuditWorkbook> {
  // The Mon–Sáb weeks the period spans, each clipped to the period's own dates:
  // a week sheet shows only the days this period actually paid for, matching
  // the record scope below.
  const startIso = isoUTC(dayMsUTC(period.startDate));
  const endIso = isoUTC(dayMsUTC(period.endDate));
  const weeks = periodWeeks(period.startDate, period.endDate)
    .map((w) => ({ ...w, days: w.days.filter((d) => d >= startIso && d <= endIso) }))
    .filter((w) => w.days.length > 0); // a week wholly outside the period has nothing to show

  const records = await db.activityRecord.findMany({
    where: { payPeriodId: period.id },
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

  // Full active roster, then the optional single-worker filter.
  const roster = await db.worker.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  const selectedWorker = workerId && roster.some((w) => w.id === workerId) ? workerId : "";
  const workers = selectedWorker ? roster.filter((w) => w.id === selectedWorker) : roster;
  const workerName = new Map(workers.map((w) => [w.id, w.fullName]));

  // ── Bloque 2 source: payroll_entries for the period ────────────────────────
  // (period, worker, category) is unique, so a worker may hold more than one
  // entry (VOLUNTARIO + FIJO): sum across them rather than assuming one row.
  // A worker on the roster with no entry yields an explicit all-zero row — the
  // "no voids" requirement: absence is written as 0.00, never left blank.
  const entries = await db.payrollEntry.findMany({
    where: { payPeriodId: period.id, ...(selectedWorker ? { workerId: selectedWorker } : {}) },
    select: {
      workerId: true,
      totalEarned: true,
      seventhDayPay: true,
      bonification: true,
      advances: true,
      deductions: true,
      bonificationNote: true,
      advancesNote: true,
      deductionsNote: true,
      totalToPay: true,
      worker: { select: { fullName: true } },
    },
  });

  // The séptimo reconciliation (calculado vs. planilla) — the same view model
  // the "Excel Séptimos" download uses, so the two files never disagree.
  const septimoReport = await buildSeptimoReport(db, period, selectedWorker || undefined);
  const septimoByWorker = new Map(septimoReport.rows.map((r) => [r.workerId, r]));

  const joinNotes = (parts: (string | null)[]): string => {
    const kept = parts.map((p) => (p ?? "").trim()).filter(Boolean);
    return kept.length ? kept.join(" · ") : "—";
  };

  const byWorker = new Map<string, SummaryRow>();
  const blank = (id: string, name: string): SummaryRow => ({
    workerId: id, name, devengado: 0, septimos: 0, adicionales: 0, anticipos: 0,
    descuentos: 0, totalToPay: 0, septimoCalculado: 0, diferencia: 0,
    notaAdicionales: "—", notaAnticipos: "—", notaDescuentos: "—",
  });

  const notesOf = new Map<string, { adic: (string | null)[]; ant: (string | null)[]; desc: (string | null)[] }>();
  for (const e of entries) {
    const row = byWorker.get(e.workerId) ?? blank(e.workerId, e.worker.fullName);
    row.devengado += Number(e.totalEarned);
    row.septimos += Number(e.seventhDayPay);
    row.adicionales += Number(e.bonification);
    row.anticipos += Number(e.advances);
    row.descuentos += Number(e.deductions);
    row.totalToPay += Number(e.totalToPay);
    byWorker.set(e.workerId, row);

    const n = notesOf.get(e.workerId) ?? { adic: [], ant: [], desc: [] };
    n.adic.push(e.bonificationNote);
    n.ant.push(e.advancesNote);
    n.desc.push(e.deductionsNote);
    notesOf.set(e.workerId, n);
  }

  // Every worker in scope gets a row, entry or not — completeness over brevity.
  for (const w of workers) if (!byWorker.has(w.id)) byWorker.set(w.id, blank(w.id, w.fullName));

  const summary = [...byWorker.values()].map((row) => {
    const n = notesOf.get(row.workerId);
    const sr = septimoByWorker.get(row.workerId);
    return {
      ...row,
      devengado: money(row.devengado),
      septimos: money(row.septimos),
      adicionales: money(row.adicionales),
      anticipos: money(row.anticipos),
      descuentos: money(row.descuentos),
      totalToPay: money(row.totalToPay),
      septimoCalculado: money(sr?.septimoCalculado ?? 0),
      diferencia: money((sr?.septimoCalculado ?? 0) - row.septimos),
      notaAdicionales: n ? joinNotes(n.adic) : "—",
      notaAnticipos: n ? joinNotes(n.ant) : "—",
      notaDescuentos: n ? joinNotes(n.desc) : "—",
    };
  });
  summary.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const wb = XLSX.utils.book_new();
  const scoped = records.filter((r) => workerName.has(r.workerId));

  for (const w of weeks) {
    const daySet = new Set(w.days);
    const weekRecords = scoped.filter((r) => daySet.has(r.date.toISOString().slice(0, 10)));
    XLSX.utils.book_append_sheet(
      wb,
      buildSheet(weekRecords, workerName, weeks.length > 1 ? null : summary),
      sheetName(w),
    );
  }
  if (weeks.length > 1) {
    XLSX.utils.book_append_sheet(wb, buildSheet(scoped, workerName, summary), "Período completo");
  }

  // ── Información: provenance ────────────────────────────────────────────────
  // Which period, which dates, and — the question an open-period export must
  // answer before any other — whether these numbers are final.
  const todayIso = isoUTC(dayMsUTC(now));
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const info: Cell[][] = [
    ["Auditoría de planilla"],
    [],
    ["Período", period.periodNumber],
    ["Desde", dmy(startIso)],
    ["Hasta", dmy(endIso)],
    [
      "Estado",
      period.isClosed
        ? "CERRADO — cifras definitivas"
        : "ABIERTO — cifras PROVISIONALES: pueden cambiar hasta que se autorice el pago",
    ],
    ["Trabajadores", selectedWorker ? (workerName.get(selectedWorker) ?? "") : "Todos"],
    ["Séptimo configurado", septimoReport.amount],
    ["Generado", `${dmy(todayIso)} ${hhmm}`],
    [],
    ["Fórmula", "Devengado + Séptimos + Adicionales − Anticipos − Descuentos = Total a pagar"],
    ["Alcance", "Solo los registros de este período. El total del detalle diario es igual al devengado del resumen."],
  ];

  if (!period.isClosed) {
    // A week whose Saturday has not arrived is UNDECIDED, not lost: its séptimo
    // is still earnable. Listing those weeks stops a reader from reading a 0.00
    // as a worker having forfeited it. (Same rule the Revisión screen applies.)
    const pending = septimoReport.weeks.filter((w) => w.ownsSeptimo && w.saturday > todayIso);
    info.push([]);
    info.push(["Semanas en curso", pending.length === 0
      ? "Ninguna: todas las semanas del período ya cerraron su sábado."
      : pending.map((w) => `${dm(w.monday)}–${dm(w.saturday)}`).join(", "),
    ]);
    info.push([
      "Nota",
      "En las semanas en curso el séptimo aún no está definido: un 0.00 significa que el sábado no ha llegado, no que se haya perdido.",
    ]);
  }

  const infoWs = XLSX.utils.aoa_to_sheet(info);
  infoWs["!cols"] = [{ wch: 22 }, { wch: 96 }];
  XLSX.utils.book_append_sheet(wb, infoWs, "Información");

  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const workerSuffix = selectedWorker
    ? `-${fileToken(roster.find((w) => w.id === selectedWorker)!.fullName)}`
    : "";
  // An open period's file is stamped "provisional" in its NAME too: the filename
  // is what survives in an inbox long after the sheet is forgotten.
  const estado = period.isClosed ? "" : "-provisional";
  const filename = `planilla-auditoria-${period.periodNumber}-${startIso}-${endIso}${estado}${workerSuffix}.xlsx`;

  return { buffer, filename };
}
