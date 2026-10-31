# shellcheck shell=bash
# Sourced by scripts that run Docker Compose. Picks a Compose v2 command that supports the
# `!reset` / `!override` tags the overlays use (>= 2.24), or exits with an error, and defines
# `run_compose <args>` to call it.
#
# COMPOSE overrides the choice (e.g. COMPOSE=/path/to/docker-compose). Otherwise the candidates
# are tried in order: the `docker compose` plugin, a standalone `docker-compose`, then the
# usual plugin install paths (useful when ~/.docker/cli-plugins holds a broken, shadowing copy).

MIN_COMPOSE_VERSION="2.24.0"

version_at_least() {
  [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" == "$2" ]]
}

find_compose() {
  local candidates=()
  if [[ -n "${COMPOSE:-}" ]]; then
    candidates=("$COMPOSE")
  else
    candidates=(
      "docker compose"
      "docker-compose"
      "/usr/libexec/docker/cli-plugins/docker-compose"
      "/usr/lib/docker/cli-plugins/docker-compose"
      "/usr/local/lib/docker/cli-plugins/docker-compose"
    )
  fi

  local candidate version found=()
  local -a command
  for candidate in "${candidates[@]}"; do
    read -r -a command <<<"$candidate"
    version="$("${command[@]}" version --short 2>/dev/null)" || continue
    version="${version#v}"
    found+=("$candidate ($version)")
    if version_at_least "$version" "$MIN_COMPOSE_VERSION"; then
      COMPOSE_CMD=("${command[@]}")
      return 0
    fi
  done

  {
    echo "error: Docker Compose >= ${MIN_COMPOSE_VERSION} is required."
    if ((${#found[@]} > 0)); then
      echo "Found only: ${found[*]}"
    else
      echo "No working Docker Compose command was found."
    fi
    echo "If 'docker compose' reports an unknown command, a stale ~/.docker/cli-plugins/docker-compose"
    echo "may be shadowing the system plugin. Or point COMPOSE at a recent binary."
  } >&2
  exit 1
}

run_compose() {
  "${COMPOSE_CMD[@]}" "$@"
}

find_compose
