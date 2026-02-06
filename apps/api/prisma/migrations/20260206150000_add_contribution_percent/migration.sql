-- AlterTable: add contributionPercent to work_order_items
ALTER TABLE "work_order_items" ADD COLUMN "contributionPercent" INTEGER NOT NULL DEFAULT 100;
