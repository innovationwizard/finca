# Bug-Report Mechanism ("Reportar") — Implementation Plan for `finca`

**Status:** **CODE IMPLEMENTED 2026-08-17.** `tsc` clean, ESLint clean, 29 unit tests green,
`next build` clean. **Not yet live:** the migration has not been applied, the bucket has not been
created, and mail is not configured — all three are state-mutating and are yours to trigger (§12).
**Date:** 2026-08-17
**Source spec:** [BUG_REPORT_MECHANISM_SSD.md](../BUG_REPORT_MECHANISM_SSD.md) (reference implementation: `air_lite`, in production since 2026-08-11).
**Authority for execution:** NONE yet.

This plan is the SSD **ported to this repo**, not a restatement of it. Where this repo's stack
makes a different choice better, the deviation is named, justified, and tied back to the SSD
principle it must still satisfy (P1–P7). Section numbers in `§n` refer to the SSD.

---

## 1. Decisions locked (answered 2026-08-17)

| # | Decision | Choice |
|---|---|---|
| D1 | Email provider | **Resend, in two phases.** Ship storage + widget first with no API key → rows land with `email_status = NOT_CONFIGURED` (SSD lesson L5). Wire the key + verified domain + recipients second, no code change. |
| D2 | Screenshot at rest | **Supabase Storage (private bucket) + path on the row.** Deviates from SSD §4.3 `screenshot_b64 TEXT`. |
| D3 | Admin read UI | **Yes — `/admin/reportes`**, read-only, MASTER + ADMIN. Deviates from SSD non-goals. |
| D4 | Offline (PWA) | **Online only, with an explicit Spanish notice.** No Dexie queue. The typed text is preserved so the user can resend. |
| D5 | Screenshot in the email | **No attachment — the mail carries a link to `/admin/reportes?id=…`.** Decided 2026-08-17 after §10. No payroll imagery leaves the database. |
| D6 | Test runner | **vitest**, added as a devDependency with `npm test`. The repo's first test infrastructure. |

---

## 2. What this repo already provides (reuse, don't rebuild)

| Need | Already exists | Path |
|---|---|---|
| Session identity (P5) | `getCurrentUser()` → `{ id, email, name, role }`, already blocks `isActive = false` | [guards.ts:25](../src/lib/auth/guards.ts#L25) |
| API authorization (P6) | `apiRequireRole(...roles)` → 401/403 `NextResponse` | [guards.ts:136](../src/lib/auth/guards.ts#L136) |
| Centralized role matrix | Named role constants (`SETTINGS_ROLES`, `WRITE_ROLES`, …) | [guards.ts:70-119](../src/lib/auth/guards.ts#L70-L119) |
| Authenticated shell (§5.5 mount point) | `(authenticated)/layout.tsx` — already redirects to `/login` when there is no user | [layout.tsx](../src/app/\(authenticated\)/layout.tsx) |
| Privileged storage client (§7) | `createServiceClient()` (service-role, server-only) | [service.ts](../src/lib/supabase/service.ts) |
| Validation convention | Zod v3 modules, Spanish error messages | [src/lib/validators/](../src/lib/validators/) |
| API route convention | `apiRequireRole` → `NextResponse` guard → Prisma → JSON | [activities/route.ts](../src/app/api/activities/route.ts) |
| Online/offline signal (D4) | `useSyncStatus().isOnline` (zustand) | [use-sync-status.ts](../src/hooks/use-sync-status.ts) |
| UUIDv7 ids | `@default(uuid(7)) @db.Uuid` everywhere | [schema.prisma](../prisma/schema.prisma) |
| Deployment platform (§4.2 cap) | **Vercel** (`.vercel` in `.gitignore`) → 4.5 MB request body limit applies as written | — |

Gaps this plan must fill: **no email dependency**, **no Supabase Storage bucket referenced anywhere in
code**, **no `<dialog>` precedent**, **no test runner at all**.

---

## 3. Deviations from the SSD, and why

**V1 — Screenshot goes to Supabase Storage, not into the row (D2).**
SSD §4.3 stores base64 in the table. Here a viewport capture is ~0.5–2 MB; at one report a day the
`bug_reports` table would grow ~0.5 GB/year inside the Supabase Postgres instance, where it competes
with payroll data for the plan's DB quota, and where deleting it later means bloat + `VACUUM`.
Storage costs nothing structurally, has a documented 5 GB budget already in play for this project, and
makes retention a `DELETE FROM storage.objects` instead of a table rewrite.
**The SSD principle that must survive:** P1 (persist before notifying). It does — see §6, the row is
inserted *before* the upload, so a Storage outage costs the screenshot, never the report. The columns
become `screenshot_path TEXT` + `screenshot_error TEXT`; `NULL` path still means "no screenshot", and
the email still says so explicitly.

**V2 — Prisma enums instead of `VARCHAR` + `CHECK` for `kind` / `email_status`.**
Repo convention (`UserRole`, `EstimateType`, `PayPeriodStatus` are all Postgres enums). The §4.3
**`bug_reports_kind_fields` CHECK is kept verbatim** — it is the discriminated-union-at-rest guarantee
the SSD explicitly says not to drop. Prisma cannot express a multi-column CHECK, so the migration is
generated with `--create-only` and the constraint is appended by hand, with a comment saying why it
must never be dropped by a later `prisma migrate` regeneration.

**V3 — Validation lives in `src/lib/validators/bug-report.ts` (Zod), not `lib/feedback/validate.ts`.**
Repo convention; RULE 14. The SSD's requirement is that the module be **pure, dependency-light, and
shared by client and server** — a Zod schema is exactly that, and it is already how every other
payload in this app is validated. `meta` uses `.catch()` per field so it is **normalized, never
rejected** (§4.2), which is the only non-obvious part of the schema.

**V4 — `/admin/reportes` exists (D3).** SSD non-goal, deliberately overridden: email can be filtered,
lost, or read by someone who then forgets. The DB row is the record of truth and it needs an
authenticated way to be read. Read-only — no status, no reply, no threading (those non-goals stand).

**V5 — Launcher is not at bottom-right on mobile.** `MobileNav` occupies the bottom bar and `main`
carries `pb-20`. The launcher sits **above the nav on small screens** and bottom-right on desktop
(`bottom-24 right-4 lg:bottom-6 lg:right-6`). SSD §5.1 already sanctions moving it when the corner is
occupied.

**V7 — The notification carries a link, not the JPEG (D5).**
SSD §4.4 attaches the image. Here a capture contains worker names, wages, séptimo, descuentos, net
pay and sometimes bank accounts; attaching it copies that into every recipient's mailbox and into
Resend's logs, outside this app's access control and outside any retention policy. The mail instead
carries `NEXT_PUBLIC_APP_URL/admin/reportes?id=<uuid>`. **That link is authenticated, not a bearer
token** — it holds no secret and grants nothing on its own; opening it requires a session and a
MASTER/ADMIN role, and forwarding it leaks a URL rather than data. A signed URL in the mail would
have re-created the exact leak this decision removes. `replyTo` is set to the reporter, so a
follow-up question is one keystroke away.

**V8 — `kind` travels as the Prisma enum literal (`DATO_INCORRECTO` / `FALTA_ALGO`),** not the SSD's
lowercase strings. One vocabulary from the widget through the payload, the validator, the Prisma
enum and the CHECK — no translation layer to get out of sync.

**V6 — No user-facing report from unauthenticated pages.** Unchanged from §5.5, stated because this
repo's `/login`, `/recuperar`, `/reset-password` sit outside `(authenticated)` — mounting in
`(authenticated)/layout.tsx` gets this right for free.

---

## 4. Data model

### 4.1 Prisma (`prisma/schema.prisma`)

```prisma
enum BugReportKind {
  DATO_INCORRECTO
  FALTA_ALGO
}

enum BugReportEmailStatus {
  PENDING
  SENT
  FAILED
  NOT_CONFIGURED
}

model BugReport {
  id        String   @id @default(uuid(7)) @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")

  // Reporter — resolved server-side from the session, never client-supplied (P5).
  userId String   @map("user_id") @db.Uuid
  autor  String   @db.VarChar(500)   // 500, not 120 — SSD lesson L3
  email  String   @db.VarChar(255)
  role   UserRole

  // Report body — a discriminated union; the CHECK in the migration enforces it.
  kind            BugReportKind
  donde           String? @db.VarChar(200)
  appDice         String? @map("app_dice") @db.VarChar(200)
  appDeberiaDecir String? @map("app_deberia_decir") @db.VarChar(200)
  queFalta        String? @map("que_falta")

  // Auto-captured context
  url             String
  meta            Json    @default("{}")
  screenshotPath  String? @map("screenshot_path")   // bucket object path; NULL = no screenshot
  screenshotError String? @map("screenshot_error")  // why: capture failed | upload failed | oversize

  // Notification outcome, written after the send attempt
  emailStatus BugReportEmailStatus @default(PENDING) @map("email_status")
  resendId    String?              @map("resend_id")
  emailError  String?              @map("email_error")

  user User @relation(fields: [userId], references: [id])

  @@index([createdAt(sort: Desc)])
  @@index([emailStatus])
  @@map("bug_reports")
}
```

Plus the back-relation on `User`: `bugReports BugReport[]`.

`autor` is `VARCHAR(500)` and the code cap comes from a named constant that cites this migration
(SSD L3 — the column later received machine-written provenance strings and a write failed with an
opaque 400).

### 4.2 Migration (`prisma/migrations/<ts>_bug_reports/migration.sql`)

Generated with `npx prisma migrate dev --create-only --name bug_reports`, then hand-edited to append:

```sql
-- The discriminated union at rest. A row can carry the fields of exactly one kind.
-- DO NOT DROP: without it this is a bag of nullable columns, not a typed record.
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_kind_fields CHECK (
  (kind = 'DATO_INCORRECTO'
     AND donde IS NOT NULL AND app_dice IS NOT NULL AND app_deberia_decir IS NOT NULL
     AND que_falta IS NULL)
  OR
  (kind = 'FALTA_ALGO'
     AND que_falta IS NOT NULL
     AND donde IS NULL AND app_dice IS NULL AND app_deberia_decir IS NULL)
);
```

### 4.3 Storage bucket

Private bucket **`bug-report-screenshots`**, object path `YYYY/MM/<reportId>.jpg`.
No RLS policy for end users: only `createServiceClient()` writes, and only the admin page reads —
through short-lived signed URLs minted server-side. There is no bucket-creation precedent in this
repo's code, so it is created by a one-shot script following the `scripts/*.ts` + `tsx` convention
(`scripts/create-bug-report-bucket.ts`), which is idempotent and safe to re-run.

---

## 5. Files to create / touch

| Action | Path | Contents |
|---|---|---|
| edit | `prisma/schema.prisma` | §4.1 model + enums + `User.bugReports` |
| new | `prisma/migrations/<ts>_bug_reports/migration.sql` | §4.2, CHECK appended by hand |
| new | `scripts/create-bug-report-bucket.ts` | idempotent private-bucket creation |
| new | `src/lib/validators/bug-report.ts` | Zod schema (§4.2 rules), Spanish messages, shared client+server |
| new | `src/lib/feedback/copy.ts` | every Spanish string in one object (i18n-ready, per THE RULES) |
| new | `src/lib/feedback/capture.ts` | `captureScreenshot()` / `collectMetadata()` — §5.2 contract |
| new | `src/lib/feedback/screenshot-storage.ts` | server-only upload + signed-URL read |
| new | `src/lib/feedback/email.ts` | server-only, Resend behind one function, HTML-escaping, link not attachment (V7) |
| new | `src/lib/validators/bug-report.test.ts` | 29 unit tests (§11) |
| new | `src/app/api/feedback/route.ts` | intake endpoint, §3 order, §5.4 status codes |
| new | `src/components/feedback/bug-report-widget.tsx` | launcher + `<dialog>` + state machine |
| edit | `src/app/(authenticated)/layout.tsx` | mount widget inside the shell (§5.5) |
| new | `src/app/(authenticated)/admin/reportes/page.tsx` | server component, `requireRole(...SETTINGS_ROLES)` |
| new | `src/app/(authenticated)/admin/reportes/reportes-list.tsx` | read-only list client component |
| edit | `src/components/layout/sidebar.tsx` | one nav entry beside the existing `/admin/*` links, `roles: SETTINGS_ROLES` |
| edit | `src/lib/auth/guards.ts` | `BUG_REPORT_ROLES` constant |
| edit | `.env.example` | the three §8 variables, documented |
| edit | `package.json` | `resend`, `@zumer/snapdom` deps (+ test runner, see §11) |

Filenames are kebab-case to match `mobile-nav.tsx`, `activities-manager.tsx`, etc.

---

## 6. Request flow (P1 + P7 in this repo's terms)

```
POST /api/feedback
 1. apiRequireRole(...BUG_REPORT_ROLES)        → 401 / 403 before any work
 2. bugReportSchema.safeParse(body)            → 400, message names the failing rule, in Spanish
 3. prisma.bugReport.create({ ... })           → 201 is decided HERE.  ◄── P1
      emailStatus: PENDING, screenshotPath: null
      autor/email/role taken from the session, NEVER from the body   ◄── P5
    ↳ throws → 500 "No se pudo guardar. Intenta de nuevo."  (the ONLY user-retry case)
 4. upload screenshot to bucket (best effort)  → update screenshotPath | screenshotError
 5. send email with the JPEG attached (best effort, from the in-memory buffer, not the bucket)
 6. update emailStatus = SENT | FAILED | NOT_CONFIGURED (+ resendId | emailError)
 7. 201 { ok: true, id, emailed }
```

Steps 4–6 never change the status code. A failed email is `201 { emailed: false }`; a failed insert
is `500`. That asymmetry **is** P1 and P7 (SSD §5.4).

Ordering note vs. the SSD: because of V1 the screenshot upload is step 4, *after* the insert. That is
strictly safer than the SSD ordering, not weaker — the row cannot be lost to a Storage failure.

---

## 7. Client behaviour

**Launcher** — fixed, `z-50`, `aria-label="Reportar un problema"`, carries
`data-bug-report-widget` (the P4 exclusion marker), positioned per V5.
On click: **start the capture first, then open the dialog** (P3 — the single highest-value detail;
capturing at submit time yields screenshots of the modal).

**Capture** (`captureScreenshot(): Promise<string | null>`) — resolves, never rejects. JPEG q0.8,
white background, clipped to the **viewport** (not the full scrollable document), width capped at
1600 px, 5-second timeout, anything `[data-bug-report-widget]` excluded, oversize (> 3 000 000 base64
chars) → `null`. Every failure path returns `null` and `console.warn`s.
Library: **`@zumer/snapdom`** (latest 2.24.1 as of today). Not `html2canvas` (unmaintained since 2022).
Not `getDisplayMedia` (a browser permission prompt on every capture is unacceptable for a caporal in
the field). ⚠️ At implementation time, verify snapdom's **current** option names for element exclusion
and output format against its live docs — the 1.x → 2.x API moved — rather than writing them from
memory (THE RULES #11).

**Modal** — native `<dialog>` + `showModal()`. Non-negotiable per §5.3: focus trap, Escape-to-close,
top-layer stacking and `aria-modal` for free. State machine:

```
choose ──► dato_incorrecto ──► (submit) ──► done ──► auto-close
       └─► falta_algo      ──┘                └─ (error) ─► stays, form intact, retryable
```

Rules: back-navigation to `choose`; submit disabled unless every required field is non-empty after
`trim()`; submit disabled in flight (double-submit guard); full state reset on close; screenshot
status always visible as *capturando / incluida / no disponible*.

**Offline (D4)** — when `useSyncStatus().isOnline` is `false`, the submit button is disabled and the
dialog shows the offline notice. Nothing typed is discarded; the dialog stays open and the button
re-enables when the connection returns.

---

## 8. Spanish copy

SSD §10 strings, verbatim (already validated with real non-technical users), centralized in
`src/lib/feedback/copy.ts`:

| Element | String |
|---|---|
| Launcher | `Reportar` |
| Type A | `Aquí hay un dato incorrecto` |
| A field 1 | `¿Dónde? Fila y columna:` |
| A field 2 | `La app dice:` |
| A field 3 | `La app debería decir:` |
| Type B | `Aquí hace falta algo` |
| B field | `¿Qué es lo que hace falta?` |
| Submit | `ENVIAR` |
| Success | `✓ Reporte enviado. ¡Gracias!` |

Type A has exactly three fields on purpose: *where*, *observed*, *expected* — the three facts a
developer needs and a user rarely volunteers. Collapsing them into one box measurably degrades
report quality. **Do not merge them.**

The SSD does not cover four states this port introduces. **Proposed** wording — needs your OK before
it ships, I am not signing off on your users' language for you:

| State | Proposed string |
|---|---|
| Capture in progress | `Capturando la pantalla…` |
| Capture succeeded | `✓ Se incluye una foto de la pantalla` |
| Capture failed | `Sin foto de la pantalla — el reporte se envía igual` |
| Offline (D4) | `Sin conexión. Escribe tu reporte y envíalo cuando tengas señal.` |
| Storage 500 | `No se pudo guardar. Intenta de nuevo.` |
| Back | `← Regresar` |

---

## 9. Authorization

`src/lib/auth/guards.ts` gains one constant:

```ts
/**
 * Who may file a bug report: EVERY authenticated role, including the read-only
 * ones. The mechanism exists precisely to serve the non-admin users who notice a
 * wrong number and today report it by WhatsApp. Omitting a role here 403s exactly
 * the person the mechanism is for — SSD §7 calls this the most common porting mistake.
 */
export const BUG_REPORT_ROLES: UserRole[] = [
  "MASTER", "ADMIN", "MANAGER", "FIELD", "CEO", "CFO", "CONSULTANT",
];
```

`/admin/reportes` and its data access use `SETTINGS_ROLES` (MASTER, ADMIN) — the existing constant,
not a new one.

**Verification gate:** submit one report of each type from a **non-MASTER account** (FIELD and
CONSULTANT) before this is called done.

---

## 10. Privacy — read this before wiring the email

⚠️ **A viewport screenshot of this app contains payroll data.** Worker full names, daily wages,
séptimo, descuentos, net pay, and on some screens bank account numbers. That is a materially
different exposure from the SSD's reference app, and three consequences follow:

1. **The bucket is private.** No public URL, ever. Reads only via server-minted signed URLs with a
   short TTL (1 h), only on `/admin/reportes`, only for `SETTINGS_ROLES`.
2. **The email attachment sends that data to Resend and into the recipients' mailboxes**, where it is
   retained by Resend's logs and by Gmail/whatever the recipients use. Recipients must therefore be
   internal mailboxes that are already cleared for payroll — not a shared or vendor address.
3. **Retention.** Nothing purges these. I recommend a documented retention window (e.g. 180 days) and
   a script to enforce it, but I have not planned one in — say the word and I will.

**RESOLVED 2026-08-17 (D5): link, not attachment.** The email carries a deep link to
`/admin/reportes?id=…` and no image. Cost: the recipient must log in to see the evidence. Benefit:
zero payroll imagery in any mailbox or provider log. See V7 for why the link is deliberately *not*
a signed URL.

Everything else in SSD §7 is unchanged: identity server-derived (P5), HTML-escape every user value
before interpolating it into the email body, length caps on every stored string, screenshot cap
doubling as the request-size guard (3 M base64 chars ≈ 2.2 MB, sized to **Vercel's 4.5 MB request
limit**, not Resend's 40 MB attachment limit — SSD L4).

---

## 11. Testing

This repo has **no test runner** — no vitest, no jest, no `node:test`, nothing in `package.json`.
SSD §12 requires unit tests on the validation module, and they are genuinely the right tests here
(pure function, boundary rules, no I/O).

**Done (D6).** `vitest` added as a devDependency with `npm test` / `npm run test:watch`, and
[bug-report.test.ts](../src/lib/validators/bug-report.test.ts) covers §12: **29 tests, all green.**
Each required field rejected when empty/whitespace-only; over-length rejected at the boundary and
accepted *at* it; length measured after trimming; both kinds accepted with their correct field sets
and the other shape's fields stripped rather than smuggled through; malformed `meta` — wrong types,
missing, and not even an object — **normalized rather than rejected**; oversized screenshot rejected;
and the widget's button rule proven to use the same emptiness test as the schema, so the button never
promises a submission the server will refuse.

This is the repo's first test infrastructure. It runs on `src/**/*.test.ts` and is excluded from the
Next bundle by not being imported from any route.

---

## 12. Status and the three steps left

**Written and verified (2026-08-17):** every file in §5. `npx tsc --noEmit` clean,
`npx next lint --dir src` clean with zero suppressions, `npm test` 29/29, `npm run build` compiles
with `/admin/reportes` and `/api/feedback` both present. The hand-written migration was diffed
against `prisma migrate diff --from-empty --to-schema-datamodel` and is **byte-identical** to what
Prisma generates, plus the CHECK — so it cannot cause schema drift.

**Not run, because each mutates live state and that is your call:**

| Step | Command | Why it is yours |
|---|---|---|
| 1. Apply the migration | `npx prisma migrate deploy` | Writes to the production Supabase database. |
| 2. Create the bucket | `npx dotenv -e .env.local -- npx tsx scripts/create-bug-report-bucket.ts` | Creates real storage. Idempotent; refuses to pass if the bucket is public. |
| 3. Configure mail (D1 phase 2) | set the three §14 variables | Needs your Resend account, a DNS-verified sending domain (DKIM/SPF/MX, ideally `_dmarc`) and the recipient list. |

Steps 1–2 make the mechanism fully functional. Step 3 is deliberately last: until then every report
persists with `email_status = NOT_CONFIGURED` and is readable at `/admin/reportes`. That is SSD
lesson L5 — deploy storage first, wire mail second, and let `NOT_CONFIGURED` make the gap visible
instead of silently losing reports.

`git` stays yours — nothing here ran `add`, `commit`, `push` or `tag`.

---

## 13. Acceptance tests (SSD §12, adapted)

**Automated:** §11.

**Manual, before declaring done:**

1. One report of **each type** from a **non-admin account** (FIELD, then CONSULTANT). Catches the §7
   authorization mistake.
2. Both recipients receive the mail, with the screenshot attached and the copy correct. *(phase 8)*
3. `SELECT kind, email_status FROM bug_reports;` shows `SENT`. *(phase 8)*
4. Force a capture failure (block snapdom) → the report still submits; the row shows
   `screenshot_error`; the email states the screenshot is unavailable.
5. Unset `RESEND_API_KEY` → the report still returns success; the row shows `NOT_CONFIGURED`.
6. The screenshot **does not contain the widget** (P4).
7. **Repo-specific:** report from `/planilla` mid-scroll on a phone — the launcher must not sit under
   `MobileNav`, and the capture must show the visible rows, not the top of the document (V5, §5.2
   viewport clipping).
8. **Repo-specific:** with the device in airplane mode, the dialog shows the offline notice, the
   submit button is disabled, and the typed text survives until the connection returns (D4).

---

## 14. Configuration (`.env.example` additions)

```bash
# Bug reports ("Reportar") — notification email. All three optional:
# with none of them set, reports still persist with email_status = NOT_CONFIGURED.
RESEND_API_KEY=re_...
BUG_REPORT_FROM="Finca Danilandia <reportes@tu-dominio-verificado.com>"
BUG_REPORT_TO=persona1@dominio.com,persona2@dominio.com
```

Absent configuration is a **valid state**, not an error. The long pole in phase 8 is DNS domain
verification, not code: with an unverified domain, Resend can only send to the account owner's own
address.

---

## 15. Open items

Resolved: the attachment-vs-link decision (D5, link), and the test runner (D6, vitest in).

Still open:

1. **§8 Spanish strings** — the six strings the SSD does not cover are live as first-pass wording,
   flagged for improvement. They are all in one file, [copy.ts](../src/lib/feedback/copy.ts); the
   ones marked `VALIDATED` there came from the source spec and should not be reworded casually.
2. **§10.3 retention** — nothing purges screenshots today. A window (e.g. 180 days) plus a script to
   enforce it is not built; say the word.
3. **§14 mail inputs** — Resend account, the domain to verify, and the recipient list.
4. **`NEXT_PUBLIC_APP_URL` in production** — it is the base of the email's deep link. If it still
   says `localhost:3000` in the deployed environment, every notification links nowhere.
