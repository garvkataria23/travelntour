-- AlterTable
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "taxLabel" TEXT NOT NULL DEFAULT 'GST';
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT;
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT;
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "bankIfscSwift" TEXT;
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "bankUpiId" TEXT;
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "invoiceTerms" TEXT;
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "invoiceNotes" TEXT;
