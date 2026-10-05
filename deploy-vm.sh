#!/usr/bin/env bash
# ==============================================================================
# FlyConnect / Blue Aura Tours & Travels — Production VM Deployment Script
# Supports: Docker Compose or PM2 / Bare-Metal Linux VM (Ubuntu/Debian/Oracle)
# ==============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

# Only one deploy may run at a time. Without this, two concurrent runs interleave
# `reset --hard`, `compose down` and `compose up` and leave a half-deployed stack.
LOCK_FILE="/tmp/flyconnect-deploy.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    echo "Error: another deployment is already running."
    exit 1
fi

# Record the SHA being deployed so a failure report says exactly what went out,
# and so the previous good image can be rolled back to.
PREVIOUS_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

echo "============================================================"
echo " Starting Blue Aura CRM Production Deployment..."
echo " Deploying commit: ${PREVIOUS_SHA}"
echo "============================================================"

DEPLOY_MODE="${1:-docker}" # 'docker' or 'pm2'
BRANCH="${DEPLOY_BRANCH:-master}"

COMPOSE=(docker compose --env-file backend/.env)

# ------------------------------------------------------------------------------
# 1. Pull the deployed code
# ------------------------------------------------------------------------------
echo "[1/5] Fetching origin/${BRANCH}..."
git fetch origin "$BRANCH"

if [ -n "$(git status --porcelain)" ]; then
    # The previous version ran `reset --hard` unconditionally, silently discarding anything
    # committed or patched on the host with no record of what was lost.
    echo "Error: working tree has local modifications. Stash or discard them, then re-run:"
    git status --short
    echo "       (to discard deliberately: git reset --hard origin/${BRANCH})"
    exit 1
fi

git reset --hard "origin/${BRANCH}"
DEPLOYED_SHA="$(git rev-parse HEAD)"
echo "-> Now at ${DEPLOYED_SHA}"

# ------------------------------------------------------------------------------
# 2. Migrations, once, before any new code is serving traffic
# ------------------------------------------------------------------------------
if [ "$DEPLOY_MODE" = "docker" ]; then
    echo "[2/5] Applying database migrations (one-shot container)..."
    "${COMPOSE[@]}" build backend
    # A dedicated one-shot run instead of chaining migrations into the container CMD, which made
    # every replica race the Prisma advisory lock at boot.
    "${COMPOSE[@]}" run --rm backend npx prisma migrate deploy
else
    echo "[2/5] Applying database migrations (backend workspace)..."
    (cd backend && npm ci && npx prisma generate && npx prisma migrate deploy && npm run build)
fi

# ------------------------------------------------------------------------------
# 3. Roll the application
# ------------------------------------------------------------------------------
if [ "$DEPLOY_MODE" = "docker" ]; then
    echo "[3/5] Building and starting containers..."
    # No --no-cache: the multi-stage Dockerfile caches dependencies correctly, and forcing a
    # rebuild meant every deploy re-uploaded a >1GB context and recompiled everything.
    "${COMPOSE[@]}" build frontend
    "${COMPOSE[@]}" up -d --remove-orphans
elif [ "$DEPLOY_MODE" = "pm2" ]; then
    echo "[3/5] Building frontend and (re)starting PM2..."
    npm ci
    npm run build

    # Standalone Next.js needs static assets and public/ inside the standalone folder.
    # `cp -r src dest` copies INTO an existing directory, which on a second run produced
    # .next/standalone/.next/static/static and .next/standalone/public/public — a site
    # serving no CSS and no JS, with no error. Copy the contents and replace atomically.
    rm -rf .next/standalone/.next/static .next/standalone/public
    mkdir -p .next/standalone/.next
    cp -r .next/static .next/standalone/.next/static
    cp -r public .next/standalone/public

    if ! command -v pm2 &> /dev/null; then
        echo "-> pm2 not found, installing a pinned version..."
        npm install -g "pm2@5.4.3"
    fi

    pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
    pm2 save
fi

# ------------------------------------------------------------------------------
# 4. Health verification
# ------------------------------------------------------------------------------
echo "[4/5] Verifying health..."

# Retry rather than sleep-and-hope: the app needs a moment to bind, and a single curl with no
# --retry/--max-time reported failures for services that were merely slow to start.
wait_for_http() {
    local url="$1" label="$2" expected="${3:-200}"
    for attempt in $(seq 1 30); do
        local code
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
        if [ "$code" = "$expected" ]; then
            echo "-> ${label}: HTTP ${code}"
            return 0
        fi
        sleep 2
    done
    echo "-> ${label}: HTTP ${code:-000} (expected ${expected})"
    return 1
}

HEALTH_OK=true
wait_for_http "http://localhost:4000/api/live" "Backend liveness" || HEALTH_OK=false
wait_for_http "http://localhost:3000/api/version" "Frontend version" || HEALTH_OK=false

# ------------------------------------------------------------------------------
# 5. Result
# ------------------------------------------------------------------------------
if [ "$HEALTH_OK" != "true" ]; then
    echo ""
    echo "Error: deployment failed its health check. Deployed commit: ${DEPLOYED_SHA}"
    echo "       Previous known-good commit: ${PREVIOUS_SHA}"
    echo "       Inspect with: docker compose ps && docker compose logs --tail=100 backend"
    exit 1
fi

echo "[5/5] Health checks passed."
echo "============================================================"
echo " Production Deployment Complete! (${DEPLOYED_SHA})"
echo "============================================================"