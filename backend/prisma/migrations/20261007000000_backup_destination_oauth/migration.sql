-- Personal-Google-account backup destination.
--
-- WHY THIS EXISTS
--
-- The service-account implementation is correct but has a hard limit discovered against the live
-- Drive API: a service account has no storage quota of its own. Google rejects an upload with
--
--   "Service Accounts do not have storage quota. Leverage shared drives, or use OAuth delegation."
--
-- It can create file metadata, so a naive check "can it create a file?" passes and the failure only
-- appears when real bytes are uploaded. A Shared Drive would fix this, but Shared Drives require a
-- paid Google Workspace org, which a small agency on a free Gmail cannot use.
--
-- So the destination can also be a normal Google account connected over OAuth, whose own Drive
-- quota applies. That works on a free consumer account.
--
-- SECURITY
--
-- The refresh token grants standing access to that entire Drive. It is stored encrypted, never in
-- plaintext, so a database leak does not hand over the operator's Google account.
--
-- Retained indefinitely: no pruning. An operator who wants lifetime archives gets lifetime
-- archives, and storage is bought as needed.

CREATE TYPE "BackupDestinationStatus" AS ENUM ('ACTIVE', 'BROKEN');

CREATE TABLE "BackupDestination" (
  "id"                     TEXT   NOT NULL,
  "kind"                   TEXT   NOT NULL,
  "accountEmail"           TEXT   NOT NULL,

  -- Encrypted refresh token for USER_OAUTH, as version.iv.authTag.ciphertext (base64url).
  -- Null for SERVICE_ACCOUNT, whose key lives in the environment.
  "refreshTokenCiphertext" TEXT,

  "folderId"               TEXT,
  "status"                 "BackupDestinationStatus" NOT NULL DEFAULT 'ACTIVE',

  "connectedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"             TIMESTAMP(3),
  "errorMessage"           TEXT,

  CONSTRAINT "BackupDestination_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackupDestination_kind_idx" ON "BackupDestination"("kind");
CREATE INDEX "BackupDestination_status_idx" ON "BackupDestination"("status");

-- One active destination per kind. Enforced by the database rather than by application code so
-- that two concurrent "connect" requests cannot leave two rows fighting over which credential the
-- scheduler should use. The older row is deactivated by the caller; this constraint is the
-- backstop that makes a second ACTIVE row impossible.
CREATE UNIQUE INDEX "BackupDestination_one_active_per_kind"
  ON "BackupDestination"("kind")
  WHERE "status" = 'ACTIVE';

-- A user-oauth destination is meaningless without an encrypted token, and a service account must
-- NOT have one (its key is in the environment; a token here would be a second, hidden credential).
ALTER TABLE "BackupDestination"
  ADD CONSTRAINT "chk_backup_destination_kind"
  CHECK ("kind" IN ('SERVICE_ACCOUNT', 'USER_OAUTH'));

ALTER TABLE "BackupDestination"
  ADD CONSTRAINT "chk_backup_destination_token_shape"
  CHECK (
    ("kind" = 'USER_OAUTH' AND "refreshTokenCiphertext" IS NOT NULL)
    OR ("kind" = 'SERVICE_ACCOUNT' AND "refreshTokenCiphertext" IS NULL)
  );

-- Refuse to store something that is plainly not ciphertext. The vault writes
-- version.iv.authTag.ciphertext; a value without four segments means a caller tried to write a
-- raw token, which would be the exact compromise this table exists to prevent.
ALTER TABLE "BackupDestination"
  ADD CONSTRAINT "chk_backup_destination_ciphertext_shape"
  CHECK (
    "refreshTokenCiphertext" IS NULL
    OR array_length(string_to_array("refreshTokenCiphertext", '.'), 1) = 4
  );