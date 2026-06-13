# SSOT Roster Import — Implementation Plan

**Status:** PLAN ONLY. No database writes, no schema changes, and no code have been executed. This document is a proposal for your sign-off and ends with the decisions required from you before any execution.
**Date:** 2026-06-11
**Authority for execution:** NONE yet. Per the standing rule, nothing touches prod without your explicit, row-level authorization. This plan describes *how* it would be done so you can authorize it deliberately.
**Source of truth:** `SSOT-DO-NOT-UPDATE/` (read-only; never written by any step here).
**Companion:** architecture rationale in [docs/roster-architecture-research.md](roster-architecture-research.md).

---

## 0. Human-verification attestation (canonical — supersedes any earlier per-file note)

> **✅ ATTESTED BY JORGE (2026-06-12): every single record in BOTH SSOT files — `DPI_Finca.csv` and `RENAP_Birth_Certificates_Finca.csv` — has been HUMAN-VERIFIED under FOUR-EYES review, TWICE (two independent four-eyes passes).** The verification explicitly covers the identity fields **`cui`, `apellidos`, and `nombres`** for **each and every row**, with **no exceptions**.
>
> **Consequences (binding on all code and review):**
> - These files are the **trusted canon**. The `cui`, `apellidos`, and `nombres` values are correct as written and are captured **verbatim** — never split, normalized, re-cased, or formula-validated (CUI included; legacy/non-13-digit formats are confirmed-correct real values, not errors).
> - This attestation **supersedes** the older note that the DPI file was "not yet four-eyes verified" (§2) and the RENAP "verified once (2026-06-11)" note — **both files are now human-verified, four-eyes, twice.**
> - Any future change to either file resets this attestation; it must be re-earned by the same four-eyes-twice process before the file is trusted again.

---

## 1. Objective and non-goals

**Objective:** Make production reflect the canonical roster in `SSOT-DO-NOT-UPDATE/`, while **preserving every existing activity record and payroll entry** and **never silently dropping a real person** (the two failures that motivated this work).

**Non-goals (explicitly out of scope unless you say otherwise):**
- Re-introducing any OCR/batch auto-create path (those were deleted on your instruction).
- Editing the SSOT files.
- Making identity-merge decisions on your behalf. The plan *proposes* mappings; you confirm them.

---

## 2. Verified facts (from read-only inspection; aggregates only, no PII)

> **Update 2026-06-12:** the DPI file is present as **`DPI_Finca.csv`** (32 rows); Jorge designated its fields the **authoritative field canon**. The `worker` identity schema field names match it verbatim.

**`SSOT-DO-NOT-UPDATE/DPI_Finca.csv` — 32 rows — ⭐ AUTHORITATIVE FIELD CANON**
Columns: `page, cui, apellidos, nombres, fecha_nacimiento, sexo, nacionalidad, lugar_nacimiento, vecindad, pueblo, comunidad_linguistica, estado_civil, fecha_vencimiento, extraction_confidence, notes`.
- 32/32 have `nombres`, `apellidos`, `fecha_nacimiento`.
- CUI: **21/32 are clean 13-digit; 11/32 are present but not plain 13 digits** (capture verbatim — a mix of formatting and legacy formats; not errors). **✅ FOUR-EYES HUMAN-VERIFIED CLEAN, TWICE** (Jorge, 2026-06-12 — see §0); `cui`/`apellidos`/`nombres` confirmed correct for every row. *(Earlier "not yet four-eyes verified" note is superseded.)*
- 0 duplicate CUIs within the file.
- `extraction_confidence`: range 85–92 (percent); **none is 100**. `notes` non-empty on all 32.

**`SSOT-DO-NOT-UPDATE/RENAP_Birth_Certificates_Finca.csv` — 6 rows** (renamed 2026-06-12; fields aligned to DPI canon)
Columns: `page, cui, apellidos, nombres, inscrito_fecha_nacimiento, inscrito_lugar_nacimiento, inscrito_sexo, madre_nombres_apellidos, madre_cui, madre_fecha_nacimiento, madre_lugar_origen, padre_nombres_apellidos, padre_cui, padre_fecha_nacimiento, padre_lugar_origen, correlativo, fecha_emision_certificado, extraction_confidence, notes`.
- **Identity fields now match DPI canon:** `page, cui, apellidos, nombres` (was `inscrito_cui` / `inscrito_nombres_apellidos`). The inscrito DOB/birthplace/sex and `madre_*`/`padre_*`/`correlativo`/`fecha_emision_certificado` remain birth-cert-specific.
- **✅ Reconciled (Jorge, 2026-06-12): the DPI csv fields are authoritative canon.** Store `apellidos` (both surnames combined) and `nombres` (given names combined) **verbatim as canon — never split** into paterno/materno (splitting is the fragile, Dirty-George failure mode behind the old matcher bug). The `worker` schema field names were updated to match the DPI canon.
- **✅ FOUR-EYES HUMAN-VERIFIED CLEAN, TWICE** (first pass 2026-06-11; second four-eyes pass 2026-06-12 — see §0). This file is trusted; `cui`/`apellidos`/`nombres` confirmed correct for every row. Non-13-digit and legacy values — such as the `madre_cui` `F-6 22274` (an old *cédula de vecindad*/registry reference from before the CUI system) — are **confirmed-correct real values, not errors**. Capture **verbatim**; do not formula-validate or reject (see CUI reflection).
- `extraction_confidence`: 88–95 (percent).

**Cross-file:** CUI is the shared identity key (same number on a person's DPI and their birth certificate). In the **current** extraction the two files are CUI-disjoint, so today there are **38 distinct people, each appearing with exactly one document type**. This is a property of today's data, **not** a model constraint: the schema (§5 Phase 2) lets any person hold both a DPI and a birth-certificate document, keyed to one identity by CUI. (To confirm with you, DEC-4: what the 6 birth-certificate-only people represent — e.g. minors, or adults whose DPI isn't captured yet.)

**Production baseline (from `prisma/schema.prisma` + earlier read-only dump):** `workers` has 216 rows, all `is_active=true`. `ActivityRecord` and `PayrollEntry` carry FKs to `worker.id`. The ~13 ALL-CAPS rows hold the payroll entries; the Title-case variants hold most activity records. So the 38 canonical people are spread across many of the 216 rows, **with real money and real work history attached to the dirty rows** — they cannot simply be replaced.

---

## 3. Discrepancies to resolve before execution (Rule 1 — surfaced, not assumed)

| # | Discrepancy | Why it blocks a blind load | Resolution in this plan |
|---|---|---|---|
| D1 ✅ | 11/32 DPI CUIs not plain 13-digit | CUI is the deterministic join key; bad keys mis-map or fail uniqueness | **RESOLVED** — DPI file four-eyes human-verified clean **twice** (§0); `cui`/`apellidos`/`nombres` correct for every row. Capture verbatim; **no formula validation** |
| D2 ✅ | 1/6 birth-cert CUI not 13-digit | **RESOLVED** — RENAP file four-eyes human-verified clean **twice** (§0); non-13-digit & legacy formats (e.g. `madre_cui` `F-6 22274`) are confirmed-correct real values | Capture verbatim; **no formula validation** |
| D3 | All SSOT rows < 100% extraction confidence; all have `notes` | This is an extraction, not a register dump | Phase 0 emits a confidence + notes review list for your eyes before load |
| D4 | CUI check-digit algorithm unverified | Cannot validate correctness of a CUI without the real modulus rule | **Open item O1** — must be sourced & verified before claiming a CUI is valid/invalid |
| D5 | 38 SSOT people vs 216 prod rows | Mapping is identity resolution over real money | Phase 1 reconciliation report; you confirm mappings |

---

## 4. Decisions required from you (the plan branches on these)

- **DEC-1 — Schema shape. ✅ RESOLVED (your decision):** extend the schema to hold **ALL fields from both SSOT files, plus images** — full field set detailed in §5 Phase 2. Images:
  - **Person photo** — for all 38.
  - **DPI front image** + **DPI back image** (two separate fields) — for the DPI cohort (32).
  - **Birth-certificate image** — for the birth-certificate cohort (6).
- **DEC-1a — How "all info" is structured (sub-decision).** Recommended: a canonical `worker` identity carrying structured name + lifecycle, with **typed document records** (`worker_document`: DPI / BIRTH_CERTIFICATE) holding the document-specific fields and image references — rather than one ~40-column table. This matches the research (typed identifier/document records) and keeps DPI-only and birth-cert-only fields from polluting one wide row. Confirm, or say you prefer a single wide `workers` table.
- **DEC-1b — Image storage (sub-decision).** Recommended: store images in **Supabase Storage** (you already run a `notebook-photos` bucket) and persist only the **object path/URL** in the DB — never image binaries in Postgres (industry best practice; keeps the DB small and backups sane). Confirm the bucket(s) and whether documents (DPI/birth cert) should live in a **separate, more-restricted private bucket** than person photos, given they are sensitive identity documents.
- **DEC-2 — Reconciliation strategy for the 216 rows.** Recommended: **map each prod row to one of the 38 canonical identities, reassign its activity/payroll records onto that identity, then retire (deactivate, not delete) the dirty row.** Confirm, or describe the strategy you intend.
- **DEC-3 — Who confirms the mapping.** Recommended: I generate a read-only reconciliation report; **you** confirm/assign each mapping by hand (CUI-matched rows pre-filled, name-only rows proposed as candidates). I do not finalize any mapping you haven't confirmed.
- **DEC-4 — The birth-certificate cohort.** Confirm what the 6 birth-certificate-only people represent (minors? adults whose DPI isn't captured yet?) and whether any map to `is_minor`. The model does **not** hard-code this — any of them can gain a DPI document later under the same identity (same CUI), with no new worker row.
- **DEC-5 — Unmatched handling.** For a prod worker carrying records that matches **no** SSOT person (possible dropped-veteran case), and for an SSOT person matching **no** prod row: confirm these are surfaced for your decision and **never auto-deleted/auto-created**.

---

## 5. Plan phases

> Execution convention (matches existing scripts): `npx dotenv -e .env.local -- npx tsx scripts/<name>.ts` runs **dry-run by default**; mutation happens **only** with an explicit `--commit` flag. Every mutating step is transactional, idempotent, and writes to `audit_logs`.

### Phase 0 — SSOT validation & normalization (READ-ONLY)
- Parse both CSVs with a real CSV parser (robust to commas in free-text fields).
- Normalize CUI (strip non-digits/whitespace); validate length and, **once O1 is resolved**, check-digit.
- Emit a review list: every row with a non-validating CUI (D1/D2), confidence below a threshold you set, or a meaningful `notes` flag.
- **Output:** an anomaly report for your review. **No writes. No auto-correction.** You resolve anomalies (or confirm they're fine) before Phase 2.

### Phase 1 — Reconciliation report (READ-ONLY)
- For each of the 38 SSOT identities, find candidate prod rows:
  - **Deterministic:** prod `dpi` (normalized) == SSOT `cui` → high-certainty match.
  - **Probabilistic fallback:** structured-name comparison (apellido paterno + materno + given names) for prod rows lacking a CUI — proposed as ranked candidates, never auto-confirmed.
- Produce three explicit lists:
  1. **Confirmed-by-CUI** matches (prod row ↔ SSOT identity).
  2. **SSOT people with no prod match** (a real worker possibly never correctly entered).
  3. **Prod workers carrying activity/payroll records that match no SSOT person** — the **dropped-veteran detector**. This list must be empty or fully explained before Phase 3.
- **Output:** a confirmation worksheet you fill in by hand (DEC-3). This is the human-authored mapping the migration will obey.

### Phase 2 — Schema migration (DEC-1 resolved; structure pending DEC-1a/1b)
Prisma migration, **idempotent** and additive (new nullable columns / new tables; no destructive drops). Strict TypeScript, no linter suppressions (Rules 9, 12). Verified on a non-prod check first; applied to prod only on your authorization.

**Full field coverage — every SSOT column is represented (nothing discarded):**

- **`worker` (canonical identity) — field names match DPI canon (`DPI_Finca.csv`) verbatim:** `id`; **`cui` (normalized, UNIQUE — one CUI per person; the identity key)**; `apellidos` (both surnames **combined — NOT split**); `nombres` (given names combined); `fecha_nacimiento`; `sexo`; `nacionalidad`; `lugar_nacimiento`; `vecindad`; `pueblo`; `comunidad_linguistica`; `estado_civil`. App-added (not in canon): lifecycle `status`, `person_photo_url`, `is_minor`, `start_date`/`end_date`, provenance. DPI-card `fecha_vencimiento` → `dpi_document`.
- **`worker_document` (typed records, per DEC-1a) — ONE-TO-MANY: a single person may hold a DPI document AND a birth-certificate document (and the DB holds both), because the same CUI appears on both.** Fields: `worker_id` (FK to the identity), `type` (`DPI` | `BIRTH_CERTIFICATE`), plus per-type fields:
  - **DPI:** `fecha_vencimiento` (expiry), `front_image_url`, `back_image_url`.
  - **BIRTH_CERTIFICATE:** `correlativo`, `fecha_emision_certificado`, `lugar_nacimiento`, `madre_nombres_apellidos` / `madre_cui` / `madre_fecha_nacimiento` / `madre_lugar_origen`, `padre_*` (same), `image_url`.
  - Common provenance on every document row: `extraction_confidence`, `notes`, `source_file`, `source_page`, `imported_at`.
- **Provenance/audit:** retain `extraction_confidence`, `notes`, and source file+page so every field's origin is traceable (the name-level provenance that was missing).

*(If DEC-1a = single wide table instead, a person holding both documents would force either duplicate rows or doubled columns — which is exactly why the typed-document design is recommended. Images still reference Supabase Storage paths per DEC-1b.)*

**Cardinality (the point you raised):** `cui` is UNIQUE on the **identity** (one CUI = one person). `worker_document` is **many-per-worker**: a worker may have 0–1 DPI documents and 0–1 birth-certificate documents (extensible to more), all linked to the one identity. A person presenting both documents = one `worker` row + two `worker_document` rows. Recommended guard: at most one document of each `type` per worker (a partial unique index on `(worker_id, type)`), so the same DPI isn't loaded twice — confirm if you want that or to allow multiples.

### Phase 3 — Canonical load + FK reassignment + retire dirty rows (per your confirmed mapping)
For each canonical identity, inside a single transaction per identity (atomic — Rule 10):
1. Establish/update the canonical worker row from SSOT (real data only; no placeholders — Rule 4).
2. **Reassign** all `ActivityRecord` and `PayrollEntry` FKs from each mapped dirty row onto the canonical row (reusing the proven reassignment + payroll-clash-sum logic already in `/api/admin/workers/merge`).
3. **Retire** the dirty row (`is_active=false`, `end_date=now`) — **never hard-delete**, for reversibility and audit.
4. Write a full before/after entry to `audit_logs`.
- Idempotent: re-running makes no further change once an identity is reconciled (Rule 12).
- Dry-run prints the exact planned changes; `--commit` applies them.

### Phase 4 — Verification (must pass before declaring done)
Automated invariants, reported with structured output (Rule 10):
- **No orphaned records:** every `ActivityRecord` / `PayrollEntry` points to a live canonical worker.
- **Conservation:** total count of activity records and total payroll amounts are **identical** before and after (nothing dropped, nothing duplicated).
- **Headcount:** active workers == confirmed canonical count; retired == the rest, each with an audit entry.
- **Dropped-veteran check:** Phase-1 list (3) is empty or fully accounted for.

### Rollback
- Because dirty rows are deactivated (not deleted) and every change is audited with before/after values, rollback = restore FKs and re-activate from the audit log. The migration (Phase 2) is additive, so it does not need to be reverted to restore behavior.

---

## 6. Engineering standards applied (THE RULES 9–12)
- **Strict typing, zero suppressions** (Rule 9).
- **Atomic + observable:** per-identity transactions, structured logging, explicit error handling; no happy-path-only code (Rule 10).
- **Config isolation:** DB credentials via `.env.local` injection only; no hardcoded connection strings (Rule 11).
- **Idempotent & re-runnable** scripts and migration (Rule 12).
- **No mock/sample data** anywhere; only the real SSOT data (Rules 4, 8).
- **No silent failure / no silent drop:** every input row is matched, reassigned, or surfaced — never discarded.

---

## 7. Open items (must be closed before the phase that needs them)
- **O1 — Guatemalan CUI check-digit *algorithm* (programmatic validation only).** The modulus/check-digit rule remains unverified in research. Candidate sources to evaluate (not yet trusted): `github.com/minfingt/validators` (CUI), `github.com/alextello/validador-dpi-nit`, SAT portal `portal.sat.gob.gt`. **This does NOT affect the SSOT files** — their CUIs are human-attested correct (four-eyes, twice — §0), and per the verbatim rule we deliberately do **not** run any check-digit formula against them. O1 only matters if we ever validate *arbitrary* new CUIs entered going forward.
- **O2 — Offline-sync conflict model.** The roster lives in an offline-first PWA; how canonical identities reconcile with offline edits/sync is unresolved (research open question). Out of scope for this one-time import, but relevant before re-enabling field create paths.
- **O3 — `notes` content.** 32/32 DPI rows have notes; their meaning (per-row caveats?) must be reviewed in Phase 0 before trusting those rows.
- **O4 — Image files (blocks the image-load step).** The schema can hold image references now, but I do **not** know where the actual image files are, whether they exist yet for all 38 people (person photo for all; DPI front/back for 32; birth-cert for 6), or their naming/keying to a CUI. I will **not** search for them (repo-boundary rule). When that step is reached, tell me the location and how each file keys to a person, and confirm the Supabase bucket(s) per DEC-1b. Until then, image fields are created but left null.

---

## 8. What I need from you to proceed
- **DEC-1 ✅ resolved.** Still need: **DEC-1a** (typed document records — recommended — vs. one wide table), **DEC-1b** (Supabase Storage + private bucket for identity documents), and **DEC-2 … DEC-5** (§4).
- Confirm whether I should first build **Phase 0 + Phase 1 as read-only scripts** (anomaly report + reconciliation worksheet, touching nothing) so you decide the rest against real numbers.
- Image files (**O4**) are not needed yet — the schema will hold the references; we load images in a later step once you tell me where they are.
