-- Financial integrity at the database layer.
--
-- Every monetary and rate column was previously unconstrained: DTO validation is application-level
-- only and is bypassed on several code paths (template status, direct service calls, imports).
-- Nothing stopped a negative amount, a tax rate above 100%, or a discount larger than the fare,
-- and those values flow straight into issued tax invoices and P&L exports.

DO $$
DECLARE
  violations text;
BEGIN
  -- Guard against shipping a constraint that fails on pre-existing bad data.
  -- If this raises, the bad rows must be corrected before the migration can be applied.
  SELECT string_agg(format('%s %s=%s', 'Booking', column_name, offending), E'\n')
  INTO violations
  FROM (
    SELECT 'amount' AS column_name, id, amount::text AS offending FROM "Booking" WHERE amount < 0
    UNION ALL SELECT 'baseFare', id, "baseFare"::text FROM "Booking" WHERE "baseFare" < 0
    UNION ALL SELECT 'cost', id, cost::text FROM "Booking" WHERE cost < 0
    UNION ALL SELECT 'discount', id, discount::text FROM "Booking" WHERE discount < 0
    UNION ALL SELECT 'paidAmount', id, "paidAmount"::text FROM "Booking" WHERE "paidAmount" < 0
    UNION ALL SELECT 'taxAmount', id, "taxAmount"::text FROM "Booking" WHERE "taxAmount" < 0
    UNION ALL SELECT 'taxRate', id, "taxRate"::text FROM "Booking" WHERE "taxRate" < 0 OR "taxRate" > 100
    UNION ALL SELECT 'amount', id, amount::text FROM "InvoiceItem" WHERE amount < 0 OR "unitPrice" < 0
    UNION ALL SELECT 'amount', id, amount::text FROM "Expense" WHERE amount < 0
    UNION ALL SELECT 'amount', id, amount::text FROM "Income" WHERE amount < 0
  ) AS bad;

  IF violations IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add money constraints, existing rows violate them:%', E'\n' || violations;
  END IF;
END $$;

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

ALTER TABLE "BusinessSetting"
  DROP CONSTRAINT IF EXISTS "chk_business_setting_gst_rate_range",
  ADD CONSTRAINT "chk_business_setting_gst_rate_range" CHECK ("gstRate" IS NULL OR ("gstRate" >= 0 AND "gstRate" <= 100));