#!/usr/bin/env sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must run as root because it writes a systemd unit."
  echo "Use: sudo SITE_ROSBRIDGE_URL=ws://127.0.0.1:9090 ./scripts/install-site-systemd.sh"
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
RELEASE_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)

SERVICE_NAME=${SITE_SERVICE_NAME:-clean-robot-site-gateway}
SERVICE_USER=${SITE_SERVICE_USER:-${SUDO_USER:-root}}
LISTEN_HOST=${SITE_LISTEN_HOST:-0.0.0.0}
PORT=${SITE_PORT:-4173}
ROSBRIDGE_URL=${SITE_ROSBRIDGE_URL:-ws://127.0.0.1:9090}
MAP_IMPORT_DIR=${SITE_MAP_IMPORT_PBSTREAM_DIR:-/opt/carto/map}
NODE_BIN=${SITE_NODE_BIN:-}
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

if [ -z "$NODE_BIN" ]; then
  NODE_BIN=$(command -v node || true)
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "node executable was not found. Install Node.js first or set SITE_NODE_BIN."
  exit 1
fi

if [ ! -f "${RELEASE_ROOT}/dist/index.html" ]; then
  echo "Missing ${RELEASE_ROOT}/dist/index.html."
  exit 1
fi

if [ ! -f "${RELEASE_ROOT}/site-gateway/server.mjs" ]; then
  echo "Missing ${RELEASE_ROOT}/site-gateway/server.mjs."
  exit 1
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Service user does not exist: ${SERVICE_USER}"
  exit 1
fi

if [ ! -d "${RELEASE_ROOT}/node_modules/ws" ]; then
  (cd "$RELEASE_ROOT" && npm install --omit=dev)
fi

mkdir -p "${RELEASE_ROOT}/.tmp"
chown -R "${SERVICE_USER}" "${RELEASE_ROOT}/.tmp"

cat >"$UNIT_PATH" <<EOF
[Unit]
Description=Clean Robot Site Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${RELEASE_ROOT}
Environment=NODE_ENV=production
Environment=FRONTEND_NO_OPEN_BROWSER=1
Environment=SITE_ROSBRIDGE_URL=${ROSBRIDGE_URL}
Environment=SITE_MAP_IMPORT_PBSTREAM_DIR=${MAP_IMPORT_DIR}
ExecStart=${NODE_BIN} ${RELEASE_ROOT}/site-gateway/server.mjs --host ${LISTEN_HOST} --port ${PORT}
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=15
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "Installed and started ${SERVICE_NAME}."
echo "Local health:  http://127.0.0.1:${PORT}/api/health"
echo "Remote entry:  http://<robot-ip>:${PORT}"
echo "ROS bridge:    ${ROSBRIDGE_URL}"
echo "Service user:  ${SERVICE_USER}"
echo "Logs:          journalctl -u ${SERVICE_NAME} -f"
