// =============================================================================
// src/lib/xlsx/extract-planilla-xlsx.ts
//
// Adapts the resilient .xlsx parser to the SAME extraction contract the photo
// path returns (PlanillaExtractionResult), so /api/planilla/process-planilla and
// the whole downstream review pipeline are reused unchanged. Adds formatReport /
// anomalies / counts for the review UI and audit trail.
// =============================================================================

import type { PlanillaExtractionResult } from "@/lib/ai/extract-planilla";
import {
  parsePlanillaWorkbook,
  type Vocab,
  type FormatReport,
  type Anomalies,
  type ParseCounts,
} from "./parse-planilla";

export type PlanillaXlsxResult = PlanillaExtractionResult & {
  formatReport: FormatReport;
  anomalies: Anomalies;
  counts: ParseCounts;
};

function deriveConfidence(report: FormatReport, counts: ParseCounts): "high" | "medium" | "low" {
  if (counts.entries === 0 || report.missingRoles.length > 0) return "low";
  if (report.driftDetected || counts.flagged > 0 || counts.incomplete > 0 || counts.unparseable > 0) return "medium";
  return "high";
}

function buildNotes(report: FormatReport, counts: ParseCounts): string {
  const parts: string[] = [];
  parts.push(`Hoja: "${report.sheetChosen}".`);
  parts.push(
    `${counts.contentRows} fila(s) leídas = ${counts.entries} registro(s)` +
      (counts.flagged ? ` (${counts.flagged} marcadas)` : "") +
      ` + ${counts.ignored} ignorada(s) + ${counts.incomplete} incompleta(s) + ${counts.unparseable} sin clasificar.`,
  );
  if (!counts.balanced) parts.push("⚠ El conteo de filas NO cuadra — revisión manual obligatoria.");
  if (report.missingRoles.length) parts.push(`Columnas faltantes: ${report.missingRoles.join(", ")}.`);
  if (report.driftDetected) parts.push(`Formato modificado: ${report.driftReasons.join(" ")}`);
  return parts.join(" ");
}

export function extractPlanillaFromXlsx(buffer: Buffer | ArrayBuffer, vocab: Vocab): PlanillaXlsxResult {
  const parsed = parsePlanillaWorkbook(buffer, vocab);

  const rows = parsed.rows.map((r) => ({
    workerName: r.workerName,
    entries: r.entries.map((e) => ({
      date: e.date,
      lote: e.lote,
      activity: e.activity,
      units: e.units,
    })),
  }));

  return {
    rows,
    dateRange: parsed.dateRange,
    confidence: deriveConfidence(parsed.formatReport, parsed.counts),
    notes: buildNotes(parsed.formatReport, parsed.counts),
    formatReport: parsed.formatReport,
    anomalies: parsed.anomalies,
    counts: parsed.counts,
  };
}
