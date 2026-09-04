#!/usr/bin/env bash
# Points 'current' back at a previous release and restarts the service. Mirrors the
# "API-only rollback" procedure in docs/PRODUCTION_DEPLOYMENT.md for the Windows/IIS path.
# Works for either the backend API or the self-hosted frontend by pointing --app-root and
# --service at the matching pair.
#
# Usage:
#   sudo ./rollback.sh --app-root /opt/iot-team-center                              # backend, one release back
#   sudo ./rollback.sh --app-root /opt/iot-team-center --release-id <id>            # backend, specific release
#   sudo ./rollback.sh --app-root /opt/iot-team-center/frontend \
#     --service iot-team-center-frontend --port 3000 --health-path /                # frontend

set -euo pipefail

APP_ROOT="/opt/iot-team-center"
RELEASE_ID=""
SERVICE="iot-team-center-api"
PORT="5105"
HEALTH_PATH="/health/live"

log() { printf '==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-root) APP_ROOT="$2"; shift 2 ;;
    --release-id) RELEASE_ID="$2"; shift 2 ;;
    --service) SERVICE="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --api-port) PORT="$2"; shift 2 ;; # backward-compatible alias
    --health-path) HEALTH_PATH="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
[[ -d "$APP_ROOT/releases" ]] || die "$APP_ROOT/releases does not exist."

CURRENT_RELEASE="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"
[[ -n "$CURRENT_RELEASE" ]] || die "$APP_ROOT/current is not set; nothing to roll back from."

if [[ -n "$RELEASE_ID" ]]; then
  TARGET="$APP_ROOT/releases/$RELEASE_ID"
  [[ -d "$TARGET" ]] || die "Release $RELEASE_ID not found under $APP_ROOT/releases."
else
  TARGET="$(ls -1dt "$APP_ROOT"/releases/*/ 2>/dev/null | grep -vF "$CURRENT_RELEASE/" | head -n1 || true)"
  TARGET="${TARGET%/}"
  [[ -n "$TARGET" ]] || die "No older release available to roll back to."
fi

[[ "$(readlink -f "$TARGET")" != "$CURRENT_RELEASE" ]] || die "Target release is already 'current'."

log "Rolling back 'current' from $CURRENT_RELEASE to $TARGET"
ln -sfn "$TARGET" "$APP_ROOT/current"

log "Restarting ${SERVICE}.service"
systemctl restart "${SERVICE}.service"

log "Waiting for http://127.0.0.1:${PORT}${HEALTH_PATH}"
deadline=$(( $(date +%s) + 60 ))
until curl -fsS "http://127.0.0.1:${PORT}${HEALTH_PATH}" >/dev/null 2>&1; do
  if [[ $(date +%s) -ge $deadline ]]; then
    systemctl status "${SERVICE}.service" --no-pager || true
    die "Health check did not pass after rollback. Investigate immediately -- both the old and new release may be unhealthy."
  fi
  sleep 2
done

log "Rollback complete. 'current' now points at $TARGET and the health check passed."
