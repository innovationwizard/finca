# UUIDv7 Rebuild Migration Plan (build-new-tables + SSOT employees + swap)

**Status:** PLAN ONLY. No DB writes, no schema changes, no code executed. Proposal for your sign-off.
**Date:** 2026-06-11
**Authorization:** NONE yet. Execution requires your explicit go, and the worker reassignment step is row-by-row by you.
**Companion docs:** [docs/ssot-roster-import-plan.md](ssot-roster-import-plan.md) (reconciliation + enriched schema detail), [docs/roster-architecture-research.md](roster-architecture-research.md) (rationale).
**Source of truth for employees:** `SSOT-DO-NOT-UPDATE/` (read-only; never written).

---

## 1. Strategy (your instruction, verbatim intent)

1. **Keep all existing tables → they become their own backups.**
2. **Create new replacement tables → these become the prod tables.**
3. **Populate the new tables with all values from the backup tables**, EXCEPT:
   - **3.1** every UUIDv4 is replaced with a UUIDv7 value;
   - **3.2** the **employees** table is populated from the local `SSOT-DO-NOT-UPDATE/`, not copied.
4. **Swap** (downtime acceptable) — chosen mechanism: **rename** (Option A; assessed below).

## 2. Decisions recorded (from your answers)

- **DEC-2 (worker remap):** historical `activity_records` & `payroll_entries` are reassigned to canonical SSOT identities **row-by-row, by you, after the new tables exist.**
- **DEC-1 (employees schema):** **full enriched schema** (structured names, CUI identity key, typed `worker_document` records, images).
- **DEC-3 (old worker soft-refs):** **remap to canonical** where a mapping exists; flag any unmapped for your review.
- **Swap mechanism:** **rename** (Option A).

## 3. Swap mechanism assessment (security → enterprise quality → speed)

**Option A — RENAME (recommended, chosen):** build new tables under temp names, then `ALTER TABLE` rename old → `*_backup`, new → canonical. Prisma `@@map` names stay canonical.
- **Security:** atomic metadata-only DDL in one transaction; no code-deploy race; no window pointing at a half-built table; backups retained in-DB and lockable. Strongest.
- **Enterprise quality:** no naming drift; canonical names preserved; migration decoupled from code release. Highest.
- **Speed/ease:** instant rename; for 1:1-copied tables, zero code change; downtime ≈ the swap transaction. Easiest.

**Option B — point code at new names (`*_v2`), no rename:** weaker on all three — needs a lockstep code deploy at cutover, permanent naming drift (violates Rule 12), more steps. Rejected.

> Note: rename keeps table **names** stable, so the 1:1-copied tables need no code change. The **employees** model + its consuming code change regardless, because step 3.2 enriches that schema — inherent to 3.2, not to the swap choice.

---

## 4. The id-reference map (what 3.1 must touch — nothing silently missed)

UUIDv4→v7 replacement is a **globally consistent old→new map** applied to PKs **and** every reference. References fall into three classes:

**(a) Hard foreign keys (DB-enforced):**
`activity_prices.activity_id`→activities; `activity_records.{pay_period_id, worker_id, activity_id, lote_id}`; `payroll_entries.{pay_period_id, worker_id}`; `coffee_intakes.lote_id`; `plan_entries.{lote_id, activity_id}`; `production_estimates.lote_id`; `audit_logs.user_id`→users.

**(b) Soft references (NO FK constraint — would break silently if missed):**
`system_settings.updated_by`→users; `pay_periods.closed_by`→users; `activity_prices.created_by`→users; `notebook_dictionary.reference_id`→worker|activity|lote (polymorphic via `category`); `audit_logs.record_id` (TEXT, polymorphic via `table_name`).

**(c) Worker-pointing references that CANNOT use the v4→v7 map** (because employees are rebuilt from SSOT, not copied — they need DEC-2 row-by-row reassignment):
`activity_records.worker_id`, `payroll_entries.worker_id`, `notebook_dictionary.reference_id` where `category='worker'`, `audit_logs.record_id` where `table_name='workers'`.

Everything in (a) and (b) **except** the worker-pointing subset remaps deterministically and immediately from the global v4→v7 map. The (c) subset is resolved during reassignment (DEC-2/DEC-3).

---

## 5. Phased plan

> Conventions: scripts run `npx dotenv -e .env.local -- npx tsx …`, **dry-run by default, `--commit` to mutate**; every mutation transactional, idempotent, audited. Strict TS, no suppressions (Rules 7, 9). No mock/placeholder data anywhere (Rule 6).

### Phase 0 — Environment verification (READ-ONLY; Rule 11, verify don't assume)
- Confirm **Supabase Postgres version** (determines whether native `uuidv7()` exists — only Postgres 18+ — vs. generating v7 in the migration script via a vetted library).
- Confirm **Prisma version** and whether `@default(uuid(7))` (client-side v7) is the right forward-default mechanism.
- Enumerate **RLS policies, views, triggers, sequences** on every table — rename carries policies/triggers with the table, but views/functions referencing literal names must be updated. List them before touching anything.
- Confirm **no external system stores our UUIDs** (only `users.supabaseId` links out to Supabase auth, and it is unchanged — verify nothing external persists our PKs).
- **v7 timestamp source ✅ resolved:** each migrated row's v7 id embeds its original `created_at` (truthful time-ordering of historical rows). Requires a v7 generator that accepts an explicit timestamp; verify the chosen library supports this (Rule 11).

### Phase 1 — Backup integrity (the safety floor)
- Take a full **logical backup** (`pg_dump`) **and** confirm a **Supabase point-in-time-restore** checkpoint, before any DDL. Step 1's "old tables become backups" is in-DB retention; the external backup is the true rollback floor (a bad rename/transaction could still damage state).

### Phase 2 — Build new tables (temp names, e.g. `*_v7`)
- Recreate all 14 tables with **identical structure** to current, **except employees**, which gets the **enriched schema** (DEC-1):
  - `worker` (identity) — **field names match DPI canon (`DPI_Finca.csv`) verbatim:** `id` UUIDv7; `cui` (normalized, **unique** — identity key); `apellidos` (both surnames, **combined — NOT split**); `nombres` (given names, combined); `fecha_nacimiento`; `sexo`; `nacionalidad`; `lugar_nacimiento`; `vecindad`; `pueblo`; `comunidad_linguistica`; `estado_civil`. App-added (not in canon): lifecycle `status`, `person_photo_url`, `is_minor`, `start_date`/`end_date`, provenance (`source_file`, `page`, `extraction_confidence`, `notes`). The DPI-card `fecha_vencimiento` lives on `dpi_document`, not the identity.
  - **Document model — shared parent + typed children (DEC-1a, your decision: class-table inheritance):**
    - **`worker_document` (parent / supertype):** `id` UUIDv7 PK; `worker_id` → `worker` (FK); `type` discriminator (`DPI` | `BIRTH_CERTIFICATE`); `cui_as_printed` (provenance — the canonical UNIQUE CUI lives on `worker`); shared provenance `extraction_confidence`, `notes`, `source_file`, `source_page`, `imported_at`, `created_at`, `updated_at`. One-to-many from `worker`; partial unique index `(worker_id, type)`.
    - **`dpi_document` (child, 1:1):** `document_id` PK **= FK → `worker_document.id`** (shared key); `fecha_vencimiento`, `front_image_url`, `back_image_url`; plus DPI-**stated** person attributes for provenance (`sexo`, `nacionalidad`, `lugar_nacimiento`, `vecindad`, `pueblo`, `comunidad_linguistica`, `estado_civil`, `fecha_nacimiento` — as printed on the card).
    - **`birth_certificate_document` (child, 1:1):** `document_id` PK **= FK → `worker_document.id`**; `correlativo`, `fecha_emision_certificado`, `image_url`; `inscrito_lugar_nacimiento`, `inscrito_fecha_nacimiento`, `inscrito_sexo` (as stated); `madre_nombres_apellidos`/`madre_cui`/`madre_fecha_nacimiento`/`madre_lugar_origen`; `padre_*` (same set).
    - Every SSOT column from both files is represented across parent + children; nothing discarded. Each child shares the parent's UUIDv7 id (true 1:1 supertype/subtype).
  - Images stored in **Supabase Storage** (**DEC-1b ✅ confirmed**): private bucket **`identity-documents`** for DPI/birth-cert images, dedicated bucket **`person-photos`** (to be provisioned) for person photos; DB holds object paths only (never binaries). Private-bucket access via short-lived signed URLs generated server-side with the **secret key** (`sb_secret_…`) — never client-exposed (§7).
  - **Image fields (all nullable; jpg/png only, no PDF):** `Worker.person_photo_url`, `DpiDocument.front_image_url`, `DpiDocument.back_image_url`, `BirthCertificateDocument.image_url`. Every image pointer is nullable — an employee or document may exist before its scan is uploaded.
  - **Folder ↔ field deposit mapping (keyed by CUI; `<ext>` = `jpg` or `png`):**
    ```
    person-photos/
      <CUI>.<ext>                 → Worker.person_photo_url
    identity-documents/   (private)
      <CUI>/
        dpi-front.<ext>           → DpiDocument.front_image_url
        dpi-back.<ext>            → DpiDocument.back_image_url
        birth-certificate.<ext>   → BirthCertificateDocument.image_url
    ```
    `<CUI>` = normalized 13-digit CUI → resolves to exactly one `Worker` (unique). Top-level folder = the Supabase bucket; the `*_url` columns store the path *within* the bucket. A both-documents person has all three files under their `<CUI>/`; a birth-cert-only person has just `birth-certificate.<ext>`. Folder/file names approved.
  - **Stated business rule — recorded verbatim, NOT enforced (per your statement):** _"I have stated that at least one ID document is required to create an employee but I do not have the authority to enforce it."_ → A `Worker` should have ≥1 `WorkerDocument`. This is a cross-row rule; it is **not** implemented as a DB constraint or a create-time block now. Natural enforcement point if/when authorized: the worker-create flow (application layer). Image presence is **not** the trigger — a `WorkerDocument` row can exist without its scan.
  - **Reassignment via a mapping table (DEC, your decision):** a `worker_reassignment` table maps `old_worker_id` (v4, resolvable against the `*_backup` workers table) → `canonical_worker_id` (new SSOT v7). You fill one row per old dirty worker; all that worker's records remap in bulk. The new `activity_records`/`payroll_entries.worker_id` transiently retains the **old** v4 value (no FK to the new `worker` yet); the FK constraint is added only **after** the mapping is applied. No legacy columns on the records, no mock data.
- All new PKs default to **UUIDv7**.

### Phase 3 — Populate new tables from backups (apply global v4→v7 map)
- Build the **complete old→new v7 map** for every row of every table **except employees**.
- Copy each non-employees table, rewriting its PK and all class-(a)/(b) references via the map. Non-worker soft refs (`updated_by`, `closed_by`, `created_by`, non-worker `reference_id`/`record_id`) remap deterministically here.
- **Employees:** load the **38 SSOT identities** (32 DPI + 6 birth-cert) into `worker` + `worker_document` with fresh v7 ids, real SSOT values only. (CUI validation per the SSOT plan; CUI check-digit remains open item O1.)
- **`activity_records` / `payroll_entries`:** copy with new v7 PK and remapped non-worker FKs (`pay_period_id`, `activity_id`, `lote_id`); `worker_id` transiently retains the **old** v4 value (FK to new `worker` not yet added).
- Worker-pointing soft refs (class c): preserve legacy value, leave canonical target pending.

### Phase 4 — Swap (Option A rename; downtime window) — SWAP-FIRST (your decision)
- App to maintenance mode (no writes). In one transaction: rename each `*` → `*_backup`, each `*_v7` → canonical name. Update any views/functions found in Phase 0. Run as a **tracked Prisma migration**; update `prisma.config.ts` if needed (package.json#prisma deprecated, Prisma 7). Update Prisma models to the enriched employees shape + v7 defaults; deploy. Exit maintenance.
- **Worker FK deferred:** the `worker_id → worker.id` FK on `activity_records`/`payroll_entries` is **NOT** added at swap — the records still hold old v4 worker values that don't resolve against the new `worker` table. It is added in Phase 6, after reassignment.
- **Integrity-gap safeguards for the post-swap window (Rule 3 / Rule Zero — required because swap precedes reassignment):**
  - Historical worker-joined views/reports must be **gated/hidden** until reassignment completes, so unresolved joins are never shown as if real (Rule 6 — no false information).
  - New payroll on the clean 38-person SSOT roster is unaffected and can proceed.
  - The `*_backup` tables remain both the rollback floor and the source for the reassignment tooling.

### Phase 5 — Row-by-row worker reassignment (DEC-2; YOU, on LIVE prod, post-swap)
- Tooling lists each old dirty worker (from `*_backup`: full name, record counts, payroll totals) and lets **you** set its `worker_reassignment` row → one SSOT identity. The proven payroll-clash-sum logic from `/api/admin/workers/merge` is reused on apply.
- **Apply:** `UPDATE` each `activity_records`/`payroll_entries` SET `worker_id = canonical_worker_id` via the mapping. Worker-pointing soft refs (DEC-3: `notebook_dictionary.reference_id` where `category='worker'`, `audit_logs.record_id` where `table_name='workers'`) remap through the same mapping table.
- **Dropped-veteran gate:** any old worker carrying records with **no** mapping row is surfaced — must be resolved, never auto-dropped (enforced by the Phase-6 FK validation).

### Phase 6 — Add worker FK + verification (closes the integrity-gap window)
- After all reassignment is applied: **add the FK** `worker_id → worker.id` and validate — fails if any record remains unmapped (hard enforcement of the dropped-veteran gate). Then un-gate the historical worker-joined views.
- Verification invariants (against `*_backup`): per-table **row counts** (employees excepted — 38 + reassignment accounting); **conservation** of total activity-record count and total payroll amounts; **zero orphaned** hard FKs; all class-(b) soft refs resolve, class-(c) remapped or on a signed-off exception list; all PKs valid **UUIDv7**.

### Rollback
- Pre-swap: discard staged `*_v7` tables; old tables untouched and still serving. Zero data risk.
- Post-swap: reverse the rename (`*_backup` → canonical), or restore from the Phase-1 backup / PITR. Because old tables are retained in-DB, rollback is a rename; the external backup is the floor.

---

## 6. Engineering standards (THE RULES)
- **Rule Zero:** only what's requested; max caution on reliability — hence backup floor, staged build, post-swap FK-gated verification + view-gating during the integrity window, human row-by-row reassignment.
- **Atomic + observable** (per-table transactions, structured logs); **idempotent & re-runnable** (Rules 7, and the "12"-series). **No mock data** (Rule 6). **No silent drop/failure** — every row copied, reassigned, or surfaced.

## 7. Confirmations still needed before execution
- **DEC-1a ✅ resolved:** shared `worker_document` parent + typed `dpi_document` / `birth_certificate_document` children (class-table inheritance). Two finer modeling points I'm **recommending, not assuming** — confirm or correct:
  - **Person-attribute placement ✅ resolved:** canonical values (DPI canon names — `fecha_nacimiento`, `sexo`, `lugar_nacimiento`, `estado_civil`, etc.) live on the `worker` identity (golden record), **and** each document keeps an as-stated copy for provenance (`dpi_document` / `birth_certificate_document`).
  - **Parents (`madre_*`/`padre_*`) ✅ resolved:** stored as plain attribute columns on `birth_certificate_document` (provenance only; parents are not workers and get no identity of their own).
- **DEC-1b ✅ resolved:** Supabase Storage. Buckets confirmed: **`identity-documents`** (private) for DPI/birth-cert images, **`person-photos`** (dedicated, to be provisioned) for person photos. DB stores object paths only. Private identity-document images served via **short-lived signed URLs generated server-side**.
- **Supabase env vars — updated to current official documentation** (verified at supabase.com/docs, not training data — Rule 11; legacy keys deprecated by end of 2026):
  - `NEXT_PUBLIC_SUPABASE_URL` — unchanged.
  - **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** — holds the publishable key `sb_publishable_…` (client-safe). Replaces `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - **`SUPABASE_SECRET_KEY`** — holds the secret key `sb_secret_…` (server-only; used for private-bucket signed URLs and admin operations). Replaces `SUPABASE_SERVICE_ROLE_KEY`.
  - **Reconciliation:** this resolves the RULES conflict — the deprecated `anon`/`service_role` keys are retired in favor of publishable/secret. Migration touchpoints (execution, your authorization + secret rotation): `.env.local` and `.env.example` var names, the client init, and `createServiceClient` (currently service-role) → secret key. I will not rotate keys or edit `.env*`; that's yours to action.
- **Reassignment mechanism ✅ resolved:** `worker_reassignment` mapping table (old → canonical), bulk remap per old worker, FK added after apply.
- **Swap ordering ✅ resolved: swap-first** (rename into prod, then reassign on live prod). Worker FK deferred to Phase 6; post-swap integrity-gap safeguards required (historical worker-joined views gated until reassignment completes — Phase 4).
- **v7 timestamp source** — embed original `created_at` (recommended) vs. migration-time.

## 8. Open items (carried)
- **O1 ✅ resolved:** you attest the SSOT CUIs are pre-verified. Load-time validation = normalize (strip spaces/dashes) + 13-digit length/format check; any value that still doesn't normalize to 13 digits (incl. the 11 currently non-13-digit) is **surfaced for your review**, not silently accepted or auto-corrected. No check-digit math.
- **O4 (images, in scope):** keying/folder convention **approved** (CUI-keyed layout in Phase 2; jpg/png; all pointers nullable). **Still needed from you (I will not search — repo-boundary rule):** the in-repo **location** where you deposit the `person-photos/` and `identity-documents/` folders, so the load step can upload them to the buckets and populate the `*_url` paths.
