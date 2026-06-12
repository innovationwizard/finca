// =============================================================================
// scripts/rebuild/03_populate_employees.ts — Load the canonical employee roster
// from the SSOT files into `public` (run AFTER the schema swap, so `public` is
// the new enriched schema). Uses the typed Prisma client with nested creates:
//   worker → worker_document → (dpi_document | birth_certificate_document)
// Prisma generates the v7 ids. CUI captured VERBATIM (modern or legacy).
//
//   DPI_Finca.csv (32)  → worker + DPI document
//   RENAP_Birth_Certificates_Finca.csv (6) → worker + birth-certificate document
//
// Dry-run by default (transaction + rollback, prints summary); --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/03_populate_employees.ts [--commit]
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseCsv } from "./lib/csv";
import { deriveFullName } from "../../src/lib/validators/worker";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const SSOT = (f: string) => resolve("SSOT-DO-NOT-UPDATE", f);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const nz = (s: string | undefined): string | null => {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
};
// ISO date → Date (UTC midnight to avoid TZ drift); empty → null; unexpected → throw (don't mangle).
const date = (s: string | undefined, field: string): Date | null => {
  const v = (s ?? "").trim();
  if (v === "") return null;
  if (!ISO.test(v)) throw new Error(`Unexpected date format in ${field}: "${v}" (expected YYYY-MM-DD)`);
  return new Date(`${v}T00:00:00.000Z`);
};
const num = (s: string | undefined): number | null => {
  const v = (s ?? "").trim();
  if (v === "") return null;
  const n = Number(v.replace("%", ""));
  return Number.isFinite(n) ? n : null;
};
const int = (s: string | undefined): number | null => {
  const v = (s ?? "").trim();
  if (v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

(async () => {
  const dpiRows = parseCsv(readFileSync(SSOT("DPI_Finca.csv"), "utf8"));
  const bcRows = parseCsv(readFileSync(SSOT("RENAP_Birth_Certificates_Finca.csv"), "utf8"));
  console.log(`\n=== employee load — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} — DPI:${dpiRows.length} RENAP:${bcRows.length} ===\n`);

  // CUI integrity (no reject — surface only; DB unique enforces at insert)
  const cuis = [...dpiRows, ...bcRows].map((r) => (r.cui ?? "").trim());
  const dupes = cuis.filter((c, i) => c && cuis.indexOf(c) !== i);
  if (dupes.length) throw new Error(`Duplicate CUI across SSOT files: ${[...new Set(dupes)].join(", ")}`);
  const nonStd = cuis.filter((c) => !/^\d{13}$/.test(c)).length;
  console.log(`CUI: ${cuis.length} total, ${cuis.length - nonStd} plain 13-digit, ${nonStd} legacy/other (kept verbatim).`);
  console.log("⚠ DEC-4 open: birth-cert cohort is_minor set to false; confirm & set deliberately later.\n");

  try {
    await prisma.$transaction(async (tx) => {
      let dpiN = 0;
      for (const r of dpiRows) {
        await tx.worker.create({
          data: {
            cui: r.cui.trim(),
            apellidos: r.apellidos.trim(),
            nombres: r.nombres.trim(),
            fullName: deriveFullName(r.nombres, r.apellidos),
            fechaNacimiento: date(r.fecha_nacimiento, "DPI.fecha_nacimiento"),
            sexo: nz(r.sexo),
            nacionalidad: nz(r.nacionalidad),
            lugarNacimiento: nz(r.lugar_nacimiento),
            vecindad: nz(r.vecindad),
            pueblo: nz(r.pueblo),
            comunidadLinguistica: nz(r.comunidad_linguistica),
            estadoCivil: nz(r.estado_civil),
            isMinor: false,
            isActive: true,
            documents: {
              create: {
                type: "DPI",
                cuiAsPrinted: r.cui.trim(),
                extractionConfidence: num(r.extraction_confidence),
                notes: nz(r.notes),
                sourceFile: "DPI_Finca.csv",
                sourcePage: int(r.page),
                dpi: {
                  create: {
                    fechaVencimiento: date(r.fecha_vencimiento, "DPI.fecha_vencimiento"),
                    apellidos: nz(r.apellidos),
                    nombres: nz(r.nombres),
                    fechaNacimiento: date(r.fecha_nacimiento, "DPI.fecha_nacimiento"),
                    sexo: nz(r.sexo),
                    nacionalidad: nz(r.nacionalidad),
                    lugarNacimiento: nz(r.lugar_nacimiento),
                    vecindad: nz(r.vecindad),
                    pueblo: nz(r.pueblo),
                    comunidadLinguistica: nz(r.comunidad_linguistica),
                    estadoCivil: nz(r.estado_civil),
                  },
                },
              },
            },
          },
        });
        dpiN++;
      }

      let bcN = 0;
      for (const r of bcRows) {
        await tx.worker.create({
          data: {
            cui: r.cui.trim(),
            apellidos: r.apellidos.trim(),
            nombres: r.nombres.trim(),
            fullName: deriveFullName(r.nombres, r.apellidos),
            fechaNacimiento: date(r.inscrito_fecha_nacimiento, "RENAP.inscrito_fecha_nacimiento"),
            sexo: nz(r.inscrito_sexo),
            lugarNacimiento: nz(r.inscrito_lugar_nacimiento),
            isMinor: false, // DEC-4 — confirm later
            isActive: true,
            documents: {
              create: {
                type: "BIRTH_CERTIFICATE",
                cuiAsPrinted: r.cui.trim(),
                extractionConfidence: num(r.extraction_confidence),
                notes: nz(r.notes),
                sourceFile: "RENAP_Birth_Certificates_Finca.csv",
                sourcePage: int(r.page),
                birthCertificate: {
                  create: {
                    correlativo: nz(r.correlativo),
                    fechaEmisionCertificado: date(r.fecha_emision_certificado, "RENAP.fecha_emision_certificado"),
                    inscritoFechaNacimiento: date(r.inscrito_fecha_nacimiento, "RENAP.inscrito_fecha_nacimiento"),
                    inscritoLugarNacimiento: nz(r.inscrito_lugar_nacimiento),
                    inscritoSexo: nz(r.inscrito_sexo),
                    madreNombresApellidos: nz(r.madre_nombres_apellidos),
                    madreCui: nz(r.madre_cui),
                    madreFechaNacimiento: nz(r.madre_fecha_nacimiento), // text, verbatim (may be partial/legacy)
                    madreLugarOrigen: nz(r.madre_lugar_origen),
                    padreNombresApellidos: nz(r.padre_nombres_apellidos),
                    padreCui: nz(r.padre_cui),
                    padreFechaNacimiento: nz(r.padre_fecha_nacimiento), // text, verbatim
                    padreLugarOrigen: nz(r.padre_lugar_origen),
                  },
                },
              },
            },
          },
        });
        bcN++;
      }

      const workers = await tx.worker.count();
      const docs = await tx.workerDocument.count();
      console.log(`created: ${dpiN} DPI workers, ${bcN} birth-cert workers, ${workers} workers total, ${docs} documents`);
      if (workers !== dpiRows.length + bcRows.length) throw new Error(`worker count mismatch: ${workers} != ${dpiRows.length + bcRows.length}`);

      if (!COMMIT) throw new RollbackSignal();
    }, { timeout: 300_000 });
  } catch (e) {
    if (e instanceof RollbackSignal) {
      console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    } else {
      console.error("\nEMPLOYEE LOAD FAILED:", e);
      await prisma.$disconnect();
      process.exit(1);
    }
  }
  await prisma.$disconnect();
})();
