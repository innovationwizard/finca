-- New harvest activity. Does not read or write "Corte de Café".
-- First vigencia date is an assumption: 2025-10-01, start of cosecha 2526.
-- The price also lives on default_price, so a work date before this vigencia
-- still resolves to 0.85.

INSERT INTO "activities" (
  "id", "name", "code", "unit", "default_price",
  "is_harvest", "is_beneficio", "sort_order", "is_active",
  "description", "created_at", "updated_at"
)
SELECT
  '01a19d01-689f-788b-9ecf-e594080813e2',
  'Entrega de Cereza',
  'EC',
  'LIBRA',
  0.85,
  true,
  false,
  COALESCE((SELECT MAX("sort_order") FROM "activities"), 0) + 1,
  true,
  'Pesaje de cereza por libra.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "activities" WHERE "name" = 'Entrega de Cereza' OR "code" = 'EC'
);

INSERT INTO "activity_prices" (
  "id", "activity_id", "price", "effective_from", "note", "created_at"
)
SELECT
  '01a19d01-68a0-7b22-a0a2-8450aec35815',
  '01a19d01-689f-788b-9ecf-e594080813e2',
  0.85,
  DATE '2025-10-01',
  'Primera vigencia',
  CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM "activities"
  WHERE "id" = '01a19d01-689f-788b-9ecf-e594080813e2' AND "code" = 'EC'
)
AND NOT EXISTS (
  SELECT 1 FROM "activity_prices"
  WHERE "activity_id" = '01a19d01-689f-788b-9ecf-e594080813e2'
    AND "effective_from" = DATE '2025-10-01'
);

-- Face match rule. No calibration screen in this milestone.
-- Value is Human similarity (higher is closer). Library comment: above 0.5 can be a match.
INSERT INTO "system_settings" (
  "id", "key", "value", "label", "group", "created_at", "updated_at"
)
SELECT
  '01a19d01-68a0-7d5d-9e36-849a3a3c0a83',
  'face_match_min_similarity',
  '0.5',
  'Similitud mínima de coincidencia facial',
  'cosecha',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "system_settings" WHERE "key" = 'face_match_min_similarity'
);
