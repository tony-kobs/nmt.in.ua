#!/bin/bash
# Sequential sweep: cabinet Telegram notifications, then the marathon outbox.
# Installed outside www so a release does not remove it.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="${TELEGRAM_CRON_LOG:-/home/levelhst/nmt.in.ua/tmp/telegram-cron.log}"
if [ -f "$LOG" ]; then
  bytes=$(wc -c < "$LOG" | tr -d ' ')
  if [ "${bytes:-0}" -gt 200000 ]; then
    tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
fi
exec python3 "$DIR/hosting-telegram-cron.py"
