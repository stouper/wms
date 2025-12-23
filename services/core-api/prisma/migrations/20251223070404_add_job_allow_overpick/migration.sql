-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
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
INSERT INTO "new_Job" ("createdAt", "doneAt", "id", "memo", "status", "storeCode", "title", "updatedAt") SELECT "createdAt", "doneAt", "id", "memo", "status", "storeCode", "title", "updatedAt" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE INDEX "Job_storeCode_idx" ON "Job"("storeCode");
CREATE INDEX "Job_doneAt_idx" ON "Job"("doneAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
