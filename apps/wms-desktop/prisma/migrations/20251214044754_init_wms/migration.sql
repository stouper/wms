-- CreateTable
CREATE TABLE "Inventory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sku" TEXT NOT NULL,
    "name" TEXT,
    "makerCode" TEXT,
    "warehouse" TEXT,
    "location" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "msrp" INTEGER,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InventoryLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "refId" INTEGER,
    "sku" TEXT NOT NULL,
    "diff" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Job" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "orderNo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "requiredQty" INTEGER NOT NULL,
    "pickedQty" INTEGER NOT NULL DEFAULT 0,
    "colH" TEXT,
    "colI" TEXT,
    "colK" TEXT,
    CONSTRAINT "JobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_sku_key" ON "Inventory"("sku");

-- CreateIndex
CREATE INDEX "Inventory_warehouse_idx" ON "Inventory"("warehouse");

-- CreateIndex
CREATE INDEX "Inventory_location_idx" ON "Inventory"("location");

-- CreateIndex
CREATE INDEX "InventoryLog_sku_createdAt_idx" ON "InventoryLog"("sku", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryLog_type_createdAt_idx" ON "InventoryLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "JobItem_sku_idx" ON "JobItem"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "JobItem_jobId_sku_key" ON "JobItem"("jobId", "sku");
