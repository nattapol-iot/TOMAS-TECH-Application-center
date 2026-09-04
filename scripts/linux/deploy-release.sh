#!/usr/bin/env bash
# Publishes a new immutable release of the IoT Team Center API and (re)starts it via
# systemd. Run this after install-production-host.sh has bootstrapped the host, and
# again for every subsequent release.
#
# This script never touches SQL Server (the connection string is taken as-is from
# --env-file) and never creates Microsoft Entra app registrations.
#
# Usage:
#   sudo ./deploy-release.sh --repo /path/to/checkout/of/this/repo \
#     --env-file /root/secure/iot-team-center-api.env
#
# Safe to re-run: each call publishes into a new timestamped release directory and only
# swaps the 'current' symlink (and restarts the service) after publish succeeds and the
# env file passes validation.

set -euo pipefail

REPO_ROOT=""
ENV_FILE=""
RELEASE_ID="$(date -u +%Y%m%d-%H%M%S)"
APP_ROOT="/opt/iot-team-center"
CONFIG_DIR="/etc/iot-team-center"
SERVICE_USER="iotapi"
API_PORT="5105"
KEEP_RELEASES="5"
HEALTH_TIMEOUT_SECONDS="60"

log() { printf '==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_ROOT="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --release-id) RELEASE_ID="$2"; shift 2 ;;
    --app-root) APP_ROOT="$2"; shift 2 ;;
    --config-dir) CONFIG_DIR="$2"; shift 2 ;;
    --service-user) SERVICE_USER="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --keep-releases) KEEP_RELEASES="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
[[ -n "$REPO_ROOT" ]] || die "--repo is required."
[[ -n "$ENV_FILE" ]] || die "--env-file is required."
[[ -f "$ENV_FILE" ]] || die "--env-file '$ENV_FILE' does not exist."
PROJECT="$REPO_ROOT/backend/IoTTeamCenter.Api/IoTTeamCenter.Api.csproj"
[[ -f "$PROJECT" ]] || die "Could not find $PROJECT -- is --repo the repository root?"
id -u "$SERVICE_USER" >/dev/null 2>&1 || die "Service user '$SERVICE_USER' does not exist -- run install-production-host.sh first."
[[ -d "$APP_ROOT/releases" ]] || die "$APP_ROOT/releases does not exist -- run install-production-host.sh first."

log "Validating $ENV_FILE"
if grep -qE '<[A-Z_]+>' "$ENV_FILE"; then
  die "Refusing to deploy: $ENV_FILE still contains <PLACEHOLDER> markers. Fill in real values first (see scripts/linux/api.env.template)."
fi
for required_key in ASPNETCORE_ENVIRONMENT AllowedHosts Authentication__Mode Authentication__TenantId \
  Authentication__ClientId Authentication__Audience Authentication__RequiredScope \
  Cors__AllowedOrigins__0 Business__TimeZoneId ConnectionStrings__IoTTeamCenter \
  DocumentStorage__Mode DocumentStorage__RootPath DocumentStorage__MaxFileSizeBytes \
  DocumentStorage__AvailabilityProbeTimeoutSeconds DocumentStorage__AvailabilityCacheSeconds; do
  grep -qE "^${required_key}=" "$ENV_FILE" || die "$ENV_FILE is missing required key '$required_key'."
done
if ! grep -qE '^ASPNETCORE_ENVIRONMENT=Production$' "$ENV_FILE"; then
  die "$ENV_FILE must set ASPNETCORE_ENVIRONMENT=Production."
fi

RELEASE_PATH="$APP_ROOT/releases/$RELEASE_ID"
[[ -e "$RELEASE_PATH" ]] && die "Release path $RELEASE_PATH already exists; choose a different --release-id."

log "Publishing release $RELEASE_ID"
dotnet publish "$PROJECT" -c Release --no-self-contained -o "$RELEASE_PATH"
chown -R root:"$SERVICE_USER" "$RELEASE_PATH"
find "$RELEASE_PATH" -type d -exec chmod 750 {} +
find "$RELEASE_PATH" -type f -exec chmod 640 {} +

log "Installing environment file to $CONFIG_DIR/api.env"
install -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0600 "$ENV_FILE" "$CONFIG_DIR/api.env"

log "Swapping 'current' to release $RELEASE_ID"
ln -sfn "$RELEASE_PATH" "$APP_ROOT/current"

log "Starting/restarting iot-team-center-api.service"
systemctl daemon-reload
systemctl enable --now iot-team-center-api.service
systemctl restart iot-team-center-api.service

log "Waiting for /health/live (up to ${HEALTH_TIMEOUT_SECONDS}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
until curl -fsS "http://127.0.0.1:${API_PORT}/health/live" >/dev/null 2>&1; do
  if [[ $(date +%s) -ge $deadline ]]; then
    systemctl status iot-team-center-api.service --no-pager || true
    die "/health/live did not return healthy within ${HEALTH_TIMEOUT_SECONDS}s. Check 'journalctl -u iot-team-center-api -e' and roll back with rollback.sh if needed."
  fi
  sleep 2
done
log "/health/live is healthy"

READY_BODY="$(curl -fsS "http://127.0.0.1:${API_PORT}/health/ready" 2>/dev/null || true)"
if [[ -n "$READY_BODY" ]]; then
  log "/health/ready responded: $READY_BODY"
else
  log "/health/ready did not respond successfully yet -- expected until the SQL connection string and document storage mount are both live. This does not block a successful deploy."
fi

log "Pruning old releases (keeping the newest $KEEP_RELEASES)"
mapfile -t old_releases < <(ls -1dt "$APP_ROOT"/releases/*/ 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))")
for old_release in "${old_releases[@]:-}"; do
  [[ -n "$old_release" ]] || continue
  if [[ "$(readlink -f "$APP_ROOT/current")" == "$(readlink -f "${old_release%/}")" ]]; then
    continue
  fi
  log "Removing old release $old_release"
  rm -rf "${old_release%/}"
done

cat <<SUMMARY

==================== Deploy complete ====================
Release:     $RELEASE_ID
Path:        $RELEASE_PATH
Service:     iot-team-center-api.service ($(systemctl is-active iot-team-center-api.service))
Health/live: ok
To roll back: sudo ./rollback.sh --app-root "$APP_ROOT"
===========================================================
SUMMARY
