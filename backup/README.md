# FlyConnect — Database Backup

Encrypted offsite backup of the FlyConnect PostgreSQL database, to Google Drive
(primary) with MEGA as fallback.

## What is and is not backed up

| Data | Backed up? | Why |
|---|---|---|
| PostgreSQL (`flyconnect`) | **Yes** | The only real data store. `pg_dump -Fc`, full database. |
| `backend/.env` | Separately, manually | Highest-value artefact. See [`.env`](#backing-up-backendenv). Not written by these scripts. |
| Redis | **No — deliberately** | Pure BullMQ queue. `ScheduledMessage` rows in Postgres are the source of truth, and `backend/src/whatsapp/automation-recovery.worker.ts` rebuilds the queue within 45s of a restart. |
| PDF files | **No — nothing to back up** | PDFs are generated in memory per request (`backend/src/invoices/invoice-pdf.util.ts`). They are a pure function of `Booking` + `InvoiceItem` + `BusinessSetting`, so restoring the database restores every invoice. There is no file store. |
| Source code | Not handled here | Already in git. Note `META-WHATSAPP-API-KIT/META-ACCOUNT-SUMMARY.md` is tracked and contains live Meta credentials — see [Known issues](#known-issues). |

If visa/passport scans are ever added, store them **in GridFS** (inside Postgres)
rather than S3 or local disk. GridFS keeps the entire backup a single
`pg_dump`; an external file store would need a second sync and introduces
file/database consistency problems.

## How it works

```
pg_dump -Fc  →  validate TOC  →  sha256 sidecar
     ↓
Google Drive (primary)  ──fails──▶  MEGA (fallback)
     ↓                                    ↓
encrypt + upload via rclone crypt     (same)
     ↓
prune per-provider retention ladders
```

Runs on the **host** via cron, not inside the app container. A backup must not
depend on the thing it is protecting: if `flyconnect-api` is crash-looping,
backups still run.

Design guarantees:

1. A corrupt dump never reaches the cloud — the archive TOC is parsed before upload.
2. If both providers fail, the local dump is **kept** and an alert fires. Nothing
   is deleted on a failed run.
3. Runs are serialised with `flock`, so a slow upload cannot overlap the next tick.
4. Filenames and contents are encrypted by rclone's `crypt` layer, so neither
   provider can read the data.

## Setup

Run on the Oracle VM that hosts the Docker stack.

### 1. Install rclone

```bash
curl https://rclone.org/install.sh | sudo bash
rclone version
```

### 2. Google Cloud service account (primary)

1. In the Google Cloud project, enable the **Google Drive API**.
2. Create a **service account**, download the JSON key.
3. Move it somewhere the app user can read, and lock it down:
   ```bash
   sudo install -m 600 sa.json /etc/flyconnect/sa.json
   ```
4. Create a folder in Drive and **share it with the service account's
   `client_email`** with Editor access.

A service account is used rather than an OAuth user flow because this runs
unattended with no browser and no user present.

### 3. MEGA account (fallback)

1. Sign in to MEGA in a browser **once** so the account's encryption keys exist.
   rclone cannot create them; without this the login fails.
2. Enable 2FA and set a recovery email.

### 4. Configure the remotes

```bash
sudo rclone config          # follow backup/rclone.conf.example
```

Four remotes must exist — see `rclone.conf.example` for the exact fields.

> **Order matters, and it is not reversible.** Do these three steps in sequence:
>
> 1. Put the **crypt passwords** in your password manager.
> 2. *Then* run `sudo rclone config encryption set` to encrypt the config file.
>    (`rclone config password` is a different command — it updates an existing
>    remote's password and encrypts nothing. Verify with
>    `sudo rclone config encryption check`.)
> 3. Put **that** config password in the same note, then `shred -u` the
>    plaintext config.
>
> Skipping step 1 leaves you with exactly one copy of the crypt keys — inside a
> file you are about to make unreadable. Note also that `sudo cat` of a key file
> lands in your terminal scrollback, and on any shared session logger; shred the
> plaintext as soon as the password manager has it.
>
> **Verify the password manager copy before you shred.** A typo at the shred step
> is the single unrecoverable mistake in this whole procedure: it makes every
> existing backup permanently unreadable. Before shredding, prove the stored
> value is byte-identical by re-obscuring it and comparing:
>
> ```bash
> # for each of the two crypt values
> rclone obscure 'PASTE_FROM_PM_HERE'      # must equal the value in rclone.conf
> ```
>
> Only shred once that matches.

### 4b. Required after encryption: `RCLONE_CONFIG_PASS`

**Encrypting the config breaks every unattended run unless you do this step.**
Cron has no TTY, so an encrypted `rclone.conf` makes each invocation exit
immediately:

```
CRITICAL: Failed to read line: EOF
```

That fails both the backup and the drill, and does it on every single tick —
so it looks like a working cron with no output, which is the worst possible
failure mode.

Add the config password to `/etc/flyconnect/backup.env` (mode 640, root-only):

```bash
RCLONE_CONFIG_PASS=the-config-encryption-password
```

Both scripts `source` that file and then `export` this variable explicitly —
a bare `source` does not export, so without that line the variable would be set
but invisible to rclone. The alternative is `--password-command`, but that
means editing every rclone call site.

Note this is the *config* password, not a crypt key. The crypt keys stay inside
`rclone.conf`; compromising `backup.env` on its own does not reveal them.

Then verify **functionally**. A text check cannot work here: the values in
`rclone.conf` are `rclone obscure`d, so a placeholder and a real credential look
identical, and grepping for the placeholder string finds nothing because it was
obscured on the way in. `rclone config show` is equally useless for this.

```bash
sudo rclone lsd gdrive-crypt:flyconnect-backups   # must authenticate
sudo rclone lsd mega-crypt:flyconnect-backups     # must authenticate
```

A placeholder credential fails here with an auth/login error, and that is the
only signal that counts. **Both remotes must pass before you continue** — a Drive
primary with an unverified MEGA fallback means you find out at the worst possible
moment that your fallback does not exist.

> **The crypt passwords cannot be rotated.** rclone derives its key from them
> directly; changing them makes every existing backup permanently unreadable
> rather than migrating it. The only recovery is re-uploading from a source
> that still exists. Put them in a password manager (1Password / Bitwarden),
> not only on the VM. Never put `rclone.conf` in a cloud backup — that would
> be circular, since it holds the keys to everything else.

### 5. Deploy the scripts

```bash
sudo install -d -m 755 /opt/flyconnect/backup
sudo install -m 755 backup/backup.sh        /opt/flyconnect/backup/
sudo install -m 755 backup/restore-drill.sh /opt/flyconnect/backup/
sudo install -d -m 700 /etc/flyconnect
sudo install -d -m 750 /var/backups/flyconnect
```

Optional overrides in `/etc/flyconnect/backup.env` (mode 600):

```bash
ALERT_WEBHOOK=https://hooks.example.com/...
STALE_AFTER_HOURS=26
```

## First run — do not skip the gate

```bash
sudo /opt/flyconnect/backup/backup.sh          # take a backup
sudo /opt/flyconnect/backup/restore-drill.sh   # prove it restores
```

**Do not enable cron until the drill passes.** The drill restores into a
throwaway database, compares exact row counts for every table, and confirms
`_prisma_migrations` survived. It never touches production.

## Schedule

```cron
# 6-hourly. The database is small, so four full dumps a day cost almost
# nothing and cut worst-case data loss from 24h to 6h.
0 */6 * * * /opt/flyconnect/backup/backup.sh >> /var/log/flyconnect-backup.log 2>&1

# Monthly restore drill, 03:40 — off the hour to avoid the backup tick.
40 3 1 * * /opt/flyconnect/backup/restore-drill.sh >> /var/log/flyconnect-backup.log 2>&1
```

```bash
sudo crontab -e
```

> **Cron must be root's crontab.** `rclone.conf` is mode 600 under `/etc` and is
> reached through a symlink in `/root/.config/rclone/`, so only root can read it.
> A job added to `/etc/cron.d/` or to another user's crontab will fail to
> authenticate on every run — and, worse, the retention prune (`rclone delete`)
> will also never run, so the remote silently grows forever while the log shows
> nothing unusual. Use `sudo crontab -e`, and nothing else.

Retention: **30 days** on Drive, **90 days** on MEGA (the fallback is the
long-term archive). Change via `PRIMARY_RETENTION` / `FALLBACK_RETENTION`.

## Monitoring

`backup.sh` alerts when a run fails, and separately when the gap since the
previous success exceeds `STALE_AFTER_HOURS` — that catches a cron that died
silently even when the current run succeeds.

Check status at any time:

```bash
tail -n 20 /var/log/flyconnect-backup.log
grep ' OK provider=' /var/log/flyconnect-backup.log | tail -n 5
```

## Restoring for real

Only needed if production is actually lost. The drill is the rehearsal for this.

```bash
# 1. Stop the app so nothing writes during the restore.
cd /path/to/travel && docker compose stop backend

# 2. List available backups.
/opt/flyconnect/backup/restore-drill.sh --list

# 3. Download the dump you want and decrypt it.
mkdir -p /var/backups/flyconnect/restore && cd "$_"
rclone copyto gdrive-crypt:flyconnect-backups/flyconnect_20260926_060000.dump .
# Filename on the provider is encrypted; the name you get back after rclone
# decrypts is the real one. Use `rclone cryptdecode` if you need the raw name.

# 4. Restore over the existing database.
docker exec -i flyconnect-postgres \
  pg_restore -U flyconnect -d flyconnect --clean --if-exists --no-owner --no-acl \
  < flyconnect_20260926_060000.dump

# 5. Restart the app. Migrations must NOT re-run — restore `_prisma_migrations`
#    along with the data, which a full pg_dump does.
docker compose up -d backend
```

## Backing up `backend/.env`

Not handled by these scripts, and deliberately so — it holds the database URL,
the JWT secrets, and a live WhatsApp access token. Losing the VM without it
means you cannot reconnect to anything.

Store it in **1Password or Bitwarden** as one encrypted entry. Keeping it in the
cloud backup alongside the database dump would mean one compromised provider
account yields both the data and the keys to reach it.

`META-WHATSAPP-API-KIT/` is dead weight from a different project (Solastio) —
nothing in `backend/src` imports it. Exclude it from any source backup.

## Known issues

**Live Meta credentials are in git history.** `META-WHATSAPP-API-KIT/META-ACCOUNT-SUMMARY.md`
is tracked and contains `META_APP_SECRET` and `META_CREDENTIAL_ENCRYPTION_KEY`
in plaintext. The root `.gitignore` excludes `.env` but not this `.md`. Rotate
both in the Meta dashboard, then rewrite history. The app reads tokens from the
environment at runtime (`backend/src/whatsapp/whatsapp.service.ts`), so rotating
does not require a redeploy beyond updating `backend/.env`.

**Committed database credentials, but not reachable.** `docker-compose.yml`
hardcodes `POSTGRES_PASSWORD: flyconnect` and publishes `5432:5432` and
`6379:6379` on `0.0.0.0`; Redis additionally has no password at all. **Verified
on the VM:** UFW is active with `default deny incoming` and only 22/80/443
allowed, and an external probe confirms 4000/5432/6379 are all unreachable. So
this is currently safe — but it is safe only because of the firewall, not the
compose file. Note that Docker inserts its own iptables rules ahead of UFW, so
"it is bound to 0.0.0.0" is not the same as "it is exposed". If the firewall is
ever rebuilt or disabled, re-probe from outside rather than reading the compose
file.

**No lint config in the backend.** `package.json` defines a `lint` script but
`eslint` is not in `devDependencies` and no config file exists, so `npm run lint`
fails. Unrelated to backup, but it will bite in CI.
