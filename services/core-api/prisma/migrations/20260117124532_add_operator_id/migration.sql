-- AlterTable
ALTER TABLE "InventoryTx" ADD COLUMN     "operatorId" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "operatorId" TEXT;

-- CreateIndex
CREATE INDEX "InventoryTx_operatorId_idx" ON "InventoryTx"("operatorId");

-- CreateIndex
CREATE INDEX "Job_operatorId_idx" ON "Job"("operatorId");
