-- AlterTable
ALTER TABLE "work_order_items" ADD COLUMN     "approvedByClient" BOOLEAN,
ADD COLUMN     "recommended" BOOLEAN NOT NULL DEFAULT false;
