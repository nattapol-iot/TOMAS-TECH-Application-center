#!/usr/bin/env bash
# Deploys the shared-host stack (docker-compose.dev.yml + docker-compose.tls.yml: Node API,
# production-built frontend, Caddy) on a colima host. Runs as the login user that owns the
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
TMTHUB_HOST_DEFAULT="tmthub.tomastc.com"
TMTHUB_PORT_DEFAULT="8446"
TMTHUB_ADMIN_EMAIL_DEFAULT="pattanasak.c@tomastc.com"
TMTHUB_NAS_ADDR="${TMTHUB_NAS_ADDR:-100.64.0.53}"
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
# The compose files fall back to header-trusting Development identity and an Entra build when
# these are unset, so the shared host refuses to deploy anything but TMT ID.
env_value() { grep -E "^$1=" "$DEPLOY_DIR/.env" | tail -n 1 | cut -d= -f2- | tr -d '"\r' || true; }
[[ "$(env_value DEV_API_AUTH_MODE)" == "TmtId" ]] || die "DEV_API_AUTH_MODE must be TmtId in $DEPLOY_DIR/.env."
[[ "$(env_value DEV_FRONTEND_AUTH_MODE)" == "tmt-id" ]] || die "DEV_FRONTEND_AUTH_MODE must be tmt-id in $DEPLOY_DIR/.env."
docker context inspect "$DOCKER_CONTEXT" >/dev/null 2>&1 || die "Docker context '$DOCKER_CONTEXT' does not exist."
# A context can exist while its VM is down; compose would then hang on the dead socket for minutes.
if ! /usr/bin/perl -e 'alarm 15; exec @ARGV' docker --context "$DOCKER_CONTEXT" version >/dev/null 2>&1; then
  if [[ "$DOCKER_CONTEXT" == "colima-iot" ]]; then
    log "Docker daemon is unavailable; starting the isolated iot Colima profile"
    # The VM stays alive only while Colima's limactl supervisor runs, and the Actions
    # runner kills it at "Cleaning up orphan processes" -- the VM, with every container
    # in it, then dies seconds after the deploy reports success. The runner identifies
    # what to kill by the RUNNER_TRACKING_ID it puts in the environment of everything a
    # step spawns, which children inherit; a new session alone does not escape it, so
    # the variable has to be dropped before exec. Detaching as well keeps the supervisor
    # off this job's terminal. Poll afterwards: the start no longer runs in foreground.
    env -u RUNNER_TRACKING_ID \
      /usr/bin/perl -MPOSIX -e 'exit 0 if fork; POSIX::setsid(); open STDIN, "<", "/dev/null"; open STDOUT, ">>", "/tmp/colima-iot-start.log"; open STDERR, ">&", \*STDOUT; exec @ARGV' \
      colima start -p iot
    log "Waiting for the iot Colima daemon (start log: /tmp/colima-iot-start.log)"
    for _ in $(seq 1 60); do
      /usr/bin/perl -e 'alarm 10; exec @ARGV' docker --context "$DOCKER_CONTEXT" version >/dev/null 2>&1 && break
      sleep 5
    done
    /usr/bin/perl -e 'alarm 30; exec @ARGV' docker --context "$DOCKER_CONTEXT" version >/dev/null 2>&1 \
      || die "Docker daemon behind '$DOCKER_CONTEXT' is still not answering after starting Colima profile iot; see /tmp/colima-iot-start.log."
  else
    die "Docker daemon behind '$DOCKER_CONTEXT' is not answering."
  fi
fi

DOCUMENT_MODE="$(grep -E '^DEV_DOCUMENT_STORAGE_MODE=' "$DEPLOY_DIR/.env" | cut -d= -f2- || true)"
if [[ "$DOCUMENT_MODE" == "Nas" ]]; then
  log "Verifying the NAS mount on the Mac host"
  DEV_NAS_USERNAME="${DEV_NAS_USERNAME:-$(grep -E '^DEV_NAS_USERNAME=' "$DEPLOY_DIR/.env" | cut -d= -f2- || true)}"
  [[ -n "$DEV_NAS_USERNAME" ]] || die "NAS mode is enabled but DEV_NAS_USERNAME is missing."
  DEV_NAS_USERNAME="$DEV_NAS_USERNAME" bash "$SOURCE/scripts/macos/mount-nas.sh"
  if [[ "$DOCKER_CONTEXT" == "colima-iot" ]]; then
    log "Checking NAS visibility inside the isolated iot VM"
    if ! /usr/bin/perl -e 'alarm 20; exec @ARGV' colima ssh -p iot -- test -d /private/tmp/iot-team-center-nas; then
      # A host SMB reconnect invalidates the existing virtiofs descriptor. Only
      # this application's VM may restart; preserve the operator's default context.
      log "Refreshing stale NAS sharing in the isolated iot VM"
      (
        previous_context="$(docker context show)"
        trap 'docker context use "$previous_context" >/dev/null' EXIT
        /usr/bin/perl -e 'alarm 90; exec @ARGV' colima stop -p iot
        /usr/bin/perl -e 'alarm 180; exec @ARGV' colima start -p iot
      )
      /usr/bin/perl -e 'alarm 20; exec @ARGV' colima ssh -p iot -- test -d /private/tmp/iot-team-center-nas \
        || die "NAS is mounted on the Mac but is still unavailable in the iot VM."
    fi
  fi
fi

compose() { docker --context "$DOCKER_CONTEXT" compose -f docker-compose.dev.yml -f docker-compose.tls.yml "$@"; }

log "Syncing $SOURCE -> $DEPLOY_DIR"
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude dist --exclude .next --exclude .vinext \
  --exclude .env --exclude '.env.bak.*' --exclude backend-node/node_modules --exclude backend-node/dist \
  "$SOURCE/" "$DEPLOY_DIR/"

cd "$DEPLOY_DIR"
# Left behind by the former bind-mounted dev server (a PID lock that stops a new one starting).
rm -rf .vinext

# TMTHub (Forgejo) settings that compose needs before it starts anything. The secret key encrypts
# what Forgejo stores (OAuth client secret, 2FA), so it is generated once and never changes.
if [[ -z "$(env_value TMTHUB_SECRET_KEY)" ]]; then
  log "Generating TMTHUB_SECRET_KEY in .env (first TMTHub deploy)"
  printf '\n# TMTHub (Forgejo) secret key, generated by scripts/macos/deploy.sh. Do not change.\nTMTHUB_SECRET_KEY=%s\n' \
    "$(openssl rand -hex 32)" >> .env
fi

# The former frontend was a bind-mounted 'npm run dev' container allowed 3 GB. The iot VM has
# 4 GiB and no swap, so the first production build must not run beside it; stopping it costs
# one build's worth of frontend downtime, once. Afterwards the image is ours and stays up.
frontend_container="$(compose ps -q frontend 2>/dev/null || true)"
if [[ -n "$frontend_container" ]] \
  && [[ "$(docker --context "$DOCKER_CONTEXT" inspect -f '{{.Config.Image}}' "$frontend_container" 2>/dev/null)" == node:* ]]; then
  log "Stopping the legacy dev-server frontend before the first production build"
  compose stop frontend
fi

log "Building images"
compose build
# Apply additive schema changes before replacing the currently running API.
# A migration failure stops deployment here, leaving the old containers running.
log "Applying database migrations before container replacement"
# Migrations alter the schema, which the iot_team_app login cannot. The owner login from .env goes
# to this one-off container only, never to the long-running API; unset, migrations reuse the API's.
migrations_connection="$(sed -n 's/^DEV_MIGRATIONS_CONNECTION_STRING=//p' .env 2>/dev/null | tail -n 1)"
migrations_connection="${migrations_connection%\"}"; migrations_connection="${migrations_connection#\"}"
export ConnectionStrings__Migrations="$migrations_connection"
compose run --rm --no-deps -e ConnectionStrings__Migrations api node --input-type=module -e 'import { loadConfig } from "./dist/src/config.js"; import { runConfiguredMigrations } from "./dist/src/startup-migrations.js"; const config = loadConfig(); if (config.database.runMigrations === false) throw new Error("Deployment requires database migrations to be enabled"); await runConfiguredMigrations(config, console.log);'
unset ConnectionStrings__Migrations
log "Starting containers"
# --force-recreate keeps every deploy a clean restart: pdf-parser and caddy have no source
# change most of the time, and a stale container would otherwise survive the deploy unnoticed.
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
  shift 2
  log "Waiting for $label ($url)"
  until curl -fsS --max-time 15 -o /dev/null "$@" "$url" 2>/dev/null; do
    if (( $(date +%s) >= deadline )); then
      compose ps
      compose logs --tail=250 api
      compose --profile tmthub logs --tail=40 frontend caddy tmthub tmthub-backup
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

# ---------------------------------------------------------------------------------------------
# TMTHub. Runs after the application is healthy, as a function so that a NAS that is not ready
# for it yet skips TMTHub with a warning; any other TMTHub problem fails the job loudly without
# taking the application down.
deploy_tmthub() {
  TMTHUB_HOST="$(env_value TMTHUB_HOST)"; TMTHUB_HOST="${TMTHUB_HOST:-$TMTHUB_HOST_DEFAULT}"
  TMTHUB_PORT="$(env_value TMTHUB_PORT)"; TMTHUB_PORT="${TMTHUB_PORT:-$TMTHUB_PORT_DEFAULT}"

  # DNS: an A record beside PUBLIC_HOST's, pointing at the same tailnet address and DNS-only, so the
  # name resolves everywhere but answers on the VPN only. Created once; never overwrites a record.
  cf_header="$(mktemp)"
  trap 'rm -f "$cf_header"' EXIT
  chmod 600 "$cf_header"
  printf 'Authorization: Bearer %s\n' "$(env_value CLOUDFLARE_API_TOKEN)" > "$cf_header"
  cf() { curl -fsS --max-time 20 -H @"$cf_header" -H 'Content-Type: application/json' "$@"; }
  # Reads a Cloudflare JSON response on stdin into $d and runs the Perl snippet given as $1.
  json() { /usr/bin/perl -MJSON::PP -0777 -ne 'my $d = decode_json($_); '"$1"; }
  CF_API="https://api.cloudflare.com/client/v4"
  zone_name="${TMTHUB_HOST#*.}"
  zone_id="$(cf "$CF_API/zones?name=$zone_name" | json 'print $d->{result}[0]{id} // ""')"
  [[ -n "$zone_id" ]] || die "Cloudflare zone $zone_name is not visible to CLOUDFLARE_API_TOKEN."
  TMTHUB_IP="$(cf "$CF_API/zones/$zone_id/dns_records?type=A&name=$PUBLIC_HOST" | json 'print $d->{result}[0]{content} // ""')"
  [[ -n "$TMTHUB_IP" ]] || die "No A record for $PUBLIC_HOST to copy the address from."
  existing="$(cf "$CF_API/zones/$zone_id/dns_records?name=$TMTHUB_HOST" | json 'print join(" ", map { "$_->{type}=$_->{content}" } @{$d->{result}})')"
  if [[ -z "$existing" ]]; then
    log "Creating DNS $TMTHUB_HOST A $TMTHUB_IP (DNS only)"
    cf -X POST "$CF_API/zones/$zone_id/dns_records" \
      --data "{\"type\":\"A\",\"name\":\"$TMTHUB_HOST\",\"content\":\"$TMTHUB_IP\",\"ttl\":300,\"proxied\":false,\"comment\":\"TMTHub, created by iot-team-center scripts/macos/deploy.sh\"}" >/dev/null
  elif [[ "$existing" != "A=$TMTHUB_IP" ]]; then
    die "DNS for $TMTHUB_HOST already exists ($existing); not overwriting it. Point it at $TMTHUB_IP or set TMTHUB_HOST in .env."
  fi

  # Storage: TMTHub keeps repositories, LFS and attachments on the NAS, mounted over NFS by the iot
  # VM's kernel (volume tmthub-nas). NFS authorises this host by address, so no NAS password is
  # involved. The folder is created through the existing SMB mount; the NAS needs an NFS rule for
  # this host on the "IoT Department" share (docs/TMTHUB.md).
  [[ "$DOCUMENT_MODE" == "Nas" ]] || die "TMTHub keeps its repositories on the NAS; DEV_DOCUMENT_STORAGE_MODE must be Nas."
  mkdir -p "$(env_value DEV_DOCUMENT_STORAGE_PATH)/TMTHub"
  if [[ "$DOCKER_CONTEXT" == "colima-iot" ]]; then
    vm() { /usr/bin/perl -e 'alarm 120; exec @ARGV' colima ssh -p iot -- "$@"; }
    vm timeout 10 bash -c "</dev/tcp/$TMTHUB_NAS_ADDR/2049" 2>/dev/null \
      || { log "WARNING: TMTHub skipped: NFS on the NAS ($TMTHUB_NAS_ADDR:2049) is not reachable from the iot VM; enable it (docs/TMTHUB.md)."; echo "::warning title=TMTHub skipped::NFS on the NAS is not reachable from the iot VM; see docs/TMTHUB.md"; return 0; }
    vm sudo modprobe nfs >/dev/null 2>&1 \
      || vm sudo sh -c 'DEBIAN_FRONTEND=noninteractive apt-get install -y -q "linux-modules-extra-$(uname -r)" >/dev/null && modprobe nfs' \
      || die "The NFS client module is unavailable in the iot VM."
  fi
  export TMTHUB_NAS_ADDR

  tcompose() { compose --profile tmthub "$@"; }
  tcompose rm -sf tmthub tmthub-backup >/dev/null 2>&1 || true

  # Find the NFS path and protocol this NAS accepts by mounting a throwaway volume: Synology
  # exports the full /volumeN path over v4, others (UGREEN) may use the v4 pseudo-root or v3.
  # TMTHUB_NFS_PATH / TMTHUB_NFS_OPTIONS in .env pin a choice and skip the probe.
  nfs_try() {
    local probe_volume=tmthub-nfs-probe result=1 output
    docker --context "$DOCKER_CONTEXT" volume rm -f "$probe_volume" >/dev/null 2>&1 || true
    if output="$(docker --context "$DOCKER_CONTEXT" volume create --driver local --opt type=nfs \
        --opt "o=addr=$TMTHUB_NAS_ADDR,$2" --opt "device=:$1" "$probe_volume" 2>&1 \
      && docker --context "$DOCKER_CONTEXT" run --rm --entrypoint /bin/sh -v "$probe_volume:/probe" \
        codeberg.org/forgejo/forgejo:15.0.9 -c 'id; ls -ldn /probe; touch /probe/.tmthub-probe && rm -f /probe/.tmthub-probe' 2>&1)"; then
      result=0
    fi
    # One line per attempt in the job log, so a refusal says why (mount error, ownership, read-only).
    log "NFS $1 (${2#rw,}): $([[ $result == 0 ]] && echo ok || printf '%s' "$output" | tr '\n' ' ' | tail -c 400)"
    docker --context "$DOCKER_CONTEXT" volume rm -f "$probe_volume" >/dev/null 2>&1 || true
    return "$result"
  }
  nfs_path="$(env_value TMTHUB_NFS_PATH)"
  nfs_options="$(env_value TMTHUB_NFS_OPTIONS)"
  if [[ -z "$nfs_path" || -z "$nfs_options" ]]; then
    nfs_share="${TMTHUB_NFS_SHARE:-/volume1/IoT Department}"
    nfs_sub="IoT Team Center/TMTHub"
    v4="rw,nfsvers=4.1,hard,timeo=600,retrans=2,noresvport"
    v3="rw,nfsvers=3,nolock,hard,timeo=600,retrans=2,noresvport"
    nfs_path=""
    for candidate in "$nfs_share/$nfs_sub|$v4" "/${nfs_share#/volume*/}/$nfs_sub|$v4" "$nfs_share/$nfs_sub|$v3"; do
      if nfs_try "${candidate%%|*}" "${candidate#*|}"; then
        nfs_path="${candidate%%|*}"; nfs_options="${candidate#*|}"
        break
      fi
    done
    if [[ -z "$nfs_path" ]]; then
      # Diagnostics only: does the share root itself mount? Tells a subfolder restriction apart
      # from a rule that does not match this host at all.
      nfs_try "$nfs_share" "$v4" || nfs_try "$nfs_share" "$v3" || true
      log "WARNING: TMTHub skipped: no NFS path on the NAS could be mounted and written (tried $nfs_share over v4.1, its v4 pseudo-root path, and v3)."
      echo "::warning title=TMTHub skipped::No NFS path on the NAS could be mounted and written; check the NFS rule (docs/TMTHUB.md)"
      return 0
    fi
  fi
  export TMTHUB_NFS_PATH="$nfs_path" TMTHUB_NFS_OPTIONS="$nfs_options"
  log "Starting TMTHub with its repositories on the NAS (NFS $nfs_path, ${nfs_options#rw,})"
  # Volume options are fixed at creation; the volume is only a mount, so dropping it loses nothing.
  for volume in $(docker --context "$DOCKER_CONTEXT" volume ls -q --filter label=com.docker.compose.volume=tmthub-nas); do
    docker --context "$DOCKER_CONTEXT" volume rm "$volume" >/dev/null
  done
  if ! up_output="$(tcompose up -d --force-recreate tmthub tmthub-backup 2>&1)"; then
    printf '%s\n' "$up_output"
    if grep -q "failed to mount local volume" <<<"$up_output"; then
      # The NAS answers NFS but has no rule for this host yet: the same "not ready" case as above.
      log "WARNING: TMTHub skipped: the NAS refused the NFS mount; add the NFS rule for this host (docs/TMTHUB.md)."
      echo "::warning title=TMTHub skipped::The NAS refused the NFS mount; add the NFS permission rule for this host (docs/TMTHUB.md)"
      return 0
    fi
    die "TMTHub could not start."
  fi

  # --resolve: a record created a moment ago may still be negatively cached by the host resolver.
  wait_for "https://$TMTHUB_HOST:$TMTHUB_PORT/api/healthz" "TMTHub" --resolve "$TMTHUB_HOST:$TMTHUB_PORT:$TMTHUB_IP"

  forgejo_admin() { tcompose exec -T -u git tmthub forgejo admin "$@"; }

  # Sign-in through TMT ID with TMTHub's own Keycloak client (realm internal, client "tmthub",
  # redirect URI https://$TMTHUB_HOST:$TMTHUB_PORT/user/oauth2/TMT-ID/callback). The secret comes
  # from the GitHub Actions secret TMTHUB_OIDC_CLIENT_SECRET (deploy.yml) or from .env, and travels
  # on stdin, never in a process argument. Updated on every deploy, so rotating it is one change.
  OIDC_ISSUER_VALUE="$(env_value OIDC_ISSUER)"; OIDC_ISSUER_VALUE="${OIDC_ISSUER_VALUE%/}"
  OIDC_CLIENT_ID_VALUE="${TMTHUB_OIDC_CLIENT_ID:-$(env_value TMTHUB_OIDC_CLIENT_ID)}"
  OIDC_CLIENT_ID_VALUE="${OIDC_CLIENT_ID_VALUE:-tmthub}"
  oidc_secret="${TMTHUB_OIDC_CLIENT_SECRET:-$(env_value TMTHUB_OIDC_CLIENT_SECRET)}"
  [[ -n "$OIDC_ISSUER_VALUE" ]] || die "OIDC_ISSUER is required for TMTHub sign-in."
  [[ -n "$oidc_secret" ]] || die "TMTHUB_OIDC_CLIENT_SECRET (GitHub Actions secret or .env) is required for TMTHub sign-in."
  auth_id="$(forgejo_admin auth list | awk '$2 == "TMT-ID" { print $1 }')"
  if [[ -n "$auth_id" ]]; then auth_verb="update-oauth --id $auth_id"; else auth_verb="add-oauth"; fi
  log "Configuring TMTHub sign-in through TMT ID, client $OIDC_CLIENT_ID_VALUE ($auth_verb)"
  printf '%s\n' "$oidc_secret" | tcompose exec -T -u git tmthub sh -c \
    "IFS= read -r secret; forgejo admin auth $auth_verb --name TMT-ID --provider openidConnect --key '$OIDC_CLIENT_ID_VALUE' --secret \"\$secret\" --auto-discover-url '$OIDC_ISSUER_VALUE/.well-known/openid-configuration' --skip-local-2fa" >/dev/null
  unset oidc_secret

  # The administrator exists before first sign-in; TMT ID then links to it by email.
  TMTHUB_ADMIN_EMAIL="$(env_value TMTHUB_ADMIN_EMAIL)"; TMTHUB_ADMIN_EMAIL="${TMTHUB_ADMIN_EMAIL:-$TMTHUB_ADMIN_EMAIL_DEFAULT}"
  if ! forgejo_admin user list | awk 'NR > 1 { print tolower($3) }' | grep -Fxq "$(printf '%s' "$TMTHUB_ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]')"; then
    log "Creating TMTHub administrator $TMTHUB_ADMIN_EMAIL"
    # The random password is never used (sign-in is TMT ID); keep it out of the job log.
    forgejo_admin user create --admin --username "${TMTHUB_ADMIN_EMAIL%@*}" --email "$TMTHUB_ADMIN_EMAIL" \
      --random-password --must-change-password=false >/dev/null
  fi

  # One organisation for every project, created once. The CLI has no organisation command, so a
  # short-lived admin token makes the API call and is then removed from the database.
  tmthub_sql() { tcompose exec -T -u git tmthub sqlite3 /data/gitea/gitea.db "$1"; }
  TMTHUB_ORG="$(env_value TMTHUB_ORG)"; TMTHUB_ORG="${TMTHUB_ORG:-TMT}"
  org_lower="$(printf '%s' "$TMTHUB_ORG" | tr '[:upper:]' '[:lower:]')"
  if [[ "$(tmthub_sql "SELECT COUNT(*) FROM [user] WHERE lower_name='$org_lower' AND type=1;" | tr -d '\r')" != "1" ]]; then
    log "Creating TMTHub organisation $TMTHUB_ORG"
    token_name="deploy-bootstrap-$(date +%s)"
    token_header="$(mktemp)"
    chmod 600 "$token_header"
    printf 'Authorization: token %s\n' "$(forgejo_admin user generate-access-token --username "${TMTHUB_ADMIN_EMAIL%@*}" \
      --token-name "$token_name" --scopes write:organization --raw | tr -d '\r')" > "$token_header"
    curl -fsS --max-time 20 --resolve "$TMTHUB_HOST:$TMTHUB_PORT:$TMTHUB_IP" -H @"$token_header" -H 'Content-Type: application/json' \
      -X POST "https://$TMTHUB_HOST:$TMTHUB_PORT/api/v1/orgs" \
      --data "{\"username\":\"$TMTHUB_ORG\",\"full_name\":\"Tomas Tech\",\"visibility\":\"limited\",\"repo_admin_change_team_access\":true}" >/dev/null \
      || { rm -f "$token_header"; tmthub_sql "DELETE FROM access_token WHERE name='$token_name';"; die "Creating the $TMTHUB_ORG organisation failed."; }
    rm -f "$token_header"
    tmthub_sql "DELETE FROM access_token WHERE name='$token_name';"
  fi

  # Engineering Center reads and commits through a service account. Its token lives in .env
  # (TMTHUB_API_TOKEN) and is replaced when TMTHub no longer accepts it; the API is then
  # recreated so the Download Center switches to TMTHub repositories.
  service_user=engineering-center
  if ! forgejo_admin user list | awk 'NR > 1 { print $2 }' | grep -Fxq "$service_user"; then
    log "Creating the TMTHub service account $service_user"
    forgejo_admin user create --admin --username "$service_user" --email "$service_user@tmthub.invalid" \
      --random-password --must-change-password=false >/dev/null
  fi
  api_token_header="$(mktemp)"
  chmod 600 "$api_token_header"
  printf 'Authorization: token %s\n' "$(env_value TMTHUB_API_TOKEN)" > "$api_token_header"
  if [[ -z "$(env_value TMTHUB_API_TOKEN)" ]] || ! curl -fsS --max-time 20 --resolve "$TMTHUB_HOST:$TMTHUB_PORT:$TMTHUB_IP" \
      -H @"$api_token_header" -o /dev/null "https://$TMTHUB_HOST:$TMTHUB_PORT/api/v1/user"; then
    log "Issuing the Engineering Center token for TMTHub"
    new_token="$(forgejo_admin user generate-access-token --username "$service_user" --token-name "engineering-center-$(date +%s)" \
      --scopes write:repository,write:organization,read:user --raw | tr -d '\r')"
    [[ -n "$new_token" ]] || die "TMTHub did not issue a token."
    /usr/bin/perl -i -ne 'print unless /^TMTHUB_API_TOKEN=/' .env
    printf 'TMTHUB_API_TOKEN=%s\n' "$new_token" >> .env
    unset new_token
    log "Restarting the API so the Download Center uses TMTHub"
    compose up -d --no-deps --force-recreate api
    wait_for "$API_URL" "API readiness"
  fi
  rm -f "$api_token_header"
  log "TMTHub is at https://$TMTHUB_HOST:$TMTHUB_PORT/ (VPN only); repositories and database backups on the NAS under IoT Team Center/TMTHub"
}
deploy_tmthub
