-- Audit note for ANTICIPOS, matching the existing bonification/deductions notes
-- (CFO requirement). Required (enforced in the API/UI) when advances is
-- non-zero; nullable at the DB level so existing rows and zero-amount rows are
-- unaffected.
--
-- Context: until now there was no write path for payroll_entries.advances at
-- all, so anticipos were being recorded as DESCUENTOS with the note "Anticipo".
-- Net pay was unaffected (calcNetPay subtracts both terms identically), but the
-- split was misreported. This column completes the Anticipos input.
ALTER TABLE "payroll_entries" ADD COLUMN "advances_note" TEXT;
