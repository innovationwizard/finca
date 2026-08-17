# Bug-Report Mechanism — System Specification Document

**Status:** implemented and running in production since 2026-08-11 (this repo, `air_lite`).
**Purpose of this document:** describe the mechanism completely enough to re-implement it in another repository, including the reasoning behind each non-obvious decision. Written spec-first (portable contract) with a concrete reference implementation (Next.js App Router + Supabase + Resend) called out separately.

> Written in English for portability; user-facing copy is Spanish and is reproduced verbatim as data, not prose — it is configurable, see §10.

---

## 1. Scope

**In scope.** An always-available, in-app control that lets an authenticated end user report either (a) a value the app shows incorrectly, or (b) something missing, capturing enough context that the developer can act without a follow-up conversation: who, where, what they expected, a screenshot, and environment metadata.

**Non-goals.** Not an issue tracker, not a support inbox, not a chat channel, no threading, no status back to the reporter, no attachments chosen by the user, no anonymous reports. Those are deliberate: the mechanism's value is that it costs the reporter ~30 seconds and costs the team zero infrastructure.

**Why it exists.** During a delivery to non-technical business users, discrepancy reports arrived as WhatsApp screenshots with no URL, no user identity, and no statement of what the number *should* have been. Each one cost a round-trip to become actionable. This mechanism front-loads those three facts into the report itself.

---

## 2. Design principles

These are load-bearing. An implementation that drops one of them is a different (weaker) mechanism.

| # | Principle | Why |
|---|---|---|
| P1 | **Persist before notifying.** The report is written to durable storage *first*; the notification (email) is attempted second, and its outcome is recorded back onto the stored row. | Email silently fails: rate limits, provider outages, expired keys, spam filtering. A lost report is invisible — the user believes they reported it. Storage is the record; email is only the notification. |
| P2 | **Screenshot capture must never block the report.** Capture is wrapped in try/catch + timeout; on any failure the report proceeds and the absence is stated explicitly in the notification. | A capture bug must not cost you the report. Partial evidence beats no evidence. |
| P3 | **Capture at invocation time, not at submit time.** The screenshot is taken the instant the launcher is clicked — before the modal opens. | Otherwise the modal covers the very data being reported. This is the single highest-value detail in the whole design. |
| P4 | **The widget excludes itself from its own screenshot.** | Same reason as P3, for the launcher and any toast/overlay the widget owns. |
| P5 | **Identity comes from the server session, never from the client payload.** | A client-declared identity is unauthenticated. The reporter's name/email/role are read from the session on the server. |
| P6 | **Validation is server-authoritative.** The client validates only to enable/disable the submit button; the server re-validates every field independently. | Client checks are UX, not a security or integrity boundary. |
| P7 | **Fail loudly to the user only when the report was actually lost.** If storage succeeded but the email failed, the user sees success. | The user's job is done; delivery is our problem, and it is recorded for us to chase. |

---

## 3. Architecture

```
 ┌─ browser ────────────────────────────────────────────────┐
 │  [launcher pill]  ──click──►  capture screenshot (async) │
 │        │                       + collect metadata         │
 │        └──────────────────►  modal (native <dialog>)      │
 │                                 │ type selection          │
 │                                 │ required fields         │
 │                                 ▼ submit (enabled only    │
 │                                   when fields non-empty)  │
 └──────────────────────────────────┬───────────────────────┘
                                    │ POST (JSON)
 ┌─ server ─────────────────────────▼───────────────────────┐
 │ 1. authenticate  → identity from session (P5)            │
 │ 2. validate      → server-authoritative (P6)             │
 │ 3. INSERT report → durable row, email_status='pending'   │  ◄── P1
 │ 4. send email    → notification with screenshot attached │
 │ 5. UPDATE row    → email_status + provider id | error    │
 │ 6. 201 { ok, id, emailed }                               │
 └──────────────────────────────────────────────────────────┘
```

Step 3 succeeding is what makes the request a success. Steps 4–5 are best-effort and never change the response status.

---

## 4. Data contracts

### 4.1 Client → server payload

```jsonc
{
  "kind": "dato_incorrecto" | "falta_algo",   // report type discriminator
  // present when kind = "dato_incorrecto" (all three required):
  "donde":            "string",  // where: row + column, SKU, any locator
  "appDice":          "string",  // what the app currently shows
  "appDeberiaDecir":  "string",  // what it should show
  // present when kind = "falta_algo" (required):
  "queFalta":         "string",  // free text: what is missing
  "url":      "string",          // window.location.href (full, with query + hash)
  "meta": {
    "userAgent":  "string",
    "viewport":   "1280x800",
    "screen":     "1920x1080",
    "dpr":        2,
    "tz":         "America/Guatemala",
    "capturedAt": "ISO-8601"
  },
  "screenshot": "base64 | null"   // JPEG, no data: prefix; null if capture failed
}
```

### 4.2 Validation rules (server-authoritative)

| Field | Rule | On violation |
|---|---|---|
| `kind` | must be one of the two literals | 400 |
| short fields (`donde`, `appDice`, `appDeberiaDecir`) | required when `kind=dato_incorrecto`; trimmed; non-empty; ≤ 200 chars | 400 |
| `queFalta` | required when `kind=falta_algo`; trimmed; non-empty; ≤ 5 000 chars | 400 |
| `url` | non-empty; ≤ 2 000 chars | 400 |
| `meta.*` | **normalized, never rejected** — each field coerced/truncated, `dpr` defaults to 1 | accepted |
| `screenshot` | optional; ≤ 3 000 000 base64 chars | 400 |

`meta` is deliberately non-fatal: malformed environment data must not cost a valid report (P2 generalized).

**Screenshot ceiling rationale.** 3 M base64 chars ≈ 2.2 MB binary. The binding constraint is the *serverless request body limit* (4.5 MB on Vercel), not the email provider's attachment limit (40 MB on Resend). Size the cap to your platform's request limit, not your mail provider's.

### 4.3 Storage schema

```sql
CREATE TABLE bug_reports (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),   -- time-ordered
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- reporter: resolved server-side from the session, never client-supplied (P5)
  user_id      UUID         NOT NULL,
  autor        VARCHAR(500) NOT NULL,   -- display name (see §11, lesson L3)
  email        VARCHAR(255) NOT NULL,
  role         VARCHAR(20)  NOT NULL,

  -- report body
  kind              VARCHAR(20) NOT NULL CHECK (kind IN ('dato_incorrecto','falta_algo')),
  donde             TEXT,
  app_dice          TEXT,
  app_deberia_decir TEXT,
  que_falta         TEXT,
  CONSTRAINT bug_reports_kind_fields CHECK (
    (kind = 'dato_incorrecto' AND donde IS NOT NULL AND app_dice IS NOT NULL
       AND app_deberia_decir IS NOT NULL AND que_falta IS NULL)
    OR
    (kind = 'falta_algo' AND que_falta IS NOT NULL AND donde IS NULL
       AND app_dice IS NULL AND app_deberia_decir IS NULL)
  ),

  -- auto-captured context
  url            TEXT  NOT NULL,
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  screenshot_b64 TEXT,                    -- NULL when capture failed

  -- notification outcome (written after the send attempt)
  email_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending','sent','failed','not_configured')),
  resend_id    TEXT,     -- provider message id when sent
  email_error  TEXT      -- provider/config error when not sent
);
CREATE INDEX idx_bug_reports_created_at ON bug_reports (created_at DESC);
```

The `bug_reports_kind_fields` CHECK is what makes the two report types a real discriminated union at rest: it is impossible to store a row that carries fields from both shapes. **Do not drop it** — it is the difference between a typed record and a bag of nullable columns.

`email_status` is the operational value: `SELECT … WHERE email_status <> 'sent'` is the "what did we fail to deliver" query, and `not_configured` distinguishes *"the provider rejected it"* from *"nobody set the API key"*.

### 4.4 Notification (email)

- **Subject:** `[APP] {Type label} — {url pathname} — {reporter display name}` — scannable in an inbox without opening.
- **Body:** reporter (name, email, role) · full URL · the answered fields verbatim · timestamp + timezone · user agent · viewport/screen/DPR · explicit line stating whether a screenshot is attached.
- **Attachment:** the JPEG, when present.
- **Recipients:** configuration, not code (comma-separated env var).
- **Escaping:** every user-supplied value is HTML-escaped before interpolation into the body. The reporter is authenticated but the field content is arbitrary text.

---

## 5. Component specification

### 5.1 Launcher

Fixed-position control, always visible on authenticated pages, high z-index, bottom-right by convention (Sentry/Marker.io/Userback all default there; bottom-left is the standard fallback when that corner is occupied).

Requirements: `aria-label`; carries the widget-exclusion marker attribute (P4); on activation → start capture **then** open the modal, in that order (P3).

### 5.2 Capture module

```
captureScreenshot(): Promise<string | null>   // base64 JPEG, no data: prefix
collectMetadata():   BugReportMeta            // synchronous, cannot fail
```

Capture parameters (reference implementation): JPEG, quality 0.8, white background, clipped to the **viewport** (not the full scrollable document), width capped at 1600 px, widget selector excluded, **5-second timeout**, oversize → `null`.

Contract: **resolves, never rejects.** Every failure path returns `null` and logs a warning.

**Library choice.** DOM-cloning via SVG `foreignObject` (`@zumer/snapdom` in the reference; `html-to-image` is an equivalent alternative). Explicitly *not* `html2canvas` — unmaintained since 2022 and it throws on modern CSS colour functions (`oklch`), which any Tailwind v4 app emits. Explicitly *not* the native `getDisplayMedia` screen-capture API: it is pixel-perfect but raises a browser permission picker on every capture, which is unacceptable friction for non-technical users (Sentry accepts that trade-off; for this use case it is wrong).

### 5.3 Modal

Native `<dialog>` + `showModal()`. This is a requirement, not a preference: it provides focus trapping, Escape-to-close, top-layer stacking, and `aria-modal` semantics for free — all of which a hand-rolled `div` overlay must otherwise re-implement and usually gets wrong.

State machine:

```
choose ──► dato_incorrecto ──► (submit) ──► done ──► auto-close
       └─► falta_algo      ──┘                └─ (error) ─► stays, form intact, retryable
```

Rules: back navigation from either form to `choose`; submit disabled unless all required fields are non-empty after `trim()`; submit disabled while in flight (double-submit guard); on close, reset all state; screenshot status shown as one of *capturing / included / unavailable* so the reporter knows what is being sent.

### 5.4 Intake endpoint

`POST /api/feedback`, authenticated, executed strictly in the §3 order. Response codes:

| Code | Meaning |
|---|---|
| 201 | report stored (`{ ok, id, emailed }` — `emailed` may be `false`) |
| 400 | payload invalid (message names the offending rule, in the user's language) |
| 401/403 | not authenticated / not authorized |
| 500 | **storage** failed — the only case where the user must retry |

Note the asymmetry: a failed email is a 201 with `emailed: false`. A failed insert is a 500. That is P1 and P7 expressed in status codes.

### 5.5 Mount point

Mount inside the authenticated layout/shell, not the global root: unauthenticated pages (login, password reset, maintenance) have no user identity to attach, and a report from there would be anonymous.

---

## 6. Failure-mode matrix

| Failure | System behaviour | User sees |
|---|---|---|
| Screenshot throws / times out / oversize | report proceeds; `screenshot_b64 = NULL`; email states "unavailable" | "screenshot unavailable — the report is sent anyway" |
| Malformed `meta` | normalized, report proceeds | nothing |
| Required field empty/whitespace | submit disabled client-side; 400 if bypassed | disabled button |
| Email provider error | row already stored; `email_status='failed'`, error recorded | **success** (P7) |
| Email not configured | row already stored; `email_status='not_configured'` | **success** |
| Storage insert fails | 500, nothing stored | "could not save — try again" |
| Double submit | button disabled in flight | — |
| Route not authorized | 403 before any work | error message |

---

## 7. Security & privacy

- **Identity is server-derived** (P5). Client-sent identity fields, if any, are ignored.
- **HTML escaping** on every user value interpolated into the email body.
- **Length caps** on every stored string; the screenshot cap doubles as a request-size guard.
- **Storage access:** the table is written by a privileged server-side client only; read access restricted to admin roles. End users cannot enumerate others' reports.
- **⚠️ Screenshots may contain sensitive business data.** A viewport capture of an internal app includes whatever the user was looking at — prices, customers, margins. Consequences to decide per repo: who may read the table, whether a retention/purge policy is needed, and whether the mail provider's log retention is acceptable for your data. This mechanism intentionally has **no** redaction step; if you need one, it belongs between capture and submit.
- **Route authorization:** if the stack has a route-permission matrix, the intake route needs an entry for every role that can report — otherwise it 403s for exactly the non-admin users the mechanism exists to serve. (This is the most common porting mistake; see §9 step 6.)

---

## 8. Configuration

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` (or provider equivalent) | notification provider credential |
| `BUG_REPORT_FROM` | sender; accepts `Display Name <address@domain>` |
| `BUG_REPORT_TO` | comma-separated recipients |

Absent configuration is a **valid state**: reports persist with `email_status='not_configured'`. The mechanism is useful (if quiet) before mail is set up — deploy it first, wire mail second.

**Deliverability prerequisite.** With Resend (and equivalents), an unverified domain can only send to the account owner's own address. To reach arbitrary recipients you must verify a sending domain via DNS (DKIM `TXT`, SPF `TXT` and MX on a subdomain, ideally a `_dmarc` record). Budget for this — it is the long pole in a first-time setup, though propagation is usually minutes.

---

## 9. Porting checklist

Stack-agnostic; the reference implementation's choices are in brackets.

1. **Storage** — create the §4.3 table [Postgres/Supabase migration]. Keep the kind CHECK.
2. **Validation module** — implement §4.2 as a pure, dependency-free function so it is unit-testable and shared by client and server [TypeScript module].
3. **Capture module** — §5.2 contract, DOM-cloning library, resolves-never-rejects [`@zumer/snapdom`].
4. **Intake endpoint** — §3 order, §5.4 status codes [Next.js route handler; a server action also works if you raise its body-size limit].
5. **Notification module** — §4.4, escaping, provider-agnostic behind one function [Resend SDK].
6. **Authorization** — grant the route to every role that can report; verify with a non-admin account before declaring done.
7. **Widget** — §5.1/§5.3, mounted per §5.5.
8. **Configure** — §8, including domain verification.
9. **Verify** — §12 acceptance tests, including one report per type from a non-admin account.

Reference implementation file layout (this repo):

```
frontend/src/components/feedback/BugReportWidget.tsx   launcher + modal + state machine
frontend/src/lib/feedback/capture.ts                   screenshot + metadata
frontend/src/lib/feedback/validate.ts                  shared validation (pure)
frontend/src/lib/feedback/email.ts                     notification (server-only)
frontend/src/app/api/feedback/route.ts                 intake endpoint
supabase/migrations/*_bug_reports.sql                  table + route permissions
```

---

## 10. User-facing copy (reference)

The two-type split is the mechanism's core UX decision: it turns "something's wrong" into a typed, actionable report without making the user think in categories. Copy is configurable; these are the production strings, which have been validated with real non-technical users.

| Element | String (es-GT) |
|---|---|
| Launcher | `Reportar` |
| Type A | `Aquí hay un dato incorrecto` |
| Type A field 1 | `¿Dónde? Fila y columna:` |
| Type A field 2 | `La app dice:` |
| Type A field 3 | `La app debería decir:` |
| Type B | `Aquí hace falta algo` |
| Type B field | `¿Qué es lo que hace falta?` |
| Submit | `ENVIAR` |
| Success | `✓ Reporte enviado. ¡Gracias!` |

**Why type A has exactly three fields.** They are the three facts a developer needs and a user rarely volunteers: *where* (a locator), *observed*, *expected*. Collapsing them into one free-text box measurably degrades report quality; splitting them costs the user no extra thought because they already know all three when they decide to report.

---

## 11. Lessons from production

- **L1 — Capture timing.** Capturing at submit time yields screenshots of the modal. Capture at launcher-click (P3).
- **L2 — Self-exclusion.** Without P4 the pill appears in every screenshot, sometimes over the reported cell.
- **L3 — Attribution column width.** `autor` was originally `VARCHAR(120)`, sized for a person's display name. It later received *provenance* strings from automated ingestion and a write failed with an opaque 400. If the same column may ever carry machine-written provenance, size it for a sentence (500), and cap it in code from a named constant that references the migration.
- **L4 — Platform limit, not provider limit.** See §4.2.
- **L5 — Deploy order.** Ship storage + widget before mail is configured; `not_configured` makes the gap visible without losing reports.

---

## 12. Acceptance tests

**Automated (unit, on the validation module):** each required field rejected when empty/whitespace-only; over-length rejected; both kinds accepted with correct field sets; malformed `meta` normalized rather than rejected; oversized screenshot rejected; trimming applied.

**Manual, before declaring done:**

1. Submit one report of each type **from a non-admin account** (catches §9 step 6).
2. Confirm both recipients receive the mail with the screenshot attached and correct copy.
3. Confirm `SELECT kind, email_status FROM bug_reports` shows `sent`.
4. Force a capture failure (e.g. block the library) → report still submits, email states unavailable.
5. Unset the provider key → report still returns success, row shows `not_configured`.
6. Verify the screenshot does **not** contain the widget.
```
