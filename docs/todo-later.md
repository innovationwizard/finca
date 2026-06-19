# TODO LATER

Deferred work that is intentionally NOT done now. Each item records enough context
to execute it safely later. Do not start these without re-confirming scope.

---

## 1. Retroactive MG fix — closed period #7

**Status: deferred.** The open period #8 was already corrected (29 MG records Q0→Q75
+ payroll recalculated). The closed period was intentionally left untouched so #8
could be closed and paid on time.

- **Period:** #7 (agric. year 2627), 2026-04-13 → 2026-05-13, **CERRADO (paid)**.
- **What's wrong:** 39 MG (Mantenimiento General) records were snapshotted at
  `unitPrice = 0` (MG had a Q0 vigencia before 2026-06-08). They should be Q75.
- **Money:** correcting them is **+Q2,925** (39 jornales × Q75) of additional
  devengado for the affected workers — i.e. they were underpaid for that period.
- **Open business decision (Jorge):** how to settle the difference —
  (a) reopen #7, recompute payroll, and pay the difference; or
  (b) correct the records and pay the difference as an adjustment/anticipo in a
      later period; or (c) something else.
- **Mechanics when ready:**
  - Closed periods are refused by `recomputePayroll`'s caller, so #7 must be
    reopened (or handled out-of-band) before recalculation.
  - Reuse the audit + per-period approach from
    `scripts/fix-mg-q75-open-period.ts` (which scopes to OPEN periods only) — a
    sibling script scoped to #7 will be needed.
  - Already-saved records snapshot their price, so the catalog change alone does
    NOT fix them; the records must be updated explicitly.

---

## 2. Remove the deprecated notebook-photo import (code + storage)

**Status: deferred.** Navigation to it was already removed (no link/page/quick-action
exists in the app as of 2026-06-15). The remaining pieces are backend code, one DB
table, and a storage bucket — to be removed as a single clean-up.

The flow has **no live caller** (the captura grid posts to `/api/planilla/captura`,
not the notebook batch endpoint), so removal is low-risk. Inventory:

**Code (delete):**
- `src/app/api/planilla/batch/route.ts` — dead endpoint (`POST /api/planilla/batch`),
  no fetch callers anywhere.
- `src/lib/ai/notebook-dictionary.ts` — used only by the batch route; `src/lib/ai/`
  becomes empty afterward (remove the dir).
- `src/lib/validators/notebook-upload.ts` — `batchInsertSchema`, used only by the
  batch route.

**Stale reference (fix/remove):**
- `src/app/(authenticated)/planilla/captura/grid-client.tsx` line 7 — comment says
  "reusing /api/planilla/batch"; it's inaccurate (captura uses
  `/api/planilla/captura`). Remove/correct when the batch route is deleted.

**Database (migration):**
- Prisma model `NotebookDictionary` → table `notebook_dictionary`
  (`prisma/schema.prisma` ~lines 69–81). Drop the model and generate a migration.
  Confirm no data worth keeping before dropping.

**Storage (Supabase):**
- `notebook-photos` bucket (5 GB limit per project notes) — delete the bucket and
  its contents. No code references it anymore; verify in the Supabase console.

**Order of operations:** remove code refs → delete batch route → drop schema model
+ migrate → delete storage bucket. Run `tsc`/lint after each step.

---

## 3. Polish: hide "Nuevo período" while an open period already exists

**Status: deferred (UX polish, non-blocking).** Closing a period now auto-creates
the next one (`/api/pay-periods/[id]/close`), so the manual "Crear siguiente
período" wizard is redundant in the normal flow — and its **stale suggestion**
(server-rendered `suggestedStartDate` from a pre-refresh view) caused a confusing
"el rango se traslapa con el período N" screen right after Manuel closed #8 on
2026-06-16 (the overlap guard correctly refused a duplicate of the just-auto-created
period — not a bug, but confusing UX).

**Fix:** in `src/app/(authenticated)/planilla/page.tsx`, only render the
`NewPeriodModal` ("Nuevo período") button when there is **no open period**
(`!currentPeriod`). With an open period present, the next one is auto-created on
close, so manual creation isn't needed. Keep the inline `NewPeriodModal` for the
genuine "no open period" case (gap recovery) — that path is still valid.

- Optional extra: if kept available at all, have the wizard recompute its
  suggestion live (or detect the existing next period) instead of relying on a
  server-rendered prop that can go stale after an auto-create.
- The overlap guard in the POST route stays regardless (last line of defense).
