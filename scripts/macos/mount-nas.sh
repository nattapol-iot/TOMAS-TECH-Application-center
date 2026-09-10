#!/usr/bin/env bash
set -euo pipefail
MOUNT_DIR=/Users/tomastc/iot-team-center/nas
[[ -n "${DEV_NAS_USERNAME:-}" ]] || { echo 'DEV_NAS_USERNAME is missing.' >&2; exit 1; }
if /sbin/mount | grep -Fq " on $MOUNT_DIR "; then exit 0; fi
mkdir -p "$MOUNT_DIR"
password="$(/usr/bin/security find-generic-password -a "$DEV_NAS_USERNAME" -s iot-team-center-nas -w)"
[[ -n "$password" ]] || { echo 'NAS password is unavailable in Keychain.' >&2; exit 1; }
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
