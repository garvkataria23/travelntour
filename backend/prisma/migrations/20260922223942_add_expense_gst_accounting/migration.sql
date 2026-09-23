-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('DIRECT', 'OPERATING');

-- DropIndex
DROP INDEX "Booking_businessId_customerId_idx";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "baseFare" DOUBLE PRECISION,
ADD COLUMN     "cost" DOUBLE PRECISION,
ADD COLUMN     "discount" DOUBLE PRECISION,
ADD COLUMN     "invoiceIssuedAt" TIMESTAMP(3),
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "taxAmount" DOUBLE PRECISION,
ADD COLUMN     "taxRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "BusinessSetting" ADD COLUMN     "gstEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
ADD COLUMN     "nextInvoiceNo" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OPERATING',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "incurredOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_businessId_idx" ON "Expense"("businessId");

-- CreateIndex
CREATE INDEX "Expense_businessId_incurredOn_idx" ON "Expense"("businessId", "incurredOn");

-- CreateIndex
CREATE INDEX "Expense_businessId_category_idx" ON "Expense"("businessId", "category");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
