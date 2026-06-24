-- Audit notes for manual payroll adjustments (CFO requirement).
-- A note is required (enforced in the API/UI) when the matching amount is
-- non-zero; nullable at the DB level so existing rows and zero-amount rows are
-- unaffected.
ALTER TABLE "payroll_entries" ADD COLUMN "bonification_note" TEXT;
ALTER TABLE "payroll_entries" ADD COLUMN "deductions_note" TEXT;
