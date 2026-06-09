#!/usr/bin/env bash
# First-time SavesManager install on a Raspberry Pi (or any Debian-ish host).
# Run on the Pi: sudo ./install.sh
set -euo pipefail

REPO="${SAVESMANAGER_REPO:-dylanclaywell/saves-manager}"
INSTALL_DIR="${SAVESMANAGER_DIR:-/opt/savesmanager}"
SERVICE="${SAVESMANAGER_SERVICE:-savesmanager}"
RUN_USER="${SAVESMANAGER_USER:-pi}"

if [[ $EUID -ne 0 ]]; then
  echo "Re-running with sudo..."
  exec sudo -E "$0" "$@"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed (or not on PATH)." >&2
  echo "SavesManager requires Node.js 22 or newer." >&2
  echo "Install it from your distro's package manager or https://nodejs.org/," >&2
  echo "then re-run this installer." >&2
  echo >&2
  echo "On Debian/Ubuntu/Raspberry Pi OS, the NodeSource repo is a common choice:" >&2
  echo "  https://github.com/nodesource/distributions" >&2
  exit 1
fi

echo "==> Node already installed: $(node --version)"
NODE_BIN="$(command -v node)"
echo "==> Using node at $NODE_BIN"

echo "==> Installing prerequisites (curl, unzip)"
apt-get update -qq
apt-get install -y -qq curl unzip ca-certificates

echo "==> Creating $INSTALL_DIR (owned by $RUN_USER)"
mkdir -p "$INSTALL_DIR"
chown -R "$RUN_USER":"$RUN_USER" "$INSTALL_DIR"

SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo "")"
UPDATE_SRC="$SCRIPT_DIR/update.sh"
UNIT_SRC="$SCRIPT_DIR/savesmanager.service"
ENV_SRC="$SCRIPT_DIR/savesmanager.env.example"

if [[ ! -f "$UPDATE_SRC" || ! -f "$UNIT_SRC" || ! -f "$ENV_SRC" ]]; then
  echo "==> Bootstrap: fetching update.sh, savesmanager.service, and savesmanager.env.example from latest release"
  BOOT_TMP=$(mktemp -d)
  trap 'rm -rf "$BOOT_TMP"' EXIT
  curl -fsSL -o "$BOOT_TMP/update.sh" \
    "https://github.com/${REPO}/releases/latest/download/update.sh"
  curl -fsSL -o "$BOOT_TMP/savesmanager.service" \
    "https://github.com/${REPO}/releases/latest/download/savesmanager.service"
  curl -fsSL -o "$BOOT_TMP/savesmanager.env.example" \
    "https://github.com/${REPO}/releases/latest/download/savesmanager.env.example"
  UPDATE_SRC="$BOOT_TMP/update.sh"
  UNIT_SRC="$BOOT_TMP/savesmanager.service"
  ENV_SRC="$BOOT_TMP/savesmanager.env.example"
fi

echo "==> Installing update.sh to $INSTALL_DIR/update.sh"
install -m 0755 -o "$RUN_USER" -g "$RUN_USER" "$UPDATE_SRC" "$INSTALL_DIR/update.sh"

ENV_DST="$INSTALL_DIR/savesmanager.env"
if [[ -f "$ENV_DST" ]]; then
  echo "==> Keeping existing $ENV_DST (not overwriting)"
  if [[ -n "${HOST:-}" || -n "${PORT:-}" ]]; then
    echo "    NOTE: HOST/PORT env vars were set but ignored (env file already exists)." >&2
    echo "    Edit $ENV_DST manually to change them." >&2
  fi
else
  echo "==> Seeding $ENV_DST from defaults"
  install -m 0644 -o "$RUN_USER" -g "$RUN_USER" "$ENV_SRC" "$ENV_DST"
  if [[ -n "${HOST:-}" ]]; then
    sed -i "s|^HOST=.*|HOST=${HOST}|" "$ENV_DST"
    echo "    HOST=${HOST}"
  fi
  if [[ -n "${PORT:-}" ]]; then
    sed -i "s|^PORT=.*|PORT=${PORT}|" "$ENV_DST"
    echo "    PORT=${PORT}"
  fi
  chown "$RUN_USER":"$RUN_USER" "$ENV_DST"
fi

echo "==> Installing systemd unit"
UNIT_DST="/etc/systemd/system/${SERVICE}.service"
sed \
  -e "s|^User=.*|User=${RUN_USER}|" \
  -e "s|^Group=.*|Group=${RUN_USER}|" \
  -e "s|^WorkingDirectory=.*|WorkingDirectory=${INSTALL_DIR}|" \
  -e "s|^ExecStart=.*|ExecStart=${NODE_BIN} ${INSTALL_DIR}/.output/server/index.mjs|" \
  "$UNIT_SRC" > "$UNIT_DST"

systemctl daemon-reload
systemctl enable "$SERVICE"

echo "==> Downloading first build via update.sh"
SAVESMANAGER_REPO="$REPO" \
SAVESMANAGER_DIR="$INSTALL_DIR" \
SAVESMANAGER_SERVICE="$SERVICE" \
  "$INSTALL_DIR/update.sh"

echo
echo "Install complete."
echo "Service:   systemctl status $SERVICE"
echo "Logs:      journalctl -u $SERVICE -f"
echo "Update:    sudo $INSTALL_DIR/update.sh"
echo "Config:    $INSTALL_DIR/savesmanager.env  (restart service after editing)"
