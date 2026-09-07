#!/usr/bin/env bash
# Re-points Docker Compose at the ':previous'-tagged image(s) and restarts the affected
# container(s) -- no rebuild. Mirrors the "API-only rollback" procedure in
# docs/PRODUCTION_DEPLOYMENT.md for the Windows/IIS path, adapted for Docker Compose.
# Only goes back one deploy -- deploy.sh only keeps a ':current'/':previous' pair, not a
# full release history.
#
# Usage:
#   sudo ./rollback.sh --repo /opt/iot-team-center/src                    # both services
#   sudo ./rollback.sh --repo /opt/iot-team-center/src --service api      # API only
#   sudo ./rollback.sh --repo /opt/iot-team-center/src --service frontend # frontend only

set -euo pipefail

REPO_ROOT=""
SERVICE=""
API_PORT="5105"
FRONTEND_PORT="3000"
DOCKER_ENV_FILE="/etc/iot-team-center/docker.env"

log() { printf '==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_ROOT="$2"; shift 2 ;;
    --service) SERVICE="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
    --docker-env-file) DOCKER_ENV_FILE="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
[[ -n "$REPO_ROOT" ]] || die "--repo is required."
[[ -f "$REPO_ROOT/docker-compose.prod.yml" ]] || die "Could not find $REPO_ROOT/docker-compose.prod.yml -- is --repo the repository root?"
[[ -f "$DOCKER_ENV_FILE" ]] || die "--docker-env-file '$DOCKER_ENV_FILE' does not exist -- run install-production-host.sh first."
cd "$REPO_ROOT"

# docker-compose.prod.yml's 'api' service pins 'user:' to these -- Compose interpolates
# the whole file for any command (including 'up --no-build'), so this must be set even
# though rollback never rebuilds anything.
set -a
# shellcheck disable=SC1090
source "$DOCKER_ENV_FILE"
set +a

case "$SERVICE" in
  "") images=(iot-team-center-api iot-team-center-frontend); services=(api frontend) ;;
  api) images=(iot-team-center-api); services=(api) ;;
  frontend) images=(iot-team-center-frontend); services=(frontend) ;;
  *) die "Unknown --service '$SERVICE' (expected 'api' or 'frontend')." ;;
esac

for image in "${images[@]}"; do
  docker image inspect "${image}:previous" >/dev/null 2>&1 || die "No ':previous' image found for $image -- nothing to roll back to (rollback only goes back one deploy)."
done

log "Rolling back: ${images[*]} -> their ':previous' tag"
for image in "${images[@]}"; do
  docker tag "${image}:previous" "${image}:current"
done

docker compose -f docker-compose.prod.yml up -d --no-build "${services[@]}"

for service in "${services[@]}"; do
  case "$service" in
    api) port="$API_PORT"; path="/health/live" ;;
    frontend) port="$FRONTEND_PORT"; path="/" ;;
  esac
  log "Waiting for http://127.0.0.1:${port}${path}"
  deadline=$(( $(date +%s) + 60 ))
  until curl -fsS -o /dev/null "http://127.0.0.1:${port}${path}" 2>/dev/null; do
    if [[ $(date +%s) -ge $deadline ]]; then
      docker compose -f docker-compose.prod.yml logs --tail=50 "$service" || true
      die "Health check for $service did not pass after rollback. Investigate immediately -- both the old and new image may be unhealthy."
    fi
    sleep 2
  done
done

log "Rollback complete."
