/*
  Warnings:

  - You are about to drop the `ImportJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ImportLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderLine` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Product` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Shipment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `refId` on the `InventoryTx` table. All the data in the column will be lost.
  - You are about to drop the column `refType` on the `InventoryTx` table. All the data in the column will be lost.
  - You are about to drop the column `barcode` on the `Sku` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `Sku` table. All the data in the column will be lost.
  - You are about to drop the column `size` on the `Sku` table. All the data in the column will be lost.
  - You are about to drop the column `skuCode` on the `Sku` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Order_orderNo_key";

-- DropIndex
DROP INDEX "Product_code_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ImportJob";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ImportLog";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Order";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OrderLine";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Product";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Shipment";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
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
    "type" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTx_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTx_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventoryTx" ("createdAt", "id", "locationId", "qty", "skuId", "type") SELECT "createdAt", "id", "locationId", "qty", "skuId", "type" FROM "InventoryTx";
DROP TABLE "InventoryTx";
ALTER TABLE "new_InventoryTx" RENAME TO "InventoryTx";
CREATE INDEX "InventoryTx_skuId_locationId_createdAt_idx" ON "InventoryTx"("skuId", "locationId", "createdAt");
CREATE TABLE "new_Sku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "makerCode" TEXT,
    "code" TEXT,
    "name" TEXT
);
INSERT INTO "new_Sku" ("id") SELECT "id" FROM "Sku";
DROP TABLE "Sku";
ALTER TABLE "new_Sku" RENAME TO "Sku";
CREATE UNIQUE INDEX "Sku_makerCode_key" ON "Sku"("makerCode");
CREATE INDEX "Sku_code_idx" ON "Sku"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
