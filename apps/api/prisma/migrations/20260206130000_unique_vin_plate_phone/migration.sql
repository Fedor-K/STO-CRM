-- Drop old non-unique indexes (replaced by unique constraints)
DROP INDEX IF EXISTS "vehicles_licensePlate_idx";
DROP INDEX IF EXISTS "vehicles_vin_idx";

-- CreateIndex: unique VIN per tenant (NULLs allowed)
CREATE UNIQUE INDEX "vehicles_vin_tenantId_key" ON "vehicles"("vin", "tenantId") WHERE "vin" IS NOT NULL;

-- CreateIndex: unique license plate per tenant (NULLs allowed)
CREATE UNIQUE INDEX "vehicles_licensePlate_tenantId_key" ON "vehicles"("licensePlate", "tenantId") WHERE "licensePlate" IS NOT NULL;

-- CreateIndex: unique phone per tenant (NULLs allowed)
CREATE UNIQUE INDEX "users_phone_tenantId_key" ON "users"("phone", "tenantId") WHERE "phone" IS NOT NULL;
