-- =============================================================================
-- bug_reports — in-app "Reportar" mechanism.
--
-- Two report shapes in one table:
--   DATO_INCORRECTO → donde + app_dice + app_deberia_decir  (where / observed / expected)
--   FALTA_ALGO      → que_falta
--
-- The bug_reports_kind_fields CHECK below is what makes that a real discriminated
-- union at rest: no row can carry fields from both shapes. Prisma cannot express a
-- multi-column CHECK, so it is written here by hand. DO NOT DROP IT when
-- regenerating migrations — without it this table is a bag of nullable columns.
--
-- Screenshots are NOT stored here. They go to the private Supabase Storage bucket
-- "bug-report-screenshots" and this table keeps only the object path, so the
-- Postgres instance does not carry ~2 MB per report and retention is a bucket
-- delete. screenshot_path NULL = no screenshot; screenshot_error says why.
--
-- email_status is the operational column:
--   SELECT * FROM bug_reports WHERE email_status <> 'SENT';
-- is "what did we fail to deliver", and NOT_CONFIGURED distinguishes "the provider
-- rejected it" from "nobody has set the API key yet" — the expected state until
-- the Resend domain is verified.
-- =============================================================================

-- CreateEnum
CREATE TYPE "BugReportKind" AS ENUM ('DATO_INCORRECTO', 'FALTA_ALGO');

-- CreateEnum
CREATE TYPE "BugReportEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED');

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,
    "autor" VARCHAR(500) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "kind" "BugReportKind" NOT NULL,
    "donde" VARCHAR(200),
    "app_dice" VARCHAR(200),
    "app_deberia_decir" VARCHAR(200),
    "que_falta" TEXT,
    "url" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "screenshot_path" TEXT,
    "screenshot_error" TEXT,
    "email_status" "BugReportEmailStatus" NOT NULL DEFAULT 'PENDING',
    "resend_id" TEXT,
    "email_error" TEXT,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bug_reports_created_at_idx" ON "bug_reports"("created_at" DESC);

-- CreateIndex
CREATE INDEX "bug_reports_email_status_idx" ON "bug_reports"("email_status");

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The discriminated union at rest. Hand-written: Prisma cannot express it. DO NOT DROP.
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_kind_fields" CHECK (
  ("kind" = 'DATO_INCORRECTO'
     AND "donde" IS NOT NULL
     AND "app_dice" IS NOT NULL
     AND "app_deberia_decir" IS NOT NULL
     AND "que_falta" IS NULL)
  OR
  ("kind" = 'FALTA_ALGO'
     AND "que_falta" IS NOT NULL
     AND "donde" IS NULL
     AND "app_dice" IS NULL
     AND "app_deberia_decir" IS NULL)
);
