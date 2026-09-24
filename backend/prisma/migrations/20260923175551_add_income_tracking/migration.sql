-- CreateEnum
CREATE TYPE "IncomeCategory" AS ENUM ('TICKET_SALE', 'COMMISSION', 'REFUND', 'OTHER');

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "category" "IncomeCategory" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reference" TEXT,
    "receivedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Income_businessId_idx" ON "Income"("businessId");

-- CreateIndex
CREATE INDEX "Income_businessId_receivedOn_idx" ON "Income"("businessId", "receivedOn");

-- CreateIndex
CREATE INDEX "Income_businessId_category_idx" ON "Income"("businessId", "category");

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
