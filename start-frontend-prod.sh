#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
HOST=${SITE_LISTEN_HOST:-0.0.0.0}
PORT=${SITE_PORT:-4173}
URL="http://127.0.0.1:${PORT}"
TMP_DIR="${ROOT}/.tmp/frontend-prod"
PID_FILE="${TMP_DIR}/frontend.pid"
OUT_LOG="${TMP_DIR}/frontend.out.log"
ERR_LOG="${TMP_DIR}/frontend.err.log"

mkdir -p "$TMP_DIR"

if [ ! -f "${ROOT}/dist/index.html" ]; then
  echo "Frontend bundle is missing at ${ROOT}/dist/index.html."
  echo "Run npm run package:trial on the build machine, then deploy the release package."
  exit 1
fi

if [ ! -f "${ROOT}/site-gateway/server.mjs" ]; then
  echo "Site gateway is missing at ${ROOT}/site-gateway/server.mjs."
  exit 1
fi

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then
    if command -v curl >/dev/null 2>&1 && curl -fsS "${URL}/api/health" >/dev/null 2>&1; then
      echo "Frontend site gateway is already healthy at ${URL}."
      exit 0
    fi
    echo "PID file points to a running process (${PID}), but health check is not ready."
    echo "Run ./stop-frontend-prod.sh first, then start again."
    exit 1
  fi
  rm -f "$PID_FILE"
fi

if [ -z "${SITE_ROSBRIDGE_URL:-}" ]; then
  export SITE_ROSBRIDGE_URL="ws://127.0.0.1:9090"
fi

export FRONTEND_NO_OPEN_BROWSER=1
nohup node "${ROOT}/site-gateway/server.mjs" --host "$HOST" --port "$PORT" \
  >"$OUT_LOG" 2>"$ERR_LOG" &
PID=$!
echo "$PID" >"$PID_FILE"

if command -v curl >/dev/null 2>&1; then
  i=0
  while [ "$i" -lt 20 ]; do
    if curl -fsS "${URL}/api/health" >/dev/null 2>&1; then
      echo "Frontend site gateway is ready at ${URL}."
      echo "Remote browser URL: http://<robot-ip>:${PORT}"
      echo "Logs:"
      echo "  ${OUT_LOG}"
      echo "  ${ERR_LOG}"
      exit 0
    fi
    i=$((i + 1))
    sleep 0.5
  done
fi

echo "Frontend site gateway started as PID ${PID}, but health was not confirmed yet."
echo "Check ${URL}/api/health and logs under ${TMP_DIR}."
