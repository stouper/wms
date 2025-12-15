/*
  Warnings:

  - You are about to drop the column `reason` on the `InventoryTx` table. All the data in the column will be lost.
  - You are about to drop the column `storeCode` on the `Store` table. All the data in the column will be lost.
  - You are about to drop the column `storeName` on the `Store` table. All the data in the column will be lost.
  - Made the column `code` on table `Sku` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `code` to the `Store` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Inventory_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Inventory" ("id", "locationId", "qty", "skuId") SELECT "id", "locationId", "qty", "skuId" FROM "Inventory";
DROP TABLE "Inventory";
ALTER TABLE "new_Inventory" RENAME TO "Inventory";
CREATE UNIQUE INDEX "Inventory_skuId_locationId_key" ON "Inventory"("skuId", "locationId");
CREATE TABLE "new_InventoryTx" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTx_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTx_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventoryTx" ("createdAt", "id", "locationId", "qty", "skuId", "type") SELECT "createdAt", "id", "locationId", "qty", "skuId", "type" FROM "InventoryTx";
DROP TABLE "InventoryTx";
ALTER TABLE "new_InventoryTx" RENAME TO "InventoryTx";
CREATE INDEX "InventoryTx_skuId_idx" ON "InventoryTx"("skuId");
CREATE INDEX "InventoryTx_locationId_idx" ON "InventoryTx"("locationId");
CREATE TABLE "new_Sku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "makerCode" TEXT,
    "name" TEXT
);
INSERT INTO "new_Sku" ("code", "id", "makerCode", "name") SELECT "code", "id", "makerCode", "name" FROM "Sku";
DROP TABLE "Sku";
ALTER TABLE "new_Sku" RENAME TO "Sku";
CREATE UNIQUE INDEX "Sku_code_key" ON "Sku"("code");
CREATE TABLE "new_Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT
);
INSERT INTO "new_Store" ("id") SELECT "id" FROM "Store";
DROP TABLE "Store";
ALTER TABLE "new_Store" RENAME TO "Store";
CREATE UNIQUE INDEX "Store_code_key" ON "Store"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Location_code_idx" ON "Location"("code");
