-- =============================================================================
-- plan_entries: store the week as a real date, not as a position in a window.
--
-- BEFORE: (agricultural_year text, month int 1-12, week int 1-4). Those were
-- offsets into whatever the agricultural year happened to be, so when the
-- cosecha window moved from March→February to October→September on 2026-07-27,
-- every stored row changed meaning without changing: month 9 stopped being
-- November and became June.
--
-- AFTER: week_start date — the week's actual first day (the 1st, 8th, 15th or
-- 22nd of a calendar month; week 4 runs to month end). Cosecha and month are
-- derived on read. A future change to the cosecha window migrates zero rows.
--
-- BACKFILL: every existing row is stamped '2627', which under the OLD rule meant
-- March 2026 → February 2027. So month index 1..10 = March..December 2026 and
-- 11..12 = January..February 2027, and the week index picks the day: 1, 8, 15, 22.
-- Confirmed with the farm that those calendar months are what was intended
-- (Corte de Café under "Noviembre" is the nov-2026 → feb-2027 harvest).
--
-- Tables are schema-qualified: a `backup` schema holds a same-named copy of this
-- table that must not be touched.
-- =============================================================================

ALTER TABLE public.plan_entries ADD COLUMN week_start date;

UPDATE public.plan_entries
SET week_start =
      make_date(
        CASE WHEN month <= 10 THEN 2026 ELSE 2027 END,
        CASE WHEN month <= 10 THEN month + 2 ELSE month - 10 END,
        1
      )
      + ((week - 1) * 7)
WHERE agricultural_year = '2627';

-- Fail loudly rather than convert a row whose year this backfill does not know
-- how to read. At the time of writing every row is '2627'; if that ever stops
-- being true the migration must be extended, not silently skipped.
DO $$
DECLARE unconverted integer;
BEGIN
  SELECT count(*) INTO unconverted FROM public.plan_entries WHERE week_start IS NULL;
  IF unconverted > 0 THEN
    RAISE EXCEPTION
      'plan_entries: % fila(s) sin week_start — hay años agrícolas que este backfill no contempla',
      unconverted;
  END IF;
END $$;

ALTER TABLE public.plan_entries ALTER COLUMN week_start SET NOT NULL;

DROP INDEX public.plan_entries_agricultural_year_lote_id_activity_id_month_we_key;

ALTER TABLE public.plan_entries
  DROP COLUMN agricultural_year,
  DROP COLUMN month,
  DROP COLUMN week;

CREATE UNIQUE INDEX plan_entries_lote_id_activity_id_week_start_key
  ON public.plan_entries (lote_id, activity_id, week_start);

CREATE INDEX plan_entries_week_start_idx ON public.plan_entries (week_start);
