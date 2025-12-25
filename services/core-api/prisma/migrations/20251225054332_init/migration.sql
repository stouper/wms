-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    CONSTRAINT "Location_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "makerCode" TEXT,
    "name" TEXT
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Inventory_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryTx" (
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

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeCode" TEXT NOT NULL,
    "allowOverpick" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "doneAt" DATETIME
);

-- CreateTable
CREATE TABLE "JobItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "qtyPlanned" INTEGER NOT NULL,
    "qtyPicked" INTEGER NOT NULL DEFAULT 0,
    "makerCodeSnapshot" TEXT,
    "nameSnapshot" TEXT,
    "extraApprovedQty" INTEGER NOT NULL DEFAULT 0,
    "extraPickedQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobParcel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "orderNo" TEXT,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "zip" TEXT,
    "addr1" TEXT NOT NULL,
    "addr2" TEXT,
    "memo" TEXT,
    "carrierCode" TEXT,
    "waybillNo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobParcel_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_code_key" ON "Store"("code");

-- CreateIndex
CREATE INDEX "Location_storeId_idx" ON "Location"("storeId");

-- CreateIndex
CREATE INDEX "Location_code_idx" ON "Location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_storeId_code_key" ON "Location"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_sku_key" ON "Sku"("sku");

-- CreateIndex
CREATE INDEX "Sku_makerCode_idx" ON "Sku"("makerCode");

-- CreateIndex
CREATE INDEX "Inventory_skuId_idx" ON "Inventory"("skuId");

-- CreateIndex
CREATE INDEX "Inventory_locationId_idx" ON "Inventory"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_skuId_locationId_key" ON "Inventory"("skuId", "locationId");

-- CreateIndex
CREATE INDEX "InventoryTx_createdAt_idx" ON "InventoryTx"("createdAt");

-- CreateIndex
CREATE INDEX "InventoryTx_skuId_idx" ON "InventoryTx"("skuId");

-- CreateIndex
CREATE INDEX "InventoryTx_locationId_idx" ON "InventoryTx"("locationId");

-- CreateIndex
CREATE INDEX "InventoryTx_isForced_idx" ON "InventoryTx"("isForced");

-- CreateIndex
CREATE INDEX "InventoryTx_jobId_idx" ON "InventoryTx"("jobId");

-- CreateIndex
CREATE INDEX "InventoryTx_jobItemId_idx" ON "InventoryTx"("jobItemId");

-- CreateIndex
CREATE INDEX "Job_storeCode_idx" ON "Job"("storeCode");

-- CreateIndex
CREATE INDEX "Job_doneAt_idx" ON "Job"("doneAt");

-- CreateIndex
CREATE INDEX "JobItem_jobId_idx" ON "JobItem"("jobId");

-- CreateIndex
CREATE INDEX "JobItem_skuId_idx" ON "JobItem"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "JobItem_jobId_skuId_key" ON "JobItem"("jobId", "skuId");

-- CreateIndex
CREATE UNIQUE INDEX "JobParcel_jobId_key" ON "JobParcel"("jobId");
