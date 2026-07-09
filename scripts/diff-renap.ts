// =============================================================================
// scripts/diff-renap.ts — READ-ONLY. Diff SSOT RENAP_Birth_Certificates_Finca.csv
// against prod, row by row, so we know EXACTLY what changed before writing:
//   NEW       — CUI not in DB (03 --commit will add it)
//   UNCHANGED — every mapped field matches
//   CHANGED   — CUI in DB but one or more fields differ (03 would SKIP → needs update)
//   MISSING   — worker in DB (birth-cert) whose CUI is no longer in the file
// Writes nothing.
//   npx dotenv -e .env.local -- npx tsx scripts/diff-renap.ts
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseCsv } from "./rebuild/lib/csv";
import { deriveFullName } from "../src/lib/validators/worker";

const prisma = new PrismaClient();
const nz = (s: string | undefined): string | null => { const v = (s ?? "").trim(); return v === "" ? null : v; };
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
const dateNz = (s: string | undefined): string | null => nz(s); // file side: keep as YYYY-MM-DD string or null

(async () => {
  const rows = parseCsv(readFileSync(resolve("SSOT-DO-NOT-UPDATE", "RENAP_Birth_Certificates_Finca.csv"), "utf8"));
  console.log(`\n=== RENAP file vs prod — ${rows.length} file rows ===\n`);

  const fileCuis = new Set(rows.map((r) => r.cui.trim()));
  let nNew = 0, nUnchanged = 0, nChanged = 0;

  for (const r of rows) {
    const cui = r.cui.trim();
    const w = await prisma.worker.findUnique({
      where: { cui },
      include: { documents: { include: { birthCertificate: true } } },
    });
    if (!w) { console.log(`NEW        ${cui}  ${r.apellidos.trim()}, ${r.nombres.trim()}`); nNew++; continue; }

    const doc = w.documents.find((d) => d.type === "BIRTH_CERTIFICATE");
    const bc = doc?.birthCertificate;
    // Expected (file) vs actual (DB) for every mapped field.
    const cmp: [string, string | null, string | null][] = [
      ["apellidos", nz(r.apellidos), w.apellidos],
      ["nombres", nz(r.nombres), w.nombres],
      ["fullName", deriveFullName(r.nombres, r.apellidos), w.fullName],
      ["worker.fechaNacimiento", dateNz(r.inscrito_fecha_nacimiento), iso(w.fechaNacimiento)],
      ["worker.sexo", nz(r.inscrito_sexo), w.sexo],
      ["worker.lugarNacimiento", nz(r.inscrito_lugar_nacimiento), w.lugarNacimiento],
      ["doc.extractionConfidence", nz(r.extraction_confidence), doc ? (doc.extractionConfidence == null ? null : String(Number(doc.extractionConfidence))) : "(no doc)"],
      ["doc.notes", nz(r.notes), doc?.notes ?? null],
      ["doc.sourcePage", nz(r.page), doc ? String(doc.sourcePage ?? "") || null : "(no doc)"],
      ["bc.correlativo", nz(r.correlativo), bc?.correlativo ?? null],
      ["bc.fechaEmisionCertificado", dateNz(r.fecha_emision_certificado), iso(bc?.fechaEmisionCertificado)],
      ["bc.inscritoFechaNacimiento", dateNz(r.inscrito_fecha_nacimiento), iso(bc?.inscritoFechaNacimiento)],
      ["bc.inscritoLugarNacimiento", nz(r.inscrito_lugar_nacimiento), bc?.inscritoLugarNacimiento ?? null],
      ["bc.inscritoSexo", nz(r.inscrito_sexo), bc?.inscritoSexo ?? null],
      ["bc.madreNombresApellidos", nz(r.madre_nombres_apellidos), bc?.madreNombresApellidos ?? null],
      ["bc.madreCui", nz(r.madre_cui), bc?.madreCui ?? null],
      ["bc.madreFechaNacimiento", nz(r.madre_fecha_nacimiento), bc?.madreFechaNacimiento ?? null],
      ["bc.madreLugarOrigen", nz(r.madre_lugar_origen), bc?.madreLugarOrigen ?? null],
      ["bc.padreNombresApellidos", nz(r.padre_nombres_apellidos), bc?.padreNombresApellidos ?? null],
      ["bc.padreCui", nz(r.padre_cui), bc?.padreCui ?? null],
      ["bc.padreFechaNacimiento", nz(r.padre_fecha_nacimiento), bc?.padreFechaNacimiento ?? null],
      ["bc.padreLugarOrigen", nz(r.padre_lugar_origen), bc?.padreLugarOrigen ?? null],
    ];
    const diffs = cmp.filter(([, exp, act]) => exp !== act);
    if (diffs.length === 0) { console.log(`UNCHANGED  ${cui}  ${w.fullName}`); nUnchanged++; }
    else {
      console.log(`CHANGED    ${cui}  ${w.fullName}`);
      for (const [f, exp, act] of diffs) console.log(`             ${f}:  file="${exp ?? "∅"}"  db="${act ?? "∅"}"`);
      nChanged++;
    }
  }

  // DB birth-cert workers whose CUI is no longer in the file
  const dbBc = await prisma.worker.findMany({ where: { documents: { some: { type: "BIRTH_CERTIFICATE" } } }, select: { cui: true, fullName: true } });
  const missing = dbBc.filter((w) => !fileCuis.has(w.cui));
  for (const m of missing) console.log(`MISSING    ${m.cui}  ${m.fullName}  (in DB, not in file)`);

  console.log(`\nsummary: NEW=${nNew}  UNCHANGED=${nUnchanged}  CHANGED=${nChanged}  MISSING=${missing.length}  (DB birth-cert workers=${dbBc.length})`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error("DIFF FAILED:", e); await prisma.$disconnect(); process.exit(1); });
