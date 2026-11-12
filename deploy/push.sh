#!/usr/bin/env bash
# =============================================================
# LOCAL machine → VPS push (run from the project root on Windows/Git Bash).
# Usage: VPS_USER=root VPS_HOST=1.2.3.4 ./deploy/push.sh
# =============================================================
set -euo pipefail

VPS_USER="${VPS_USER:?set VPS_USER (e.g. root)}"
VPS_HOST="${VPS_HOST:?set VPS_HOST (e.g. 1.2.3.4)}"
APP_DIR="${APP_DIR:-/var/www/iskcon}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"

echo "==> Pushing app to ${VPS_USER}@${VPS_HOST}:${APP_DIR}"

ssh -i "$SSH_KEY" "${VPS_USER}@${VPS_HOST}" "mkdir -p ${APP_DIR}"

# Sync source (excludes dev/build noise)
rsync -avz --delete -e "ssh -i ${SSH_KEY}" \
  --exclude node_modules \
  --exclude 'backend/dist' \
  --exclude 'frontend/dist' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '*.log' \
  ./ "${VPS_USER}@${VPS_HOST}:${APP_DIR}/"

echo "==> Building on VPS"
ssh -i "$SSH_KEY" "${VPS_USER}@${VPS_HOST}" bash -s <<'EOF'
set -euo pipefail
cd /var/www/iskcon

echo '--- backend: install + build'
cd backend
npm ci
npm run build

echo '--- frontend: install + build'
cd ../frontend
npm ci
npm run build

echo '--- database: apply migrations'
cd ../backend
npx prisma migrate deploy

echo '--- PM2: (re)start'
npm i -g pm2
# First run creates the process; later runs reload gracefully.
pm2 describe iskcon-api >/dev/null 2>&1 \
  && pm2 reload ../deploy/ecosystem.config.cjs \
  || pm2 start ../deploy/ecosystem.config.cjs
pm2 save

echo '--- done'
EOF

echo "==> Deploy complete. Visit https://${VPS_HOST} (after nginx + HTTPS are set up)."
