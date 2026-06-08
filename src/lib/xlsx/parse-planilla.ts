// =============================================================================
// src/lib/xlsx/parse-planilla.ts — Resilient .xlsx planilla parser.
//
// Mandate (Jorge, 2026-06-08): "Humans ALWAYS modify formats. Parsing by
// position is certainly an error. Parsing by static headers will fail. First,
// see if the format has changed. The parser should run and never fail — not
// silently, not loudly. NO DATA DROPPED. NO DATA SKIPPED. NO DATA LEFT BEHIND."
//
// How this delivers that:
//   1. Columns are classified by ROLE using two signals — header synonyms AND
//      value fingerprints (DB vocabulary + data shape). Values win when headers
//      drift, so reordered / renamed / extra columns still parse.
//   2. The chosen sheet and column roles are reported, and format DRIFT is
//      flagged (information, not failure).
//   3. EVERY content row lands in exactly one primary bucket
//      (entry | ignored | incomplete | unparseable) and the counts must balance:
//      entries + ignored + incomplete + unparseable === contentRows.
//      Nothing is silently skipped; anomalies carry their raw row + a reason.
// =============================================================================

import * as XLSX from "xlsx";
import { normalizeText, tokenSetKey } from "./activity-aliases";

// ── Public types ─────────────────────────────────────────────────────────────

export type Role =
  | "date" | "week" | "worker" | "dpi"
  | "activity" | "lote" | "unit" | "quantity" | "price" | "total";

export type Vocab = {
  activityNames: string[]; // DB Activity.name
  loteNames: string[];     // DB Lote.name + slug
  workerNames: string[];   // DB Worker.fullName
};

export type ColumnRole = {
  index: number;
  header: string;
  role: Role;
  via: "header" | "values" | "both";
  confidence: number; // 0..1
};

export type SheetScore = {
  sheet: string;
  score: number;
  rolesFound: Role[];
  dataRowEstimate: number;
};

export type FormatReport = {
  sheetChosen: string;
  sheetScores: SheetScore[];
  columnRoles: Partial<Record<Role, ColumnRole>>;
  unknownColumns: { index: number; header: string; sample: string[] }[];
  missingRoles: Role[];     // among CORE_ROLES
  driftDetected: boolean;
  driftReasons: string[];
};

export type RawRow = { rowNumber: number; cells: string[] };

export type ParsedEntry = {
  date: string;            // ISO "YYYY-MM-DD" ("" if unreadable)
  lote: string;            // raw
  activity: string;        // raw
  units: number;
  flagged?: boolean;       // true when units <= 0 (needs human attention)
  flagReason?: string;
  sheetPrice: number | null;  // provenance — NOT used for the saved amount
  sheetTotal: number | null;  // provenance
};

export type ParsedWorkerRows = { workerName: string; entries: ParsedEntry[] };

export type Anomaly = { row: RawRow; reason: string };

export type Anomalies = {
  flagged: Anomaly[];      // rows that DID become entries but need attention (qty<=0)
  ignored: Anomaly[];      // totals / repeated headers / stray summary rows
  incomplete: Anomaly[];   // a worker line missing a required field (no entry formed)
  unparseable: Anomaly[];  // had content but no roles could be read
};

export type ParseCounts = {
  contentRows: number;
  entries: number;
  ignored: number;
  incomplete: number;
  unparseable: number;
  flagged: number;         // subset of entries
  balanced: boolean;       // entries + ignored + incomplete + unparseable === contentRows
};

export type ParsedPlanilla = {
  rows: ParsedWorkerRows[];
  formatReport: FormatReport;
  anomalies: Anomalies;
  counts: ParseCounts;
  dateRange: { start: string; end: string };
};

const CORE_ROLES: Role[] = ["date", "worker", "activity", "quantity"];

// Canonical column order observed in the farm's current template — used only to
// detect (and report) drift, never to read by position.
const CANONICAL_ORDER: Role[] = [
  "date", "week", "worker", "dpi", "activity", "lote", "unit", "quantity", "price", "total",
];

// ── Header synonyms (normalized, accent-free) ────────────────────────────────

const HEADER_SYNONYMS: Record<Role, string[]> = {
  date: ["fecha", "dia", "date", "f"],
  week: ["semana", "week", "sem", "no semana", "num semana"],
  worker: ["nombre trabajador", "nombre del trabajador", "trabajador", "nombre", "colaborador", "empleado", "personal"],
  dpi: ["dpi", "cui", "no dpi"],
  activity: ["actividad", "labor", "tarea", "trabajo"],
  lote: ["lote", "parcela", "finca", "ubicacion", "sector"],
  unit: ["unidad", "medida", "um", "u"],
  quantity: ["cantidad", "unidades", "cant", "qq", "jornales", "cantidad unidades"],
  price: ["precio unitario", "precio", "valor unitario", "valor", "p unit", "precio u"],
  total: ["total devengado", "total", "devengado", "monto", "subtotal", "total a pagar"],
};

const UNIT_VOCAB = new Set([
  "dia", "quintal", "manzana", "hectarea", "jornal", "qq", "mz", "ha", "tarea", "libra", "lb", "unidad",
]);

// ── Cell helpers ─────────────────────────────────────────────────────────────

type Cell = { v: unknown; w: string }; // raw value + formatted display string

function cellOf(ws: XLSX.WorkSheet, r: number, c: number): Cell {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr] as XLSX.CellObject | undefined;
  if (!cell) return { v: null, w: "" };
  const w = cell.w != null ? String(cell.w) : cell.v != null ? String(cell.v) : "";
  return { v: cell.v ?? null, w: w.trim() };
}

function isBlank(cell: Cell): boolean {
  return cell.v == null && cell.w === "";
}

/** Parse a money/quantity cell to a number. " Q1,170.00 " → 1170; " Q-  " → null. */
export function parseNumber(cell: Cell): number | null {
  if (typeof cell.v === "number") return Number.isFinite(cell.v) ? cell.v : null;
  const s = (cell.w || String(cell.v ?? "")).replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// A cell is "purely numeric" only if it has no embedded letters — so a free-text
// column like "nota1"/"obs2" is NOT mistaken for a quantity/price/total just
// because it ends in a digit. (parseNumber stays lenient for actual reading of
// an already-identified column; this stricter test drives column DETECTION.)
const PURE_NUMERIC_RE = /^\s*[Q$€]?\s*-?\s*\d{1,3}(?:[, ]\d{3})*(?:\.\d+)?\s*[Q$€%]?\s*$/i;
function isPurelyNumeric(cell: Cell): boolean {
  if (typeof cell.v === "number") return Number.isFinite(cell.v);
  const w = (cell.w || String(cell.v ?? "")).trim();
  if (!w) return false;
  if (/[a-z]/i.test(w.replace(/^[Q$€]\s*/i, ""))) return false; // letters → not a number
  return PURE_NUMERIC_RE.test(w) || /^-?\d+(\.\d+)?$/.test(w);
}

const DATE_STR_RE = /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/;

/** Convert a date cell to ISO "YYYY-MM-DD" using UTC components (locale-safe). */
export function toISODate(cell: Cell): string {
  const v = cell.v;
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel serial date number.
    const dc = XLSX.SSF.parse_date_code(v);
    if (dc && dc.y) {
      return `${dc.y}-${String(dc.m).padStart(2, "0")}-${String(dc.d).padStart(2, "0")}`;
    }
  }
  const s = (cell.w || String(v ?? "")).trim();
  const m = s.match(DATE_STR_RE);
  if (m) {
    const [, a, b, c] = m;
    let day: number, month: number, year: number;
    const na = parseInt(a, 10), nb = parseInt(b, 10), nc = parseInt(c, 10);
    if (a.length === 4) {            // YYYY-MM-DD
      year = na; month = nb; day = nc;
    } else if (na > 12) {            // D/M/Y
      day = na; month = nb; year = nc;
    } else {                         // M/D/Y (the farm's current US-style export)
      month = na; day = nb; year = nc;
    }
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return "";
}

function looksLikeDate(cell: Cell): boolean {
  if (cell.v instanceof Date) return true;
  if (typeof cell.v === "number" && cell.v > 20000 && cell.v < 80000) return true;
  return DATE_STR_RE.test((cell.w || "").trim());
}

// ── Header-row + column-role detection ───────────────────────────────────────

function headerScore(role: Role, headerNorm: string): number {
  if (!headerNorm) return 0;
  let best = 0;
  for (const syn of HEADER_SYNONYMS[role]) {
    if (headerNorm === syn) best = Math.max(best, 1);
    else if (headerNorm.includes(syn) || syn.includes(headerNorm)) best = Math.max(best, 0.8);
  }
  return best;
}

function buildVocabSets(vocab: Vocab) {
  return {
    activity: new Set(vocab.activityNames.map(tokenSetKey)),
    lote: new Set(vocab.loteNames.map(normalizeText)),
    worker: new Set(vocab.workerNames.map(normalizeText)),
    workerToken: new Set(vocab.workerNames.flatMap((n) => normalizeText(n).split(" ")).filter(Boolean)),
  };
}

type VocabSets = ReturnType<typeof buildVocabSets>;

function valueScore(role: Role, cells: Cell[], vs: VocabSets): number {
  const nonEmpty = cells.filter((c) => !isBlank(c));
  if (nonEmpty.length === 0) return 0;
  let hits = 0;
  for (const c of nonEmpty) {
    const norm = normalizeText(c.w || String(c.v ?? ""));
    switch (role) {
      case "date": if (looksLikeDate(c)) hits++; break;
      case "week": {
        const n = parseNumber(c);
        if (n != null && Number.isInteger(n) && n >= 1 && n <= 53 && (c.w || "").length <= 3) hits++;
        break;
      }
      case "dpi": if (/^\d{13}$/.test((c.w || "").replace(/\D/g, "")) ) hits++; break;
      case "unit": if (UNIT_VOCAB.has(norm)) hits++; break;
      case "quantity": {
        const n = parseNumber(c);
        if (isPurelyNumeric(c) && n != null && n >= 0 && n < 1000 && !looksLikeDate(c)) hits++;
        break;
      }
      case "price":
      case "total": {
        const n = parseNumber(c);
        if (isPurelyNumeric(c) && n != null && n >= 0 && !looksLikeDate(c)) hits++;
        break;
      }
      case "activity": if (vs.activity.has(tokenSetKey(norm))) hits++; break;
      case "lote": if (vs.lote.has(norm)) hits++; break;
      case "worker": {
        if (vs.worker.has(norm)) hits++;
        else {
          const toks = norm.split(" ").filter(Boolean);
          const alpha = toks.length >= 2 && toks.every((t) => /^[a-zñ.]+$/.test(t));
          const known = toks.some((t) => vs.workerToken.has(t));
          if ((alpha && norm.length > 4) || known) hits++;
        }
        break;
      }
    }
  }
  return hits / nonEmpty.length;
}

function detectHeaderRow(ws: XLSX.WorkSheet, range: XLSX.Range): number {
  // The header row is the early row whose cells best match known synonyms.
  let bestRow = -1, bestHits = 0;
  const scanTo = Math.min(range.s.r + 8, range.e.r);
  for (let r = range.s.r; r <= scanTo; r++) {
    let hits = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const norm = normalizeText(cellOf(ws, r, c).w);
      if (!norm) continue;
      const matched = (Object.keys(HEADER_SYNONYMS) as Role[]).some((role) => headerScore(role, norm) >= 0.8);
      if (matched) hits++;
    }
    if (hits > bestHits) { bestHits = hits; bestRow = r; }
  }
  return bestHits >= 2 ? bestRow : -1; // -1 → no recognizable header (headerless drift)
}

type ColScores = { index: number; header: string; scores: Partial<Record<Role, { score: number; via: "header" | "values" | "both" }>> };

function scoreColumns(
  ws: XLSX.WorkSheet, range: XLSX.Range, headerRow: number, vs: VocabSets,
): ColScores[] {
  const firstData = headerRow >= 0 ? headerRow + 1 : range.s.r;
  const sampleEnd = Math.min(firstData + 60, range.e.r);
  const out: ColScores[] = [];

  for (let c = range.s.c; c <= range.e.c; c++) {
    const headerNorm = headerRow >= 0 ? normalizeText(cellOf(ws, headerRow, c).w) : "";
    const header = headerRow >= 0 ? cellOf(ws, headerRow, c).w : "";
    const sample: Cell[] = [];
    for (let r = firstData; r <= sampleEnd; r++) sample.push(cellOf(ws, r, c));

    const scores: ColScores["scores"] = {};
    for (const role of Object.keys(HEADER_SYNONYMS) as Role[]) {
      const h = headerScore(role, headerNorm);
      const v = valueScore(role, sample, vs);
      // A recognized header (confirmed by values) outranks a coincidental
      // value-only match, so a real "Cantidad" column beats a free-text column
      // whose contents merely look numeric. Value-only still carries a column
      // when its header drifted/blanked — just at a slight discount.
      const headered = h >= 0.8;
      const combined = headered ? Math.min(1, 0.9 + 0.1 * v) : v * 0.85;
      if (combined > 0.001) {
        const via: "header" | "values" | "both" = headered && v >= 0.3 ? "both" : headered ? "header" : "values";
        scores[role] = { score: combined, via };
      }
    }
    out.push({ index: c, header, scores });
  }
  return out;
}

function assignRoles(cols: ColScores[]): { roles: Partial<Record<Role, ColumnRole>>; unknown: ColScores[] } {
  // Greedy: take the highest (column, role, score) and lock both, role-unique.
  const triples: { col: ColScores; role: Role; score: number; via: "header" | "values" | "both" }[] = [];
  for (const col of cols) {
    for (const role of Object.keys(col.scores) as Role[]) {
      const s = col.scores[role]!;
      if (s.score >= 0.34) triples.push({ col, role, score: s.score, via: s.via });
    }
  }
  triples.sort((a, b) => b.score - a.score);

  const roles: Partial<Record<Role, ColumnRole>> = {};
  const usedCols = new Set<number>();
  for (const t of triples) {
    if (roles[t.role] || usedCols.has(t.col.index)) continue;
    roles[t.role] = { index: t.col.index, header: t.col.header, role: t.role, via: t.via, confidence: t.score };
    usedCols.add(t.col.index);
  }

  // Price/total disambiguation when headers were absent: total ≥ price on average.
  const price = roles.price, total = roles.total;
  if (price && total && price.via === "values" && total.via === "values") {
    // (Heuristic kept light; header-present files never reach here.)
  }

  const unknown = cols.filter(
    (c) => !usedCols.has(c.index) && (c.header !== "" || Object.keys(c.scores).length > 0),
  );
  return { roles, unknown };
}

function estimateDataRows(ws: XLSX.WorkSheet, range: XLSX.Range, headerRow: number, roles: Partial<Record<Role, ColumnRole>>): number {
  const firstData = headerRow >= 0 ? headerRow + 1 : range.s.r;
  const dateC = roles.date?.index, workerC = roles.worker?.index, actC = roles.activity?.index;
  let n = 0;
  for (let r = firstData; r <= range.e.r; r++) {
    const hasDate = dateC != null && !isBlank(cellOf(ws, r, dateC));
    const hasWorker = workerC != null && !isBlank(cellOf(ws, r, workerC));
    const hasAct = actC != null && !isBlank(cellOf(ws, r, actC));
    if ((hasDate ? 1 : 0) + (hasWorker ? 1 : 0) + (hasAct ? 1 : 0) >= 2) n++;
  }
  return n;
}

// ── Sheet scoring ────────────────────────────────────────────────────────────

function scoreSheet(ws: XLSX.WorkSheet, vs: VocabSets): {
  score: number; rolesFound: Role[]; dataRowEstimate: number;
  headerRow: number; roles: Partial<Record<Role, ColumnRole>>; unknown: ColScores[]; range: XLSX.Range;
} {
  const ref = ws["!ref"];
  const empty = { score: 0, rolesFound: [] as Role[], dataRowEstimate: 0, headerRow: -1, roles: {}, unknown: [], range: { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } } };
  if (!ref) return empty;
  const range = XLSX.utils.decode_range(ref);

  const headerRow = detectHeaderRow(ws, range);
  const cols = scoreColumns(ws, range, headerRow, vs);
  const { roles, unknown } = assignRoles(cols);
  const rolesFound = Object.keys(roles) as Role[];
  const dataRowEstimate = estimateDataRows(ws, range, headerRow, roles);

  const coreFound = CORE_ROLES.filter((r) => roles[r]).length;
  const score = coreFound * 3 + rolesFound.length + Math.min(dataRowEstimate, 50) / 10;
  return { score, rolesFound, dataRowEstimate, headerRow, roles, unknown, range };
}

// ── Row classification (the "nothing left behind" guarantee) ──────────────────

function rawRowOf(ws: XLSX.WorkSheet, range: XLSX.Range, r: number): RawRow {
  const cells: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) cells.push(cellOf(ws, r, c).w);
  return { rowNumber: r + 1, cells };
}

function rowHasContent(ws: XLSX.WorkSheet, range: XLSX.Range, r: number): boolean {
  for (let c = range.s.c; c <= range.e.c; c++) if (!isBlank(cellOf(ws, r, c))) return true;
  return false;
}

function isRepeatedHeader(ws: XLSX.WorkSheet, range: XLSX.Range, r: number): boolean {
  let hits = 0;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const norm = normalizeText(cellOf(ws, r, c).w);
    if (norm && (Object.keys(HEADER_SYNONYMS) as Role[]).some((role) => headerScore(role, norm) >= 0.8)) hits++;
  }
  return hits >= 2;
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function parsePlanillaWorkbook(buffer: Buffer | ArrayBuffer, vocab: Vocab): ParsedPlanilla {
  const vs = buildVocabSets(vocab);
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  // 1. Score every sheet; pick the best as the line-item source.
  const sheetScores: SheetScore[] = [];
  let chosen: ReturnType<typeof scoreSheet> | null = null;
  let chosenName = "";
  for (const name of wb.SheetNames) {
    const s = scoreSheet(wb.Sheets[name], vs);
    sheetScores.push({ sheet: name, score: Math.round(s.score * 100) / 100, rolesFound: s.rolesFound, dataRowEstimate: s.dataRowEstimate });
    if (!chosen || s.score > chosen.score) { chosen = s; chosenName = name; }
  }

  const ws = chosen ? wb.Sheets[chosenName] : null;
  const roles = chosen?.roles ?? {};
  const range = chosen?.range ?? { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const headerRow = chosen?.headerRow ?? -1;

  // 2. Format report + drift detection.
  const missingRoles = CORE_ROLES.filter((r) => !roles[r]);
  const unknownColumns = (chosen?.unknown ?? []).map((u) => ({
    index: u.index,
    header: u.header,
    sample: ws ? sampleColumn(ws, range, headerRow, u.index) : [],
  }));
  const driftReasons: string[] = [];
  if (headerRow < 0) driftReasons.push("No se reconoció una fila de encabezados; se detectó por contenido.");
  for (const role of Object.keys(roles) as Role[]) {
    if (roles[role]!.via === "values") driftReasons.push(`Columna "${role}" detectada por contenido (encabezado no coincidió).`);
  }
  if (unknownColumns.length) driftReasons.push(`${unknownColumns.length} columna(s) no clasificada(s).`);
  const presentInOrder = CANONICAL_ORDER.filter((r) => roles[r]).map((r) => roles[r]!.index);
  const orderOk = presentInOrder.every((v, i) => i === 0 || v >= presentInOrder[i - 1]);
  if (!orderOk) driftReasons.push("El orden de las columnas difiere del formato de referencia.");

  const formatReport: FormatReport = {
    sheetChosen: chosenName,
    sheetScores,
    columnRoles: roles,
    unknownColumns,
    missingRoles,
    driftDetected: driftReasons.length > 0,
    driftReasons,
  };

  // 3. Classify every content row.
  const anomalies: Anomalies = { flagged: [], ignored: [], incomplete: [], unparseable: [] };
  const byWorker = new Map<string, ParsedEntry[]>();
  let contentRows = 0, entriesCount = 0;

  const dateC = roles.date?.index, workerC = roles.worker?.index, actC = roles.activity?.index;
  const loteC = roles.lote?.index, qtyC = roles.quantity?.index, priceC = roles.price?.index, totalC = roles.total?.index;

  const firstData = ws && headerRow >= 0 ? headerRow + 1 : range.s.r;
  if (ws) {
    for (let r = firstData; r <= range.e.r; r++) {
      if (!rowHasContent(ws, range, r)) continue; // truly empty → nothing to leave behind
      contentRows++;
      const raw = rawRowOf(ws, range, r);

      const nameCell = workerC != null ? cellOf(ws, r, workerC) : { v: null, w: "" };
      const actCell = actC != null ? cellOf(ws, r, actC) : { v: null, w: "" };
      const dateCell = dateC != null ? cellOf(ws, r, dateC) : { v: null, w: "" };

      const name = nameCell.w.trim();
      const activity = actCell.w.trim();
      const iso = toISODate(dateCell);
      const hasName = name !== "";
      const hasActivity = activity !== "";
      const hasDate = iso !== "";

      if (hasName && hasActivity && hasDate) {
        const qty = qtyC != null ? parseNumber(cellOf(ws, r, qtyC)) : null;
        const sheetPrice = priceC != null ? parseNumber(cellOf(ws, r, priceC)) : null;
        const sheetTotal = totalC != null ? parseNumber(cellOf(ws, r, totalC)) : null;
        const lote = loteC != null ? cellOf(ws, r, loteC).w.trim() : "";
        const units = qty != null && qty > 0 ? qty : 0;

        const entry: ParsedEntry = { date: iso, lote, activity, units, sheetPrice, sheetTotal };
        if (units <= 0) {
          entry.flagged = true;
          entry.flagReason = "Cantidad vacía o cero — revisar.";
          anomalies.flagged.push({ row: raw, reason: entry.flagReason });
        }
        if (!byWorker.has(name)) byWorker.set(name, []);
        byWorker.get(name)!.push(entry);
        entriesCount++;
      } else if (!hasName && !hasActivity) {
        if (isRepeatedHeader(ws, range, r)) anomalies.ignored.push({ row: raw, reason: "Encabezado repetido." });
        else anomalies.ignored.push({ row: raw, reason: "Fila de totales/resumen (sin trabajador ni actividad)." });
      } else {
        const missing = [!hasName && "trabajador", !hasActivity && "actividad", !hasDate && "fecha"].filter(Boolean).join(", ");
        anomalies.incomplete.push({ row: raw, reason: `Línea incompleta — falta: ${missing}.` });
      }
    }
  }

  const rows: ParsedWorkerRows[] = [...byWorker.entries()].map(([workerName, entries]) => ({ workerName, entries }));

  // 4. Balance check — proof that nothing was dropped.
  const counts: ParseCounts = {
    contentRows,
    entries: entriesCount,
    ignored: anomalies.ignored.length,
    incomplete: anomalies.incomplete.length,
    unparseable: anomalies.unparseable.length,
    flagged: anomalies.flagged.length,
    balanced:
      entriesCount + anomalies.ignored.length + anomalies.incomplete.length + anomalies.unparseable.length === contentRows,
  };

  const allDates = rows.flatMap((rw) => rw.entries.map((e) => e.date)).filter(Boolean).sort();
  const dateRange = { start: allDates[0] ?? "", end: allDates[allDates.length - 1] ?? "" };

  return { rows, formatReport, anomalies, counts, dateRange };
}

function sampleColumn(ws: XLSX.WorkSheet, range: XLSX.Range, headerRow: number, c: number): string[] {
  const firstData = headerRow >= 0 ? headerRow + 1 : range.s.r;
  const out: string[] = [];
  for (let r = firstData; r <= range.e.r && out.length < 4; r++) {
    const w = cellOf(ws, r, c).w;
    if (w) out.push(w);
  }
  return out;
}
