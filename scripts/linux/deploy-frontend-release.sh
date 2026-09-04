#!/usr/bin/env bash
# Builds and (re)starts a new immutable release of the self-hosted IoT Team Center
# frontend via systemd. Run this after install-production-host.sh has bootstrapped the
# host (with --frontend-host), and again for every subsequent release.
#
# Mirrors deploy-release.sh for the backend API. Never touches SQL Server or Entra.
#
# Usage:
#   sudo ./deploy-frontend-release.sh --repo /opt/iot-team-center/src \
#     --env-file /root/secure/iot-team-center-frontend.env
#
# Safe to re-run: each call builds into a new timestamped release directory and only
# swaps the 'current' symlink (and restarts the service) after the build succeeds and the
# env file passes validation.

set -euo pipefail

REPO_ROOT=""
ENV_FILE=""
RELEASE_ID="$(date -u +%Y%m%d-%H%M%S)"
APP_ROOT="/opt/iot-team-center"
CONFIG_DIR="/etc/iot-team-center"
FRONTEND_SERVICE_USER="iotfrontend"
FRONTEND_PORT="3000"
KEEP_RELEASES="5"
HEALTH_TIMEOUT_SECONDS="90"

log() { printf '==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_ROOT="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --release-id) RELEASE_ID="$2"; shift 2 ;;
    --app-root) APP_ROOT="$2"; shift 2 ;;
    --config-dir) CONFIG_DIR="$2"; shift 2 ;;
    --frontend-service-user) FRONTEND_SERVICE_USER="$2"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
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
[[ -f "$REPO_ROOT/package.json" ]] || die "Could not find $REPO_ROOT/package.json -- is --repo the repository root?"
id -u "$FRONTEND_SERVICE_USER" >/dev/null 2>&1 || die "Frontend service user '$FRONTEND_SERVICE_USER' does not exist -- run install-production-host.sh with --frontend-host first."
[[ -d "$APP_ROOT/frontend/releases" ]] || die "$APP_ROOT/frontend/releases does not exist -- run install-production-host.sh with --frontend-host first."
command -v node >/dev/null 2>&1 || die "Node.js is not installed -- run install-production-host.sh with --frontend-host first."

log "Validating $ENV_FILE"
if grep -qE '<[A-Z_]+>' "$ENV_FILE"; then
  die "Refusing to deploy: $ENV_FILE still contains <PLACEHOLDER> markers. Fill in real values first (see scripts/linux/frontend.env.template)."
fi
for required_key in NEXT_PUBLIC_APP_MODE NEXT_PUBLIC_AUTH_MODE NEXT_PUBLIC_API_BASE_URL \
  NEXT_PUBLIC_ENTRA_TENANT_ID NEXT_PUBLIC_ENTRA_CLIENT_ID NEXT_PUBLIC_ENTRA_API_SCOPE \
  NEXT_PUBLIC_BUSINESS_TIME_ZONE SITE_ORIGIN; do
  grep -qE "^${required_key}=" "$ENV_FILE" || die "$ENV_FILE is missing required key '$required_key'."
done
if ! grep -qE '^NEXT_PUBLIC_APP_MODE=production$' "$ENV_FILE" || ! grep -qE '^NEXT_PUBLIC_AUTH_MODE=entra$' "$ENV_FILE"; then
  die "$ENV_FILE must set NEXT_PUBLIC_APP_MODE=production and NEXT_PUBLIC_AUTH_MODE=entra."
fi

RELEASE_PATH="$APP_ROOT/frontend/releases/$RELEASE_ID"
[[ -e "$RELEASE_PATH" ]] && die "Release path $RELEASE_PATH already exists; choose a different --release-id."

log "Copying source into release $RELEASE_ID"
mkdir -p "$RELEASE_PATH"
rsync -a --exclude node_modules --exclude .git --exclude dist --exclude .vinext --exclude .next --exclude .wrangler \
  "$REPO_ROOT/" "$RELEASE_PATH/"

log "Building the frontend (npm ci && npm run build)"
(
  cd "$RELEASE_PATH"
  set -a
  # shellcheck disable=SC1090
  source <(grep -v '^\s*#' "$ENV_FILE")
  set +a
  npm ci
  npm run build
)

log "Installing environment file to $CONFIG_DIR/frontend.env"
install -o "$FRONTEND_SERVICE_USER" -g "$FRONTEND_SERVICE_USER" -m 0600 "$ENV_FILE" "$CONFIG_DIR/frontend.env"

log "Setting ownership on the release directory"
chown -R root:"$FRONTEND_SERVICE_USER" "$RELEASE_PATH"
find "$RELEASE_PATH" -type d -exec chmod 750 {} +
find "$RELEASE_PATH" -type f -exec chmod 640 {} +

log "Swapping 'current' to release $RELEASE_ID"
ln -sfn "$RELEASE_PATH" "$APP_ROOT/frontend/current"

log "Starting/restarting iot-team-center-frontend.service"
systemctl daemon-reload
systemctl enable --now iot-team-center-frontend.service
systemctl restart iot-team-center-frontend.service

log "Waiting for the frontend to respond (up to ${HEALTH_TIMEOUT_SECONDS}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
until curl -fsS -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}/" 2>/dev/null; do
  if [[ $(date +%s) -ge $deadline ]]; then
    systemctl status iot-team-center-frontend.service --no-pager || true
    die "Frontend did not respond within ${HEALTH_TIMEOUT_SECONDS}s. Check 'journalctl -u iot-team-center-frontend -e' and roll back with rollback.sh if needed."
  fi
  sleep 2
done
log "Frontend is responding"

log "Pruning old releases (keeping the newest $KEEP_RELEASES)"
mapfile -t old_releases < <(ls -1dt "$APP_ROOT"/frontend/releases/*/ 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))")
for old_release in "${old_releases[@]:-}"; do
  [[ -n "$old_release" ]] || continue
  if [[ "$(readlink -f "$APP_ROOT/frontend/current")" == "$(readlink -f "${old_release%/}")" ]]; then
    continue
  fi
  log "Removing old release $old_release"
  rm -rf "${old_release%/}"
done

cat <<SUMMARY

==================== Frontend deploy complete ====================
Release:  $RELEASE_ID
Path:     $RELEASE_PATH
Service:  iot-team-center-frontend.service ($(systemctl is-active iot-team-center-frontend.service))
Responding on 127.0.0.1:${FRONTEND_PORT}: ok
To roll back: sudo ./rollback.sh --app-root "$APP_ROOT/frontend" --service iot-team-center-frontend --port "$FRONTEND_PORT"
=====================================================================
SUMMARY
