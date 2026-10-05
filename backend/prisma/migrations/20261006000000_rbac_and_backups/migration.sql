-- Role-based access control and server-side backup bookkeeping.
--
-- 1. A MANAGER tier, so "can create expenses" stops being an all-or-nothing admin flag. Previously
--    the only distinction was ADMIN vs STAFF, and because expenses/income creation and customer
--    deletion had no gate at all, every STAFF could write financial rows and hard-delete customers.
--
-- 2. BackupRun. Backups used to exist only as a JSON blob streamed to the browser and discarded,
--    or as a file uploaded from a user's personal Google Drive. There was no server-side record of
--    whether a backup ever succeeded, no scheduler, and nothing to restore from.

-- MANAGER sits between ADMIN and STAFF: runs day-to-day operations, cannot touch money,
-- settings, users, or platform state.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';

CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TYPE "BackupTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'PRE_RESTORE');

CREATE TABLE "BackupRun" (
  "id"               TEXT            NOT NULL,
  "businessId"       TEXT,
  "trigger"          "BackupTrigger" NOT NULL DEFAULT 'MANUAL',
  "status"           "BackupStatus"  NOT NULL DEFAULT 'PENDING',

  -- Format of the stored artefact.
  "format"           TEXT            NOT NULL DEFAULT 'json',
  "fileName"         TEXT,
  -- Google Drive file id. Null when the run failed or Drive is not configured.
  "driveFileId"      TEXT,
  "driveWebViewLink" TEXT,
  "sizeBytes"        BIGINT,
  "sha256"           TEXT,

  -- What the archive actually contained, so an operator can tell a complete backup from a
  -- partial one without opening it.
  "recordCounts"     JSONB,

  "startedAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"       TIMESTAMP(3),
  "errorMessage"     TEXT,
  "triggeredById"    TEXT,

  CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackupRun_businessId_idx" ON "BackupRun"("businessId");
CREATE INDEX "BackupRun_status_idx" ON "BackupRun"("status");
CREATE INDEX "BackupRun_startedAt_idx" ON "BackupRun"("startedAt");

ALTER TABLE "BackupRun"
  ADD CONSTRAINT "BackupRun_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackupRun"
  ADD CONSTRAINT "BackupRun_triggeredById_fkey"
  FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A successful run must say where the artefact landed and when it finished, otherwise the history
-- is decorative and cannot be used to answer "do we have a usable backup from last Tuesday?".
ALTER TABLE "BackupRun"
  DROP CONSTRAINT IF EXISTS "chk_backup_run_completeness",
  ADD CONSTRAINT "chk_backup_run_completeness" CHECK (
    status <> 'SUCCEEDED'
    OR ("finishedAt" IS NOT NULL AND "driveFileId" IS NOT NULL AND "sizeBytes" IS NOT NULL)
  );