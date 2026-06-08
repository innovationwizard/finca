-- CreateTable
CREATE TABLE "activity_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_prices_activity_id_effective_from_idx" ON "activity_prices"("activity_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "activity_prices_activity_id_effective_from_key" ON "activity_prices"("activity_id", "effective_from");

-- AddForeignKey
ALTER TABLE "activity_prices" ADD CONSTRAINT "activity_prices_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
