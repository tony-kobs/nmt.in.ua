#!/usr/bin/env bash
# Next 16 webpack embeds absolute build-machine paths in RSC client manifests.
# A GitHub Actions build then 500s on hosting: modules live at
# /home/runner/work/nmt.in.ua/... which does not exist on the server.
#
# Usage (from repo root, after npm run build):
#   bash scripts/rewrite-next-build-paths.sh
#   bash scripts/rewrite-next-build-paths.sh /home/levelhst/nmt.in.ua/www
#
# Replaces GITHUB_WORKSPACE and the current repo root with the hosting www path.

set -euo pipefail

SITE="${1:-${REMOTE_SITE:-/home/levelhst/nmt.in.ua/www}}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -d .next ]; then
  echo "No .next directory. Run npm run build first." >&2
  exit 1
fi

rewrite() {
  local from="$1"
  local to="$2"
  if [ -z "$from" ] || [ "$from" = "$to" ]; then
    return 0
  fi
  # Skip if this prefix does not appear — common for a local Windows build.
  if ! grep -R --binary-files=without-match -F -q -- "$from" .next 2>/dev/null; then
    return 0
  fi
  echo "==> Rewriting ${from} -> ${to} in .next"
  if ! command -v perl >/dev/null 2>&1; then
    echo "perl is required to rewrite .next paths" >&2
    exit 1
  fi
  find .next -type f \( \
    -name '*.js' -o -name '*.json' -o -name '*.rsc' -o -name '*.meta' \
  \) -print0 | while IFS= read -r -d '' file; do
    perl -0pi -e "s{\Q${from}\E}{${to}}g" "$file"
  done
}

rewrite "${GITHUB_WORKSPACE:-}" "$SITE"
rewrite "$ROOT" "$SITE"
# Actions checkout default, in case GITHUB_WORKSPACE was unset at pack time.
rewrite "/home/runner/work/nmt.in.ua/nmt.in.ua" "$SITE"

if grep -R --binary-files=without-match -F -q -- "/home/runner/work/" .next 2>/dev/null; then
  echo "Still have /home/runner/work paths in .next after rewrite:" >&2
  grep -R --binary-files=without-match -F -n -- "/home/runner/work/" .next | head -n 20 >&2
  exit 1
fi

echo "OK: .next paths are portable for ${SITE}"
