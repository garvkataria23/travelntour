# HANDOFF — FlyConnect backup system

State of work for anyone picking this up. Read this first, then
[README.md](README.md) for the operational runbook.

**Status: written and unit-tested, but NOT deployed. No backup has ever run.**

---

## 1. What exists and where

Repo: `D:\Documents\travel` (git repo, remote `garvkataria23/travelntour`,
branch `master`). Files created on the local Windows machine only:

| Path | Lines | Purpose |
|---|---|---|
| `backup/backup.sh` | 245 | Dump, validate, upload to Drive then MEGA, prune, alert |
| `backup/restore-drill.sh` | 200 | Monthly restore verification into a throwaway DB |
| `backup/rclone.conf.example` | 82 | Template for the 4 required rclone remotes |
| `backup/README.md` | 216 | Setup, cron, restore runbook, known issues |
| `.gitignore` | modified | +9 lines blocking `rclone.conf`, `sa.json`, dumps |
| `.gitattributes` | 5 | Pins `*.sh` to LF (see "Why .gitattributes exists") |

Nothing else in the repo was modified. No application code, no
`docker-compose.yml`, no `schema.prisma`.

## 2. Git state — nothing committed

```
 M .gitignore          (modified, unstaged)
 M .gitattributes      (new, unstaged)
 ?? backup/            (new, untracked)
```

Plus 11 pre-existing modified app files and several untracked dirs that
**predate this work** — do not stage them.

To commit only the backup work:

```bash
cd D:\Documents\travel
git add backup/ .gitignore .gitattributes
git commit -m "feat: encrypted PostgreSQL backup to Drive (primary) + MEGA (fallback)"
git push
```

## 3. Why this design

The user's original question was about reusing the MEGA + Google Drive setup
from a *different* project, `D:\Desktop\vaultx` (a Flutter note-taking app).
That turned out to be almost entirely non-transferable, and the following
findings reshaped the plan completely:

- **VaultX's MEGA integration is dead weight here.** It is Android-native —
  a 237 MB `libmega.so` for `arm64-v8a` only, driven from Kotlin over a
  Dart `MethodChannel`. There is no server-side component to port.
- **VaultX's Google integration is also the wrong shape.** It uses the
  `google_sign_in` mobile plugin and the `drive.appdata` scope. On a server
  with no browser and no user present, the correct pattern is a **service
  account**, which this design uses.
- **Only the *concepts* transferred**: encryption before upload, per-item
  checksums, retention pruning, and a primary/fallback chain. None of the code.

What actually needs backing up turned out to be tiny:

- **Redis is deliberately NOT backed up.** It is a pure BullMQ queue.
  `backend/src/whatsapp/automation-recovery.worker.ts:8-13` documents that it
  rebuilds from the `ScheduledMessage` Postgres table within 45 seconds.
- **No file storage exists at all.** PDFs are generated in memory per request
  (`backend/src/invoices/invoice-pdf.util.ts:226`); `backend/src` never
  imports `fs`. There is no S3, no GCS, no multer, no upload endpoint.
  Invoices are a pure function of `Booking` + `InvoiceItem` +
  `BusinessSetting`, so restoring the database restores every PDF.
- **Consequence: the whole backup is one `pg_dump`.**

### Why rclone instead of Node code

`rclone` already provides both providers, encryption (`crypt` remotes),
resumable upload, and integrity checking. Using it means **zero changes to the
NestJS backend**, so there is no risk to the running app, and no upload logic to
maintain. The rejected alternative was `googleapis` + `megajs` + custom crypto
in a NestJS service.

### Why the backup runs on the host, not in the app

Via host cron, not `@nestjs/schedule`. A backup must not depend on the thing it
protects — if `flyconnect-api` is crash-looping, backups must still run.

### Primary / fallback choice

**Google Drive primary, MEGA fallback.** Drive has the better-maintained
official tooling and service-account auth needs no user interaction. MEGA is
the fallback specifically because it is a *different vendor* — a fallback
sharing a failure domain with the primary protects against nothing.

### 6-hourly, not daily

The database is small (single tenant, hundreds to low-thousands of rows per
`backend/prisma/seed.ts`). Four full dumps a day cost almost nothing and cut
worst-case data loss from 24h to 6h. WAL/PITR was considered and rejected as
over-engineering for this data volume.

## 4. Two real bugs found during testing

Both were found by the test suites, not by inspection, and both are fixed.
Do not "simplify" these away:

1. **`mark_success` aborted the run on an unwritable log file.** It wrote to
   `LOG_FILE` with no writability guard, while `log()` had one. Under
   `set -euo pipefail` this killed the script *after* a successful upload —
   reporting a false failure and skipping the staleness check. Fixed by routing
   both through `log_append()`, which swallows logging errors deliberately:
   a run must be judged on whether the dump uploaded, not on whether a file
   accepted a write.

2. **The drill produced a confusing cascading error on a missing dump.** Bash
   applies redirections left to right, so `< "$WORK/$dump"` failed before
   `2> restore.err` was ever established, leaving no error file to read. Fixed
   with an explicit `[[ -s ... ]]` check immediately after download.

A third issue was caught by reasoning, not testing: an early comment claimed
rclone's `crypt` layer breaks `--include` filtering. **That is false** — rclone
decrypts filenames when you operate *through* a crypt remote, so filters match
logical names. The comment was corrected and retention now uses `--include`
(keeping the safer behaviour).

## 5. Why .gitattributes exists

`core.autocrlf` is `true` on this machine and there was no `.gitattributes`. A
CRLF checkout would break the scripts on the Linux VM with
`\r: command not found`. `.gitattributes` pins `*.sh` and the rclone config to
LF. Verified with `git check-attr`.

## 6. Testing performed

16 integration tests using mock `docker` and `rclone` binaries on `PATH`, with
`LOCAL_DIR`/`LOG_FILE`/`LOCK_FILE` redirected to temp dirs. Throwaway harness,
already deleted. `bash -n` clean on both scripts; no shellcheck available in
this environment.

`backup.sh` covered: primary success; primary failure → fallback used; both
providers fail → rc=1 **and local dump preserved**; `pg_dump` failure →
nothing uploaded; corrupt archive TOC → refused before upload; implausibly
small dump → refused; both retention ladders pruned; concurrent run skipped via
`flock`.

`restore-drill.sh` covered: `--list`; refuses when `DRILL_DB == PG_DB`;
rejects a non-`.dump` filename; full happy path with sha256 verification and
`_prisma_migrations` check; row-count mismatch fails.

**Not tested, and this is the gap:** real `rclone`, real PostgreSQL, and real
cloud credentials were unavailable. The upload path and actual `pg_restore`
behaviour are unverified. This is why `README.md` gates cron behind a passing
first drill.

## 7. Next steps, in order

Steps 0 and 1 are independent of the backup and can be done immediately.

### Step 0 — Rotate leaked Meta credentials (do this first, unrelated to backup)

`META-WHATSAPP-API-KIT/META-ACCOUNT-SUMMARY.md` is **tracked in git** and
contains live secrets in plaintext:
`META_APP_SECRET` and `META_CREDENTIAL_ENCRYPTION_KEY`. The root `.gitignore`
excludes `.env` but not this `.md`. Rotate both in the Meta dashboard, then
rewrite history. The app reads tokens from the environment at runtime
(`backend/src/whatsapp/whatsapp.service.ts`), so this needs no redeploy beyond
updating `backend/.env`.

### Step 1 — Commit

As in section 2. Safe to do now; it touches nothing pre-existing.

### Step 2 — Configure rclone on the Oracle VM (129.159.16.165)

```bash
curl https://rclone.org/install.sh | sudo bash
```

- **MEGA:** sign in through the browser once first. rclone cannot bootstrap the
  account's encryption keys; without this the login fails. Enable 2FA and set a
  recovery email.
- **Google:** enable the Drive API, create a service account, download the JSON
  key, `sudo install -m 600 sa.json /etc/flyconnect/sa.json`, then share a Drive
  folder with the service account's `client_email` as Editor.
- `sudo rclone config` using `backup/rclone.conf.example` as the reference.
  Then `sudo rclone config password` to encrypt the config file itself.

> **The crypt passwords cannot be rotated.** rclone derives its key from them
> directly; changing them makes every existing backup permanently unreadable
> rather than migrating it. Recovery means re-uploading from a source that still
> exists. Store them in 1Password/Bitwarden, not only on the VM. Never put
> `rclone.conf` in a cloud backup — it holds the keys to everything else.

Verify: `rclone lsd gdrive-crypt:flyconnect-backups` and
`rclone lsd mega-crypt:flyconnect-backups`.

### Step 3 — Deploy and take one backup

```bash
sudo install -d -m 755 /opt/flyconnect/backup
sudo install -m 755 backup/backup.sh        /opt/flyconnect/backup/
sudo install -m 755 backup/restore-drill.sh /opt/flyconnect/backup/
sudo install -d -m 700 /etc/flyconnect
sudo install -d -m 750 /var/backups/flyconnect

sudo /opt/flyconnect/backup/backup.sh
```

### Step 4 — GATE: prove it restores before scheduling anything

```bash
sudo /opt/flyconnect/backup/restore-drill.sh
```

Must print `PASS`. **Do not enable cron until this passes.** This is the whole
point of the exercise — a backup that has never been restored is not a backup.

### Step 5 — Schedule

```cron
0 */6 * * * /opt/flyconnect/backup/backup.sh >> /var/log/flyconnect-backup.log 2>&1
40 3 1 * * /opt/flyconnect/backup/restore-drill.sh >> /var/log/flyconnect-backup.log 2>&1
```

The drill is offset to 03:40 to avoid colliding with the 03:00 backup tick.

### Step 6 — `backend/.env` into a password manager

Deliberately not handled by the scripts. It holds the DB URL, JWT secrets, and
a live WhatsApp token. Without it a lost VM cannot reconnect to anything.
Keep it out of the cloud backup, or one compromised provider account yields
both the data and the keys to it.

Also: `META-WHATSAPP-API-KIT/` is dead weight from an unrelated project
(Solastio). Nothing in `backend/src` imports it — exclude it from any source
backup.

## 8. Open items not caused by this work

- `docker-compose.yml` hardcodes `POSTGRES_PASSWORD: flyconnect` and is
  tracked. Verify port 5432 is not publicly exposed.
- `backend/package.json` defines a `lint` script but `eslint` is not in
  `devDependencies` and no eslint config file exists, so `npm run lint` fails.
- No CI/CD exists; deploys are manual `docker compose up -d --build` on the VM.
- 11 modified app files and untracked dirs (`app/currency/`,
  `backend/src/currency/`, `desktop/`, `backend/prisma/wipe-data.ts`, …) were
  already pending before this work began.

## 9. If visa/passport scans are added later

Store them in **GridFS** (inside Postgres), not S3 or local disk. GridFS keeps
the entire backup a single `pg_dump` with no file/database consistency problem.
An external object store would require a second `rclone sync` and a
reconciliation story.

Adding real passport/DOB/address data also changes the sensitivity class of
these backups from moderate to high. At that point: restrict the Drive folder
to the service account, and confirm the MEGA account has 2FA plus a recovery
email — losing that account loses the fallback copies with it.
