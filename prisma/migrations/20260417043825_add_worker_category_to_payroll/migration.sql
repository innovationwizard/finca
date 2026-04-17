-- CreateEnum
CREATE TYPE "WorkerCategory" AS ENUM ('VOLUNTARIO', 'FIJO');

-- DropIndex
DROP INDEX "payroll_entries_pay_period_id_worker_id_key";

-- AlterTable
ALTER TABLE "payroll_entries" ADD COLUMN     "category" "WorkerCategory" NOT NULL DEFAULT 'VOLUNTARIO';

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entries_pay_period_id_worker_id_category_key" ON "payroll_entries"("pay_period_id", "worker_id", "category");
