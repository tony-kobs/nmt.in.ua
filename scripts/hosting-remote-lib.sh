# Sourced on ukraine.com.ua. That bash has no /dev/fd process substitution
# and no ss/lsof. Other sites on this account are started by the panel:
#   cd $site && npm run start -- --port=3000 --host=127.x.x.x
# Expects: SITE HOST PORT PIDFILE LOG

# Only the nmt.in.ua listener. Do not match our SSH bash (it exports HOST= but
# is not "node server.js" / "npm run start").
nmt_pids() {
  ps -u "$(id -un)" -o pid=,args= 2>/dev/null | awk '
    /127\.1\.10\.37/ && (/node server\.js/ || /npm run start/) { print $1 }
  '
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
      echo "stop pidfile $pid"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$PIDFILE"
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

# Same command the hosting panel uses for this site.
start_site_node() {
  mkdir -p "$(dirname "$LOG")"
  (
    cd "$SITE"
    export NODE_ENV=production PORT HOST
    export PATH="/usr/local/node24/bin:/usr/local/bin:/usr/bin:${PATH}"
    nohup npm run start -- --port="$PORT" --host="$HOST" >>"$LOG" 2>&1 &
    echo $! > "$PIDFILE"
  )
  local pid cwd=""
  pid="$(tr -cd '0-9' < "$PIDFILE" || true)"
  echo "started wrapper pid=${pid}"
  return 0
}

health_ok() {
  case "$1" in
    200 | 201 | 204 | 301 | 302 | 303 | 307 | 308) return 0 ;;
    *) return 1 ;;
  esac
}

wait_health() {
  local i code
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
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
