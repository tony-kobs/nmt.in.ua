#!/usr/bin/env bash
# Put the last good www back. Use only if the new release is live but broken
# and automatic healthcheck did not already roll back.
#
#   bash scripts/rollback-hosting.sh --yes

set -euo pipefail

if [ "${1:-}" != "--yes" ]; then
  echo "Refusing to run without --yes. This swaps nmt.in.ua back to releases/previous." >&2
  exit 1
fi

REMOTE_USER="${REMOTE_USER:-levelhst}"
REMOTE_HOST="${REMOTE_HOST:-levelhst.ftp.tools}"
REMOTE_SITE="${REMOTE_SITE:-/home/levelhst/nmt.in.ua/www}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
REMOTE_HOST_IP="${REMOTE_HOST_IP:-127.1.10.37}"
REMOTE_PORT="${REMOTE_PORT:-3000}"

SSH=(
  ssh
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o ConnectTimeout=30
)

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

REMOTE_APPLY="$(printf \
  'export SITE=%q HOST=%q PORT=%q; exec bash -s' \
  "$REMOTE_SITE" "$REMOTE_HOST_IP" "$REMOTE_PORT")"

"${SSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_APPLY" <<'REMOTE'
set -euo pipefail
export PATH="/usr/local/node24/bin:/usr/local/bin:/usr/bin:${PATH}"

SITE="${SITE:?}"
HOST="${HOST:?}"
PORT="${PORT:?}"
APP_ROOT="$(dirname "$SITE")"
PREVIOUS="${APP_ROOT}/releases/previous"
FAILED="${APP_ROOT}/releases/failed"
PIDFILE="${APP_ROOT}/nmt.pid"
LOG="/home/levelhst/.system/nodejs/logs/www.nmt.in.ua.log"

if [ ! -d "$PREVIOUS" ]; then
  echo "No ${PREVIOUS} to restore." >&2
  exit 1
fi

pids_on_port() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true
    return
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser "${PORT}/tcp" 2>/dev/null | tr -cs '0-9' '\n' | grep -E '^[0-9]+$' || true
    return
  fi
  ps -u "$(id -un)" -o pid=,args= 2>/dev/null | awk '/[n]ode server\.js/ { print $1 }' || true
}

stop_site_node() {
  local pid=""
  if [ -f "$PIDFILE" ]; then
    pid="$(tr -cd '0-9' < "$PIDFILE" || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 2
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PIDFILE"
  fi
  local extra
  extra="$(pids_on_port | tr '\n' ' ')"
  if [ -n "${extra// /}" ]; then
    # shellcheck disable=SC2086
    kill $extra 2>/dev/null || true
    sleep 2
    # shellcheck disable=SC2086
    kill -9 $extra 2>/dev/null || true
  fi
}

stop_site_node
rm -rf "$FAILED"
if [ -d "$SITE" ]; then
  mv "$SITE" "$FAILED"
fi
mv "$PREVIOUS" "$SITE"

cd "$SITE"
export NODE_ENV=production PORT HOST
mkdir -p "$(dirname "$LOG")"
nohup node server.js >>"$LOG" 2>&1 &
echo $! > "$PIDFILE"

ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf --max-time 10 "http://${HOST}:${PORT}/" >/dev/null; then
    ok=1
    break
  fi
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  echo "Restored previous files, but healthcheck failed." >&2
  exit 1
fi

echo "OK: rolled back (BUILD_ID=$(cat "${SITE}/.next/BUILD_ID"))"
REMOTE
