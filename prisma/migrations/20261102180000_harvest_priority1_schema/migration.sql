-- Priority 1 harvest schema.
-- Enum values are appended and are NOT used in this migration: PostgreSQL
-- cannot use a newly added enum value until the transaction commits.
-- Does not update or delete any existing activity, including "Corte de Café".

ALTER TYPE "WorkerCategory" ADD VALUE 'TEMPORAL';
ALTER TYPE "ActivityUnit" ADD VALUE 'LIBRA';

ALTER TABLE "workers" ADD COLUMN "person_photo_path" TEXT;
ALTER TABLE "workers" ADD COLUMN "cuadrilla" TEXT;

ALTER TABLE "coffee_intakes" ALTER COLUMN "peso_neto_qq" TYPE DECIMAL(12, 4);
ALTER TABLE "coffee_intakes" ADD COLUMN "peso_libras" DOUBLE PRECISION;
ALTER TABLE "coffee_intakes" ADD COLUMN "madurez" TEXT;
ALTER TABLE "coffee_intakes" ADD COLUMN "worker_id" UUID;
ALTER TABLE "coffee_intakes" ADD COLUMN "activity_record_id" UUID;

ALTER TABLE "coffee_intakes"
  ADD CONSTRAINT "coffee_intakes_madurez_check"
  CHECK ("madurez" IS NULL OR "madurez" IN ('Maduro', 'Inmaduro'));

CREATE UNIQUE INDEX "coffee_intakes_activity_record_id_key"
  ON "coffee_intakes"("activity_record_id");
CREATE INDEX "coffee_intakes_worker_id_idx" ON "coffee_intakes"("worker_id");

ALTER TABLE "coffee_intakes"
  ADD CONSTRAINT "coffee_intakes_worker_id_fkey"
  FOREIGN KEY ("worker_id") REFERENCES "workers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coffee_intakes"
  ADD CONSTRAINT "coffee_intakes_activity_record_id_fkey"
  FOREIGN KEY ("activity_record_id") REFERENCES "activity_records"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "face_descriptors" (
  "id" UUID NOT NULL,
  "worker_id" UUID NOT NULL,
  "descriptor" DOUBLE PRECISION[],
  "capture_time" TIMESTAMP(3) NOT NULL,
  "source_client_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "face_descriptors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "face_descriptors_worker_id_idx" ON "face_descriptors"("worker_id");
CREATE INDEX "face_descriptors_source_client_id_idx" ON "face_descriptors"("source_client_id");

ALTER TABLE "face_descriptors"
  ADD CONSTRAINT "face_descriptors_worker_id_fkey"
  FOREIGN KEY ("worker_id") REFERENCES "workers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enrollment_captures" (
  "id" UUID NOT NULL,
  "client_id" TEXT NOT NULL,
  "chosen_category" "WorkerCategory" NOT NULL,
  "cuadrilla" TEXT,
  "document_type" "DocumentType" NOT NULL,
  "nombres" TEXT,
  "apellidos" TEXT,
  "fecha_nacimiento" DATE,
  "cui" TEXT,
  "cui_as_printed" TEXT,
  "face_photo_path" TEXT,
  "dpi_front_path" TEXT,
  "dpi_back_path" TEXT,
  "partida_path" TEXT,
  "descriptor" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[],
  "detector_score" DOUBLE PRECISION,
  "description_score" DOUBLE PRECISION,
  "capture_time" TIMESTAMP(3) NOT NULL,
  "worker_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "enrollment_captures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "enrollment_captures_client_id_key" ON "enrollment_captures"("client_id");
CREATE INDEX "enrollment_captures_worker_id_idx" ON "enrollment_captures"("worker_id");
CREATE INDEX "enrollment_captures_cui_idx" ON "enrollment_captures"("cui");

ALTER TABLE "enrollment_captures"
  ADD CONSTRAINT "enrollment_captures_worker_id_fkey"
  FOREIGN KEY ("worker_id") REFERENCES "workers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Miss path: setting worker_id copies the stored descriptor. The accept path
-- inserts face_descriptors itself, so this trigger is UPDATE-only.
-- gen_random_uuid() is v4. This database has no uuidv7() SQL function.
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
    VALUES (gen_random_uuid(), NEW.worker_id, NEW.descriptor, NEW.capture_time, NOW());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enrollment_capture_copy_descriptor
AFTER UPDATE OF worker_id ON enrollment_captures
FOR EACH ROW
EXECUTE FUNCTION enrollment_capture_copy_descriptor();
