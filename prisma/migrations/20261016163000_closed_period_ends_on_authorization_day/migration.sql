-- A payment authorization closes the period on that calendar day. A future
-- planned end cannot stay inside a closed period: the hours and the rates of
-- those days do not exist yet.
--
-- closed_at is timestamp without time zone and stores the UTC clock reading
-- (Prisma DateTime). The Guatemala date is therefore the UTC instant converted
-- into America/Guatemala. `closed_at AT TIME ZONE 'America/Guatemala'` would
-- treat that UTC clock as if it were already local and land on the wrong day.

-- The 15 Oct 2026 authorization of the period 10 Sep–17 Oct left 16 and 17 Oct
-- inside the locked period. Those days have no activity. The open successor
-- started 18 Oct. End the closed period on the authorization day and start the
-- open period the next morning. The stored séptimo is left as it is: the week
-- of Saturday 17 Oct had no attendance on 15–17 Oct, so it earned nothing.

WITH closed_fix AS (
  UPDATE pay_periods
  SET end_date = DATE '2026-10-15',
      updated_at = CURRENT_TIMESTAMP
  WHERE is_closed = true
    AND start_date = DATE '2026-09-10'
    AND end_date = DATE '2026-10-17'
    AND closed_at IS NOT NULL
    AND ((closed_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Guatemala')::date = DATE '2026-10-15'
  RETURNING id, closed_by
),
open_fix AS (
  UPDATE pay_periods
  SET start_date = DATE '2026-10-16',
      updated_at = CURRENT_TIMESTAMP
  WHERE is_closed = false
    AND start_date = DATE '2026-10-18'
    AND end_date = DATE '2026-11-14'
    AND EXISTS (SELECT 1 FROM closed_fix)
  RETURNING id
),
audits AS (
  SELECT
    '01a14561-776e-7fb2-a9bf-65f2b0ad7a83'::uuid AS id,
    closed_by AS user_id,
    id::text AS record_id,
    '{"startDate":"2026-09-10","endDate":"2026-10-17"}'::jsonb AS old_values,
    '{"startDate":"2026-09-10","endDate":"2026-10-15","reason":"La autorización del 15/10/2026 cierra el período ese día. El 16/10 y el 17/10 no tenían actividad."}'::jsonb AS new_values
  FROM closed_fix
  WHERE closed_by IS NOT NULL
  UNION ALL
  SELECT
    '01a14561-776e-7f2a-88bf-049f5c700ac4'::uuid,
    (SELECT closed_by FROM closed_fix LIMIT 1),
    open_fix.id::text,
    '{"startDate":"2026-10-18","endDate":"2026-11-14"}'::jsonb,
    '{"startDate":"2026-10-16","endDate":"2026-11-14","reason":"El período abierto empieza el día siguiente al cierre."}'::jsonb
  FROM open_fix
  WHERE (SELECT closed_by FROM closed_fix LIMIT 1) IS NOT NULL
)
INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, created_at)
SELECT id, user_id, 'UPDATE', 'pay_periods', record_id, old_values, new_values, CURRENT_TIMESTAMP
FROM audits;

ALTER TABLE pay_periods
  ADD CONSTRAINT pay_periods_closed_end_on_authorization_day
  CHECK (
    NOT is_closed
    OR (
      closed_at IS NOT NULL
      AND end_date <= ((closed_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Guatemala')::date
    )
  );
