#!/usr/bin/env bash
# Ensure MAX_BODY_BYTES=8388608 in hosting env (task 2.3).
# Writes both the persistent store (outside www) and the live www copy.
#
# Usage:
#   bash scripts/ensure-hosting-max-body-bytes.sh

set -euo pipefail

REMOTE_USER="${REMOTE_USER:-levelhst}"
REMOTE_HOST="${REMOTE_HOST:-levelhst.ftp.tools}"
REMOTE_SITE="${REMOTE_SITE:-/home/levelhst/nmt.in.ua/www}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=30)

REMOTE_APPLY="$(printf 'export SITE=%q; exec bash -s' "$REMOTE_SITE")"

"${SSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_APPLY" <<'REMOTE'
set -euo pipefail
SITE="${SITE:?}"
APP_ROOT="$(dirname "$SITE")"
STORE="${APP_ROOT}/.env.production"
LIVE="${SITE}/.env.production"

patch_env() {
  local file="$1"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  chmod 640 "$file"
  if grep -q '^MAX_BODY_BYTES=' "$file"; then
    sed -i 's/^MAX_BODY_BYTES=.*/MAX_BODY_BYTES=8388608/' "$file"
  else
    printf '\nMAX_BODY_BYTES=8388608\n' >> "$file"
  fi
}

if [ -f "$LIVE" ] && [ ! -f "$STORE" ]; then
  cp -a "$LIVE" "$STORE"
fi

patch_env "$STORE"
if [ -d "$SITE" ]; then
  cp -a "$STORE" "$LIVE"
  chmod 640 "$LIVE"
fi

echo "store: $(grep '^MAX_BODY_BYTES=' "$STORE")"
if [ -f "$LIVE" ]; then
  echo "live:  $(grep '^MAX_BODY_BYTES=' "$LIVE")"
fi
REMOTE

echo "OK: MAX_BODY_BYTES set on ${REMOTE_HOST}"
