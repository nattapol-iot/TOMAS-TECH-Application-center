#!/usr/bin/env bash
# Mirror every repository of the GitHub organisation Tomas-TC into TMTHub (organisation TMT) as
# pull mirrors. Run daily by .github/workflows/tmthub-mirror.yml on the Mac mini runner, which
# reaches TMTHub on the tailnet; TMTHub itself pulls from github.com every hour after that.
#
#   - a GitHub repository with no TMT repository of that name becomes a new private pull mirror;
#   - an existing mirror gets the current token in its remote (an expired token is what stops
#     every mirror at once: GitHub answers "Repository not found") and is synced now;
#   - a TMT repository of the same name that is not a mirror holds work pushed to TMTHub and is
#     never touched: it is listed at the end.
#
# GH_TOKEN (environment): a GitHub token that can read the Tomas-TC repositories, from the
# Actions secret TMTHUB_MIRROR_GITHUB_TOKEN. TMTHub is called with the Engineering Center service
# account token (TMTHUB_API_TOKEN in the deployment's .env, issued by deploy.sh).
set -euo pipefail

DEPLOY_DIR="${IOT_DEPLOY_DIR:-/Users/Shared/iot-team-center/src}"
DOCKER_CONTEXT="${IOT_DOCKER_CONTEXT:-colima-iot}"
GITHUB_ORG="${TMTHUB_MIRROR_GITHUB_ORG:-Tomas-TC}"
# GitHub repositories kept on TMTHub under another name or by hand (lowercase).
SKIP="cpf-pegasus alpha-ht"
MIRROR_INTERVAL="1h0m0s"

log() { printf '==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
env_value() { grep -E "^$1=" "$DEPLOY_DIR/.env" | tail -n 1 | cut -d= -f2- | tr -d '"\r' || true; }
# Reads JSON on stdin into $d and runs the Perl snippet given as $1.
json() { /usr/bin/perl -MJSON::PP -0777 -ne 'my $d = decode_json($_); '"$1"; }

[[ -n "${GH_TOKEN:-}" ]] || die "GH_TOKEN is empty: set the repository secret TMTHUB_MIRROR_GITHUB_TOKEN (docs/TMTHUB.md)."
TMTHUB_HOST="$(env_value TMTHUB_HOST)"; TMTHUB_HOST="${TMTHUB_HOST:-tmthub.tomastc.com}"
TMTHUB_PORT="$(env_value TMTHUB_PORT)"; TMTHUB_PORT="${TMTHUB_PORT:-8446}"
TMTHUB_ORG="$(env_value TMTHUB_ORG)"; TMTHUB_ORG="${TMTHUB_ORG:-TMT}"
[[ -n "$(env_value TMTHUB_API_TOKEN)" ]] || die "TMTHUB_API_TOKEN is missing from $DEPLOY_DIR/.env; deploy TMTHub first."
HUB_API="https://$TMTHUB_HOST:$TMTHUB_PORT/api/v1"

# Tokens travel in header files, never in a process argument.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"
printf 'Authorization: token %s\n' "$GH_TOKEN" > "$work/gh"
printf 'Authorization: token %s\n' "$(env_value TMTHUB_API_TOKEN)" > "$work/hub"
gh_api() { curl -fsS --max-time 30 -H @"$work/gh" -H 'Accept: application/vnd.github+json' "$@"; }
hub() { curl -fsS --max-time 120 -H @"$work/hub" -H 'Content-Type: application/json' "$@"; }

container="$(docker --context "$DOCKER_CONTEXT" ps -q --filter label=com.docker.compose.service=tmthub | head -n 1)"
[[ -n "$container" ]] || die "The TMTHub container is not running."

# GitHub repositories of the organisation.
: > "$work/github"
page=1
while :; do
  gh_api "https://api.github.com/orgs/$GITHUB_ORG/repos?per_page=100&type=all&page=$page" > "$work/page" \
    || die "GitHub refused the token for $GITHUB_ORG (expired, or no access to the organisation)."
  count="$(json 'print scalar @$d' < "$work/page")"
  [[ "$count" -gt 0 ]] || break
  json 'print "$_->{name}\n" for @$d' < "$work/page" >> "$work/github"
  page=$((page + 1))
done
log "GitHub $GITHUB_ORG: $(wc -l < "$work/github" | tr -d ' ') repositories"

# TMT repositories: lowercase name, real name, mirror flag.
: > "$work/tmt"
page=1
while :; do
  hub "$HUB_API/orgs/$TMTHUB_ORG/repos?limit=50&page=$page" > "$work/page" || die "TMTHub refused the service account token."
  count="$(json 'print scalar @$d' < "$work/page")"
  [[ "$count" -gt 0 ]] || break
  json 'print lc($_->{name}), " ", $_->{name}, " ", ($_->{mirror} ? 1 : 0), "\n" for @$d' < "$work/page" >> "$work/tmt"
  page=$((page + 1))
done
log "TMTHub $TMTHUB_ORG: $(wc -l < "$work/tmt" | tr -d ' ') repositories"

created=0 refreshed=0 skipped=0 failed=0
kept=""
while read -r name; do
  [[ -n "$name" ]] || continue
  lower="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"
  if [[ " $SKIP " == *" $lower "* ]]; then skipped=$((skipped + 1)); continue; fi
  existing="$(awk -v n="$lower" '$1 == n { print $2, $3 }' "$work/tmt")"

  if [[ -z "$existing" ]]; then
    # New mirror. The body carries the GitHub token, so it goes on stdin.
    if GH_REPO="$name" ORG="$GITHUB_ORG" OWNER="$TMTHUB_ORG" INTERVAL="$MIRROR_INTERVAL" /usr/bin/perl -MJSON::PP -e '
        print encode_json({ clone_addr => "https://github.com/$ENV{ORG}/$ENV{GH_REPO}.git", auth_token => $ENV{GH_TOKEN},
          service => "github", repo_owner => $ENV{OWNER}, repo_name => $ENV{GH_REPO}, mirror => JSON::PP::true,
          mirror_interval => $ENV{INTERVAL}, private => JSON::PP::true, wiki => JSON::PP::false, issues => JSON::PP::false,
          pull_requests => JSON::PP::false, releases => JSON::PP::false, labels => JSON::PP::false, milestones => JSON::PP::false })' \
      | hub -X POST "$HUB_API/repos/migrate" --data @- >/dev/null; then
      log "Created mirror $TMTHUB_ORG/$name"; created=$((created + 1))
    else
      log "FAILED to create mirror $TMTHUB_ORG/$name"; failed=$((failed + 1))
    fi
    continue
  fi

  tmt_name="${existing% *}"
  if [[ "${existing##* }" != 1 ]]; then kept="$kept $tmt_name"; continue; fi

  # Existing mirror: put the current token in its remote, only when the remote is this GitHub
  # repository, then sync now. Forgejo keeps pull-mirror credentials in the remote URL.
  if printf '%s\n' "$GH_TOKEN" | docker --context "$DOCKER_CONTEXT" exec -i -u git "$container" sh -c '
      IFS= read -r token
      repo="/nas/repositories/$(printf "%s" "$1" | tr "[:upper:]" "[:lower:]")/$(printf "%s" "$2" | tr "[:upper:]" "[:lower:]").git"
      url="$(git -C "$repo" config --get remote.origin.url)" || exit 3
      case "$(printf "%s" "$url" | sed -E "s#^https://[^@/]*@#https://#" | tr "[:upper:]" "[:lower:]")" in
        "https://github.com/$(printf "%s" "$3/$4" | tr "[:upper:]" "[:lower:]")"|"https://github.com/$(printf "%s" "$3/$4" | tr "[:upper:]" "[:lower:]").git") ;;
        *) exit 4 ;;
      esac
      git -C "$repo" config remote.origin.url "https://oauth2:$token@github.com/$3/$4.git"' \
      sh "$TMTHUB_ORG" "$tmt_name" "$GITHUB_ORG" "$name" \
    && hub -X POST "$HUB_API/repos/$TMTHUB_ORG/$tmt_name/mirror-sync" >/dev/null; then
    refreshed=$((refreshed + 1))
  else
    log "FAILED to refresh mirror $TMTHUB_ORG/$tmt_name (remote is not github.com/$GITHUB_ORG/$name, or the sync request failed)"
    failed=$((failed + 1))
  fi
done < "$work/github"

log "Mirrors: $created created, $refreshed refreshed and synced, $skipped skipped by name, $failed failed"
[[ -z "$kept" ]] || log "Not mirrored (a TMTHub repository of that name holds its own work):$kept"
if [[ $failed -gt 0 ]]; then
  echo "::warning title=TMTHub mirror::$failed repositories failed; see the job log"
fi
