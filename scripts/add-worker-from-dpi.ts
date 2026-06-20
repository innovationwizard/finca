// =============================================================================
// scripts/add-worker-from-dpi.ts — Add the worker(s) present in the SSOT
// DPI_Finca.csv but not yet in the DB, matching the established import shape:
//   Worker (golden record) + WorkerDocument(type DPI) + DpiDocument (provenance).
//
// SSOT is trusted canon: cui/apellidos/nombres captured VERBATIM, never re-cased
// or formula-validated. Reads the CSV at runtime (no PII baked into this file;
// the SSOT dir is gitignored). Idempotent: skips any CUI already in the DB.
// Dry-run by default, --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/add-worker-from-dpi.ts [--commit]
// =============================================================================

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.slice(2).includes("--commit");
const CSV = "SSOT-DO-NOT-UPDATE/DPI_Finca.csv";

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const toDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);

(async () => {
  console.log(`\n=== add worker(s) from ${CSV} — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  const rows = parseCSV(readFileSync(CSV, "utf8"));
  const header = rows[0].map((h) => h.trim());
  const I = (n: string) => header.indexOf(n);
  const ci = I("cui");
  const get = (r: string[], n: string) => { const j = I(n); const v = j >= 0 ? (r[j] ?? "").trim() : ""; return v === "" ? null : v; };

  const data = rows.slice(1).filter((r) => (r[ci] ?? "").trim() !== "");
  const dbCuis = new Set((await prisma.worker.findMany({ select: { cui: true } })).map((w) => w.cui));
  const newRows = data.filter((r) => !dbCuis.has(r[ci].trim()));

  if (newRows.length === 0) { console.log("No hay filas nuevas. (idempotente)"); await prisma.$disconnect(); return; }

  try {
    await prisma.$transaction(async (tx) => {
      for (const r of newRows) {
        const cui = r[ci].trim();
        const apellidos = get(r, "apellidos");
        const nombres = get(r, "nombres");
        if (!apellidos || !nombres) throw new Error(`ABORT: fila CUI=${cui} sin apellidos/nombres`);
        const fullName = `${nombres} ${apellidos}`;

        const worker = await tx.worker.create({
          data: {
            cui, apellidos, nombres, fullName,
            fechaNacimiento: toDate(get(r, "fecha_nacimiento")),
            sexo: get(r, "sexo"),
            nacionalidad: get(r, "nacionalidad"),
            lugarNacimiento: get(r, "lugar_nacimiento"),
            vecindad: get(r, "vecindad"),
            pueblo: get(r, "pueblo"),
            comunidadLinguistica: get(r, "comunidad_linguistica"),
            estadoCivil: get(r, "estado_civil"),
            // app-managed defaults: category VOLUNTARIO, isActive true, etc.
          },
          select: { id: true },
        });

        const confRaw = get(r, "extraction_confidence");
        const conf = confRaw != null && Number.isFinite(Number(confRaw)) ? Number(confRaw) : null;
        const pageRaw = get(r, "page");
        const page = pageRaw != null && Number.isFinite(Number(pageRaw)) ? Number(pageRaw) : null;

        const doc = await tx.workerDocument.create({
          data: {
            workerId: worker.id,
            type: "DPI",
            cuiAsPrinted: cui,
            extractionConfidence: conf,
            notes: get(r, "notes"),
            sourceFile: "DPI_Finca.csv",
            sourcePage: page,
          },
          select: { id: true },
        });

        await tx.dpiDocument.create({
          data: {
            documentId: doc.id,
            fechaVencimiento: toDate(get(r, "fecha_vencimiento")),
            apellidos, nombres,
            fechaNacimiento: toDate(get(r, "fecha_nacimiento")),
            sexo: get(r, "sexo"),
            nacionalidad: get(r, "nacionalidad"),
            lugarNacimiento: get(r, "lugar_nacimiento"),
            vecindad: get(r, "vecindad"),
            pueblo: get(r, "pueblo"),
            comunidadLinguistica: get(r, "comunidad_linguistica"),
            estadoCivil: get(r, "estado_civil"),
          },
        });

        console.log(`CREATE ${fullName} | CUI ${cui} | worker+DPI doc+DpiDocument`);
      }
      if (!COMMIT) throw new RollbackSignal();
    });
  } catch (e) {
    if (e instanceof RollbackSignal) console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    else { console.error("\nFAILED (sin cambios):", e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1); }
  }
  await prisma.$disconnect();
})();
