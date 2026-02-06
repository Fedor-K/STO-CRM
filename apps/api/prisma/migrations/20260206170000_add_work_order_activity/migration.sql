-- CreateTable
CREATE TABLE "work_order_activities" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT,
    CONSTRAINT "work_order_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_activities_workOrderId_idx" ON "work_order_activities"("workOrderId");

-- CreateIndex
CREATE INDEX "work_order_activities_createdAt_idx" ON "work_order_activities"("createdAt");

-- AddForeignKey
ALTER TABLE "work_order_activities" ADD CONSTRAINT "work_order_activities_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_activities" ADD CONSTRAINT "work_order_activities_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
