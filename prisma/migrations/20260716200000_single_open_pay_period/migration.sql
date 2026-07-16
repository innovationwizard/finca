-- At any given point in time, only ONE pay period may be open — even when its
-- end date has passed (Jorge, 2026-07-16). An open period whose end has passed
-- is EXTENDED via "Editar fechas"; its successor is created only on close, so
-- the two never coexist. The API refuses the create, but an API check can race
-- two concurrent requests: this partial unique index is the definitive layer.
--
-- Unique on a constant expression, restricted to open rows => at most one row
-- may have is_closed = false. Closed rows are unconstrained.
--
-- NOTE: this FAILS to apply while more than one period is open. That state is a
-- bug (it makes "the current period" ambiguous — autorizacion/ajustes/dashboard/
-- resumen resolve to the newest open, captura to the oldest). Resolve it first
-- by removing the extra open period — verifying it holds no activity records and
-- no payroll entries, so nothing is lost — or by closing it.
CREATE UNIQUE INDEX "pay_periods_single_open"
  ON "pay_periods" ((is_closed))
  WHERE is_closed = false;
