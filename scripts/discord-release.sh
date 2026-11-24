#!/usr/bin/env bash
# Post the release embed used by Release Discord and by the release workflow
# after a confirmed production deploy. Argument: path to release JSON with
# tagName, name, body, and url (as `gh release view --json` returns).
#
# DISCORD_WEBHOOK is required and must be https. It is never printed.
# DISCORD_COMMIT_SHA, when set, skips the tag-to-commit lookup (tests).
# DISCORD_DRY_RUN=1 writes the payload JSON to stdout and does not POST.

set -euo pipefail

release_json="${1:-}"
if [ -z "$release_json" ] || [ ! -f "$release_json" ]; then
  echo "::error::Release JSON path is missing." >&2
  exit 1
fi

if [ -z "${DISCORD_WEBHOOK:-}" ]; then
  echo "::error::DISCORD_WEBHOOK is empty." >&2
  exit 1
fi

case "${DISCORD_WEBHOOK}" in
  https://*) ;;
  *)
    echo "::error::DISCORD_WEBHOOK must be an https URL." >&2
    exit 1
    ;;
esac

tag_name="$(jq -r '.tagName // empty' "$release_json")"
html_url="$(jq -r '.url // empty' "$release_json")"
if [ -z "$tag_name" ] || [[ "$tag_name" =~ [[:space:]] ]]; then
  echo "::error::Release tag is missing or contains whitespace." >&2
  exit 1
fi
if [[ ! "$html_url" =~ ^https://[^[:space:]]+$ ]]; then
  echo "::error::Release URL is missing or invalid." >&2
  exit 1
fi

if [ -n "${DISCORD_COMMIT_SHA:-}" ]; then
  full_sha="$DISCORD_COMMIT_SHA"
else
  if [ -z "${GITHUB_REPOSITORY:-}" ]; then
    echo "::error::GITHUB_REPOSITORY is empty." >&2
    exit 1
  fi
  encoded_tag="$(jq -rn --arg t "$tag_name" '$t | @uri')"
  full_sha="$(gh api --method GET "repos/${GITHUB_REPOSITORY}/commits/${encoded_tag}" --jq '.sha')"
fi

if [[ ! "$full_sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "::error::Could not resolve a commit SHA for the release tag." >&2
  exit 1
fi
short_sha="${full_sha:0:7}"

payload_json="$(mktemp)"
curl_err="$(mktemp)"
curl_body="$(mktemp)"
cleanup() {
  rm -f "$payload_json" "$curl_err" "$curl_body"
}
trap cleanup EXIT

jq -nc \
  --slurpfile release "$release_json" \
  --arg sha "$short_sha" \
  --arg username 'nmt.in.ua · реліз' \
  --arg footer 'tony-kobs/nmt.in.ua' \
  '
  ($release[0].tagName // "") as $tag
  | ($release[0].name // "") as $name
  | ($release[0].body // "") as $body
  | ($release[0].url // "") as $url
  | ("`" + $sha + "`") as $sha_line
  | (if ($body | length) > 1500 then ($body[0:1500] + "…") else $body end) as $body_short
  | ([$name, $body_short, $sha_line] | map(select(. != "")) | join("\n\n")) as $joined
  | (
      if ($joined | length) <= 4096 then
        $joined
      else
        ("\n\n" + $sha_line) as $suffix
        | (4096 - ($suffix | length) - 1) as $keep
        | if $keep < 1 then
            $sha_line
          else
            ($joined[0:$keep] + "…" + $suffix)
          end
      end
    ) as $description
  | ("nmt.in.ua " + $tag) as $raw_title
  | (if ($raw_title | length) > 256 then ($raw_title[0:255] + "…") else $raw_title end) as $title
  | {
      username: $username,
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: $title,
          url: $url,
          description: $description,
          footer: { text: $footer }
        }
      ]
    }
  ' > "$payload_json"

if ! jq -e --arg sha "$short_sha" '
  .username == "nmt.in.ua · реліз"
  and (.embeds | length) == 1
  and .embeds[0].footer.text == "tony-kobs/nmt.in.ua"
  and (.embeds[0].title | startswith("nmt.in.ua "))
  and (.embeds[0].url | startswith("https://"))
  and (.embeds[0].description | contains($sha))
  and (.embeds[0].description | length) <= 4096
  and (.embeds[0].title | length) <= 256
  and .allowed_mentions.parse == []
' "$payload_json" >/dev/null; then
  echo "::error::Refusing to post an invalid Discord payload." >&2
  exit 1
fi

if [ "${DISCORD_DRY_RUN:-}" = "1" ]; then
  cat "$payload_json"
  exit 0
fi

redact_file() {
  python3 - "$1" <<'PY' >&2
import os, sys
from urllib.parse import urlparse

secret = os.environ.get("DISCORD_WEBHOOK", "")
with open(sys.argv[1], "r", encoding="utf-8", errors="replace") as fh:
    text = fh.read()
if secret:
    text = text.replace(secret, "[REDACTED]")
    parts = [part for part in urlparse(secret).path.split("/") if part]
    if parts and len(parts[-1]) >= 8:
        text = text.replace(parts[-1], "[REDACTED]")
sys.stderr.write(text)
if text and not text.endswith("\n"):
    sys.stderr.write("\n")
PY
}

set +e
http_code="$(
  curl --silent --show-error \
    --connect-timeout 10 \
    --max-time 30 \
    --output "$curl_body" \
    --write-out '%{http_code}' \
    --request POST \
    --header 'Content-Type: application/json' \
    --data-binary @"$payload_json" \
    --url "$DISCORD_WEBHOOK" \
    2>"$curl_err"
)"
curl_status=$?
set -e

if [ "$curl_status" -ne 0 ]; then
  echo "::error::Discord webhook request failed before an HTTP status." >&2
  redact_file "$curl_err" || echo "(Discord error body omitted)" >&2
  exit 1
fi

case "$http_code" in
  2??)
    echo "Discord notification sent (HTTP ${http_code})."
    ;;
  *)
    echo "::error::Discord webhook returned HTTP ${http_code}." >&2
    redact_file "$curl_body" || echo "(Discord response body omitted)" >&2
    exit 1
    ;;
esac
