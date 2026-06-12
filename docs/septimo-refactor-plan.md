# Séptimo Refactor Plan — correct the "seventh day" model

**Status:** PLAN ONLY. No code or DB changes executed. Proposal for your sign-off.
**Date:** 2026-06-11
**Trigger:** A domain misunderstanding, baked into the app, must be corrected.

## 1. The correction (your words)

- **Wrong understanding (currently in the app):** _"SÉPTIMO (fuzzy match, all case variants) meant that [worker] was present on Sunday, did work on Sunday, and got pay for the work done on Sunday."_
- **Correct rule (received explanation, verbatim):** _"If employee comes to work all six days required, and does paid job all six days required, then a seventh day is paid as some sort of commitment prize."_

So **séptimo is a conditional attendance/commitment bonus**, not pay for work performed on a seventh day. This is the Guatemalan *séptimo día* concept (seventh day paid when the work week is completed).

## 2. Current (incorrect) model — where it lives

- **Séptimo is an Activity:** catalog entry **`Septimo` (code `SP`, unit `DÍA`, Q75)** (per `docs/changelog-2026-06-08-captura-semanal.md`). It is recorded as a normal **`ActivityRecord`** — i.e., as work performed.
- **Captura grid** (`src/app/(authenticated)/planilla/captura/grid-client.tsx`): an **"Incluir domingo (séptimo)"** toggle (`includeSunday`) extends the week from 6 to 7 day-columns (`const n = includeSunday ? 7 : 6`), letting a séptimo be entered as a 7th worked day.
- **Earnings:** payroll work-earnings are the **sum of `ActivityRecord.totalEarned`** (aggregated in `src/app/api/resumenes/route.ts` via `_sum.totalEarned`). A séptimo `SP` record therefore flows into earnings **as if it were work**.
- **Known-debt admission:** the prior changelog (`Pendientes #2`) already states the bonus calc *"es regla de nómina que no se asumió"* — i.e., the conditional bonus was **never implemented**; séptimo today is just a flat Q75 worked-day. The Excel `PAGOS` reportedly uses `75*2` (meaning unconfirmed).

## 3. Target model (your decisions)

Séptimo becomes a **derived payroll bonus**, computed per worker **per week**, **never** an `ActivityRecord`:
- **Condition = attendance (any work).** A day counts if the worker has **≥1 `ActivityRecord` that day** (any work, any amount or type — "any work done checks the condition"). The séptimo is earned when the worker attended **all required workdays** that week. **Required days = Mon–Sat (6) minus any official holiday falling in that range** (holidays reduce the requirement), so a holiday-shortened week is still earnable. It is *attendance*, not task-completion.
- **Amount = configurable.** A `SystemSetting` (group `payroll`), editable on the config page. **Initial value Q150** (the xlsx `75 × 2`). Single current value (not effective-dated) unless you ask otherwise later.
- **One séptimo per week.** For a catorcena (14-day) period it is evaluated per week → up to two séptimos.
- **Going-forward only.** Cutover = **the current open period + all future periods**; **closed periods are never touched** and existing `SP` records there stay as historical.
- **Computed, not entered** — Sunday is not a worked day.
- **Storage field ✅** — a dedicated **`seventh_day_pay`** column on `PayrollEntry` (clean separation from manual `bonification`, individually auditable). The pay total must include it: `totalToPay = totalEarned + bonification + seventh_day_pay − advances − deductions` (currently `src/lib/utils/calculations.ts` omits séptimo).

## 4. Refactor surface (touch points)

1. **Config setting (new):** a `SystemSetting` (group `payroll`) for the séptimo amount, default **Q150** (= `75 × 2`), editable on the config page.
2. **Activity catalog:** **deactivate** the `Septimo`/`SP` activity (`isActive=false`) so no new séptimo-as-work records are created. Past `SP` records remain untouched (going-forward only) — not orphaned, not deleted.
3. **Captura grid:** remove the "Incluir domingo (séptimo)" 7-day toggle; the capture week is six workdays (Mon–Sat). Séptimo is computed, never an enterable cell.
4. **Import / matching:** stop matching "séptimo"/`SP` as an activity (any remaining matcher / `notebook_dictionary` entries reclassified).
5. **Payroll computation (core new logic):** per worker, **per week**, if the worker has ≥1 activity record on all six required workdays (Mon–Sat), write the configured séptimo amount to **`PayrollEntry.seventh_day_pay`**. Applies to the **current open period + future periods**; closed periods are never touched.
6. **Pay-total formula:** update `src/lib/utils/calculations.ts` (and every caller) to `totalToPay = totalEarned + bonification + seventh_day_pay − advances − deductions`.
7. **Aggregation/display** (`resumenes`, `pagos`, worker profile): surface séptimo as its own line, distinct from work earnings and from manual bonification.
8. **Holiday table (new):** a `holiday` table — `id` (UUIDv7), `date`, `name`, optional `recurring_annual` — admin-maintained on the config page; the computation reads it to reduce required days. Covers Guatemalan national + farm-specific non-working days.
9. **Existing data:** **no restatement** — past/closed periods and their `SP` records stay as historical. Item 2's deactivation is what prevents new wrong records. No recompute migration → this refactor is **decoupled** from the UUIDv7/SSOT rebuild.

## 5. Open questions

**Resolved (your answers):**
- **Amount ✅** — configurable `SystemSetting` (group `payroll`), default **Q150** (= `75 × 2`), editable on the config page; single current value.
- **Qualifying day ✅** — pure **attendance**: any `ActivityRecord` that day qualifies the day; all six required days (Mon–Sat) attended → earned.
- **Catorcena ✅** — **one séptimo per week** (≤ 2 per catorcena).
- **Restatement ✅** — **going-forward only**; do not restate past/closed periods.

**Still open:**
- **Q4 — Storage field ✅** — dedicated **`seventh_day_pay`** column on `PayrollEntry`; pay-total formula updated to include it.
- **Cutover boundary ✅** — the **current open period + all future periods**; closed periods never touched.
- **Holiday handling ✅** — official holidays **reduce** the required-day count (required = 6 − holidays in Mon–Sat that week).
- **Holiday source ✅** — a dedicated **`holiday` table** (`id` UUIDv7, `date`, `name`, optional `recurring_annual` flag), admin-maintained on the config page; supports Guatemalan national + farm-specific non-working days.

## 6. Engineering standards / constraints
- Plan only; no execution. Production-first, enterprise-grade; the séptimo computation must be **explicit, tested against real periods, idempotent, and audited** (Rules 6–10). No mock data.
- The corrected rule is captured **verbatim** (§1); the computation is **not** specified beyond your words until the §5 questions are answered (no over-translation).

## 7. Status
All §5 questions are resolved — the refactor is **fully specified** and execution-ready as a spec. Awaiting your authorization to implement. Scope summary: new `SystemSetting` (séptimo amount, default Q150) + config UI; new `holiday` table + config UI; deactivate the `SP` activity; remove the captura Sunday toggle; per-week attendance computation writing `PayrollEntry.seventh_day_pay`; updated `totalToPay` formula; séptimo shown as its own line; applies to the current open period + future, no restatement of closed periods.
