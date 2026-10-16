# Research — An authorization ends the period on that day

**Status:** Research findings, not an implementation. Nothing here has been applied to the database or the code.
**Date:** 2026-10-16
**Question:** Período 12 was authorized on 15 Oct 2026 while its end date was still 17 Oct. Pagos, which lists periods whose end date is already past, therefore shows Período 11. What is the sound way to remove that disagreement?

## How to read this

- The deciding rule is the farm's, stated for this note: a day's pay is quantity × rate, both of which vary and are unknown until the day has happened, so a payment authorization cannot include a future day, and the authorization closes the period immediately.
- The temporal-database pattern that matches that rule is primary literature: Richard T. Snodgrass, *Developing Time-Oriented Database Applications in SQL*, the five-part series archived as TimeCenter TR-28 (the "current deletion" operation). https://timecenter.cs.aau.dk/wp-content/uploads/2022/12/TR-28.pdf
- Payroll-vendor pages (Playground, ADP) describe other companies' early-approval workarounds. They are not the rule here. One of them, typing in expected hours for days that have not happened, is the operation this rule forbids.
- UI sources are Nielsen Norman Group on confirmation and error prevention, the W3C's understanding of WCAG 2.1 success criterion 3.3.4, and a Smashing Magazine article on dangerous actions. The NN/g pages were read from search excerpts; a full-page fetch of the confirmation article timed out. Quotes are limited to sentences those excerpts reproduced.
- US piece-rate regulations (29 CFR 778.111) are cited only as a definition of piece-rate pay from hours and earnings that already exist. They are not the labor law of this farm.

The earlier note `docs/pagos-authorized-period-research.md` recommended showing the authorized period even though its end date was still in the future, or waiting until that planned end. Both leave a closed period covering days whose work is not knowable. This note replaces that recommendation.

## The rule

Pay for a day on this farm is not a forecast. An activity record stores a date, a quantity, and the unit price (`ActivityRecord.quantity`, `ActivityRecord.unitPrice`). The séptimo is an attendance prize for a finished Mon–Sat week, and the week is owned by the period that contains its Saturday — "only once the week has completed" (`src/lib/payroll/septimo.ts`).

On the afternoon of 15 Oct, the hours of 16 Oct and 17 Oct do not exist, and neither do the activities or the rates those hours would be paid at. There is no number to authorize. A period that has been authorized and still lists those days as inside it is asserting a total over inputs it does not have.

Closing is not a label added on top of a plan. The authorization is the close. The last day of the closed period is the authorization's own calendar day. Days after that belong to the next period, which is open, so they can be captured when they actually happen.

## What is stored today

Authorization of Período 12 committed at 15 Oct 2026, 17:40 America/Guatemala (`closedAt` `2026-10-15T23:40:34.591Z`; Guatemala is UTC−6 with no daylight-saving shift). The close route set `isClosed`, `closedAt`, and `closedBy`. It did not change `endDate`. The successor was then created from that unchanged end (`nextRange` in `src/app/api/pay-periods/[id]/close/route.ts`).

| | Período 12 | Período 13 |
|---|---|---|
| Window | 10 Sep 2026 – **17 Oct 2026** | **18 Oct 2026** – 14 Nov 2026 |
| State | Closed 15 Oct | Open |
| Activity on 15, 16, 17 Oct | None. Last captured day in this window is 14 Oct (27 records). The week of 12–14 Oct has records; 15–17 Oct have none anywhere. | None |

17 Oct 2026 is a Saturday. The séptimo rule assigns the week Monday 12 Oct–Saturday 17 Oct to Período 12, because that Saturday falls inside it. The period was locked on Thursday 15 Oct. Friday and Saturday of that week can never be captured: captura rejects a closed period (`src/app/api/planilla/captura/route.ts`). The week cannot be completed, and it cannot move to the open period, because the open period does not start until 18 Oct. Those two days are inside a payment that was authorized before they existed, and outside every period that would still accept them.

The authorized payroll for Período 12 does not contain invented lines for those days (there are no activity rows). It does contain Q6,900 of séptimo from the weeks whose Saturdays already fell inside the period. The week of 17 Oct contributed nothing to that, because 15–17 Oct have no attendance. The damage is the lock and the ownership of an unfinished week, not a fabricated quantity already summed into `totalToPay`.

Pagos lists periods with `endDate < today`. Today for that comparison is 16 Oct. Período 12's end is 17 Oct, so the screen shows Período 11. The screen is refusing a window that still claims a future day. The fault is that the close left that day inside the window.

## Database

### A terminating event cuts the interval at today

Snodgrass's current-deletion operation is the pattern. On a valid-time table, "today" ends the current row, and anything scheduled after today is removed. With today = 29 July, a lot that was planned to change on 17 October is not left in place:

```sql
UPDATE LOT
SET TO_DATE = CURRENT_DATE
WHERE LOT_ID_NUM = 234
  AND TO_DATE >= CURRENT_DATE
  AND FROM_DATE < CURRENT_DATE;

DELETE FROM LOT
WHERE LOT_ID_NUM = 234
  AND FROM_DATE > CURRENT_DATE;
```

"All information on lot 234 after today has been deleted." (TR-28, §3.2, Tables 3 and 4.) The planned 17 October does not survive a termination that happened on 29 July.

Applied here, in one transaction, on authorize:

1. The authorization date is the calendar date of `closedAt` in `America/Guatemala`, not the UTC date. A close at 19:00 Guatemala is already the next day in UTC. Using the UTC date would put tomorrow inside the payment.
2. If the stored end date is after that authorization date, set the inclusive end date to the authorization date. If the stored end date is already on or before that day, leave it. Closing late must not pull later days in.
3. Set `isClosed`, `closedAt`, `closedBy` in that same write.
4. Open the successor on the next calendar day after the end date actually written. The no-gap rule (`src/app/api/pay-periods/route.ts`) stays. What changes is which end date it is applied to.
5. Write the previous end date to the audit log, so the abandoned plan (the Saturday the open period had been aimed at) is still visible.

While a period is open, `endDate` may sit in the future. That value is a plan: "Editar fechas" moves it when work runs past it, and those days are then real days inside a period that is still accepting records. The close is the moment the plan stops. After the close, the same column is the last day actually included. A second column for "planned end" on a closed row would store the Saturday that was just rejected, and the next screen would be able to read it by mistake. The audit log is the place that Saturday survives.

The backstop is a check, the ordinary tool for a relationship between two columns (a `CHECK` constraint rather than a trigger; Aaron Bertrand's answer on enforcing `EndDate >= StartDate` is the same device). Shape:

```sql
CHECK (
  NOT is_closed
  OR (
    closed_at IS NOT NULL
    AND end_date <= (closed_at AT TIME ZONE 'America/Guatemala')::date
  )
)
```

An open period is exempt, so a future plan remains legal. A closed period whose end is after the day it was closed is not. The application truncates; the check rejects a close that forgets to.

This schema's end dates stay inclusive. The successor starts the morning after the last included day. Converting these columns to the SQL:2011 half-open form is a different change and is not required to make the close cut the interval.

### What this does to the séptimo

No change to `computeSeptimoForPeriod` is required for the rule to hold. A week is paid in the period that contains its Saturday, and only that period. If authorization on Thursday 15 Oct sets the end date to 15 Oct, Saturday 17 Oct falls in the next period. That week is then owned by a period that is still open on Friday and Saturday, which is the condition the séptimo rule already states: the week is paid once it has completed. Authorizing on a Saturday leaves that Saturday inside the closed period, and the week is complete on the day of the close.

### These two rows

The invariant, applied to the rows already stored: Período 12 ends 15 Oct 2026, and Período 13 starts 16 Oct 2026. Its current end, 14 Nov, can stay; only the start has to move back by two days so 16 and 17 Oct are inside the open period.

That rewrite moves no activity row: 15, 16, and 17 Oct have none. It does not change the Q6,900 of séptimo already stored on Período 12, because the only Saturday it removes is 17 Oct, and that week has no attendance on its last three days, so it earned nothing. It does put the unfinished week where the séptimo rule can still see Friday and Saturday when they happen. Doing that rewrite is a data repair of these two rows. It is not part of this note's implementation, and it should be a deliberate change of its own, with the payroll entries re-read afterward to confirm the authorized total is the same number.

## UI

The authorization screen already reviews the money: the confirm dialog states the total, the worker count, and that the period locks and the next one opens (`autorizacion-client.tsx`). It does not state the last day that will be locked. The stored end date, 17 Oct, is two days after the authorization. The dialog as written would have described a lock of that whole window.

WCAG 2.1 success criterion 3.3.4 requires that a financial submission be reversible, or be checked, or be reviewed and corrected before it is submitted. The relevant technique here is the review: the facts that will be committed have to be on the screen. The last included day is one of those facts. NN/g's confirmation guidance is the same requirement in interaction terms: for an action that costs money and cannot be undone, say what will happen, in the user's terms, so a mistake is recognizable. "Are you sure?" does not. A button that only says "Autorizar pago" does not. Smashing Magazine's formulation for the button is the amount and the object ("Pay $97"), not "Confirm."

The close itself has to do the truncation. A warning that the end date is in the future, leaving the user to edit dates first, still allows the bad write. NN/g's error-prevention heuristic puts constraints ahead of messages for a high-cost slip: the illegal state should be unreachable. The dialog then reports the constraint, it does not ask the user to apply it.

On 15 Oct, with the plan still saying 17 Oct, the dialog would need to say all of the following, and the button would need to name the cutoff:

- The last day included is 15/10/2026, the day of this authorization.
- The amount and the worker count, as it does now, computed through that day.
- 16/10 and 17/10 leave this payment and become the start of the next period, which opens on 16/10.
- The button carries the date and the amount, for example "Cerrar al 15/10 y autorizar Q84,535.70", not a bare confirm.

That wording is a recommendation, not copy that has been put on the screen.

Playground's help article on an approval deadline that falls before the period ends (Molly Farber, 9 Sep 2026) lists "enter the hours you expect each employee to work for the remaining day(s)" as its first option, and its own disadvantage is that any difference has to be trued up later. That option is unavailable here. Expected hours on a future day have no activity and no rate to multiply. Their second option, approve without those days and run another payroll later, only works if the missing days can still be recorded. A close that keeps them inside the locked period makes that recording impossible. The close has to move the days into the open successor, not schedule a second payment for a period that will not accept them.

Waiting until the planned Saturday before authorization is allowed (ADP's default end-of-period procedure) refuses to close on the 15th. That is a different rule. This one closes on the 15th, and the period ends on the 15th.

## Pagos

After the close writes 15 Oct as the end of Período 12, the query Pagos already runs — end date strictly before today, newest first — includes that period on the morning of 16 Oct. The screen was right to omit a window that still ended on the 17th. It does not need a new definition of "most recent" that ignores the end date.

One edge remains, and it is not this bug. A period authorized on the morning of the 16th, with its end date set to the 16th, is still excluded by `endDate < today` until the 17th. The reported screen was the morning after the authorization, so the truncation is what puts Período 12 on it. Whether a file should be downloadable on the afternoon of the close is a separate decision: the period's last day is then today, and today is included because its captured work is actual. It is not a reason to show a period whose end date is still in the future.

## Sources

| Source | Kind | Used for |
|---|---|---|
| Richard T. Snodgrass, *Developing Time-Oriented Database Applications in SQL*, TimeCenter TR-28, §3.2. https://timecenter.cs.aau.dk/wp-content/uploads/2022/12/TR-28.pdf | Primary | A termination today sets the interval's end to today and drops what was planned after today |
| Aaron Bertrand, answer to "Ensure endDate equal to or later than startDate," Stack Overflow, 23 Apr 2013. https://stackoverflow.com/questions/16179451/ensure-enddate-equal-to-or-later-than-startdate | Primary (SQL practice) | A date relationship is a `CHECK` constraint |
| 29 CFR § 778.111(a). https://www.ecfr.gov/current/title-29/subtitle-B/chapter-V/subchapter-B/part-778/subpart-B/section-778.111 | US regulation, not this farm's law | Piece-rate pay is defined from earnings and hours already worked |
| W3C, Understanding SC 3.3.4 Error Prevention (Legal, Financial, Data). https://www.w3.org/WAI/WCAG21/Understanding/error-prevention-legal-financial-data | Primary (UX standard) | A financial submit is reviewed, with the facts that will be committed, before it is sent |
| NN/g, "Confirmation Dialogs Can Prevent User Errors." https://www.nngroup.com/articles/confirmation-dialog/ | Primary (UX) | Name the consequence; do not ask "are you sure?" |
| NN/g, "10 Usability Heuristics," heuristic 5. https://www.nngroup.com/articles/ten-usability-heuristics/ | Primary (UX) | Stop the high-cost error with a constraint |
| Vitaly Friedman, "How To Manage Dangerous Actions In User Interfaces," Smashing Magazine, Sep 2024. https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces/ | Secondary (UX) | The button names the action and the amount |
| Molly Farber, "Handle an Early Payroll Approval Deadline," Playground Help Center, 9 Sep 2026. https://help.tryplayground.com/en/articles/16889171-handle-an-early-payroll-approval-deadline | Vendor documentation | Expected hours are a true-up; omitted days have to remain recordable |
| ADP, "Performing End of Period Operations Step-by-Step." https://otcdc1.adp.com/ezlmhelp/v18_30/wfn/general/standardui/en-us/as_help/as/end_of_period-performing.htm | Vendor documentation | The policy of refusing to close before the scheduled end. Not the rule used here |
