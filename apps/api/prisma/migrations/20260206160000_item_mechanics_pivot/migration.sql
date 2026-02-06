-- CreateTable
CREATE TABLE "work_order_item_mechanics" (
    "id" TEXT NOT NULL,
    "contributionPercent" INTEGER NOT NULL DEFAULT 100,
    "workOrderItemId" TEXT NOT NULL,
    "mechanicId" TEXT NOT NULL,

    CONSTRAINT "work_order_item_mechanics_pkey" PRIMARY KEY ("id")
);

-- Migrate existing data
INSERT INTO "work_order_item_mechanics" ("id", "contributionPercent", "workOrderItemId", "mechanicId")
SELECT gen_random_uuid(), "contributionPercent", "id", "mechanicId"
FROM "work_order_items"
WHERE "mechanicId" IS NOT NULL;

-- Drop old columns
ALTER TABLE "work_order_items" DROP COLUMN "mechanicId";
ALTER TABLE "work_order_items" DROP COLUMN "contributionPercent";

-- CreateIndex
CREATE INDEX "work_order_item_mechanics_workOrderItemId_idx" ON "work_order_item_mechanics"("workOrderItemId");

-- CreateIndex
CREATE INDEX "work_order_item_mechanics_mechanicId_idx" ON "work_order_item_mechanics"("mechanicId");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_item_mechanics_workOrderItemId_mechanicId_key" ON "work_order_item_mechanics"("workOrderItemId", "mechanicId");

-- AddForeignKey
ALTER TABLE "work_order_item_mechanics" ADD CONSTRAINT "work_order_item_mechanics_workOrderItemId_fkey" FOREIGN KEY ("workOrderItemId") REFERENCES "work_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_item_mechanics" ADD CONSTRAINT "work_order_item_mechanics_mechanicId_fkey" FOREIGN KEY ("mechanicId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
