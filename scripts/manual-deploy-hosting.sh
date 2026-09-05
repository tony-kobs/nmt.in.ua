#!/usr/bin/env bash
# Back-compat name. Same as scripts/deploy-hosting.sh
exec "$(cd "$(dirname "$0")" && pwd)/deploy-hosting.sh" "$@"
