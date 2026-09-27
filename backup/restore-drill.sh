#!/usr/bin/env bash
#
# FlyConnect — restore drill.
#
# A backup that has never been restored is not a backup. This script proves the
# most recent cloud backup is actually restorable, without ever touching the
# production database.
#
# It restores into a throwaway database, compares exact row counts for every
# table in the public schema, then drops the throwaway database.
#
# Run it monthly. A nonzero exit means the alert webhook fired.
#
# Usage:
#   restore-drill.sh                 # drill the newest backup on the primary
#   restore-drill.sh <dump-name>     # drill one specific dump
#   restore-drill.sh --list          # show available backups, drill nothing
#   REMOTE=mega-crypt:... restore-drill.sh   # drill the fallback copy instead
#
# Setup and operational notes: backup/README.md
#
# shellcheck shell=bash

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CONFIG_FILE="${CONFIG_FILE:-/etc/flyconnect/backup.env}"
if [[ -r "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

PG_CONTAINER="${PG_CONTAINER:-flyconnect-postgres}"
PG_USER="${PG_USER:-flyconnect}"
PG_DB="${PG_DB:-flyconnect}"

# The scratch database. Must never equal PG_DB.
DRILL_DB="${DRILL_DB:-flyconnect_restore_drill}"

REMOTE="${REMOTE:-gdrive-crypt:flyconnect-backups}"
WORK="${WORK:-/var/backups/flyconnect/drill}"
LOG_FILE="${LOG_FILE:-/var/log/flyconnect-backup.log}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
RCLONE="${RCLONE:-rclone}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  local level="$1"; shift
  local line
  line="$(date -u +%FT%TZ) DRILL ${level} $*"
  echo "$line"
  # Never let a logging problem abort the drill. The group is redirected
  # because bash's redirection-failure diagnostic bypasses a command-level
  # 2>/dev/null and would otherwise spam the cron log.
  if [[ -n "${LOG_FILE:-}" ]]; then
    { printf '%s\n' "$line" >>"$LOG_FILE"; } 2>/dev/null || true
  fi
}

fail() {
  log "FAIL" "$*"
  if [[ -n "$ALERT_WEBHOOK" ]]; then
    curl -sS -m 15 -X POST "$ALERT_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "{\"source\":\"flyconnect-restore-drill\",\"host\":\"$(hostname)\",\"severity\":\"critical\",\"message\":\"$1\"}" \
      >/dev/null 2>&1 || true
  fi
  exit 1
}

psql_prod() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -At -c "$1"; }
psql_drill() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$DRILL_DB" -At -c "$1"; }
psql_admin() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -At -c "$1"; }

# Emit "table<TAB>count" for every base table in the public schema.
# Enumerated dynamically, so tables added later (visa applications, etc.) are
# covered without editing this script.
emit_counts() {
  local runner="$1" out="$2"
  local tables t count
  tables="$("$runner" "SELECT table_name FROM information_schema.tables
                      WHERE table_schema='public' AND table_type='BASE TABLE'
                      ORDER BY table_name;" | tr -d '\r')"
  : >"$out"
  while IFS= read -r t; do
    [[ -n "$t" ]] || continue
    # Table name comes from information_schema, so it is a safe identifier.
    count="$("$runner" "SELECT count(*) FROM \"$t\";" | tr -d '\r')"
    printf '%s\t%s\n' "$t" "$count" >>"$out"
  done <<<"$tables"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  if [[ "$DRILL_DB" == "$PG_DB" ]]; then
    fail "DRILL_DB ($DRILL_DB) must not equal the production database ($PG_DB)"
  fi

  command -v "$RCLONE" >/dev/null 2>&1 || fail "rclone not found on PATH"
  docker inspect "$PG_CONTAINER" >/dev/null 2>&1 || fail "container '$PG_CONTAINER' not found"

  # --list mode: show what is available and exit without touching anything.
  if [[ "${1:-}" == "--list" ]]; then
    echo "backups in ${REMOTE}:"
    "$RCLONE" lsf "$REMOTE" --include '*.dump' --files-only | sort -r
    exit 0
  fi

  # Pick the dump to drill.
  local dump
  if [[ -n "${1:-}" ]]; then
    dump="$1"
    [[ "$dump" == *.dump ]] || fail "expected a name ending in .dump, got '$dump'"
  else
    dump="$("$RCLONE" lsf "$REMOTE" --include '*.dump' --files-only | sort -r | head -n 1)"
    [[ -n "$dump" ]] || fail "no .dump files found in $REMOTE — is the backup working at all?"
  fi
  log "INFO" "drilling $dump from $REMOTE"

  rm -rf "$WORK"; mkdir -p "$WORK"

  # 1. Download dump + checksum sidecar.
  "$RCLONE" copyto "${REMOTE}/${dump}"     "${WORK}/${dump}"           || fail "could not download $dump"
  "$RCLONE" copyto "${REMOTE}/${dump}.sha256" "${WORK}/${dump}.sha256" 2>/dev/null \
    || log "WARN" "no checksum sidecar for $dump; skipping integrity check"

  # Check the download before doing anything with it. Without this, a zero-byte
  # or missing file only surfaces as a confusing pg_restore error later.
  [[ -s "${WORK}/${dump}" ]] || fail "downloaded $dump is missing or empty"

  # 2. Integrity. Proves the bytes on the provider are the bytes we wrote.
  if [[ -s "${WORK}/${dump}.sha256" ]]; then
    ( cd "$WORK" && sha256sum -c "${dump}.sha256" >/dev/null 2>&1 ) \
      || fail "sha256 mismatch for $dump — the stored backup is corrupt"
    log "INFO" "sha256 verified"
  fi

  # 3. Capture production row counts BEFORE restoring.
  local prod_counts="${WORK}/prod_counts.tsv"
  emit_counts psql_prod "$prod_counts"
  [[ -s "$prod_counts" ]] || fail "could not read table list from $PG_DB"
  log "INFO" "production has $(wc -l <"$prod_counts") tables"

  # 4. Restore into the scratch database. Production is never a target here.
  log "INFO" "restoring into scratch database '$DRILL_DB'"
  psql_admin "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null \
    || fail "could not drop the previous scratch database"
  psql_admin "CREATE DATABASE \"$DRILL_DB\";" >/dev/null \
    || fail "could not create the scratch database"

  # --no-owner --if-exists keeps the restore tolerant of role differences.
  if ! docker exec -i "$PG_CONTAINER" \
        pg_restore -U "$PG_USER" -d "$DRILL_DB" --no-owner --no-acl --if-exists \
        <"${WORK}/${dump}" >/dev/null 2>"${WORK}/restore.err"; then
    log "WARN" "pg_restore reported errors:"
    head -n 20 "${WORK}/restore.err" >&2
    fail "pg_restore failed for $dump — see ${WORK}/restore.err"
  fi

  # 5. Compare row counts. A table present in one side only is a mismatch.
  local drill_counts="${WORK}/drill_counts.tsv"
  emit_counts psql_drill "$drill_counts"

  local mismatches
  mismatches="$(diff <(sort "$prod_counts") <(sort "$drill_counts") || true)"
  if [[ -n "$mismatches" ]]; then
    log "FAIL" "row count differences between production and restored copy:"
    echo "$mismatches" >&2
    fail "restored copy does not match production for $dump"
  fi
  log "INFO" "all $(wc -l <"$prod_counts") tables match production exactly"

  # 6. Confirm the Prisma migration ledger survived. Without it,
  #    `prisma migrate deploy` on the next boot re-applies migrations to an
  #    already-migrated schema (backend/Dockerfile CMD).
  local mig
  mig="$(psql_drill 'SELECT count(*) FROM "_prisma_migrations";' 2>/dev/null | tr -d '\r' || echo 0)"
  if [[ "${mig:-0}" -eq 0 ]]; then
    fail "restored copy has no _prisma_migrations rows — a deploy would re-run migrations"
  fi
  log "INFO" "_prisma_migrations present (${mig} rows)"

  # 7. Clean up the scratch database and downloaded files.
  psql_admin "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null || log "WARN" "could not drop scratch database"
  rm -rf "$WORK"

  log "INFO" "PASS — $dump restored and verified"
  exit 0
}

main "$@"
