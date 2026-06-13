-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MASTER', 'ADMIN', 'MANAGER', 'FIELD', 'CEO', 'CFO', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DPI', 'BIRTH_CERTIFICATE');

-- CreateEnum
CREATE TYPE "ActivityUnit" AS ENUM ('QUINTAL', 'MANZANA', 'HECTAREA', 'DIA');

-- CreateEnum
CREATE TYPE "PayPeriodType" AS ENUM ('SEMANAL', 'CATORCENA');

-- CreateEnum
CREATE TYPE "WorkerCategory" AS ENUM ('VOLUNTARIO', 'FIJO');

-- CreateEnum
CREATE TYPE "CoffeeType" AS ENUM ('CEREZA', 'PERGAMINO', 'ORO');

-- CreateEnum
CREATE TYPE "IntakeSource" AS ENUM ('COSECHA', 'COMPRA');

-- CreateEnum
CREATE TYPE "CoffeeStatus" AS ENUM ('RECIBIDO', 'DESPULPADO', 'SECANDO', 'PERGAMINO', 'ENVASADO', 'DESPACHADO');

-- CreateEnum
CREATE TYPE "EstimateType" AS ENUM ('PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'FINAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "supabase_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'FIELD',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_dictionary" (
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "handwritten" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "reference_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebook_dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "area_manzanas" DECIMAL(8,2),
    "plant_count" INTEGER,
    "density" TEXT,
    "altitude_masl" INTEGER,
    "variety" TEXT,
    "poda_percent" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" UUID NOT NULL,
    "cui" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "fecha_nacimiento" DATE,
    "sexo" TEXT,
    "nacionalidad" TEXT,
    "lugar_nacimiento" TEXT,
    "vecindad" TEXT,
    "pueblo" TEXT,
    "comunidad_linguistica" TEXT,
    "estado_civil" TEXT,
    "person_photo_url" TEXT,
    "nit" TEXT,
    "bank_account" TEXT,
    "bank_name" TEXT,
    "phone" TEXT,
    "category" "WorkerCategory" NOT NULL DEFAULT 'VOLUNTARIO',
    "is_minor" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_documents" (
    "id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "cui_as_printed" TEXT,
    "extraction_confidence" DECIMAL(5,2),
    "notes" TEXT,
    "source_file" TEXT,
    "source_page" INTEGER,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dpi_documents" (
    "document_id" UUID NOT NULL,
    "fecha_vencimiento" DATE,
    "front_image_url" TEXT,
    "back_image_url" TEXT,
    "apellidos" TEXT,
    "nombres" TEXT,
    "fecha_nacimiento" DATE,
    "sexo" TEXT,
    "nacionalidad" TEXT,
    "lugar_nacimiento" TEXT,
    "vecindad" TEXT,
    "pueblo" TEXT,
    "comunidad_linguistica" TEXT,
    "estado_civil" TEXT,

    CONSTRAINT "dpi_documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "birth_certificate_documents" (
    "document_id" UUID NOT NULL,
    "correlativo" TEXT,
    "fecha_emision_certificado" DATE,
    "image_url" TEXT,
    "inscrito_fecha_nacimiento" DATE,
    "inscrito_lugar_nacimiento" TEXT,
    "inscrito_sexo" TEXT,
    "madre_nombres_apellidos" TEXT,
    "madre_cui" TEXT,
    "madre_fecha_nacimiento" TEXT,
    "madre_lugar_origen" TEXT,
    "padre_nombres_apellidos" TEXT,
    "padre_cui" TEXT,
    "padre_fecha_nacimiento" TEXT,
    "padre_lugar_origen" TEXT,

    CONSTRAINT "birth_certificate_documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "unit" "ActivityUnit" NOT NULL,
    "default_price" DECIMAL(10,2),
    "is_harvest" BOOLEAN NOT NULL DEFAULT false,
    "is_beneficio" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "min_qty_alert" DECIMAL(10,2),
    "max_qty_alert" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_prices" (
    "id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_periods" (
    "id" UUID NOT NULL,
    "type" "PayPeriodType" NOT NULL DEFAULT 'SEMANAL',
    "period_number" INTEGER NOT NULL,
    "agricultural_year" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_records" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "pay_period_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "lote_id" UUID,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_earned" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "client_id" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entries" (
    "id" UUID NOT NULL,
    "pay_period_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "category" "WorkerCategory" NOT NULL DEFAULT 'VOLUNTARIO',
    "total_earned" DECIMAL(10,2) NOT NULL,
    "bonification" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "seventh_day_pay" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "advances" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_to_pay" DECIMAL(10,2) NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "recurring_annual" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coffee_intakes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "coffee_type" "CoffeeType" NOT NULL DEFAULT 'CEREZA',
    "source" "IntakeSource" NOT NULL DEFAULT 'COSECHA',
    "lote_id" UUID,
    "supplier_name" TEXT,
    "procedencia" TEXT,
    "supplier_account" TEXT,
    "price_per_qq" DECIMAL(10,2),
    "payment_status" TEXT,
    "bultos" INTEGER,
    "peso_neto_qq" DECIMAL(10,2) NOT NULL,
    "peso_verde_qq" DECIMAL(10,2),
    "peso_pergamino_qq" DECIMAL(10,2),
    "rendimiento" DECIMAL(6,2),
    "status" "CoffeeStatus" NOT NULL DEFAULT 'RECIBIDO',
    "processed_date" DATE,
    "dispatch_date" DATE,
    "dispatch_code" TEXT,
    "cupping_score" DECIMAL(4,1),
    "notes" TEXT,
    "client_id" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coffee_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entries" (
    "id" UUID NOT NULL,
    "agricultural_year" TEXT NOT NULL,
    "lote_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "planned_jornales" DECIMAL(8,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_estimates" (
    "id" UUID NOT NULL,
    "agricultural_year" TEXT NOT NULL,
    "lote_id" UUID NOT NULL,
    "estimate_type" "EstimateType" NOT NULL,
    "estimate_date" DATE NOT NULL,
    "lb_per_plant" DECIMAL(6,2) NOT NULL,
    "qq_maduro_per_lote" DECIMAL(10,2),
    "qq_oro_per_manzana" DECIMAL(10,2),
    "qq_oro_per_lote" DECIMAL(10,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_supabase_id_key" ON "users"("supabase_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "system_settings_group_idx" ON "system_settings"("group");

-- CreateIndex
CREATE INDEX "notebook_dictionary_category_idx" ON "notebook_dictionary"("category");

-- CreateIndex
CREATE UNIQUE INDEX "notebook_dictionary_category_handwritten_key" ON "notebook_dictionary"("category", "handwritten");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_name_key" ON "lotes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_slug_key" ON "lotes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workers_cui_key" ON "workers"("cui");

-- CreateIndex
CREATE INDEX "worker_documents_worker_id_idx" ON "worker_documents"("worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "worker_documents_worker_id_type_key" ON "worker_documents"("worker_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "activities_name_key" ON "activities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "activities_code_key" ON "activities"("code");

-- CreateIndex
CREATE INDEX "activity_prices_activity_id_effective_from_idx" ON "activity_prices"("activity_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "activity_prices_activity_id_effective_from_key" ON "activity_prices"("activity_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "pay_periods_agricultural_year_period_number_type_key" ON "pay_periods"("agricultural_year", "period_number", "type");

-- CreateIndex
CREATE UNIQUE INDEX "activity_records_client_id_key" ON "activity_records"("client_id");

-- CreateIndex
CREATE INDEX "activity_records_date_idx" ON "activity_records"("date");

-- CreateIndex
CREATE INDEX "activity_records_pay_period_id_idx" ON "activity_records"("pay_period_id");

-- CreateIndex
CREATE INDEX "activity_records_worker_id_idx" ON "activity_records"("worker_id");

-- CreateIndex
CREATE INDEX "activity_records_lote_id_idx" ON "activity_records"("lote_id");

-- CreateIndex
CREATE INDEX "activity_records_activity_id_idx" ON "activity_records"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entries_pay_period_id_worker_id_category_key" ON "payroll_entries"("pay_period_id", "worker_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "coffee_intakes_code_key" ON "coffee_intakes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "coffee_intakes_client_id_key" ON "coffee_intakes"("client_id");

-- CreateIndex
CREATE INDEX "coffee_intakes_date_idx" ON "coffee_intakes"("date");

-- CreateIndex
CREATE INDEX "coffee_intakes_lote_id_idx" ON "coffee_intakes"("lote_id");

-- CreateIndex
CREATE INDEX "coffee_intakes_status_idx" ON "coffee_intakes"("status");

-- CreateIndex
CREATE INDEX "plan_entries_agricultural_year_idx" ON "plan_entries"("agricultural_year");

-- CreateIndex
CREATE UNIQUE INDEX "plan_entries_agricultural_year_lote_id_activity_id_month_we_key" ON "plan_entries"("agricultural_year", "lote_id", "activity_id", "month", "week");

-- CreateIndex
CREATE INDEX "production_estimates_agricultural_year_idx" ON "production_estimates"("agricultural_year");

-- CreateIndex
CREATE UNIQUE INDEX "production_estimates_agricultural_year_lote_id_estimate_typ_key" ON "production_estimates"("agricultural_year", "lote_id", "estimate_type");

-- CreateIndex
CREATE INDEX "audit_logs_table_name_record_id_idx" ON "audit_logs"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "worker_documents" ADD CONSTRAINT "worker_documents_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dpi_documents" ADD CONSTRAINT "dpi_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "worker_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birth_certificate_documents" ADD CONSTRAINT "birth_certificate_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "worker_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_prices" ADD CONSTRAINT "activity_prices_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "pay_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "pay_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coffee_intakes" ADD CONSTRAINT "coffee_intakes_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_estimates" ADD CONSTRAINT "production_estimates_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

