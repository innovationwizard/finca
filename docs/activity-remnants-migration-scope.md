# Migration scope — retire 5 zero-price remnant activities

_Status: PARTIALLY DONE (2026-06-16)._
- ✅ **Plan-only / 0-ref hard-deleted** (Jorge: "if plan only, hard delete; plan
  reviewed weekly, voids handled by standard procedure"):
  `oooooo` (9 plan entries), `desombre` (6 plan entries), `Monitoreo de Plagas y
  Enfermedades` (0 refs). Via scripts/delete-plan-only-activities.ts. Catalog 38→35.
- ✅ **EN / EE / RE hard-deleted** with their 130 work records (114/7/9). Verified
  Q0 at closure (snapshots unitPrice/totalEarned=0, none edited after close, single
  2026-03-01→Q0 vigencia). Jorge: invariant is monetary preservation; these never
  carried value → pay-neutral now and historically. Via
  scripts/delete-zero-value-activities.ts (asserts every record is Q0 before any
  delete). Catalog 35→32; no defaultPrice=0 activities remain.

**ALL 6 zero-price remnants resolved. Migration complete.**

## 1. Goal
Remove 5 old-nomenclature/duplicate activities that show Q0.00 and can't be
hard-deleted because historical references still point at them. For each: either
**repoint** its references to the correct current activity, or **delete** the
references (if they're empty/junk), then **hard-delete** the remnant.

(A 6th zero-price activity, **"Monitoreo de Plagas y Enfermedades"**, has 0
references and is already inactive — it can be hard-deleted now, no migration. Its
canonical abbr is MIP per docs/abbr.txt; it looks like a duplicate of the intended
MIP activity.)

## 2. The remnants + evidence

| Remnant | Unit | Refs | Detail (all read-only) |
|---|---|---|---|
| **EN** | día | **114 activity_records** | ALL in CLOSED periods (#7+#8), **unitPrice 0**, 2026-04-14…2026-06-13, lotes —/VG1/CRUZ2/CRUZ 1/CAÑADA |
| **EE** | día | **7 activity_records** | all CLOSED, unitPrice 0, 2026-04-13…2026-05-09, lote — |
| **RE** | día | **9 activity_records** | all CLOSED, unitPrice 0, 2026-04-13…2026-04-18, lotes —/CANOA 1 |
| **oooooo** | mz | **9 plan_entries** | year 2627; lotes VG1,VG2,CRUZ2,MIRASOL,CAÑADA,GALERA,SAN EMILIANO CRUZ,ARENERA; plannedJornales 6–10 (REAL planned work) |
| **desombre** | día | **6 plan_entries** | year 2627; 6 lotes; **plannedJornales all 0** (empty placeholders) |

## 3. Why they can't be deleted (root cause)
`ActivityRecord.activity` and `PlanEntry.activity` FKs are **restrict** — the DB
refuses to delete a referenced activity; the app's DELETE guard surfaces this as
"desactívela en su lugar". So deletion requires removing the references first.

## 4. BLOCKING decisions — target per remnant (you/Manuel must specify)
Neither docs/abbr.txt nor the notebook dictionary defines EN/EE/RE, so I cannot
infer their meaning. For EACH remnant, choose one:
- **(map)** repoint references to an existing activity — name it; or
- **(delete refs)** delete the references (only sensible for empty/junk); or
- **(deactivate)** leave history as-is, just hide it (Editar → Activo off) — no delete.

Candidates I can see (low confidence — confirm): `desombre` → "Manejo de Sombra"
or "Repaso Sombra" (and its 6 plan entries are empty, so deleting them is viable);
`oooooo` is a junk name but its 9 plan entries hold real jornales, so they need a
real target or an explicit delete. EN/EE/RE: unknown — need your call.

## 5. Migration mechanics (once targets are set)
- **Records:** `activity_records.activityId = <target>` for each remnant. Pay is
  **unaffected** — `unitPrice`/`totalEarned` are snapshots and stay as-is (here
  they're all Q0 anyway). Audited.
- **Plan entries:** repoint `plan_entries.activityId = <target>`, OR delete.
  ⚠ `PlanEntry` is unique on `(agriculturalYear, loteId, activityId, month, week)`
  — repointing can COLLIDE with an existing target entry; must **merge**
  (sum plannedJornales) or skip per collision. Handle explicitly.
- **Then** hard-delete each now-unreferenced remnant (price vigencias cascade).
- Also hard-delete the **Monitoreo (Q0, 0-ref)** duplicate.

## 6. Flags (Dirty George)
- **Closed/paid periods:** EN/EE/RE references are 100% in closed periods. Repointing
  is pay-neutral (snapshots), but it rewrites closed-period attribution — acceptable
  for nomenclature cleanup, but call it out and audit it. NOT reopening anything.
- **All EN/EE/RE records are unitPrice 0.** If any represented real *paid* work
  mislabeled, repointing does NOT add pay (snapshots). Re-pricing closed/paid work
  is a separate decision (like the #7 retroactive MG item) — **out of scope** here
  unless you say otherwise.
- **Unit mismatch:** if a día remnant maps to a qq/mz target, the unit label on
  history changes; pay unchanged. Confirm it's acceptable per mapping.

## 7. Execution protocol (after §4 answered)
Read-only analysis script → present per-remnant counts + target → **confirm the 5
mappings row-by-row** → dry-run (transaction+rollback) → `--commit`. Same discipline
as the bank-account / discount migrations.
