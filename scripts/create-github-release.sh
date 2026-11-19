#!/usr/bin/env bash
# Create the GitHub release for GITHUB_SHA after a confirmed production deploy.
#
# Skips when any tag already points at that commit (stdout says so, and
# GITHUB_OUTPUT gets skip=true). Otherwise computes the next version, runs
# `gh release create` with --generate-notes, and writes skip=false, tag, and
# release_json for scripts/discord-release.sh.
#
# RELEASE_LABELS, when set (even to empty), is the label list and skips the
# GitHub lookup. When unset, labels are read from pull requests in the range
# since the latest vX.Y.Z tag.
#
# DRY_RUN=1 prints the version and does not call gh. Never prints secrets.
# package.json version is not used.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=release-lib.sh
. "$SCRIPT_DIR/release-lib.sh"

export GH_PROMPT_DISABLED=1

sha="${GITHUB_SHA:-}"
if [[ ! "$sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "::error::GITHUB_SHA is not a full commit SHA." >&2
  exit 1
fi
sha="$(git rev-parse --verify "${sha}^{commit}")"

write_output() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s\n' "$1" >> "$GITHUB_OUTPUT"
  fi
}

if [ -n "$(git tag --points-at "$sha")" ]; then
  echo "Commit ${sha} is already tagged; skipping release."
  write_output "skip=true"
  exit 0
fi

collect_release_labels() {
  local commit number tmp subjects
  tmp="$(mktemp)"

  while IFS= read -r commit; do
    [ -z "$commit" ] && continue
    if ! gh api --paginate \
      -H "Accept: application/vnd.github+json" \
      "repos/${GITHUB_REPOSITORY}/commits/${commit}/pulls" \
      --jq '.[] | .labels[].name' >> "$tmp"; then
      rm -f "$tmp"
      echo "::error::Could not read pull requests for ${commit}." >&2
      return 1
    fi
  done < <(commits_since_latest_tag "$sha")

  subjects="$(subjects_since_latest_tag "$sha")"
  while IFS= read -r number; do
    [ -z "$number" ] && continue
    if ! gh pr view "$number" --repo "$GITHUB_REPOSITORY" --json labels \
      --jq '.labels[].name' >> "$tmp"; then
      rm -f "$tmp"
      echo "::error::Could not read labels for pull request #${number}." >&2
      return 1
    fi
  done < <(
    printf '%s\n' "$subjects" \
      | grep -oE 'Merge pull request #[0-9]+|\(#[0-9]+\)' \
      | grep -oE '[0-9]+' \
      | sort -u \
      || true
  )

  sort -u "$tmp"
  rm -f "$tmp"
}

if [ -z "${RELEASE_LABELS+x}" ]; then
  if [ -z "${GITHUB_REPOSITORY:-}" ]; then
    echo "::error::GITHUB_REPOSITORY is empty." >&2
    exit 1
  fi
  RELEASE_LABELS="$(collect_release_labels)"
fi

if [ -n "${RELEASE_LABELS//[[:space:]]/}" ]; then
  echo "Pull request labels:" >&2
  printf '%s\n' "$RELEASE_LABELS" | sed '/^$/d' >&2
else
  echo "No pull request labels in range." >&2
fi

version="$(
  RELEASE_SHA="$sha" RELEASE_LABELS="$RELEASE_LABELS" \
    "$SCRIPT_DIR/next-release-version.sh"
)"

if [[ ! "$version" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "::error::Refusing to create a release with version '${version}'." >&2
  exit 1
fi

if [ "${DRY_RUN:-}" = "1" ]; then
  printf '%s\n' "$version"
  exit 0
fi

if [ -z "${GITHUB_REPOSITORY:-}" ]; then
  echo "::error::GITHUB_REPOSITORY is empty." >&2
  exit 1
fi

echo "Creating release ${version} at ${sha}." >&2
gh release create "$version" \
  --repo "$GITHUB_REPOSITORY" \
  --target "$sha" \
  --title "$version" \
  --generate-notes

release_json="$(mktemp)"
gh release view "$version" --repo "$GITHUB_REPOSITORY" \
  --json tagName,name,body,url > "$release_json"

write_output "skip=false"
write_output "tag=${version}"
write_output "release_json=${release_json}"
echo "Created release ${version}."
