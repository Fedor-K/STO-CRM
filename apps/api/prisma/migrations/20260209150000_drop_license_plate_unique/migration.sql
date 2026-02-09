-- Drop unique constraint on licensePlate per tenant
-- License plates can be transferred between vehicles, so they are NOT unique identifiers
-- VIN remains the unique identifier for vehicles
DROP INDEX IF EXISTS "vehicles_licensePlate_tenantId_key";
