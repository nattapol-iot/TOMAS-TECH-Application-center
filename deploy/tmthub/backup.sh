#!/bin/sh
# tmthub-backup container (docker-compose.tls.yml): the parts of TMTHub that are not on the NAS
# already -- the SQLite database (users, issues, pull requests, permissions) and app.ini -- dumped
# to /nas/backups at start (so every deploy leaves a fresh copy) and then once a day. The
# repositories, LFS objects and attachments live on the NAS (/nas) and are not copied again.
# The newest $TMTHUB_BACKUP_KEEP dumps are kept.
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

while true; do
  dump || true
  sleep 86400
done
