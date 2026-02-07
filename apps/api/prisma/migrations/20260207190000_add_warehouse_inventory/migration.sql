-- Add new enum values to StockMovementType
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'UNRESERVED';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';

-- CreateTable: warehouses
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "warehouses_tenantId_idx" ON "warehouses"("tenantId");
CREATE UNIQUE INDEX "warehouses_name_tenantId_key" ON "warehouses"("name", "tenantId");
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: warehouse_stock (per-warehouse inventory levels)
CREATE TABLE "warehouse_stock" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,

    CONSTRAINT "warehouse_stock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "warehouse_stock_warehouseId_idx" ON "warehouse_stock"("warehouseId");
CREATE INDEX "warehouse_stock_partId_idx" ON "warehouse_stock"("partId");
CREATE UNIQUE INDEX "warehouse_stock_partId_warehouseId_key" ON "warehouse_stock"("partId", "warehouseId");
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Expand stock_movements: add warehouse, user tracking
ALTER TABLE "stock_movements" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "referenceId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "userId" TEXT;
CREATE INDEX "stock_movements_warehouseId_idx" ON "stock_movements"("warehouseId");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Expand parts: add 1C code, manufacturer
ALTER TABLE "parts" ADD COLUMN "code1C" TEXT;
ALTER TABLE "parts" ADD COLUMN "manufacturer" TEXT;
CREATE INDEX "parts_code1C_idx" ON "parts"("code1C");
