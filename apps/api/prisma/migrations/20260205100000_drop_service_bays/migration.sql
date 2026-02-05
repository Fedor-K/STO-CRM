-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_serviceBayId_fkey";

-- DropForeignKey
ALTER TABLE "work_orders" DROP CONSTRAINT IF EXISTS "work_orders_serviceBayId_fkey";

-- DropForeignKey
ALTER TABLE "service_bays" DROP CONSTRAINT IF EXISTS "service_bays_tenantId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "service_bays_tenantId_idx";

-- AlterTable
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "serviceBayId";

-- AlterTable
ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "serviceBayId";

-- DropTable
DROP TABLE IF EXISTS "service_bays";
