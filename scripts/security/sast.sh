#!/usr/bin/env bash
# SAST: Semgrep over the whole repository. Any finding fails the scan.
# Writes reports/semgrep.sarif (uploaded to GitHub code scanning in CI).
set -euo pipefail

cd "$(dirname "$0")/../.."
mkdir -p reports

# Pinned by tag and digest.
IMAGE="semgrep/semgrep:1.182.0@sha256:4a34048c04fef049f71665047f074cffb00cc3d89482f965a5cd151d589237af"

RULESETS=(
  p/default
  p/typescript
  p/javascript
  p/nodejs
  p/react
  p/owasp-top-ten
  p/secrets
  p/dockerfile
  p/docker-compose
  p/nginx
  p/github-actions
)

config_args=()
for ruleset in "${RULESETS[@]}"; do
  config_args+=(--config "$ruleset")
done

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e SEMGREP_SEND_METRICS=off \
  -e HOME=/tmp \
  -v "$PWD:/src" \
  -w /src \
  "$IMAGE" \
  semgrep scan \
  "${config_args[@]}" \
  --metrics=off \
  --error \
  --text \
  --sarif-output=reports/semgrep.sarif

echo "SAST passed: no findings."
