-- =============================================================================
-- 09_add_worker_fks.sql — Batch 9.2: add the worker FKs deferred from 01.
-- Run on `public` AFTER the swap (07) AND after 06_apply_reassignment --commit,
-- so every activity_records / payroll_entries.worker_id points at a real
-- workers.id. These constraints HARD-VALIDATE the dropped-veteran guarantee:
-- if any record still references a non-existent worker, the ALTER fails loudly.
-- =============================================================================
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_entries"  ADD CONSTRAINT "payroll_entries_worker_id_fkey"  FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
