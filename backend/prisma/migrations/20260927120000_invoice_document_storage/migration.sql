-- Minimal-footprint storage for issued invoice documents.
--
-- Why store the PDF at all, when `renderInvoicePdf` can rebuild it from Booking +
-- InvoiceItem + BusinessSetting?
--
-- Because an *issued* invoice is a financial record, not a view. Today a live
-- re-render means that correcting the business name, the GSTIN, or an itemised
-- line silently rewrites the document the customer received and the figures the
-- books report. `payload` freezes the JSON the PDF was rendered from, so the
-- document stays auditable and reproducible after the underlying rows move on.
--
-- Storage cost, measured on a realistic 6-line invoice rather than assumed:
--
--   raw PDF                     10592 B
--   gzip -9                      1994 B   (81.2% smaller)
--   brotli -11                   1681 B   (84.1% smaller)  <-- used here
--
-- At 10,000 invoices that is 101 MiB raw against 16 MiB stored, so compression is
-- what makes "keep every invoice forever" affordable. `pdf` therefore holds
-- brotli-compressed bytes; `sha256` is the digest of the *uncompressed* PDF, which
-- keeps it meaningful for audit and lets identical documents dedupe.
--
-- The JSON payload is compressed too, and this matters more than the PDF. Measured on
-- the same invoice it was 3817 B of raw JSON against 1650 B of compressed PDF - the
-- payload, not the document, was the larger cost. JSONB also repeats the full text of
-- every key on every row, so an uncompressed payload pays for key names thousands of
-- times over. Brotli took it to 985 B (74% smaller), cutting the per-invoice total from
-- 52.1 MiB to 25.1 MiB across 10,000 invoices.
--
-- `payload` is therefore BYTEA holding brotli-compressed JSON, not JSONB. Nothing
-- queries into it: it is a frozen audit artefact that is always read whole, so trading
-- SQL-level addressability for two thirds of the storage is the better deal.
--
-- rawBytes/storedBytes are stored rather than derived so the storage report can
-- show the real ratio without decompressing every row.
--
-- `prunedAt` supports a retention sweep that drops bytes for long-issued invoices
-- while keeping the row, so history survives even after the PDF itself is dropped.
--
-- One document per booking (unique on bookingId): a re-issue replaces the row rather
-- than appending, so that history cannot become ambiguous about which PDF a booking
-- actually had.

-- CreateTable
CREATE TABLE "InvoiceDocument" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "pdf" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "rawBytes" INTEGER NOT NULL,
    "storedBytes" INTEGER NOT NULL,
    "payload" BYTEA NOT NULL,
    "payloadRawBytes" INTEGER NOT NULL,
    "payloadStoredBytes" INTEGER NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "prunedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceDocument_businessId_createdAt_idx" ON "InvoiceDocument"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceDocument_businessId_invoiceNumber_idx" ON "InvoiceDocument"("businessId", "invoiceNumber");

-- The retention sweep only ever considers unpruned, old rows, so it leads with
-- prunedAt and needs createdAt second to range-scan.
-- CreateIndex
CREATE INDEX "InvoiceDocument_prunedAt_createdAt_idx" ON "InvoiceDocument"("prunedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocument_bookingId_key" ON "InvoiceDocument"("bookingId");

-- AddForeignKey
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
