# Master Build Order — dependency-ordered (all plans, today)

**Purpose:** Single dependency-ordered index of every build plan in scope today, so work proceeds in the right order and survives context compaction. Each stage links its detailed plan/tracker. Update status here as stages complete.

**Plans folded in:** downtime gate · UUIDv7 rebuild ([uuidv7-rebuild-migration-plan.md](uuidv7-rebuild-migration-plan.md)) · SSOT roster import ([ssot-roster-import-plan.md](ssot-roster-import-plan.md)) · séptimo refactor ([septimo-refactor-plan.md](septimo-refactor-plan.md) / live tracker [septimo-refactor-progress.md](septimo-refactor-progress.md)) · Supabase key migration · CUI verbatim-capture.

## Standing gates (apply throughout)
- **GATE-AUTH (Q2 — ✅ LIFTED):** Jorge authorized me to **execute** the destructive prod steps myself, **pausing at each checkpoint** to report progress + unexpected findings before continuing.
- **GATE-PAYROLL (Q3 — ✅ RESOLVED):** build payroll-generation now (Stage 4). Design (recommended, confirmable): idempotent on-demand "Recalcular nómina" per period — upsert `payroll_entry` with `totalEarned` = Σ worker's `activity_records`, `seventh_day_pay` computed, **manual `bonification`/`advances`/`deductions` preserved**, `totalToPay` derived; re-runnable; admin-triggered, not auto-on-close.
- Jorge drives git. Each destructive checkpoint pauses for report. `prisma generate` only (no DB) for the code-authoring stages.

---

## The order

### 0 — Downtime gate ✅ DONE
Maintenance notice (`src/app/page.tsx`) + app-wide redirect (`src/middleware.ts`, `MAINTENANCE_MODE`). **Prerequisite for all destructive DB stages.** Lift last (Stage 9).

### 1 — Target schema authoring  ·  code only, no DB  ·  ready now
Author the **one consolidated target** in `prisma/schema.prisma` + `prisma generate`:
- Enriched employees (DPI-canon fields, UUIDv7): `worker`, `worker_document`, `dpi_document`, `birth_certificate_document`.
- All tables → UUIDv7 generation.
- `payroll_entries.seventh_day_pay` ✅ (séptimo Batch 1, done) and `Holiday` table ✅ (done) — already in schema; carried into the rebuild.
- Depends on: DPI canon ✅, all DEC decisions ✅. **No blockers.**

### 2 — Rebuild migration + scripts authoring  ·  code only, no DB  ·  after 1
Author (not run): build-new-tables (temp names), populate (SSOT employees + global v4→v7 remap + CUI captured verbatim), `worker_reassignment` tooling, verification scripts. → [uuidv7-rebuild-migration-plan.md](uuidv7-rebuild-migration-plan.md). Depends on: 1.

### 3 — Séptimo supporting code  ·  code only, no DB  ·  after 1 (parallel with 2)
Séptimo-amount `SystemSetting` (default Q150) · `holiday` CRUD API+validators+audit · config UI (amount + holidays) · remove captura "domingo (séptimo)" toggle · `calcNetPay` += `seventh_day_pay` · show séptimo as its own line (resumenes/pagos/profile). → séptimo Batches 2–5.1, 7. Depends on: 1. **Not** the computation (Stage 7).

### 4 — Payroll-generation path  ·  ⛔ GATE-PAYROLL (Q3)  ·  design needed
Define & build how `PayrollEntry` rows are created going forward (aggregate `activity_records` per worker/period). **Unplanned** — needs your direction. Blocks Stage 7.

### 5 — Rebuild EXECUTION  ·  ⛔ GATE-AUTH (Q2) · destructive · downtime
In order, each its own checkpoint: **5.0** Phase-0 verify (PG version, RLS/views/triggers) → **5.1** backup (pg_dump + PITR) → **5.2** build new tables → **5.3** populate → **5.4** swap (rename, swap-first) → **5.5** reassign 216→38 (you, row-by-row via `worker_reassignment`; dropped-veteran gate) → **5.6** add worker FK + verify (conservation: row counts, payroll totals, zero orphans). Depends on: 1, 2, 0, backup, GATE-AUTH.

### 6 — Deactivate `SP` activity  ·  ⛔ GATE-AUTH · data write · after 5
Set the séptimo `SP` activity `isActive=false` so no new séptimo-as-work records. Depends on: 5 live.

### 7 — Séptimo computation + activation  ·  ⛔ GATE-PAYROLL · after 4, 5, 6
Per-week attendance (required = 6 − holidays) → write `seventh_day_pay` to the worker's `PayrollEntry`; current open + future periods only; verify. Depends on: 4 (payroll rows must exist to write to), 5, 6, 3.

### 8 — Supabase key migration  ·  code + env  ·  independent (do before Stage 9)
`anon`/`service_role` → `sb_publishable_`/`sb_secret_` (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`); update client init + `middleware.ts` + `.env*` (you rotate the secret). Independent of the DB rebuild (`DATABASE_URL`-based). Can run parallel to 1–3.

### 9 — Verify & lift downtime  ·  last
`prisma generate` + `tsc` + `lint` + `next build` green; smoke-test; then set `MAINTENANCE_MODE=false` and redeploy.

---

## Progress Log
- **2026-06-12 — GATE-AUTH lifted, GATE-PAYROLL resolved (a).**
- **2026-06-12 — Stage 1 (target schema) authored + validated (`prisma generate` OK).** `prisma/schema.prisma`:
  - All 14 model ids → `@default(uuid(7))` (was `gen_random_uuid()` v4).
  - `Worker` replaced with enriched identity (DPI canon: `cui` unique, `apellidos`/`nombres` combined, `fecha_nacimiento`, `sexo`, `nacionalidad`, `lugar_nacimiento`, `vecindad`, `pueblo`, `comunidad_linguistica`, `estado_civil`, `person_photo_url`) + new `WorkerDocument` (parent) / `DpiDocument` / `BirthCertificateDocument` (1:1 children) + `DocumentType` enum.
  - **Implementation choices made (CONFIRM):** kept `fullName` as a maintained display value (= "nombres apellidos") for back-compat; kept `isActive`/`isMinor`/`startDate`/`endDate` (no new status enum, to avoid rippling); kept app payroll fields `nit`/`bankAccount`/`bankName`/`phone`; `cui` is a verbatim string (modern or legacy); per-doc as-stated provenance columns on children; parent `madre_*`/`padre_*` DOB & CUI kept as **text** (verbatim, may be partial/legacy).
  - **Ripple:** `dpi`→`cui` and `photoUrl`→`person_photo_url` removed from `Worker` → ~9 consumer files break (`resumenes`, `trabajadores/*`, `api/workers/*`, `api/resumenes`). **Build is currently red** until the Stage-1 consumer refactor (next sub-step). `fullName` references (kept) are unaffected.

- **2026-06-12 — Stage 1 consumer refactor IN PROGRESS (`dpi`→`cui`, `photoUrl`→`personPhotoUrl`, identity = apellidos/nombres/cui).**
  - ✅ Done: `src/lib/validators/worker.ts` (new identity fields + `deriveFullName`); `src/app/api/workers/route.ts` (GET select + POST derive fullName + cui-uniqueness); `src/app/api/workers/[id]/route.ts` (GET/PATCH responses + fullName re-derive on update); `src/app/api/resumenes/route.ts` (select cui; payload ID key kept as `dpi`, sourced from cui, for the resúmenes UI).
  - ⏳ Remaining (build currently RED — 4 tsc errors + 2 forms need functional rework):
    - `trabajadores/page.tsx` (select `dpi`→`cui`), `workers-list.tsx` (WorkerRow type + display; keep "DPI" labels per Rule 13).
    - `trabajadores/[id]/page.tsx` serialized (`dpi`→`cui`, `photoUrl`→`personPhotoUrl`).
    - `worker-profile.tsx` — **edit form rework**: type + inputs from (fullName, dpi) → (nombres, apellidos, cui), photoUrl→personPhotoUrl; PATCH payload.
    - `trabajadores/nuevo/page.tsx` — **create form rework**: inputs → nombres/apellidos/cui; POST body (else silent runtime break vs new validator).
    - `resumen-tabs.tsx` / `resumenes-client.tsx` — no tsc error; runtime OK (payload still has `dpi` key = CUI value).
  - NEXT: finish the 4 type/display fixes (green tsc), then the two forms (functional), then `next build`.

- **2026-06-12 — NEW HARD RULE: no inline CRUD anywhere; forms = selection (dropdown/autocomplete) over canonical lists.** Persisted to memory ([[feedback_no_inline_crud]]). Decision: **new-hire creation/edit lives ONLY in the dedicated `/trabajadores` management section**; every other workflow SELECTS from the roster. New **Stage 10** added: audit & convert any remaining inline entity-CRUD to selection.
  - List fixes done: `trabajadores/page.tsx` (select `cui`), `workers-list.tsx` (type/search/display → `cui`; "DPI" labels kept per Rule 13).
  - Remaining Stage-1 forms (now scoped as the **dedicated controlled CRUD surface**, reworked for identity `apellidos`/`nombres`/`cui`): `trabajadores/[id]/page.tsx` + `worker-profile.tsx` (edit) and `trabajadores/nuevo/page.tsx` (create). Build still red until these compile.

### 10 — Enforce "no inline CRUD" — **WORKERS ONLY** (audit)  ·  after Stage 1
Audit all workflows for inline **worker** create/edit; convert each to a **selection** (dropdown/autocomplete) bound to the canonical roster. Worker CRUD remains only in the dedicated `/trabajadores` section. **EXEMPT (required feature — do not touch):** the annual plan and the activities plan, where inline CRUD is required.

- **2026-06-12 — Stage 1 ✅ COMPLETE — `next build` GREEN.** Consumer refactor done: dedicated `/trabajadores` create form (`nuevo/page.tsx`) and edit profile (`worker-profile.tsx` + `[id]/page.tsx`) reworked to identity `nombres`/`apellidos`/`cui` (CUI verbatim, no format regex); list view → `cui`; `api/workers`, `api/workers/[id]`, `api/resumenes` aligned. `fullName` derived & maintained. "DPI" user-facing labels kept (Rule 13). resúmenes payload keeps `dpi` key sourced from `cui` (no UI break). NEXT: Stage 2 (rebuild scripts) / Stage 3 (séptimo supporting code) / Stage 8 (Supabase keys) — all code-only; then Stage 4 (payroll-gen) and the gated Stage 5 execution.

- **2026-06-12 — Stage 2 IN PROGRESS (rebuild scripts; code only, no DB).** Mechanism: build new tables in a transient `rebuild` Postgres schema → populate → atomic schema swap (`public`→`backup`, `rebuild`→`public`); avoids constraint/index name collisions; Prisma-transparent (baseline after).
  - ✅ 2.1 `scripts/rebuild/01_create_new_schema.sql` — full new-schema DDL generated via `prisma migrate diff --from-empty` (18 tables, indexes, FKs). To be executed with `search_path=rebuild`.
  - ⏳ 2.2 populate non-employee tables (copy from backup, global v4→v7 map applied to PK + FKs + soft-refs `audit_logs.record_id`/`notebook_dictionary.reference_id`/`*_by`; v7 embeds row's `created_at`).
  - ⏳ 2.3 populate employees from SSOT (`DPI_Finca.csv` + `RENAP_..._Finca.csv`) → `workers` + `worker_documents`/`dpi_documents`/`birth_certificate_documents`; CUI verbatim; activity/payroll `worker_id` left holding old v4 transiently.
  - ⏳ 2.4 `worker_reassignment` table + steward tooling (old worker → SSOT worker), dropped-veteran gate.
  - ⏳ 2.5 swap SQL (schema move) + Prisma baseline reconcile.
  - ⏳ 2.6 verification script (row-count conservation, payroll-total conservation, zero orphans, all PKs v7).

## Critical path
`0 ✅ → 1 → 2 → [GATE-AUTH] 5.0→5.6 → 6 → 7 → 9`, with **7 also blocked by GATE-PAYROLL (4)**. Stages 3 and 8 run in parallel off Stage 1.

## What I can start NOW (no gates): Stages **1, 2, 3, 8** (all code-only / no prod DB).
## What's blocked: Stage 4 (Q3), Stages 5–7 (Q2), Stage 7 (also Q3).
