-- Store 테이블에 isHq 컬럼 추가
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "isHq" BOOLEAN NOT NULL DEFAULT false;

-- Job 테이블에 storeId 컬럼 추가 (기존 storeCode 대체)
-- 1. 먼저 nullable로 추가
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "storeId" TEXT;

-- 2. 기존 storeCode 기반으로 storeId 업데이트
UPDATE "Job" j
SET "storeId" = s.id
FROM "Store" s
WHERE j."storeCode" = s.code
  AND j."storeId" IS NULL;

-- 3. storeId가 없는 Job은 HQ 매장으로 연결 (fallback)
UPDATE "Job" j
SET "storeId" = (SELECT id FROM "Store" WHERE code = 'HQ' LIMIT 1)
WHERE j."storeId" IS NULL;

-- 4. storeId를 NOT NULL로 변경 (데이터 있어야 함)
-- ALTER TABLE "Job" ALTER COLUMN "storeId" SET NOT NULL;

-- 5. storeCode 컬럼 삭제
ALTER TABLE "Job" DROP COLUMN IF EXISTS "storeCode";

-- 6. 기존 인덱스 삭제 (있으면)
DROP INDEX IF EXISTS "Job_storeCode_idx";

-- 7. storeId 인덱스 추가
CREATE INDEX IF NOT EXISTS "Job_storeId_idx" ON "Job"("storeId");

-- 8. Foreign Key 추가
ALTER TABLE "Job" ADD CONSTRAINT "Job_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
