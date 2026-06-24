# Research — Payroll review / audit-and-approval dashboard

> Deep-research report (fan-out web search → fetch → adversarial verification →
> synthesis). Generated 2026-06-23 to inform the **Revisión y Autorización**
> screen (TODO #4 + #7 + #8). 101 agents · 19 sources fetched · 72 claims
> extracted · 25 verified · 22 confirmed · 3 refuted.
>
> **Source-quality caveat:** the strongest control claims (segregation of duties,
> maker-checker, audit-trail fields) rest on primary/professional authorities
> (AICPA, COSO, IIA, Washington State Auditor, NN/g). Several UI/anomaly claims
> rest on vendor/BI blogs; they survived verification because each was
> independently corroborated and describes mundane, established practice — treat
> those as illustrative, not authoritative.

## Question

Best practices for a payroll review / audit-and-approval dashboard for a SMALL
org (~40 employees): a view-only audit with a single "authorize payment" action
that locks (closes) the pay period — one shared screen for an auditor (read-only)
and an approver (same view + authorize button). Cover: (1) useful filters, (2)
table/pivot layout for one full period at once, (3) charts that aid the audit vs
chart-junk, (4) audit-trail / segregation-of-duties / maker-checker, (5)
anomaly/exception flags for cross-checking against bank statements.

Context: Guatemalan coffee-farm payroll (GTQ); pay = piece-rate *devengado* +
attendance bonus *séptimo* + manual *adicionales* − manual *descuentos*; workers
categorized Voluntario/Fijo; pay periods ~4 weeks but editable, captured weekly;
payment = bank file (BANRURAL) cross-checked manually. Roles: preparer = MANAGER,
auditor = CFO (view only), approver = ADMIN (authorizes → closes period).

## Executive summary

The evidence converges on a **maker-checker** design (preparer MANAGER → reviewer
CFO → approver ADMIN) where authorization sits **outside** payroll preparation and
the lock event is recorded immutably (who/what/when, point-in-time state). The most
useful screen is **KPI cards counting unresolved exceptions** on top of a **single,
dense, sortable table** covering the whole period, with a **sticky header** and a
**sticky leftmost (worker) column**. Precise GTQ amounts belong in the **table**,
not charts. The charts that genuinely help are a **pay-distribution histogram** and
**composition by category**; scatter plots for outliers were refuted. The highest-
value feature is a concrete **anomaly catalog** surfaced for review (never
auto-rejected — family-shared BANRURAL accounts are legitimate). Full four-function
SoD is impractical at 40 people, so **compensating controls** (immutable log,
exception reports, independent CFO review, reconciliation) carry the load.

## Confirmed findings

### Controls / segregation of duties

1. **Maker-checker is the core control** (high · 3-0, merged from 6). Split payroll
   into preparation, authorization, and payment so no one controls the full cycle.
   The MANAGER=preparer / CFO=auditor(view-only) / ADMIN=approver split is exactly
   the recommended pattern.
   *AccountingTools: "Have one person prepare the payroll, another authorize it, and
   another create payments." SecurEnds: "Approval should sit outside payroll
   processing. Finance or senior management should sign off."*
   Sources: accountingtools.com, zengrc.com, securends.com, unit21.ai, AICPA/COSO/IIA Std 13.2, WA State Auditor.

2. **Authorization is a distinct role; approval = lock** (high · 3-0). Held outside
   payroll processing by finance/senior management; once approved, data can no
   longer be changed.
   *ZenGRC: once approved "the employee cannot make changes." ISBE/TimeTrex: "Once
   approved, timesheets should be locked, with any edits requiring reason codes and
   a visible audit history."* → the ADMIN authorize action is the lock that closes
   the period.
   Sources: securends.com, zengrc.com, accountingtools.com, ISBE.

3. **Immutable change-tracking log** (high · 3-0, merged from 3). Record who/what/
   when/where for every edit and for the lock event. Password protection alone is
   NOT sufficient — use append-only (ideally hash-chained), write access restricted
   to the logging pipeline.
   *HubiFi: capture "who took the action, what the action was, when it happened, and
   where it originated from."* Note: the absolutist "WORM, cannot be altered by
   anyone" framing was **refuted** (1-2); the practical bar is append-only +
   restricted write access.
   Sources: accountingtools.com, zengrc.com, hubifi.com, Mattermost/Datadog.

4. **Preserve a point-in-time snapshot at lock** (high · 3-0). Not only current
   results — keep prior states for audit. Surface adjustment logs, approval trails,
   exception workflows, reconciliation status.
   *FanRuan: "What did the record look like at payroll close? When was the adjustment
   introduced? Which manager approved the change?"*
   Sources: fanruan.com, ADP/NetSuite/Trullion/Rippling.

### Screen layout & tables

5. **KPI cards + single exception/detail table** (high · 3-0). Progressive
   disclosure: headline counts first, drill down for detail (worker, exception type,
   period, owner, status).
   *FanRuan: "KPI cards give a quick count of unresolved issues. The table provides
   operational detail."*
   Sources: fanruan.com, PwC, ClearPoint, DataCamp, RevoGrid.

6. **Sticky header + sticky leftmost (worker) column** (high · 3-0). Keep column
   context on vertical scroll and worker context on horizontal scroll; add the fixed
   column when horizontal comparison is the primary need (it is here, with weekly
   devengado + séptimo + adicionales − descuentos columns).
   *Pencil&Paper; NN/g "Data Tables: Four Major User Tasks."* Caveat: implement
   accessibly.
   Sources: pencilandpaper.io, NN/g, Adrian Roselli.

7. **Use a table (not a chart) for precise values** (high · 3-0). Charts convey
   shape; keep exact GTQ per worker in the detail table.
   Sources: eazybi.com, Domo/Sisense/Few/Tufte lineage.

### Charts

8. **Pay-distribution histogram** (high · 3-0). Net pay binned into numeric GTQ
   ranges shows clustering, skew, unusually high/low earners. Bins are numeric pay
   ranges, not categories. For categorical splits (Voluntario/Fijo) use a bar chart.
   **Scatter charts for outliers were refuted (0-3).**
   Sources: eazybi.com, storytellingwithdata, Atlassian, JMP.

9. **Automated outlier/variance analysis** (high · 3-0, merged from 2). Detect pay
   spikes and net-pay outliers beyond historical bands, learning normal ranges per
   worker/role/location.
   *Thomson Reuters: "Outlier Analysis detects unusual pay spikes…" Mercans: "learn
   normal ranges by worker, role, and location."* For the farm: flag unusually
   high/low devengado and large period-over-period swings vs each worker's history.
   Sources: tax.thomsonreuters.com, everworker.ai, Mercans, ThirdLine, PwC.

### Anomaly / exception catalog

10. **Duplicate / shared bank accounts across unrelated workers** (high · 3-0,
    merged from 3). Core automatic check — **flag for review, not auto-reject**, as
    family-shared BANRURAL accounts are legitimate in agriculture.
    *Thomson Reuters: "Flag repeated SSNs, bank accounts, addresses…" ACL/HighBond
    tests "duplicate bank account numbers."*
    Sources: tax.thomsonreuters.com, unit21.ai, everworker.ai, ACFE/Vona/Harvust.

11. **Paid workers with zero attendance/devengado** (high · 3-0). Ghost-employee
    indicator. Single-app analog: flag workers receiving pay with zero captured
    attendance or zero devengado for the period.
    Sources: tax.thomsonreuters.com, TimeTrex, Safeguard/Papaya Global.

12. **Totals don't reconcile to outgoing payments** (high · 3-0). Reconcile the
    payroll register to the BANRURAL statement; surface a reconciliation status;
    any mismatch is a control problem.
    *Unit21: "Inconsistencies between the payroll system and outgoing payments."*
    Sources: unit21.ai, NetSuite, Bonadio, peoplehum.

13. **Broader exception catalog** (high · 3-0, merged from 2). Beyond duplicates:
    ghost/inactive-worker pay, off-cycle payments outside policy, reactivated
    terminated profiles, net-pay outliers, missing/invalid account numbers; fuzzy
    matching on accounts/identifiers catches small edits that evade exact-match.
    Caveat: small orgs can start with exact-match duplicate scans; fuzzy matching is
    an enhancement.
    Sources: everworker.ai, ACFE, Aprio, Thomson Reuters.

## Refuted claims (do NOT use)

- **Enterprise filter list** (entity/country/region/location/department/cost-center/
  employment-type/cycle/manager/exception-type) — **0-3**, over-filtering for a
  40-person single farm. (fanruan.com)
- **Scatter charts as the recommended outlier chart** — **0-3**. (eazybi.com)
- **Absolutist immutability** ("once recorded, cannot be altered or deleted by
  anyone", WORM) — **1-2**, overstated; practical bar is append-only with
  restricted write access. (hubifi.com)

## Open questions (no good external answer for a piece-rate farm)

1. **Minimal useful filter set** for a 40-person single farm — the enterprise list
   was refuted; no positively-validated small-org set emerged. Reasonable (but
   unverified) candidates: worker, Voluntario/Fijo, has-manual-adjustment,
   zero/high/low pay, missing bank account, exception type.
2. **Representing manual reconciliation** vs an automated bank-file comparison, and
   whether reconciliation must be green before the ADMIN can authorize.
3. **Outlier thresholds** for piece-rate agricultural pay, where devengado
   legitimately varies with harvest intensity and attendance.
4. **Variance across unequal-length periods** (periods are editable; séptimo accrues
   across the period owning the week's Saturday) so period-over-period comparison
   isn't misleading.

## Project decisions made from this research (2026-06-23)

- **One shared screen**; CFO read-only, ADMIN/MASTER also get **Autorizar pago**.
- **Authorize = close** (existing flow: lock + auto-create next period; records
  `closedBy`/`closedAt` + audit log). Gated ADMIN + MASTER; removed from MANAGER.
- **Authorize gating = minimal (warn-only)** — exceptions and totals are shown; the
  button is always enabled (no hard block, no reconciliation checkbox).
- **No separate snapshot table** — rely on the locked PayrollEntry rows +
  `closedBy`/`closedAt` + audit log (the close already freezes the data).
- **Adjustment notes (#7) built now** — required note on each non-zero
  descuento/adicional, enabling the "ajuste sin nota" exception.

## Sources

| URL | Quality | Angle |
|---|---|---|
| accountingtools.com/articles/payroll-internal-controls | secondary | controls/SoD |
| zengrc.com/blog/best-practices-for-payroll-internal-controls | blog | controls/SoD |
| securends.com/blog/segregation-of-duties-in-payroll-and-hr | blog | controls/SoD |
| hubifi.com/blog/immutable-audit-log-basics | blog | controls/SoD |
| unit21.ai/fraud-aml-dictionary/payroll-fraud | blog | anomaly/reconciliation |
| tax.thomsonreuters.com/news/ghosts-on-the-ledger… | secondary | anomaly/reconciliation |
| everworker.ai/blog/ai_payroll_anomaly_detection… | blog | anomaly/reconciliation |
| fanruan.com/en/blog/build-a-payroll-dashboard-that-cuts-labor-cost-blind-spots | blog | dashboard UX |
| pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables | blog | table layout |
| eazybi.com/blog/data-visualization-and-chart-types | blog | data viz |
| cleanchart.app/blog/financial-data-visualization | blog | data viz |
| fpandhey.substack.com/p/how-to-present-variance-analysis | blog | data viz |
| frozencrow.com/data-visualization-best-practices | blog | data viz |
| support.microsoft.com/…/design-the-layout-and-format-of-a-pivottable | primary | pivot layout |
| fitsmallbusiness.com/payroll-internal-controls | blog | agricultural payroll |

_Corroborating (via verifiers): AICPA/COSO/IIA Std 13.2, Washington State Auditor
SoD Guide, NN/g, ADP, NetSuite, Rippling, PwC, ACFE, Leonard Vona, ACL/HighBond,
Harvust (agriculture-specific), CFPB._
