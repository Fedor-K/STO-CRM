-- Add VAT fields to work_order_items
ALTER TABLE "work_order_items" ADD COLUMN "vatRate" TEXT;
ALTER TABLE "work_order_items" ADD COLUMN "vatAmount" DECIMAL(12,2);
