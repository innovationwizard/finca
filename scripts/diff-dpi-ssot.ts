// =============================================================================
// scripts/diff-dpi-ssot.ts — ANALYSIS ONLY (no writes). Find rows in the SSOT
// DPI_Finca.csv whose CUI is not yet a worker in the DB (the "additional row").
// CUI/apellidos/nombres are trusted canon — captured verbatim, never re-cased.
//   npx dotenv -e .env.local -- npx tsx scripts/diff-dpi-ssot.ts
// =============================================================================

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CSV = "SSOT-DO-NOT-UPDATE/DPI_Finca.csv";

// RFC-style CSV parse (handles quoted fields with embedded commas/quotes).
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  text = text.replace(/^﻿/, ""); // strip BOM
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

(async () => {
  const rows = parseCSV(readFileSync(CSV, "utf8"));
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const ci = idx("cui"), ai = idx("apellidos"), ni = idx("nombres");
  if (ci < 0) throw new Error("No se encontró columna 'cui' en el header");

  const data = rows.slice(1).filter((r) => (r[ci] ?? "").trim() !== "");
  console.log(`Filas de datos en CSV: ${data.length}`);

  const dbCuis = new Set((await prisma.worker.findMany({ select: { cui: true } })).map((w) => w.cui));
  console.log(`Trabajadores en BD: ${dbCuis.size}`);

  const csvCuis = new Set<string>();
  const dups: string[] = [];
  for (const r of data) { const c = r[ci].trim(); if (csvCuis.has(c)) dups.push(c); csvCuis.add(c); }
  if (dups.length) console.log(`⚠ CUIs duplicados dentro del CSV: ${dups.join(", ")}`);

  const newRows = data.filter((r) => !dbCuis.has(r[ci].trim()));
  const inDbNotCsv = [...dbCuis].filter((c) => !csvCuis.has(c));

  console.log(`\nCSV con CUI que NO está en la BD: ${newRows.length}`);
  for (const r of newRows) {
    console.log("  ── fila nueva ──");
    header.forEach((h, j) => console.log(`     ${h}: ${JSON.stringify(r[j] ?? "")}`));
    console.log(`     → fullName se guardaría como: "${(r[ni] ?? "").trim()} ${(r[ai] ?? "").trim()}"`);
  }
  console.log(`\nBD con CUI que NO está en el CSV (informativo): ${inDbNotCsv.length}`);
  console.log("(análisis sin escritura — nada se modificó)");
  await prisma.$disconnect();
})();
