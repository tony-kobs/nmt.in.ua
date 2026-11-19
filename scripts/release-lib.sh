# Shared git helpers for the production release scripts.
# Sourced by other bash scripts. Do not execute directly.

# Highest vX.Y.Z tag in the current repo (no prerelease, no build metadata).
# Prints nothing when no such tag exists.
latest_semver_tag() {
  local tags matched
  tags="$(git tag --list 'v*')"
  matched="$(
    printf '%s\n' "$tags" \
      | grep -E '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
      || true
  )"
  if [ -z "$matched" ]; then
    return 0
  fi
  printf '%s\n' "$matched" | sort -V | tail -n 1
}

# Commit subjects after the latest semver tag, up to and including $1.
subjects_since_latest_tag() {
  local sha="$1"
  local latest
  latest="$(latest_semver_tag)"
  if [ -n "$latest" ]; then
    git --no-pager log "${latest}..${sha}" --format='%s'
  else
    git --no-pager log "$sha" --format='%s'
  fi
}

# Full SHAs in the same range as subjects_since_latest_tag.
commits_since_latest_tag() {
  local sha="$1"
  local latest
  latest="$(latest_semver_tag)"
  if [ -n "$latest" ]; then
    git --no-pager rev-list "${latest}..${sha}"
  else
    git --no-pager rev-list "$sha"
  fi
}
