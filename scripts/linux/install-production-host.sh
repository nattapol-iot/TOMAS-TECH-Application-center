#!/usr/bin/env bash
# One-time (re-runnable) bootstrap of a bare Ubuntu server for the IoT Team Center API
# and, optionally, the self-hosted frontend on the same box.
#
# Installs the .NET ASP.NET Core runtime, Node.js, nginx, and (optionally) a CIFS mount
# of the company NAS share; creates dedicated low-privilege service accounts and (if
# requested) a restricted CI deploy account; and writes (but does not start) the systemd
# units and nginx sites. deploy-release.sh / deploy-frontend-release.sh publish and start
# the actual applications afterwards.
#
# This script never touches SQL Server and never creates or handles Microsoft Entra
# app registrations -- those remain manual/DBA-owned per docs/PRODUCTION_DEPLOYMENT_LINUX.md.
#
# Usage (with a real domain for both hostnames):
#   sudo ./install-production-host.sh --api-host iot-api.example.tomastc.com \
#     --frontend-host iot-team-center.example.tomastc.com \
#     --nas-unc "//100.98.152.4/ShareName/AppRoot" \
#     --nas-credentials-file /root/secure/iot-team-center-nas.cifs-credentials \
#     --deploy-user iot-deploy --deploy-ssh-public-key-file /root/secure/iot-deploy.pub
#
# Usage (no domain yet -- point both hosts at the server's own IP and use a self-signed
# cert; Production's CORS check requires an HTTPS origin even without a real domain):
#   sudo ./install-production-host.sh --api-host 203.0.113.10 --frontend-host 203.0.113.10 \
#     --self-signed-tls --nas-unc "..." --nas-credentials-file ...
#   (defaults to frontend on :443 and API on :8443 since one IP can't be split by hostname)
#
# Re-run safely after changing flags (e.g. to move from --self-signed-tls to a real
# --enable-tls once DNS/certs are ready) -- steps are idempotent and do not restart a
# running service.

set -euo pipefail

API_HOST=""
API_PORT="5105"
API_EXTERNAL_PORT=""
FRONTEND_HOST=""
FRONTEND_PORT="3000"
FRONTEND_EXTERNAL_PORT=""
SERVICE_USER="iotapi"
FRONTEND_SERVICE_USER="iotfrontend"
APP_ROOT="/opt/iot-team-center"
SRC_DIR=""
CONFIG_DIR="/etc/iot-team-center"
NAS_UNC=""
NAS_CREDENTIALS_FILE=""
NAS_MOUNT_PATH="/mnt/iot-team-center-documents"
ENABLE_TLS="false"
CERT_EMAIL=""
SELF_SIGNED_TLS="false"
DEPLOY_USER=""
DEPLOY_SSH_PUBLIC_KEY_FILE=""

log() { printf '==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

is_ipv4() {
  [[ "$1" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  local octet
  for octet in "${BASH_REMATCH[@]:1}"; do
    (( octet <= 255 )) || return 1
  done
  return 0
}

generate_self_signed_cert() {
  local host="$1"
  local cert_dir="/etc/ssl/iot-team-center"
  install -d -o root -g root -m 0755 "$cert_dir"
  local safe_name="${host//[.:\/]/_}"
  local crt="$cert_dir/${safe_name}.crt"
  local key="$cert_dir/${safe_name}.key"
  if [[ ! -f "$crt" || ! -f "$key" ]]; then
    local san
    if is_ipv4 "$host"; then san="subjectAltName=IP:${host}"; else san="subjectAltName=DNS:${host}"; fi
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout "$key" -out "$crt" \
      -subj "/CN=${host}" -addext "$san" >/dev/null 2>&1
    chmod 0640 "$key"
  fi
  printf '%s\n%s\n' "$crt" "$key"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-host) API_HOST="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --api-external-port) API_EXTERNAL_PORT="$2"; shift 2 ;;
    --frontend-host) FRONTEND_HOST="$2"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
    --frontend-external-port) FRONTEND_EXTERNAL_PORT="$2"; shift 2 ;;
    --service-user) SERVICE_USER="$2"; shift 2 ;;
    --frontend-service-user) FRONTEND_SERVICE_USER="$2"; shift 2 ;;
    --app-root) APP_ROOT="$2"; shift 2 ;;
    --src-dir) SRC_DIR="$2"; shift 2 ;;
    --config-dir) CONFIG_DIR="$2"; shift 2 ;;
    --nas-unc) NAS_UNC="$2"; shift 2 ;;
    --nas-credentials-file) NAS_CREDENTIALS_FILE="$2"; shift 2 ;;
    --nas-mount-path) NAS_MOUNT_PATH="$2"; shift 2 ;;
    --enable-tls) ENABLE_TLS="true"; shift ;;
    --cert-email) CERT_EMAIL="$2"; shift 2 ;;
    --self-signed-tls) SELF_SIGNED_TLS="true"; shift ;;
    --deploy-user) DEPLOY_USER="$2"; shift 2 ;;
    --deploy-ssh-public-key-file) DEPLOY_SSH_PUBLIC_KEY_FILE="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ -n "$SRC_DIR" ]] || SRC_DIR="$APP_ROOT/src"

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
[[ -n "$API_HOST" ]] || die "--api-host is required."
command -v apt-get >/dev/null 2>&1 || die "This script targets Ubuntu/Debian (apt-get not found)."
if [[ -n "$NAS_UNC" ]]; then
  [[ "$NAS_UNC" == //*/* ]] || die "--nas-unc must look like //server/share/path."
  [[ -n "$NAS_CREDENTIALS_FILE" ]] || die "--nas-credentials-file is required with --nas-unc."
  [[ -f "$NAS_CREDENTIALS_FILE" ]] || die "--nas-credentials-file '$NAS_CREDENTIALS_FILE' does not exist."
fi
if [[ "$ENABLE_TLS" == "true" ]]; then
  [[ -n "$CERT_EMAIL" ]] || die "--enable-tls requires --cert-email."
  [[ "$SELF_SIGNED_TLS" != "true" ]] || die "--enable-tls (Let's Encrypt, needs a real resolving domain) and --self-signed-tls (no domain needed) are mutually exclusive."
fi
if [[ "$SELF_SIGNED_TLS" == "true" ]]; then
  command -v openssl >/dev/null 2>&1 || die "openssl is required for --self-signed-tls."
  [[ -n "$API_EXTERNAL_PORT" ]] || API_EXTERNAL_PORT="8443"
  [[ -n "$FRONTEND_EXTERNAL_PORT" ]] || FRONTEND_EXTERNAL_PORT="443"
else
  [[ -n "$API_EXTERNAL_PORT" ]] || API_EXTERNAL_PORT="80"
  [[ -n "$FRONTEND_EXTERNAL_PORT" ]] || FRONTEND_EXTERNAL_PORT="80"
fi
if [[ -n "$FRONTEND_HOST" && "$API_HOST" == "$FRONTEND_HOST" && "$API_EXTERNAL_PORT" == "$FRONTEND_EXTERNAL_PORT" ]]; then
  die "--api-host and --frontend-host are the same value ($API_HOST) but would listen on the same external port ($API_EXTERNAL_PORT). Without separate DNS names to route by, nginx needs different ports -- pass --api-external-port/--frontend-external-port (with --self-signed-tls these already default to 8443/443)."
fi
if [[ -n "$DEPLOY_USER" ]]; then
  [[ -n "$DEPLOY_SSH_PUBLIC_KEY_FILE" ]] || die "--deploy-user requires --deploy-ssh-public-key-file."
  [[ -f "$DEPLOY_SSH_PUBLIC_KEY_FILE" ]] || die "--deploy-ssh-public-key-file '$DEPLOY_SSH_PUBLIC_KEY_FILE' does not exist."
fi

log "Updating package index"
apt-get update -y

log "Installing base prerequisites"
apt-get install -y ca-certificates curl gnupg apt-transport-https software-properties-common rsync

if ! command -v dotnet >/dev/null 2>&1 || ! dotnet --list-runtimes 2>/dev/null | grep -q '^Microsoft.AspNetCore.App 10\.'; then
  log "Installing Microsoft package repository and the .NET 10 ASP.NET Core runtime"
  UBUNTU_CODENAME="$(. /etc/os-release && echo "$VERSION_ID")"
  TMP_DEB="$(mktemp --suffix=.deb)"
  curl -fsSL "https://packages.microsoft.com/config/ubuntu/${UBUNTU_CODENAME}/packages-microsoft-prod.deb" -o "$TMP_DEB"
  dpkg -i "$TMP_DEB"
  rm -f "$TMP_DEB"
  apt-get update -y
  apt-get install -y aspnetcore-runtime-10.0
else
  log ".NET 10 ASP.NET Core runtime already present, skipping"
fi

if [[ -n "$FRONTEND_HOST" ]]; then
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -lt 22 ]]; then
    log "Installing Node.js 22.x (required by package.json: >=22.13.0)"
    curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
    bash /tmp/nodesource_setup.sh
    rm -f /tmp/nodesource_setup.sh
    apt-get install -y nodejs
  else
    log "Node.js >=22 already present, skipping"
  fi
fi

log "Installing globalization/timezone support (required: InvariantGlobalization=false, Windows-style Business:TimeZoneId)"
apt-get install -y libicu-dev tzdata

log "Installing nginx and ufw"
apt-get install -y nginx ufw

if [[ -n "$NAS_UNC" ]]; then
  log "Installing cifs-utils for the NAS mount"
  apt-get install -y cifs-utils
fi

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  log "Creating dedicated service account '$SERVICE_USER' (no login, no home)"
  adduser --system --group --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
else
  log "Service account '$SERVICE_USER' already exists, skipping"
fi
if [[ -n "$FRONTEND_HOST" ]] && ! id -u "$FRONTEND_SERVICE_USER" >/dev/null 2>&1; then
  log "Creating dedicated service account '$FRONTEND_SERVICE_USER' (no login, no home)"
  adduser --system --group --no-create-home --shell /usr/sbin/nologin "$FRONTEND_SERVICE_USER"
elif [[ -n "$FRONTEND_HOST" ]]; then
  log "Service account '$FRONTEND_SERVICE_USER' already exists, skipping"
fi

if [[ -n "$FRONTEND_HOST" ]]; then
  if ! getent group iot-team-center-config >/dev/null 2>&1; then
    groupadd --system iot-team-center-config
  fi
  usermod -aG iot-team-center-config "$SERVICE_USER"
  usermod -aG iot-team-center-config "$FRONTEND_SERVICE_USER"
  CONFIG_GROUP="iot-team-center-config"
else
  CONFIG_GROUP="$SERVICE_USER"
fi

log "Creating application directories"
install -d -o root -g root -m 0755 "$APP_ROOT"
install -d -o root -g root -m 0755 "$APP_ROOT/releases"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0700 "$APP_ROOT/tmp"
install -d -o root -g "$CONFIG_GROUP" -m 0750 "$CONFIG_DIR"
if [[ -n "$FRONTEND_HOST" ]]; then
  install -d -o root -g root -m 0755 "$APP_ROOT/frontend"
  install -d -o root -g root -m 0755 "$APP_ROOT/frontend/releases"
fi

if [[ -n "$DEPLOY_USER" ]]; then
  if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    log "Creating CI deploy account '$DEPLOY_USER'"
    adduser --disabled-password --gecos "" --shell /bin/bash "$DEPLOY_USER"
  else
    log "Deploy account '$DEPLOY_USER' already exists, skipping creation"
  fi
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0700 "/home/$DEPLOY_USER/.ssh"
  cat "$DEPLOY_SSH_PUBLIC_KEY_FILE" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chmod 0600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

  install -d -o root -g root -m 0755 "$SRC_DIR"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$SRC_DIR"

  log "Writing restricted sudoers entry for '$DEPLOY_USER' (deploy scripts only, no blanket sudo)"
  SUDOERS_FILE="/etc/sudoers.d/iot-team-center-deploy"
  cat > "$SUDOERS_FILE" <<SUDOERS
Cmnd_Alias IOT_DEPLOY = ${SRC_DIR}/scripts/linux/deploy-release.sh *, ${SRC_DIR}/scripts/linux/deploy-frontend-release.sh *, ${SRC_DIR}/scripts/linux/rollback.sh *
${DEPLOY_USER} ALL=(root) NOPASSWD: IOT_DEPLOY
SUDOERS
  chmod 0440 "$SUDOERS_FILE"
  visudo -c -f "$SUDOERS_FILE" || die "Generated sudoers file failed validation; check $SUDOERS_FILE."
fi

if [[ -n "$NAS_UNC" ]]; then
  log "Installing NAS CIFS credentials file"
  install -o root -g root -m 0600 "$NAS_CREDENTIALS_FILE" "$CONFIG_DIR/nas-credentials"

  log "Creating NAS mount point at $NAS_MOUNT_PATH"
  install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$NAS_MOUNT_PATH"

  SERVICE_UID="$(id -u "$SERVICE_USER")"
  SERVICE_GID="$(id -g "$SERVICE_USER")"
  FSTAB_MARKER="# iot-team-center NAS mount (managed by install-production-host.sh)"
  FSTAB_LINE="${NAS_UNC} ${NAS_MOUNT_PATH} cifs credentials=${CONFIG_DIR}/nas-credentials,uid=${SERVICE_UID},gid=${SERVICE_GID},file_mode=0640,dir_mode=0750,iocharset=utf8,vers=3.0,_netdev,nofail 0 0"
  if grep -qF "$FSTAB_MARKER" /etc/fstab 2>/dev/null; then
    log "fstab entry for the NAS mount already present, leaving it as-is"
  else
    log "Adding fstab entry for the NAS mount"
    { echo "$FSTAB_MARKER"; echo "$FSTAB_LINE"; } >> /etc/fstab
  fi

  log "Mounting the NAS share"
  mount "$NAS_MOUNT_PATH" || die "Failed to mount $NAS_UNC at $NAS_MOUNT_PATH. Check connectivity/credentials, fix, then re-run this script."
  mountpoint -q "$NAS_MOUNT_PATH" || die "NAS mount did not come up at $NAS_MOUNT_PATH."
  log "NAS mounted successfully at $NAS_MOUNT_PATH"
else
  log "No --nas-unc given: skipping NAS mount. DocumentStorage__RootPath must still point at a real durable network location before go-live."
fi

log "Writing systemd unit iot-team-center-api.service"
cat > /etc/systemd/system/iot-team-center-api.service <<UNIT
[Unit]
Description=IoT Team Center API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_ROOT}/current
ExecStart=/usr/bin/dotnet ${APP_ROOT}/current/IoTTeamCenter.Api.dll
EnvironmentFile=${CONFIG_DIR}/api.env
Environment=ASPNETCORE_TEMP=${APP_ROOT}/tmp
Environment=DOTNET_PRINT_TELEMETRY_MESSAGE=false
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=${APP_ROOT}/tmp
$( [[ -n "$NAS_UNC" ]] && echo "ReadWritePaths=${NAS_MOUNT_PATH}" )

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
log "Systemd unit written (not started -- run deploy-release.sh to publish and start the API)"

if [[ -n "$FRONTEND_HOST" ]]; then
  log "Writing systemd unit iot-team-center-frontend.service"
  cat > /etc/systemd/system/iot-team-center-frontend.service <<UNIT
[Unit]
Description=IoT Team Center Frontend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${FRONTEND_SERVICE_USER}
Group=${FRONTEND_SERVICE_USER}
WorkingDirectory=${APP_ROOT}/frontend/current
ExecStart=/usr/bin/node ${APP_ROOT}/frontend/current/node_modules/vinext/dist/cli.js start --hostname 127.0.0.1 --port ${FRONTEND_PORT}
EnvironmentFile=${CONFIG_DIR}/frontend.env
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  log "Systemd unit written (not started -- run deploy-frontend-release.sh to publish and start the frontend)"
fi

write_nginx_site() {
  local site_name="$1" host="$2" external_port="$3" internal_port="$4" extra_body_size="$5"
  if [[ "$SELF_SIGNED_TLS" == "true" ]]; then
    local cert key
    { read -r cert; read -r key; } < <(generate_self_signed_cert "$host")
    log "Writing nginx site for ${host} (self-signed HTTPS on ${external_port})"
    cat > "/etc/nginx/sites-available/${site_name}" <<NGINX
server {
    listen ${external_port} ssl;
    server_name ${host};
    ssl_certificate ${cert};
    ssl_certificate_key ${key};
    ssl_protocols TLSv1.2 TLSv1.3;
${extra_body_size}
    location / {
        proxy_pass http://127.0.0.1:${internal_port};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
  else
    log "Writing nginx site for ${host} (plain HTTP on ${external_port})"
    cat > "/etc/nginx/sites-available/${site_name}" <<NGINX
server {
    listen ${external_port};
    server_name ${host};
${extra_body_size}
    location / {
        proxy_pass http://127.0.0.1:${internal_port};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
  fi
  ln -sf "/etc/nginx/sites-available/${site_name}" "/etc/nginx/sites-enabled/${site_name}"
}

write_nginx_site "iot-team-center-api" "$API_HOST" "$API_EXTERNAL_PORT" "$API_PORT" "
    client_max_body_size 60m;
"

if [[ -n "$FRONTEND_HOST" ]]; then
  write_nginx_site "iot-team-center-frontend" "$FRONTEND_HOST" "$FRONTEND_EXTERNAL_PORT" "$FRONTEND_PORT" ""
fi

rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx || systemctl restart nginx

log "Configuring ufw rules (external ports + OpenSSH; not enabling ufw automatically)"
declare -A ports_to_open=( [80]=1 [443]=1 ["$API_EXTERNAL_PORT"]=1 )
[[ -n "$FRONTEND_HOST" ]] && ports_to_open["$FRONTEND_EXTERNAL_PORT"]=1
ufw allow OpenSSH >/dev/null 2>&1 || true
for allowed_port in "${!ports_to_open[@]}"; do
  ufw allow "${allowed_port}/tcp" >/dev/null 2>&1 || true
done
if ufw status | grep -q "Status: active"; then
  log "ufw already active; rules applied"
else
  log "ufw is not enabled. Review 'ufw status verbose' and run 'ufw enable' yourself once you've confirmed OpenSSH is allowed -- this script will not risk locking you out by enabling it automatically."
fi

if [[ "$ENABLE_TLS" == "true" ]]; then
  CERT_DOMAIN_ARGS=(-d "$API_HOST")
  [[ -n "$FRONTEND_HOST" ]] && CERT_DOMAIN_ARGS+=(-d "$FRONTEND_HOST")
  log "Installing certbot and requesting a certificate for: ${API_HOST} ${FRONTEND_HOST}"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx "${CERT_DOMAIN_ARGS[@]}" -m "$CERT_EMAIL" --agree-tos -n --redirect
  log "TLS certificate installed and nginx updated to redirect HTTP to HTTPS"
elif [[ "$SELF_SIGNED_TLS" == "true" ]]; then
  log "Self-signed TLS installed for ${API_HOST}:${API_EXTERNAL_PORT} and ${FRONTEND_HOST:-<none>}:${FRONTEND_EXTERNAL_PORT}. Browsers will warn until this is replaced with a real domain + --enable-tls (see docs/PRODUCTION_DEPLOYMENT_LINUX.md)."
else
  log "TLS not requested. Once you have a real domain, re-run this script with --enable-tls --cert-email <owner@company> (or --self-signed-tls for now if you don't have one yet)."
fi

TLS_SUMMARY="not yet enabled"
[[ "$ENABLE_TLS" == "true" ]] && TLS_SUMMARY="enabled (Let's Encrypt)"
[[ "$SELF_SIGNED_TLS" == "true" ]] && TLS_SUMMARY="self-signed (replace with --enable-tls once a real domain exists)"

cat <<SUMMARY

==================== Host bootstrap complete ====================
API service account:      ${SERVICE_USER}
Frontend service account: $( [[ -n "$FRONTEND_HOST" ]] && echo "${FRONTEND_SERVICE_USER}" || echo "not configured" )
App root:                 ${APP_ROOT}
Source checkout path:     ${SRC_DIR} (rsync target for CI deploys)
Config dir:                ${CONFIG_DIR}
NAS mount:                 $( [[ -n "$NAS_UNC" ]] && echo "${NAS_MOUNT_PATH} (${NAS_UNC})" || echo "not configured" )
API nginx site:            ${API_HOST}:${API_EXTERNAL_PORT} -> 127.0.0.1:${API_PORT}
Frontend nginx site:       $( [[ -n "$FRONTEND_HOST" ]] && echo "${FRONTEND_HOST}:${FRONTEND_EXTERNAL_PORT} -> 127.0.0.1:${FRONTEND_PORT}" || echo "not configured" )
TLS:                       ${TLS_SUMMARY}
CI deploy account:         $( [[ -n "$DEPLOY_USER" ]] && echo "${DEPLOY_USER} (sudo restricted to deploy scripts under ${SRC_DIR})" || echo "not configured" )

Next steps:
1. rsync a checkout of this repository to ${SRC_DIR} (CI does this automatically once configured).
2. Fill in scripts/linux/api.env.template and scripts/linux/frontend.env.template outside the
   repository, then run deploy-release.sh / deploy-frontend-release.sh --env-file <path>.
See docs/PRODUCTION_DEPLOYMENT_LINUX.md and docs/CI_CD_SETUP.md.
===================================================================
SUMMARY
