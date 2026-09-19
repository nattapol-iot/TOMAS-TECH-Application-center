#!/usr/bin/env bash
set -euo pipefail
MOUNT_DIR=/private/tmp/iot-team-center-nas
LEGACY_MOUNT_DIR=/Users/tomastc/iot-team-center/nas
[[ -n "${DEV_NAS_USERNAME:-}" ]] || { echo 'DEV_NAS_USERNAME is missing.' >&2; exit 1; }
if /sbin/mount | grep -Fq " on $MOUNT_DIR "; then exit 0; fi
if /sbin/mount | grep -Fq " on $LEGACY_MOUNT_DIR "; then
  /usr/bin/perl -e 'alarm 20; exec @ARGV' /sbin/umount -f "$LEGACY_MOUNT_DIR"
fi
mkdir -p "$MOUNT_DIR"
/usr/bin/nc -G 8 -z 100.64.0.53 445 || { echo 'NAS SMB port is unreachable from the Mac host.' >&2; exit 1; }
echo 'NAS SMB port is reachable from the Mac host.'
CREDENTIAL_FILE=/Users/tomastc/iot-team-center/.nas-password.b64
[[ -f "$CREDENTIAL_FILE" && ! -L "$CREDENTIAL_FILE" ]] || { echo 'Protected NAS credential file is missing.' >&2; exit 1; }
[[ "$(stat -f '%Lp' "$CREDENTIAL_FILE")" == '600' ]] || { echo 'Protected NAS credential file has unsafe permissions.' >&2; exit 1; }
password="$(base64 -d < "$CREDENTIAL_FILE")"
[[ -n "$password" ]] || { echo 'NAS password is unavailable.' >&2; exit 1; }
# The self-hosted runner does not require Node on the Mac host. Encode UTF-8
# bytes with Bash builtins and keep credentials out of external process arguments.
url_encode() {
  local LC_ALL=C value="$1" encoded="" char hex i
  for ((i=0; i<${#value}; i++)); do
    char="${value:i:1}"
    case "$char" in
      [a-zA-Z0-9.~_-]) encoded+="$char" ;;
      *) printf -v hex '%%%02X' "'$char"; encoded+="$hex" ;;
    esac
  done
  printf '%s' "$encoded"
}
encoded_user="$(url_encode "$DEV_NAS_USERNAME")"
[[ "$password" != *$'\n'* && "$password" != *$'\r'* ]] || { echo 'NAS password contains an unsupported line break.' >&2; exit 1; }
encoded_password="$(url_encode "$password")"
unset password

# Keep the command out of logs; the URL-encoded credential only exists for this bounded mount process.
/usr/bin/perl -e 'alarm 30; exec @ARGV' /sbin/mount_smbfs "//$encoded_user:$encoded_password@100.64.0.53/IoT%20Department" "$MOUNT_DIR"
unset encoded_password
/sbin/mount | grep -Fq " on $MOUNT_DIR " || { echo 'NAS mount did not become active.' >&2; exit 1; }
