# Local-only application development

Status: Active local plan, 2026-09-10.
Branch: `local/app-development-20260910`, based on candidate `3d18808befe1adfd8d7c7ec02f50a72a6bf8045a`.

## Scope

Continue updating the application only in `C:/Work/IoT-release-candidate-20260910`. Do not push, open a PR, deploy, restart the shared Team Test service or modify Production. Local commits remain allowed as recovery checkpoints.

The user selected SQL endpoint `202.151.188.68`. A read-only identity check using the installed DPAPI-protected Team Test credential confirmed:

| Setting | Verified value |
| --- | --- |
| SQL endpoint | `202.151.188.68:1433`, reachable |
| Server identity | `node24605-tom-ani-01` |
| Database | `IoTTeamCenterTeamTest` |
| Current schema | 39, `NAS storage connection draft settings` |
| Candidate schema | 42 |

Windows integrated authentication failed across the untrusted domain as expected. The launcher reuses the installed SQL login and, when installed, its application-role secret through Windows DPAPI. It never prints or stores plaintext credentials in the repository. The current SQL certificate chain is not trusted by this workstation, so the launcher fails closed unless the existing Team Test certificate exception is explicitly selected. A trusted DNS name and certificate chain remain the required permanent fix.

## Safety boundary

The remote database is three migrations behind the candidate. Local startup therefore sets `Database__RunMigrations=false` and `Database__ReadOnly=true`. The API skips migration; blocks POST, PUT, PATCH and DELETE before route work; rejects database transactions; and rejects DML, DDL, procedure execution, `SELECT INTO` and sequence allocation at the shared database boundary. The knowledge-article GET path suppresses its normal view-counter update. These overrides fail configuration in Production, and read-only mode cannot be enabled while migrations remain enabled.

The API readiness endpoint will remain unavailable while schema39 is connected because readiness requires schema42. Reads backed only by schema39 may be used for UI development. Features that require overhead policies, role management or the aggregate guard cannot be exercised against this database until its owner separately approves migrations040–042. A local code change must not weaken readiness to hide this mismatch.

## Run locally

Open two PowerShell terminals from the repository root.

Terminal1:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Start-LocalReadOnlyApi.ps1 -AllowUntrustedTeamTestCertificate
```

Terminal2:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Start-LocalReadOnlyFrontend.ps1
```

Open `http://127.0.0.1:3010`. The API listens only on `127.0.0.1:5116`; both processes stay attached to their terminals and stop with Ctrl+C. The API launcher is pinned to the verified IP/database/schema and refuses a mismatch. Frontend/API ports are separate from the installed Team Test runtime.

Use the existing Team Test access identity. The UI shows a persistent `Local read-only · schema 39` banner. Mutation controls can still appear while the app is being adapted, but the API rejects their requests with HTTP403 `local_read_only`. Uploaded files and email delivery are disabled from remote effects: document storage uses a workstation-local directory and email mode is Disabled.

## Work sequence

1. Establish the read-only local runtime and record which schema39 screens load or fail.
2. Update UI and client behavior on this local branch in small, reviewed commits.
3. Run root lint/type/tests and backend type/tests/build after each coherent feature change.
4. Keep schema40–42 features behind explicit unavailable/error states while using the schema39 database.
5. Revisit database migration, remote branch and release planning only after the application changes stabilize and the user explicitly changes this local-only scope.
