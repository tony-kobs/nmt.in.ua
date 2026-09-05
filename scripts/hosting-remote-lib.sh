# Sourced on the hosting box by deploy-hosting.sh / rollback-hosting.sh.
# Expects: SITE HOST PORT APP_ROOT PREVIOUS FAILED STAGE PIDFILE LOG

nmt_self_pid() { printf '%s\n' "$$"; }

nmt_listener_pids() {
  local hp="${HOST}:${PORT}"
  if command -v ss >/dev/null 2>&1; then
    ss -lptn 2>/dev/null | awk -v hp="$hp" '
      index($0, hp) {
        while (match($0, /pid=[0-9]+/)) {
          print substr($0, RSTART + 4, RLENGTH - 4)
          $0 = substr($0, RSTART + RLENGTH)
        }
      }'
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP@"${hp}" -sTCP:LISTEN -t 2>/dev/null || true
  fi
}

nmt_dir_pids() {
  local pid cwd
  while read -r pid _; do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "${PPID:-}" ] && continue
    cwd="$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)"
    case "$cwd" in
      "$SITE" | "$PREVIOUS" | "$FAILED")
        printf '%s\n' "$pid"
        ;;
    esac
  done < <(ps -u "$(id -un)" -o pid=,args= 2>/dev/null || true)
}

nmt_unique_pids() {
  sort -u | grep -E '^[0-9]+$' || true
}

nmt_kill_pids() {
  local pid
  for pid in "$@"; do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "${PPID:-}" ] && continue
    kill "$pid" 2>/dev/null || true
  done
}

stop_site_node() {
  local pid raw
  if [ -f "$PIDFILE" ]; then
    pid="$(tr -cd '0-9' < "$PIDFILE" || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "stop pidfile $pid cwd=$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$PIDFILE"
  fi

  raw="$( { nmt_listener_pids; nmt_dir_pids; } | nmt_unique_pids | tr '\n' ' ' )"
  if [ -n "${raw// /}" ]; then
    echo "stop nmt pids ${raw}"
    # shellcheck disable=SC2086
    nmt_kill_pids $raw
  fi

  sleep 2
  raw="$( { nmt_listener_pids; nmt_dir_pids; } | nmt_unique_pids | tr '\n' ' ' )"
  if [ -n "${raw// /}" ]; then
    echo "kill -9 nmt pids ${raw}"
    # shellcheck disable=SC2086
    kill -9 $raw 2>/dev/null || true
  fi
}

wait_nmt_port_free() {
  local i raw
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    raw="$(nmt_listener_pids | nmt_unique_pids | tr '\n' ' ')"
    if [ -z "${raw// /}" ]; then
      return 0
    fi
    echo "port ${HOST}:${PORT} still held by ${raw} (wait ${i})"
    # shellcheck disable=SC2086
    kill -9 $raw 2>/dev/null || true
    sleep 1
  done
  echo "Refusing to move www: ${HOST}:${PORT} is still in use. Process would follow mv." >&2
  return 1
}

start_site_node() {
  mkdir -p "$(dirname "$LOG")"
  (
    cd "$SITE"
    export NODE_ENV=production PORT HOST
    nohup node server.js --port="$PORT" --host="$HOST" >>"$LOG" 2>&1 &
    echo $! > "$PIDFILE"
  )
  local pid
  pid="$(tr -cd '0-9' < "$PIDFILE" || true)"
  local cwd=""
  if [ -n "$pid" ]; then
    cwd="$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)"
  fi
  echo "started pid=${pid} cwd=${cwd}"
  if [ -n "$pid" ] && [ "$cwd" != "$SITE" ]; then
    echo "Refusing to keep Node whose cwd is '${cwd}', expected '${SITE}'." >&2
    kill -9 "$pid" 2>/dev/null || true
    return 1
  fi
}

health_ok() {
  case "$1" in
    200 | 201 | 204 | 301 | 302 | 303 | 307 | 308) return 0 ;;
    *) return 1 ;;
  esac
}

wait_health() {
  local i code
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    code="$(curl -sS -o /tmp/nmt-health.body -w '%{http_code}' --max-time 10 "http://${HOST}:${PORT}/" || echo 000)"
    echo "health try ${i} -> ${code}"
    if health_ok "$code"; then
      return 0
    fi
    sleep 2
  done
  echo "---- last 60 lines of ${LOG} ----" >&2
  tail -n 60 "$LOG" >&2 || true
  return 1
}
