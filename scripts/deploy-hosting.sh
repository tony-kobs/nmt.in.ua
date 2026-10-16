#!/usr/bin/env bash
# Build Next on a modern glibc machine, rewrite CI absolute paths, upload over
# SSH pipe, prepare a new release beside the live site, then swap directories.
#
# The live site stays up during upload + npm install + npm run migrate.
# Node is fully stopped before any mv (otherwise the process follows the directory inode).
# A failed migrate aborts before the swap, so the previous www keeps serving.
#
# Usage (from repo root, Git Bash / Linux / macOS):
#   bash scripts/deploy-hosting.sh
#   bash scripts/deploy-hosting.sh --skip-build   # CI already ran npm ci / build
#   bash scripts/deploy-hosting.sh --pack-only    # pack and check, do not upload
#
# Env:
#   REMOTE_USER REMOTE_HOST REMOTE_SITE SSH_KEY REMOTE_HOST_IP REMOTE_PORT RELEASE_ID
#
# Do not use SCP / appleboy. Do not run npm run build on the server.

set -euo pipefail

SKIP_BUILD=0
PACK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --pack-only) PACK_ONLY=1; SKIP_BUILD=1 ;;
    -h|--help)
      sed -n '2,17p' "$0"
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

if [ "$PACK_ONLY" -eq 0 ] && [ ! -f "$SSH_KEY" ]; then
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

# scripts/migrate.mjs imports ./migrate-sql.mjs and reads scripts/sql.
# mysql2 is a production dependency (npm install --omit=dev on the host).
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
  scripts/migrate.mjs
  scripts/migrate-sql.mjs
  scripts/sql
)

for path in "${PACK_PATHS[@]}"; do
  if [ ! -e "$path" ]; then
    echo "Cannot pack: missing $path" >&2
    exit 1
  fi
done

ARCHIVE="$(mktemp /tmp/nmt-release-XXXXXX.tar.gz)"
ARCHIVE_LIST="$(mktemp /tmp/nmt-release-list-XXXXXX)"
REMOTE_ARCHIVE="/home/${REMOTE_USER}/nmt-release-${RELEASE_ID}.tar.gz"
cleanup_local() { rm -f "$ARCHIVE" "$ARCHIVE_LIST"; }
trap cleanup_local EXIT

echo "==> Packing release ${RELEASE_ID} (full src, migrate scripts, rewritten .next)..."
tar \
  --exclude='.next/cache' \
  --exclude='.next/trace' \
  --exclude='.next/diagnostics' \
  --exclude='**/*.test.ts' \
  --exclude='**/*.test.js' \
  --exclude='**/*.test.tsx' \
  -czf "$ARCHIVE" \
  "${PACK_PATHS[@]}"

# List once to a file. `tar -tzf | grep -q` is wrong under pipefail:
# grep exits on the first hit, tar gets SIGPIPE (141), and a file that
# is in the archive is reported missing. The release never uploads.
tar -tzf "$ARCHIVE" > "$ARCHIVE_LIST"

archive_has() {
  grep -qxF -- "$1" "$ARCHIVE_LIST"
}
for entry in scripts/migrate.mjs scripts/migrate-sql.mjs; do
  if ! archive_has "$entry"; then
    echo "Release archive is missing ${entry}" >&2
    exit 1
  fi
done
if ! grep -qE '^scripts/sql/[^/]*\.sql$' "$ARCHIVE_LIST"; then
  echo "Release archive is missing scripts/sql/*.sql" >&2
  exit 1
fi

ls -lh "$ARCHIVE"
echo "Archive listing: $(wc -l < "$ARCHIVE_LIST") entries"

if [ "$PACK_ONLY" -eq 1 ]; then
  echo "OK: release archive includes migrate scripts; not uploading."
  exit 0
fi

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

  if grep -q '^SITE_URL=' "$dest"; then
    sed -i 's|^SITE_URL=.*|SITE_URL=https://nmt.in.ua|' "$dest"
  else
    printf '\nSITE_URL=https://nmt.in.ua\n' >> "$dest"
  fi
  if grep -q '^MAIL_SITE_URL=' "$dest"; then
    sed -i 's|^MAIL_SITE_URL=.*|MAIL_SITE_URL=https://nmt.in.ua|' "$dest"
  else
    printf '\nMAIL_SITE_URL=https://nmt.in.ua\n' >> "$dest"
  fi
  if grep -q '^NEXT_PUBLIC_SITE_URL=' "$dest"; then
    sed -i 's|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=https://nmt.in.ua|' "$dest"
  else
    printf '\nNEXT_PUBLIC_SITE_URL=https://nmt.in.ua\n' >> "$dest"
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
mkdir -p "${APP_ROOT}/tmp"
chmod 700 "${APP_ROOT}/tmp" 2>/dev/null || true
# Subshell: do not cd this script into STAGE (mv would take us with it).
(
  cd "$STAGE"
  export TMPDIR="${APP_ROOT}/tmp"
  printf 'ignore-scripts=false\n' > .npmrc
  npm_config_ignore_scripts=false npm install --omit=dev --no-audit --no-fund --prefer-offline
)

if [ ! -d "${STAGE}/node_modules/next" ]; then
  echo "Staging install did not produce node_modules/next" >&2
  rm -rf "$STAGE"
  exit 1
fi

if [ ! -f "${STAGE}/scripts/migrate.mjs" ] || [ ! -d "${STAGE}/scripts/sql" ] || [ ! -d "${STAGE}/node_modules/mysql2" ]; then
  echo "Release cannot migrate (scripts/migrate.mjs, scripts/sql, or mysql2 missing); leaving the live site on the previous release." >&2
  rm -rf "$STAGE"
  exit 1
fi

echo "==> npm run migrate in staging, before the swap..."
# .env.production is already in STAGE. migrate.mjs loads it. Failure exits
# before stop_site_node, so the live release is untouched.
(
  cd "$STAGE"
  export TMPDIR="${APP_ROOT}/tmp"
  npm run migrate
) || {
  echo "Migration failed; leaving the live site on the previous release." >&2
  rm -rf "$STAGE"
  exit 1
}

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

clean_shared_php_tmp

echo "OK: nmt.in.ua is up (BUILD_ID=$(cat "${SITE}/.next/BUILD_ID") release=${RELEASE_ID})"
REMOTE
} | "${SSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_APPLY"

echo "==> Done. Check https://nmt.in.ua/"
