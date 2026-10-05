-- Platform-owner (SUPER_ADMIN) tenant controls, moved server-side from browser localStorage.
--
-- Tenant blocking, WhatsApp message ceilings and account metadata were previously stored in
-- localStorage under "fc_master_admin_accounts_v1". That meant the "block this tenant" control
-- only locked the browser that performed it, any user could edit it from DevTools, and five
-- fabricated tenants with realistic PII were seeded into every visitor's browser.
--
-- AuthService.issueSession already refuses to mint a session for a business whose status is not
-- ACTIVE, so `status` is now the real enforcement point; these columns record who/why/when.

-- Extend the enum with an explicit BLOCKED state rather than overloading SUSPENDED.
ALTER TYPE "BusinessStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';

ALTER TABLE "Business"
  ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "blockedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "blockedById" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappMonthlyLimit" INTEGER,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "plan" TEXT;

-- A blocked/suspended tenant must always carry the reason and the timestamp, so an auditor can
-- answer "who cut this customer off and when" without relying on application logs.
ALTER TABLE "Business"
  DROP CONSTRAINT IF EXISTS "chk_business_block_metadata",
  ADD CONSTRAINT "chk_business_block_metadata" CHECK (
    status = 'ACTIVE'
    OR ("blockedAt" IS NOT NULL AND "blockedReason" IS NOT NULL AND length(trim("blockedReason")) > 0)
  );

-- The ceiling can never be negative or absurdly large.
ALTER TABLE "Business"
  DROP CONSTRAINT IF EXISTS "chk_business_whatsapp_limit",
  ADD CONSTRAINT "chk_business_whatsapp_limit" CHECK (
    "whatsappMonthlyLimit" IS NULL OR ("whatsappMonthlyLimit" >= 0 AND "whatsappMonthlyLimit" <= 1000000)
  );

-- Index for the platform tenant list, which is ordered by most recently active.
CREATE INDEX IF NOT EXISTS "Business_status_idx" ON "Business"("status");