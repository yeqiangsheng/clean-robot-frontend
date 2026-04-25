#!/usr/bin/env sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must run as root because it removes a systemd unit."
  echo "Use: sudo ./scripts/uninstall-site-systemd.sh"
  exit 1
fi

SERVICE_NAME=${SITE_SERVICE_NAME:-clean-robot-site-gateway}
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

if systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
  systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  systemctl disable "$SERVICE_NAME" >/dev/null 2>&1 || true
fi

if [ -f "$UNIT_PATH" ]; then
  rm -f "$UNIT_PATH"
fi

systemctl daemon-reload
systemctl reset-failed "$SERVICE_NAME" >/dev/null 2>&1 || true

echo "Uninstalled ${SERVICE_NAME}. Release files were not deleted."
