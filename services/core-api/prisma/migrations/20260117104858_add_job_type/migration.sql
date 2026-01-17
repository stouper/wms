-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('INBOUND', 'OUTBOUND', 'RETURN', 'MOVE', 'ADJUST');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "type" "JobType" NOT NULL DEFAULT 'OUTBOUND';

-- CreateIndex
CREATE INDEX "Job_type_idx" ON "Job"("type");
