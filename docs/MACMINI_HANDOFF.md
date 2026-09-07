# Mac mini host handoff (macmini-1 / tmt-eq-0056)

State as of 2026-09-07. This host is where this repo is being brought up outside Windows/IIS.
It is not a dedicated box, so most of this document is about not breaking the other tenants.

## The host

Mac mini M4 (`Mac16,10`), 16GB, macOS 26.5.2. Tailnet node `tmt-eq-0056`, reachable as
`ssh macmini-1` (user `tomastc`). It already serves other workloads: the `cms` stack
(14 containers, including `cms-caddy-1` which fronts copilot.tomastc.com via
`reverse_proxy web:3000`), `orgrag` (3 containers), and `autoheal`.

## Getting in

SSH over the tailnet. The host answers on port 22 (macOS Remote Login), and there is a single
account, `tomastc`. Tailscale SSH is *not* enabled on this node, so access is ordinary SSH with
a key that the host owner has installed.

Put this in your own `~/.ssh/config`:

```
Host macmini-1
    HostName tmt-eq-0056
    User tomastc
    Port 22
    IdentityFile ~/.ssh/id_ed25519_macmini
    IdentitiesOnly yes
```

`HostName` resolves through Tailscale MagicDNS, so you must be connected to the tailnet.
The fully qualified name is `tmt-eq-0056.tmtvpn.internal` and the tailnet address is
`100.64.0.3` if MagicDNS is not resolving for you.

For GUI work, AnyDesk is installed and running on the host. It shares the same desktop
session as whoever is logged in, so coordinate before taking over the screen.

## Container runtime layout

Two colima VMs, deliberately separate:

| profile | docker context | cpu / mem / disk | owns |
| --- | --- | --- | --- |
| `default` | `colima` | 6 / 10GiB / 100GiB | pre-existing `cms` + `orgrag`, 18 containers |
| `iot` | `colima-iot` | 2 / 4GiB / 40GiB | this repo only |

The split exists because a colima VM has `SwapTotal: 0`, so VM memory is a hard ceiling
shared by every container inside it. Container boundaries isolate processes and networks,
not memory: with everything in one VM, a build that exhausts memory lets the kernel
OOM-kill the largest process VM-wide, which is another tenant's database. Separate VMs also
isolate `docker system prune` and VM restarts.

Always target the VM explicitly:

```
docker --context colima-iot compose -f docker-compose.dev.yml up -d
# or
export DOCKER_HOST=unix:///Users/tomastc/.colima/iot/docker.sock
```

`colima start -p iot` switches the *current* docker context as a side effect. Put it back
with `docker context use colima` or unrelated `cms` commands will silently hit the wrong
daemon.

## Day-to-day with the `iot` profile

Everything below is scoped to the `iot` VM and cannot disturb the `cms` tenants. The one
habit that matters: never run a colima or docker command without saying which VM you mean.

The safest way is to pin the socket for your shell session, after which a bare `docker`
talks only to the `iot` VM:

```
export DOCKER_HOST=unix:///Users/tomastc/.colima/iot/docker.sock
```

Otherwise pass `--context colima-iot` on every docker call and `-p iot` on every colima call.

```
colima status -p iot
colima ssh -p iot -- free -m
colima ssh -p iot -- df -h /var/lib/docker
colima stop -p iot
colima start -p iot
```

Bringing the app up, watching it, taking it down, from `/Users/tomastc/iot-team-center/src`:

```
docker --context colima-iot compose -f docker-compose.dev.yml up -d --build
docker --context colima-iot compose -f docker-compose.dev.yml logs -f api
docker --context colima-iot compose -f docker-compose.dev.yml ps
docker --context colima-iot compose -f docker-compose.dev.yml down
```

Reclaiming space inside this VM only:

```
docker --context colima-iot system prune -a
docker --context colima-iot builder prune -f
```

Things that reach outside this profile and take down copilot.tomastc.com along with the rest
of the `cms` stack. None of them are needed for normal work here:

- `colima stop`, `colima restart`, `colima delete` with no `-p iot`
- `docker system prune` with no `--context colima-iot`
- `docker context use colima-iot`, which changes the default for the whole `tomastc` account,
  so later `cms` commands typed by someone else silently hit the wrong daemon. If you do run
  it, put it back with `docker context use colima`. `colima start -p iot` has this same side
  effect.

Updating the source on the host. There is no `.git` in the deploy copy on purpose, so it is
an rsync from a machine that has the repo, not a `git pull` on the host:

```
rsync -az --delete --exclude node_modules --exclude .git --exclude dist --exclude .next ./ macmini-1:/Users/tomastc/iot-team-center/src/
```

## Already done
State on 2026-09-07 evening. Everything below is live and was verified with real requests.

- Repo deploy copy at `/Users/tomastc/iot-team-center/src`, synced from the CI checkout by
  `scripts/macos/deploy.sh` (rsync; `.env` and `.env.bak.*` preserved; no `.git`).
- Three containers in the `iot` VM, compose project `src`: `src-api-1` (backend-node, arm64,
  tedious driver), `src-frontend-1` (vinext dev server), `src-caddy-1` (Caddy with Cloudflare
  DNS-01, Let's Encrypt certificate for `iot-team-center.tomastc.com`, renews itself).
- URLs: frontend `https://iot-team-center.tomastc.com:8444/`, API
  `https://iot-team-center.tomastc.com:8445/` (`/health/ready` returns 200, `schemaVersion: 36`).
  DNS is `iot-team-center.tomastc.com A 100.64.0.3`, DNS-only, so it resolves everywhere but only
  answers inside the tailnet. Plain ports 3000 and 5105 are bound to 127.0.0.1 on the host.
- Database: `IoTTeamCenterDev` on the team SQL Server, created fresh on 2026-09-07 with
  `database/scripts/020_deploy_fresh_database.sql` (all 36 migrations). The connection string
  originally pointed at `IoTTeamCenterTeamTest`, a partial deployment from 2026-09-04 (46 tables,
  roughly migrations 001-010, zero rows in every table, empty `dbo.schema_versions`, so every
  later migration's predecessor guard throws). It was left untouched; dropping and recreating it
  under that name is still an open decision.
- The API is `backend-node/`, not `backend/IoTTeamCenter.Api`. The .NET project stops at schema
  version 28 and lacks every route added by migrations 014-036; `backend-node/README.md` calls
  itself the replacement. It now uses the `mssql` default driver (tedious) instead of
  `msnodesqlv8`: that native binding hung on connect in Linux containers on both arm64 and amd64
  while `isql` with the same ODBC driver succeeded, and tedious connected on the first try.
  Windows authentication in the connection string is rejected at startup on purpose.
- GitHub Actions self-hosted runner `macmini-1` (label `iot-team-center-macmini`) at
  `/Users/tomastc/actions-runner`, launchd service
  `actions.runner.pattana1902-IoT-Team-Center.macmini-1`. See "Automatic deploys".
- TMT ID (Keycloak, realm `internal`) confidential client `iot-team-center`: redirect URIs
  `https://iot-team-center.tomastc.com:8444/api/auth/callback` and the `:8445` twin, PKCE S256,
  post-logout redirects to both origins. `OIDC_*`, `PUBLIC_BASE_URL`, `SESSION_SECRET` are in the
  host `.env`; the application code shipped in PR #5 and is live (see "TMT ID sign-in").
- The SQL login in `.env` is still `sa`. The deployment docs require the least-privileged
  `iot_team_app` login (`database/scripts/010_application_login.sql`). Fix this before anyone
  outside the team can reach the host.
- `~/iot-team-center/sqlcmd.sh` runs `sqlcmd` (amd64 `mcr.microsoft.com/mssql-tools` under the
  iot VM's qemu binfmt) against whatever `.env` points at, with `/src` mounted read-only as the
  working directory so the runner's `:r` includes resolve. `SQLCMD_DATABASE=<name>` overrides the
  database; feed SQL on stdin or with `-i /src/...`; that legacy sqlcmd rejects `-v`, so use
  `:setvar` on stdin.

## Constraints that shape everything

1. Only `/Users/tomastc` is mounted into either VM (`mounts: []`, virtiofs). A docker build
   context must live under that home. The `/opt/iot-team-center` paths in
   `PRODUCTION_DEPLOYMENT_LINUX.md` are invisible to the VM and cannot be used here.
2. No passwordless sudo. `/etc/iot-team-center/` cannot be created without a password, which
   rules out the `env_file` layout `docker-compose.prod.yml` expects until someone creates it
   by hand.
3. SQL Server is never containerized here. There is no supported arm64 image and the API uses
   `Microsoft.Data.SqlClient` throughout, so a connection string to the shared team SQL host
   is always required. The four postgres containers on this machine are unrelated.
4. `cms-caddy-1` owns `127.0.0.1:80` and `127.0.0.1:8443`. Do not install nginx. Add a site to
   `/Users/tomastc/centralizemailsummary/deploy/Caddyfile`, which already issues TLS through
   Cloudflare DNS.
5. `127.0.0.1:3000` and `127.0.0.1:5105` are free. `cms-web-1` uses container port 3000 but
   does not publish it; langfuse holds 3001.
6. Every service this repo runs here must set `mem_limit` and a log cap, so that our own
   container is the OOM victim rather than a co-tenant's. Both compose files carry a
   `json-file` 10m x 3 cap; the dev file sets `mem_limit` 1g (api) and 3g (frontend).
   `docker-compose.prod.yml` still has no `mem_limit`.
7. VM memory is configured, not reserved: Apple Virtualization grows the VM resident size on
   demand, so 10GiB + 4GiB configured on a 16GiB host works but is overcommitted. Check
   `sysctl -n vm.swapusage` and `memory_pressure` before adding a third VM.

## Restart behaviour

Restarting the `default` profile takes down all 18 containers, copilot.tomastc.com included.
15 of them carry `restart: unless-stopped` and come back on their own. These three do not and
must be started by hand afterwards:

```
docker start cms-invoice-bench-db-1 cms-namecard-audit-db-1 cms-playground-1
```

The `iot` profile can be restarted freely; nothing else depends on it. It has no autostart
agent yet, so it will not survive a host reboot until one is added.

Two launchd agents exist for colima: `com.tomastc.colima` (RunAtLoad, the one that actually
works) and `homebrew.mxcl.colima` (KeepAlive, currently sitting at exit status 1). Only the
first is authoritative; the failing duplicate is worth removing to avoid confusion about who
starts the VM.

## Bringing this repo up (Development mode)
Development mode is the running configuration: `backend-node/src/config.ts` relaxes
`AllowedHosts` outside production, the dev auth handler accepts every request as an
authenticated dev user, and document storage is `Local`, so no NAS and no Entra registration are
needed. backend-node still validates CORS origins in every environment and accepts plain http
only for localhost, which is why the stack runs behind TLS.

One command does everything, and it is the same command the CI runner executes:

```
~/iot-team-center/src/scripts/macos/deploy.sh --source /path/to/checkout
```

It syncs the checkout into the deploy dir, clears the stale vinext lock, builds, starts
`docker-compose.dev.yml` plus `docker-compose.tls.yml` in the `colima-iot` context, waits for
`/health/ready` and the frontend, then prunes dangling layers. It needs `.env` in the deploy dir
with:

```
DEV_SQL_CONNECTION_STRING   ADO.NET string with a SQL login (Windows auth is rejected)
DEV_API_BASE_URL            https://iot-team-center.tomastc.com:8445
DEV_SITE_ORIGIN             https://iot-team-center.tomastc.com:8444
DEV_ALLOWED_HOSTS           iot-team-center.tomastc.com,tmt-eq-0056.tmtvpn.internal,100.64.0.3,localhost
DEV_API_ALLOWED_HOSTS       iot-team-center.tomastc.com;iot-team-center.tomastc.com:8445;localhost;127.0.0.1
PUBLIC_HOST                 iot-team-center.tomastc.com
CLOUDFLARE_API_TOKEN        Zone.DNS edit on tomastc.com (the token cms-caddy already uses)
OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET / PUBLIC_BASE_URL / SESSION_SECRET / SESSION_COOKIE_SECURE
```

`DEV_SITE_ORIGIN` feeds both the frontend's `SITE_ORIGIN` and the API's
`Cors__AllowedOrigins__0`; `DEV_ALLOWED_HOSTS` reaches Vite through `server.allowedHosts` in
`vite.config.ts`; `DEV_API_ALLOWED_HOSTS` is backend-node's `AllowedHosts`. `NEXT_PUBLIC_*` is
compiled into the browser bundle, so a hostname change needs a frontend restart.

Dropping `:8444` from the URL is not possible without touching another tenant: Tailscale Serve
hands host port 443 to `cms-caddy-1` (`127.0.0.1:8443`), so a portless hostname needs a site
block in `/Users/tomastc/centralizemailsummary/deploy/Caddyfile`. A Cloudflare Origin Rule
cannot do it because the origin is a tailnet address the Cloudflare edge cannot reach. Parked
deliberately.

### Exposure warning

`docker-compose.tls.yml` pins the plain http ports to 127.0.0.1, so the only way in is through
Caddy on 8444/8445, and Development auth still trusts every caller. Any tailnet member therefore
has full authenticated API access, and the connection string carries `sa`. Until
`Authentication__Mode=TmtId` lands and the login moves to `iot_team_app`, treat this instance as
internal-only test data.

Staging TeamTest is not an alternative here: `IsPrivateLanIpv4` accepts only 10/172.16/192.168,
and the tailnet uses the 100.64.x CGNAT range.

## TMT ID sign-in

Live since 2026-09-07 evening. `Authentication__Mode=TmtId` on the API and
`NEXT_PUBLIC_AUTH_MODE=tmt-id` on the frontend, both driven from the host `.env`
(`DEV_API_AUTH_MODE`, `DEV_FRONTEND_AUTH_MODE`). Flow: the frontend calls `GET /api/me` once;
a 401 sends the browser to `/api/auth/login`, Keycloak (`https://auth.tomastc.com/realms/internal`,
client `iot-team-center`, PKCE S256) authenticates through LINE WORKS or Microsoft, the callback
sets a sealed httpOnly session cookie (8 hours), `/api/auth/logout` does RP-initiated logout.

Single origin: Caddy serves `/api/*` and `/health/*` on `https://iot-team-center.tomastc.com:8444`,
so `DEV_API_BASE_URL` and `PUBLIC_BASE_URL` are both that origin and no CORS is involved. The
`:8445` site still exposes the API directly for operators and for `deploy.sh`'s health check.

First-login provisioning: `TMT_ID_DEFAULT_ROLE_CODE=Admin` in `.env` makes the callback create
the `dbo.users` row for anyone TMT ID authenticates (owner's decision: everyone who signs in gets
in, all as Admin for now). Keycloak `sub` lands in `entra_object_id`, the same key
`CurrentUserService` joins on. Change the role code, or unset it to go back to manual
provisioning with `database/scripts/030_provision_user.sql`. Profile enrichment from master-data
is dormant (`MASTER_DATA_URL` / `MASTER_DATA_API_KEY` unset), so names come from the token.

Keycloak admin: `https://100.64.0.4:2083/admin`, realm `internal`, bootstrap admin credentials
are with the owner. Rotating the client secret means updating `OIDC_CLIENT_SECRET` in `.env`
and `deploy.sh` (or `compose up -d api`).

### More traps that cost time

- Writing secrets into `.env` through nested shells (Windows bash -> WSL -> ssh -> python)
  silently produced empty values once, because `$VAR` expanded on the wrong side. Write `.env`
  with a script executed on the host, and verify with `awk -F= '{print length($2)}'`, never with
  a masking `sed`.
- Shell scripts checked out on Windows arrived as CRLF and `set -o pipefail` became
  `pipefail\r`. `.gitattributes` now forces LF on `*.sh`; the CI runner was never affected.
- A single-file bind mount of the Caddyfile kept serving the old inode after rsync replaced the
  file, so `caddy reload` reloaded stale config. The overlay mounts the `deploy/caddy` directory
  and `deploy.sh` reloads Caddy after every `up`.
- The interactive Keycloak login has not been exercised by a human yet; everything up to the
  redirect to `auth.tomastc.com` (correct client id, PKCE, callback URI) and the 401 gate has.

## Automatic deploys

Every push to `main` runs `.github/workflows/ci-cd.yml`. The `deploy-macmini` job waits for
`checks` (lint, typecheck, unit tests) and then runs `scripts/macos/deploy.sh` on the
self-hosted runner labelled `iot-team-center-macmini`. It deliberately does not wait for
`sql-integration` (a throwaway SQL 2022 service container that has been flaky) and has no
approval environment: merging a PR is the approval.

Runner facts: `/Users/tomastc/actions-runner`, launchd service
`actions.runner.pattana1902-IoT-Team-Center.macmini-1`, runs as `tomastc` and so can reach both
colima VMs; the deploy script only ever addresses `colima-iot`. Manage it with
`cd ~/actions-runner && ./svc.sh status|stop|start`. Re-registering (new token from
Settings -> Actions -> Runners) is `./config.sh remove`, then `./config.sh --url ... --token ...
--name macmini-1 --labels iot-team-center-macmini --replace`, then `./svc.sh install && ./svc.sh start`.

If a deploy fails, the job log ends with `compose ps` and the last 40 log lines. The previous
containers keep running until `compose up -d` replaces them, so a failed build leaves the old
version serving.

## Letting other people deploy here

Three layers, meant to be used together rather than chosen between:

1. **CI, no shell access.** `.github/workflows/ci-cd.yml` already runs on a self-hosted runner
   behind a GitHub Environment with a required reviewer, and calls `deploy.sh` through a
   narrowly scoped sudoers entry. On macOS the sudoers part is unnecessary because the colima
   socket is user-owned, which is also the catch: anyone who can run as `tomastc` reaches
   every VM.
2. **A separate macOS user with their own colima profile.** This is what turns the isolation
   into a permission boundary and not just a blast-radius boundary. It needs sudo, so it has
   not been done.
3. **Limits on every service.** `mem_limit`, `cpus`, restart policies, log caps. This layer
   protects the host from us rather than from other people, so it applies either way.

## What the host owner has to prepare
Nothing in this list can be done by the person arriving; all of it belongs to whoever owns
`tomastc` on the host.

Already in place: SSH key `iot-guest_ed25519` installed in `authorized_keys` (the private half is
in the handoff bundle, see "Getting in"); `.env` with the SQL connection string, TLS, and TMT ID
values; the self-hosted runner; DNS and certificate.

Still the owner's call:

1. **`sa` in the connection string.** Run `database/scripts/010_application_login.sql` against
   `IoTTeamCenterDev`, then swap `DEV_SQL_CONNECTION_STRING` to `iot_team_app` and redeploy.
   Nobody outside the team should reach this host before that.
2. **`IoTTeamCenterTeamTest`.** Drop the partial database and recreate it under that name with
   `020_deploy_fresh_database.sql` (then repoint `.env` and drop `IoTTeamCenterDev`), or keep
   using `IoTTeamCenterDev`. Either is fine; what is not fine is leaving two half-truths around.
3. **A separate macOS user** for guests, with their own colima profile, if permission isolation
   matters and not just blast radius. Needs sudo.
4. **Autostart for the `iot` profile.** It has no LaunchAgent; the app does not come back after a
   host reboot until one is added (model it on `com.tomastc.colima`). The runner service does
   come back on its own.
5. **Portless hostname.** Only through a site block in the cms Caddyfile; see the bring-up section.
6. **Master-data directory access** for TMT ID profile enrichment (`MASTER_DATA_URL`,
   `MASTER_DATA_API_KEY`); without it the app shows the token's `preferred_username` and email.

Also tell them, because it is not discoverable: the `iot` VM is theirs to restart freely, and
they should never have a reason to touch the `default` profile.

## Second machine

`macmini-2` / `tmt-eq-0055` is identical hardware (M4, 16GB) and far emptier: 3 containers,
colima at 4 CPU / 2GiB / 40GiB, no swap in use, 181GB free. It also runs `kamigata-sql`
(`azure-sql-edge`) on `127.0.0.1:1433`, which is one candidate for a separate dev database,
though Microsoft has retired that image and everything in `database/migrations` would have to
be applied from scratch.
