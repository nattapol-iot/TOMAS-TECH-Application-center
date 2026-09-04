# Production deployment on Ubuntu (self-hosted API + frontend)

This is an alternative to [`docs/PRODUCTION_DEPLOYMENT.md`](PRODUCTION_DEPLOYMENT.md) for
teams running both the ASP.NET Core API **and** the frontend on one bare **Ubuntu** server
behind nginx (systemd-managed processes) instead of Windows Server/IIS + Vercel. Read the
Windows doc first for the parts that do not change: Entra app registration, SQL Server
hardening, backups/rollback objectives, and the go-live checklist. This document only
covers what is different on Linux: the host bootstrap, the publish/release mechanism for
both services, and document storage.

The scripts referenced here (`scripts/linux/`) never install or configure SQL Server and
never create Microsoft Entra app registrations. Both remain manual/DBA-and-IT-owned steps,
exactly as in the Windows path. See [`docs/CI_CD_SETUP.md`](CI_CD_SETUP.md) for automating
the deploy steps below through GitHub Actions with a manual production-approval gate,
instead of running them by hand every release.

## Architecture on this path

```text
User browser
    |  HTTPS + Microsoft Entra access token
    v
nginx (TLS termination), one Ubuntu host, two server_name-based sites:
    - <FRONTEND_HOST>  -> vinext "start" (Node), 127.0.0.1, run by systemd
    - <API_HOST>       -> Kestrel (.NET),         127.0.0.1, run by systemd
                              |\
                              | \ CIFS mount of the company NAS share (see below)
                              |  v
                              |  Company NAS / \\100.98.152.4\<SHARE_NAME>, mounted locally
                              |
                              | encrypted Microsoft.Data.SqlClient connection
                              v
                    Microsoft SQL Server / IoTTeamCenter (separate host; not managed by these scripts)
```

The frontend never talks to SQL Server directly; it only calls the API over HTTPS with a
bearer token, same as the Vercel-hosted path in `docs/PRODUCTION_DEPLOYMENT.md`.

## How `DocumentStorage:Mode=Nas` works on a non-Windows host

Production still requires `DocumentStorage:Mode=Nas` -- that has not changed. What
changed is how `Nas` mode is validated: on Windows it still requires the classic
`\\server\share` UNC format (unchanged); on a non-Windows host it instead requires
`RootPath` to be an absolute path that is **currently a mounted filesystem**, checked at
startup against the running host's actual mount table
(`backend/IoTTeamCenter.Api/Infrastructure/DocumentStorageOptions.cs`,
`ValidateAndNormalizeUncRoot`). `ProjectDocumentStorage` itself is plain, OS-agnostic file
I/O -- only this one validation function is OS-aware.

On Ubuntu, mount the real NAS share at the OS level with `cifs-utils`
(`install-production-host.sh` does this for you) at a fixed local path, and point
`DocumentStorage__RootPath` at that exact mount point. The API refuses to start if that
path is not, at that moment, an actual mount point -- an ordinary local folder at the same
path is deliberately rejected, so Production cannot silently fall back to plain, ephemeral
local disk the way it could if this were left as an unchecked `Local` path. Two things are
still **not** checked by the application the way they might be assumed:

- The mount being *present* doesn't prove it's the *correct* NAS share -- a typo'd
  `--nas-unc` at bootstrap could mount the wrong share and still pass this check.
- The mount's health, backup/retention, and restart-resilience are entirely the host
  operator's responsibility (via `/etc/fstab`'s `_netdev,nofail` options and your own
  monitoring), not something the API validates beyond the existing `/health/ready`
  availability probe.

Treat the same NAS prerequisites from `docs/PRODUCTION_DEPLOYMENT.md` ("Company NAS
document storage" section) as still required: an IT-approved share/service identity, ACLs
scoped to the application root, malware scanning, and a tested backup/restore process for
the share. Run `scripts/Test-NasStorage.ps1`'s intent manually (a disposable write/read/
delete round trip as the service account) against the mounted path before go-live; that
script itself is PowerShell/Windows-only and does not run on this host.

## 1. Prerequisites

- A bare Ubuntu server (22.04 LTS or newer) with a static/DHCP-reserved address and root
  (sudo) access.
- DNS for **both** `<API_HOST>` and `<FRONTEND_HOST>` pointing at this server, and a plan
  for certificates (the install script can obtain both via Let's Encrypt/certbot once DNS
  resolves).
- The NAS share details and a dedicated CIFS credentials file prepared in advance, e.g.:

  ```text
  username=<NAS_SERVICE_IDENTITY>
  password=<FROM_SECRET_MANAGER>
  ```

  Keep this file off the repository entirely; the install script copies it into
  `/etc/iot-team-center/nas-credentials` with mode `600`.
- A connection string for the dedicated least-privileged SQL login (`iot_team_app`),
  created on the separate SQL Server host using the existing, unchanged
  `database/scripts/005_create_server_login.template.sql` and
  `database/scripts/010_application_login.sql` procedure from `docs/PRODUCTION_DEPLOYMENT.md`
  sections 3-4. These scripts run against the SQL host from any machine with `sqlcmd`;
  nothing about them is Windows-specific.
- Microsoft Entra `TenantId`/`ClientId`(API)/`Audience`/`SPA client ID` values once the two
  app registrations exist (`docs/PRODUCTION_DEPLOYMENT.md` section 2). Until then, a
  syntactically valid but non-real GUID (`uuidgen`) lets the API start for infrastructure
  testing; real sign-in will not work until the real values are deployed.
- If deploying via CI instead of by hand, an SSH keypair for the restricted deploy account
  -- see `docs/CI_CD_SETUP.md`.

## 2. Bootstrap the host (once per server)

```bash
sudo ./scripts/linux/install-production-host.sh \
  --api-host iot-api.example.tomastc.com \
  --frontend-host iot-team-center.example.tomastc.com \
  --nas-unc "//100.98.152.4/<SHARE_NAME>/<APP_ROOT>" \
  --nas-credentials-file /root/secure/iot-team-center-nas.cifs-credentials \
  --deploy-user iot-deploy --deploy-ssh-public-key-file /root/secure/iot-deploy.pub
```

This installs the .NET 10 ASP.NET Core runtime, Node.js 22+, ICU/tzdata, nginx, and
`cifs-utils`; creates dedicated `iotapi`/`iotfrontend` system accounts; mounts the NAS
share; writes (but does not start) the `iot-team-center-api.service` and
`iot-team-center-frontend.service` systemd units; and writes HTTP-only nginx sites for
both hostnames. Omit `--deploy-user`/`--deploy-ssh-public-key-file` if you'll only ever
deploy by hand from an operator's own SSH session. It configures `ufw` rules for 80/443
but deliberately does **not** run `ufw enable` itself, to avoid locking you out over SSH
if the ruleset is wrong -- review `ufw status verbose` and enable it yourself.

Once DNS for both hostnames resolves to this server, re-run with TLS:

```bash
sudo ./scripts/linux/install-production-host.sh \
  --api-host iot-api.example.tomastc.com \
  --frontend-host iot-team-center.example.tomastc.com \
  --nas-unc "//100.98.152.4/<SHARE_NAME>/<APP_ROOT>" \
  --nas-credentials-file /root/secure/iot-team-center-nas.cifs-credentials \
  --enable-tls --cert-email <owner@company>
```

All steps are idempotent; re-running does not restart a running service.

## 3. Prepare the environment files and deploy a release

Copy `scripts/linux/api.env.template` and `scripts/linux/frontend.env.template` to a
secured location outside the repository, fill in every `<PLACEHOLDER>` in both, then
deploy each service (order doesn't matter):

```bash
sudo ./scripts/linux/deploy-release.sh \
  --repo /path/to/this/repository/checkout \
  --env-file /root/secure/iot-team-center-api.env

sudo ./scripts/linux/deploy-frontend-release.sh \
  --repo /path/to/this/repository/checkout \
  --env-file /root/secure/iot-team-center-frontend.env
```

`deploy-release.sh` runs `dotnet publish` into a new immutable release directory;
`deploy-frontend-release.sh` runs `npm ci && npm run build` (which itself runs the
existing `scripts/validate-production-env.mjs` gate) into its own immutable release
directory. Both refuse to proceed if their env file still contains a `<PLACEHOLDER>`
marker or is missing a required key, install that file under `/etc/iot-team-center/`
(mode `600`), swap their own `current` symlink, `systemctl enable --now` their own
service, and poll a health endpoint before declaring success. The API's poll also prints
the `/health/ready` body (informational -- expected to report `migrations_required` or a
connection failure until the separate SQL Server is reachable and at schema version 9,
and `document_storage_unavailable` until the NAS mount is healthy).

Re-run the matching command for every subsequent release; each keeps the last 5 release
directories (`--keep-releases`) for rollback and never deletes the one `current` points to.

To automate both of the above from a dev's `git push` through a manual production
approval, see [`docs/CI_CD_SETUP.md`](CI_CD_SETUP.md) -- `.github/workflows/ci-cd.yml`
runs these exact two scripts over SSH after tests pass and a reviewer approves.

## 4. Rollback

```bash
# backend
sudo ./scripts/linux/rollback.sh --app-root /opt/iot-team-center

# frontend
sudo ./scripts/linux/rollback.sh --app-root /opt/iot-team-center/frontend \
  --service iot-team-center-frontend --port 3000 --health-path /
```

Points `current` back at the previous release, restarts the matching service, and
re-checks its health endpoint. Pass `--release-id <id>` to roll back to a specific older
release instead of the immediately previous one.

## 5. Updating configuration only (no new code)

To rotate a value (e.g. real Entra IDs once registrations exist, or a new SQL password),
edit your secured copy of the relevant env file and re-run the matching deploy script --
it publishes a new release directory even when the code hasn't changed, which keeps every
deployed configuration attributable to an immutable release the same way the Windows path
does.

## 6. Go-live verification

Everything in `docs/PRODUCTION_DEPLOYMENT.md` section 8 ("Go-live verification") still
applies. Additionally on this path:

- `sudo systemctl status iot-team-center-api.service iot-team-center-frontend.service`
  both show `active (running)`.
- `mountpoint -q <NAS_MOUNT_PATH>` succeeds, and it still does after `sudo reboot` (the
  `_netdev,nofail` fstab options bring it up after networking is online; confirm this on a
  real reboot before go-live, not just after `mount -a`).
- `curl https://<API_HOST>/health/ready` returns `status = ready` once the real SQL
  connection string and NAS mount are both live.
- `curl -I https://<FRONTEND_HOST>/` returns HTTP 200 and the page's compiled bundle
  points at `https://<API_HOST>` (confirm in the browser devtools network tab, not just
  the HTML).
- `journalctl -u iot-team-center-api -e` and `journalctl -u iot-team-center-frontend -e`
  show no repeated restarts.
