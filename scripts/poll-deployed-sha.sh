#!/usr/bin/env bash
# Poll VERSION_URL until its JSON sha equals EXPECTED_SHA.
#
# VERSION_URL   http(s) URL of GET /api/version (required)
# EXPECTED_SHA  full 40-hex commit sha (required)
# POLL_INTERVAL_SECONDS  delay between attempts (default 15)
# POLL_TIMEOUT_SECONDS   whole-number seconds to keep trying (default 1200)
#
# HTTP 404, connection errors, and a missing sha mean the deploy is still
# in progress (the first deploy of /api/version itself 404s). A different
# full sha is the previous revision and is not a success. When the deadline
# passes without a match, exit 1: the deploy failed or rolled back.

set -euo pipefail

url="${VERSION_URL:-}"
expected="${EXPECTED_SHA:-}"
interval="${POLL_INTERVAL_SECONDS:-15}"
timeout="${POLL_TIMEOUT_SECONDS:-1200}"

if [[ ! "$url" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "::error::VERSION_URL must be an http(s) URL." >&2
  exit 1
fi

if [[ ! "$expected" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "::error::EXPECTED_SHA is not a full commit SHA." >&2
  exit 1
fi
expected="$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')"

if ! [[ "$timeout" =~ ^[0-9]+$ ]] || [ "$timeout" -le 0 ]; then
  echo "::error::POLL_TIMEOUT_SECONDS must be a positive whole number of seconds." >&2
  exit 1
fi

if ! awk -v interval="$interval" 'BEGIN { exit !(interval ~ /^[0-9]+([.][0-9]+)?$/ && interval + 0 > 0) }'; then
  echo "::error::POLL_INTERVAL_SECONDS must be a positive number." >&2
  exit 1
fi

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

start="$(date +%s)"
deadline="$((start + timeout))"
last_sha=""
varied=false

echo "Polling ${url} for ${expected} every ${interval}s for up to ${timeout}s."

while true; do
  now="$(date +%s)"
  if [ "$now" -ge "$deadline" ]; then
    break
  fi

  body="$(mktemp)"
  err="$(mktemp)"
  set +e
  http_code="$(
    curl --silent --show-error --globoff \
      --connect-timeout 10 \
      --max-time 20 \
      --output "$body" \
      --write-out '%{http_code}' \
      --url "$url" \
      2>"$err"
  )"
  curl_status=$?
  set -e
  rm -f "$err"

  if [ "$curl_status" -ne 0 ]; then
    echo "Version endpoint unreachable; still waiting for deploy."
  elif [ "$http_code" = "404" ]; then
    echo "Version endpoint returned 404; still waiting for deploy."
  elif [ "$http_code" = "200" ]; then
    sha="$(jq -er 'if (.sha | type) == "string" then .sha else empty end' "$body" 2>/dev/null || true)"
    sha="$(trim "$sha")"
    sha="$(printf '%s' "$sha" | tr '[:upper:]' '[:lower:]')"
    if [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
      if [ "$sha" = "$expected" ]; then
        rm -f "$body"
        echo "Production deploy confirmed (${sha})."
        exit 0
      fi
      if [ -z "$last_sha" ]; then
        last_sha="$sha"
      elif [ "$last_sha" != "$sha" ]; then
        varied=true
        last_sha="$sha"
      fi
      echo "Production is still on ${sha}; waiting for ${expected}."
    else
      echo "Version endpoint has no deployed SHA yet; still waiting."
    fi
  else
    echo "Version endpoint returned HTTP ${http_code}; still waiting for deploy."
  fi
  rm -f "$body"

  now="$(date +%s)"
  remaining="$((deadline - now))"
  if [ "$remaining" -le 0 ]; then
    break
  fi
  sleep_for="$(awk -v interval="$interval" -v remaining="$remaining" 'BEGIN {
    if (interval + 0 < remaining) printf "%s", interval
    else printf "%s", remaining
  }')"
  sleep "$sleep_for"
done

if [ -n "$last_sha" ] && [ "$varied" != true ]; then
  echo "::error::Deploy failed or rolled back: /api/version stayed at ${last_sha}, expected ${expected}." >&2
elif [ -n "$last_sha" ]; then
  echo "::error::Deploy failed or rolled back: /api/version last reported ${last_sha}, expected ${expected}." >&2
else
  echo "::error::Deploy failed or rolled back: /api/version did not report ${expected} within ${timeout}s." >&2
fi
exit 1
