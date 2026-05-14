-- Unify JORNAL → DIA: migrate data, rebuild enum without JORNAL

-- 1. Migrate all Activity rows using JORNAL
UPDATE "activities" SET unit = 'DIA' WHERE unit = 'JORNAL';

-- 2. Rebuild enum without JORNAL
ALTER TYPE "ActivityUnit" RENAME TO "ActivityUnit_old";
CREATE TYPE "ActivityUnit" AS ENUM ('QUINTAL', 'MANZANA', 'HECTAREA', 'DIA');
ALTER TABLE "activities" ALTER COLUMN unit TYPE "ActivityUnit" USING unit::text::"ActivityUnit";
DROP TYPE "ActivityUnit_old";
