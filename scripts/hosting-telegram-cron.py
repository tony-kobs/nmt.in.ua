#!/usr/bin/env python3
"""Call the production notification endpoints. Prints counters only, never secrets."""

import json
import pathlib
import sys
import urllib.error
import urllib.request

ENV = pathlib.Path("/home/levelhst/nmt.in.ua/.env.production")
SITE = "https://nmt.in.ua"


def load_env():
    out = {}
    for line in ENV.read_text(encoding="utf-8", errors="replace").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        name, value = raw.split("=", 1)
        out[name.strip()] = value.strip().strip("\"'")
    return out


def post(url, secret, timeout):
    request = urllib.request.Request(
        url,
        data=b"",
        method="POST",
        headers={"Authorization": f"Bearer {secret}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")


def brief(body):
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return "bad-json"
    if not isinstance(data, dict):
        return "bad-json"
    keys = (
        "sent",
        "skipped",
        "failed",
        "rejected",
        "uncertain",
        "processedAccounts",
        "complete",
        "telegramQueued",
        "outboxFailed",
    )
    return json.dumps({key: data[key] for key in keys if key in data}, ensure_ascii=False)


def telegram_sweep(secret):
    cursor = 0
    for _ in range(20):
        status, body = post(
            f"{SITE}/api/telegram/notifications/process?afterAccountId={cursor}",
            secret,
            55,
        )
        if status != 200:
            print("telegram", status)
            return 1
        try:
            result = json.loads(body)
        except json.JSONDecodeError:
            print("telegram", "bad-json")
            return 1
        print("telegram", brief(body))
        if result.get("complete") is True:
            return 0
        nxt = result.get("nextCursor")
        if not isinstance(nxt, int) or nxt <= cursor:
            print("telegram", "bad-cursor")
            return 1
        cursor = nxt
    print("telegram", "incomplete", cursor)
    return 1


def main():
    env = load_env()
    telegram = env.get("TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET", "")
    marathon = env.get("MARATHON_CRON_SECRET", "")
    if not telegram or not marathon:
        print("missing-secret", "telegram" if not telegram else "marathon")
        return 1
    code = telegram_sweep(telegram)
    status, body = post(f"{SITE}/api/marathon/notifications/process", marathon, 70)
    print("marathon", status, brief(body))
    if status != 200:
        return 1
    return code


if __name__ == "__main__":
    sys.exit(main())
