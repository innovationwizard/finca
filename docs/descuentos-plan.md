# Descuentos Layer — Implementation Plan

**Status:** PLAN ONLY. No code or DB changes executed. Proposal for your sign-off.
**Date:** 2026-06-14
**Authority for execution:** NONE yet. Nothing touches prod without your explicit go.
**Companion context:** payroll lives in `src/lib/payroll/` (`recalc.ts`, `septimo.ts`); net pay in `src/lib/utils/calculations.ts`; periods may be **any length** and dates are **editable** (see [[project_pay_period_dates]]); séptimo accrues by **calendar week** (see [[project_septimo_model]]).

---

## 1. The mechanic (your intent — confirmed verbatim)

> On a certain date, an employee is given cash money (most likely to cover unexpected emergency related expenses) or property (machine or equipment for them to own, most likely to be used in their finca activities, but that they don't have the lump sum to buy). An agreement is made: how many gtq will be deducted per week or per pay period until the balance is settled.

A **Descuento agreement** is a 0%-interest financed disbursement (the **Anticipo**: cash or property valued in GTQ), repaid by a fixed **installment** auto-deducted from payroll each period until the **balance** reaches zero (then **settled**). Admins create/manage agreements; the app computes each period's deduction and the running balance.

## 2. Objective & non-goals

**Objective:** Add a Descuentos financial layer — admin-managed repayment agreements that automatically reduce each affected payroll entry, with a full, auditable balance ledger.

**Non-goals (unless you say otherwise):**
- No interest, fees, or financing charges (decision #3).
- No asset registry for property — only a short label + long description (decision #12).
- No restatement of closed periods (decision #10).
- Does not change how work earnings or séptimo are computed — it only adds a deduction line.

## 3. Decisions (your answers, 2026-06-14)

| # | Decision |
|---|----------|
| 1 | **Anticipo** = the up-front cash/value given; **Descuento** = the per-period deduction and its payroll line name. Existing `advances`/`deductions` are remnants of an incomplete attempt at this same mechanic. |
| 2 | Cash and property use the **same repayment mechanic**, differing only by a `type` label. |
| 3 | **No interest.** Principal-only. |
| 4 | Cadence: **per week** → period deduction = installment × weeks-in-period; **per pay period** → flat installment regardless of period length. |
| 5 | **Admin picks the start period** at agreement creation. |
| 6 | **Never over-deduct** — the final installment is whatever balance remains. |
| 7 | If a period's pay can't cover the scheduled installment, **deduct only what's available (partial)**; the remainder rolls forward. |
| 8 | **OPEN — pending Jorge.** Multiple concurrent agreements per worker? Cap on total descuento per period? (See §11.) |
| 9 | Support a **manual extra/early payment** that reduces the balance. |
| 10 | **Going-forward only** — deductions apply to the open + future periods; closed periods never restated. |
| 11 | Display its **own "Descuento" column** in pagos / resúmenes / worker-profile, plus a **per-agreement balance view**. |
| 12 | Property: a **short text** (displayed) + a **long text** (description, only in the agreement registry). |
| 13 | Admin = **MASTER/ADMIN**; full audit. |

## 4. Data model (all ids UUIDv7)

**`DescuentoAgreement`** — one row per agreement.
- `id`, `workerId` (FK → workers)
- `type` enum `DescuentoType { CASH, PROPERTY }`
- `principal` Decimal(10,2) — the GTQ amount disbursed (the Anticipo)
- `propertyLabel` String? — short text, displayed (PROPERTY only)
- `propertyDescription` String? — long text, registry-only (PROPERTY only)
- `grantedDate` Date — when the Anticipo was given
- `installmentAmount` Decimal(10,2)
- `cadence` enum `DescuentoCadence { WEEKLY, PER_PERIOD }`
- `startPayPeriodId` (FK → pay_periods) — first period that deducts (decision #5)
- `status` enum `DescuentoStatus { ACTIVE, PAUSED, SETTLED, CANCELLED }`
- `notes` String?, `createdBy` (FK → users), `createdAt`, `updatedAt`

**`DescuentoMovement`** — the immutable ledger that determines the balance. Two kinds:
- `id`, `agreementId` (FK)
- `kind` enum `DescuentoMovementKind { PERIOD_DEDUCTION, MANUAL_PAYMENT }`
- `payPeriodId` (FK, nullable — set for PERIOD_DEDUCTION)
- `amount` Decimal(10,2) — always a positive reduction of the balance
- `effectiveDate` Date, `createdBy`, `createdAt`
- **Idempotency:** unique `(agreementId, payPeriodId)` for `PERIOD_DEDUCTION` — recompute upserts the period's deduction in place (re-runnable, no double-count). `MANUAL_PAYMENT` rows are append-only events.

**Balance** = `principal − Σ(movement.amount)`. `status` flips to `SETTLED` when balance ≤ 0.

**`PayrollEntry`** — add `descuento Decimal @default(0)` (the period's total deduction for that worker, = Σ of that worker's `PERIOD_DEDUCTION` movements for the period). **Net pay formula becomes:**
`totalToPay = totalEarned + bonification + seventhDayPay − descuento`
→ **removes the unused `advances` and `deductions`** columns (decision #1; Σ=0 in prod). `calcNetPay` signature changes accordingly. **✅ Removal confirmed (Jorge, 2026-06-14).**

## 5. "Weeks in a period" (cadence = WEEKLY) — consistency rule

Periods are variable-length, so "per week" needs a precise count. **Reuse séptimo's week-ownership rule** — a period owns the calendar weeks whose **Saturday** falls in its range; weeks-in-period = that count. This gives the two financial layers ONE shared definition of "a week within a period" (no second, conflicting notion). **✅ Confirmed (Jorge, 2026-06-14).**

## 6. Computation (in `recomputePayroll`, going-forward only)

Recompute already runs per open period and is refused on closed periods (decision #10 ✓). Add, after earnings + séptimo:

1. Load the worker's **ACTIVE** agreements whose `startPayPeriodId` ≤ this period (by period order) and balance > 0.
2. For each, the **scheduled** amount = `WEEKLY ? installment × weeksInPeriod : installment`, then clamp to **remaining balance** (decision #6 — never over-deduct).
3. **Available to deduct** = `totalEarned + bonification + seventhDayPay` (net before descuento). Apply deductions up to available only (decision #7 — partial, never negative net). Remainder of any unmet installment simply isn't deducted; the balance stays, so it naturally rolls into the next period.
4. Write/upsert one `PERIOD_DEDUCTION` movement per (agreement, period); set `PayrollEntry.descuento` = Σ applied; recompute `totalToPay`.
5. Any agreement whose balance hits 0 → `SETTLED`.

Idempotent: re-running recompute re-derives the same movements (upsert by (agreement, period)).

## 7. Config page & lifecycle (MASTER/ADMIN)

New page **`/admin/descuentos`** (sidebar, MASTER/ADMIN):
- **Create agreement:** worker (dropdown/autocomplete — no inline worker CRUD, per [[feedback_no_inline_crud]]), type, principal, property label/description (if PROPERTY), granted date, installment, cadence, start period (dropdown of periods).
- **List + per-agreement balance view:** principal, Σ deducted, Σ manual payments, remaining balance, status, movement history.
- **Actions:** record **manual extra payment** (decision #9), **pause/resume**, **cancel** (stops future deductions; remaining-balance handling is **OPEN — pending Jorge**, see §11).
- All create/edit/payment/pause/cancel are **audited** (`audit_logs`), role-guarded MASTER/ADMIN (decision #13).

## 8. Display (decision #11)

- **"Descuento"** column added to `pagos` (pagos-view + `/api/pagos`), `resúmenes` (resumen-tabs + `/api/resumenes`), and **worker-profile** payroll table (+ `/api/workers/[id]`) — mirrors how the séptimo column was added.
- Per-agreement **balance view** on `/admin/descuentos` (and optionally surfaced read-only on the worker profile).

## 9. Edge cases

- Partial period (decision #7); tail installment (#6); zero-earnings period → 0 deducted, balance unchanged.
- Agreement created mid-cycle → starts at `startPayPeriodId` (#5).
- Period **date edits** (periods are editable): weeks-in-period is recomputed on next recalc, so a `WEEKLY` agreement self-adjusts.
- Manual payment that exceeds remaining balance → clamp to balance, mark SETTLED.
- Worker deactivated with an open balance → agreement stays visible; surface the outstanding balance (no auto-deduction once they have no payroll).

## 10. Migration & cleanup

- Add `DescuentoAgreement`, `DescuentoMovement`, enums, and `PayrollEntry.descuento` (UUIDv7, Prisma migration).
- **✅ Confirmed (Jorge, 2026-06-14):** drop `PayrollEntry.advances` and `PayrollEntry.deductions` (unused remnants, Σ=0) and update `calcNetPay` + the pagos/resúmenes/profile reads that reference them.

## 11. OPEN DECISIONS (pending Jorge — block Phase 1)

**(A) Decision #8 — concurrency & cap.** Design hooks already in place:
- **Multiple concurrent ACTIVE agreements per worker?** The model supports N agreements natively. If you want **at most one active at a time**, we add a guard at creation.
- **Cap on total descuento per period?** Decision #7 already guarantees net pay never goes negative. Do you also want a softer cap (e.g., descuentos ≤ X% of net pay) so a worker always takes home a minimum?
- If multiple are allowed and available pay is insufficient for all, **allocation order** must be defined (proposed default: oldest agreement first / FIFO).
- *Labeled assumption until you answer:* allow multiple concurrent; clamp only by net-pay-≥-0; partial allocation FIFO by `grantedDate`.

**(B) §7 cancel semantics.** When an admin **cancels** an agreement that still has a balance owed, the remaining balance is either **(i) written off / forgiven** (balance → 0, recorded as a forgiveness movement) or **(ii) flagged outstanding** (kept on the books as owed, but no further payroll deduction). No payroll-deduction difference between the two — purely how the residual is recorded/reported.
- *Labeled assumption until you answer:* (ii) flagged outstanding (more conservative — nothing silently forgiven).

Both confirmed (§5 week rule, §10 column removal) are locked; everything else in §4/§6 is final once (A) and (B) are answered.

## 12. Phases (small batches + live tracker, per your standing preference)

0. Resolve §11 open decisions (A) #8 concurrency/cap and (B) cancel semantics. *(§5 week rule + §10 column removal already confirmed.)*
1. Schema + migration (entities, enums, `PayrollEntry.descuento`; `calcNetPay`). `prisma generate`.
2. Balance/compute lib (`src/lib/payroll/descuentos.ts`) + integrate into `recomputePayroll`; unit-tested against real periods (read-only dry-run first).
3. Config API (`/api/admin/descuentos` CRUD + manual payment + pause/cancel), role-guarded + audited.
4. Config page UI (`/admin/descuentos`) + sidebar link.
5. Display column in pagos / resúmenes / worker-profile (+ API selects).
6. Verify end-to-end on a real open period; document.

A live progress md will track sub-batches (to survive context compaction), as with prior efforts.

## 13. Engineering standards (Rule 6–14)

Production-first, no mock data; UUIDv7; strict typing, zero lint suppressions; parameterized queries; role-guarded (MASTER/ADMIN) + audit logging on every mutation; idempotent recompute; Latin-American Spanish UI; worker chosen by selection (no inline worker CRUD). The corrected intent is captured verbatim (§1); nothing beyond the requested layer is changed (Rule 13) — the only existing-field change proposed is the §10 cleanup, explicitly flagged for your approval.
