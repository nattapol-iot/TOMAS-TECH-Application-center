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

`--deploy-user` creates a dedicated account (`iot-deploy`) authorized only to run
`deploy.sh`/`rollback.sh` via a narrowly-scoped `sudoers.d` entry -- not blanket sudo
(running as root through that entry is also what gives these two scripts' `docker
compose`/`docker build` commands access to the Docker daemon, so `iot-deploy` never
needs `docker` group membership). This is the account the self-hosted CI runner
(step 2b below) runs as, and it's also useful for a human operator's own manual SSH
deploys, which is what `--deploy-ssh-public-key-file` is for
(`ssh-keygen -t ed25519 -f iot-deploy -C you@yourmachine` to generate a keypair for
yourself first) -- optional if you'll never SSH in by hand.

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
They never touch GitHub, git history, or CI logs -- `deploy.sh` reads them directly on
the server (the frontend one also supplies the Docker build ARGs baked into the client
bundle) and refuses to run while any `<PLACEHOLDER>` remains.

## 2b. Register a self-hosted runner on the production server

The production host has no public IP (it's a VM with no route in from the internet), so
a GitHub-hosted cloud runner can never reach it directly -- there is nothing to `ssh` or
`rsync` into from outside. The fix is to flip the connection direction: install GitHub's
runner agent **on the production host itself**, running as the `iot-deploy` account from
step 2. The agent makes an outbound-only HTTPS connection to GitHub to pick up jobs, so
no inbound port, port-forward, or VPN is needed on the router at all.

Register it **at the repository level** (not organization-level), so only this repo's
workflows can ever dispatch jobs to it:

1. In the repo: **Settings -> Actions -> Runners -> New self-hosted runner**, choose
   Linux/x64. GitHub shows a `./config.sh --url ... --token ...` command with a
   short-lived registration token -- copy it.
2. On the production server, as the `iot-deploy` user:

   ```bash
   sudo -u iot-deploy -i
   mkdir ~/actions-runner && cd ~/actions-runner
   # paste the download + ./config.sh command GitHub showed you
   ./config.sh --url https://github.com/<org>/<repo> --token <TOKEN> \
     --name iot-team-center-production --labels iot-team-center-production \
     --unattended
   exit
   ```

   The `--labels iot-team-center-production` value must match `runs-on:` in
   `.github/workflows/ci-cd.yml`'s `deploy` job exactly -- that label is what scopes
   deploys to this specific runner instead of any other self-hosted runner you might add
   later for something else.
3. Install it as a systemd service so it survives reboots and doesn't depend on a login
   session:

   ```bash
   cd /home/iot-deploy/actions-runner
   sudo ./svc.sh install iot-deploy
   sudo ./svc.sh start
   sudo ./svc.sh status   # confirm it's running
   ```

4. Back in **Settings -> Actions -> Runners**, confirm it shows as **Idle** (green).

A self-hosted runner executes whatever a workflow run tells it to, using the `iot-deploy`
account's own permissions -- which is deliberately capped by the sudoers entry from step
2 to exactly those two deploy scripts, so even a compromised workflow run can't do
arbitrary root actions on the box. `checks` and `sql-integration` keep running on GitHub's
own shared cloud runners as before (`runs-on: ubuntu-24.04`); only `deploy` targets this
runner, and only after the `production` Environment approval from step 1.

## 3. No SSH secrets needed

Because `deploy` now runs directly on the production host instead of connecting to it
over the network, there is nothing to add under **Settings -> Secrets and variables ->
Actions** for this job -- no host, user, private key, or known_hosts. No SQL password,
Entra secret, or NAS credential is ever stored in GitHub either; those live only in the
two `*.env.input` files from step 2, read directly off local disk by the deploy scripts.

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
`deploy.sh` is idempotent) once each prerequisite is in place.

If the self-hosted runner from step 2b isn't registered yet (or its service isn't
running), an approved `deploy` run won't fail -- it will sit **queued** indefinitely in
the Actions tab, since there's no matching `iot-team-center-production` runner to pick it
up. Check `sudo ./svc.sh status` on the server and the Runners page in Settings if a run
seems stuck rather than failed.
