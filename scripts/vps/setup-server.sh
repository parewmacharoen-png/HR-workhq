#!/usr/bin/env bash
# ============================================================================
# scripts/vps/setup-server.sh — one-time hardening + setup of a fresh
# Ubuntu 22.04/24.04 VPS for WorkHQ. Safe to re-run.
#
# Run as root on the server:
#   curl -fsSL https://raw.githubusercontent.com/parewmacharoen-png/HR-workhq/main/scripts/vps/setup-server.sh -o setup-server.sh
#   DEPLOY_PUBKEY="ssh-ed25519 AAAA... github-deploy" bash setup-server.sh
#
# DEPLOY_PUBKEY is the PUBLIC half of the key GitHub Actions uses to deploy.
# Your own login key must already be in /root/.ssh/authorized_keys (Hostinger
# lets you add it when creating the VPS) — password SSH login is disabled.
# ============================================================================

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/parewmacharoen-png/HR-workhq.git}"
APP_DIR="${APP_DIR:-/srv/workhq}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

[[ $EUID -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
if [[ ! -s /root/.ssh/authorized_keys ]]; then
  echo "ERROR: no SSH key in /root/.ssh/authorized_keys — add yours first or you will be locked out." >&2
  exit 1
fi

echo "=== Packages & automatic security updates ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "=== Docker ==="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "=== Swap (image builds need headroom) ==="
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "=== Firewall: SSH + HTTP(S) only ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "=== SSH: keys only, no root password login ==="
cat > /etc/ssh/sshd_config.d/99-workhq.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
systemctl reload ssh 2>/dev/null || systemctl reload sshd

systemctl enable --now fail2ban

echo "=== Deploy user (used by GitHub Actions) ==="
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [[ -n "${DEPLOY_PUBKEY:-}" ]]; then
  grep -qxF "$DEPLOY_PUBKEY" "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null \
    || echo "$DEPLOY_PUBKEY" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

echo "=== App checkout at $APP_DIR ==="
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR/backups"

echo "=== Persistent Docker volumes (never removed by compose down -v) ==="
for v in workhq_postgres_data workhq_redis_data workhq_document_storage; do
  docker volume inspect "$v" >/dev/null 2>&1 || docker volume create "$v" >/dev/null
done

if [[ ! -f "$APP_DIR/.env" ]]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR/.env.production.example" "$APP_DIR/.env"
  echo
  echo ">>> Now fill in the secrets:  nano $APP_DIR/.env"
fi

echo
echo "✅ Server ready. Next (as $DEPLOY_USER, in $APP_DIR):"
echo "   docker compose -f docker-compose.yml -f docker-compose.prod.yml build"
echo "   docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate"
echo "   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
