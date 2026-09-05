#!/usr/bin/env bash
# Build Next on a modern glibc machine, rewrite CI absolute paths, upload over
# SSH pipe, prepare a new release beside the live site, then swap directories.
#
# The live site stays up during upload + npm install. Node is fully stopped
# before any mv (otherwise the process follows the directory inode).
#
# Usage (from repo root, Git Bash / Linux / macOS):
#   bash scripts/deploy-hosting.sh
#   bash scripts/deploy-hosting.sh --skip-build   # CI already ran npm ci / build
#
# Env:
#   REMOTE_USER REMOTE_HOST REMOTE_SITE SSH_KEY REMOTE_HOST_IP REMOTE_PORT RELEASE_ID
#
# Do not use SCP / appleboy. Do not run npm run build on the server.

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
LIB="$ROOT/scripts/hosting-remote-lib.sh"
REWRITE="$ROOT/scripts/rewrite-next-build-paths.sh"

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found: $SSH_KEY" >&2
  echo "Locally: use the key that already opens ${REMOTE_USER}@${REMOTE_HOST}." >&2
  echo "CI: write secret HOSTING_SSH_KEY to that path and set SSH_KEY." >&2
  exit 1
fi
if [ ! -f "$LIB" ] || [ ! -f "$REWRITE" ]; then
  echo "Missing $LIB or $REWRITE" >&2
  exit 1
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "==> Building (do not build on the hosting)..."
  npm ci
  npm run build
fi

if [ ! -f .next/BUILD_ID ]; then
  echo "Missing .next/BUILD_ID. Run npm run build or drop --skip-build." >&2
  exit 1
fi

bash "$REWRITE" "$REMOTE_SITE"

PACK_PATHS=(
  .next
  public
  server.js
  lib
  package.json
  package-lock.json
  next.config.ts
  messages
  src
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

echo "==> Packing release ${RELEASE_ID} (full src, rewritten .next)..."
tar \
  --exclude='.next/cache' \
  --exclude='.next/trace' \
  --exclude='.next/diagnostics' \
  --exclude='**/*.test.ts' \
  --exclude='**/*.test.js' \
  --exclude='**/*.test.tsx' \
  -czf "$ARCHIVE" \
  "${PACK_PATHS[@]}"

ls -lh "$ARCHIVE"

echo "==> Uploading to ${REMOTE_USER}@${REMOTE_HOST} (SSH pipe)..."
"${SSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "cat > ${REMOTE_ARCHIVE}" < "$ARCHIVE"

echo "==> Preparing release on server, then swapping www..."
REMOTE_APPLY="$(printf \
  'export RELEASE_ID=%q SITE=%q REMOTE_ARCHIVE=%q HOST=%q PORT=%q; exec bash -s' \
  "$RELEASE_ID" "$REMOTE_SITE" "$REMOTE_ARCHIVE" "$REMOTE_HOST_IP" "$REMOTE_PORT")"

{
  cat "$LIB"
  cat <<'REMOTE'

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
LOG="/home/levelhst/.system/nodejs/logs/www.nmt.in.ua.log"

# Stay out of SITE/STAGE so this shell does not follow a later mv.
cd "$APP_ROOT"

LOCKDIR="${APP_ROOT}/.deploy.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "Another deploy is already running (${LOCKDIR})." >&2
  rm -f "$REMOTE_ARCHIVE"
  exit 1
fi

unlock() { rmdir "$LOCKDIR" 2>/dev/null || true; }
trap unlock EXIT

mkdir -p "$RELEASES" "$(dirname "$LOG")"
rm -rf "$STAGE"
# leftover staging from aborted deploys (keep previous/failed only)
find "$RELEASES" -mindepth 1 -maxdepth 1 -type d \
  ! -path "$PREVIOUS" ! -path "$FAILED" \
  -exec rm -rf {} + 2>/dev/null || true
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

echo "==> Extract ${RELEASE_ID} (live site still running)..."
tar -xzf "$REMOTE_ARCHIVE" -C "$STAGE"
rm -f "$REMOTE_ARCHIVE"

if [ ! -f "${STAGE}/.next/BUILD_ID" ]; then
  echo "Release archive has no .next/BUILD_ID" >&2
  rm -rf "$STAGE"
  exit 1
fi

if find "${STAGE}/.next" -type f \
  ! -path '*/cache/*' ! -path '*/diagnostics/*' ! -name 'trace' \
  \( -name '*.js' -o -name '*.json' -o -name '*.rsc' \) \
  -print0 2>/dev/null \
  | xargs -0 -r grep -F -l -- "/home/runner/work/" 2>/dev/null \
  | grep -q .; then
  echo "Refusing to install: runtime .next still contains /home/runner/work paths." >&2
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
# Reuse the live node_modules (glibc 2.28). A fresh npm 11 tree skips SWC
# postinstall and pulls binaries that need GLIBC 2.29.
if [ -d "${SITE}/node_modules" ]; then
  rm -rf "${STAGE}/node_modules"
  cp -a "${SITE}/node_modules" "${STAGE}/node_modules"
fi
# Subshell: do not cd this script into STAGE (mv would take us with it).
(
  cd "$STAGE"
  printf 'ignore-scripts=false\n' > .npmrc
  npm_config_ignore_scripts=false npm install --omit=dev --no-audit --no-fund --prefer-offline
)

if [ ! -d "${STAGE}/node_modules/next" ]; then
  echo "Staging install did not produce node_modules/next" >&2
  rm -rf "$STAGE"
  exit 1
fi

echo "==> Stop nmt Node, then swap www..."
stop_site_node
wait_nmt_port_free

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

start_site_node

if ! wait_health; then
  echo "Healthcheck failed; rolling back to previous release." >&2
  stop_site_node
  wait_nmt_port_free || true
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

find "$RELEASES" -mindepth 1 -maxdepth 1 -type d \
  ! -path "$PREVIOUS" ! -path "$FAILED" \
  -exec rm -rf {} + 2>/dev/null || true

echo "OK: nmt.in.ua is up (BUILD_ID=$(cat "${SITE}/.next/BUILD_ID") release=${RELEASE_ID})"
REMOTE
} | "${SSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_APPLY"

echo "==> Done. Check https://nmt.in.ua/"
