-- Switch the business base currency from INR to AED.
--
-- Only the column DEFAULTs change: no existing row is rewritten, so this is safe on a
-- populated database. Amounts already stored keep whatever currency they were created
-- with; new records default to AED.

-- AlterTable
ALTER TABLE "Business" ALTER COLUMN "currency" SET DEFAULT 'AED';

-- AlterTable
ALTER TABLE "BusinessSetting" ALTER COLUMN "currency" SET DEFAULT 'AED';

-- AlterTable
ALTER TABLE "BusinessSetting" ALTER COLUMN "defaultCurrency" SET DEFAULT 'AED';

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "currency" SET DEFAULT 'AED';

-- AlterTable
ALTER TABLE "Income" ALTER COLUMN "currency" SET DEFAULT 'AED';
