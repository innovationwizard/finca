-- =============================================================================
-- 07_swap.sql — Batch 5.6: atomic schema swap.
-- Moves the current public tables → `backup` and the populated `rebuild`
-- tables → `public`, in ONE transaction. Constraint/index names are
-- schema/table-scoped in Postgres, so moving schemas causes NO name
-- collisions. `_prisma_migrations` stays in public (history reconciled after).
--
-- PRECONDITIONS (Batch 5): 01 ran in the `rebuild` schema (tables WITHOUT the
-- two worker FKs); 02 ran with --commit (rebuild holds the remapped
-- non-employee data; idmap_* temp tables already dropped by 02).
-- AFTER this swap, in order: 03 (--commit, load SSOT employees into public),
-- Batch 9 (04 setup → 05 fill/ingest → 06 apply --commit), 09_add_worker_fks,
-- 2.6 verification, then the Prisma baseline (see bottom).
-- =============================================================================
BEGIN;
CREATE SCHEMA IF NOT EXISTS backup;

-- 1) current public app tables (the original 14) → backup
ALTER TABLE public.users                SET SCHEMA backup;
ALTER TABLE public.system_settings      SET SCHEMA backup;
ALTER TABLE public.notebook_dictionary  SET SCHEMA backup;
ALTER TABLE public.lotes                SET SCHEMA backup;
ALTER TABLE public.workers              SET SCHEMA backup;
ALTER TABLE public.activities           SET SCHEMA backup;
ALTER TABLE public.activity_prices      SET SCHEMA backup;
ALTER TABLE public.pay_periods          SET SCHEMA backup;
ALTER TABLE public.activity_records     SET SCHEMA backup;
ALTER TABLE public.payroll_entries      SET SCHEMA backup;
ALTER TABLE public.coffee_intakes       SET SCHEMA backup;
ALTER TABLE public.plan_entries         SET SCHEMA backup;
ALTER TABLE public.production_estimates SET SCHEMA backup;
ALTER TABLE public.audit_logs           SET SCHEMA backup;

-- 2) rebuilt tables (the 14 + 4 new) → public
ALTER TABLE rebuild.users                        SET SCHEMA public;
ALTER TABLE rebuild.system_settings              SET SCHEMA public;
ALTER TABLE rebuild.notebook_dictionary          SET SCHEMA public;
ALTER TABLE rebuild.lotes                        SET SCHEMA public;
ALTER TABLE rebuild.workers                      SET SCHEMA public;
ALTER TABLE rebuild.worker_documents             SET SCHEMA public;
ALTER TABLE rebuild.dpi_documents                SET SCHEMA public;
ALTER TABLE rebuild.birth_certificate_documents  SET SCHEMA public;
ALTER TABLE rebuild.activities                   SET SCHEMA public;
ALTER TABLE rebuild.activity_prices              SET SCHEMA public;
ALTER TABLE rebuild.pay_periods                  SET SCHEMA public;
ALTER TABLE rebuild.activity_records             SET SCHEMA public;
ALTER TABLE rebuild.payroll_entries              SET SCHEMA public;
ALTER TABLE rebuild.holidays                     SET SCHEMA public;
ALTER TABLE rebuild.coffee_intakes               SET SCHEMA public;
ALTER TABLE rebuild.plan_entries                 SET SCHEMA public;
ALTER TABLE rebuild.production_estimates         SET SCHEMA public;
ALTER TABLE rebuild.audit_logs                   SET SCHEMA public;

DROP SCHEMA rebuild CASCADE; -- now empty
COMMIT;

-- =============================================================================
-- PRISMA BASELINE (run AFTER the full rebuild completes; Rule 11 — confirm exact
-- commands against current Prisma docs at execution). public now matches
-- schema.prisma but the migration history describes the old (now-backup) schema.
-- Reconcile by re-baselining to a single migration that represents the new schema:
--
--   1. Verify DB ⇄ schema are in sync (should print NO diff):
--      npx dotenv -e .env.local -- npx prisma migrate diff \
--        --from-schema-datasource prisma/schema.prisma \
--        --to-schema-datamodel  prisma/schema.prisma --exit-code
--   2. Archive prisma/migrations/* (old lineage → backup), create one baseline
--      migration dir holding 01_create_new_schema.sql + 09_add_worker_fks.sql,
--      then mark it applied WITHOUT running:
--      npx dotenv -e .env.local -- npx prisma migrate resolve --applied <baseline>
--   3. `prisma migrate status` clean.
-- =============================================================================
