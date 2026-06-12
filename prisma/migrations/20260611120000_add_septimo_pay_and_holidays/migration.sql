-- AlterTable
ALTER TABLE "payroll_entries" ADD COLUMN     "seventh_day_pay" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
-- id has no DB default: UUIDv7 is generated client-side by Prisma (@default(uuid(7))).
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "recurring_annual" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");
