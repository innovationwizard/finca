# Plan — Fix `/pagos` UX (bank CSV export). Element-by-element.

_Status: IMPLEMENTED (2026-06-15). All 8 elements built across the 3 files; `tsc` + ESLint
clean. Browser verification of the live page still pending. CSV output/format unchanged._

## 1. Background & decisions locked

The bank CSV file is **already produced correctly** by `/pagos`. We are NOT building a
new exporter and NOT changing the file format. Confirmed:

- Output line stays exactly: `tipo+MM+YY ; bankAccount ; bankCode ; totalToPay(2dp) ; acctType ; FIRSTNAME`
  → e.g. `A0426;4029152121;16;452.50;4;ADISTER`.
- Amount source = `PayrollEntry.totalToPay` (true net pay). Never the resumen page's
  gross display.
- Name = first token of `fullName`, UPPERCASE. Bank wants first name only.
- The only problem to fix is the page's **confusing defaults/filters**.

Files in play (no format/logic change to the CSV builder itself):
- `src/app/(authenticated)/pagos/pagos-view.tsx`
- `src/app/api/pagos/route.ts`
- `src/app/(authenticated)/pagos/page.tsx`

## 2. Element-by-element review of `/pagos`

Top to bottom. ✅ = decided · 🔶 = open · ⬜ = not yet reviewed.

### Element 1 — Filter bar
✅ **The filter bar contains ONLY: the 3 period buttons + the A/P (Tipo de Pago)
selector.** Removed: all 4 mode tabs (Mes / Semana / Período / Rango), the Mes/Año
dropdowns, the search box, AND the "Descargar CSV" button (the download button does not
belong in the filter bar — relocated, see Element 5).

The **3 quick-select buttons** (replacing the period dropdown):
1. **Most recent period whose `endDate` is past** (latest already-ended period) — **selected
   by default** on page load.
2. **One period before** that.
3. **Two periods before** that.

Implementation notes:
- "Ended" = `endDate < today`. Order ended periods by `endDate` desc; take indices 0, 1, 2.
- Each button label shows which period (e.g. `Sem 8 · 14/5 — 13/6`) so the choice is legible.
- Selecting a button drives the existing `mode=period&periodId=…` API path. The week/
  month/range code paths in `pagos-view.tsx` and `api/pagos/route.ts` get removed.
- ✅ The 3 buttons must resolve across agricultural-year boundaries. `/pagos` currently
  scopes its period query to the current agricultural year — **remove that scope.** Select
  the 3 most recent ended periods purely by date (`endDate < today`, order by `endDate`
  desc, take 0/1/2), regardless of which agricultural year each falls in. Any of the three
  (most recent, one before, two before) can land in the prior year near a year boundary.
- 🔶 Edge case: fewer than 3 ended periods exist (very early in the system's life) → show
  only the available buttons, never a dead/empty button.

### Element 2 — Payment type (Anticipo "A" / Planilla "P")
✅ **Default to "P" (Planilla).** _(Supersedes the earlier "no default / force choice"
decision.)_ The A/P selector remains in the filter bar so the user can switch to "A"
(Anticipo) when needed. Because there is always a valid value, the preview always renders
and Descargar is always enabled (no disabled/empty state needed).

### Element 3 — Header / title ("Pagos" + subtitle)
✅ **DONE.** Subtitle replaced with "Descarga aquí el csv de pagos para enviar al banco".
Dropped the "· Año agrícola {year}" suffix (misleading now that periods can span years).
`year` is still used elsewhere in `page.tsx`; left intact.

### Element 4 — Search box (worker / account)
✅ **Removed** from the filter bar (per Element 1).

### Element 5 — Download CSV button
✅ **Placed directly below the file preview (Element 7).** Always enabled (A/P defaults to
"P", so a valid file always exists).

### Element 6 — Summary / warning area
✅ **Keep the Total a Pagar and Trabajadores cards; remove the Período card.** Plus a
single, loud, unmissable warning that lists — **by name** — every worker left OUT of the
file for the selected period:
  - no `bankAccount`, and/or
  - `totalToPay <= 0`.
If none are excluded, no warning shows.
- **Total a Pagar** = the total of the FILE sent to the bank (sum of the rows actually
  written), NOT the full period obligation. **Trabajadores** = count of those same rows.
  Both exclude the warned-about workers, so the two cards, the preview, and the downloaded
  file always agree.
This is the safety net replacing the lost breakdown table: a silently short file = an
unpaid worker.

### Element 7 — File preview (replaces the data table)
✅ **Raw CSV lines, monospace** — the exact text that downloads, one line per worker:
`A0426;4029152121;16;452.50;4;ADISTER`. The Descargar CSV button sits directly beneath it.
- The rich breakdown table (Devengado / Bonificación / Séptimo / Anticipos / Deducciones /
  A Pagar) is **removed** — replaced by this raw preview.
- Preview = file, 1:1: same rows, same order, same exclusions. What you see is what downloads.
- Always renders (A/P defaults to "P", per Element 2) — no empty/disabled state.
- 🔶 Dirty George: excluded workers (no bank account / `totalToPay <= 0`) are absent from
  the raw preview by definition. Their visibility MUST be preserved elsewhere — see
  Element 6 (a quiet short file is the hazard).

### Element 8 — CSV format note (footer text)
✅ **Removed.** The raw preview shows the actual file, so the explanatory paragraph is
redundant.

### Cross-cutting — access / roles
✅ **Leave as-is** (`CFO, MASTER, CONSULTANT`). Not raised as a problem; out of scope for
this pass.

## 3. Final page layout (top → bottom)
1. Header: "Pagos" + "Descarga aquí el csv de pagos para enviar al banco". _(done)_
2. Filter bar: 3 period buttons (most-recent selected by default) + A/P selector (default P).
3. Summary cards: Total a Pagar + Trabajadores (both reflect the file's rows), then the
   excluded-workers warning (only when some are excluded; lists them by name).
4. Raw CSV preview (monospace, = the file 1:1).
5. Descargar CSV button (directly below the preview; always enabled).

## 4. Implementation checklist
- `pagos-view.tsx`: delete mode tabs, Mes/Año/Semana/Rango controls, search box, the
  Período card, and the breakdown `<table>`. Keep the Total a Pagar + Trabajadores cards
  (recomputed over the file's rows). Add: 3 period buttons (default = most recent ended),
  A/P selector (default `P`), excluded-workers warning, monospace raw-CSV preview, and the
  Descargar button beneath it. Keep `buildPeriodCode` / `getAccountType` / `downloadCSV`
  CSV logic unchanged (the file format is identical).
- `api/pagos/route.ts`: keep `mode=period`; remove `month`/`week`/`range` branches. Return,
  alongside the file rows, the **excluded** workers (no account / `totalToPay <= 0`) so the
  UI can warn by name — currently they are dropped before reaching the client.
- `pagos/page.tsx`: replace the current-agricultural-year period query with "3 most recent
  ended periods by date, any year" (or load enough recent periods for the 3 buttons).
  Subtitle already updated.
- Verify the preview text and the downloaded file are byte-identical.

## 5. Out of scope (RULE ZERO)
- No change to CSV format, columns, delimiter, or field semantics.
- No second exporter; resumen does not gain an export.
- No payroll-math changes; `PayrollEntry.totalToPay` stays authoritative.
- Role/access unchanged.
