-- Job 테이블에 requestDate 컬럼 추가 (의뢰요청일)
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "requestDate" TIMESTAMP(3);
