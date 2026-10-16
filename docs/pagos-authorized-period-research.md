# Research — Which period Pagos should open on

**Status:** Superseded the same day. Do not follow the recommendation below. Authorizing pay for days that have not happened is undefined when that day's activity, rate, and hours are still unknown, and an authorization closes the period at that moment. The replacement is `docs/authorization-closes-the-period-research.md`.
**Date:** 2026-10-16
**Question:** Pagos shows Período 11 as "más reciente" while Período 12 was already authorized. What do database-design and workflow-design practice say is the right way to resolve that?

## How to read this

Source strength is uneven, and this note says so.

- **Time in the database** is anchored in primary literature: Snodgrass & Ahn, *IEEE Computer* (1986); Jensen, Clifford, et al., the consensus glossary (*A Glossary of Temporal Database Concepts*, 1993); IBM's *Temporal Data Management with DB2* (Nicola, 2012, covering SQL:2011 system time and business time).
- **Payroll close products** (ADP Workforce Now, TEAM by WorkWave Timegate) are vendor documentation of how commercial payroll treats "the period ended" versus "the period was approved." They describe product behavior, not a standard.
- **UI defaults and error prevention** are from Nielsen Norman Group articles and one UIE study. The NN/g pages were read from search excerpts; a full-page fetch of those two articles timed out. Quotes below are limited to sentences those excerpts reproduced.
- The Stack Exchange answer is one accepted answer, useful because its correction is the decision rule this case needs. It is not a standard.

## The incongruency, in the data

Today in the comparison the page uses is 16 Oct 2026 (`2026-10-16T00:00:00.000Z`). Pagos loads three periods with `endDate < today`, newest end date first (`src/app/(authenticated)/pagos/page.tsx`). That returns 11, 10, and 9.

| | Período 12 | Período 11 (chip labeled "más reciente") |
|---|---|---|
| Work window | 10 Sep 2026 – 17 Oct 2026 | 12 Aug 2026 – 9 Sep 2026 |
| Authorized | Yes. `isClosed = true`, `closedAt` 15 Oct 2026 17:40 America/Guatemala | Yes, 10 Sep 2026 |
| Payroll | 31 entries, Q84,535.70 | What the screen is totaling |
| `endDate < today` | No | Yes |

Período 12 was created on close of 11, ending 3 Oct. The end date was edited to 10 Oct (5 Oct) and then to 17 Oct (13 Oct). Authorization on 15 Oct closed it and opened Período 13 (18 Oct – 14 Nov), which is still open.

Two facts are stored, and they disagree about "most recent":

1. The work window (`startDate`, `endDate`) still includes tomorrow.
2. The authorization (`isClosed`, `closedAt`, `closedBy`) already happened yesterday.

The page asks question 1. The person who opened Pagos is there to act on question 2. The same `endDate < today` query is copied for the audit download on Planillas anteriores (`src/app/(authenticated)/planilla/page.tsx`, `src/app/api/planilla/auditoria/route.ts`), so that button is pinned to Período 11 as well.

This is not an off-by-one. `endDate <= today` still excludes 17 Oct. It is not a timezone miss either: at the time of the screenshot, Guatemala and UTC were on the same calendar day.

## Recommendation

Keep the schema. Change the question the screen asks.

Pagos, and the audit download that must name the same period, should take the three most recently **authorized** periods: `isClosed = true`, ordered by `closedAt` descending. Do not filter on `endDate < today`. The selected chip should say that it was authorized, and on which date, and should still show the work-window dates.

Do not add a status column, a period-state enum, or a bitemporal table to fix this. `isClosed` / `closedAt` / `closedBy` is already the authorization event. `startDate` / `endDate` is already the work window. The bug is a query using the second fact as a proxy for the first.

The alternative — refuse authorization until `endDate < today` — is what ADP's default close procedure does. It would have blocked yesterday's authorization. It fights the way this farm already works (extend the window, then authorize before the last calendar day). It is the wrong default here. It remains available if the farm later decides that authorizing before the end date should be impossible.

## Database design

### The two times are different facts

Snodgrass and Ahn distinguish three kinds of time, and they use payroll as the example of why they must not be collapsed:

> An analogy for user-defined time would be the date printed on each payroll stub indicating when the pay period started. Note that this date does not necessarily correspond to the date the check (or the previous one) was issued.

— Snodgrass & Ahn, "Temporal Databases," *IEEE Computer*, September 1986, p. 37.

The consensus glossary states the same split in definitions (Jensen, Clifford, Elmasri, Snodgrass, et al., 1993):

- **Valid time** is when a fact is true in the modeled reality. It may be in the future.
- **Transaction time** is when the fact was stored. It cannot be after now, and it cannot be rewritten, because it is the record of a transaction that already committed.

On Período 12 the work window is valid time (and, in Snodgrass's payroll-stub sense, user-defined time): 10 Sep through 17 Oct, including a day that has not arrived. `closedAt` is transaction time: the moment the authorization was committed. A query that keeps only windows whose valid end is already past will miss a transaction that has already been stored. That is what `endDate < today` does.

IBM's DB2 temporal guide makes the operational version of the same point: a row can be stored on 30 June and not be valid until July, or be valid on 30 June and stored only later. "System time tracks when a record was added, changed, or deleted in a database, which is independent from when the data is valid in the real world." (Nicola, *Temporal Data Management with DB2*, April 2012, "When to use system time, business time, or bitemporal.")

### Do not derive the authorization from the dates

A stored status is the wrong tool when it is only a cache of a date comparison. Erik Eidt's accepted answer on this question ("Should I use a Status field or rely on calculations?", Software Engineering Stack Exchange, 2016) says to skip the status column in that case: a cache goes stale, and "as of" reporting cannot be recovered from a flag that only means "now." His correction is the part that applies here:

> On the other hand, we should always seek to consider things from the business or domain perspective. In this case, what the authoritative condition is regarding the status… if there is some other notion of allowing status to be "active" beyond the [end] date. These [are] to be considered from a business perspective instead of a programmer's perspective.

Authorization on this farm is that other notion. Closing a period is a person's decision (`POST /api/pay-periods/[id]/close` from "Autorizar pago"). The close route does not consult `endDate`. The date-edit route then treats `isClosed` as the lock ("ya está CERRADO"). The flag is not a cache of the calendar. The calendar is not a cache of the flag. Either can move without the other, and both already have:

- An open period may run past its end date and be extended rather than closed (`src/app/api/pay-periods/route.ts`, invariant 1).
- A period may be closed while its end date is still ahead, as Período 12 was.

So the authoritative condition for "this period may be paid" is `isClosed`, recorded at `closedAt` by `closedBy`. Computing it from `endDate` reintroduces the disagreement Eidt describes, with the dates winning and the decision losing.

### Do not store the authorization a second time

The matching rule is: do not add a column that repeats a fact already stored. A second `status` or `authorizedAt` beside `isClosed` / `closedAt` will eventually disagree with them, and the screen will have to pick a winner again. `closedAt` is the authorization timestamp. The audit log already has the `CLOSE_PAY_PERIOD` row (who, when, the period id). That is the history of the event. The period row is the current projection. Both exist; a third copy is not required for this bug.

IBM's advice "don't use real-world dates or timestamps to define business time periods" (Nicola 2012, summary list, and "How to select columns for business time periods") is the same instinct aimed at a different design. In their insurance example, using the policy's coverage start/end as the SQL business-time period destroys the coverage window the moment a mid-term change splits the row. The remedy there is an extra pair of columns. Pay periods here are not versioned that way: one row is one period, date edits overwrite `startDate` / `endDate` and are written to `audit_logs`, and the authorization is a separate timestamp. Copying that extra-pair design onto `pay_periods` would not answer "which period was just authorized." The principle worth keeping is narrower: the coverage window and the moment a decision was recorded are different columns, and a query must name the one it means.

### Ordering and the comparison operator

Order authorized periods by `closedAt` descending, not by `endDate`. Under the one-open-period rule, closes happen in order, so the two sorts match today. They stop matching if an end date is later moved on a period that is still editable, or if anyone reasons about "most recent" as "latest window" again. `closedAt` is the event the screen is about, and it does not move when someone edits dates.

`endDate` on this table is an inclusive last day (`@db.Date`, shown to the user as that calendar day). "Already ended" is therefore `endDate < today`, not `endDate <= today`. IBM recommends inclusive-exclusive periods for *system-managed* business time, because `end` of one row then equals `start` of the next with no gap and no off-by-one (Nicola 2012, "Inclusive-inclusive or inclusive-exclusive"). This schema is inclusive-inclusive on purpose: the end date is a day a person reads. Changing `<` to `<=` would both mis-handle an inclusive end day and still fail to show Período 12 on 16 Oct. Leave the operator alone.

### What the commercial payroll products do

ADP Workforce Now's end-of-period procedure is explicit: run it only after the period's end date has passed, and lock the period before generating the payroll export. Closing early is an exception. ADP says to contact them so a representative can temporarily enable it, or to use a separate Projected Payroll feature when the company always runs payroll before the scheduled end ("Performing End of Period Operations Step-by-Step," ADP Time & Attendance help).

TEAM by WorkWave separates lock from close, and says the useful handle for finding a period is the lock's transaction number, "rather than searching by date" ("Using Period Lock/Unlock/Close," Timegate+ help, updated 26 Apr 2024). Close means "we are ready to commit this to payroll," which different companies do at different moments relative to the calendar.

Read together: the export file is a post-approval artifact, and the way you find that artifact is the approval, not the window. ADP's extra constraint (approval may not precede the end date, unless a special mode is on) is a workflow rule a product can enforce. This codebase does not enforce it, and the last three end-date edits plus yesterday's close show the farm does not follow it. Adopting it would be a new business rule, not a repair of the screen.

## UI / workflow

### The default is the decision

Pagos opens with the first chip selected (`useState(periods[0]?.id)`). The first chip is whatever the query returned first, and it is labeled "más reciente."

NN/g's "The Power of Defaults" (Nielsen, 2005): users stick to defaults, so the default has to be the common, helpful value, and a default chosen because it was first in some list is how errors get baked in. The same point is in "Top 10 Application-Design Mistakes" (NN/g): defaults speed the task and steer novices toward a safe outcome, which matters only when the preselected value is actually the safe one. UIE's settings study (Jared Spool, "Do users change their settings?", 2011) found fewer than 5% of users had changed any setting; more than 95% kept the installed configuration. The people who changed settings were mostly designers.

On this screen the default is not a preference. It is the period whose bank file will be downloaded. The preselected file is Período 11, Q67,689.10, 28 workers. The file that matches yesterday's authorization is Período 12, Q84,535.70, 31 workers. Nielsen's heuristic 5, error prevention ("10 Usability Heuristics," NN/g): prevent high-cost errors first; slips are stopped with constraints and good defaults. "Preventing User Errors: Avoiding Unconscious Slips" (NN/g) says the same thing more narrowly: start from a default that fits the real-world goal, then let the user refine. The real-world goal of this page, stated in its own subtitle, is the CSV to send to the bank for the payment that was just authorized.

### Say which fact the chip was chosen by

Heuristic 1, visibility of system status (NN/g, "Visibility of System Status"): no consequential action should happen without the user being told the system's state, including when the passage of time changed that state. "Más reciente" does not say recent *by what*. A reader looks at the dates, sees 9 Sep as the latest end date on screen, and believes the screen. The authorized period is absent, so there is nothing to notice.

NN/g's scoped-search article ("Scoped Search: Dangerous, but Sometimes Useful") is the same failure in another control. When the system silently narrows the set, "most people will not take the time to study the interface to figure out what is included or excluded, because it doesn't even occur to them that something might be excluded." They act on what is in front of them. Período 12 is excluded by a predicate the chips do not display.

The chip should name the fact: authorized, and the date of `closedAt` in Guatemala, alongside the work window (`10/9/2026 — 17/10/2026`). If that window still reaches past today, say so in the same place. Hiding the period until 18 Oct is the bug. A one-line note that the window includes a future day tells the truth without blocking the file.

The empty-state sentence "No hay períodos de pago finalizados todavía" encodes the same wrong predicate. It should speak about authorization, which is the condition the buttons actually represent once the query is fixed.

### Keep the screen post-approval

The three chips are the right shape: one primary period, two predecessors, on a page whose only job is the bank file. Do not add the open period to that list. Período 13 exists because close auto-opens the successor; it has not been authorized. ADP locks the period before the export is generated. The earlier audit-dashboard research in this repo (`docs/payroll-audit-dashboard-research.md`) already treats authorization as the lock that sits outside preparation. Showing the open period on Pagos would offer a file for a decision that has not been made.

Leave the two previous authorized periods as the other chips, still ordered by `closedAt`. Switching chips is the refinement; it should not be required to reach the period the page exists for.

`PayrollEntry.isPaid` is a third fact, already handled in the preview (rows already paid are called out and kept out of the file). It should not become the selection rule. "Latest authorized period that still has an unpaid row" hides a period the moment the last row is marked paid, and it can skip backward to an older period. The person who opens Pagos after authorizing should see that period even if some of its rows were already paid.

### One definition, because the predicate is already copied

Fowler's Effectivity note (martinfowler.com/eaaDev/Effectivity.html) describes the mechanical risk: once a client must remember to add the temporal clause, every caller can add a different one. This screen has already done that in spirit. Three sites repeat `endDate < today` and the comments say they must match. The repair is one function that returns "the authorized periods, newest authorization first," used by Pagos and by the audit download. A comment that says "keep these queries identical" is how Período 12 was missed in all three places at once.

## What not to change

- Do not add a lifecycle enum (`open` / `authorized` / `paid`) on `pay_periods`. Open versus authorized is `isClosed`. Paid is per worker, on `payroll_entries.isPaid`. A period-level paid flag would be a new cache of those rows.
- Do not block "Autorizar pago" on `endDate < today` as the fix for this screen. That is a different product decision (ADP's default). It does not match the extensions and the close that already happened.
- Do not switch the comparison to `<=`, and do not convert these columns to inclusive-exclusive storage. Neither would have included an end date of 17 Oct on the 16th, and the inclusive end day is what the chips print.
- Do not build SQL:2011 application-time or bitemporal tables for pay periods. The audit log is already the history of date edits and of the close.

## Sources

| Source | Kind | Used for |
|---|---|---|
| Snodgrass & Ahn, "Temporal Databases," *IEEE Computer* 19(9), Sept 1986, pp. 35–42. https://rts.cs.arizona.edu/pubs/Computer.pdf | Primary | Valid time, transaction time, user-defined time; the payroll-stub analogy |
| Jensen, Clifford, Elmasri, Snodgrass, et al., "A Consensus Glossary of Temporal Database Concepts," *ACM SIGMOD Record* 23(1), 1994 (the 1993 glossary). https://www2.cs.arizona.edu/people/rts/pubs/1993_jensenITDw.pdf | Primary | Definitions: valid time can be future; transaction time cannot |
| Matthias Nicola, "Temporal Data Management with DB2," IBM, April 2012. https://public.dhe.ibm.com/software/dw/data/bestpractices/DB2BP_Temporal_Data_Management_0412.pdf | Primary (vendor, SQL:2011) | System time vs business time; don't overload a real-world date pair; inclusive-exclusive for system-managed periods |
| Erik Eidt, accepted answer to "Should I use a Status field or rely on calculations?", Software Engineering Stack Exchange, 2016. https://softwareengineering.stackexchange.com/questions/312564/should-i-use-a-status-field-or-rely-on-calculations | Secondary | Store a status only when it is not a cache of the dates; the business rule decides which is authoritative |
| Martin Fowler, "Effectivity." https://martinfowler.com/eaaDev/Effectivity.html | Primary (pattern note) | Temporal clauses copied into every caller drift |
| ADP, "Performing End of Period Operations Step-by-Step." https://otcdc1.adp.com/ezlmhelp/v18_30/wfn/general/standardui/en-us/as_help/as/end_of_period-performing.htm | Vendor documentation | Close after the end date, unless Projected Payroll or a special enablement; lock before the export |
| TEAM by WorkWave, "Timegate+: Using Period Lock/Unlock/Close," 26 Apr 2024. https://workwave.my.site.com/teambyworkwave/s/article/TBWW-Using-Period-Lock-Unlock-Close-PPA | Vendor documentation | Find a committed period by its lock transaction, not by date |
| Jakob Nielsen, "The Power of Defaults," NN/g, 25 Sept 2005. https://www.nngroup.com/articles/the-power-of-defaults/ | Primary (UX) | Users keep the default; it must be the helpful value, not "whatever was first" |
| NN/g, "Top 10 Application-Design Mistakes." https://www.nngroup.com/articles/top-10-application-design-mistakes/ | Primary (UX) | A meaningful default is part of error prevention |
| NN/g, "10 Usability Heuristics for User Interface Design." https://www.nngroup.com/articles/ten-usability-heuristics/ | Primary (UX) | Visibility of status; prevent high-cost errors first |
| NN/g, "Visibility of System Status." https://www.nngroup.com/articles/visibility-system-status/ | Primary (UX) | Consequential state, including change caused by time passing, has to be told |
| NN/g, "Preventing User Errors: Avoiding Unconscious Slips." https://www.nngroup.com/articles/slips/ | Primary (UX) | Good defaults aimed at the real-world goal |
| NN/g, "Scoped Search: Dangerous, but Sometimes Useful." https://www.nngroup.com/articles/scoped-search/ | Primary (UX) | A silent exclusion is not noticed, and users act on what remains |
| Jared Spool, "Do users change their settings?", UIE, 14 Sept 2011. https://archive.uie.com/brainsparks/2011/09/14/do-users-change-their-settings/ | Primary (study write-up) | Fewer than 5% of users changed any setting |
