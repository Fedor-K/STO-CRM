-- CreateTable
CREATE TABLE vehicle_part_stats (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES tenants(id),
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  "serviceDescription" TEXT NOT NULL,
  "partId" TEXT REFERENCES parts(id),
  "partName" TEXT NOT NULL,
  "partSku" TEXT,
  "partBrand" TEXT,
  "avgPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "usageCount" INT NOT NULL DEFAULT 0,
  "woCount" INT NOT NULL DEFAULT 0,
  "relevance" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_vps_tenant_vehicle_service_part
    UNIQUE ("tenantId", make, model, "serviceDescription", "partId")
);

-- CreateIndex
CREATE INDEX idx_vps_tenant_make_model ON vehicle_part_stats ("tenantId", make, model);

-- CreateIndex
CREATE INDEX idx_vps_tenant_make_model_service ON vehicle_part_stats ("tenantId", make, model, "serviceDescription");
