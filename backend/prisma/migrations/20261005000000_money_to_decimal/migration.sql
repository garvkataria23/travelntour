-- Money columns: double precision -> exact fixed-point NUMERIC.
--
-- `Float` in Prisma maps to Postgres `double precision`, which is a binary floating-point type and
-- therefore cannot represent 0.1. Any arithmetic on stored money accumulated error, and these
-- columns back GST invoices and a P&L that is exported to an accountant.
--
-- NUMERIC(18,2) stores exact decimal values. Reads are converted back to plain JSON numbers by the
-- response interceptor (src/common/decimal-json.ts), so the HTTP API contract is unchanged: money
-- was a JSON number before and still is.
--
-- Casting float8 -> numeric is exact (Postgres goes through the shortest round-trippable decimal
-- representation), so existing values are preserved without loss relative to what the application
-- was actually able to store.

-- BusinessSetting.gstRate — a percentage, so 4 decimal places.
ALTER TABLE "BusinessSetting"
  ALTER COLUMN "gstRate" TYPE DECIMAL(18, 4) USING "gstRate"::DECIMAL(18, 4);
ALTER TABLE "BusinessSetting"
  DROP CONSTRAINT IF EXISTS "chk_business_setting_gst_rate_range",
  ADD CONSTRAINT "chk_business_setting_gst_rate_range" CHECK ("gstRate" IS NULL OR ("gstRate" >= 0 AND "gstRate" <= 100));

-- Booking — money columns at 2dp, the rate at 4dp.
ALTER TABLE "Booking"
  ALTER COLUMN "amount"     TYPE DECIMAL(18, 2) USING "amount"::DECIMAL(18, 2),
  ALTER COLUMN "baseFare"   TYPE DECIMAL(18, 2) USING "baseFare"::DECIMAL(18, 2),
  ALTER COLUMN "cost"       TYPE DECIMAL(18, 2) USING "cost"::DECIMAL(18, 2),
  ALTER COLUMN "discount"   TYPE DECIMAL(18, 2) USING "discount"::DECIMAL(18, 2),
  ALTER COLUMN "taxRate"    TYPE DECIMAL(9, 4)  USING "taxRate"::DECIMAL(9, 4),
  ALTER COLUMN "taxAmount"  TYPE DECIMAL(18, 2) USING "taxAmount"::DECIMAL(18, 2),
  ALTER COLUMN "paidAmount" TYPE DECIMAL(18, 2) USING "paidAmount"::DECIMAL(18, 2);

-- InvoiceItem — quantity keeps 4dp so fractional units (nights, seats, hours) stay exact.
ALTER TABLE "InvoiceItem"
  ALTER COLUMN "quantity"  TYPE DECIMAL(18, 4) USING "quantity"::DECIMAL(18, 4),
  ALTER COLUMN "unitPrice" TYPE DECIMAL(18, 2) USING "unitPrice"::DECIMAL(18, 2),
  ALTER COLUMN "amount"    TYPE DECIMAL(18, 2) USING "amount"::DECIMAL(18, 2);

ALTER TABLE "Expense"
  ALTER COLUMN "amount" TYPE DECIMAL(18, 2) USING "amount"::DECIMAL(18, 2);

ALTER TABLE "Income"
  ALTER COLUMN "amount" TYPE DECIMAL(18, 2) USING "amount"::DECIMAL(18, 2);

-- The non-negative guards from the previous migration must survive the type change, and must now
-- apply to exact values rather than to floats.
ALTER TABLE "Booking"
  DROP CONSTRAINT IF EXISTS "chk_booking_amount_non_negative",
  ADD CONSTRAINT "chk_booking_amount_non_negative" CHECK ("amount" IS NULL OR "amount" >= 0),
  DROP CONSTRAINT IF EXISTS "chk_booking_base_fare_non_negative",
  ADD CONSTRAINT "chk_booking_base_fare_non_negative" CHECK ("baseFare" IS NULL OR "baseFare" >= 0),
  DROP CONSTRAINT IF EXISTS "chk_booking_cost_non_negative",
  ADD CONSTRAINT "chk_booking_cost_non_negative" CHECK (cost IS NULL OR cost >= 0),
  DROP CONSTRAINT IF EXISTS "chk_booking_discount_non_negative",
  ADD CONSTRAINT "chk_booking_discount_non_negative" CHECK (discount IS NULL OR discount >= 0),
  DROP CONSTRAINT IF EXISTS "chk_booking_paid_non_negative",
  ADD CONSTRAINT "chk_booking_paid_non_negative" CHECK ("paidAmount" IS NULL OR "paidAmount" >= 0),
  DROP CONSTRAINT IF EXISTS "chk_booking_tax_amount_non_negative",
  ADD CONSTRAINT "chk_booking_tax_amount_non_negative" CHECK ("taxAmount" IS NULL OR "taxAmount" >= 0),
  DROP CONSTRAINT IF EXISTS "chk_booking_tax_rate_range",
  ADD CONSTRAINT "chk_booking_tax_rate_range" CHECK ("taxRate" IS NULL OR ("taxRate" >= 0 AND "taxRate" <= 100));

ALTER TABLE "InvoiceItem"
  DROP CONSTRAINT IF EXISTS "chk_invoice_item_amount_non_negative",
  ADD CONSTRAINT "chk_invoice_item_amount_non_negative" CHECK (amount >= 0 AND "unitPrice" >= 0 AND quantity >= 0);

ALTER TABLE "Expense"
  DROP CONSTRAINT IF EXISTS "chk_expense_amount_non_negative",
  ADD CONSTRAINT "chk_expense_amount_non_negative" CHECK (amount >= 0);

ALTER TABLE "Income"
  DROP CONSTRAINT IF EXISTS "chk_income_amount_non_negative",
  ADD CONSTRAINT "chk_income_amount_non_negative" CHECK (amount >= 0);

ANALYZE "Booking";
ANALYZE "InvoiceItem";
ANALYZE "Expense";
ANALYZE "Income";