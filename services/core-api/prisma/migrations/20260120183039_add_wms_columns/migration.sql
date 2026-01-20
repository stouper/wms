/*
  Warnings:

  - You are about to drop the column `regBookNo` on the `CjShipment` table. All the data in the column will be lost.
  - You are about to drop the column `resultCode` on the `CjShipment` table. All the data in the column will be lost.
  - You are about to drop the column `resultMessage` on the `CjShipment` table. All the data in the column will be lost.
  - You are about to drop the column `accessToken` on the `CjToken` table. All the data in the column will be lost.
  - You are about to drop the column `issuedAt` on the `CjToken` table. All the data in the column will be lost.
  - You are about to drop the column `tokenType` on the `CjToken` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `CjToken` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tokenNum]` on the table `CjToken` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tokenNum` to the `CjToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CjShipment" DROP COLUMN "regBookNo",
DROP COLUMN "resultCode",
DROP COLUMN "resultMessage",
ADD COLUMN     "cjResJson" JSONB,
ADD COLUMN     "custUseNo" TEXT,
ADD COLUMN     "mpckKey" TEXT,
ADD COLUMN     "rcptYmd" TEXT;

-- AlterTable
ALTER TABLE "CjToken" DROP COLUMN "accessToken",
DROP COLUMN "issuedAt",
DROP COLUMN "tokenType",
DROP COLUMN "updatedAt",
ADD COLUMN     "tokenNum" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "InventoryTx" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "workStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "JobItem" ADD COLUMN     "locationHint" TEXT;

-- AlterTable
ALTER TABLE "JobParcel" ADD COLUMN     "requestedCjAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Sku" ADD COLUMN     "barcode" TEXT;

-- CreateIndex
CREATE INDEX "CjShipment_custUseNo_idx" ON "CjShipment"("custUseNo");

-- CreateIndex
CREATE UNIQUE INDEX "CjToken_tokenNum_key" ON "CjToken"("tokenNum");

-- CreateIndex
CREATE INDEX "InventoryTx_jobId_createdAt_idx" ON "InventoryTx"("jobId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Job_priority_idx" ON "Job"("priority");

-- CreateIndex
CREATE INDEX "Job_channel_idx" ON "Job"("channel");

-- CreateIndex
CREATE INDEX "JobParcel_orderNo_idx" ON "JobParcel"("orderNo");

-- CreateIndex
CREATE INDEX "Sku_barcode_idx" ON "Sku"("barcode");

-- AddForeignKey
ALTER TABLE "CjShipment" ADD CONSTRAINT "CjShipment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
