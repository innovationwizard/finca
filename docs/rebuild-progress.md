# Rebuild — LIVE Progress Tracker (single source of truth)

**Purpose:** Survive context compaction. This is THE live record of progress for the whole effort (downtime → UUIDv7 rebuild → SSOT roster → séptimo → key migration → lift downtime). Tick each sub-batch the moment it's done; the Progress Log at the bottom records file-level detail. **On resume: go to "RESUME HERE" and start at the first unchecked box.**

**Plans (the what/why):** [master-build-order.md](master-build-order.md) (dependency order) · [uuidv7-rebuild-migration-plan.md](uuidv7-rebuild-migration-plan.md) · [ssot-roster-import-plan.md](ssot-roster-import-plan.md) · [septimo-refactor-plan.md](septimo-refactor-plan.md). This tracker supersedes the older `septimo-refactor-progress.md` log.

## Gates & rules (binding)
- **GATE-AUTH ✅ lifted:** I execute destructive prod steps, **pausing at each checkpoint** to report.
- **GATE-PAYROLL ✅ resolved:** build payroll-generation (Batch 4) — idempotent on-demand "Recalcular nómina", preserves manual bonification/advances/deductions.
- Jorge drives git (no commits by me). Code stages use `prisma generate` only (no DB). Destructive stages = Batch 5+.
- Hard rules: no worker inline CRUD ([[feedback_no_inline_crud]] — workers selected; CRUD only on `/trabajadores`; annual/activities plan exempt); repo-boundary; CUI captured **verbatim** (no format regex); UUIDv7 for all ids.
- **✅ SSOT human-verification attestation (Jorge, 2026-06-12):** every record in BOTH SSOT files (`DPI_Finca.csv` + `RENAP_Birth_Certificates_Finca.csv`) is **four-eyes human-verified, TWICE**, covering `cui`/`apellidos`/`nombres` for every row, no exceptions. Files are trusted canon; values captured verbatim, no formula validation. Full text: [ssot-roster-import-plan.md §0](ssot-roster-import-plan.md#0-human-verification-attestation-canonical--supersedes-any-earlier-per-file-note).

## ✅ PROJECT COMPLETE — live & verified. Done: rebuild (UUIDv7 + SSOT roster) · reassignment + unidentified purge · Prisma baseline · downtime lifted · séptimo (calendar-week) · no-inline-CRUD audit (pass) · Supabase keys migrated+rotated. **PITR NOT enabled (paid).**

### Ship: field-user loop (2026-06-13)
- **Re-opened latest period #8** (2627, 2026-05-14…06-11) — was closed in the séptimo cutover; field user needs an open period to enter. Now 1 open period (#8, 0 records → ready for entry).
- **Fixed FIELD lockout** — `planilla/page.tsx` guarded with READ_ALL_ROLES (excludes FIELD) while its own `canWrite` + `PlanillaList` edit/delete were built for FIELD → field user was thrown UNAUTHORIZED on their own landing page. Now `requireRole(...READ_ALL_ROLES, "FIELD")`. Field-user loop works: view present info (`/planilla`), add (`/planilla/captura`, period open), correct (PlanillaList PATCH/DELETE = WRITE_ROLES). tsc clean.
- Heads-up: #8 ends 06-11; entering the CURRENT week (06-12+) needs an admin to either **extend #8's end date** (new edit feature ↓) or open a new period.
- **Pay-period date editing (new, 2026-06-13):** `PATCH /api/pay-periods/[id]` (MASTER/ADMIN, audited) + `EditPeriodModal` "Editar fechas" button on Planilla. Edits start/end dates; validates start≤end; **no record-orphan guard (Jorge's choice — full freedom)**; agriculturalYear/periodNumber untouched. Next recalc re-derives séptimo week-ownership by date. So an admin can extend #8 to cover the current week instead of creating a new period.
  - **WHY (Jorge, 2026-06-13 — preset & normally met; these are exceptional):** (1) *early payment* — unexpected cash-flow → employees agree to be paid a few days **before** the preset date (end moves earlier); (2) *extension* — government/political matters block transactions on the preset date → period **extends** to the first future day transactions are possible (end moves later). Full reasoning + verbatim quote: memory `[[project_pay_period_dates]]`.

Optional items left: **DEC-4 `is_minor` toggle** (7 birth-cert workers, loaded false) · recurring `pg_dump` job (since no PITR).

**DECISION (Jorge, 2026-06-13): mapping STOPPED at 96/216.** The remaining 120 unmapped old workers carried hallucinated names no human in the operation recognizes. *"Do not bring unidentified records into the new tables."* → their records purged from NEW tables only; raw history retained in the `*_backup` tables + the one-time pre-rebuild dump (PITR is NOT enabled — paid add-on).

- Done: 5.1–5.6 ✅ (public=new schema; **roster=39** loaded). 9.1 mapping closed at **96/216** (39/39 canonical used).
- [x] 9.2 `06a_purge_unidentified.ts --commit` ✅ — removed 756 activity + 6 payroll (Q5,843) + 7 notebook soft-refs from new tables; 120 rows stamped `purged_at`; hard reconciliation (deleted == snapshot) passed.
- [x] 9.2 `06_apply_reassignment.ts --commit` ✅ — 1,674 activity + 33 payroll (34→33, one merge-by-sum) + 54 soft-refs remapped to 39 canonical; zero orphans.
- [x] 9.3 `09_add_worker_fks.sql` ✅ — both worker FKs added (DB-level hard-validation of zero orphans).
- [x] 9.3 `08_verify.ts` ✅ **ALL CHECKS PASSED** — made purge-aware (`public == backup − authorized purge`, exact). Money: Σ total_to_pay Q31,744.50 == Q37,587.50 − Q5,843.00. All PKs UUIDv7; roster 39/39 docs; zero orphans.
- [x] 9.4 `11_snapshot_drop_reassignment.ts --commit` ✅ — worker_reassignment snapshotted to `backups/worker_reassignment-audit.json` (216 rows: 96 mapped, 120 purged), then DROPPED. `migrate diff` now exit 0 (live DB == schema.prisma, app tables).
- [x] 9.4 **Prisma baseline** ✅ — 11 stale migrations archived → `prisma/_migrations_archive_prerebuild_20260613/`; single `20260613000000_baseline_post_rebuild` generated (18 tables, 9 enums, 15 FKs) from schema.prisma; `_prisma_migrations` reset + baseline marked applied; **`migrate status` = "Database schema is up to date!"**. `prisma migrate deploy` is now a safe no-op.
- **REBUILD COMPLETE & VERIFIED.** Ready for Jorge to lift downtime.

### Git staging (Jorge commits — repo files changed this batch)
- New: `scripts/rebuild/06a_purge_unidentified.ts`, `scripts/rebuild/10_unmapped_review.ts`, `scripts/rebuild/11_snapshot_drop_reassignment.ts`
- Modified: `scripts/rebuild/06_apply_reassignment.ts` (gate honors purged_at), `scripts/rebuild/08_verify.ts` (purge-aware conservation)
- Migrations: deleted 11 folders under `prisma/migrations/` (moved to `prisma/_migrations_archive_prerebuild_20260613/`); added `prisma/migrations/20260613000000_baseline_post_rebuild/migration.sql`
- Docs: `docs/ssot-roster-import-plan.md` (§0 attestation + supersessions), `docs/uuidv7-rebuild-migration-plan.md`, `docs/rebuild-progress.md`
- Gitignored (NOT committed): `backups/*` (reassignment-map.json, worker_reassignment-audit.json, unmapped-review.html, reassignment-worksheet.html)

---

## Batch 0 — Downtime  ✅ DONE
- [x] 0.1 Maintenance notice (`src/app/page.tsx`)
- [x] 0.2 App-wide redirect (`src/middleware.ts`, `MAINTENANCE_MODE`); lift LAST (9.x)

## Batch 1 — Target schema + consumer refactor  ✅ DONE (`next build` green)
- [x] 1.1 schema: all 14 ids → `@default(uuid(7))`
- [x] 1.2 schema: enriched `Worker` (DPI canon) + `DocumentType` + `WorkerDocument`/`DpiDocument`/`BirthCertificateDocument`
- [x] 1.3 `prisma generate` OK
- [x] 1.4 `validators/worker.ts` → `apellidos`/`nombres`/`cui` + `deriveFullName`
- [x] 1.5 `api/workers/route.ts`
- [x] 1.6 `api/workers/[id]/route.ts`
- [x] 1.7 `api/resumenes/route.ts` (payload `dpi` key kept = cui value)
- [x] 1.8 `trabajadores/page.tsx` + `workers-list.tsx`
- [x] 1.9 `trabajadores/nuevo/page.tsx` (create form)
- [x] 1.10 `worker-profile.tsx` + `trabajadores/[id]/page.tsx` (edit profile)
- [x] 1.11 `next build` green

## Batch 2 — Rebuild scripts (code only; executed in Batch 5)  ✅ COMPLETE (all tsc-clean)
Mechanism: build new tables in transient `rebuild` schema → populate → atomic schema swap.
- [x] 2.1 `scripts/rebuild/01_create_new_schema.sql` — full new-schema DDL (`prisma migrate diff --from-empty`)
- [x] 2.2 Populate non-employee tables — `scripts/rebuild/02_populate.ts` (tsc clean; runtime-validated in Batch 5 dry-run)
  - [x] 2.2.1 UUIDv7-from-timestamp generator (`scripts/rebuild/lib/uuidv7.ts`) — self-test PASS
  - [x] 2.2.2 idmap build + copy with PK + hard-FK remap (config-driven, info_schema column discovery)
  - [x] 2.2.3 soft-refs remapped: `system_settings.updated_by`, `pay_periods.closed_by`, `activity_prices.created_by`, polymorphic `notebook_dictionary.reference_id` + `audit_logs.record_id`; worker-cols kept transient; row-count conservation enforced; dry-run=rollback
- **⚠️ DDL split required (affects 2.1 / executed in 5.3):** create new tables WITHOUT `activity_records_worker_id_fkey` & `payroll_entries_worker_id_fkey` — those reference workers and the records hold old-v4 worker_id until reassignment; **add them in Batch 9.2** after reassignment.
- [x] 2.3 Populate employees from SSOT — `scripts/rebuild/lib/csv.ts` (RFC-4180 parser, unit-tested) + `scripts/rebuild/03_populate_employees.ts`
  - [x] 2.3.1 CSV parser (verbatim, BOM-safe, quote/comma/newline handling) — tsc + synthetic test PASS
  - [x] 2.3.2 `DPI_Finca.csv` → `worker` + `worker_document(DPI)` + `dpi_document` (typed Prisma nested create; v7 auto)
  - [x] 2.3.3 `RENAP_..._Finca.csv` → `worker` + `worker_document(BIRTH_CERTIFICATE)` + `birth_certificate_document`; ISO dates validated (no coercion); parents verbatim text; CUI verbatim + cross-file dup check + non-13-digit surfaced (no reject); ⚠ DEC-4 `is_minor=false` pending confirm
  - [x] 2.3.4 **Sequencing change:** employees load **via Prisma into `public` AFTER the swap** (typed, lower-risk) — not raw into `rebuild`. activity/payroll `worker_id` transient is handled in 02 (rebuild, pre-swap).
- **Batch-5 order updated:** 5.3 create (no worker FKs) → 5.4 populate non-employee (`02`, rebuild) → **5.6 swap** → **5.5′ load employees (`03`, public, Prisma)** → reassignment (Batch 9) → add worker FKs → verify.
- [x] 2.4 `worker_reassignment` table + steward tooling (216→38) + dropped-veteran gate
  - [x] 2.4.1 setup — `scripts/rebuild/04_reassignment_setup.ts` (table + worksheet from backup.workers + transient-worker_id counts; read-only dry-run; idempotent commit). tsc clean.
  - [x] 2.4.2 apply — `scripts/rebuild/06_apply_reassignment.ts`: dropped-veteran gate (abort if record-bearing old worker unmapped); activity_records plain remap; **payroll_entries merge-by-sum** on `(period,worker,category)` collisions (total_to_pay recomputed); worker soft-refs (notebook_dictionary + audit_logs) remapped; orphan check; dry-run=rollback. tsc clean.
  - [x] 2.4.3 steward artifact — `scripts/rebuild/05_gen_reassignment_artifact.ts` (generate offline HTML w/ SSOT dropdowns → JSON; `--ingest` loads JSON into worker_reassignment). `reassignment-worksheet.html` gitignored (PII). tsc clean.
- [x] 2.5 Swap + worker-FK split — `07_swap.sql` (atomic schema move old 14→backup, new 18→public; `_prisma_migrations` stays), `09_add_worker_fks.sql` (deferred worker FKs, Batch 9.2), `01` edited to omit those 2 FKs, Prisma re-baseline procedure documented in 07.
- [x] 2.6 Verification — `scripts/rebuild/08_verify.ts` (read-only): row-count conservation, money conservation (Σ total_earned / total_to_pay), zero orphans, every PK valid UUIDv7, roster integrity. Exits non-zero on any fail. tsc clean.

## Batch 3 — Séptimo supporting code (code only)  ⏳
- [x] 3.1 séptimo-amount `SystemSetting` + read helper — `src/lib/payroll/septimo.ts` (key/group/label consts, default Q150, `getSeptimoAmount()` w/ fallback). tsc clean.
- [x] 3.2 `holiday` CRUD — `src/lib/validators/holiday.ts` + `src/app/api/admin/holidays/route.ts` (GET/POST) + `[id]/route.ts` (DELETE); role-guarded + audited; unique-date guard. tsc clean.
- [x] 3.3 config UI — `septimo-holidays-settings.tsx` (amount field via `/api/admin/septimo-amount` PUT-upsert; holiday list/add/delete) + `/api/admin/septimo-amount/route.ts`; mounted on `/admin/actividades`. tsc clean.
- [x] 3.4 captura grid: removed "domingo (séptimo)" toggle + `includeSunday`; week fixed to Mon–Sat (6). tsc clean.
- [x] 3.5a `calcNetPay` += `seventh_day_pay` (`src/lib/utils/calculations.ts`; foundational for Batch 4). tsc clean.
- [→] 3.5b show séptimo as own line (pagos/resúmenes/profile) — **moved to Batch 7** (paired with the computation, since the value is 0 until then).

## Batch 4 — Payroll-generation (code only)  ✅ COMPLETE (4.2b UI button = minor follow-up)
- [x] 4.0a `Worker.category` field (WorkerCategory, default VOLUNTARIO; toggleable, not permanent) — schema + `prisma generate` + rebuild DDL regenerated (worker-FK split re-applied). SSOT load defaults to VOLUNTARIO.
- [x] 4.0b worker validator (`category` enum) + profile category toggle (`worker-profile.tsx` + `[id]` route/page). tsc clean.
- [x] 4.1 recompute service — `src/lib/payroll/recalc.ts` (`recomputePayroll`): sum activity → upsert payroll_entry, category = worker.category snapshot, preserve manual + seventhDayPay, totalToPay via calcNetPay, zero stale entries. tsc clean.
- [x] 4.2 recalc API — `src/app/api/admin/payroll/recalc/route.ts` (POST, settings roles, refuses closed periods, transactional, audited). tsc clean.
- [→] 4.2b "Recalcular nómina" UI button — minor follow-up; pairs with the planilla period view / Batch 7 display.

## Batch 5 — Rebuild EXECUTION  ⛔ destructive · I run · pause each checkpoint  ⏳
- [x] 5.1 Phase-0 verify ✅ — PG **17.6** (no native uuidv7 → JS gen confirmed); **0** RLS/views/triggers/sequences on public → swap has no deps; 15 base tables (14 + _prisma_migrations). `scripts/rebuild/00_phase0_verify.ts`.
- [x] 5.2 Backup ✅ — `backups/pre-rebuild-20260612-171435.dump` (493K, custom fmt, pg_restore-validated). **PITR is NOT enabled (Supabase paid add-on; Jorge 2026-06-13).** So point-in-time recovery is unavailable; recovery relies on this one-time dump + any plan-level daily backups.
- [x] 5.3 Ran `01` in `rebuild` schema ✅ — single txn, 18 tables created; enum fix (reuse public enums + DocumentType in public + search_path); public untouched.
- [x] 5.4 Populate non-employee ✅ **--commit done** — rebuild holds remapped data (activity_records 2430, payroll 40, users 8, …); rebuild.workers=0 (employees post-swap); conservation OK; public intact (workers=216). idmaps dropped.
- [ ] 5.5 Run 2.3 populate (SSOT employees)  → **CHECKPOINT (38 loaded)**
- [x] 5.6 Swap ✅ — `07_swap.sql` ran (atomic, exit 0): public=19 base tables (18 new + _prisma_migrations), backup=14 (old, workers=216), rebuild dropped. public.workers=0, activity_records=2430. **public is now the new schema; old data safe in backup.**
- [x] 5.5′ Employee load ✅ — roster **39** (32 DPI + 7 birth-cert; a 7th RENAP row was added later & loaded via now-idempotent `03`, which skips existing CUIs). 39 documents. is_minor=false (DEC-4).
- [ ] 5.7 Prisma baseline reconcile + Batch-9 reassignment + 09 worker FKs + 08 verify
- [x] NOTE: Supabase PITR **resolved — NOT enabled** (paid add-on, Jorge 2026-06-13). Safety net = one-time pre-rebuild dump + plan daily backups; no continuous point-in-time recovery. ⚠ If finer recovery is wanted without paying, set up a recurring `pg_dump` job.

## Batch 6 — Deactivate `SP` activity  ⛔ data write · after 5  ⏳
- [ ] 6.1 set séptimo `SP` activity `isActive=false`

## Batch 6.1 + 7 — Séptimo computation + activation  ✅ COMPLETE (2026-06-13)
- [x] 6.1 deactivate `SP`/"Septimo" activity (isActive=false) — `scripts/finalize-septimo-cutover.ts`. 0 records referenced it; purely prevents future mis-entry.
- [x] 7.1 `computeSeptimoForPeriod` (`src/lib/payroll/septimo.ts`) — **CALENDAR-week model (Jorge 2026-06-13): periods may be any length; required days accumulate ACROSS pay periods.** A period owns the weeks whose **Saturday** falls in its range; required = that week's Mon–Sat − holidays (exact + recurringAnnual); attendance read **by date across all periods**; all required attended → 1 amount/week. UTC throughout. tsc+eslint clean.
- [x] 7.2 integrated into `recomputePayroll` — séptimo computed & written each run for owned weeks (UNION of in-period earners + séptimo-only earners; manual bonif/adv/ded preserved; totalToPay incl. séptimo); recalc API refuses closed periods = going-forward only (reads prior attendance by date, never rewrites closed). Verified read-only via `scripts/verify-septimo.ts` (all periods); #7 stable at Q13,050/35.
- [x] 7.3 séptimo shown as its own line + API selects: pagos (`api/pagos` + `pagos-view`), resúmenes (`api/resumenes` + `resumen-tabs` + `resumenes-client`), worker profile (`api/workers/[id]` + `trabajadores/[id]/page` + `worker-profile`), and worker-merge sum (`api/admin/workers/merge`). tsc+eslint clean.
- **Cutover executed (Jorge 2026-06-13):** recalc'd #7 (2026-04-13…05-14, 32d) → 38 entries, 35 earn séptimo, **Σséptimo Q13,050**, Σtopay Q71,730; then closed all 11 periods. Séptimo now applies only to periods opened from here on. (#6 keeps its pre-séptimo payroll — no restatement of history, per plan.)

### Git staging (Batch 7 — Jorge commits)
- New: `src/lib/payroll/septimo.ts` (computeSeptimoForPeriod), `scripts/verify-septimo.ts`, `scripts/run-recalc.ts`, `scripts/finalize-septimo-cutover.ts`
- Modified: `src/lib/payroll/recalc.ts`, `src/app/api/pagos/route.ts`, `src/app/(authenticated)/pagos/pagos-view.tsx`, `src/app/api/resumenes/route.ts`, `src/app/(authenticated)/resumenes/resumen-tabs.tsx`, `src/app/(authenticated)/resumenes/resumenes-client.tsx`, `src/app/api/workers/[id]/route.ts`, `src/app/(authenticated)/trabajadores/[id]/page.tsx`, `src/app/(authenticated)/trabajadores/[id]/worker-profile.tsx`, `src/app/api/admin/workers/merge/route.ts`

## Batch 8 — Supabase key migration (code + env)  ✅ COMPLETE
- [x] 8.1 all 5 usages migrated: `NEXT_PUBLIC_SUPABASE_ANON_KEY`→`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (middleware, client, server); `SUPABASE_SERVICE_ROLE_KEY`→`SUPABASE_SECRET_KEY` (service, admin/users). tsc clean.
- [x] 8.2 `.env.example` updated to current key names (sb_publishable_/sb_secret_). ✅ **DONE (Jorge, 2026-06-13):** real keys set in `.env.local` + deploy env; legacy anon/service_role keys rotated/disabled; login + admin smoke-tested.

## Batch 9 — Worker reassignment + lift downtime  ⏳
- [~] 9.1 Jorge fills `worker_reassignment` (216→38) — IN PROGRESS: **90/216 committed**, 120 record-bearing unmapped, 37/38 canonical used. Worksheet (`05`) pre-fills + "solo pendientes" toggle; Generar exports full cumulative map. Loop: send JSON → ingest --commit → regenerate. Apply (06) blocked until unmapped_with_records=0.
- [ ] 9.2 apply reassignment; add `activity_records`/`payroll_entries` worker FK; validate (dropped-veteran gate)
- [ ] 9.3 final `next build` + smoke test
- [ ] 9.4 set `MAINTENANCE_MODE=false`, redeploy

## Batch 10 — Enforce no-inline-CRUD (workers only) audit  ✅ PASS (2026-06-13, no remediation needed)
- [x] 10.1 audited all worker create/edit/delete + selection paths. **Worker mutations are structurally confined to 3 API routes** — create `POST /api/workers` (← `/trabajadores/nuevo`), edit `PATCH /api/workers/[id]` (← `/trabajadores/[id]`), soft-offboard `POST /api/admin/workers/merge` (← `/admin/trabajadores-duplicados`). No `worker.create`/`delete` in any OCR/batch/captura/import path (historical auto-create vector gone). No hard delete (offboard = isActive=false). Only other API ref is read-only `GET /api/workers?active=true` (offline sync).
- [x] 10.1 worker SELECTION is dropdown/search-from-roster everywhere; captura grid "+ Trabajador" filters the existing roster and adds by `id` (`grid-client.tsx:167-170`); all entry APIs require `workerId: z.uuid()` validated active server-side; no free-text name entry, no name→ID resolution at entry, no inline create. Annual/activities-plan inline CRUD untouched (exempt). **Verdict: compliant; nothing to fix.**

---

## Progress Log
- **2026-06-12** — Tracker created (consolidates prior logs). Batches 0 & 1 complete (`next build` green). Batch 2.1 done (`scripts/rebuild/01_create_new_schema.sql`). RESUME at 2.2.
- (file-level detail for 0/1/2.1 is in [master-build-order.md](master-build-order.md) Progress Log.)
- **2026-06-12 — Batch 2.2–2.4 authored (all tsc-clean; runtime-validated in gated Batch 5):**
  `scripts/rebuild/lib/uuidv7.ts` (v7-from-ts, self-tested), `lib/csv.ts` (RFC-4180, unit-tested), `02_populate.ts` (non-employee v4→v7 + soft-refs), `03_populate_employees.ts` (SSOT → workers+docs, Prisma post-swap), `04_reassignment_setup.ts`, `05_gen_reassignment_artifact.ts`, `06_apply_reassignment.ts` (dropped-veteran gate + payroll merge-by-sum). Confirmed all dates ISO YYYY-MM-DD (Jorge). Sequencing: employees load post-swap via Prisma. Worker FKs deferred to Batch 9.2.
