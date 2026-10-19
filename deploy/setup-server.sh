#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu server. Run as root:
#   bash setup-server.sh "<deploy public key>"
# Installs Docker, firewall (SSH only) and automatic security updates, and creates the
# `deploy` user that GitHub Actions uses, with /opt/invtracker as the app directory.
set -euo pipefail

DEPLOY_KEY="${1:?usage: setup-server.sh \"ssh-ed25519 AAAA... github-deploy\"}"

apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl ufw unattended-upgrades sqlite3

# Docker Engine + compose plugin (official convenience script).
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# Only SSH is reachable from outside; the app is served through the Cloudflare Tunnel.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

dpkg-reconfigure -f noninteractive unattended-upgrades

id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash --groups docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$DEPLOY_KEY" /home/deploy/.ssh/authorized_keys 2>/dev/null || echo "$DEPLOY_KEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

install -d -o deploy -g deploy /opt/invtracker /opt/invtracker/data
echo "Done. Next: put .env into /opt/invtracker (see deploy/README.md)."
