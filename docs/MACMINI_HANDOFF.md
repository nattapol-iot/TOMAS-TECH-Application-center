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

- Repo synced to `/Users/tomastc/iot-team-center/src` (rsync, no `.git`), at `main` abbb233.
- `node:24-slim`, `mcr.microsoft.com/dotnet/sdk:10.0`, `mcr.microsoft.com/dotnet/aspnet:10.0`
  pulled inside the `iot` VM, all arm64 native.
- `.env` written with `DEV_SQL_CONNECTION_STRING` plus the three hostname values below.
- Both services are up in Development mode. `src-api-1` answers `/health/live` with 200 and
  reaches SQL; `src-frontend-1` serves 200 on `http://tmt-eq-0056.tmtvpn.internal:3000`.
- `/health/ready` returns 200 with `schemaVersion: 36` against `IoTTeamCenterDev`, a database
  created fresh on 2026-09-07 with `database/scripts/020_deploy_fresh_database.sql`. The
  connection string originally pointed at `IoTTeamCenterTeamTest`, which turned out to be a
  partial deployment from 2026-09-04: 46 tables (roughly migrations 001-010) but an empty
  `dbo.schema_versions`, so every later migration's predecessor guard would throw. That
  database was left untouched; only `.env` was repointed (a timestamped `.env.bak.*` sits
  next to it).
- The SQL login in `.env` is `sa`. The repo's own deployment docs require the least-privileged
  `iot_team_app` login instead (`database/scripts/010_application_login.sql`). Combined with
  Development auth trusting every caller, `sa` behind an API on 0.0.0.0 is the single most
  important thing to fix before anyone outside the team can reach this host.
- `~/iot-team-center/sqlcmd.sh` runs `sqlcmd` (amd64 `mcr.microsoft.com/mssql-tools` under
  the iot VM's qemu binfmt) against whatever `.env` points at, with `/src` mounted read-only as
  the working directory so the runner's `:r` includes resolve. Override the database with
  `SQLCMD_DATABASE=<name>`; feed SQL on stdin or with `-i /src/...`. The legacy sqlcmd in that
  image rejects `-v`, so pass variables with `:setvar` on stdin instead.

### Reaching the app by hostname

`NEXT_PUBLIC_API_BASE_URL` is compiled into the browser bundle, the API filters CORS origins,
and Vite refuses unrecognised Host headers, so three values have to agree. They are derived
from two keys in `.env` (defaults keep plain `localhost` working for anyone developing on
their own machine):

```
DEV_API_BASE_URL=http://tmt-eq-0056.tmtvpn.internal:5105
DEV_SITE_ORIGIN=http://tmt-eq-0056.tmtvpn.internal:3000
DEV_ALLOWED_HOSTS=tmt-eq-0056.tmtvpn.internal,100.64.0.3,localhost
```

`DEV_SITE_ORIGIN` feeds both the frontend's `SITE_ORIGIN` and the API's
`Cors__AllowedOrigins__0`, which overrides the localhost-only origin in
`appsettings.Development.json`. `DEV_ALLOWED_HOSTS` reaches Vite through
`server.allowedHosts` in `vite.config.ts`.

### Two traps that cost time here

`npm ci` failed on the pushed `main` because `package-lock.json` was out of sync with
`package.json`: `@rolldown/binding-wasm32-wasi` pins `@emnapi/core` and `@emnapi/runtime` at
1.10.0 and the lock had no entries for them. `npm install --package-lock-only` regenerates it.
Watch for this after any dependency bump, because `npm ci` refuses rather than resolving.

`vinext dev` writes `.vinext/dev/lock.json` into the project directory, which is bind-mounted
from the host, so the lock outlives the container. After a `compose up` that replaces the
frontend container, the new one finds a lock naming a PID from the dead container and exits
with `Another vinext dev server is already running`. Remove `.vinext` and start it again.

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

Development mode is the chosen path because `Program.cs` skips the `AllowedHosts` and CORS
trust checks outside Production, the dev auth handler accepts every request as an
authenticated dev user, and `appsettings.Development.json` uses `DocumentStorage:Mode=Local`,
so no NAS and no Entra registration are needed.

1. Put `DEV_SQL_CONNECTION_STRING` in `/Users/tomastc/iot-team-center/src/.env`
   (see `.env.dev.example`). Decide first whether it points at the shared team SQL Server or
   at a separate database; see the warning below.
2. If anyone other than the host user will open the app, change the origins away from
   `localhost`, because `NEXT_PUBLIC_*` is compiled into the browser bundle at build time and
   cannot be corrected later without a rebuild:

   ```
   NEXT_PUBLIC_API_BASE_URL   http://tmt-eq-0056.tmtvpn.internal:5105
   SITE_ORIGIN                http://tmt-eq-0056.tmtvpn.internal:3000
   Cors__AllowedOrigins__0    http://tmt-eq-0056.tmtvpn.internal:3000
   ```

3. From `/Users/tomastc/iot-team-center/src`:

   ```
   docker --context colima-iot compose -f docker-compose.dev.yml up -d
   ```

4. If the 4GiB VM turns out to be tight, build one service at a time. Compose v2 builds
   services in parallel by default, which stacks `dotnet publish` and the vite build at the
   same peak.

### Exposure warning

`docker-compose.dev.yml` publishes 3000 and 5105 on 0.0.0.0, unlike the prod file which binds
127.0.0.1, and Development auth trusts every caller. On a tailnet-connected host that means
any tailnet member gets full authenticated API access with no sign-in. If the connection
string points at the shared team SQL Server, that is production data. Either point at a
separate database, or bind 127.0.0.1 and publish through `tailscale serve` so tailnet identity
is enforced.

Staging TeamTest is not an alternative here: `IsPrivateLanIpv4` in `Program.cs` accepts only
10/172.16/192.168, and the tailnet uses the 100.64.x CGNAT range.

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

Required before they can do anything:

1. **Access.** Append their public key to `/Users/tomastc/.ssh/authorized_keys`, or enable
   Tailscale SSH (`tailscale set --ssh` plus a tailnet ACL rule) if per-person audit trails
   matter more than setup time. Confirm System Settings keeps Remote Login on.
2. **The connection string.** Create `/Users/tomastc/iot-team-center/src/.env` with
   `DEV_SQL_CONNECTION_STRING` (shape in `.env.dev.example`). Compose refuses to even parse
   `docker-compose.dev.yml` without it, so this is the hard gate. Decide first whether it
   points at the shared team SQL Server or at a separate database, because Development auth
   trusts every caller.
3. **The exposure decision.** Leave the dev ports on 0.0.0.0 and accept that any tailnet
   member has full API access, or bind them to 127.0.0.1 and publish through
   `tailscale serve`. Whoever arrives cannot make this call for you.

Worth doing, not blocking:

4. **A separate macOS user** for them, with their own colima profile. This is what stops them
   from reaching the `cms` VM at all rather than merely not needing to. Requires sudo.
5. **An autostart agent for the `iot` profile**, modelled on the existing
   `com.tomastc.colima` LaunchAgent. Without it the app does not come back after a host
   reboot.
6. **A hostname**, if the app needs one. That means a site block in
   `/Users/tomastc/centralizemailsummary/deploy/Caddyfile`, which belongs to the `cms`
   project, so it is the owner's edit rather than theirs.

Also tell them, because it is not discoverable: the `iot` VM is theirs to restart freely, and
they should never have a reason to touch the `default` profile.

## Second machine

`macmini-2` / `tmt-eq-0055` is identical hardware (M4, 16GB) and far emptier: 3 containers,
colima at 4 CPU / 2GiB / 40GiB, no swap in use, 181GB free. It also runs `kamigata-sql`
(`azure-sql-edge`) on `127.0.0.1:1433`, which is one candidate for a separate dev database,
though Microsoft has retired that image and everything in `database/migrations` would have to
be applied from scratch.
