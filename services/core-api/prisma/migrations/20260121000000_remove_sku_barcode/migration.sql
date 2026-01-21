-- DropIndex
DROP INDEX IF EXISTS "Sku_barcode_idx";

-- DropColumn
ALTER TABLE "Sku" DROP COLUMN IF EXISTS "barcode";
