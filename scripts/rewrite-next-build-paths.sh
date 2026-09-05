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
# Ignores .next/trace and diagnostics — those are build telemetry, not runtime.

set -euo pipefail

SITE="${1:-${REMOTE_SITE:-/home/levelhst/nmt.in.ua/www}}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -d .next ]; then
  echo "No .next directory. Run npm run build first." >&2
  exit 1
fi

runtime_files() {
  find .next -type f \
    ! -path '.next/cache/*' \
    ! -path '.next/trace' \
    ! -path '.next/diagnostics/*' \
    ! -name 'trace' \
    \( -name '*.js' -o -name '*.json' -o -name '*.rsc' -o -name '*.meta' \) \
    -print0
}

rewrite() {
  local from="$1"
  local to="$2"
  if [ -z "$from" ] || [ "$from" = "$to" ]; then
    return 0
  fi
  if ! grep -R --binary-files=without-match -F -q -- "$from" \
    --exclude-dir=cache --exclude-dir=diagnostics --exclude=trace \
    .next 2>/dev/null; then
    return 0
  fi
  echo "==> Rewriting ${from} -> ${to} in .next (runtime files)"
  if ! command -v perl >/dev/null 2>&1; then
    echo "perl is required to rewrite .next paths" >&2
    exit 1
  fi
  runtime_files | while IFS= read -r -d '' file; do
    perl -0pi -e "s{\Q${from}\E}{${to}}g" "$file"
  done
}

# Same checkout path can appear three times; rewrite each unique prefix once.
uniq_from=""
for candidate in "${GITHUB_WORKSPACE:-}" "$ROOT" "/home/runner/work/nmt.in.ua/nmt.in.ua"; do
  case " ${uniq_from} " in
    *" ${candidate} "*) continue ;;
  esac
  uniq_from="${uniq_from} ${candidate}"
  rewrite "$candidate" "$SITE"
done

leftovers="$(runtime_files | xargs -0 -r grep -F -l -- "/home/runner/work/" 2>/dev/null || true)"
if [ -n "$leftovers" ]; then
  echo "Still have /home/runner/work paths in runtime .next files:" >&2
  printf '%s\n' "$leftovers" | head -n 20 >&2
  exit 1
fi

echo "OK: .next runtime paths are portable for ${SITE}"
