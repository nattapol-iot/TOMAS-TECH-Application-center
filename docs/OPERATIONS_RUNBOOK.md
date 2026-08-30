# IoT Team Center Operations Runbook

This runbook covers the production operation of the Sites frontend, the ASP.NET Core API hosted on Windows/IIS, the `IoTTeamCenter` Microsoft SQL Server database, and the company-NAS document store reached by the API through Tailscale/SMB. Replace every value in angle brackets before use and record all production changes in the team's change or incident system.

## Supported production scope

The production API currently exposes:

- Microsoft Entra authentication, database-backed user activation, and role permissions
- bootstrap/master data and team information
- inquiry list and creation
- estimate list, creation, validation, submission, approval/revision workflow, and cost-item maintenance
- project list and creation from an approved estimate
- record-scoped project document list, upload, and download with SQL metadata/SHA-256 and NAS file bytes
- inventory item balances and stock-ledger read access
- liveness and database/schema readiness checks

The database also contains hardened schemas for material procurement, goods receipt and issue, scheduling, documents, notifications, and their immutable ledgers/audits. Those workflows are **not yet fully exposed through production API and UI endpoints**. Do not treat direct database access to those tables as a supported substitute for the missing application workflows. Complete API/UI implementation, authorization tests, and UAT before enabling them for the team.

SQL Server is the structured system of record, including document metadata. File
contents reside under an IT-approved NAS share below `\\100.98.152.4` when
`DocumentStorage__RootPath` is configured. The company manual does not provide the
share name, so operations must supply and test the exact root. Never place live SQL Server `MDF` or `LDF`
files on the NAS and never configure IIS to depend on an interactive mapped drive.

## Ownership and production record

Complete this table before go-live and keep it with the deployed release record.

| Item | Production value |
| --- | --- |
| Frontend URL | `<https://team.example.com>` |
| API URL | `<https://api.team.example.com>` |
| IIS server / app pool | `<server>` / `<app-pool>` |
| Restricted upload temp path / volume owner | `<ASPNETCORE_TEMP>` / `<owner>` |
| SQL Server DNS name | `<sql.example.internal>` |
| Database | `IoTTeamCenter` |
| NAS UNC root | `\\100.98.152.4\<share>\<application-root>` |
| NAS/Tailscale device owner | `<IT owner / asset record>` |
| NAS service identity / secret reference | `<identity name>` / `<vault reference; never password>` |
| NAS ACL and malware-scanning owner | `<name / controlled contact>` |
| Entra tenant / API application | `<tenant-id>` / `<client-id>` |
| Primary application owner | `<name / contact>` |
| Database owner | `<name / contact>` |
| Security incident contact | `<name / contact>` |
| Backup location and retention policy | `<protected location / policy>` |
| Last tested restore | `<UTC timestamp / evidence link>` |
| Last coordinated SQL + NAS restore | `<UTC timestamp / reconciliation evidence>` |
| Deployed application version | `<release or commit>` |
| Deployed schema version | `5` |

Use UTC for server, database, log, backup, and incident timestamps. Display conversion to local time only at the user interface or reporting edge.

## Health and smoke checks

### Liveness

`GET /health/live` confirms only that the API process can answer HTTP requests. It does not query SQL Server.

```powershell
$apiBase = "https://<api-host>"
Invoke-RestMethod -Method Get -Uri "$apiBase/health/live"
```

Expected result: HTTP `200` with `status: "ok"` and `service: "IoTTeamCenter.Api"`.

### Readiness

`GET /health/ready` opens a SQL connection, verifies that `dbo.schema_versions` has
reached version 5, and uses a bounded, single-flight, briefly cached probe to verify
that the configured document-storage root exists and can be enumerated under the API identity.

```powershell
$apiBase = "https://<api-host>"
Invoke-RestMethod -Method Get -Uri "$apiBase/health/ready"
```

Expected result: HTTP `200`, `status: "ready"`, `schemaVersion: 5` or greater, and
`documentStorage: "available"`. HTTP `503` means SQL is unreachable, a database
operation failed, required migrations are absent, or the document root is unavailable.
Do not route user traffic to an instance that is not ready.

### Authenticated smoke check

After liveness and readiness pass, sign in through the deployed frontend with a dedicated, least-privileged smoke-test user and verify:

1. `/api/v1/me` displays the expected identity and role.
2. Dashboard/bootstrap data loads.
3. A Viewer can read permitted lists but receives HTTP `403` for write operations.
4. A role intended to write can perform only its documented workflow in a controlled UAT record.

Do not paste bearer tokens into tickets, chat, screenshots, or shared command histories. Use the normal browser sign-in or an approved secret-aware test runner.

### NAS/Tailscale check

The company manual's staff procedure is to install Tailscale on Windows, sign in
with the company Microsoft account, accept the IT device invitation, and connect to
the SMB host `\\100.98.152.4` with a NAS username/password issued by an administrator.
It does not specify a share name. Operations must use the approved exact
`\\100.98.152.4\<share>\<application-root>` value and must not guess one.

On the API host, first confirm the Tailscale client is connected. Then, using the
approved method to run under the actual IIS application-pool/service Windows identity
(or an approved equivalent using the same identity), run the repository probe against
a dedicated, pre-created UAT folder:

```powershell
& ".\scripts\Test-NasStorage.ps1" `
  -NasRoot "\\100.98.152.4\<share>\<application-root>\<uat-probe-folder>"
```

`scripts/Test-NasStorage.ps1` accepts no password. It rejects paths without both a
UNC server and share, tests TCP 445, reports the current Windows identity, and performs
a disposable write/read/delete round trip. Require `Status = PASS`, record the
non-secret output, and separately confirm by ACL review/denial test that the identity
cannot access an unrelated NAS path. Do not map a drive, type a credential into
command history, run against a live business folder, or treat a PASS under an
administrator/operator identity as evidence for IIS. Repeat after a controlled
Windows/Tailscale/IIS restart.

The current `/health/ready` endpoint checks NAS-root existence and directory
enumeration, but it does not create/delete a disposable file, prove denial outside the
application root, or prove malware scanning. Keep the service-context probe, ACL denial
test, restart test, and scanning evidence as separate release gates.

### Status interpretation

| Status | Meaning | First action |
| --- | --- | --- |
| `200` live and ready | Process, required database schema, and document root enumeration are available | Continue normal monitoring |
| `401` | Missing, expired, wrong-issuer, or wrong-audience Entra token | Check tenant, client/audience, clock, and sign-in configuration |
| `403 user_not_registered` | Token `oid` has no exact `dbo.users.entra_object_id` match | Verify/provision the Entra object ID |
| `403 user_disabled` | The mapped database user is inactive | Confirm whether deprovisioning was intentional |
| `403 permission_denied` | Role lacks the required database permission | Verify role assignment; do not bypass authorization |
| `409` | Duplicate record, stale row version, or invalid workflow transition | Refresh the record and inspect the business conflict |
| `429` | Global limit exceeded (300 requests/minute), or document upload exceeded 6/minute, per Entra `oid` or source IP | Identify loops, oversized batches, or abusive clients before raising a limit |
| `503` ready | SQL/schema or document-storage dependency problem | Check response status, SQL/TLS/network/schema, Tailscale, UNC root, service identity, and NAS ACL |

## Logs and correlation IDs

Every API response includes `X-Correlation-Id`, populated from the ASP.NET request trace identifier. Record this header, the UTC timestamp, user, URL, HTTP method, and response status in support tickets. Never record authorization headers or request bodies containing confidential data.

The API currently writes failures through `ILogger`:

- malformed HTTP requests at Information
- SQL failures at Error with the SQL error number
- unhandled failures at Error

Production `web.config` intentionally has `stdoutLogEnabled="false"`; no durable centralized logging sink is configured in this repository. Before go-live, configure IIS/ASP.NET logs to an approved central destination that preserves request scopes/trace identifiers, applies access controls and retention, and alerts on errors. Use Windows Event Viewer and IIS access logs only as local diagnostic fallbacks. Do not enable persistent ANCM stdout logs except for a short, approved diagnostic window; they can grow without rotation and may contain sensitive context.

The `dbo.audit_log.correlation_id` column currently defaults to its own generated GUID. It is **not guaranteed to equal** the HTTP `X-Correlation-Id`. Correlate audit records using entity, actor, action, and UTC time until explicit propagation is implemented.

Useful audit review queries, run read-only with an authorized support/DBA identity:

```sql
USE [IoTTeamCenter];

SELECT TOP (100)
       a.occurred_at, a.correlation_id, u.email AS actor,
       a.entity_type, a.entity_no, a.action, a.reason
FROM dbo.audit_log AS a
INNER JOIN dbo.users AS u ON u.id = a.actor_id
ORDER BY a.occurred_at DESC;

SELECT TOP (100)
       occurred_at, actor_role, action, entity_type, entity_no,
       qty, project_id, reason
FROM dbo.mat_audit
ORDER BY occurred_at DESC;
```

`audit_log`, `mat_audit`, `stock_txns`, and estimate revision snapshots are protected as append-only data. Historical estimate cost lines cannot be updated or deleted, and schedule update requests have restricted one-time answering semantics. Never disable these triggers to repair an incident. Preserve evidence and use a reviewed compensating transaction or forward fix.

## Monitoring and alerting

The following are initial thresholds, not an agreed service-level objective. Review them with the business owner after collecting normal traffic for two weeks.

| Signal | Initial alert |
| --- | --- |
| `/health/live` | Two consecutive failures over 2 minutes |
| `/health/ready` | Any sustained failure over 2 minutes |
| HTTP 5xx | More than 2% of requests over 5 minutes |
| API latency | p95 above 2 seconds for 10 minutes |
| HTTP 401/403 | Sudden increase above the established baseline |
| HTTP 429 | More than 10 responses in 5 minutes for one identity/IP |
| SQL connectivity/deadlocks | Any repeated error or deadlock burst |
| SQL data/log disk | Less than 20% free or forecast exhaustion within 14 days |
| Transaction-log backup age | More than 30 minutes when using the proposed 15-minute schedule |
| Full backup age | More than 26 hours |
| IIS app-pool recycle/crash | Unexpected recycle or repeated rapid-fail protection event |
| TLS certificate | Less than 30 days until expiry |
| Tailscale / NAS SMB availability | Two consecutive failures over 2 minutes from the API host |
| NAS capacity | Less than 20% free or forecast exhaustion within 30 days |
| NAS authentication/ACL failures | Any repeated burst for the service identity |
| Malware scan failure/backlog | Any failed scan or queue older than the approved threshold |
| NAS document-backup age | Older than the approved document RPO |

Also monitor SQL CPU, memory pressure, blocking, long-running queries, connection count/pool exhaustion, database and log growth, failed SQL Agent/scheduler jobs, backup checksum failures, the off-site copy job, Tailscale device state, SMB latency, NAS capacity, document integrity/scan failures, and NAS backup jobs. Alert destinations must have at least two current owners.

## Backup policy

The following is a recommended starting point and requires business sign-off against the desired RPO/RTO:

- Recovery model: `FULL`.
- Full backup: daily, retained at least 35 days.
- Differential backup: every 6 hours, if useful for the database size and restore target.
- Transaction-log backup: every 15 minutes, targeting an RPO of 15 minutes.
- Long-term copy: monthly backup retained according to company/legal policy.
- Follow 3-2-1: three copies, two media/storage types, one off-site or isolated/immutable copy.
- Enable backup compression and checksums where supported.
- Encrypt backups. Store the backup encryption certificate/private key and recovery instructions separately from the backup files.
- Monitor job completion and backup age; a job marked successful is not proof that a backup is restorable.

NAS documents require a separate protected, versioned/snapshot backup with approved
retention, encryption, isolation/immutability, capacity alerts, and recovery ownership.
The NAS must not be the only copy of its own documents. SQL-native `.bak`/log backups
remain distinct from document backups; never back up SQL by copying live `MDF`/`LDF`
files to NAS. If the NAS is approved as one destination for a SQL backup copy, it is
still only one part of the 3-2-1 plan and must use a separate least-privileged backup
identity/path from application documents.

Use SQL Server Agent or an approved enterprise scheduler. Run backup jobs under a dedicated identity with access only to the required database and backup destination. Do not use the API login or `sa`.

Example checks:

```sql
SELECT recovery_model_desc
FROM sys.databases
WHERE name = N'IoTTeamCenter';

SELECT TOP (30)
       bs.type, bs.backup_start_date, bs.backup_finish_date,
       bs.is_copy_only, bs.has_backup_checksums,
       bmf.physical_device_name
FROM msdb.dbo.backupset AS bs
INNER JOIN msdb.dbo.backupmediafamily AS bmf
        ON bmf.media_set_id = bs.media_set_id
WHERE bs.database_name = N'IoTTeamCenter'
ORDER BY bs.backup_finish_date DESC;
```

`RESTORE VERIFYONLY` is a useful automated check, but it is not a substitute for a restore drill.

## Restore drill

Perform a restore drill monthly, and before high-risk schema changes, on an isolated non-production SQL instance. Never overwrite production as part of a drill.

1. Select a full backup, latest compatible differential, and a complete log chain.
2. Record the expected recovery point and backup checksums.
3. Restore under a unique non-production database name using `NORECOVERY`, apply differential/log backups in order, then use `RECOVERY`.
4. Run `DBCC CHECKDB (<restored-database>) WITH NO_INFOMSGS`.
5. Verify schema versions:

   ```sql
   SELECT version, name, applied_at
   FROM dbo.schema_versions
   ORDER BY version;
   ```

6. Verify representative counts and relationships for users, inquiries, estimates, projects, and stock transactions without exporting confidential row data.
7. Point an isolated API instance at the restored database and run liveness, readiness, sign-in, read, RBAC-denial, and a disposable workflow smoke test.
8. Record actual restore time, achieved recovery point, issues, reviewer, and evidence. Remove the isolated restored database only under the environment's approved cleanup procedure.

For releases that use NAS documents, extend the drill:

9. Restore the NAS application root to an isolated location from its protected backup; do not overwrite the live share.
10. Reconcile every restored SQL document reference against the restored relative path and integrity hash, and report missing, orphaned, mismatched, or unscanned files.
11. Through an isolated API instance and authorized test user, verify a clean document can be downloaded while an unapproved/quarantined file cannot.
12. Record the compatible SQL and NAS recovery points and achieved end-to-end RPO/RTO. A SQL-only or NAS-only restore is not a complete application recovery test.

## User provisioning and role changes

Application identity is the exact Microsoft Entra object ID (`oid`), not email. Obtain the object ID from an authoritative Entra administration source and independently verify it against the intended person. Email changes do not change identity.

Built-in role codes are:

- `Viewer`
- `Sales Engineer`
- `Engineer`
- `Project Manager`
- `Engineering Manager`
- `Purchasing`
- `Warehouse`
- `Inventory Controller`
- `Admin`

Choose the least-privileged role. `Admin` has every seeded business permission and must be rare, time-bound where possible, and reviewed.

Run the repository's idempotent provisioning script as an authorized DBA/deployment identity. Use a DNS SQL hostname whose TLS certificate is trusted; do not add certificate-trust bypass flags.

```powershell
sqlcmd `
  -S "<sql-dns-host>" `
  -E -N -b -r1 `
  -i "database/scripts/030_provision_user.sql" `
  -v "DatabaseName=IoTTeamCenter" `
     "EntraObjectId=<entra-object-id>" `
     "Email=name@company.com" `
     "DisplayName=Name Surname" `
     "Initials=NS" `
     "RoleCode=Viewer" `
     "Department=IoT" `
     "Level=Staff"
```

The script inserts a new user or updates the exact object-ID match, and sets `is_active = 1`. Therefore, rerunning it for a deliberately disabled account **reactivates that account**. Obtain explicit approval before using it for such a user.

After provisioning or changing a role:

1. Confirm the returned object ID, email, role, and active flag.
2. Have the user sign out and back in.
3. Verify `/api/v1/me` and bootstrap permissions.
4. Test one allowed operation and one denied operation appropriate to the role.
5. Record the request, approver, operator, result, and UTC time.

Do not edit `role_permissions` ad hoc in production. RBAC changes require a reviewed migration and regression tests for every affected role.

## User deprovisioning

Deprovision immediately when access is no longer required:

1. Remove/disable the Entra application assignment or account according to identity policy.
2. Disable the application database mapping using the exact Entra object ID. This database check blocks each new API request even if a previously issued Entra token has not yet expired.
3. Revoke active sessions where supported by the identity team.
4. Record and verify the result.

An authorized DBA should use the guarded repository script. It requires both the exact
Entra object ID and expected email, plus an explicit confirmation value. Review the
returned target before closing the access request.

```powershell
sqlcmd `
  -S "<sql-dns-host>" `
  -E -N -b -r1 `
  -i "database/scripts/040_deprovision_user.sql" `
  -v "DatabaseName=IoTTeamCenter" `
     "EntraObjectId=<exact-entra-object-id>" `
     "ExpectedEmail=name@company.com" `
     "ConfirmDisable=YES"
```

The API service account is intentionally unable to modify `dbo.users` or RBAC tables. Use a separate, audited operator identity. Because DBA provisioning/deprovisioning is not automatically written to the application audit table, the change record is mandatory.

## Application SQL login and credential rotation

The application uses a dedicated SQL login mapped into `iot_team_app_role`. That role receives object-level reads only for the mapped production API, execute access only to the document-number allocation procedure, the minimum explicit business writes, append-only audit/revision inserts, and `INSERT` only for project-document metadata. It is denied schema `DELETE`, `ALTER`, and `TAKE OWNERSHIP`, and receives no unsupported procurement, scheduling, notification, or stock-ledger writes. It cannot administer users or RBAC, directly update document sequences, alter schema-version records, or update/delete document metadata. Never run the API as `sa`, a database owner, or a deployment administrator.

Keep `ConnectionStrings__IoTTeamCenter` only in the approved server secret store or protected IIS configuration. The connection must use `Encrypt=True` and `TrustServerCertificate=False`; the API enforces mandatory encryption and permits certificate bypass only in Development. Do not put passwords in source control, command-line arguments, tickets, or this document.

Rotate without an avoidable outage by using two logins:

1. Generate a long random password directly in the approved secret manager.
2. As a SQL administrator, create a new versioned login from a reviewed copy of `database/scripts/005_create_server_login.template.sql`. Enter the password only through the approved secure workflow.
3. Map/grant it with `database/scripts/010_application_login.sql`, passing `DatabaseName=IoTTeamCenter` and the new `AppLogin`.
4. Store the new connection string in the server secret store and update the IIS application configuration.
5. Recycle one API instance at a time, then verify live, ready, authenticated read, authorized write, and expected denial.
6. Observe error and login-failure telemetry for an agreed period.
7. Disable the old login first. Drop it only after rollback is no longer needed and a second operator has verified the active login.
8. Record the rotation date, secret reference (not the value), operators, validation, and next due date.

If compromise is suspected, disable the affected login immediately, isolate the API if needed, preserve logs, rotate from a clean administrator workstation, and follow the security incident process.

## NAS/Tailscale service identity and credential rotation

Use a dedicated NAS service identity for the API. It must be different from staff
credentials issued under the company manual, different from a NAS administrator,
and restricted by ACL to the approved application root. Keep the password only in
the approved server secret store or protected service configuration. Never place it
in Git, SQL metadata, frontend variables, a mapped-drive command, logs, chat, or a
ticket; operational records contain only the identity name and secret reference.

Prefer a two-identity rotation when supported:

1. Create a new versioned service identity/credential and apply the same reviewed,
   least-privileged ACL to the exact UNC root.
2. From the real IIS service context, validate direct UNC create/read/rename/delete
   in a disposable UAT folder and prove denial outside the approved root.
3. Update the secret reference/configuration and recycle one API instance at a time.
4. Verify Tailscale state, SMB access, authorized document operations, denial tests,
   malware scanning, and error telemetry.
5. Disable the old identity, observe for the approved rollback window, then remove it
   and its ACL only after a second operator verifies the active identity.
6. Record UTC time, approver, operators, identity names, secret references, ACL
   evidence, validation, and next rotation date without recording either password.

If the NAS cannot support overlapping identities, use an approved maintenance window
and rollback plan. After any Tailscale device ownership or NAS credential change,
repeat the test after a controlled reboot; a successful interactive mapped drive is
not evidence that the IIS service can access the UNC path.

## Schema migration safety

The current `database/scripts/020_deploy_fresh_database.sql` runner is for a **fresh database only**. It creates the database and applies migrations 001 through 005. Those migrations deliberately fail when their schema version is already present. Do not rerun the fresh runner against an existing production database and do not delete or manually insert `schema_versions` rows to force execution.

For a fresh, approved deployment, run from the repository root with SQLCMD error-stop behavior and an explicit database name:

```powershell
sqlcmd `
  -S "<sql-dns-host>" `
  -E -N -b -r1 `
  -i "database/scripts/020_deploy_fresh_database.sql" `
  -v "DatabaseName=IoTTeamCenter"
```

Use a separate deployment identity; the application login intentionally lacks DDL rights. Never use `-C` or `TrustServerCertificate=True` in production.

Every future production change to an existing database requires a new, reviewed incremental migration that:

- has a unique next schema version and records it only after all required objects succeed
- is safe under `XACT_ABORT`, uses transactions where SQL Server permits, and is rerunnable only when explicitly designed as such
- is additive/backward compatible for rolling API deployment when practical
- has a data-volume and lock-duration assessment plus a tested forward-fix plan
- is tested on a recent masked/restored production-sized clone
- is preceded by a verified backup and followed by `DBCC CHECKDB`/targeted consistency checks as risk requires
- is executed with `sqlcmd -b -r1` during an approved change window

Before routing traffic after a migration, verify:

```sql
SELECT version, name, applied_at
FROM dbo.schema_versions
ORDER BY version;
```

The current API requires at least schema version 5. A schema-version marker alone is not proof of functional success; also run readiness, RBAC, and workflow smoke tests.
For the initial baseline and after SQL-login changes, also run the repository's read-only
`database/scripts/080_verify_production_baseline.sql` with explicit `DatabaseName` and
`AppLogin` SQLCMD variables; archive its PASS output with the release evidence.

## Incident response

Suggested severity:

- **P1:** security breach, data corruption/loss, all users unavailable, or incorrect inventory/financially material workflow data.
- **P2:** major module unavailable or severe performance degradation with no safe workaround.
- **P3:** isolated failure with a safe workaround and no integrity impact.

For P1/P2:

1. Assign an incident commander and record start time, impact, release version, schema version, and correlation IDs.
2. Preserve evidence. Do not delete audit/ledger records, recycle logs, or run speculative repair SQL.
3. Contain the issue: remove the affected instance from traffic, stop the IIS app pool, disable a user/login, or place the frontend in maintenance mode as appropriate.
4. Check live/ready, IIS and centralized logs, Windows events, SQL availability/blocking/disk, Tailscale state, NAS SMB reachability/capacity/authentication, malware-scan state, certificate validity, SQL/NAS backup freshness, and recent changes.
5. Decide between application rollback, configuration rollback, a forward database fix, or point-in-time restore. Require database-owner approval for data recovery actions.
6. Validate in isolation, then restore traffic gradually and monitor.
7. Notify stakeholders with impact and facts; never include credentials or sensitive row data.
8. Complete a post-incident review with root cause, recovery point/time, and prevention work.

For suspected malicious or compromised documents, stop new document writes/downloads
without disabling unrelated core workflows where safe, preserve SQL audit metadata and
NAS evidence, quarantine through the approved security process, and rotate the NAS
service credential if compromise is possible. Do not delete or overwrite a suspicious
file before security/incident owners approve evidence handling.

For missing or corrupt documents, make the affected document root read-only, record
the SQL metadata and expected hash/path, identify the last compatible SQL and NAS
recovery points, and restore to an isolated location first. Reconcile missing,
orphaned, mismatched, and unscanned files before an approved file or coordinated
SQL/NAS cutover.

## Rollback and recovery

### API/configuration rollback

1. Stop routing new traffic to the affected instance or stop its IIS app pool.
2. Preserve the current publish directory and configuration evidence.
3. Restore the previously signed/tested publish artifact and its compatible non-secret configuration.
4. Keep secrets in the server secret store; do not copy them into the artifact.
5. Start the app pool and run live, ready, authenticated, RBAC-denial, and workflow smoke tests.
6. Confirm that the previous API version is compatible with the current database schema before serving traffic.

### Frontend rollback

Restore the prior known-good Sites deployment and confirm its configured API URL, Entra tenant/client/scope, redirect URL, and allowed CORS origin. Then perform sign-in and read/write authorization smoke tests.

### Database rollback

There are no supported down migrations. Prefer a reviewed forward fix when integrity can be preserved. If a restore is required:

1. Stop application writes and record the exact cutoff time.
2. Take a tail-log backup when SQL state permits.
3. Restore full, differential, and log backups to an isolated name first; use `STOPAT` for the approved recovery point.
4. Validate `DBCC CHECKDB`, schema version, business counts/relationships, document sequences, and application smoke tests.
5. Obtain explicit data-owner approval for the accepted data-loss window before switching production.
6. Preserve the original database for forensic comparison; do not overwrite or drop it during the initial recovery.

Never restore only application tables or manually rewrite append-only ledgers without a reviewed reconciliation plan.

### NAS/document recovery

An application or database rollback does not roll back NAS files automatically. Do
not copy an older folder tree over the live share. Restore the required NAS version
to an isolated root, malware-scan it, verify integrity hashes and SQL ownership/path
metadata, and obtain the data owner's approval before a targeted file recovery or a
coordinated SQL/NAS cutover. Preserve the prior files and metadata for reconciliation.

## Routine checklist

### Daily

- Confirm live and ready checks are green from outside the server network path.
- Review 5xx, authentication spikes, 429s, latency, IIS recycle/crash, SQL connectivity, blocking, and deadlock alerts.
- Confirm full/differential/log backup jobs, checksums, off-server copy, and backup-age alerts.
- Check SQL data/log and backup destination free space.
- Check the restricted/encrypted API upload-temp volume, orphan cleanup, and free-space alert state.
- Confirm the Tailscale device is connected, NAS SMB availability is green from the API host, and NAS free-space/authentication alerts are clear.
- Confirm NAS document backup/snapshot and malware-scanning jobs are current; investigate any failed or overdue scan before allowing download.
- Review new P1/P2 support events with correlation IDs and ownership.

### Weekly

- Review failed/slow API routes and top SQL resource consumers.
- Review active users, recent provisioning/deprovisioning, and any Admin assignment.
- Verify certificate-expiry, secret-rotation, disk-growth, and capacity forecasts.
- Confirm monitoring contacts and escalation paths still have two owners.
- Sample application and material audit trails for completeness; never modify them.
- Review NAS/Tailscale errors, service-identity authentication failures, scan backlog, capacity trend, and a read-only sample of document hash/path consistency.

### Monthly

- Perform and document an isolated coordinated SQL/NAS restore drill, including `DBCC CHECKDB`, document path/hash reconciliation, malware-scan state, and API smoke tests.
- Review least-privilege access for Entra assignments, `dbo.users`, SQL operators, SQL/NAS backup identities, the application login, and the NAS service identity/ACL.
- Review recovery targets, backup retention, immutable/off-site copy, and encryption-key recovery evidence.
- Patch Windows, IIS/.NET Hosting Bundle, SQL Server, and dependencies through the tested change process.
- Review monitoring thresholds, performance/capacity trends, incidents, and unresolved security findings.
- Verify the deployed release and schema inventory, and confirm unsupported schedule/procurement workflows remain inaccessible until completed and approved.
- Verify IT ownership of the API host's Tailscale enrollment, restart resilience, exact NAS UNC root, credential-rotation due date, and denial outside the application root.

## Known operational gaps before broad rollout

- Centralized durable API logging/alerting is an infrastructure configuration requirement; this repository currently supplies `ILogger` calls but no production sink.
- HTTP correlation IDs are not yet propagated into the application audit-table correlation ID.
- Project document list/upload/download, direct-UNC storage, record-scoped access, upload rate limiting, SHA-256 verification on download, and NAS-aware readiness are implemented. They remain blocked from broad rollout until IT supplies the exact share/root, service identity/ACL and restart evidence, and the organization proves malware scanning/quarantine plus coordinated SQL/NAS restore and hash reconciliation against the real NAS.
- Multipart uploads are buffered on the API host before being copied to NAS. Production must configure a restricted, encrypted, capacity-monitored `ASPNETCORE_TEMP` volume and verify crash cleanup; a streaming quarantine pipeline remains the preferred longer-term design.
- Schedule, broader document lifecycle/scan-state, notification, and procurement write workflows have database foundations but are not fully exposed by the production API/UI.
- SQL/NAS-compatible RPO/RTO, retention, alert thresholds, support ownership, domains, exact NAS share/root, service identity/ACL, secret reference, backup method, and infrastructure identifiers must be approved and filled in before go-live.
