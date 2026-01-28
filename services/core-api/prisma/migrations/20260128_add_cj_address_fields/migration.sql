-- Add CJ address verification fields to JobParcel
ALTER TABLE "JobParcel" ADD COLUMN "destCode" TEXT;
ALTER TABLE "JobParcel" ADD COLUMN "subDestCode" TEXT;
ALTER TABLE "JobParcel" ADD COLUMN "clsfAddr" TEXT;
ALTER TABLE "JobParcel" ADD COLUMN "branchName" TEXT;
