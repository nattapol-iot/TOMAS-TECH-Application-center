# Production deployment on Ubuntu (self-hosted API + frontend, via Docker)

This is an alternative to [`docs/PRODUCTION_DEPLOYMENT.md`](PRODUCTION_DEPLOYMENT.md) for
teams running both the ASP.NET Core API **and** the frontend as Docker containers on one
bare **Ubuntu** server behind nginx, instead of Windows Server/IIS + Vercel. Read the
Windows doc first for the parts that do not change: Entra app registration, SQL Server
hardening, backups/rollback objectives, and the go-live checklist. This document only
covers what is different on Linux: the host bootstrap, the container build/deploy
mechanism for both services, and document storage.

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
    - <FRONTEND_HOST>  -> 127.0.0.1:3000  (frontend container, vinext "start")
    - <API_HOST>       -> 127.0.0.1:5105  (api container, Kestrel)
                              |\
                              | \ bind-mounted CIFS mount of the company NAS share (see below)
                              |  v
                              |  Company NAS / \\100.98.152.4\<SHARE_NAME>, mounted on the HOST
                              |
                              | encrypted Microsoft.Data.SqlClient connection
                              v
                    Microsoft SQL Server / IoTTeamCenter (separate host; not managed by these scripts)
```

Both containers are built and run by Docker Compose (`docker-compose.prod.yml`) directly
on the host -- there is no image registry involved; `deploy.sh` builds each image where
it's going to run. The frontend never talks to SQL Server directly; it only calls the API
over HTTPS with a bearer token, same as the Vercel-hosted path in
`docs/PRODUCTION_DEPLOYMENT.md`.

## How `DocumentStorage:Mode=Nas` works on a non-Windows host

Production still requires `DocumentStorage:Mode=Nas` -- that has not changed. What
changed is how `Nas` mode is validated: on Windows it still requires the classic
`\\server\share` UNC format (unchanged); on a non-Windows host it instead requires
`RootPath` to be an absolute path that is **currently a mounted filesystem**, checked at
startup against the running host's actual mount table
(`backend/IoTTeamCenter.Api/Infrastructure/DocumentStorageOptions.cs`,
`ValidateAndNormalizeUncRoot`). `ProjectDocumentStorage` itself is plain, OS-agnostic file
I/O -- only this one validation function is OS-aware. This check runs **inside the
container**, against the container's own mount table -- `install-production-host.sh`
mounts the NAS share with `cifs-utils` on the **host**, and `docker-compose.prod.yml`
bind-mounts that same host path into the API container at the identical path, which Linux
bind mounts surface as their own distinct mount point inside the container too.

The API container runs as the UID/GID of a dedicated host account
(`install-production-host.sh --service-user`, `iotapi` by default) rather than root, so it
can read/write the bind-mounted share without loosening its permissions -- see
`docker-compose.prod.yml`'s `user:` field and `/etc/iot-team-center/docker.env`.

The API refuses to start if the configured path is not, at that moment, an actual mount
point -- an ordinary local folder at the same path is deliberately rejected, so Production
cannot silently fall back to plain, ephemeral local disk the way it could if this were left
as an unchecked `Local` path. Two things are still **not** checked by the application the
way they might be assumed:

- The mount being *present* doesn't prove it's the *correct* NAS share -- a typo'd
  `--nas-unc` at bootstrap could mount the wrong share and still pass this check.
- The mount's health, backup/retention, and restart-resilience are entirely the host
  operator's responsibility (via `/etc/fstab`'s `_netdev,nofail` options and your own
  monitoring), not something the API validates beyond the existing `/health/ready`
  availability probe.

Treat the same NAS prerequisites from `docs/PRODUCTION_DEPLOYMENT.md` ("Company NAS
document storage" section) as still required: an IT-approved share/service identity, ACLs
scoped to the application root, malware scanning, and a tested backup/restore process for
the share. `scripts/Test-NasStorage.ps1` (Windows/IIS-only) doesn't apply here; do the
equivalent disposable write/read/delete round trip manually against the mounted path
(`docker exec <api-container> sh -c 'echo test > /mnt/iot-team-center-documents/.probe &&
cat /mnt/iot-team-center-documents/.probe && rm /mnt/iot-team-center-documents/.probe'`)
before go-live.

## 1. Prerequisites

- A bare Ubuntu server (22.04 LTS or newer) with a static/DHCP-reserved address and root
  (sudo) access. No .NET/Node.js install needed -- Docker builds both inside containers.
- DNS for **both** `<API_HOST>` and `<FRONTEND_HOST>` pointing at this server, and a plan
  for certificates (the install script can obtain both via Let's Encrypt/certbot once DNS
  resolves, or generate a self-signed cert bound to a bare IP if there's no domain yet --
  see `--self-signed-tls`).
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
  app registrations exist (`docs/PRODUCTION_DEPLOYMENT.md` section 2, or run
  `scripts/New-EntraAppRegistrations.ps1`). Until then, a syntactically valid but non-real
  GUID (`uuidgen`) lets the API start for infrastructure testing; real sign-in will not
  work until the real values are deployed.
- If deploying via CI instead of by hand, a self-hosted GitHub Actions runner -- see
  `docs/CI_CD_SETUP.md` (needed because this host typically has no public IP for a
  GitHub-hosted runner to reach).

## 2. Bootstrap the host (once per server)

```bash
sudo ./scripts/linux/install-production-host.sh \
  --api-host iot-api.example.tomastc.com \
  --frontend-host iot-team-center.example.tomastc.com \
  --nas-unc "//100.98.152.4/<SHARE_NAME>/<APP_ROOT>" \
  --nas-credentials-file /root/secure/iot-team-center-nas.cifs-credentials \
  --deploy-user iot-deploy
```

This installs Docker Engine + the Compose plugin (official Docker apt repository), nginx,
and `cifs-utils`; creates a dedicated `iotapi` system account that owns the NAS mount
point (its UID/GID are written to `/etc/iot-team-center/docker.env` for
`docker-compose.prod.yml` to pick up); mounts the NAS share; and writes HTTP-only nginx
sites for both hostnames. Add `--deploy-ssh-public-key-file` only if you also want to SSH
in by hand as `--deploy-user` -- CI never needs it (see `docs/CI_CD_SETUP.md`). It
configures `ufw` rules for 80/443 but deliberately does **not** run `ufw enable` itself, to
avoid locking you out over SSH if the ruleset is wrong -- review `ufw status verbose` and
enable it yourself.

Once DNS for both hostnames resolves to this server, re-run with TLS:

```bash
sudo ./scripts/linux/install-production-host.sh \
  --api-host iot-api.example.tomastc.com \
  --frontend-host iot-team-center.example.tomastc.com \
  --nas-unc "//100.98.152.4/<SHARE_NAME>/<APP_ROOT>" \
  --nas-credentials-file /root/secure/iot-team-center-nas.cifs-credentials \
  --enable-tls --cert-email <owner@company>
```

All steps are idempotent; re-running does not restart running containers (`deploy.sh`
does that).

## 3. Prepare the environment files and deploy a release

`deploy.sh` builds from the repository checkout at `--repo`, so a checkout must exist at
that path **on the server** first. Once CI/CD is wired up (`docs/CI_CD_SETUP.md`), the
self-hosted runner does this itself (a local copy, since it runs on this same host).
Before that's configured, or for a manual one-off deploy, copy a checkout to the server
yourself:

```bash
# from Linux/macOS
rsync -az --delete ./ user@<server>:/opt/iot-team-center/src/
```

```powershell
# from Windows -- scp ships with the built-in OpenSSH client (PowerShell/cmd), no
# rsync/WSL/cygwin install needed
scp -r .\* user@<server>:/opt/iot-team-center/src/
```

Copy `scripts/linux/api.env.template` and `scripts/linux/frontend.env.template` to
`/etc/iot-team-center/api.env.input` and `frontend.env.input` on the server, fill in every
`<PLACEHOLDER>`, then deploy:

```bash
sudo /opt/iot-team-center/src/scripts/linux/deploy.sh \
  --repo /opt/iot-team-center/src \
  --api-env-file /etc/iot-team-center/api.env.input \
  --frontend-env-file /etc/iot-team-center/frontend.env.input
```

`deploy.sh` tags the currently-running images as `:previous` (for instant rollback),
`docker compose build`s fresh `api`/`frontend` images (the frontend build also runs the
existing `scripts/validate-production-env.mjs` gate), `docker compose up -d`s both, and
polls each one's health endpoint before declaring success. Both env files must pass the
same `<PLACEHOLDER>`/required-key checks the old scripts had. The API's poll also prints
the `/health/ready` body (informational -- expected to report `migrations_required` or a
connection failure until the separate SQL Server is reachable and at schema version 9,
and `document_storage_unavailable` until the NAS mount is healthy).

Re-run `deploy.sh` for every subsequent release; only the `:current`/`:previous` image
tags are kept locally (not a longer release history), and dangling image layers are
pruned automatically.

To automate this from a dev's `git push` through a manual production approval, see
[`docs/CI_CD_SETUP.md`](CI_CD_SETUP.md) -- `.github/workflows/ci-cd.yml` runs this exact
script on a self-hosted runner after tests pass and a reviewer approves.

## 4. Rollback

```bash
# both services
sudo ./scripts/linux/rollback.sh --repo /opt/iot-team-center/src

# one service only
sudo ./scripts/linux/rollback.sh --repo /opt/iot-team-center/src --service api
sudo ./scripts/linux/rollback.sh --repo /opt/iot-team-center/src --service frontend
```

Re-points Docker Compose at the `:previous`-tagged image(s) (no rebuild) and re-checks the
health endpoint. This only goes back **one** deploy -- `deploy.sh` keeps a
`:current`/`:previous` pair, not a longer history, so a second consecutive rollback has
nothing further to fall back to.

## 5. Updating configuration only (no new code)

To rotate a value (e.g. real Entra IDs once registrations exist, or a new SQL password),
edit your secured copy of the relevant env file and re-run `deploy.sh` -- it rebuilds and
retags the image even when the code hasn't changed, which keeps every deployed
configuration attributable to an image build the same way the Windows path's immutable
releases do.

## 6. Go-live verification

Everything in `docs/PRODUCTION_DEPLOYMENT.md` section 8 ("Go-live verification") still
applies. Additionally on this path:

- `docker compose -f docker-compose.prod.yml ps` shows both containers `running`
  (`healthy` once a healthcheck is configured).
- `mountpoint -q <NAS_MOUNT_PATH>` succeeds **on the host**, and it still does after
  `sudo reboot` (the `_netdev,nofail` fstab options bring it up after networking is
  online; confirm this on a real reboot before go-live, not just after `mount -a`); then
  `docker exec <api-container> cat /proc/mounts | grep <NAS_MOUNT_PATH>` confirms the
  bind mount came through inside the container too.
- `curl https://<API_HOST>/health/ready` returns `status = ready` once the real SQL
  connection string and NAS mount are both live.
- `curl -I https://<FRONTEND_HOST>/` returns HTTP 200 and the page's compiled bundle
  points at `https://<API_HOST>` (confirm in the browser devtools network tab, not just
  the HTML).
- `docker compose -f docker-compose.prod.yml logs --tail=100 api` and `... frontend` show
  no repeated restarts.
