// =============================================================================
// src/lib/planilla/septimo-xlsx.ts — "Séptimos por semana" as a worksheet
// The sheet behind the "Descargar Excel Séptimos" button, kept out of the route
// so it can be exercised without booting Next (see
// scripts/septimo-audit-semanal.ts for the CSV shape it mirrors).
// =============================================================================

import * as XLSX from "xlsx";
import {
  septimoTotals,
  weekGroupHeader,
  WEEK_SUB_HEADERS,
  TRAILING_HEADERS,
  type SeptimoReport,
} from "@/lib/planilla/septimo-semanal";

const MONEY_FMT = "#,##0.00";
const COLS_PER_WEEK = 3;

/**
 * One sheet: a two-row header stack (week band over its three sub-headers),
 * one row per worker, then a TOTAL footer. A week whose Saturday falls outside
 * the period has no séptimo cell — it is paid in the period that owns it — so
 * those cells are left blank rather than written as 0.
 */
export function buildSeptimoSheet(report: SeptimoReport): XLSX.WorkSheet {
  const { weeks, rows } = report;
  const totals = septimoTotals(report);
  const trailingStart = 1 + weeks.length * COLS_PER_WEEK;
  const width = trailingStart + TRAILING_HEADERS.length;
  const merges: XLSX.Range[] = [];

  // ── Header stack ──────────────────────────────────────────────────────────
  const head: (string | number)[][] = [Array(width).fill(""), Array(width).fill("")];
  head[0][0] = "Nombre completo";
  merges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } });
  weeks.forEach((w, i) => {
    const c = 1 + i * COLS_PER_WEEK;
    head[0][c] = weekGroupHeader(w);
    merges.push({ s: { r: 0, c }, e: { r: 0, c: c + COLS_PER_WEEK - 1 } });
    WEEK_SUB_HEADERS.forEach((h, j) => { head[1][c + j] = h; });
  });
  TRAILING_HEADERS.forEach((h, j) => {
    head[0][trailingStart + j] = h;
    merges.push({ s: { r: 0, c: trailingStart + j }, e: { r: 1, c: trailingStart + j } });
  });

  const aoa: (string | number)[][] = [...head];

  // ── One row per worker ────────────────────────────────────────────────────
  for (const r of rows) {
    const row: (string | number)[] = Array(width).fill("");
    row[0] = r.workerName;
    r.cells.forEach((c, i) => {
      const base = 1 + i * COLS_PER_WEEK;
      row[base] = c.actividades;
      if (c.septimo !== null) row[base + 1] = c.septimo;
      row[base + 2] = c.total;
    });
    row[trailingStart] = r.septimoCalculado;
    row[trailingStart + 1] = r.septimoPlanilla;
    row[trailingStart + 2] = r.diferencia;
    aoa.push(row);
  }

  // ── TOTAL footer ──────────────────────────────────────────────────────────
  const footer: (string | number)[] = Array(width).fill("");
  footer[0] = "TOTAL";
  totals.perWeek.forEach((t, i) => {
    const base = 1 + i * COLS_PER_WEEK;
    footer[base] = t.actividades;
    if (t.septimo !== null) footer[base + 1] = t.septimo;
    footer[base + 2] = t.total;
  });
  footer[trailingStart] = totals.septimoCalculado;
  footer[trailingStart + 1] = totals.septimoPlanilla;
  footer[trailingStart + 2] = totals.diferencia;
  aoa.push(footer);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 36 }, ...Array.from({ length: width - 1 }, () => ({ wch: 14 }))];

  // Money format on every numeric cell below the header stack.
  for (let r = head.length; r < aoa.length; r++) {
    for (let c = 1; c < width; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = MONEY_FMT;
    }
  }

  return ws;
}
