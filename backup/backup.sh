#!/usr/bin/env bash
#
# FlyConnect — PostgreSQL backup to cloud.
# Google Drive is primary, MEGA is fallback.
#
# Invariants this script exists to hold:
#   1. A backup never depends on the app being up. This runs on the host via
#      cron, not inside the flyconnect-api container. If the backend is
#      crashing, backups must still run.
#   2. A corrupt dump never reaches the cloud. pg_dump writes to a .partial
#      file, the archive TOC is validated, and only then is it renamed.
#   3. If both providers fail, the local dump is KEPT and an alert fires.
#      Nothing is ever deleted on a failed run.
#   4. Runs are serialised. A slow upload overlapping the next cron tick
#      cannot corrupt state.
#
# Setup, cron and runbook: backup/README.md
#
# shellcheck shell=bash

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — override via environment or a sourced env file.
# ---------------------------------------------------------------------------

CONFIG_FILE="${CONFIG_FILE:-/etc/flyconnect/backup.env}"
if [[ -r "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

# Container identity. Must match docker-compose.yml.
PG_CONTAINER="${PG_CONTAINER:-flyconnect-postgres}"
PG_USER="${PG_USER:-flyconnect}"
PG_DB="${PG_DB:-flyconnect}"

# Local staging. Sized for a few dumps; this is not the long-term store.
LOCAL_DIR="${LOCAL_DIR:-/var/backups/flyconnect}"
LOG_FILE="${LOG_FILE:-/var/log/flyconnect-backup.log}"

# Provider remotes. Each must point at its own DEDICATED path — rclone's
# crypt layer encrypts file contents and names, so the folder on the provider
# will not look like FlyConnect backups to anyone browsing it.
PRIMARY_REMOTE="${PRIMARY_REMOTE:-gdrive-crypt:flyconnect-backups}"
FALLBACK_REMOTE="${FALLBACK_REMOTE:-mega-crypt:flyconnect-backups}"
PRIMARY_RETENTION="${PRIMARY_RETENTION:-30d}"
FALLBACK_RETENTION="${FALLBACK_RETENTION:-90d}"

# Alerting. Optional: if empty, failures only reach the log.
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"

# If no successful run has been logged within this many hours, the next run
# raises an alert even if that run itself succeeds.
STALE_AFTER_HOURS="${STALE_AFTER_HOURS:-26}"

RCLONE="${RCLONE:-rclone}"
LOCK_FILE="${LOCK_FILE:-/var/lock/flyconnect-backup.lock}"

# Refuse to run against an implausibly small database dump. A near-empty file
# usually means the dump silently failed rather than "the business has no data".
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-1024}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Append a line to the log if the log is writable, otherwise drop it silently.
# Never let a logging problem abort a backup: the run must be judged on whether
# the dump uploaded, not on whether a file on disk accepted a write. The whole
# group is redirected because bash emits its own diagnostic when a redirection
# target cannot be opened, and that diagnostic bypasses a command-level 2>/dev/null.
log_append() {
  [[ -n "${LOG_FILE:-}" ]] || return 0
  { printf '%s\n' "$1" >>"$LOG_FILE"; } 2>/dev/null || true
}

log() {
  local level="$1"; shift
  local line
  line="$(date -u +%FT%TZ) ${level} $*"
  echo "$line"
  log_append "$line"
}

alert() {
  log "ALERT" "$*"
  if [[ -n "$ALERT_WEBHOOK" ]]; then
    local payload
    payload="$(printf '{"source":"flyconnect-backup","host":"%s","severity":"critical","message":"%s"}' \
      "$(hostname)" "${1//\"/\'}" | sed 's/[\r\n]/ /g')"
    curl -sS -m 15 -X POST "$ALERT_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "$payload" >/dev/null 2>&1 || log "WARN" "alert webhook delivery failed"
  fi
}

# Record a successful run, then report how long ago the PREVIOUS success was.
# Returns empty when there is no parseable previous success (e.g. first run, or
# the log is not writable — in which case the staleness check is simply skipped
# rather than failing the run).
mark_success() {
  local provider="$1" prev_age
  prev_age="$(hours_since_last_success)"
  log_append "$(date -u +%FT%TZ) OK provider=$provider"
  echo "$prev_age"
}

# Hours elapsed since the last " OK provider=" line, or empty if none exists.
hours_since_last_success() {
  [[ -n "${LOG_FILE:-}" && -r "$LOG_FILE" ]] || { echo ""; return 0; }
  local last_epoch
  last_epoch="$(grep -F ' OK provider=' "$LOG_FILE" 2>/dev/null | tail -n 1 | cut -d' ' -f1 || true)"
  [[ -n "$last_epoch" ]] || { echo ""; return 0; }
  local last_epoch_s now_s
  last_epoch_s="$(date -u -d "$last_epoch" +%s 2>/dev/null || echo "")"
  [[ -n "$last_epoch_s" ]] || { echo ""; return 0; }
  now_s="$(date -u +%s)"
  echo $(( (now_s - last_epoch_s) / 3600 ))
}

prune() {
  local remote="$1" retain="$2"
  # The --include filter is safe here: rclone decrypts filenames when you
  # operate through a crypt remote, so '*.dump' matches the logical name even
  # though the name is encrypted on the provider. This keeps a stray file that
  # someone drops in the folder from being pruned.
  if "$RCLONE" delete "$remote" --min-age "$retain" --include '*.dump' --include '*.dump.sha256' >/dev/null 2>&1; then
    log "INFO" "pruned $remote older than $retain"
  else
    log "WARN" "retention prune failed for $remote (upload was not affected)"
  fi
}

# Upload the dump and its checksum sidecar. Returns non-zero if either fails.
upload_pair() {
  local dump="$1" sha_file="$2" remote="$3"
  local base
  base="$(basename "$dump")"
  "$RCLONE" copyto "$dump"     "${remote}/${base}"     --transfers 2 --retries 3 --low-level-retries 10 2>>"$LOG_FILE" \
    && "$RCLONE" copyto "$sha_file" "${remote}/${base}.sha256" --transfers 2 --retries 3 --low-level-retries 10 2>>"$LOG_FILE"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  mkdir -p "$LOCAL_DIR"

  if ! command -v "$RCLONE" >/dev/null 2>&1; then
    alert "rclone not found on PATH — no backup was taken"
    exit 1
  fi
  if ! command -v flock >/dev/null 2>&1; then
    alert "flock not found on PATH — refusing to run without run serialisation"
    exit 1
  fi
  if ! docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
    alert "container '$PG_CONTAINER' not found — is docker up?"
    exit 1
  fi

  # Serialise. Held for the whole run via the file descriptor.
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "INFO" "another backup run holds the lock; skipping this tick"
    exit 0
  fi

  local stamp dump partial sha provider
  stamp="$(date -u +%Y%m%d_%H%M%S)"
  dump="${LOCAL_DIR}/flyconnect_${stamp}.dump"
  partial="${dump}.partial"

  # 1. Dump. Write to .partial first so a failure cannot leave a short file
  #    that a later step mistakes for a good dump.
  log "INFO" "starting dump of '$PG_DB' from '$PG_CONTAINER'"
  if ! docker exec "$PG_CONTAINER" \
        pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner --no-acl \
        >"$partial"; then
    rm -f "$partial"
    alert "pg_dump failed — no backup was taken this cycle"
    exit 1
  fi

  # 2. Validate before it can be uploaded. --list parses the archive TOC, so
  #    it catches a truncated or malformed dump that a plain size check misses.
  if ! docker exec -i "$PG_CONTAINER" pg_restore --list <"$partial" >/dev/null 2>&1; then
    rm -f "$partial"
    alert "pg_dump produced an unreadable archive — refusing to upload"
    exit 1
  fi

  local size
  size="$(stat -c %s "$partial")"
  if (( size < MIN_DUMP_BYTES )); then
    rm -f "$partial"
    alert "dump is only ${size}B (< ${MIN_DUMP_BYTES}B) — refusing to upload"
    exit 1
  fi

  mv "$partial" "$dump"
  sha="$(sha256sum "$dump" | cut -d' ' -f1)"
  printf '%s  %s\n' "$sha" "$(basename "$dump")" >"${dump}.sha256"
  log "INFO" "dump ok: ${size}B sha256=${sha:0:12}"

  # 3. Upload. Primary first, fallback only if the primary actually fails.
  #    The .sha256 sidecar travels with the dump so restore-drill.sh can prove
  #    the downloaded bytes are the bytes that were uploaded.
  provider=""
  if upload_pair "$dump" "${dump}.sha256" "$PRIMARY_REMOTE"; then
    provider="primary"
  else
    log "WARN" "primary upload failed; trying fallback"
    if upload_pair "$dump" "${dump}.sha256" "$FALLBACK_REMOTE"; then
      provider="fallback"
    fi
  fi

  if [[ -z "$provider" ]]; then
    # 4. Total failure. Keep the dump locally — it is now the only copy.
    alert "ALL providers failed; dump retained at $dump (sha256=$sha)"
    exit 1
  fi

  rm -f "$dump" "${dump}.sha256"
  log "INFO" "uploaded via $provider; local staging cleaned"

  # 5. Retention. Both ladders are always pruned, not just the one that was
  #    written to — otherwise a fallback that is used once and then goes quiet
  #    would keep its stale objects forever.
  prune "$PRIMARY_REMOTE" "$PRIMARY_RETENTION"
  prune "$FALLBACK_REMOTE" "$FALLBACK_RETENTION"

  # 6. Staleness backstop. A successful run still alerts if the *previous*
  #    success was too long ago, which catches a silently dead cron.
  local prev_age
  prev_age="$(mark_success "$provider")"
  if [[ -n "$prev_age" ]] && (( prev_age > STALE_AFTER_HOURS )); then
    alert "backup gap detected: previous success was ${prev_age}h ago (threshold ${STALE_AFTER_HOURS}h)"
  fi
}

main "$@"
