#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TMP_DIR="${ROOT}/.tmp/frontend-prod"
PID_FILE="${TMP_DIR}/frontend.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No frontend site gateway pid file was found."
  exit 0
fi

PID=$(cat "$PID_FILE" 2>/dev/null || true)
if [ -z "${PID:-}" ]; then
  rm -f "$PID_FILE"
  echo "Pid file was empty and has been removed."
  exit 0
fi

if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping frontend site gateway PID ${PID}."
  kill "$PID" 2>/dev/null || true

  i=0
  while [ "$i" -lt 20 ]; do
    if ! kill -0 "$PID" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "Frontend site gateway stopped."
      exit 0
    fi
    i=$((i + 1))
    sleep 0.5
  done

  echo "Process did not exit after SIGTERM; sending SIGKILL."
  kill -9 "$PID" 2>/dev/null || true
else
  echo "PID ${PID} is not running."
fi

rm -f "$PID_FILE"
echo "Frontend site gateway stopped."
