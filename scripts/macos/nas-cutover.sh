#!/usr/bin/env bash
set -euo pipefail
DEPLOY_DIR=/Users/tomastc/iot-team-center/src
MOUNT_DIR=/mnt/iot-department
DOCUMENT_DIR="$MOUNT_DIR/IoT Team Center"
COMPOSE=(-f docker-compose.dev.yml -f docker-compose.tls.yml)
[[ -n "${NAS_USERNAME:-}" && -n "${NAS_PASSWORD:-}" ]] || { echo 'NAS secrets are not configured.' >&2; exit 1; }
[[ -f "$DEPLOY_DIR/.env" ]] || { echo 'Deployment .env is missing.' >&2; exit 1; }
cd "$DEPLOY_DIR"

credential_payload="username=$NAS_USERNAME
password=$NAS_PASSWORD
"
credential_b64="$(printf '%s' "$credential_payload" | base64)"
unset credential_payload NAS_PASSWORD

vm_script="$(cat <<VM_SCRIPT
set -eu
if ! command -v mount.cifs >/dev/null 2>&1; then
  if command -v apk >/dev/null 2>&1; then
    sudo apk add --no-cache cifs-utils >/dev/null
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq cifs-utils >/dev/null
  else
    echo 'No supported package manager is available for cifs-utils.' >&2
    exit 1
  fi
fi
sudo install -d -m 0700 /etc/iot-team-center
printf '%s' '$credential_b64' | base64 -d | sudo tee /etc/iot-team-center/nas.credentials >/dev/null
sudo chmod 0600 /etc/iot-team-center/nas.credentials
sudo mkdir -p '$MOUNT_DIR'
entry='//100.64.0.53/IoT\\040Department $MOUNT_DIR cifs credentials=/etc/iot-team-center/nas.credentials,vers=3.0,iocharset=utf8,rw,nofail,_netdev,file_mode=0660,dir_mode=0770 0 0'
sudo sed -i '\|[[:space:]]$MOUNT_DIR[[:space:]]|d' /etc/fstab
printf '%s\n' "\$entry" | sudo tee -a /etc/fstab >/dev/null
mountpoint -q '$MOUNT_DIR' || sudo mount '$MOUNT_DIR'
mountpoint -q '$MOUNT_DIR'
mkdir -p '$DOCUMENT_DIR'
probe='$DOCUMENT_DIR/.iot-team-center-nas-probe'
printf 'iot-team-center-nas-check' > "\$probe"
test "\$(cat "\$probe")" = 'iot-team-center-nas-check'
rm "\$probe"
VM_SCRIPT
)"
printf '%s\n' "$vm_script" | colima ssh -p iot -- sh -s
unset vm_script credential_b64 NAS_USERNAME
echo 'NAS mount write-read-delete probe passed.'

api_id="$(docker --context colima-iot compose "${COMPOSE[@]}" ps -q api)"
[[ -n "$api_id" ]] || { echo 'API container is not running.' >&2; exit 1; }
old_volume="$(docker --context colima-iot inspect "$api_id" --format '{{range .Mounts}}{{if eq .Destination "/app/App_Data/project-documents"}}{{.Name}}{{end}}{{end}}')"
[[ -n "$old_volume" ]] || { echo 'Existing document volume was not found.' >&2; exit 1; }

target_entries="$(colima ssh -p iot -- find "$DOCUMENT_DIR" -mindepth 1 -maxdepth 1 -print -quit)"
[[ -z "$target_entries" ]] || { echo 'NAS target is not empty; refusing to overwrite it.' >&2; exit 1; }
docker --context colima-iot compose "${COMPOSE[@]}" stop api
rollback_needed=1
backup="$DEPLOY_DIR/.env.bak.nas-$(date +%Y%m%d-%H%M%S)"
cp "$DEPLOY_DIR/.env" "$backup"
rollback() {
  if [[ "${rollback_needed:-0}" == 1 ]]; then
    cp "$backup" "$DEPLOY_DIR/.env"
    docker --context colima-iot compose "${COMPOSE[@]}" up -d --force-recreate api >/dev/null || true
    echo 'NAS cutover rolled back to the prior document volume.' >&2
  fi
}
trap rollback EXIT

docker --context colima-iot run --rm -v "$old_volume:/source:ro" -v "$DOCUMENT_DIR:/target" alpine:3.22 sh -c 'cp -a /source/. /target/'
source_count="$(docker --context colima-iot run --rm -v "$old_volume:/data:ro" alpine:3.22 sh -c 'find /data -type f | wc -l')"
target_count="$(docker --context colima-iot run --rm -v "$DOCUMENT_DIR:/data:ro" alpine:3.22 sh -c 'find /data -type f | wc -l')"
[[ "$source_count" == "$target_count" ]] || { echo 'Document count mismatch after NAS copy.' >&2; exit 1; }

node - "$DEPLOY_DIR/.env" <<'NODE'
const fs=require('fs'); const file=process.argv[2]; let text=fs.readFileSync(file,'utf8');
for(const [key,value] of [['DEV_DOCUMENT_STORAGE_MODE','Nas'],['DEV_DOCUMENT_STORAGE_PATH','/mnt/iot-department/IoT Team Center']]){
 const line=key+'='+value; const re=new RegExp('^'+key+'=.*$','m'); text=re.test(text)?text.replace(re,line):text.replace(/\s*$/, '\n'+line+'\n');
}
fs.writeFileSync(file+'.tmp',text,{mode:0o600}); fs.renameSync(file+'.tmp',file);
NODE
docker --context colima-iot compose "${COMPOSE[@]}" up -d --force-recreate api

deadline=$((SECONDS+180))
until curl -fsS --max-time 10 https://iot-team-center.tomastc.com:8445/health/ready > /tmp/iot-nas-health.json 2>/dev/null; do
  (( SECONDS < deadline )) || { echo 'API did not become ready after NAS cutover.' >&2; exit 1; }
  sleep 5
done
grep -q '"documentStorage":"available"' /tmp/iot-nas-health.json || { echo 'API storage readiness failed.' >&2; exit 1; }
mode="$(docker --context colima-iot compose "${COMPOSE[@]}" exec -T api node -e "import('./dist/src/config.js').then(m=>console.log(m.loadConfig().documentStorage.mode))")"
[[ "$mode" == 'Nas' ]] || { echo 'API is not running in Nas mode.' >&2; exit 1; }
rollback_needed=0
trap - EXIT
echo "NAS_CUTOVER_SUCCESS migrated_files=$target_count"
