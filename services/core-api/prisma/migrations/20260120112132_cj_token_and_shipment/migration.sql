-- CreateTable
CREATE TABLE "CjToken" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenType" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CjToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CjShipment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "invcNo" TEXT,
    "regBookNo" TEXT,
    "resultCode" TEXT,
    "resultMessage" TEXT,
    "reqInvcNoJson" JSONB,
    "regBookJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CjShipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CjToken_expiresAt_idx" ON "CjToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CjShipment_jobId_key" ON "CjShipment"("jobId");

-- CreateIndex
CREATE INDEX "CjShipment_invcNo_idx" ON "CjShipment"("invcNo");
