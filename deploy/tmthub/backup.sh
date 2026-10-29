#!/bin/sh
# tmthub-backup container (docker-compose.tls.yml): the parts of TMTHub that are not on the NAS
# already -- the SQLite database (users, issues, pull requests, permissions) and app.ini -- dumped
# to /nas/backups at start (so every deploy leaves a fresh copy) and then once a day. The
# repositories, LFS objects and attachments live on the NAS (/nas) and are not copied again.
# The newest $TMTHUB_BACKUP_KEEP dumps are kept. Every hour it also makes unreadable files on the
# NAS readable again (heal, below).
#
# Forgejo refuses to run as root, so the dump runs as the git user.
set -u
KEEP="${TMTHUB_BACKUP_KEEP:-14}"
CONFIG=/data/gitea/conf/app.ini
TARGET=/nas/backups

dump() {
  waited=0
  while [ ! -f "$CONFIG" ] && [ "$waited" -lt 300 ]; do sleep 5; waited=$((waited + 5)); done
  if [ ! -f "$CONFIG" ]; then echo "tmthub-backup: $CONFIG never appeared; is the tmthub container running?"; return 1; fi

  mkdir -p "$TARGET"
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  work="$(mktemp -d /tmp/tmthub-dump.XXXXXX)"
  chown git:git "$work"
  if (cd "$work" && su-exec git forgejo dump --config "$CONFIG" --tempdir "$work" --file "$work/tmthub-db-$stamp.zip" \
      --skip-repository --skip-lfs-data --skip-attachment-data --skip-package-data --skip-log --skip-index --skip-repo-archives) > "$work.log" 2>&1; then
    # Copy under a hidden name and rename, so a half-written zip is never mistaken for a backup.
    if cp "$work/tmthub-db-$stamp.zip" "$TARGET/.tmthub-db-$stamp.zip.part" && mv "$TARGET/.tmthub-db-$stamp.zip.part" "$TARGET/tmthub-db-$stamp.zip"; then
      echo "tmthub-backup: wrote backups/tmthub-db-$stamp.zip ($(du -h "$TARGET/tmthub-db-$stamp.zip" | cut -f1))"
    else
      echo "tmthub-backup: could not write to $TARGET on the NAS"
    fi
  else
    echo "tmthub-backup: forgejo dump failed"
    tail -n 20 "$work.log"
  fi
  rm -rf "$work" "$work.log"

  ls -1 "$TARGET"/tmthub-db-*.zip 2>/dev/null | sort -r | tail -n "+$((KEEP + 1))" | while read -r old; do rm -f "$old"; done
}

# Files on the NAS that read as mode 000 over NFS. Synology works out the mode of a file that
# still inherits the share's Windows ACL, and that answer sometimes turns to "no access" without
# anything here touching the file (seen 2026-10-29: whole mirror repositories at once); git then
# reports "not a git repository" and the page says the Git data cannot be read. A chmod gives the
# file an explicit mode, which has stayed readable since. Paths and change times are logged so
# the NAS side can be traced.
heal() {
  list="$(mktemp /tmp/tmthub-heal.XXXXXX)"
  find /nas/repositories /nas/lfs /nas/attachments ! -perm -u=r > "$list" 2>/dev/null
  count="$(wc -l < "$list" | tr -d ' ')"
  if [ "$count" -gt 0 ]; then
    echo "tmthub-heal: $count unreadable file(s) on the NAS made readable again, in $(cut -d/ -f5 "$list" | sort -u | wc -l | tr -d ' ') repo(s):"
    head -n 10 "$list" | while read -r path; do echo "  $(stat -c '%z' "$path" | cut -c1-19) ${path#/nas/}"; done
    tr '\n' '\0' < "$list" | xargs -0 chmod a+rw
  fi
  rm -f "$list"
}

# Heal before the dump, so the dump's result stays the last thing in the log that deploy.sh reads.
last_dump=0
while true; do
  heal || true
  now="$(date +%s)"
  if [ $((now - last_dump)) -ge 86400 ]; then
    dump || true
    last_dump="$now"
  fi
  sleep 3600
done
