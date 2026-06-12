# Séptimo Refactor — LIVE Progress Tracker

**Purpose:** Survive context compaction. This file is the durable record of progress. Each sub-batch is checked off the moment it is completed; the Progress Log at the bottom records what changed, file by file. If a session is compacted mid-implementation, resume from the first unchecked sub-batch.

**Spec:** [docs/septimo-refactor-plan.md](septimo-refactor-plan.md) (fully specified). **Rules:** [docs/_THE_RULES.MD](_THE_RULES.MD).

## Hard constraints (binding this implementation)
- **Jorge drives git** — implement in working tree only; never commit/push.
- **No prod DB writes without explicit authorization.** Code + schema + authored migration are safe. Steps marked **⛔ GATED-DB** must NOT run until Jorge authorizes.
- New `holiday` table id = **UUIDv7** (`@default(uuid(7))`), per conventions, even though existing tables are v4 (decoupled from the rebuild).
- `prisma generate` only (local codegen, no DB). Never `db push` / `migrate dev/deploy` against prod here.

## ⛔ KNOWN BLOCKER (gates Batch 6)
**No `PayrollEntry` creation path exists in the current code** — it is only read/updated/deleted, never created (the creator was the deleted planilla import). The séptimo computation has no payroll row to attach `seventh_day_pay` to. **Must resolve with Jorge how PayrollEntry rows are created / how séptimo attaches before Batch 6.** Do not invent a payroll-generation engine (Rule Zero).

---

## Batches

### Batch 1 — Schema (code only; migration authored, NOT applied)
- [x] 1.1 Add `seventhDayPay` to `PayrollEntry` in `schema.prisma`
- [x] 1.2 Add `Holiday` model (UUIDv7, date, name, recurringAnnual) in `schema.prisma`
- [x] 1.3 `prisma generate` (regenerate client; validates schema)
- [x] 1.4 Author migration SQL (NOT applied — ⛔ GATED-DB apply is Batch 8.2)

### Batch 2 — Séptimo amount setting (backend)
- [ ] 2.1 Key constant + default (Q150) + validator
- [ ] 2.2 Read helper with code default fallback (150) when row absent
- [ ] 2.3 Settings API path to read/update the séptimo amount

### Batch 3 — Holiday management (backend)
- [ ] 3.1 Zod validators (holiday create/delete)
- [ ] 3.2 Holiday API route (GET list, POST create, DELETE) + role guard
- [ ] 3.3 Audit logging on holiday mutations

### Batch 4 — Config UI
- [ ] 4.1 Séptimo amount field on the settings/config UI (masked? no — plain number)
- [ ] 4.2 Holiday list + add/remove UI

### Batch 5 — Remove the wrong model
- [ ] 5.1 Captura grid: remove "Incluir domingo (séptimo)" toggle; week = 6 days (Mon–Sat)
- [ ] 5.2 Remove any remaining séptimo/`SP` activity-matching references
- [ ] 5.3 **⛔ GATED-DB** Deactivate the `SP` activity row (`isActive=false`)

### Batch 6 — Séptimo computation (CORE) — ⛔ BLOCKED (see blocker above)
- [ ] 6.1 Attendance computation (per worker, per week, required = 6 − holidays that week)
- [ ] 6.2 Write `seventh_day_pay` onto `PayrollEntry` (mechanism pending blocker resolution)
- [ ] 6.3 Scope to current open period + future only

### Batch 7 — Pay total + display
- [ ] 7.1 Update `calcNetPay` to `+ seventh_day_pay` (NOTE: currently dead code — first confirm where `totalToPay` is actually computed)
- [ ] 7.2 Show séptimo as its own line in `resumenes`, `pagos`, worker profile

### Batch 8 — Verification
- [ ] 8.1 `prisma generate` + `tsc --noEmit` + `next lint` + `next build` all green
- [ ] 8.2 **⛔ GATED-DB** Apply migration to prod (Jorge authorization + backup)

---

## Progress Log
- **2026-06-11** — Tracker created. Batches defined. Blocker (no PayrollEntry creation path) identified and flagged. `calcNetPay` found to be dead code (defined, no callers).
- **2026-06-11 — Batch 1 COMPLETE.**
  - 1.1 `prisma/schema.prisma` — added `seventhDayPay Decimal @default(0) @map("seventh_day_pay") @db.Decimal(10, 2)` to `PayrollEntry`.
  - 1.2 `prisma/schema.prisma` — added `Holiday` model (`id` UUIDv7 via `@default(uuid(7))`, `date` unique, `name`, `recurringAnnual`, timestamps; `@@map("holidays")`).
  - 1.3 `npx prisma generate` → OK (Prisma 6.19.2 accepts `uuid(7)`; client regenerated; no DB connection).
  - 1.4 Authored `prisma/migrations/20260611120000_add_septimo_pay_and_holidays/migration.sql` (ALTER payroll_entries ADD seventh_day_pay; CREATE TABLE holidays + unique index). **NOT applied** — apply via `prisma migrate deploy` is ⛔ GATED-DB (Batch 8.2).
  - Note: `holidays.id` has no DB default (UUIDv7 generated client-side by Prisma), unlike the v4 tables' `gen_random_uuid()` default — intentional, per the UUIDv7 convention.
