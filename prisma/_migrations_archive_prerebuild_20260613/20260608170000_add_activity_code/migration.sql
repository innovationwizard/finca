-- AlterTable
ALTER TABLE "activities" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "activities_code_key" ON "activities"("code");
