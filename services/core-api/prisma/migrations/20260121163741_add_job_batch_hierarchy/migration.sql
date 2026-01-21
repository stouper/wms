/*
  Warnings:

  - Made the column `storeId` on table `Job` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "packType" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "storeId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Job_parentId_idx" ON "Job"("parentId");

-- CreateIndex
CREATE INDEX "Job_packType_idx" ON "Job"("packType");

-- CreateIndex
CREATE INDEX "Job_sortOrder_idx" ON "Job"("sortOrder");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
