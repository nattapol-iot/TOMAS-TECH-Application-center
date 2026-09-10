#!/usr/bin/env bash
set -euo pipefail
MOUNT_DIR=/Users/tomastc/iot-team-center/nas
[[ -n "${DEV_NAS_USERNAME:-}" ]] || { echo 'DEV_NAS_USERNAME is missing.' >&2; exit 1; }
if /sbin/mount | grep -Fq " on $MOUNT_DIR "; then exit 0; fi
mkdir -p "$MOUNT_DIR"
CREDENTIAL_FILE=/Users/tomastc/iot-team-center/.nas-password.b64
[[ -f "$CREDENTIAL_FILE" && ! -L "$CREDENTIAL_FILE" ]] || { echo 'Protected NAS credential file is missing.' >&2; exit 1; }
[[ "$(stat -f '%Lp' "$CREDENTIAL_FILE")" == '600' ]] || { echo 'Protected NAS credential file has unsafe permissions.' >&2; exit 1; }
password="$(base64 -d < "$CREDENTIAL_FILE")"
[[ -n "$password" ]] || { echo 'NAS password is unavailable.' >&2; exit 1; }
encoded_user="$(DEV_NAS_USERNAME="$DEV_NAS_USERNAME" node -e 'process.stdout.write(encodeURIComponent(process.env.DEV_NAS_USERNAME))')"
export NAS_MOUNT_PASSWORD="$password"
unset password
/usr/bin/expect <<EXPECT
log_user 0
set timeout 30
spawn /sbin/mount_smbfs "//$encoded_user@100.64.0.53/IoT%20Department" "$MOUNT_DIR"
expect {
  -re {(?i)password.*:} { send -- "\$env(NAS_MOUNT_PASSWORD)\r"; exp_continue }
  eof
}
catch wait result
exit [lindex \$result 3]
EXPECT
unset NAS_MOUNT_PASSWORD
/sbin/mount | grep -Fq " on $MOUNT_DIR " || { echo 'NAS mount did not become active.' >&2; exit 1; }
