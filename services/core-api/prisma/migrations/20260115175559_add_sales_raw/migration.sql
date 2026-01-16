-- CreateTable
CREATE TABLE "SalesRaw" (
    "id" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceKey" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "storeCode" TEXT NOT NULL,
    "storeName" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "SalesRaw_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesRaw_saleDate_idx" ON "SalesRaw"("saleDate");

-- CreateIndex
CREATE INDEX "SalesRaw_storeCode_saleDate_idx" ON "SalesRaw"("storeCode", "saleDate");
