-- Cuadrilla becomes a managed list. A person points at one row.
-- Checked on 2026-11-02: workers.cuadrilla and enrollment_captures.cuadrilla
-- were all null. If a free-text value exists when this runs, stop. There is
-- no start date on that text, and this migration does not invent one.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "workers"
    WHERE "cuadrilla" IS NOT NULL AND btrim("cuadrilla") <> ''
  ) OR EXISTS (
    SELECT 1 FROM "enrollment_captures"
    WHERE "cuadrilla" IS NOT NULL AND btrim("cuadrilla") <> ''
  ) THEN
    RAISE EXCEPTION 'free-text cuadrilla values exist and have no start date';
  END IF;
END $$;

CREATE TABLE "cuadrillas" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cuadrillas_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workers" ADD COLUMN "cuadrilla_id" UUID;
ALTER TABLE "enrollment_captures" ADD COLUMN "cuadrilla_id" UUID;

ALTER TABLE "workers" DROP CONSTRAINT "workers_temporal_cuadrilla_check";
ALTER TABLE "enrollment_captures" DROP CONSTRAINT "enrollment_captures_temporal_cuadrilla_check";

ALTER TABLE "workers" DROP COLUMN "cuadrilla";
ALTER TABLE "enrollment_captures" DROP COLUMN "cuadrilla";

ALTER TABLE "workers"
  ADD CONSTRAINT "workers_cuadrilla_id_fkey"
  FOREIGN KEY ("cuadrilla_id") REFERENCES "cuadrillas"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enrollment_captures"
  ADD CONSTRAINT "enrollment_captures_cuadrilla_id_fkey"
  FOREIGN KEY ("cuadrilla_id") REFERENCES "cuadrillas"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "workers_cuadrilla_id_idx" ON "workers"("cuadrilla_id");
CREATE INDEX "enrollment_captures_cuadrilla_id_idx" ON "enrollment_captures"("cuadrilla_id");

ALTER TABLE "workers"
  ADD CONSTRAINT "workers_temporal_cuadrilla_check"
  CHECK ("category" <> 'TEMPORAL' OR "cuadrilla_id" IS NOT NULL);

ALTER TABLE "enrollment_captures"
  ADD CONSTRAINT "enrollment_captures_temporal_cuadrilla_check"
  CHECK ("chosen_category" <> 'TEMPORAL' OR "cuadrilla_id" IS NOT NULL);
