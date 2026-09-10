#!/usr/bin/env bash
set -euo pipefail
DEPLOY_DIR=/Users/tomastc/iot-team-center/src
MOUNT_DIR=/Users/tomastc/iot-team-center/nas
DOCUMENT_DIR="$MOUNT_DIR/IoT Team Center"
COMPOSE=(-f docker-compose.dev.yml -f docker-compose.tls.yml)
[[ -n "${NAS_USERNAME:-}" && -n "${NAS_PASSWORD:-}" ]] || { echo 'NAS secrets are not configured.' >&2; exit 1; }
[[ -f "$DEPLOY_DIR/.env" ]] || { echo 'Deployment .env is missing.' >&2; exit 1; }
cd "$DEPLOY_DIR"

credential_file=/Users/tomastc/iot-team-center/.nas-password.b64
umask 077
printf '%s' "$NAS_PASSWORD" | base64 > "$credential_file.tmp"
chmod 0600 "$credential_file.tmp"
mv "$credential_file.tmp" "$credential_file"
[[ "$(base64 -d < "$credential_file")" == "$NAS_PASSWORD" ]] || { echo 'Protected credential verification failed.' >&2; exit 1; }
unset NAS_PASSWORD
export DEV_NAS_USERNAME="$NAS_USERNAME"
echo 'Protected NAS credential installed.'
bash "$GITHUB_WORKSPACE/scripts/macos/mount-nas.sh"
unset NAS_USERNAME
mkdir -p "$DOCUMENT_DIR"
probe="$DOCUMENT_DIR/.iot-team-center-nas-probe"
printf 'iot-team-center-nas-check' > "$probe"
[[ "$(cat "$probe")" == 'iot-team-center-nas-check' ]]
rm "$probe"
colima ssh -p iot -- test -d "$DOCUMENT_DIR"
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
for(const [key,value] of [['DEV_DOCUMENT_STORAGE_MODE','Nas'],['DEV_DOCUMENT_STORAGE_PATH','/Users/tomastc/iot-team-center/nas/IoT Team Center'],['DEV_NAS_USERNAME',process.env.DEV_NAS_USERNAME]]){
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
