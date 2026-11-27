# CI runner

`ci.yml` runs on the self-hosted runner `macmini-1-iot` (label `iot-ci`) when it is online, else on
`ubuntu-24.04`. Its hook is `/usr/local/bin/ci-queue-wait.sh` (the shared queue below). Until 2026-11-27 it used
`/home/iotci/actions-runner/wait-for-erp.sh`, which waited only for ERP builds; the file is still there but unused.

`deploy.yml` and `tmthub-mirror.yml` use a different runner: label `iot-team-center-macmini` on the macOS host
itself (user `iotdeploy`, `/Users/iotdeploy/actions-runner`), outside the VM and outside the queue.

## The shared VM

The runner lives in the colima VM `cibench` on macmini-1 (`colima ssh -p cibench`), next to two other runners. Each
runs as its own Linux user with rootless docker, so build caches and registry logins are not shared:

| User | Runner | Repo | Labels |
|---|---|---|---|
| erpci | macmini-1-pegasus | Tomas-TC/pegasus-erp | pegasus-build |
| iotci | macmini-1-iot | pattana1902/IoT-Team-Center | iot-ci |
| uibci | macmini-1-ui-builder | Tomas-TC/pegasus_ui_builder | tailnet, ui-builder |

- Runner dir `/home/<user>/actions-runner`, systemd unit `actions.runner.<owner>-<repo>.<runner>.service`.
- The VM mounts only a read-only `~/cibench-share` from the Mac, never the whole home.
- `ci-runner-watchdog.timer` (every 2 min) prunes docker caches above 75% disk and restarts failed runners.

## One start queue

Jobs from the three runners start one at a time so two image builds do not fight over CPU and disk.

- `/usr/local/bin/ci-queue-wait` holds a job while an older job from another runner user is running (10 s steps,
  at most 3600 s, then it starts anyway). `CI_QUEUE_USERS` (default `erpci uibci iotci`) lists the users that take
  part; a runner left out neither waits nor is waited for.
- Each runner calls it from its job-started hook, `ACTIONS_RUNNER_HOOK_JOB_STARTED` in `/home/<user>/actions-runner/.env`.

## Rules when changing a runner

- **The hook path must end in `.sh`, `.ps1` or `.js`.** Otherwise the runner fails every job in 0 s with
  "is not a valid path to a script" before the first step. Point at `/usr/local/bin/ci-queue-wait.sh` (a symlink
  to the script), not at `ci-queue-wait`. This broke every pegasus-erp image build on 2026-11-26.
- A runner that must wait for the others has to join the same queue. A one-sided wait (A waits for B while B waits
  for A) deadlocks when both jobs start together.
- `.env` is read at start: `sudo systemctl restart <unit>` after a change, and only while the runner is idle
  (`pgrep -u <user> -f Runner.Worker` prints nothing).
- None of this is in any repo's deploy scripts. Rebuilding the VM or re-registering a runner means setting the
  hook and the queue again by hand.

## Check

```bash
ssh macmini-1 'export PATH=/opt/homebrew/bin:$PATH; colima ssh -p cibench -- bash -lc "
  systemctl list-units --type=service | grep actions.runner
  sudo grep -H HOOK /home/*/actions-runner/.env
  grep QUEUE_USERS= /usr/local/bin/ci-queue-wait" </dev/null'
```

A job log that ends at "A job started hook has been configured by the self-hosted runner administrator" followed
by an error is this hook, not the workflow.
