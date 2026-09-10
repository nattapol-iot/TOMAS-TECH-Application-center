#!/usr/bin/env bash
set -euo pipefail
MOUNT_DIR=/Users/tomastc/iot-team-center/nas
[[ -n "${DEV_NAS_USERNAME:-}" ]] || { echo 'DEV_NAS_USERNAME is missing.' >&2; exit 1; }
if /sbin/mount | grep -Fq " on $MOUNT_DIR "; then exit 0; fi
mkdir -p "$MOUNT_DIR"
/usr/bin/nc -G 8 -z 100.64.0.53 445 || { echo 'NAS SMB port is unreachable from the Mac host.' >&2; exit 1; }
echo 'NAS SMB port is reachable from the Mac host.'
CREDENTIAL_FILE=/Users/tomastc/iot-team-center/.nas-password.b64
[[ -f "$CREDENTIAL_FILE" && ! -L "$CREDENTIAL_FILE" ]] || { echo 'Protected NAS credential file is missing.' >&2; exit 1; }
[[ "$(stat -f '%Lp' "$CREDENTIAL_FILE")" == '600' ]] || { echo 'Protected NAS credential file has unsafe permissions.' >&2; exit 1; }
password="$(base64 -d < "$CREDENTIAL_FILE")"
[[ -n "$password" ]] || { echo 'NAS password is unavailable.' >&2; exit 1; }
encoded_user="$(DEV_NAS_USERNAME="$DEV_NAS_USERNAME" node -e 'process.stdout.write(encodeURIComponent(process.env.DEV_NAS_USERNAME))')"
[[ "$password" != *$'\n'* && "$password" != *$'\r'* ]] || { echo 'NAS password contains an unsupported line break.' >&2; exit 1; }
export NAS_MOUNT_PASSWORD="$password"
encrypted_password="$(/usr/bin/expect <<'EXPECT'
log_user 0
set timeout 10
spawn /usr/bin/smbutil crypt
expect {
  -re {(?i)password.*:} { send -- "$env(NAS_MOUNT_PASSWORD)\r" }
  timeout { exit 124 }
  eof { exit 65 }
}
expect {
  -re {(\$\$1[^\r\n]+)} { puts $expect_out(1,string); exit 0 }
  timeout { exit 124 }
  eof { exit 65 }
}
EXPECT
)"
unset NAS_MOUNT_PASSWORD
[[ "$encrypted_password" == '$$1'* ]] || { echo 'Could not protect the NAS password for nsmb.conf.' >&2; exit 1; }
unset password
preferences_dir=/Users/tomastc/Library/Preferences
nsmb_conf="$preferences_dir/nsmb.conf"
mkdir -p "$preferences_dir"
if [[ -e "$nsmb_conf" && ! -f "$nsmb_conf" ]]; then
  echo 'Existing nsmb.conf is not a regular file; refusing to replace it.' >&2
  exit 1
fi
if [[ -f "$nsmb_conf" && ! -f "$nsmb_conf.iot-team-center-backup" ]]; then
  cp -p "$nsmb_conf" "$nsmb_conf.iot-team-center-backup"
fi
umask 077
{
  printf '[100.64.0.53:%s]\n' "$DEV_NAS_USERNAME"
  printf "password='%s'\n" "$encrypted_password"
} > "$nsmb_conf.tmp"
chmod 0600 "$nsmb_conf.tmp"
mv "$nsmb_conf.tmp" "$nsmb_conf"
unset encrypted_password

# -N prevents GUI/password prompts and reads the credentials from nsmb.conf.
/usr/bin/perl -e 'alarm 30; exec @ARGV' /sbin/mount_smbfs -N "//$encoded_user@100.64.0.53/IoT%20Department" "$MOUNT_DIR"
/sbin/mount | grep -Fq " on $MOUNT_DIR " || { echo 'NAS mount did not become active.' >&2; exit 1; }
