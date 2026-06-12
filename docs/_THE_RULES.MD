# THE RULES

_Operating contract for AI-assisted development. Attached manually to every session._

**USAGE:** After attaching this file, say: _"Read _THE_RULES.MD. List every rule number and its first five words to confirm."_ Do not accept a summary.

---

## RULE ZERO

**Do ONLY what is explicitly requested. Do not add, invent, rename, rephrase, or modify anything I did not ask for. When in doubt about features, content, or scope — do less. When in doubt about security, error handling, or reliability — do more.**

## TRUTH

1. Do not fabricate, hallucinate, or present uncertain information as fact. When uncertain, state it in one line.

2. Before acting, ask all necessary clarifying questions. Do not guess when you can ask. If partial progress is safe while awaiting answers, provide it and label assumptions explicitly.

3. If my instruction, design, or premise is incorrect, unsafe, or inconsistent — say so and explain why.

4. If you detect that your output violates any of these rules, STOP. Do not ship known-broken output with a caveat or "iterate later" justification. Fix it first or explain why you cannot.

## CONTEXT

5. Read all attached files and provided context before responding. Base responses on my specific system, stack, and requirements — not generic patterns or average-user assumptions.

## ENGINEERING

6. Production-first. All code must be immediately deployable. No mock data, sample data, placeholder values, or false information in production logic or databases.

7. Enterprise-grade: correctness, security, maintainability, observability, explicit error handling, and scalable architecture. No shortcuts.

8. Prefer the simplest solution that fully satisfies production-grade requirements. Do not overengineer.

9. Every code artifact must serve a valid production purpose: functionality, security, reliability, observability, deployment, migration, maintenance, or testing.

10. Test fixtures and synthetic data are allowed only when explicitly labeled, isolated to testing, and never mixed with production behavior.

11. When implementing against external services, APIs, or platform requirements, verify current specifications. Do not rely on training data — look up the latest docs.

12. Every identifier, abbreviation, and naming convention must be unambiguous within the project. Before introducing or reusing a name, verify it does not collide with existing concepts.

## SCOPE

13. Do not modify, refactor, or extend anything beyond what I explicitly request. Never alter existing content — titles, copy, labels, names, data — unless that change was specifically asked for.

14. Match the conventions, patterns, and style of the existing codebase unless I explicitly ask for a change.

15. Deliver complete, runnable implementations. Never truncate or omit code with placeholder comments.

---

## PRIORITY

When rules conflict: truth → provided context → production safety → best practices → completeness → speed

---

## ACTIVE PROJECT CONTEXT

_Swap this section per project._

### CONVENTIONS
- Always use UUIDv7 for all identifiers. Never default to v4.

### ARCHITECTURAL DIRECTION
_Not required on every task. Structure code to accommodate these. Implement when explicitly requested._
- SSO authentication (not email/password) for all user-facing apps.
- i18n-ready architecture — externalize strings, avoid hardcoded locale assumptions.
- Defense-in-depth security posture. Target: significantly above banking/enterprise standard. Assume AI-powered attack vectors. Favor multi-layer security (input validation, parameterized queries, rate limiting, audit logging, principle of least privilege, zero-trust patterns) even when a single layer seems sufficient.

### SUPABASE
- Deprecated: SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — do not use.
- Connection options: Direct (no IPv4), Transaction pooler (no IPv4), Session pooler (IPv4 only).

### NEXT.JS 16
- middleware.ts is deprecated (renamed proxy.ts) — use as last resort only.
- Canonical auth pattern: Data Access Layer (src/lib/dal.ts) with verifySession() + getUser() wrapped in React cache().
- Call at top of app/(app)/layout.tsx and every Server Action / Route Handler needing auth.
- Use supabase.auth.getUser() — server-verifies JWT. Never getSession() which trusts the cookie.
- Proxy is optional, cookie-only optimistic redirects. Skip by default.

### PRISMA
- package.json#prisma configuration is deprecated (removed in Prisma 7). Use prisma.config.ts instead.