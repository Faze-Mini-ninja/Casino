#!/usr/bin/env bash
# One-command install on a fresh Ubuntu/Debian server (e.g. a free Google Cloud e2-micro).
# Run from inside the cloned repo:   sudo bash tools/setup-server.sh
# Run it again any time to update to the latest code (your data and settings are kept).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash tools/setup-server.sh"; exit 1; }

echo "== krush.casino server setup =="

# 1) swap: small free servers have ~1 GB RAM, which is not enough to build the app
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 2000 ] && ! swapon --show | grep -q /swapfile; then
  echo "-- adding 2 GB swap"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2) Docker
if ! command -v docker >/dev/null; then
  echo "-- installing Docker"
  apt-get update -qq && apt-get install -y -qq curl ca-certificates git openssl >/dev/null
  curl -fsSL https://get.docker.com | sh >/dev/null
fi

# 3) settings (.env), created once
if [ ! -f .env ]; then
  echo "-- first-time settings"
  read -rp "Domain name pointing at this server (e.g. krush.casino), or leave empty to use the IP address: " DOMAIN
  read -rp "Admin username: " ADMIN_USER
  while :; do read -rsp "Admin password (10+ characters): " ADMIN_PASS; echo; [ ${#ADMIN_PASS} -ge 10 ] && break; echo "Too short."; done
  SEED=$(openssl rand -hex 64)
  umask 077
  cat > .env <<ENV
# Created by tools/setup-server.sh. See .env.example for every option.
SITE_ADDRESS=${DOMAIN:-:80}
COOKIE_SECURE=$([ -n "$DOMAIN" ] && echo true || echo false)
ADMIN_USERNAME=$ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASS
MASTER_SEED=$SEED
# Test networks until you are ready. For real money see DEPLOY.md, "Going live".
SOLANA_CLUSTER=devnet
DEPOSIT_FEE_PCT=1
# Off-site backups (strongly recommended): see DEPLOY.md, "Backups".
# BACKUP_S3_ENDPOINT=
# BACKUP_S3_REGION=
# BACKUP_S3_BUCKET=
# BACKUP_S3_KEY_ID=
# BACKUP_S3_SECRET=
ENV
  echo
  echo "================================================================================"
  echo " YOUR MASTER SEED (controls every wallet and decrypts every backup):"
  echo
  echo " $SEED"
  echo
  echo " Write it down now and keep it offline. It is also saved in $ROOT/.env"
  echo "================================================================================"
  read -rp "Press Enter once you have saved it... " _
fi

# 4) build and start (also used for updates)
mkdir -p data
# read only SITE_ADDRESS (sourcing the whole file would mangle passwords containing $ or spaces)
SITE_ADDRESS=$(grep -E '^SITE_ADDRESS=' .env | tail -1 | cut -d= -f2- || true)
export SITE_ADDRESS="${SITE_ADDRESS:-:80}"
echo "-- building and starting (first build takes a few minutes)"
docker compose -f deploy/docker-compose.yml --project-directory deploy up -d --build
docker image prune -f >/dev/null || true

IP=$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
echo
if [ "${SITE_ADDRESS}" = ":80" ]; then echo "Done. Open http://$IP"; else echo "Done. Open https://${SITE_ADDRESS}  (the domain's DNS A record must point to $IP)"; fi
echo "Logs: sudo docker compose -f deploy/docker-compose.yml --project-directory deploy logs -f casino"
