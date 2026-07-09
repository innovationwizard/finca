// =============================================================================
// scripts/sync-renap.ts — Sync prod to the (four-eyes-verified) SSOT file
// RENAP_Birth_Certificates_Finca.csv. CREATE workers whose CUI is absent, and
// UPDATE the RENAP-sourced fields of workers whose CUI is present (03 is
// add-only and can't apply edits). Identity captured VERBATIM. Fields NOT
// sourced from RENAP (isMinor, isActive, bank/nit/phone/photo) are never touched.
//
// Dry-run by default (transaction + rollback, prints per-row diffs). --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/sync-renap.ts [--commit]
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseCsv } from "./rebuild/lib/csv";
import { deriveFullName } from "../src/lib/validators/worker";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const nz = (s: string | undefined): string | null => { const v = (s ?? "").trim(); return v === "" ? null : v; };
const date = (s: string | undefined, field: string): Date | null => {
  const v = (s ?? "").trim();
  if (v === "") return null;
  if (!ISO.test(v)) throw new Error(`Unexpected date in ${field}: "${v}"`);
  return new Date(`${v}T00:00:00.000Z`);
};
const num = (s: string | undefined): number | null => { const v = (s ?? "").trim(); if (v === "") return null; const n = Number(v.replace("%", "")); return Number.isFinite(n) ? n : null; };
const int = (s: string | undefined): number | null => { const v = (s ?? "").trim(); if (v === "") return null; const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

(async () => {
  const rows = parseCsv(readFileSync(resolve("SSOT-DO-NOT-UPDATE", "RENAP_Birth_Certificates_Finca.csv"), "utf8"));
  console.log(`\n=== sync RENAP — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} — ${rows.length} file rows ===\n`);

  // CUI integrity (surface only; DB unique enforces).
  const cuis = rows.map((r) => (r.cui ?? "").trim());
  const dupes = cuis.filter((c, i) => c && cuis.indexOf(c) !== i);
  if (dupes.length) throw new Error(`Duplicate CUI in file: ${[...new Set(dupes)].join(", ")}`);

  let created = 0, updated = 0, unchanged = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const cui = r.cui.trim();
        const workerData = {
          apellidos: r.apellidos.trim(),
          nombres: r.nombres.trim(),
          fullName: deriveFullName(r.nombres, r.apellidos),
          fechaNacimiento: date(r.inscrito_fecha_nacimiento, "inscrito_fecha_nacimiento"),
          sexo: nz(r.inscrito_sexo),
          lugarNacimiento: nz(r.inscrito_lugar_nacimiento),
        };
        const docData = {
          type: "BIRTH_CERTIFICATE" as const,
          cuiAsPrinted: cui,
          extractionConfidence: num(r.extraction_confidence),
          notes: nz(r.notes),
          sourceFile: "RENAP_Birth_Certificates_Finca.csv",
          sourcePage: int(r.page),
        };
        const bcData = {
          correlativo: nz(r.correlativo),
          fechaEmisionCertificado: date(r.fecha_emision_certificado, "fecha_emision_certificado"),
          inscritoFechaNacimiento: date(r.inscrito_fecha_nacimiento, "inscrito_fecha_nacimiento"),
          inscritoLugarNacimiento: nz(r.inscrito_lugar_nacimiento),
          inscritoSexo: nz(r.inscrito_sexo),
          madreNombresApellidos: nz(r.madre_nombres_apellidos),
          madreCui: nz(r.madre_cui),
          madreFechaNacimiento: nz(r.madre_fecha_nacimiento),
          madreLugarOrigen: nz(r.madre_lugar_origen),
          padreNombresApellidos: nz(r.padre_nombres_apellidos),
          padreCui: nz(r.padre_cui),
          padreFechaNacimiento: nz(r.padre_fecha_nacimiento),
          padreLugarOrigen: nz(r.padre_lugar_origen),
        };

        const existing = await tx.worker.findUnique({ where: { cui }, include: { documents: { include: { birthCertificate: true } } } });

        if (!existing) {
          await tx.worker.create({
            data: { cui, ...workerData, isMinor: false, isActive: true, documents: { create: { ...docData, birthCertificate: { create: bcData } } } },
          });
          console.log(`CREATE   ${cui}  ${workerData.fullName}`);
          created++;
          continue;
        }

        // Update RENAP-sourced fields (idempotent; report only when something changes).
        await tx.worker.update({ where: { id: existing.id }, data: workerData });
        let doc = existing.documents.find((d) => d.type === "BIRTH_CERTIFICATE");
        if (!doc) {
          await tx.workerDocument.create({ data: { workerId: existing.id, ...docData, birthCertificate: { create: bcData } } });
        } else {
          await tx.workerDocument.update({ where: { id: doc.id }, data: docData });
          if (doc.birthCertificate) await tx.birthCertificateDocument.update({ where: { documentId: doc.id }, data: bcData });
          else await tx.birthCertificateDocument.create({ data: { documentId: doc.id, ...bcData } });
        }

        // Did anything actually differ? (worker + doc metadata; verbatim compare)
        const before = {
          apellidos: existing.apellidos, nombres: existing.nombres, fullName: existing.fullName,
          fn: existing.fechaNacimiento?.toISOString().slice(0, 10) ?? null, sexo: existing.sexo, lugar: existing.lugarNacimiento,
          conf: doc?.extractionConfidence == null ? null : Number(doc.extractionConfidence), notes: doc?.notes ?? null,
        };
        const after = {
          apellidos: workerData.apellidos, nombres: workerData.nombres, fullName: workerData.fullName,
          fn: workerData.fechaNacimiento?.toISOString().slice(0, 10) ?? null, sexo: workerData.sexo, lugar: workerData.lugarNacimiento,
          conf: docData.extractionConfidence, notes: docData.notes,
        };
        const changedKeys = Object.keys(after).filter((k) => (before as Record<string, unknown>)[k] !== (after as Record<string, unknown>)[k]);
        if (changedKeys.length) { console.log(`UPDATE   ${cui}  ${workerData.fullName}  [${changedKeys.join(", ")}]`); updated++; }
        else { unchanged++; }
      }

      const workers = await tx.worker.count();
      const docs = await tx.workerDocument.count({ where: { type: "BIRTH_CERTIFICATE" } });
      console.log(`\ncreated: ${created}, updated: ${updated}, unchanged: ${unchanged}  |  workers total: ${workers}, birth-cert docs: ${docs}`);
      if (!COMMIT) throw new RollbackSignal();
    }, { timeout: 300_000 });
  } catch (e) {
    if (e instanceof RollbackSignal) console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    else { console.error("\nSYNC FAILED:", e); await prisma.$disconnect(); process.exit(1); }
  }
  await prisma.$disconnect();
})();
