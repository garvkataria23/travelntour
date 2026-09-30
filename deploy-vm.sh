#!/usr/bin/env bash
# ==============================================================================
# FlyConnect / Blue Aura Tours & Travels — Production VM Deployment Script
# Supports: Docker Compose or PM2 / Bare-Metal Linux VM (Ubuntu/Debian/Oracle)
# ==============================================================================
set -euo pipefail

echo "============================================================"
echo " Starting Blue Aura CRM Production Deployment..."
echo "============================================================"

DEPLOY_MODE="${1:-docker}" # 'docker' or 'pm2'

# 1. Pull latest code from GitHub
echo "[1/4] Pulling latest code from origin/master..."
git fetch origin master
git reset --hard origin/master

# 2. Deployment execution
if [ "$DEPLOY_MODE" = "docker" ]; then
    echo "[2/4] Deploying via Docker Compose..."
    if ! command -v docker &> /dev/null; then
        echo "Error: docker is not installed. Please install Docker or run './deploy-vm.sh pm2'"
        exit 1
    fi
    
    docker compose down --remove-orphans || true
    docker compose build --no-cache
    docker compose up -d
    
    echo "[3/4] Running DB migrations inside container..."
    sleep 5
    docker compose exec -T backend npx prisma migrate deploy || true
    
elif [ "$DEPLOY_MODE" = "pm2" ]; then
    echo "[2/4] Deploying via PM2 & Native Node..."
    npm ci
    npm run build
    
    cd backend
    npm ci
    npx prisma generate
    npx prisma migrate deploy
    npm run build
    cd ..
    
    if ! command -v pm2 &> /dev/null; then
        npm install -g pm2
    fi
    
    pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
    pm2 save
fi

# 3. Health Checks
echo "[4/4] Verifying health checks..."
sleep 4

FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/version || true)
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/health || true)

echo "-> Frontend Health Check (port 3000): HTTP ${FRONTEND_STATUS:-FAILED}"
echo "-> Backend Health Check (port 4000): HTTP ${BACKEND_STATUS:-FAILED}"

echo "============================================================"
echo " Production Deployment Complete!"
echo " Web App: https://travel-omega-ashy.vercel.app"
echo " Master Admin: https://travel-omega-ashy.vercel.app/admin"
echo "============================================================"
