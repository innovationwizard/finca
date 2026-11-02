-- Corrections to the harvest pilot. Does not touch "Corte de Café".
-- Does not insert a price. Pricing has not been entered for this activity.

-- Sacos is its own count. bultos is left as it was.
ALTER TABLE "coffee_intakes" ADD COLUMN "sacos" INTEGER;

-- Cuadrilla is required for a temporal person. Voluntario and Fijo may omit it.
ALTER TABLE "workers"
  ADD CONSTRAINT "workers_temporal_cuadrilla_check"
  CHECK ("category" <> 'TEMPORAL' OR ("cuadrilla" IS NOT NULL AND btrim("cuadrilla") <> ''));

ALTER TABLE "enrollment_captures"
  ADD CONSTRAINT "enrollment_captures_temporal_cuadrilla_check"
  CHECK ("chosen_category" <> 'TEMPORAL' OR ("cuadrilla" IS NOT NULL AND btrim("cuadrilla") <> ''));

-- Rename the harvest activity. Drop the invented 0.85 price.
-- No vigencia is written here: none has been entered for this activity.
UPDATE "activities"
SET
  "name" = 'Entrega de Café',
  "description" = 'Entrega de café por libra.',
  "default_price" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'EC';

DELETE FROM "activity_prices"
WHERE "id" = '01a19d01-68a0-7b22-a0a2-8450aec35815';

-- 0.5 is uncalibrated and must be verified on the finca phones.
UPDATE "system_settings"
SET
  "label" = 'Similitud mínima de coincidencia facial (sin calibrar; verificar en los teléfonos de la finca)',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'face_match_min_similarity';

-- Prisma @default(uuid(7)) is generated in the client, not by Postgres.
-- The trigger runs in SQL, so it uses the same RFC 9562 layout as src/lib/utils/uuidv7.ts.
CREATE OR REPLACE FUNCTION finca_uuidv7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  unix_ts_ms bigint;
  b bytea;
BEGIN
  unix_ts_ms := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  b := set_byte(b, 0, ((unix_ts_ms >> 40) & 255)::int);
  b := set_byte(b, 1, ((unix_ts_ms >> 32) & 255)::int);
  b := set_byte(b, 2, ((unix_ts_ms >> 24) & 255)::int);
  b := set_byte(b, 3, ((unix_ts_ms >> 16) & 255)::int);
  b := set_byte(b, 4, ((unix_ts_ms >> 8) & 255)::int);
  b := set_byte(b, 5, (unix_ts_ms & 255)::int);
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);
  RETURN encode(b, 'hex')::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION enrollment_capture_copy_descriptor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.worker_id IS NULL
     AND NEW.worker_id IS NOT NULL
     AND NEW.descriptor IS NOT NULL
     AND cardinality(NEW.descriptor) > 0
     AND NOT EXISTS (
       SELECT 1 FROM face_descriptors fd
       WHERE fd.worker_id = NEW.worker_id
         AND fd.descriptor = NEW.descriptor
     )
  THEN
    INSERT INTO face_descriptors (id, worker_id, descriptor, capture_time, created_at)
    VALUES (finca_uuidv7(), NEW.worker_id, NEW.descriptor, NEW.capture_time, NOW());
  END IF;
  RETURN NEW;
END;
$$;
