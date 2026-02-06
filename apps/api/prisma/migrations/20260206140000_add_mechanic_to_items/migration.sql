-- AlterTable
ALTER TABLE "work_order_items" ADD COLUMN "mechanicId" TEXT;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_mechanicId_fkey" FOREIGN KEY ("mechanicId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
