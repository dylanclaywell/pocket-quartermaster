#!/usr/bin/env bash
# Pulls the latest Pocket Quartermaster release from GitHub and swaps it in.
# Run on the Pi: sudo ./update.sh
set -euo pipefail

REPO="${PQM_REPO:-dylanclaywell/pocket-quartermaster}"
INSTALL_DIR="${PQM_DIR:-/opt/pqm}"
SERVICE="${PQM_SERVICE:-pqm}"
ASSET="pocket-quartermaster-output.zip"
URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

if [[ $EUID -ne 0 ]]; then
  echo "Re-running with sudo..."
  exec sudo -E "$0" "$@"
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $URL"
curl -fL --progress-bar -o "$TMP/output.zip" "$URL"

echo "Extracting..."
unzip -q "$TMP/output.zip" -d "$TMP/extracted"

if [[ ! -d "$TMP/extracted/.output" ]]; then
  echo "Error: zip did not contain a .output/ directory" >&2
  exit 1
fi

echo "Stopping $SERVICE..."
systemctl stop "$SERVICE" 2>/dev/null || true

echo "Swapping in new build at $INSTALL_DIR/.output"
mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/.output.old"
if [[ -d "$INSTALL_DIR/.output" ]]; then
  mv "$INSTALL_DIR/.output" "$INSTALL_DIR/.output.old"
fi
mv "$TMP/extracted/.output" "$INSTALL_DIR/.output"

echo "Starting $SERVICE..."
systemctl start "$SERVICE"

echo
systemctl status "$SERVICE" --no-pager --lines=5 || true
echo
echo "Update complete. Previous build kept at $INSTALL_DIR/.output.old"
