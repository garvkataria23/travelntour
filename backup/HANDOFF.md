# HANDOFF — FlyConnect backup system

State of work for anyone picking this up. Read this first, then
[README.md](README.md) for the operational runbook.

**Status: deployed to the VM and the local pipeline is proven. No backup has
ever reached the cloud — both provider credentials are still missing.**

Verified on the VM against real PostgreSQL 16.15: dump, archive-TOC
validation, sha256, and a full restore drill into a throwaway database
(16/16 tables matching, `_prisma_migrations` intact, PASS). Running that drill
is what surfaced the two bugs in section 4b — the scripts had never been run
against a real database before.

---

## 1. What exists and where

Repo: `D:\Documents\travel` (git repo, remote `garvkataria23/travelntour`,
branch `master` — the GitHub default branch is `master`, there is no `main`).
Files created by this work, now committed, pushed, and installed on the VM at
`/opt/flyconnect/backup/`:

| Path | Lines | Purpose |
|---|---|---|
| `backup/backup.sh` | 245 | Dump, validate, upload to Drive then MEGA, prune, alert |
| `backup/restore-drill.sh` | 209 | Monthly restore verification into a throwaway DB |
| `backup/rclone.conf.example` | 88 | Template for the 4 required rclone remotes |
| `backup/README.md` | 247 | Setup, cron, restore runbook, known issues |
| `.gitignore` | modified | +9 lines blocking `rclone.conf`, `sa.json`, dumps |
| `.gitattributes` | 5 | Pins `*.sh` to LF (see "Why .gitattributes exists") |

Beyond the backup system itself, the work also touched
`backend/prisma/wipe-data.ts`, `backend/package.json`, the
`20260926190000_concurrency_invariants` migration comment, and the WhatsApp
demo backdoor — all pushed. Electron binaries and the unrelated
`META-WHATSAPP-API-KIT/` tree were deliberately left untracked/untouched.

## 2. Git state — all pushed

Ten commits on `master`, ending at `5f0e340` (plus `5791801` for the wipe
hardening). `origin/master` is up to date. Electron build output in
`release/`, `dist/` and `out/` is ignored — source only, per your instruction.
Only one item from this work is still outstanding, and it is not a commit:
the cloud credentials in step 2.

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

## 4b. Two more bugs, found only by running the drill for real

The original test suite used mock `docker` and `rclone` binaries, so it never
exercised the real `pg_restore`. Running the drill against the live database
found two defects that made the safety gate worse than useless:

1. **The drill failed on 100% of dumps.** `pg_restore` was invoked with
   `--if-exists` but without `--clean`, which `pg_restore` rejects outright:
   `option --if-exists requires option -c/--clean`. The README gates cron
   behind a passing drill, so that gate could never have been satisfied — the
   honest conclusion would have been "the backup is broken", when in fact the
   drill was. `--if-exists` is also meaningless here: the scratch database is
   dropped and recreated immediately beforehand.

2. **The drill compared 1 of 16 tables and still printed PASS.** The `psql`
   helpers passed `docker exec -i`, while every query is supplied via `-c` and
   so never reads stdin. Inside `emit_counts`' `while read` loop the here-string
   *is* the loop's stdin, so the first inner `docker exec -i` swallowed the
   remaining table names. The loop ran exactly once. A drill that cannot detect
   a truncated restore is worse than no drill, because it manufactures false
   confidence — this is the failure mode the whole exercise exists to prevent.

Both are fixed. Dropping `-i` from the three helpers is the fix for the second;
the `pg_restore` call keeps `-i` because that one genuinely streams the archive
on stdin. Post-fix drill output:

```
DRILL INFO sha256 verified
DRILL INFO production has 16 tables
DRILL INFO all 16 tables match production exactly
DRILL INFO _prisma_migrations present (6 rows)
DRILL INFO PASS
```

**The general lesson:** the mock-based suite passed 16/16 while the script was
guaranteed to fail in production. Anything that asserts on a real external
binary's behaviour has to be run against that binary at least once.

## 5. Why .gitattributes exists

`core.autocrlf` is `true` on this machine and there was no `.gitattributes`. A
CRLF checkout would break the scripts on the Linux VM with
`\r: command not found`. `.gitattributes` pins `*.sh` and the rclone config to
LF. Verified with `git check-attr`.

## 6. Testing performed

**Mock-based suite (original).** 16 integration tests using mock `docker` and
`rclone` binaries on `PATH`, with `LOCAL_DIR`/`LOG_FILE`/`LOCK_FILE` redirected
to temp dirs. Throwaway harness, already deleted. `bash -n` clean on both
scripts; no shellcheck available in this environment.

`backup.sh` covered: primary success; primary failure → fallback used; both
providers fail → rc=1 **and local dump preserved**; `pg_dump` failure →
nothing uploaded; corrupt archive TOC → refused before upload; implausibly
small dump → refused; both retention ladders pruned; concurrent run skipped via
`flock`.

`restore-drill.sh` covered: `--list`; refuses when `DRILL_DB == PG_DB`;
rejects a non-`.dump` filename; full happy path with sha256 verification and
`_prisma_migrations` check; row-count mismatch fails.

**Against the real thing (added later).** The mock suite passed 16/16 while the
drill was guaranteed to fail — see section 4b. So the scripts were then run on
the VM against real PostgreSQL 16.15 with rclone v1.75.1:

- `backup.sh` end to end: dump 61 082 B, TOC validated, sha256 written, both
  provider uploads attempted, both failed (no credentials yet), **local dump
  retained**, rc=1. The retention-on-failure invariant holds against a real
  `docker exec`.
- `restore-drill.sh` end to end via rclone's local backend
  (`REMOTE=/var/backups/flyconnect`), which exercises everything except cloud
  transfer: sha256 verified, 16 tables enumerated, scratch DB created, restored,
  all 16 row counts matching, `_prisma_migrations` present, PASS, rc=0.
- Production confirmed untouched afterwards: `Booking=1 Customer=1 migrations=6`,
  scratch database dropped.
- Installed files byte-identical to the repo, confirmed by SHA-256 rather than
  size: `backup.sh` `5f5edbfa…`, `restore-drill.sh` `ed104592…`, both CR=0.

**Still not tested, and this remains the gap:** the actual cloud upload and
download. No real credential has ever been used, so the `crypt` round-trip
through Drive and MEGA, the resumable-upload path, and the prune against a real
remote are all unexercised. This is exactly why `README.md` gates cron behind a
passing first drill *from the remote*.

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

### Step 1 — ~~Commit~~ DONE

Committed and pushed. Ten commits on `master`; the VM copies are SHA-256
identical to the repo.

### Step 2 — Configure rclone on the Oracle VM (129.159.16.165)

**Partly done.** Already in place:

- `rclone` v1.75.1 installed (the apt repo's GPG key URL 404s — use
  `curl https://rclone.org/install.sh | sudo bash`)
- `/opt/flyconnect/backup/{backup.sh,restore-drill.sh}` installed, mode 755, CR=0
- `/etc/flyconnect/rclone.conf` mode 600, all four remotes parse
- `/etc/flyconnect/backup.env` mode 640
- `/root/.config/rclone/rclone.conf` → symlink to the above, so `rclone` finds it
  with no arguments. This is deliberate: `backup.sh` *sources* `backup.env`, and
  a plain `source` does not `export`, so an `RCLONE_CONFIG` line there would
  never reach rclone. One source of truth, no per-invocation flags.
- Crypt keys generated **on the VM** and written to
  `/root/flyconnect-crypt-keys.txt` (mode 600). They were never printed to a
  terminal or a chat log, deliberately: plaintext keys in a transcript are
  permanently there, and these cannot be rotated.

**Still missing, and only the operator can do these:**

- **Move the crypt keys into 1Password/Bitwarden, then
  `sudo shred -u /root/flyconnect-crypt-keys.txt`.** This is the single most
  urgent item in this document. Until it happens there is exactly one copy of
  the keys, on a disk that could be lost with the VM.
- **Then** `sudo rclone config password`, and store *that* password in the same
  note before shredding anything else. The order is: keys → config password →
  shred. Encrypting the config first leaves the keys recoverable from nowhere.
- **MEGA:** sign in through the browser once first. rclone cannot bootstrap the
  account's encryption keys; without this the login fails. Enable 2FA and set a
  recovery email. Then fill `[mega] user` and `pass` in `rclone.conf` —
  `pass` is currently an obscured *placeholder*.
- **Google:** enable the Drive API, create a service account, download the JSON
  key, `sudo install -m 600 sa.json /etc/flyconnect/sa.json`, then share a Drive
  folder with the service account's `client_email` as Editor.

### Verifying the credentials — functionally, not by text

`rclone config show` and `grep` are **useless** for this. The values are
`rclone obscure`d, so a placeholder and a real credential are indistinguishable,
and grepping for the placeholder text finds nothing because it was obscured on
the way in. My own verification script made exactly this mistake and reported a
placeholder as "set".

The only trustworthy check is to make rclone authenticate:

```bash
sudo rclone lsd gdrive-crypt:flyconnect-backups
sudo rclone lsd mega-crypt:flyconnect-backups
```

**Both must succeed before continuing.** A Drive primary with an unverified
MEGA fallback means discovering at the worst possible moment that there is no
fallback.

### Step 3 — Deploy and take one backup

Scripts are deployed. Once credentials verify:

```bash
sudo /opt/flyconnect/backup/backup.sh
```

Expect `uploaded via primary` and a clean local staging directory.

### Step 4 — GATE: prove it restores before scheduling anything

```bash
sudo /opt/flyconnect/backup/restore-drill.sh
```

Must print `PASS`. **Do not enable cron until this passes, and run it against
the real remote** — the drill already passes against a local directory, so a
local PASS does not satisfy this gate. It has to prove the bytes survived the
`crypt` round trip through a real provider.

### Step 5 — Schedule

```cron
0 */6 * * * /opt/flyconnect/backup/backup.sh >> /var/log/flyconnect-backup.log 2>&1
40 3 1 * * /opt/flyconnect/backup/restore-drill.sh >> /var/log/flyconnect-backup.log 2>&1
```

The drill is offset to 03:40 to avoid colliding with the 03:00 backup tick.

**Use `sudo crontab -e` and nothing else.** `rclone.conf` is mode 600 under
`/etc`, reachable only via a symlink in `/root/.config/rclone/`. A job in
`/etc/cron.d/` or another user's crontab cannot read it, so every run fails to
authenticate — and the retention prune fails too, so the remote grows forever
while the log looks unremarkable.

### Step 6 — `backend/.env` into a password manager

Deliberately not handled by the scripts. It holds the DB URL, JWT secrets, and
a live WhatsApp token. Without it a lost VM cannot reconnect to anything.
Keep it out of the cloud backup, or one compromised provider account yields
both the data and the keys to it.

Also: `META-WHATSAPP-API-KIT/` is dead weight from an unrelated project
(Solastio). Nothing in `backend/src` imports it — exclude it from any source
backup.

## 8. Open items not caused by this work

- **RESOLVED — port 5432 is not exposed.** UFW is active with `default deny
  incoming` and only 22/80/443 allowed; an external probe confirms 4000, 5432
  and 6379 are all unreachable despite being published on `0.0.0.0`. Redis still
  has no password, so this remains a single-firewall-deep defence.
- **The `sslip.io` static-export frontend is a dead end — use Vercel.**
  `https://129.159.16.165.sslip.io/` currently returns **404**: nginx proxies
  `/api/` to `127.0.0.1:4000` correctly, but serves static files from
  `/opt/travelntour/out`, and that directory does not exist because
  `output: 'export'` is set nowhere in the repo and `npm run build` is plain
  `next build`, which does not produce `out/`. `static-serve.mjs` is not running
  and has no service unit. The live frontend is Vercel
  (`https://travel-omega-ashy.vercel.app`, HTTP 200), reaching the API through
  `sslip.io/api`, which is cross-origin.
  This matters for `middleware.ts` and the `next.config.js` `headers()` block:
  **Next.js middleware cannot run under `output: 'export'`** — it needs a server
  runtime, and a per-request CSP nonce cannot be generated at build time. On
  Vercel both work natively. So do not "fix" `out/`; deploy to Vercel and treat
  `out/`, `static-serve.mjs` and the sslip.io nginx vhost as removable. The
  security headers would have to move into nginx if static export were ever
  revived, because `next.config.js` `headers()` is ignored without a server.
- `FRONTEND_URL` on the VM is set to both origins
  (`https://129.159.16.165.sslip.io,https://travel-omega-ashy.vercel.app`), so
  the `origin: true` fallback in `backend/src/main.ts:14` is **not** active. If
  that variable is ever unset, the API accepts credentialed requests from any
  origin — worth a guard rather than relying on the env file.
- `docker-compose.yml`: the compose **service** name is `backend`;
  `flyconnect-api` is the container name. `docker compose restart flyconnect-api`
  fails — use `docker compose restart backend`.
- `backend/package.json` defines a `lint` script but `eslint` is not in
  `devDependencies` and no eslint config file exists, so `npm run lint` fails.
- No CI/CD exists; deploys are manual `docker compose up -d --build` on the VM.
- Two migrations are committed but **not yet applied** on the VM
  (`20260926170000_base_currency_aed`, `20260926190000_concurrency_invariants`).
  The unique index in the second one needs a pre-flight duplicate check; verified
  zero duplicates on the live database, and Prisma wraps each migration file in a
  transaction, so a failure would roll the file back rather than half-migrate.

## 9. If visa/passport scans are added later

Store them in **GridFS** (inside Postgres), not S3 or local disk. GridFS keeps
the entire backup a single `pg_dump` with no file/database consistency problem.
An external object store would require a second `rclone sync` and a
reconciliation story.

Adding real passport/DOB/address data also changes the sensitivity class of
these backups from moderate to high. At that point: restrict the Drive folder
to the service account, and confirm the MEGA account has 2FA plus a recovery
email — losing that account loses the fallback copies with it.
