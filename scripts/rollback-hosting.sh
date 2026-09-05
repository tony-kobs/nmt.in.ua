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

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIB="$ROOT/scripts/hosting-remote-lib.sh"

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi
if [ ! -f "$LIB" ]; then
  echo "Missing $LIB" >&2
  exit 1
fi

REMOTE_APPLY="$(printf \
  'export SITE=%q HOST=%q PORT=%q; exec bash -s' \
  "$REMOTE_SITE" "$REMOTE_HOST_IP" "$REMOTE_PORT")"

{
  cat "$LIB"
  cat <<'REMOTE'

set -euo pipefail
export PATH="/usr/local/node24/bin:/usr/local/bin:/usr/bin:${PATH}"

SITE="${SITE:?}"
HOST="${HOST:?}"
PORT="${PORT:?}"
APP_ROOT="$(dirname "$SITE")"
cd "$APP_ROOT"

PREVIOUS="${APP_ROOT}/releases/previous"
FAILED="${APP_ROOT}/releases/failed"
STAGE=""
PIDFILE="${APP_ROOT}/nmt.pid"
LOG="/home/levelhst/.system/nodejs/logs/www.nmt.in.ua.log"

if [ ! -d "$PREVIOUS" ]; then
  echo "No ${PREVIOUS} to restore." >&2
  exit 1
fi

stop_site_node
wait_nmt_port_free

rm -rf "$FAILED"
if [ -d "$SITE" ]; then
  mv "$SITE" "$FAILED"
fi
mv "$PREVIOUS" "$SITE"

start_site_node

if ! wait_health; then
  echo "Restored previous files, but healthcheck failed." >&2
  exit 1
fi

echo "OK: rolled back (BUILD_ID=$(cat "${SITE}/.next/BUILD_ID"))"
REMOTE
} | "${SSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_APPLY"
