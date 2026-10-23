# Sourced on ukraine.com.ua. That bash has no /dev/fd process substitution
# and no ss/lsof. The panel Node manager owns the process. It runs
#   cd $site && npm run start -- --port=3000 --host=127.x.x.x
# which is package.json "start" = node server.js, with HOST and PORT in the
# environment. This file must not nohup its own copy.
# Expects: SITE HOST PORT PIDFILE LOG
# Panel restart also expects ADM_TOOLS_TOKEN and ADM_TOOLS_HOST_ID.

# Listeners for this site only. Do not match the deploy shell: it exports
# HOST= but its command is not node/npm and its cwd is the account root.
nmt_pids() {
  local pid args cwd site_root
  site_root="$(dirname "$SITE")"
  # -ww: otherwise ssh ps truncates before --host=127.1.10.37.
  ps -u "$(id -un)" -ww -o pid=,args= 2>/dev/null | while read -r pid args; do
    [ -n "${pid:-}" ] || continue
    case "$args" in
      *127.1.10.37*)
        case "$args" in
          *'node server.js'*|*'npm run start'*)
            echo "$pid"
            continue
            ;;
        esac
        ;;
    esac
    cwd="$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)"
    case "$cwd" in
      "$SITE"|"$SITE"/*|"${site_root}/releases"/*)
        case "$args" in
          *node*|*npm*)
            echo "$pid"
            ;;
        esac
        ;;
    esac
  done
  return 0
}

nmt_kill_list() {
  local pid sig="${2:-}"
  for pid in $1; do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "${PPID:-}" ] && continue
    if [ -n "$sig" ]; then
      kill "$sig" "$pid" 2>/dev/null || true
    else
      kill "$pid" 2>/dev/null || true
    fi
  done
  return 0
}

stop_site_node() {
  local pid raw
  if [ -f "$PIDFILE" ]; then
    pid="$(tr -cd '0-9' < "$PIDFILE" || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "stop legacy pidfile $pid"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$PIDFILE"
    echo "removed legacy pidfile ${PIDFILE}"
  fi

  raw="$(nmt_pids | tr '\n' ' ')"
  if [ -n "${raw# }" ]; then
    echo "stop nmt pids ${raw}"
    nmt_kill_list "$raw" ""
  fi
  sleep 2
  raw="$(nmt_pids | tr '\n' ' ')"
  if [ -n "${raw# }" ]; then
    echo "kill -9 nmt pids ${raw}"
    nmt_kill_list "$raw" "-9"
  fi
  return 0
}

wait_nmt_port_free() {
  local i raw
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    raw="$(nmt_pids | tr '\n' ' ')"
    if [ -z "${raw# }" ]; then
      return 0
    fi
    echo "nmt still running: ${raw} (wait ${i})"
    nmt_kill_list "$raw" "-9"
    sleep 1
  done
  echo "Refusing to move www: nmt Node is still running. Process would follow mv." >&2
  return 1
}

# Account-wide PHP upload_tmp_dir is $HOME/.system/tmp (also ~/tmp).
# Node/npm must not share it with WordPress/Moodle on this user.
nmt_tmp_dir() {
  printf '%s' "$(dirname "$SITE")/tmp"
}

ensure_nmt_tmp() {
  local d
  d="$(nmt_tmp_dir)"
  mkdir -p "$d"
  chmod 700 "$d" 2>/dev/null || true
  printf '%s' "$d"
}

# Leftover PHP in the shared tmp is what the host AV flagged (Tiny File Manager
# / obfuscated dropper). Session files sess_* stay; they belong to PHP apps.
clean_shared_php_tmp() {
  local dir="${HOME}/.system/tmp" f base head
  [ -d "$dir" ] || return 0
  for f in "$dir"/*; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    case "$base" in
      sess_*) continue ;;
    esac
    head="$(dd if="$f" bs=5 count=1 2>/dev/null || true)"
    case "$head" in
      '<?php')
        rm -f "$f" && echo "removed php tmp ${base}"
        ;;
    esac
  done
  return 0
}

# Secrets stay in the environment of this shell. Never print the token.
require_panel_api() {
  if [ -z "${ADM_TOOLS_TOKEN:-}" ] || [ -z "${ADM_TOOLS_HOST_ID:-}" ]; then
    echo "Refusing to stop Node: ADM_TOOLS_TOKEN or ADM_TOOLS_HOST_ID is empty." >&2
    echo "Create an API token in adm.tools and set both GitHub Actions secrets." >&2
    echo "This deploy does not start its own Node process." >&2
    return 1
  fi
  case "$ADM_TOOLS_HOST_ID" in
    *[!0-9]*)
      echo "ADM_TOOLS_HOST_ID must be the numeric host_id of nmt.in.ua." >&2
      return 1
      ;;
  esac
  return 0
}

# Force-restart via the panel Node manager (the «Примусовий перезапуск» button).
# POST https://adm.tools/action/hosting/account/nodejs/reload/
restart_panel_node() {
  local body code
  require_panel_api || return 1
  body="$(ensure_nmt_tmp)/nmt-panel.body"
  echo "panel nodejs reload host_id=${ADM_TOOLS_HOST_ID}"
  code="$(
    curl -sS -o "$body" -w '%{http_code}' --max-time 40 \
      -X POST "https://adm.tools/action/hosting/account/nodejs/reload/" \
      -H "Authorization: Bearer ${ADM_TOOLS_TOKEN}" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -H "User-Agent: nmt-deploy" \
      --data "host_id=${ADM_TOOLS_HOST_ID}" || echo 000
  )"
  if [ "$code" = "200" ] && grep -Eq '"result"[[:space:]]*:[[:space:]]*true' "$body"; then
    rm -f "$body"
    echo "panel nodejs reload accepted"
    return 0
  fi
  echo "panel nodejs reload failed HTTP ${code}" >&2
  echo "Live Node was not started by this script. In the panel open Node.js settings and press «Примусовий перезапуск»." >&2
  if [ -f "$body" ]; then
    sed -e 's/[Bb]earer [A-Za-z0-9._~+/-]*/Bearer ***/g' "$body" | head -c 400 >&2 || true
    echo >&2
    rm -f "$body"
  fi
  return 1
}

# $1 is the BUILD_ID of the tree that must be listening.
wait_health() {
  local build_id="${1:-}"
  local i code body
  body="$(ensure_nmt_tmp)/nmt-health.body"
  if [ -z "$build_id" ]; then
    echo "wait_health needs the release BUILD_ID" >&2
    return 1
  fi
  for ((i = 1; i <= 40; i++)); do
    code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 10 "http://${HOST}:${PORT}/health" || echo 000)"
    echo "health try ${i} -> ${code}"
    if [ "$code" = "200" ] && grep -qF -- "$build_id" "$body"; then
      rm -f "$body"
      return 0
    fi
    sleep 3
  done
  rm -f "$body"
  echo "---- last 60 lines of ${LOG} ----" >&2
  tail -n 60 "$LOG" >&2 || true
  return 1
}
