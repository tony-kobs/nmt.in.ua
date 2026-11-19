#!/usr/bin/env bash
# Print the next vX.Y.Z for RELEASE_SHA (default HEAD) in the current repo.
#
# Default bump is patch. Minor when RELEASE_LABELS contains release:minor,
# or any commit subject since the latest vX.Y.Z tag is a Conventional Commit
# feat (feat:, feat(scope):, optional !). Major only when RELEASE_LABELS
# contains release:major. A breaking-change "!" stays minor unless that label
# is set. Major wins over minor and over feat.
#
# package.json version is not used.
# When no vX.Y.Z tag exists yet, the result is v1.0.0. Commit subjects and
# labels are not read: that range would be the whole history.
# After a tag exists, RELEASE_LABELS is newline- or comma-separated.
# Unset and empty both mean no labels. Stdout is only the version.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=release-lib.sh
. "$SCRIPT_DIR/release-lib.sh"

sha="$(git rev-parse --verify "${RELEASE_SHA:-HEAD}^{commit}")"

has_label() {
  local want="$1"
  local found
  # Read the whole list. grep -q can close the pipe early, and pipefail then
  # reports SIGPIPE instead of a match, which would drop a major or minor bump.
  found="$(
    printf '%s\n' "${RELEASE_LABELS:-}" \
      | tr ',' '\n' \
      | tr -d '\r' \
      | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
      | grep -Fx -- "$want" \
      || true
  )"
  [ -n "$found" ]
}

latest="$(latest_semver_tag)"
# The site is already in production. The first numbered release is v1.0.0.
# Do not walk commit subjects or pull requests: there is no previous tag, so
# that range is the whole history.
if [ -z "$latest" ]; then
  echo "No semver tag yet. First release is v1.0.0; history is not scanned." >&2
  printf '%s\n' "v1.0.0"
  exit 0
fi

current="$latest"
rest="${current#v}"
IFS=. read -r major minor patch <<< "$rest"

reason="patch"
subjects="$(subjects_since_latest_tag "$sha")"
if has_label "release:major"; then
  reason="release:major"
elif has_label "release:minor"; then
  reason="release:minor"
elif printf '%s\n' "$subjects" | grep -E '^feat(\([^)]+\))?(!)?:' >/dev/null; then
  reason="feat"
fi

case "$reason" in
  release:major) version="$(printf 'v%d.0.0' "$((major + 1))")" ;;
  release:minor|feat) version="$(printf 'v%d.%d.0' "$major" "$((minor + 1))")" ;;
  patch) version="$(printf 'v%d.%d.%d' "$major" "$minor" "$((patch + 1))")" ;;
  *)
    echo "::error::Unknown version bump '${reason}'." >&2
    exit 1
    ;;
esac

echo "Version bump: ${reason} from ${current} to ${version}." >&2
printf '%s\n' "$version"
