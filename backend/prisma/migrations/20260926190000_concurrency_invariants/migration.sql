-- Concurrency invariants for multi-staff data entry.
--
-- 1. Booking/Customer gain a `version` column for optimistic locking, so two staff editing
--    the same record get a 409 instead of silently overwriting each other.
-- 2. Booking gains `updatedBy` so the UI can show who last touched a row.
-- 3. (businessId, invoiceNumber) becomes UNIQUE. The number used to be read in JavaScript and
--    then incremented, so two staff creating a booking in the same instant could both be
--    handed the same number and both invoices were printable. Postgres treats NULLs as
--    distinct in a unique index, so bookings without an invoice are unaffected.
--
-- PRE-FLIGHT: step 3 fails if duplicate invoice numbers already exist. Check first:
--
--   SELECT "businessId", "invoiceNumber", count(*)
--   FROM "Booking" WHERE "invoiceNumber" IS NOT NULL
--   GROUP BY 1,2 HAVING count(*) > 1;
--
-- Zero rows means this migration applies cleanly. Non-zero rows means you must
-- resolve the duplicates deliberately — reassign or void the later invoices by
-- hand. DO NOT reach for `npm run prisma:wipe` to clear the error: that script
-- deletes every booking, customer, invoice, expense, income, message log and
-- audit log in the database. It exists to bootstrap an empty database, not to
-- satisfy a migration precondition. Once this database holds a single real
-- booking it must never be run against it again.
--
-- Prisma wraps each migration file in a transaction, so if the unique index does
-- fail, this whole file rolls back and the schema is left untouched.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "updatedBy" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_businessId_invoiceNumber_key" ON "Booking"("businessId", "invoiceNumber");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "Booking_businessId_invoiceNumber_idx";
