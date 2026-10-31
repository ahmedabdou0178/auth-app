#!/usr/bin/env bash
# Renders docker-compose.yml + docker-compose.prod.yml and fails unless the API runs with
# production-safe settings (NODE_ENV=production, an https CORS_ORIGIN, COOKIE_SECURE=true,
# SWAGGER_ENABLED=false) and the web container isn't published on every interface (Docker
# ports bypass host firewalls). Never prints secret values.
#
# CORS_ORIGIN comes from the environment (the CI repository variable). With STRICT=true (pushes
# to main) it and the secrets are required; otherwise stand-ins are used to check the overlay.
set -euo pipefail

cd "$(dirname "$0")/.."

strict="${STRICT:-false}"

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    if [[ "$strict" == "true" ]]; then
      echo "::error::$name must be set" >&2
      exit 1
    fi
    export "$name=$2"
  fi
}

require CORS_ORIGIN "https://app.example.com"
require MONGO_ROOT_PASSWORD "stand-in"
require MONGO_APP_PASSWORD "stand-in"
require REDIS_PASSWORD "stand-in"
export GHCR_OWNER="${GHCR_OWNER:-owner}"

# Defines run_compose with a Docker Compose >= 2.24 (the overlay uses `!reset` / `!override`).
# shellcheck source=scripts/lib/compose.sh
source "$PWD/scripts/lib/compose.sh"
rendered="$(run_compose -f docker-compose.yml -f docker-compose.prod.yml config --format json)"

value() {
  printf '%s' "$rendered" | python3 -c \
    "import json, sys; print(json.load(sys.stdin)['services']['api']['environment'].get('$1', ''))"
}

failures=0
check() {
  local name="$1" actual="$2" expected_desc="$3" ok="$4"
  if [[ "$ok" == "true" ]]; then
    echo "ok   $name ($expected_desc)"
  else
    echo "FAIL $name: expected $expected_desc, got '$actual'" >&2
    failures=$((failures + 1))
  fi
}

node_env="$(value NODE_ENV)"
cors="$(value CORS_ORIGIN)"
cookie="$(value COOKIE_SECURE)"
swagger="$(value SWAGGER_ENABLED)"
# Host addresses the web container is published on (empty = every interface).
web_binds="$(printf '%s' "$rendered" | python3 -c \
  "import json, sys; print(' '.join(p.get('host_ip', '') or '*' for p in json.load(sys.stdin)['services']['web'].get('ports', [])))")"

check NODE_ENV "$node_env" "production" "$([[ "$node_env" == "production" ]] && echo true || echo false)"
check CORS_ORIGIN "$cors" "an https origin" "$([[ "$cors" == https://* ]] && echo true || echo false)"
check COOKIE_SECURE "$cookie" "true" "$([[ "$cookie" == "true" ]] && echo true || echo false)"
check SWAGGER_ENABLED "$swagger" "false" "$([[ "$swagger" == "false" ]] && echo true || echo false)"
public_bind=false
for bind in $web_binds; do
  [[ "$bind" == "*" || "$bind" == "0.0.0.0" || "$bind" == "::" ]] && public_bind=true
done
check "web port binding" "$web_binds" "a specific (private) address, not every interface" \
  "$([[ "$public_bind" == "false" ]] && echo true || echo false)"

if ((failures > 0)); then
  echo "Production config check failed ($failures problem(s))." >&2
  exit 1
fi
echo "Production config check passed."
