#!/usr/bin/env bash
# DAST: OWASP ZAP against a fresh Docker Compose stack.
#   1. baseline (passive) scan of the web app through nginx
#   2. active scan of the API driven by its OpenAPI spec, with a real signed-in session
# Any alert not accepted in zap-{baseline,api}-rules.tsv fails the run. The stack (and its
# volume) is removed afterwards. Reports: reports/zap-*.{html,json}.
set -euo pipefail

cd "$(dirname "$0")/../.."
mkdir -p reports
# The ZAP container runs as its own user and writes the reports here.
chmod 777 reports

# Pinned by tag and digest.
ZAP_IMAGE="ghcr.io/zaproxy/zaproxy:2.17.0@sha256:030d3df57735dacbb83464854758e674dd9ad01d79d12a129a8e58b1fd384238"
PROJECT="auth-app-dast"
# Baseline: the web app through nginx. API scan: the API itself, so every probed path
# (including ones outside /api) is answered by the API rather than the SPA fallback.
WEB_TARGET="http://web:8080"
API_TARGET="http://api:3000"

# Defines run_compose with a Docker Compose >= 2.24 (the overlay uses `!reset`).
# shellcheck source=scripts/lib/compose.sh
source "$PWD/scripts/lib/compose.sh"
compose() {
  run_compose -p "$PROJECT" \
    -f docker-compose.yml -f scripts/security/docker-compose.dast.yml "$@"
}

# Fresh random credentials for this run only (and nothing from a developer's .env).
MONGO_ROOT_PASSWORD="$(openssl rand -hex 24)"
MONGO_APP_PASSWORD="$(openssl rand -hex 24)"
REDIS_PASSWORD="$(openssl rand -hex 24)"
CORS_ORIGIN="http://localhost:5173"
export MONGO_ROOT_PASSWORD MONGO_APP_PASSWORD REDIS_PASSWORD CORS_ORIGIN

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Starting a fresh stack ($PROJECT)..."
compose --env-file /dev/null up -d --build --wait

echo "Signing up a scanner account..."
scanner_password="Dast-$(openssl rand -hex 12)-1!"
session_json="$(
  compose --env-file /dev/null exec -T -e SCANNER_PASSWORD="$scanner_password" api node --input-type=module -e '
    const res = await fetch("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "dast-scanner@example.com",
        name: "DAST Scanner",
        password: process.env.SCANNER_PASSWORD,
      }),
    });
    if (res.status !== 201) throw new Error("signup failed: " + res.status);
    const sid = res.headers.getSetCookie().find((c) => c.startsWith("sid=")).split(";")[0].slice(4);
    const { csrfToken } = await res.json();
    console.log(JSON.stringify({ sid, csrfToken }));
  '
)"
sid="$(printf '%s' "$session_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["sid"])')"
csrf="$(printf '%s' "$session_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["csrfToken"])')"

network="${PROJECT}_default"
zap() {
  docker run --rm --network "$network" \
    -v "$PWD/reports:/zap/wrk:rw" \
    -v "$PWD/scripts/security:/zap/wrk/rules:ro" \
    "$ZAP_IMAGE" "$@"
}

# Adds the session to every request ZAP sends: session cookie, CSRF token, and the
# Origin + X-Requested-With pair the API requires on session-less cookie routes.
replacer=""
index=0
add_header() {
  replacer+=" -config replacer.full_list(${index}).description=dast-$1"
  replacer+=" -config replacer.full_list(${index}).enabled=true"
  replacer+=" -config replacer.full_list(${index}).matchtype=REQ_HEADER"
  replacer+=" -config replacer.full_list(${index}).matchstr=$1"
  replacer+=" -config replacer.full_list(${index}).regex=false"
  replacer+=" -config replacer.full_list(${index}).replacement=$2"
  index=$((index + 1))
}
add_header Cookie "sid=${sid}"
add_header X-CSRF-Token "$csrf"
add_header X-Requested-With fetch
add_header Origin "$CORS_ORIGIN"

status=0

echo "ZAP baseline scan of the web app..."
zap zap-baseline.py -t "$WEB_TARGET" \
  -c rules/zap-baseline-rules.tsv \
  -r zap-baseline.html -J zap-baseline.json || status=$?
baseline_status=$status

status=0
echo "ZAP active scan of the API (OpenAPI, authenticated)..."
zap zap-api-scan.py -t "$API_TARGET/api/docs-json" -f openapi \
  -c rules/zap-api-rules.tsv \
  -r zap-api.html -J zap-api.json \
  -z "$replacer" || status=$?
api_status=$status

# zap-*.py exit codes: 0 pass, 1 FAIL alerts, 2 WARN alerts, 3 error. Unlisted alerts are WARN,
# so anything but 0 fails.
if ((baseline_status != 0 || api_status != 0)); then
  echo "DAST failed (baseline exit ${baseline_status}, API exit ${api_status}). See reports/zap-*.html." >&2
  exit 1
fi
echo "DAST passed: no unaccepted alerts."
