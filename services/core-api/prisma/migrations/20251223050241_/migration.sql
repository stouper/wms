/*
  Warnings:

  - You are about to drop the column `code` on the `Sku` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Inventory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sku` to the `Sku` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Job_status_idx";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Inventory_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Inventory" ("id", "locationId", "qty", "skuId") SELECT "id", "locationId", "qty", "skuId" FROM "Inventory";
DROP TABLE "Inventory";
ALTER TABLE "new_Inventory" RENAME TO "Inventory";
CREATE INDEX "Inventory_skuId_idx" ON "Inventory"("skuId");
CREATE INDEX "Inventory_locationId_idx" ON "Inventory"("locationId");
CREATE UNIQUE INDEX "Inventory_skuId_locationId_key" ON "Inventory"("skuId", "locationId");
CREATE TABLE "new_InventoryTx" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT,
    "isForced" BOOLEAN NOT NULL DEFAULT false,
    "forcedReason" TEXT,
    "beforeQty" INTEGER,
    "afterQty" INTEGER,
    "jobId" TEXT,
    "jobItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTx_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryTx_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTx_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTx_jobItemId_fkey" FOREIGN KEY ("jobItemId") REFERENCES "JobItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventoryTx" ("createdAt", "id", "locationId", "qty", "skuId", "type") SELECT "createdAt", "id", "locationId", "qty", "skuId", "type" FROM "InventoryTx";
DROP TABLE "InventoryTx";
ALTER TABLE "new_InventoryTx" RENAME TO "InventoryTx";
CREATE INDEX "InventoryTx_createdAt_idx" ON "InventoryTx"("createdAt");
CREATE INDEX "InventoryTx_skuId_idx" ON "InventoryTx"("skuId");
CREATE INDEX "InventoryTx_locationId_idx" ON "InventoryTx"("locationId");
CREATE INDEX "InventoryTx_isForced_idx" ON "InventoryTx"("isForced");
CREATE INDEX "InventoryTx_jobId_idx" ON "InventoryTx"("jobId");
CREATE INDEX "InventoryTx_jobItemId_idx" ON "InventoryTx"("jobItemId");
CREATE TABLE "new_JobItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "qtyPlanned" INTEGER NOT NULL,
    "qtyPicked" INTEGER NOT NULL DEFAULT 0,
    "makerCodeSnapshot" TEXT,
    "nameSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JobItem" ("createdAt", "id", "jobId", "makerCodeSnapshot", "qtyPicked", "qtyPlanned", "skuId", "updatedAt") SELECT "createdAt", "id", "jobId", "makerCodeSnapshot", "qtyPicked", "qtyPlanned", "skuId", "updatedAt" FROM "JobItem";
DROP TABLE "JobItem";
ALTER TABLE "new_JobItem" RENAME TO "JobItem";
CREATE INDEX "JobItem_jobId_idx" ON "JobItem"("jobId");
CREATE INDEX "JobItem_skuId_idx" ON "JobItem"("skuId");
CREATE UNIQUE INDEX "JobItem_jobId_skuId_key" ON "JobItem"("jobId", "skuId");
CREATE TABLE "new_Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    CONSTRAINT "Location_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Location" ("code", "id", "storeId") SELECT "code", "id", "storeId" FROM "Location";
DROP TABLE "Location";
ALTER TABLE "new_Location" RENAME TO "Location";
CREATE INDEX "Location_storeId_idx" ON "Location"("storeId");
CREATE INDEX "Location_code_idx" ON "Location"("code");
CREATE UNIQUE INDEX "Location_storeId_code_key" ON "Location"("storeId", "code");
CREATE TABLE "new_Sku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "makerCode" TEXT,
    "name" TEXT
);
INSERT INTO "new_Sku" ("id", "makerCode", "name") SELECT "id", "makerCode", "name" FROM "Sku";
DROP TABLE "Sku";
ALTER TABLE "new_Sku" RENAME TO "Sku";
CREATE UNIQUE INDEX "Sku_sku_key" ON "Sku"("sku");
CREATE INDEX "Sku_makerCode_idx" ON "Sku"("makerCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
