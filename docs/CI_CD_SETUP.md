# CI/CD setup

`.github/workflows/ci-cd.yml` automates testing on every push/PR and gates the actual
production deploy behind a manual approval. Everything in that file is checked into the
repo; the pieces below are **one-time steps a repo admin does in GitHub's UI and on the
production server** -- they can't live in a workflow file.

## What runs automatically vs. what needs approval

| Trigger | Jobs that run |
| --- | --- |
| Any pull request | `checks` (lint, typecheck, unit tests, `dotnet build`), `sql-integration` |
| Push to `main` | same two jobs, **then** `deploy` waits for approval |

`deploy` only exists on pushes to `main`, and even then it will not run a single command
against the server until someone with access approves the run — that approval is the
"deploy to production or not" decision.

## 1. Create the `production` Environment (manual approval gate)

In the repo: **Settings -> Environments -> New environment**, name it exactly
`production`. Under **Deployment protection rules**, add **Required reviewers** and pick
at least one person (not necessarily the person who pushed the commit). Save.

From now on, every run of the `deploy` job pauses with a "Review deployments" prompt in
the Actions tab until a required reviewer clicks **Approve and deploy** (or rejects it).
No code change is needed to adjust who can approve -- manage reviewers on this Environment
page.

Optional but recommended: also set **Deployment branches** on this Environment to
`main` only, so `deploy` can never target production from any other branch even if the
workflow file is edited on a feature branch.

## 2. Provision the production server once

Before the first CI-triggered deploy can succeed, run once on the (now-provisioned)
Ubuntu server, per `docs/PRODUCTION_DEPLOYMENT_LINUX.md`:

```bash
sudo ./scripts/linux/install-production-host.sh \
  --api-host <API_HOST> --frontend-host <FRONTEND_HOST> \
  --nas-unc "//100.98.152.4/<SHARE_NAME>/<APP_ROOT>" \
  --nas-credentials-file /root/secure/iot-team-center-nas.cifs-credentials \
  --deploy-user iot-deploy --deploy-ssh-public-key-file /root/secure/iot-deploy.pub
```

`--deploy-user`/`--deploy-ssh-public-key-file` create the restricted account CI connects
as (authorized only to run `deploy-release.sh`/`deploy-frontend-release.sh`/`rollback.sh`
via a narrowly-scoped `sudoers.d` entry -- not blanket sudo). Generate that keypair
yourself first (`ssh-keygen -t ed25519 -f iot-deploy -C iot-team-center-ci`); the private
half becomes the `PRODUCTION_SSH_KEY` secret below, the public half is what
`--deploy-ssh-public-key-file` authorizes on the server.

Then fill in the two env-file templates with real values and save them **on the server
only**, at the exact paths the workflow references:

```bash
# as root on the server, from a copy of this repo or the templates alone
cp scripts/linux/api.env.template /etc/iot-team-center/api.env.input
cp scripts/linux/frontend.env.template /etc/iot-team-center/frontend.env.input
# edit both, replacing every <PLACEHOLDER>
chmod 600 /etc/iot-team-center/api.env.input /etc/iot-team-center/frontend.env.input
```

These two files hold the real SQL connection string and (once registered) Entra values.
They never touch GitHub, git history, or CI logs -- `deploy-release.sh` /
`deploy-frontend-release.sh` read them directly on the server and refuse to run while any
`<PLACEHOLDER>` remains.

## 3. Add repo secrets for SSH access

**Settings -> Secrets and variables -> Actions -> New repository secret**:

| Secret | Value |
| --- | --- |
| `PRODUCTION_SSH_HOST` | The server's hostname or IP |
| `PRODUCTION_SSH_USER` | The `--deploy-user` name from step 2 (e.g. `iot-deploy`) |
| `PRODUCTION_SSH_KEY` | The private half of the keypair generated in step 2 |
| `PRODUCTION_SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -t ed25519 <PRODUCTION_SSH_HOST>`, run **once from a trusted machine** after the server exists |

Pin `PRODUCTION_SSH_KNOWN_HOSTS` to the real host key rather than disabling host-key
checking -- the workflow will fail closed (refuse to connect) if the server's key ever
changes unexpectedly, which is the point.

No SQL password, Entra secret, or NAS credential is ever stored in GitHub -- only SSH
access. That matches the security posture already established for the manual deployment
path in `docs/PRODUCTION_DEPLOYMENT_LINUX.md`.

## 4. (Optional) Require `checks` to pass before merging

**Settings -> Branches -> Add branch protection rule** for `main`, enable **Require status
checks to pass before merging**, and select the `checks` (and optionally
`sql-integration`) job. This stops a broken build from being merged at all, rather than
only catching it after the fact.

## What to expect on the first real run

Until the server, DNS/certs, real Entra registrations, and the two `*.env.input` files
all exist, `checks` and `sql-integration` will still pass on every push (they don't touch
production), but `deploy` will fail at whichever step depends on the missing piece --
that's expected, not a bug in the pipeline. Re-run the `deploy` job (it's re-runnable;
`deploy-release.sh`/`deploy-frontend-release.sh` are idempotent) once each prerequisite is
in place.
