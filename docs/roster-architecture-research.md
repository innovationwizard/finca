# Enterprise-Grade Worker Roster — Architecture Research & Findings

**Status:** Research findings, not an implementation plan. Nothing in this document has been applied to the database or the code.
**Date:** 2026-06-11
**Scope:** How best-in-class enterprise systems design a person/worker roster as *master data*, across three layers — database schema, backend architecture, UI/UX — mapped to Finca Danilandia's actual system and the failures we have lived.
**Method:** Multi-source web research (28 sources fetched → 122 claims → 25 adversarially verified, 25 confirmed / 0 refuted). Source URLs and quality ratings are listed at the end.

---

## 0. How to read this document (epistemic status)

Per `docs/_THE_RULES.MD` (Rule 1: don't lie, don't assume; Rule 8: no false information), source strength is **uneven across the three layers**, and this document says so explicitly rather than presenting everything as equally settled:

- **DATABASE layer + the entity-resolution core of BACKEND** — anchored in strong primary sources (Fowler's *Analysis Patterns* and *Bitemporal History*, W3C i18n, the Splink and dedupe official repos/docs, and the peer-reviewed Binette & Steorts survey). Verification votes were unanimous (3-0).
- **Merge / un-merge mechanism** — rests largely on one granted US patent plus vendor docs; verified at 2-1. The *principle* (un-merge must preserve intervening changes, not be a naive revert) holds; the *specific technique* is one valid design among several.
- **UI/UX layer (low-literacy, Spanish-only, photo-based, "who's missing" reconciliation)** — **weakest sourced.** These did **not** surface as independently cited, verified claims. They are defensible design extrapolations from the stewardship/entity-resolution literature and must be **validated with the actual rural users**, not treated as citable best practice.
- **Guatemalan DPI/CUI check-digit algorithm** — **open question.** In scope, but no verified source for the exact modulus/check-digit rule surfaced. Candidate source repos are listed under Open Questions; the algorithm is **not** stated here because it is not yet verified, and stating it would violate Rule 1.

Where the field genuinely disagrees, that is flagged inline (see §4, deterministic vs. probabilistic).

---

## 1. Finca's current state (the baseline this research is measured against)

From the live schema (`prisma/schema.prisma`) and code, the worker roster today is:

- **`workers` table**: `id` (uuid surrogate — good), single free-text **`full_name`** (TEXT), `dpi` (unique, nullable), `nit`, `bank_account`, `bank_name`, `phone`, `photo_url`, `is_minor`, `is_active`, `start_date`, `end_date`. `ActivityRecord` and `PayrollEntry` hold FKs to `worker.id`.
- **`notebook_dictionary`**: `(category, handwritten, canonical, referenceId)` — a learned handwritten→canonical mapping.
- **`audit_logs`**: exists; merge operations log here.
- **Merge** (`/api/admin/workers/merge`): reassigns activity/payroll records, soft-deactivates the duplicate (`isActive=false`), sums payroll clashes.
- **Duplicate detection** (`src/lib/workers/duplicate-clusters.ts`): Levenshtein + union-find clustering at similarity 0.85.

**Observed failures this research addresses:**
- (a) **Duplicate/variant identity explosion** — 216 worker rows, the majority OCR-garbled surname variants of a smaller real headcount.
- (b) **A real long-tenured worker silently dropped** from weekly uploads.
- (c) **No name-level provenance/audit** — a single `full_name` string has no record of where it came from, what it used to be, or which spellings are aliases of the same person.
- (d) **Lifecycle not modeled** — 216 rows all `is_active=true`; no real active/terminated/seasonal state.

Every finding below is mapped to these.

---

## 2. DATABASE / DATA MODELING

### 2.1 Model the worker as a "Party", keyed on an immutable identity — never on the name
**Confidence: HIGH (3-0).**

Martin Fowler's *Analysis Patterns* establishes the **Party** archetype: "the supertype of person and organization." Identity-adjacent data (phones, addresses, email) attaches to the unified Party rather than being duplicated per subtype. The archetype is independently adopted by Arlow & Neustadt (*Enterprise Patterns*), Silverston, Hay, and commercial MDM (Informatica). This is the canonical "golden record" master entity.

The structural rule that follows: **separate a stable internal IDENTITY (immutable surrogate key) from MUTABLE NAMES.** Enterprise systems never key on names because names are not stable identifiers.

> Caveat: no single source states "identity table + alias table" verbatim — it is the standard synthesis of the Party archetype + entity-resolution literature (Splink, dedupe, US Patent 12,417,236), not one quotable sentence.

**Finca implication:** The `id` surrogate key already exists and is correct. The defect is that `full_name` *is* the identity in practice — there is nothing else to match on, so every spelling becomes a new person. The fix direction: a canonical identity that owns the worker, with names as attached, replaceable, versioned data — not the primary handle.

### 2.2 Names: structured components **plus** a full string — never a single free-text field
**Confidence: HIGH (3-0).**

W3C *Personal names around the world* (the authoritative i18n source): "Spanish-speaking people will commonly have two family names… Brazilians… may even have three or four family names." A single-surname field overflows and loses data — **exactly the failure behind the "extra surname" matcher bug** (commit `ec24018`) and the variant explosion.

W3C's general advice is to keep the full name as provided and add structured fields *in addition* only when a specific purpose needs them.

> Nuance (stated, not hidden): W3C's "store full name as provided" guidance targets **consumer forms**, not payroll systems that cut real checks. For Finca — which needs deterministic matching and stable identity — the correct reading is **structured components (given names, apellido paterno, apellido materno) PLUS the full string**, under a separate immutable identity. Literal full-name-only storage is *not* the right reading for this project.

**Finca implication:** Capturing apellido paterno / apellido materno as distinct fields is what lets the matcher stop treating a missing or garbled second surname as a different person.

### 2.3 Alias / variant rows mapped to one canonical identity
**Confidence: HIGH (3-0, inferred from Party + entity-resolution sources).**

Store name / OCR / spelling variants as **alias rows pointing at the one canonical identity**, so variants never become new people. Splink and dedupe both exist specifically "to deduplicate and link records from datasets that lack unique identifiers" and figure out "which ones were made by the same person, even if the names were entered slightly differently." This is the structural fix for both the duplicate-explosion bug **and** the silently-dropped-worker bug.

**Finca implication:** `notebook_dictionary` (handwritten→canonical) is a *partial, informal* version of this idea already. A first-class alias table attached to the canonical identity generalizes it: every observed spelling (`"Elmer Alexander Hernandez Raliois"`, `"…Falloni"`, `"…Flaillos"`) becomes an alias of one person, with provenance, instead of five worker rows.

### 2.4 Bitemporal history for name and employment
**Confidence: HIGH (3-0).**

Fowler's *Bitemporal History*: "There is a difference between the actual history, and our record of the history." Separate **valid/effective time** (when something was true in the world) from **record/transaction time** (when the system learned it). The trigger is retroactive correction. Mechanism: "By layering an append-only record history over the actual history, we allow the actual history to be modified while creating a reliable history of its modifications." Maps to Snodgrass / SQL:2011 temporal tables and Kimball SCD.

**Finca implication:** Payroll must reflect **what was true at the time of work** even after a later name correction or a merge. Bitemporal name-history and employment-history make a payroll run reproducible and auditable as-of its work dates — and give the name-level provenance currently missing (failure c).

### 2.5 Lifecycle status, soft-delete, audit/provenance
**Confidence: HIGH (supported by the temporal/MDM sources).**

Model an explicit **lifecycle status** (active / inactive / terminated / seasonal) rather than a single boolean, with audit trails and data lineage for every master-data mutation. An append-only record-history layer over the editable data preserves a trustworthy audit trail.

**Finca implication:** `is_active` (all 216 = true) is not a real lifecycle. Seasonal coffee labor especially needs a status distinct from "deleted." `audit_logs` exists but does not yet capture name/identity changes with before/after + source.

### DATABASE — recommendation
A canonical **worker identity** (immutable surrogate, already have `id`) that owns: **structured name components + full string**, an **alias/variant table** (generalizing `notebook_dictionary`), **typed identifiers** (DPI/CUI, NIT — see Open Questions for validation), an explicit **lifecycle status**, and **bitemporal name + employment history** with append-only audit/provenance. This is the structural cure for failures (a)–(d).

---

## 3. BACKEND / ARCHITECTURE

### 3.1 Entity resolution as a four-stage pipeline
**Confidence: HIGH (3-0).**

Binette & Steorts, *(Almost) All of Entity Resolution* (Science Advances, 2022, peer-reviewed): the canonical pipeline is **attribute alignment → blocking → record linkage → canonicalization/merging**. **Blocking** is the scalability stage: "records that do not appear in the same block are automatically determined to be non-matches." Use deterministic keys for error-free fields; LSH/probabilistic for noisy fields.

> Caveat: the field offers alternative decompositions (Christophides/Papadakis). This is *a* canonical architecture, not the only one.

### 3.2 Use the Fellegi-Sunter **probabilistic** matcher (Splink / dedupe) — not exact-match rules
**Confidence: HIGH on the core (3-0); the deterministic-inferiority empirical claim was 2-1.**

Splink (UK Ministry of Justice, open-source) implements **Fellegi-Sunter** probabilistic record linkage — "the most common probabilistic record linkage model" — with term-frequency adjustments and fuzzy comparators (Jaro-Winkler, Levenshtein, Damerau-Levenshtein) for typos/OCR. Splink's own docs: deterministic linkage is "rules-based… prone to low recall (false negatives)"; probabilistic is "evidence-based… relies on the balance of evidence." dedupe uses ML active learning over human-labeled examples to resolve records "made by the same person, even if the names were entered slightly differently."

**Finca implication:** `duplicate-clusters.ts` is a hand-rolled deterministic Levenshtein/union-find clusterer at a single 0.85 threshold. It is exactly the low-recall regime the literature warns about — it both over-merges (common surnames) and misses (a garbled veteran). A Fellegi-Sunter-style scorer with per-field weights and term-frequency adjustment is the evidence-based upgrade.

### 3.3 Match-on-write — prevent variant identities at creation time
**Confidence: MEDIUM (synthesis; create-time-prevention specifics partly inferential).**

New candidate identities should be **scored against existing ones before insert**; likely duplicates are surfaced for human review rather than silently inserted. This is the direct architectural antidote to the duplicate-explosion bug — which in our system came from the (now-deleted) OCR import defaulting every extracted name to "create new."

**Finca implication:** This is the principle we just enforced negatively (by deleting the auto-create paths). The positive form: any worker-create path (including the manual `/api/workers` POST) scores the candidate and warns on probable matches before committing.

### 3.4 Merge and un-merge as first-class, reversible operations
**Confidence: HIGH on merge semantics (3-0); 2-1 on the specific un-merge mechanism.**

US Patent 12,417,236 (Salesforce): merge consolidates "the records associated with each of the unified profiles… under a single unified profile" (identity-level, not a name edit). Un-merge "may be performed by taking the records from the merged unified profile and running them back through the automatic match and reconcile process," disregarding the manual-merge association, to "preserve any changes made… after the manual merge" — **not a naive state revert.** Informatica ("values are never actually lost… available should you choose to unmerge") and Reltio (unique URIs per entity make unmerge possible — impossible if match-before-create is skipped) corroborate.

> Caveat: re-cluster-by-re-run is one valid design; audit-log point-restore of the affected cluster is a competing valid design (hence 2-1). The durable principle: un-merge must be reversible **without losing post-merge changes.**

**Finca implication:** The current merge soft-deactivates + reassigns + sums payroll, and logs to `audit_logs`. It has no un-merge. Given that merges of real people who are owed real money will sometimes be wrong, reversibility is a correctness requirement, not a nicety. Reltio's point also retroactively justifies match-on-write: assign stable identity at creation or you cannot cleanly un-merge later.

### 3.5 Stewardship workflow, idempotent imports, single write path
**Confidence: MEDIUM-HIGH.**

New identities flow through a **data-steward approval queue**; imports are **idempotent and never silently drop or mutate** records; all writes go through one validated API boundary with structured logging for master-data mutations.

**Finca implication:** Validation at the boundary (Zod) and `audit_logs` already exist. The missing pieces are the steward approval queue for new identities and an import contract that surfaces — never silently drops — an unmatched or missing person (the dropped-veteran failure).

### BACKEND — recommendation
A server-side entity-resolution service on the four-stage pipeline with a **Fellegi-Sunter probabilistic matcher** (Splink-style weights + fuzzy comparators), **match-on-write** duplicate prevention on every create path, **reversible merge/un-merge** with full audit, and a **steward approval queue** fed by idempotent imports that surface anomalies instead of dropping rows.

---

## 4. The one genuine disagreement in the field

**Deterministic vs. probabilistic matching.** When **high-quality unique identifiers are present**, deterministic (exact-key) matching can equal or beat probabilistic (NBK253312). That is the real boundary condition, and it is why claim 18 verified 2-1 rather than unanimously.

It does **not** apply to Finca's entry regime: OCR-garbled two-surname names, no reliable identifier at the point of notebook entry. That is precisely the poor-identifier case where probabilistic linkage is empirically superior. **Recommendation: probabilistic for matching at entry; deterministic only for blocking, or once a validated DPI/CUI exists for a worker.**

---

## 5. UI / UX  ⚠️ weakest-sourced layer — validate with real users

These did **not** surface as independently cited, verified claims. They are design extrapolations, presented as hypotheses to test with Finca's actual users, not as established best practice (Rule 1).

- **Stewardship UX (better sourced, from MDM/patent literature):** confidence-scored, side-by-side duplicate-merge review; "potential duplicate" warning at create time; golden-record editing. Finca already has a version of this (`/admin/trabajadores-duplicados` + the review artifact); the upgrade is confidence scores and surfaced provenance per field.
- **Low-literacy / Spanish-only / rural (UNVERIFIED — extrapolation):** photo-based identification, large touch targets, minimal text, strong error prevention. Finca already uses worker photos and large targets; whether these specific patterns measurably help *these* users needs field validation.
- **Roster management (standard, low-risk):** search/filter by lifecycle status; identity detail view showing name history + employment history; audit/provenance display.
- **"Who's missing?" reconciliation (UNVERIFIED but directly targets failure b):** a payroll-run view that flags known/expected workers absent from an upload, so a veteran can never be silently dropped. This is the single most important UX safeguard for the harm we actually suffered — and it lacks a citation, so treat it as a requirement to design and test, not a cited pattern.

### UI/UX — recommendation
Build the stewardship console (confidence-scored merge review + golden-record + provenance) on the better-sourced ground first; treat the low-literacy and reconciliation patterns as **must-validate hypotheses**, with the "who's missing?" payroll reconciliation prioritized because it maps directly to the dropped-veteran failure.

---

## 6. Open questions (must be answered before any implementation)

Carried verbatim from the research, grounded to Finca:

1. **Guatemalan DPI/CUI (13-digit) check-digit / modulus algorithm and NIT validation rule** — needed to validate and uniqueness-enforce identifiers at the API boundary. No verified source surfaced. Candidate (unverified) source repos to evaluate: `github.com/minfingt/validators` (CUI), `github.com/rhyek/validar-nit-gt` (NIT), `github.com/alextello/validador-dpi-nit`, and the SAT portal `portal.sat.gob.gt/portal/consulta-cui-nit/`. **Do not implement validation from an unverified algorithm.**
2. **Concrete offline-first schema shape** — Party/identity + alias table + bitemporal history must reconcile with **offline edits and sync conflict resolution**: two devices could each create a variant identity offline. How does match-on-write work at the edge vs. server?
3. **Validated low-literacy / Spanish-only data-entry and roster patterns** — which are backed by usability/field research vs. inferred?
4. **Where entity resolution runs** — match-on-write blocking inside the PWA/edge (latency, offline) vs. server-side batch reconciliation after sync — and how the steward approval queue is surfaced to notebook-entry people vs. an admin role.

---

## 7. Sources (with quality ratings from the research)

**Primary:**
- Fowler, *Analysis Patterns* ch.2 (Party) — https://martinfowler.com/apsupp/apchap2.pdf
- Fowler, Accountability pattern — https://martinfowler.com/apsupp/accountability.pdf
- Fowler, *Bitemporal History* — https://martinfowler.com/articles/bitemporal-history.html
- W3C, *Personal names around the world* — https://www.w3.org/International/questions/qa-personal-names
- Splink (UK MoJ) repo — https://github.com/moj-analytical-services/splink
- Splink, probabilistic vs deterministic — https://moj-analytical-services.github.io/splink/topic_guides/theory/probabilistic_vs_deterministic.html
- dedupe — https://github.com/dedupeio/dedupe
- Binette & Steorts, *(Almost) All of Entity Resolution* — https://arxiv.org/pdf/2008.04443
- US Patent 12,417,236 (merge/un-merge) — https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12417236
- MS SQL temporal tables — https://learn.microsoft.com/en-us/sql/relational-databases/tables/temporal-tables
- Analysis Patterns ch.2 (O'Reilly) — https://www.oreilly.com/library/view/analysis-patterns-reusable/9780134271453/ch02.html
- Informatica Match & Merge use-cases — https://www.informatica.com/content/dam/informatica-cxp/techtuesdays-slides-pdf/Match%20and%20Merge%20Use-cases.pdf
- CUI validator (unverified algorithm) — https://github.com/minfingt/validators/blob/master/src/Minfin.Validators/CuiValidator.cs
- DPI/NIT validator (unverified) — https://github.com/alextello/validador-dpi-nit
- SAT CUI/NIT consultation — https://portal.sat.gob.gt/portal/consulta-cui-nit/

**Secondary / blog (use with care):**
- Enterprise Patterns ch.4 — https://www.oreilly.com/library/view/enterprise-patterns-and/032111230X/ch04.html
- Universal person/org data model — https://tdan.com/a-universal-person-and-organization-data-model/5014
- MDM survivorship — https://profisee.com/blog/mdm-survivorship/
- "Falsehoods programmers believe about names" — https://www.kalzumeus.com/2010/06/17/falsehoods-programmers-believe-about-names/
- Slowly changing dimension — https://en.wikipedia.org/wiki/Slowly_changing_dimension
- Senzing, entity resolution — https://senzing.com/what-is-entity-resolution/
- NIT validator — https://github.com/rhyek/validar-nit-gt

---

*Produced under `docs/_THE_RULES.MD`. No mock data, no DB writes, no implementation performed. Uncertainty and weak sourcing are flagged explicitly rather than smoothed over.*
