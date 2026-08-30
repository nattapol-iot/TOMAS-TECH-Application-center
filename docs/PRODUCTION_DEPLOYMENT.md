# Production deployment

This guide deploys the production path that exists in this repository:

```text
User browser
    |  Microsoft Entra sign-in and access token
    v
OpenAI Sites / Vinext frontend
    |  HTTPS + Bearer token (never a SQL connection)
    v
IIS + ASP.NET Core API
    |\
    | \ SMB over the company Tailscale network (document files)
    |  v
    |  Company NAS / \\100.98.152.4\<SHARE_NAME>
    |
    | encrypted TDS, dedicated application login
    v
Microsoft SQL Server / IoTTeamCenter (structured data and file metadata)
```

The SQL Server must not be reachable from the browser or from Sites. Only the IIS/API host may connect to SQL Server. The application must never use `sa`.

SQL Server remains the system of record for structured business data and document
metadata. The NAS stores file contents only. Never put live SQL Server `MDF` or
`LDF` files on the NAS share. The API must access the NAS by an exact UNC path;
Windows mapped drives are per-session state and are not supported for IIS.

## Current production scope

The production frontend and API currently provide the dashboard/bootstrap, user profile, inquiries, estimates and estimate cost, estimate workflow, projects, and inventory balance paths. The database baseline also contains procurement, receiving, stock, scheduling, document, notification, and audit structures. The presence of those tables does **not** mean that every corresponding production UI/API workflow is complete; validate each additional module before enabling it for the team.

The database runner is a **fresh-database baseline**, not an upgrade runner. `database/scripts/020_deploy_fresh_database.sql` applies schema versions 1 through 5 and intentionally fails if those migrations have already been applied. Do not run it against an existing business database or rerun it after a partial deployment.

## Values that must be decided before deployment

Keep these as deployment-system values; do not replace repository files with secrets.

| Placeholder | Meaning |
| --- | --- |
| `<SITES_ORIGIN>` | Exact public frontend origin, for example the assigned Sites origin or approved custom origin; no path or trailing slash |
| `<API_ORIGIN>` | Exact public HTTPS API origin |
| `<API_HOST>` | Hostname portion of the API origin, used by IIS `AllowedHosts` |
| `<SQL_FQDN>` | Internal SQL Server DNS name matching the SQL TLS certificate; do not use the public IP or a certificate-bypassing alias |
| `<TENANT_ID>` | Microsoft Entra tenant ID |
| `<SPA_CLIENT_ID>` | Client ID of the frontend SPA app registration |
| `<API_CLIENT_ID>` | Client ID of the API app registration |
| `<API_AUDIENCE>` | Exact expected `aud` value for v2 API access tokens: the API application client-ID GUID, not the `api://...` Application ID URI |
| `<API_SCOPE>` | Full delegated scope, normally `api://<API_CLIENT_ID>/access_as_user` |
| `<FIRST_ADMIN_OBJECT_ID>` | Entra object ID (`oid`) of the first production administrator |
| `<RELEASE_ID>` | Immutable API release identifier, such as a build number or commit ID |
| `<NAS_UNC_ROOT>` | Exact approved application root, `\\100.98.152.4\<SHARE_NAME>\<APP_ROOT>`; the company manual does not provide the share name |
| `<NAS_SERVICE_IDENTITY>` | Dedicated, least-privileged identity used by the IIS/API process for SMB access; never a staff or NAS administrator account |
| `<NAS_SECRET_REFERENCE>` | Reference to the NAS credential in the approved server secret store; never the credential value |

Do not ask a person to send a SQL password, client secret, or private key through chat or commit one to Git. Entra IDs, origins, and scope names are configuration, not secrets. Neither of the two app registrations needs a client secret for this SPA + bearer-token validation flow.

## 1. Infrastructure prerequisites

- A dedicated Windows Server/IIS host for the API, with the .NET 10 Hosting Bundle installed.
- Node.js 22.13 or later on the frontend build worker, as required by `package.json`.
- The `sqlcmd` utility on the DBA workstation or deployment runner.
- DNS and a trusted public certificate for `<API_HOST>`.
- A CA-issued or enterprise-CA SQL Server certificate whose subject/SAN contains `<SQL_FQDN>`.
- A new, dedicated database name `IoTTeamCenter` on the selected SQL Server instance.
- A secret manager entry for the dedicated SQL login password.
- Tailscale installed and IT-approved on the Windows/IIS API host, with connectivity that survives a server restart.
- An IT-confirmed NAS share name and application root below `\\100.98.152.4`, a dedicated NAS service identity, and reviewed read/write ACLs limited to that root.
- An approved malware-scanning/quarantine path and owner for files entering the NAS-backed document workflow.
- An owner and retention policy for API logs, SQL backups, and restore tests.
- Separate owners, retention/recovery targets, protected backups, and restore tests for NAS documents.

Configure SQL Server to force encrypted connections where operationally possible. The API also forces encryption and, in Production, forces `TrustServerCertificate=False`. A certificate error must be fixed at DNS/certificate/trust-chain level; do not add `TrustServerCertificate=True` and do not use `sqlcmd -C` as a workaround.

At the network layer:

- Allow TCP 1433 (or the approved fixed SQL port) only from the API host or its private subnet.
- Do not expose SQL Server to OpenAI Sites, end-user networks, or the public Internet.
- Allow inbound TCP 443 to the API through the approved reverse proxy/firewall path.
- Allow the API host outbound DNS and HTTPS to the tenant's Microsoft Entra OpenID metadata and signing-key endpoints under `login.microsoftonline.com`, through the approved proxy/firewall. Test token validation after a cold start and key-cache refresh; never pin signing keys.
- Permit SMB to `100.98.152.4` only through the approved company Tailscale path and only from the API host/service identity. Do not expose SMB to the public Internet.
- Restrict RDP, WinRM, IIS administration, and SQL administration to management networks.

## 2. Microsoft Entra configuration

Create two single-tenant app registrations. Do not reuse one registration for both responsibilities.

### API app registration

1. Create the API registration and record `<TENANT_ID>` and `<API_CLIENT_ID>`.
2. Under **Expose an API**, set the Application ID URI approved by the tenant (normally `api://<API_CLIENT_ID>`).
3. Add a delegated scope named `access_as_user` and record the complete `<API_SCOPE>`.
4. In the app manifest, set `api.requestedAccessTokenVersion` to `2`. The API validator intentionally uses the tenant's `/v2.0` issuer.
5. For a v2 access token, set `<API_AUDIENCE>` to the API app's client-ID GUID (`<API_CLIENT_ID>`), not its `api://...` Application ID URI. It must exactly match `Authentication__Audience` in the API.
6. Do not create a client secret merely for token validation. The API validates Entra-signed JWTs through the tenant metadata and signing keys.

### Frontend SPA app registration

1. Create the SPA registration and record `<SPA_CLIENT_ID>`.
2. Add a **Single-page application** redirect URI equal to `<SITES_ORIGIN>`. The code uses `window.location.origin`, so do not add a callback path.
3. Add the API's delegated `<API_SCOPE>` under API permissions and grant tenant/admin consent according to company policy.
4. Add `http://localhost:3000` only as a separate development redirect URI if local development is required. Never use a localhost redirect for the production release.
5. Do not create or place a client secret in the frontend.

The API maps the token's exact `oid` claim to `dbo.users.entra_object_id`; it does not authorize by email. Provision each team member with `database/scripts/030_provision_user.sql` before that person signs in.

## 3. Create the fresh database

Run all commands in this section from the repository root. Use a DBA Windows identity (`-E`) over a TLS-validated SQL connection (`-N`). `-b -r1` makes SQL errors fail the deployment process. Do not add `-C`.

```powershell
Set-Location "<REPOSITORY_ROOT>"

sqlcmd -S "tcp:<SQL_FQDN>,1433" -E -N -b -r1 `
  -Q "IF DB_ID(N'IoTTeamCenter') IS NOT NULL RAISERROR ('Target database already exists; stop for review.', 16, 1);"
```

The preflight must return exit code 0. If the database already exists, stop and identify its owner, creation purpose, schema versions, backup state, and active connections. Do not drop, rename, overwrite, or migrate it merely because the name matches.

Apply the fresh baseline:

```powershell
sqlcmd -S "tcp:<SQL_FQDN>,1433" -E -N -b -r1 `
  -i ".\database\scripts\020_deploy_fresh_database.sql" `
  -v "DatabaseName=IoTTeamCenter"
```

The runner creates the database if absent, enables snapshot isolation options, applies migrations 001-005 in order, and verifies all five schema version records. Migration 005 makes estimate snapshots append-only and prevents changes to historical cost revisions. Verify the result independently:

```powershell
sqlcmd -S "tcp:<SQL_FQDN>,1433" -E -N -b -r1 -d "IoTTeamCenter" `
  -Q "SET NOCOUNT ON; SELECT version, name, applied_at FROM dbo.schema_versions ORDER BY version;"
```

Expected versions are exactly `1`, `2`, `3`, `4`, and `5`.

Do not run `database/scripts/900_optional_development_seed.sql` in Production. It is explicitly development-only.

### Failure during the fresh baseline

If the runner returns a non-zero exit code, stop. Do not blindly rerun it: the database may now be partially initialized, while migrations intentionally reject duplicates. Preserve the command output, inspect `dbo.schema_versions` and database objects with the DBA, then either restore the approved clean backup or remove/recreate the verified new database through the organization's destructive-change process. Never apply cleanup commands to a database whose ownership is uncertain.

## 4. Create the dedicated SQL application login

`database/scripts/005_create_server_login.template.sql` is a reviewed template for login `iot_team_app`. It requires SQL authentication and assumes the database name `IoTTeamCenter`. If a different login or database name is approved, review both the template and every command below consistently.

The selected SQL instance must permit SQL authentication for this implementation. That is not permission to enable or use `sa`: keep `sa` disabled where company policy allows, and never reuse an administrator credential in the application connection string.

1. Generate a long random password in the approved secret manager.
2. Copy the template to an access-controlled administrative location outside the repository.
3. Replace the password placeholder in that secured copy. Do not put the password in a command argument, terminal history, `.env`, `appsettings.json`, `web.config`, or Git.
4. Execute the secured copy as a SQL administrator, then remove the temporary copy under the organization's secret-handling procedure.

```powershell
Copy-Item ".\database\scripts\005_create_server_login.template.sql" `
  "<SECURE_ADMIN_PATH>\005_create_server_login.sql"

sqlcmd -S "tcp:<SQL_FQDN>,1433" -E -N -b -r1 `
  -i "<SECURE_ADMIN_PATH>\005_create_server_login.sql"
```

Map the login to the database's least-privileged application role:

```powershell
sqlcmd -S "tcp:<SQL_FQDN>,1433" -E -N -b -r1 `
  -i ".\database\scripts\010_application_login.sql" `
  -v "DatabaseName=IoTTeamCenter" "AppLogin=iot_team_app"
```

This role can read the application schema, execute only the document-number allocation procedure, and write only the listed business objects. It is denied `DELETE`, `ALTER`, and `TAKE OWNERSHIP`; it is not `db_owner` or `sysadmin`.

Test the application login without putting its password on the command line. With `-U` and no `-P`, `sqlcmd` prompts for the password:

```powershell
sqlcmd -S "tcp:<SQL_FQDN>,1433" -U "iot_team_app" -N -b -r1 -d "IoTTeamCenter" `
  -Q "SELECT IS_ROLEMEMBER(N'iot_team_app_role') AS app_role, IS_ROLEMEMBER(N'db_owner') AS db_owner, IS_SRVROLEMEMBER(N'sysadmin') AS sysadmin;"
```

Expected values are `app_role = 1`, `db_owner = 0`, and `sysadmin = 0`.

## 5. Provision the first application administrator

Run user provisioning with the DBA identity, not the application login. Retrieve the immutable Entra user object ID from the same tenant used by the API.

```powershell
sqlcmd -S "tcp:<SQL_FQDN>,1433" -E -N -b -r1 `
  -i ".\database\scripts\030_provision_user.sql" `
  -v "DatabaseName=IoTTeamCenter" `
     "EntraObjectId=<FIRST_ADMIN_OBJECT_ID>" `
     "Email=<FIRST_ADMIN_EMAIL>" `
     "DisplayName=<FIRST_ADMIN_DISPLAY_NAME>" `
     "Initials=<FIRST_ADMIN_INITIALS>" `
     "RoleCode=Admin" `
     "Department=<DEPARTMENT>" `
     "Level=<LEVEL>"
```

The script returns the provisioned row. Confirm its object ID, email, role, and `is_active = 1`. Repeat with the appropriate seeded role code for each team member. Available role codes are `Engineer`, `Project Manager`, `Engineering Manager`, `Purchasing`, `Warehouse`, `Inventory Controller`, `Sales Engineer`, `Admin`, and `Viewer`.

This is a DBA-operated SQLCMD script, not an end-user input surface. Review every substituted value before execution; if an approved text value contains a single quote, escape it as two single quotes for the T-SQL string literal. Never pass raw, untrusted form input to this script.

Run the read-only production baseline verifier after provisioning the first active `Admin` and
application login, using an approved audit/DBA identity that can view all server-principal
metadata and impersonate the database user for an effective-permission check. It fails if
schema/security prerequisites or production identity guards are missing, or if the application
principal has unexpected server/database role membership, direct grants, ownership, or
effective permissions that bypass the append-only baseline:

```powershell
sqlcmd -S "tcp:<SQL_FQDN>,1433" -E -N -b -r1 `
  -i ".\database\scripts\080_verify_production_baseline.sql" `
  -v "DatabaseName=IoTTeamCenter" "AppLogin=iot_team_app"
```

## 6. Configure and publish the API

The API project is `backend/IoTTeamCenter.Api` and targets .NET 10. Publish into a new immutable directory; do not overwrite the currently running release.

```powershell
dotnet restore ".\backend\IoTTeamCenter.Api\IoTTeamCenter.Api.csproj"
dotnet build ".\backend\IoTTeamCenter.Api\IoTTeamCenter.Api.csproj" -c Release --no-restore
dotnet publish ".\backend\IoTTeamCenter.Api\IoTTeamCenter.Api.csproj" `
  -c Release --no-restore --no-self-contained `
  -o "C:\Sites\IoTTeamCenter.Api\releases\<RELEASE_ID>"
```

The published directory includes the repository's `web.config`, which selects `Production`, runs in-process through ASP.NET Core Module V2, and limits request bodies to 10 MB.

### Required API configuration

Inject these values through the approved server/deployment configuration and secret system. Double underscores are the ASP.NET Core environment-variable mapping convention. Do not commit the values to `appsettings.json` or place the SQL password in the repository's `web.config`.

| Environment key | Production value |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` (already set by the published `web.config`) |
| `ASPNETCORE_TEMP` | Restricted, encrypted, capacity-monitored local temp path used while multipart uploads are buffered |
| `AllowedHosts` | `<API_HOST>` |
| `Authentication__Mode` | `Entra` |
| `Authentication__TenantId` | `<TENANT_ID>` |
| `Authentication__ClientId` | `<API_CLIENT_ID>` (the API registration, not the SPA registration) |
| `Authentication__Audience` | `<API_AUDIENCE>` — for the required v2 token, the API client-ID GUID |
| `Authentication__RequiredScope` | `access_as_user` (the delegated scope name in the token's `scp` claim) |
| `Cors__AllowedOrigins__0` | `<SITES_ORIGIN>` exactly; no wildcard, path, or trailing slash |
| `Business__TimeZoneId` | `SE Asia Standard Time` on the Windows/IIS host |
| `ConnectionStrings__IoTTeamCenter` | Secret connection string for `iot_team_app` |
| `DocumentStorage__Mode` | `Nas` (Production fails closed for any other value) |
| `DocumentStorage__RootPath` | Exact approved `\\100.98.152.4\<SHARE_NAME>\<APP_ROOT>`; never a bare host or mapped drive |
| `DocumentStorage__MaxFileSizeBytes` | `52428800` unless security/operations approve another tested value |
| `DocumentStorage__AvailabilityProbeTimeoutSeconds` | `3` (validated range: 1–10 seconds) |
| `DocumentStorage__AvailabilityCacheSeconds` | `15` (validated range: 1–60 seconds) |

The secret connection string must be equivalent to:

```text
Server=tcp:<SQL_FQDN>,1433;Database=IoTTeamCenter;User ID=iot_team_app;Password=<FROM_SECRET_MANAGER>;Encrypt=True;TrustServerCertificate=False;Persist Security Info=False;
```

Use the deployment platform's connection-string builder/secret injection so special characters in the password are escaped correctly. The API's `SqlConnectionFactory` independently enforces mandatory encryption, `TrustServerCertificate=False` in Production, no persisted security information, pooling, and the application name.

### IIS site and application pool

1. Install the matching .NET 10 Hosting Bundle and restart IIS before the first deployment.
2. Create a dedicated application pool using **No Managed Code**, Integrated pipeline, and a dedicated low-privilege identity.
3. Grant that identity read/execute access only to the selected release directory and the minimum write access needed by the approved log sink. Do not grant it repository or SQL administrative access.
4. Create the dedicated `ASPNETCORE_TEMP` path on an encrypted local volume. Grant access only to the API identity and administrators, alert on free space, and validate cleanup after a terminated upload. ASP.NET buffers multipart content larger than its memory threshold here before copying it to NAS; never use a shared or unencrypted OS temp folder for production documents.
5. Create the IIS site for `<API_HOST>` and bind HTTPS/443 to the valid certificate. Do not expose a plain HTTP production binding except through an approved redirect layer.
6. Point the site at `C:\Sites\IoTTeamCenter.Api\releases\<RELEASE_ID>` and attach the dedicated application pool.
7. Apply the required configuration above, recycle the application pool, and watch IIS/ASP.NET startup logs.
8. Route API and IIS logs to the organization's central log/retention system. `stdoutLogEnabled` is intentionally false in `web.config`; enable temporary stdout logging only during controlled troubleshooting to a restricted directory, then disable it again.

### Company NAS document storage

The company manual provides the NAS SMB host `\\100.98.152.4`, but does not name
the share. Do not guess it or deploy against the bare host. IT must supply and
approve `<NAS_UNC_ROOT>` before integration testing.

1. Install Tailscale on the Windows/IIS host. Follow the company process to sign in
   with a company Microsoft account and accept the IT device invitation. For a
   production server, IT must own the device enrollment and verify that connectivity
   returns without a personal interactive session after Windows and Tailscale restart.
2. Have the NAS administrator create `<NAS_SERVICE_IDENTITY>` solely for this
   application. Grant only the operations required under `<NAS_UNC_ROOT>` and deny
   access to unrelated shares and administrative functions. Do not reuse credentials
   issued to staff or a NAS administrator.
3. Store the service credential only in the approved server secret store or protected
   IIS/service configuration. Record `<NAS_SECRET_REFERENCE>`, not the password, in
   deployment records. Do not commit it, place it in frontend variables, or write it
   into document metadata or logs.
4. Configure the API integration to use `<NAS_UNC_ROOT>` directly. Do not use a drive
   letter such as `Z:` and do not depend on a drive mapped by an interactive operator.
5. From the actual IIS application-pool/service security context (or an approved
   equivalent using the same Windows identity), run the repository probe against a
   dedicated, pre-created UAT folder:

   ```powershell
   & ".\scripts\Test-NasStorage.ps1" `
     -NasRoot "\\100.98.152.4\<SHARE_NAME>\<APP_ROOT>\<UAT_PROBE_FOLDER>"
   ```

   The script accepts no password. It validates that the argument includes a UNC
   server and share, tests TCP 445, reports the current Windows identity, and performs
   a disposable write/read/delete round trip. Require `Status = PASS`, archive the
   non-secret result with release evidence, and separately verify through ACL review
   that the identity cannot browse or modify an unrelated NAS path. Never run the
   probe in a live business folder or under an administrator/operator identity as a
   substitute for the real IIS service context.
6. The implemented API uses server-generated relative paths, an extension allowlist,
   a configured size limit, traversal prevention, server-derived content types,
   SHA-256 integrity hashes (verified before every download), SQL metadata, audit
   records, record-scoped read/write authorization, and a six-upload-per-minute
   per-identity limit. Validate each control in staging. The repository does **not**
   provide a malware scanner or quarantine workflow; connect the organization-approved
   inline or external scanning control and prove that unsafe/unscanned files cannot be
   released to users before enabling real uploads.
7. Store only structured metadata in SQL, such as the owning business record,
   server-controlled relative NAS path, original display name, size, content type,
   integrity hash, scan state, uploader, and timestamps. Store file bytes on the NAS;
   do not store NAS credentials in SQL and do not place SQL `MDF`/`LDF` files on NAS.

The repository implements authenticated project document list/upload/download endpoints,
stores file bytes through `DocumentStorage__RootPath`, and stores metadata plus SHA-256
in SQL. That implementation does not change the Production Candidate status: the exact
share, service identity, ACLs, Tailscale restart resilience, malware control, monitoring,
and coordinated recovery must all pass staging/UAT before the document workflow is released.

Verify the anonymous health endpoints before deploying the frontend:

```powershell
Invoke-RestMethod -Method Get -Uri "https://<API_HOST>/health/live"
Invoke-RestMethod -Method Get -Uri "https://<API_HOST>/health/ready"
```

`/health/ready` must return HTTP 200 with `status = ready`, `schemaVersion = 5` or
greater, and `documentStorage = available`. This verifies SQL plus a bounded,
single-flight, briefly cached NAS-root existence/directory-enumeration probe under the
running API identity; it is not a disposable write/delete test or a malware-scan check.
A 503 or TLS error is a failed deployment gate.

## 7. Build and release the Sites frontend

The frontend's `NEXT_PUBLIC_*` values are compiled into the browser bundle. They are not secrets, but they must be the real reviewed production values before the build. Changing an API origin, tenant, client ID, or scope requires a new frontend build and release.

Configure the Sites build environment with:

```text
NEXT_PUBLIC_APP_MODE=production
NEXT_PUBLIC_API_BASE_URL=<API_ORIGIN>
NEXT_PUBLIC_ENTRA_TENANT_ID=<TENANT_ID>
NEXT_PUBLIC_ENTRA_CLIENT_ID=<SPA_CLIENT_ID>
NEXT_PUBLIC_ENTRA_API_SCOPE=<API_SCOPE>
NEXT_PUBLIC_BUSINESS_TIME_ZONE=Asia/Bangkok
SITE_ORIGIN=<SITES_ORIGIN>
```

Do not copy the zero GUIDs or example domains from `.env.example` into Production. Do not add an Entra client secret. `.openai/hosting.json` intentionally has `d1` and `r2` set to `null`; the browser uses only the HTTPS API and must not be connected directly to a database.

Build from a clean dependency install:

```powershell
npm ci
npm test
npm run build
```

`npm run build` first runs `scripts/validate-production-env.mjs`; it requires production mode, real Entra GUID/scope values, trusted HTTPS API/site origins, and rejects the supplied placeholder values. Release the resulting Vinext build with the repository's configured OpenAI Sites project and its normal reviewed release flow. Preserve the previous Sites release so it can be selected again during rollback. Do not substitute an unreviewed Wrangler/D1 deployment path.

After release, confirm that the actual browser origin still equals both the SPA redirect URI and `Cors__AllowedOrigins__0`. A custom-domain change requires updating Entra, API CORS, `SITE_ORIGIN`, and rebuilding the frontend.

## 8. Go-live verification

Perform these checks with provisioned test accounts before inviting the full team:

- TLS succeeds for both Sites and API without browser or SQL certificate bypasses.
- `/health/live` returns HTTP 200 and `/health/ready` reports schema version 5 or greater.
- A provisioned user can sign in with the company Microsoft account and load the dashboard.
- An unprovisioned tenant user receives no application access even if Entra authentication succeeds.
- The first `Admin` uses the authenticated **Master Data** screen to create at least one real customer before the first inquiry; add approved suppliers, inventory items, and engineering rates there as needed. Do not use the optional development seed or ad-hoc SQL.
- An `Admin` can complete the approved core path: inquiry -> estimate -> cost lines -> submit -> approve -> project.
- A `Viewer` can read permitted data but receives HTTP 403 for a direct write request; hiding a button is not the security boundary.
- Duplicate document numbers are not produced under concurrent creation.
- Invalid or stale row versions return a conflict instead of overwriting another user's work.
- Application events include a correlation ID, and business changes appear in the append-only audit records.
- SQL login membership remains `iot_team_app_role = 1`, `db_owner = 0`, and `sysadmin = 0`.
- No demonstration accounts, development seed data, placeholder GUIDs, or example domains appear in the released bundle or database.
- The API host reconnects to Tailscale after a controlled restart and reaches the exact NAS share over SMB without an interactive mapped drive.
- The restricted/encrypted upload-temp volume has enough capacity, produces a free-space alert, and removes disposable buffered content after both successful and deliberately interrupted uploads.
- The IIS service identity can perform only the approved operations under the UAT NAS root; a normal user and the service identity are both denied unrelated NAS paths.
- An uploaded UAT file is quarantined/scanned before download, its SQL metadata points to a server-controlled relative path, and its integrity hash is verified on read/restore.
- NAS capacity, availability, authentication failures, Tailscale state, SMB latency, scan failures/backlog, and document-backup age produce alerts to current owners.
- A coordinated restore drill recovers both SQL metadata and NAS files to compatible recovery points and reports missing, orphaned, or hash-mismatched files.

Start with a controlled pilot group and an agreed support channel. Procurement, scheduling, and other modules outside the currently connected production UI/API must have separate acceptance tests before rollout.

## 9. Backups, rollback, and recovery

Before go-live, configure SQL-native backups appropriate to the recovery objective: full backups, differential backups if required, and transaction-log backups when using the FULL recovery model. Store protected copies outside the database host, monitor job failures, and perform a documented restore test. Never treat copies of live `MDF`/`LDF` files as a backup. A backup that has not been restored successfully is not a verified recovery point.

Configure a separate versioned/snapshot or backup process for `<NAS_UNC_ROOT>`, with
retention, isolation/immutability, encryption, capacity monitoring, and malware-aware
recovery agreed by the data owner. The NAS cannot be the only copy of its own files.
Define compatible SQL and NAS recovery points: restoring SQL metadata and files from
different times can create missing or orphaned documents. A recovery drill must restore
both to isolated locations, reconcile metadata paths and integrity hashes, test an
authorized download, and record the achieved RPO/RTO before production approval.

### API-only rollback

1. Stop or drain the IIS application pool.
2. Point the IIS site back to the previous immutable release directory.
3. Restore that release's matching non-secret configuration.
4. Start the pool and require both health checks to pass.

### Frontend-only rollback

Select the previous immutable Sites release. Its build-time API/Entra values must still be compatible with the active API. Recheck SPA redirect URI and CORS after rollback.

### Database-affecting rollback

There are no down migrations in the current baseline. Never manually delete production tables or rerun `020_deploy_fresh_database.sql` as rollback. Stop writes, preserve evidence/logs, and use the DBA-approved restore-and-cutover procedure from the last verified backup. Prefer restoring to a separately named database, validating it, then making a coordinated API connection cutover rather than overwriting the only copy.

For every future schema change, add a new forward-only numbered migration and a deployment runner that first verifies the currently expected schema version. Take and verify a recovery point before applying it. Treat code and schema compatibility as one release decision.

## 10. Handover records

Record the following in the team's controlled operations system, not in this repository:

- Production Sites origin and release ID.
- API hostname, IIS site/app-pool name, release ID, and configuration owner.
- Entra tenant, SPA client ID, API client ID, Application ID URI, scope, and audience.
- SQL FQDN, instance/port, database name, application login name, and secret-vault reference (never the password).
- NAS UNC root/share (not its password), Tailscale device owner, service-identity name and secret-vault reference, ACL owner, capacity owner, and malware-scanning owner.
- First administrator and subsequent user-provisioning approvals.
- SQL and NAS backup schedules, retention, compatible recovery objectives, last successful backups, and last successful coordinated restore/reconciliation test.
- Monitoring dashboards, log locations, escalation contacts, and rollback decision owner.
