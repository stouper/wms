-- AlterTable
ALTER TABLE "InventoryTx" ADD COLUMN     "undoneAt" TIMESTAMP(3),
ADD COLUMN     "undoneTxId" TEXT;

-- CreateIndex
CREATE INDEX "InventoryTx_undoneAt_idx" ON "InventoryTx"("undoneAt");

-- CreateIndex
CREATE INDEX "InventoryTx_undoneTxId_idx" ON "InventoryTx"("undoneTxId");
