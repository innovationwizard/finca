# TODO LATER

Deferred work that is intentionally NOT done now. Each item records enough context
to execute it safely later. Do not start these without re-confirming scope.

> Progress 2026-06-16 ("proceed with todo later items"):
> - #3 UX polish — ✅ DONE (NewPeriodModal hidden when an open period exists).
> - #2 notebook teardown — ✅ code + DB DONE: 3 files deleted, comment fixed,
>   src/lib/ai removed, rebuild-script refs cleaned, model removed from schema,
>   `notebook_dictionary` table DROPPED via migration 20260616120000 (64 rows gone,
>   per "full teardown"). REMAINING: delete the `notebook-photos` Supabase bucket
>   (external — Jorge, in the Supabase console).
> - #1 retroactive MG (#7) — ✅ COMPLETE. MG-only fix, +Q2,925 to 15 workers,
>   séptimo preserved (avoided a Q15,075 blanket-recompute). #7 aPagar
>   Q71,730 → Q74,655. The back-pay was already disbursed in the weekly review
>   (paid in reality); the app correction makes the app match. #7 and #8 entries
>   now marked isPaid (77 total) → app reflects reality + /pagos won't re-export.
> - Supabase `notebook-photos` bucket — ✅ DELETED by Jorge (confirmed empty).
>
> **ALL THREE TODO-LATER ITEMS COMPLETE (2026-06-16).**

> Update 2026-06-23 ("work on those TODO" — payroll review/authorize workflow).
> Workflow locked: MANAGER (Manuel) captures + inputs descuentos/adicionales →
> CFO (José Roberto) audits read-only → ADMIN (Luis Arimany) audits + **Autoriza
> pago**, which **closes** the period. MANAGER no longer closes.
> Decisions for **#4 + #7 + #8** (built together):
> - **One shared screen** `/planilla/autorizacion` (PAYROLL_REVIEW_ROLES =
>   MASTER/ADMIN/CFO view; MASTER/ADMIN authorize). Auditor read-only; approver
>   gets "Autorizar pago".
> - **Authorize = close**: reuses the existing close endpoint (lock + auto-create
>   next period; records `closedBy`/`closedAt` + audit log). Gated ADMIN+MASTER.
>   #4 "Vo.Bo." = this authorize action. No separate approval table.
> - **Gating = warn-only**: exceptions/totals shown; button always enabled (no
>   hard block, no reconciliation checkbox). Bank cross-check stays manual.
> - **No snapshot table**: rely on locked PayrollEntry + closedBy/closedAt + audit
>   log (the close already freezes the data).
> - **#7 notes DONE**: `bonification_note` / `deductions_note` added to
>   `payroll_entries` (migration `20260623000000_payroll_adjustment_notes`),
>   required when amount ≠ 0, enforced in `/api/planilla/ajustes` + UI. Feeds the
>   "ajuste sin nota" exception flag.
> - Research persisted in `docs/payroll-audit-dashboard-research.md`.
>
> ✅ **Migration hygiene resolved (2026-06-23):** the `20260623000000` migration
> was applied manually via Supabase SQL editor, then marked applied in Prisma's
> history with `prisma migrate resolve --applied 20260623000000_payroll_adjustment_notes`.
> Future `migrate deploy` runs will skip it correctly.

> Progress 2026-07-16 ("period creation ui was replaced with auto create on
> closing the previous period. remove it."):
> - **#3 — ✅ RESOLVED by removal, not by hiding.** `new-period-modal.tsx` +
>   `create-pay-period-wizard.tsx` deleted (commit `51f0fa6`). They were already
>   dead code — nothing imported them — so the "hide when an open period exists"
>   fix this item described was moot. Gap recovery is covered by Captura's
>   uncovered-days banner; `POST /api/pay-periods` + its overlap guard unchanged.
> - **`scripts/open-successor-period.ts` — added, then REVERTED the same day.**
>   It opened the successor of the open period without closing it, and was used
>   to create #10 (07-16 → 08-08) so 07-13/07-14 could be captured while #9
>   awaited payment authorization. **This was the wrong fix** and the script has
>   been deleted — see the rule below. Its two blast radii:
>   - It broke the **single-open-period** assumption. `autorizacion`, `ajustes`,
>     `dashboard` and `resumen` resolve "the" period with
>     `findFirst({isClosed:false}, orderBy periodNumber desc)` — the NEWEST open
>     — so they pointed at the empty #10 while `captura` (oldest open) pointed at
>     #9. Revisión y Autorización would have authorized and closed an EMPTY
>     period, leaving #9's Q67,010.61 unpaid.
>   - Cleaned up the same day by deleting the empty #10 (0 records, 0 payroll
>     entries — nothing lost), audited as `DELETE_PAY_PERIOD`. The one-off script
>     that did it was removed afterwards: the rule below makes the state it
>     repaired impossible.
> - **THE RULE (Jorge, 2026-07-16), now enforced:** *"At any given point in time,
>   only one period can be open, even when the end date of that period is
>   passed."* When work continues past the open period's end and payment is not
>   yet authorized, that period is **EXTENDED via "Editar fechas"** — it really
>   did run longer, so it really does own that work and its séptimo. A successor
>   is created ONLY by closing (Autorizar pago). Enforced by a 409 in
>   `POST /api/pay-periods` and by the partial unique index
>   `pay_periods_single_open` (migration `20260716200000`).
> - **What actually blocked 07-13/07-14** was not the missing period: those days
>   sat inside #9 and were valid. Captura refused to save the **whole displayed
>   week** because 07-16..07-18 were uncovered. Fixed separately — the guard now
>   trips only when typed data sits on an uncovered day.

---

## 1. Retroactive MG fix — closed period #7

**Status: deferred — BLOCKED on back-pay decision.** The open period #8 was already corrected (29 MG records Q0→Q75
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

**Status: ✅ RESOLVED 2026-07-16 — superseded: the UI was removed entirely rather
than hidden.** Kept here for the context of *why* it existed.

**Original context.** Closing a period auto-creates the next one
(`/api/pay-periods/[id]/close`), so the manual "Crear siguiente período" wizard
was redundant in the normal flow — and its **stale suggestion** (server-rendered
`suggestedStartDate` from a pre-refresh view) caused a confusing "el rango se
traslapa con el período N" screen right after Manuel closed #8 on 2026-06-16 (the
overlap guard correctly refused a duplicate of the just-auto-created period — not
a bug, but confusing UX). The plan was to render `NewPeriodModal` only when there
was **no open period**, keeping it for the "gap recovery" case.

**What actually happened.** The wizard had already been unmounted from
`src/app/(authenticated)/planilla/page.tsx` — nothing imported
`new-period-modal.tsx` — so it was dead code, and the conditional-render fix had
nothing left to apply to. Per Jorge ("period creation ui was replaced with auto
create on closing the previous period. remove it."), both files were **deleted**
on 2026-07-16 (commit `51f0fa6`).

**The "gap recovery" path this item wanted to preserve is covered elsewhere:**
Captura's uncovered-days banner (`grid-client.tsx` → `resolveUncovered`,
MASTER/ADMIN) **POSTs** `/api/pay-periods` to create a period when **no** period
is open, and **PATCHes** to extend the latest open one when there is. The POST
route and its overlap guard are unchanged (still the last line of defense).

- ✅ **The banner's extend is CORRECT** — recorded because this was misread on
  2026-07-16. With an open period present the banner extends it, and when the
  uncovered days fall *after* that period's end (the normal boundary case) that
  is exactly right: only one period may be open at a time, so work continuing
  past the end date means the period **genuinely ran longer**. It therefore
  genuinely owns those days and that week's séptimo — the payout growing is the
  feature, not corruption. Opening a successor early is the error.

---

> Added 2026-06-23 (while building the **Descuentos y Adicionales** input page —
> `/planilla/ajustes`, route `/api/planilla/ajustes`, role consts
> `PAY_ADJUST_*_ROLES` in `src/lib/auth/guards.ts`).

## 4. Vo.Bo. (approval) workflow for ADICIONALES

**Status: deferred — to scope today (2026-06-23).** The SSOT payroll sheet's
ADICIONALES column header carries a "Vo.Bo. Luis Arimany" note. Per Jorge, that
note **refers to a workflow**, not a data field: adicionales require a *visto
bueno* (sign-off) — by Luis Arimany / an authorizing role — before they count.

The page built today lets MASTER/MANAGER enter adicionales (and descuentos) with
**no approval gate** — amounts apply immediately to `PayrollEntry.totalToPay` →
the bank file. Later, add an approval step so an entered adicional must be
approved before it flows to TOTAL A PAGAR / `/pagos`.

**Scope to confirm before building:**
- Who approves (which role) — likely ADMIN (Luis Arimany) per the note.
- Do **descuentos** also need approval, or **adicionales** only?
- Where the Vo.Bo. is recorded — e.g. `status` + `approvedBy`/`approvedAt` on
  `PayrollEntry`, or a dedicated adjustments table (today the amount lives
  directly on `PayrollEntry.bonification`/`.deductions`).
- Whether amounts apply **provisionally** before approval or are withheld from
  `totalToPay` until approved (affects the bank-file export).
- Reconcile with the six-eyes payroll review already in place.

## 5. Re-confirm MANAGER write access on Descuentos y Adicionales

**Status: deferred — Jorge will double-check.** The page was gated to
**MASTER + MANAGER = write, ADMIN + CFO = read-only** per Jorge's choice. Jorge
first said "only Manuel should input these (maybe a new role)," then chose to
**reuse the existing `MANAGER` role** rather than add one.

**Consequence to verify:** `MANAGER` already maps to a person in the enum
(schema comment: "Roberto"). Reusing it means the **current MANAGER holder gains
write access** to descuentos/adicionales. Jorge: "understood, will double-check
later."

**If a distinct role is wanted for Manuel instead:**
- Add a `UserRole` enum value (e.g. `NOMINA` / `PAYROLL`) + Prisma migration.
- Assign Manuel that role via `/admin/usuarios`.
- Repoint `PAY_ADJUST_WRITE_ROLES` (and possibly `PAY_ADJUST_VIEW_ROLES`) in
  `src/lib/auth/guards.ts`; the page/API read from those constants, so no other
  edits needed.

## 6. Fix hardcoded Q0.00 in the Resumen de Pago page

**Status: deferred — stale view, no-hardcoded-values cleanup.**
`src/app/(authenticated)/planilla/resumen/page.tsx` reads `activityRecord`
(earnings only) and **hardcodes `Q0.00`** for Bonificación and Anticipos in both
the per-worker rows and the totals footer. It therefore ignores `PayrollEntry`
entirely — so séptimo, and now the descuentos/adicionales entered on
`/planilla/ajustes`, do **not** appear there.

**Fix:** source the page from `PayrollEntry` for the period (totalEarned,
bonification, seventhDayPay, advances, deductions, totalToPay) instead of
re-aggregating `activityRecord`, mirroring `/api/resumenes`. Remove every
hardcoded `Q0.00`; show real values + DESCUENTOS and TOTAL A PAGAR. Reconcile
the columns with the SSOT (TOTAL = devengado + séptimo).

## 7. Required note per non-zero descuento / adicional (CFO audit)

**Status: deferred — requested by CFO for audit purposes.** Every **non-zero**
DESCUENTOS or ADICIONALES value must carry a linked **note/justification**. This
reverses the initial "amounts only" choice made when building `/planilla/ajustes`
(2026-06-23).

- **Storage:** amounts live on `PayrollEntry.deductions` / `.bonification` (one
  row per worker/period). A single note column can't tell a descuento note from
  an adicional note → either add **two columns** (`deductions_note`,
  `bonification_note`) or move adjustments to a **dedicated table** (`type`,
  `amount`, `note`, `createdBy`, timestamps). The separate table also supports
  multiple line items per worker and the Vo.Bo. workflow (#4) — likely the better
  shape; decide together with #4.
- **Rule:** note is **required** when its amount is non-zero; cleared when the
  amount returns to 0. Enforce on the API (reject save) and in the UI.
- **UI:** add a note input beside each editable cell on `/planilla/ajustes`;
  block save if a non-zero amount has no note.
- **Migration** required. Writes are already audited.
- **Coordinate with #4** (Vo.Bo. approval) — a dedicated adjustments table would
  serve both this and the approval flow in one schema change.

## 8. CFO pre-authorization review screen (pivot + chart) for the open period

**Status: deferred — build today with the Vo.Bo. authorization (#4).** The CFO
needs to review the **open period** *before* authorizing it (the Vo.Bo. step).
Decisions (Jorge, 2026-06-23): a **new dedicated screen** (not just `/resumenes`)
showing **pivot tables + one summary chart**.

- **Why new, not /resumenes:** `/resumenes` already gives a period-scoped pivot
  (tabs: Semana / Persona / Lote, CFO-accessible) and overlaps heavily — reuse
  its `/api/resumenes` aggregation logic — but Jorge wants a distinct review
  screen tied to the authorization flow.
- **Must include DESCUENTOS:** `/api/resumenes` currently omits `deductions` from
  its aggregation ([resumenes/route.ts] PayrollAgg). Add `deductions` so the CFO
  sees Devengado · Séptimo · Bonificación(Adicionales) · Descuentos · Total a
  Pagar — the full pre-auth picture. (Distinct from #6, which is the other
  `/planilla/resumen` page.)
- **Chart:** one summary chart (e.g. Total a Pagar by category, or by lote).
- **Notes (#7):** surface the per-adjustment notes here for audit review.
- **Access:** CFO (the reviewer) + MASTER; confirm whether MANAGER/ADMIN also see
  it. Read-only.
- **Flow:** this view is the CFO's input to the Vo.Bo. authorization (#4) — design
  them together (the screen likely hosts or links to the authorization action).
