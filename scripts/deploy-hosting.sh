#!/usr/bin/env bash
# Build Next on a modern glibc machine, upload a thin artifact over SSH pipe,
# prepare a new release beside the live site, then swap directories.
#
# The live site stays up during upload + npm install. Node restarts only after
# the new release is ready. If the healthcheck fails, the previous www is moved back.
#
# Usage (from repo root, Git Bash / Linux / macOS):
#   bash scripts/deploy-hosting.sh
#   bash scripts/deploy-hosting.sh --skip-build   # CI already ran npm ci / build
#
# Env:
#   REMOTE_USER REMOTE_HOST REMOTE_SITE SSH_KEY REMOTE_HOST_IP REMOTE_PORT RELEASE_ID
#
# Do not use SCP / appleboy — this host blocks it. Do not run npm run build on the server.

set -euo pipefail

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

REMOTE_USER="${REMOTE_USER:-levelhst}"
REMOTE_HOST="${REMOTE_HOST:-levelhst.ftp.tools}"
REMOTE_SITE="${REMOTE_SITE:-/home/levelhst/nmt.in.ua/www}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
REMOTE_HOST_IP="${REMOTE_HOST_IP:-127.1.10.37}"
REMOTE_PORT="${REMOTE_PORT:-3000}"

if [ -n "${GITHUB_SHA:-}" ]; then
  RELEASE_ID="${RELEASE_ID:-$GITHUB_SHA}"
elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  RELEASE_ID="${RELEASE_ID:-$(git rev-parse HEAD)}"
else
  RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"
fi
RELEASE_ID="$(printf '%s' "$RELEASE_ID" | tr -cd 'a-fA-F0-9' | cut -c1-12)"
if [ -z "$RELEASE_ID" ]; then
  RELEASE_ID="$(date +%Y%m%d%H%M%S)"
fi

SSH=(
  ssh
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o ConnectTimeout=30
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=8
)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found: $SSH_KEY" >&2
  echo "Locally: use the key that already opens ${REMOTE_USER}@${REMOTE_HOST}." >&2
  echo "CI: write secret HOSTING_SSH_KEY to that path and set SSH_KEY." >&2
  exit 1
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "==> Building locally (do not build on the hosting)..."
  npm ci
  npm run build
fi

if [ ! -f .next/BUILD_ID ]; then
  echo "Missing .next/BUILD_ID. Run npm run build or drop --skip-build." >&2
  exit 1
fi

PACK_PATHS=(
  .next
  public
  server.js
  lib
  package.json
  package-lock.json
  next.config.ts
  messages
  src/i18n
  tsconfig.json
)

for path in "${PACK_PATHS[@]}"; do
  if [ ! -e "$path" ]; then
    echo "Cannot pack: missing $path" >&2
    exit 1
  fi
done

ARCHIVE="$(mktemp /tmp/nmt-release-XXXXXX.tar.gz)"
REMOTE_ARCHIVE="/home/${REMOTE_USER}/nmt-release-${RELEASE_ID}.tar.gz"
cleanup_local() { rm -f "$ARCHIVE"; }
trap cleanup_local EXIT

echo "==> Packing thin release ${RELEASE_ID}..."
tar \
  --exclude='.next/cache' \
  --exclude='**/*.test.ts' \
  --exclude='**/*.test.js' \
  -czf "$ARCHIVE" \
  "${PACK_PATHS[@]}"

ls -lh "$ARCHIVE"

echo "==> Uploading to ${REMOTE_USER}@${REMOTE_HOST} (SSH pipe)..."
"${SSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "cat > ${REMOTE_ARCHIVE}" < "$ARCHIVE"

echo "==> Preparing release on server, then swapping www..."
REMOTE_APPLY="$(printf \
  'export RELEASE_ID=%q SITE=%q REMOTE_ARCHIVE=%q HOST=%q PORT=%q; exec bash -s' \
  "$RELEASE_ID" "$REMOTE_SITE" "$REMOTE_ARCHIVE" "$REMOTE_HOST_IP" "$REMOTE_PORT")"
"${SSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_APPLY" <<'REMOTE'
set -euo pipefail
export PATH="/usr/local/node24/bin:/usr/local/bin:/usr/bin:${PATH}"

SITE="${SITE:?}"
RELEASE_ID="${RELEASE_ID:?}"
REMOTE_ARCHIVE="${REMOTE_ARCHIVE:?}"
HOST="${HOST:?}"
PORT="${PORT:?}"

APP_ROOT="$(dirname "$SITE")"
RELEASES="${APP_ROOT}/releases"
STAGE="${RELEASES}/${RELEASE_ID}"
PREVIOUS="${RELEASES}/previous"
FAILED="${RELEASES}/failed"
ENV_STORE="${APP_ROOT}/.env.production"
ENV_BAK="${HOME}/nmt.env.production.bak"
PIDFILE="${APP_ROOT}/nmt.pid"
LOCKDIR="${APP_ROOT}/.deploy.lock"
LOG="/home/levelhst/.system/nodejs/logs/www.nmt.in.ua.log"

if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "Another deploy is already running (${LOCKDIR})." >&2
  rm -f "$REMOTE_ARCHIVE"
  exit 1
fi

unlock() { rmdir "$LOCKDIR" 2>/dev/null || true; }
trap unlock EXIT

mkdir -p "$RELEASES" "$(dirname "$LOG")"
rm -rf "$STAGE"
mkdir -p "$STAGE"

ensure_env() {
  local dest="$1"
  local src=""
  if [ -f "$ENV_STORE" ]; then
    src="$ENV_STORE"
  elif [ -f "$SITE/.env.production" ]; then
    src="$SITE/.env.production"
  elif [ -f "$ENV_BAK" ]; then
    src="$ENV_BAK"
  fi

  if [ -n "$src" ]; then
    cp -a "$src" "$dest"
  else
    touch "$dest"
  fi
  chmod 640 "$dest"

  if grep -q '^MAX_BODY_BYTES=' "$dest"; then
    sed -i 's/^MAX_BODY_BYTES=.*/MAX_BODY_BYTES=8388608/' "$dest"
  else
    printf '\nMAX_BODY_BYTES=8388608\n' >> "$dest"
  fi
}

pids_on_port() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true
    return
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser "${PORT}/tcp" 2>/dev/null | tr -cs '0-9' '\n' | grep -E '^[0-9]+$' || true
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -lptn "sport = :${PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' || true
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

start_site_node() {
  cd "$SITE"
  export NODE_ENV=production
  export PORT
  export HOST
  nohup node server.js >>"$LOG" 2>&1 &
  echo $! > "$PIDFILE"
}

wait_health() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if curl -sf --max-time 10 "http://${HOST}:${PORT}/" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

echo "==> Extract ${RELEASE_ID} (live site still running)..."
tar -xzf "$REMOTE_ARCHIVE" -C "$STAGE"
rm -f "$REMOTE_ARCHIVE"

if [ ! -f "${STAGE}/.next/BUILD_ID" ]; then
  echo "Release archive has no .next/BUILD_ID" >&2
  rm -rf "$STAGE"
  exit 1
fi

ensure_env "${STAGE}/.env.production"
cp -a "${STAGE}/.env.production" "$ENV_STORE"
chmod 640 "$ENV_STORE"
if [ -f "$SITE/.env.production" ]; then
  cp -a "$SITE/.env.production" "$ENV_BAK" 2>/dev/null || true
fi

echo "==> npm install --omit=dev in staging..."
cd "$STAGE"
npm install --omit=dev --no-audit --no-fund --prefer-offline

if [ ! -d "${STAGE}/node_modules/next" ]; then
  echo "Staging install did not produce node_modules/next" >&2
  rm -rf "$STAGE"
  exit 1
fi

echo "==> Swap www (short restart window)..."
stop_site_node
sleep 1

if [ -d "$SITE" ]; then
  rm -rf "$PREVIOUS"
  mv "$SITE" "$PREVIOUS"
fi

if ! mv "$STAGE" "$SITE"; then
  echo "Failed to move staging into www; restoring previous." >&2
  if [ -d "$PREVIOUS" ]; then
    mv "$PREVIOUS" "$SITE"
    start_site_node
  fi
  exit 1
fi

# Keep www as a real directory so the hosting panel still sees it.
start_site_node

if ! wait_health; then
  echo "Healthcheck failed; rolling back to previous release." >&2
  stop_site_node
  rm -rf "$FAILED"
  mv "$SITE" "$FAILED" || true
  if [ -d "$PREVIOUS" ]; then
    mv "$PREVIOUS" "$SITE"
    start_site_node
    if wait_health; then
      echo "Rollback OK. New files are in ${FAILED}." >&2
    else
      echo "Rollback started, but healthcheck still failing." >&2
    fi
  fi
  exit 1
fi

# One previous release is enough. Drop leftover staging dirs.
find "$RELEASES" -mindepth 1 -maxdepth 1 -type d \
  ! -path "$PREVIOUS" ! -path "$FAILED" \
  -exec rm -rf {} + 2>/dev/null || true

echo "OK: nmt.in.ua is up (BUILD_ID=$(cat "${SITE}/.next/BUILD_ID") release=${RELEASE_ID})"
REMOTE

echo "==> Done. Check https://nmt.in.ua/"
