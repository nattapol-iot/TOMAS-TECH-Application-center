#!/usr/bin/env bash
# Deploys the Development-mode stack on a colima host. Runs as the login user that owns the
# colima profile (no sudo: the docker socket lives under that user's home), from the CI
# runner or by hand:
#
#   scripts/macos/deploy.sh --source /path/to/checkout
#
# The checkout is synced into DEPLOY_DIR because docker build contexts must live under the
# home directory the VM mounts, and because the deploy copy carries the untracked .env.
set -euo pipefail

SOURCE=""
DEPLOY_DIR="${IOT_DEPLOY_DIR:-$HOME/iot-team-center/src}"
DOCKER_CONTEXT="${IOT_DOCKER_CONTEXT:-colima-iot}"
PUBLIC_HOST_DEFAULT="iot-team-center.tomastc.com"
HEALTH_TIMEOUT_SECONDS=180

log() { printf '==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    --deploy-dir) DEPLOY_DIR="$2"; shift 2 ;;
    --docker-context) DOCKER_CONTEXT="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ -n "$SOURCE" ]] || die "--source is required."
[[ -f "$SOURCE/docker-compose.dev.yml" ]] || die "$SOURCE does not look like the repository root."
[[ -f "$DEPLOY_DIR/.env" ]] || die "$DEPLOY_DIR/.env is missing; see docs/MACMINI_HANDOFF.md for the keys it must carry."
docker context inspect "$DOCKER_CONTEXT" >/dev/null 2>&1 || die "Docker context '$DOCKER_CONTEXT' does not exist."
# A context can exist while its VM is down; compose would then hang on the dead socket for minutes.
/usr/bin/perl -e 'alarm 15; exec @ARGV' docker --context "$DOCKER_CONTEXT" version >/dev/null 2>&1 || die "Docker daemon behind '$DOCKER_CONTEXT' is not answering; on the Mac host run: colima start -p iot"

DOCUMENT_MODE="$(grep -E '^DEV_DOCUMENT_STORAGE_MODE=' "$DEPLOY_DIR/.env" | cut -d= -f2- || true)"
if [[ "$DOCUMENT_MODE" == "Nas" ]]; then
  log "Verifying the NAS mount on the Mac host"
  DEV_NAS_USERNAME="${DEV_NAS_USERNAME:-$(grep -E '^DEV_NAS_USERNAME=' "$DEPLOY_DIR/.env" | cut -d= -f2- || true)}"
  [[ -n "$DEV_NAS_USERNAME" ]] || die "NAS mode is enabled but DEV_NAS_USERNAME is missing."
  DEV_NAS_USERNAME="$DEV_NAS_USERNAME" bash "$SOURCE/scripts/macos/mount-nas.sh"
fi

compose() { docker --context "$DOCKER_CONTEXT" compose -f docker-compose.dev.yml -f docker-compose.tls.yml "$@"; }

log "Syncing $SOURCE -> $DEPLOY_DIR"
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude dist --exclude .next --exclude .vinext \
  --exclude .env --exclude '.env.bak.*' --exclude backend-node/node_modules --exclude backend-node/dist \
  "$SOURCE/" "$DEPLOY_DIR/"

cd "$DEPLOY_DIR"
# vinext leaves a PID lock in the bind-mounted project dir; a replaced container sees a dead
# PID and exits instead of starting, so clear it before every deploy.
rm -rf .vinext

log "Building images"
compose build
# Apply additive schema changes before replacing the currently running API.
# A migration failure stops deployment here, leaving the old containers running.
log "Applying database migrations before container replacement"
compose run --rm --no-deps api node --input-type=module -e 'import { loadConfig } from "./dist/src/config.js"; import { runConfiguredMigrations } from "./dist/src/startup-migrations.js"; const config = loadConfig(); if (config.database.runMigrations === false) throw new Error("Deployment requires database migrations to be enabled"); await runConfiguredMigrations(config, console.log);'
log "Starting containers"
# --force-recreate matters here: 'frontend' has no 'build:' (bind-mounted source, persistent
# 'npm run dev' process), so its image/env/command never change between deploys and plain
# 'up -d' sees no diff and leaves the old container -- and old in-memory dev server -- running.
# rsync updates the bind-mounted files on disk, but the already-running process never re-reads
# them (file-watch events routinely don't propagate through colima's virtiofs mount either), so
# a deploy could report success while the site keeps serving the previous commit indefinitely.
compose up -d --force-recreate
# The Caddyfile is a bind mount, so an edited file does not recreate the container; reload it.
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || log "Caddy reload skipped (container not running yet)"

PUBLIC_HOST="$(grep -E '^PUBLIC_HOST=' .env | cut -d= -f2- || true)"
PUBLIC_HOST="${PUBLIC_HOST:-$PUBLIC_HOST_DEFAULT}"
FRONTEND_PORT="$(grep -E '^TLS_FRONTEND_PORT=' .env | cut -d= -f2- || true)"
API_PORT="$(grep -E '^TLS_API_PORT=' .env | cut -d= -f2- || true)"
FRONTEND_URL="https://${PUBLIC_HOST}:${FRONTEND_PORT:-8444}/"
API_URL="https://${PUBLIC_HOST}:${API_PORT:-8445}/health/ready"

wait_for() {
  local url="$1" label="$2" deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
  log "Waiting for $label ($url)"
  until curl -fsS --max-time 15 -o /dev/null "$url" 2>/dev/null; do
    if (( $(date +%s) >= deadline )); then
      compose ps
      compose logs --tail=250 api
      compose logs --tail=40 frontend caddy
      die "$label did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s."
    fi
    sleep 5
  done
  log "$label is healthy"
}
wait_for "$API_URL" "API readiness"
wait_for "$FRONTEND_URL" "frontend"

log "Pruning dangling image layers in the $DOCKER_CONTEXT VM"
docker --context "$DOCKER_CONTEXT" image prune -f >/dev/null

compose ps
