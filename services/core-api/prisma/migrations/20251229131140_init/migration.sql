-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Sku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "makerCode" TEXT,
    "name" TEXT,
    "productType" TEXT NOT NULL DEFAULT 'SHOES'
);
INSERT INTO "new_Sku" ("id", "makerCode", "name", "sku") SELECT "id", "makerCode", "name", "sku" FROM "Sku";
DROP TABLE "Sku";
ALTER TABLE "new_Sku" RENAME TO "Sku";
CREATE UNIQUE INDEX "Sku_sku_key" ON "Sku"("sku");
CREATE INDEX "Sku_makerCode_idx" ON "Sku"("makerCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
