#!/usr/bin/env bash
# Builds and (re)starts both the API and frontend containers via Docker Compose. Run
# this after install-production-host.sh has bootstrapped the host, and again for every
# subsequent release. Replaces deploy-release.sh + deploy-frontend-release.sh (retired
# along with the systemd-managed native-process deployment they drove).
#
# This script never touches SQL Server (the connection string is taken as-is from
# --api-env-file) and never creates Microsoft Entra app registrations.
#
# Usage:
#   sudo ./deploy.sh --repo /opt/iot-team-center/src \
#     --api-env-file /etc/iot-team-center/api.env.input \
#     --frontend-env-file /etc/iot-team-center/frontend.env.input
#
# Safe to re-run: tags the currently-running images as ':previous' before building new
# ones, so rollback.sh can fall back to them instantly without rebuilding.

set -euo pipefail

REPO_ROOT=""
API_ENV_FILE="/etc/iot-team-center/api.env.input"
FRONTEND_ENV_FILE="/etc/iot-team-center/frontend.env.input"
DOCKER_ENV_FILE="/etc/iot-team-center/docker.env"
API_PORT="5105"
FRONTEND_PORT="3000"
HEALTH_TIMEOUT_SECONDS="90"

log() { printf '==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_ROOT="$2"; shift 2 ;;
    --api-env-file) API_ENV_FILE="$2"; shift 2 ;;
    --frontend-env-file) FRONTEND_ENV_FILE="$2"; shift 2 ;;
    --docker-env-file) DOCKER_ENV_FILE="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
[[ -n "$REPO_ROOT" ]] || die "--repo is required."
[[ -f "$REPO_ROOT/docker-compose.prod.yml" ]] || die "Could not find $REPO_ROOT/docker-compose.prod.yml -- is --repo the repository root?"
[[ -f "$API_ENV_FILE" ]] || die "--api-env-file '$API_ENV_FILE' does not exist."
[[ -f "$FRONTEND_ENV_FILE" ]] || die "--frontend-env-file '$FRONTEND_ENV_FILE' does not exist."
[[ -f "$DOCKER_ENV_FILE" ]] || die "--docker-env-file '$DOCKER_ENV_FILE' does not exist -- run install-production-host.sh first."
command -v docker >/dev/null 2>&1 || die "Docker is not installed -- run install-production-host.sh first."
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is not installed -- run install-production-host.sh first."

validate_env_file() {
  local file="$1" template_hint="$2"
  shift 2
  log "Validating $file"
  # Exclude comment lines -- the template's own explanatory comments (e.g. an example
  # connection string) legitimately contain <PLACEHOLDER>-shaped text that isn't a real
  # unfilled value.
  if grep -vE '^\s*#' "$file" | grep -qE '<[A-Z_]+>'; then
    die "Refusing to deploy: $file still contains <PLACEHOLDER> markers. Fill in real values first (see $template_hint)."
  fi
  for required_key in "$@"; do
    grep -qE "^${required_key}=" "$file" || die "$file is missing required key '$required_key'."
  done
}

validate_env_file "$API_ENV_FILE" "scripts/linux/api.env.template" \
  ASPNETCORE_ENVIRONMENT AllowedHosts Authentication__Mode Authentication__TenantId \
  Authentication__ClientId Authentication__Audience Authentication__RequiredScope \
  Cors__AllowedOrigins__0 Business__TimeZoneId ConnectionStrings__IoTTeamCenter \
  DocumentStorage__Mode DocumentStorage__RootPath DocumentStorage__MaxFileSizeBytes \
  DocumentStorage__AvailabilityProbeTimeoutSeconds DocumentStorage__AvailabilityCacheSeconds
grep -qE '^ASPNETCORE_ENVIRONMENT=Production$' "$API_ENV_FILE" || die "$API_ENV_FILE must set ASPNETCORE_ENVIRONMENT=Production."

validate_env_file "$FRONTEND_ENV_FILE" "scripts/linux/frontend.env.template" \
  NEXT_PUBLIC_APP_MODE NEXT_PUBLIC_AUTH_MODE NEXT_PUBLIC_API_BASE_URL \
  NEXT_PUBLIC_ENTRA_TENANT_ID NEXT_PUBLIC_ENTRA_CLIENT_ID NEXT_PUBLIC_ENTRA_API_SCOPE \
  NEXT_PUBLIC_BUSINESS_TIME_ZONE SITE_ORIGIN
grep -qE '^NEXT_PUBLIC_APP_MODE=production$' "$FRONTEND_ENV_FILE" || die "$FRONTEND_ENV_FILE must set NEXT_PUBLIC_APP_MODE=production."
grep -qE '^NEXT_PUBLIC_AUTH_MODE=entra$' "$FRONTEND_ENV_FILE" || die "$FRONTEND_ENV_FILE must set NEXT_PUBLIC_AUTH_MODE=entra."

cd "$REPO_ROOT"

log "Tagging currently-running images as ':previous' (if any) for instant rollback"
for image in iot-team-center-api iot-team-center-frontend; do
  if docker image inspect "${image}:current" >/dev/null 2>&1; then
    docker tag "${image}:current" "${image}:previous"
  fi
done

log "Loading frontend build-time values from $FRONTEND_ENV_FILE and $DOCKER_ENV_FILE"
# Frontend values become Docker build ARGs (see docker-compose.prod.yml) -- NEXT_PUBLIC_*
# values are compiled into the client bundle at build time, not read again at container
# runtime. docker.env supplies IOTAPI_UID/IOTAPI_GID for the api service's 'user:' field.
set -a
# shellcheck disable=SC1090
source <(grep -vE '^\s*#' "$FRONTEND_ENV_FILE")
# shellcheck disable=SC1090
source "$DOCKER_ENV_FILE"
set +a

log "Building images (docker compose build)"
docker compose -f docker-compose.prod.yml build

log "Starting containers (docker compose up -d)"
if ! docker compose -f docker-compose.prod.yml up -d; then
  # "address already in use" here has repeatedly turned out to be a leftover
  # non-Docker process (e.g. an old bare-metal systemd unit) holding the port, which
  # otherwise requires an interactive SSH session to track down. Diagnose it straight
  # into the CI log instead of just failing.
  log "docker compose up -d failed -- checking what's bound to ports ${API_PORT}/${FRONTEND_PORT}:"
  ss -ltnp 2>/dev/null | grep -E ":(${API_PORT}|${FRONTEND_PORT})\b" \
    || echo "(nothing reported listening on these ports -- the conflict may be transient, or ss/iproute2 is unavailable)"
  die "docker compose up -d failed -- see the port diagnostic above. If a non-Docker process is listed, stop it (e.g. 'sudo systemctl stop <unit>' or 'sudo kill <pid>') and re-run deploy."
fi

# ASP.NET Core's automatic host-filtering middleware (driven by the AllowedHosts config
# key) rejects any request whose Host header doesn't match with a 400 -- which includes
# our own health-check curls against 127.0.0.1 unless we send the real configured Host
# explicitly. Without this, curl -f treats the 400 as a plain failure and this loop just
# spins until the timeout, even though the app came up fine.
API_ALLOWED_HOST="$(grep -E '^AllowedHosts=' "$API_ENV_FILE" | head -1 | cut -d= -f2-)"
[[ -n "$API_ALLOWED_HOST" ]] || die "$API_ENV_FILE's AllowedHosts is empty -- cannot health-check the API."

log "Waiting for API /health/live (up to ${HEALTH_TIMEOUT_SECONDS}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
until curl -fsS -H "Host: ${API_ALLOWED_HOST}" "http://127.0.0.1:${API_PORT}/health/live" >/dev/null 2>&1; do
  if [[ $(date +%s) -ge $deadline ]]; then
    docker compose -f docker-compose.prod.yml logs --tail=50 api || true
    die "/health/live did not return healthy within ${HEALTH_TIMEOUT_SECONDS}s. Check 'docker compose -f docker-compose.prod.yml logs api' and roll back with rollback.sh if needed."
  fi
  sleep 2
done
log "/health/live is healthy"

READY_BODY="$(curl -fsS -H "Host: ${API_ALLOWED_HOST}" "http://127.0.0.1:${API_PORT}/health/ready" 2>/dev/null || true)"
if [[ -n "$READY_BODY" ]]; then
  log "/health/ready responded: $READY_BODY"
else
  log "/health/ready did not respond successfully yet -- expected until the SQL connection string and document storage mount are both live. This does not block a successful deploy."
fi

log "Waiting for the frontend to respond (up to ${HEALTH_TIMEOUT_SECONDS}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
until curl -fsS -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}/" 2>/dev/null; do
  if [[ $(date +%s) -ge $deadline ]]; then
    docker compose -f docker-compose.prod.yml logs --tail=50 frontend || true
    die "Frontend did not respond within ${HEALTH_TIMEOUT_SECONDS}s. Check 'docker compose -f docker-compose.prod.yml logs frontend' and roll back with rollback.sh if needed."
  fi
  sleep 2
done
log "Frontend is responding"

log "Pruning dangling (untagged) image layers"
docker image prune -f >/dev/null

cat <<SUMMARY

==================== Deploy complete ====================
API:          http://127.0.0.1:${API_PORT} (health/live: ok)
Frontend:     http://127.0.0.1:${FRONTEND_PORT} (responding: ok)
To roll back: sudo ./rollback.sh --repo "$REPO_ROOT"
===========================================================
SUMMARY
