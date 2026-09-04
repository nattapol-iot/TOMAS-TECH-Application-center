# Team Test Mode

Team Test Mode lets registered team members perform UAT without Microsoft Entra. It is intentionally limited to an ASP.NET Core `Staging` environment and a Vercel Preview deployment. Production rejects this mode at startup/build time.

## Security boundary

- Use a dedicated staging/UAT database. Do not point Team Test Mode at the production database.
- Generate one random 32-256 character signing key and keep it only in the API host's secret configuration.
- Do not put the signing key in Vercel, source control, a URL, or a chat message.
- Generate a different access code for each registered email. A code cannot be reused to impersonate another tester.
- Testers enter their registered email and personal temporary code. The browser keeps both only in `sessionStorage`. Managed staging sends them to the HTTPS API; the explicit trusted-LAN exception uses unencrypted HTTP and must remain short-lived and subnet-scoped.
- The API resolves the email to an active `dbo.users` row. All RBAC checks and audit ownership continue to use that database user.
- Rotate/remove the key and delete the staging deployment when UAT ends.

## 1. Provision UAT users

Run with a DBA identity against the dedicated UAT database. Review the email and role before confirming:

```powershell
sqlcmd -S "tcp:<SQL_FQDN>,1433" -E -N -b -r1 `
  -i ".\database\scripts\035_provision_team_test_user.sql" `
  -v "DatabaseName=<UAT_DATABASE>" `
     "Email=<TEAM_EMAIL>" `
     "DisplayName=<DISPLAY_NAME>" `
     "Initials=<INITIALS>" `
     "RoleCode=<ROLE_CODE>" `
     "Department=<DEPARTMENT>" `
     "Level=<LEVEL>" `
     "ConfirmTeamTest=YES"
```

Available seeded roles include `Engineer`, `Project Manager`, `Engineering Manager`, `Purchasing`, `Warehouse`, `Inventory Controller`, `Sales Engineer`, `Admin`, and `Viewer`.

The script creates a visibly non-production `team-test:` identity. The production baseline verifier rejects active test identities. Later, `030_provision_user.sql` can promote the same email to its real Entra object ID without changing the user ID or audit ownership.

## 2. Configure the staging API

### Run the temporary API on a Windows test machine

For a small UAT, the API can run on a Windows machine that also reaches the dedicated test SQL database. The installer publishes the API under `%LOCALAPPDATA%\IoTTeamCenter\TeamTest`, protects runtime secrets with Windows DPAPI, restricts that directory to the current Windows user and `SYSTEM`, and binds Kestrel only to `127.0.0.1`.

```powershell
.\scripts\Install-TeamTestHost.ps1 `
  -SqlServer "localhost" `
  -DatabaseName "<DEDICATED_UAT_DATABASE>" `
  -AllowedHosts "localhost;127.0.0.1;<TAILSCALE_DNS_NAME>" `
  -TrustServerCertificateForTeamTest
```

On a Windows-authentication-only SQL Server, the installer keeps Windows authentication and activates a least-privileged SQL application role on every API connection. It disables connection pooling for those sessions and does not enable Mixed Mode. On a Mixed Mode server, it creates/rotates a dedicated SQL login and applies the same object-level role grants.

Start and stop only the installed API process with the recorded, command-line-validated PID:

```powershell
.\scripts\Start-TeamTestHost.ps1
.\scripts\Stop-TeamTestHost.ps1
```

For a short-lived test on a trusted company LAN, use the installer's explicit LAN switch and an RFC1918 address assigned to the host. This exception is accepted only by `Staging + TeamTest`; Production and Vercel builds remain HTTPS-only.

```powershell
.\scripts\Install-TeamTestHost.ps1 `
  -SqlServer "localhost" `
  -DatabaseName "<DEDICATED_UAT_DATABASE>" `
  -FrontendOrigin "http://<LAN_IPV4>:3000" `
  -PrivateLanAddress "<LAN_IPV4>" `
  -AllowPrivateLanHttp `
  -TrustServerCertificateForTeamTest

.\scripts\Start-TeamTestHost.ps1
.\scripts\Start-TeamTestLanFrontend.ps1
```

The frontend binds to that exact LAN address, not `0.0.0.0`, and keeps all public build values in the child process rather than writing them to an environment file. From an elevated PowerShell window, configure the managed firewall rules:

```powershell
.\scripts\Configure-TeamTestLanFirewall.ps1
```

The firewall script preserves the current Wi-Fi profile, disables only matching broad local Node.js inbound rules, and replaces them with rules scoped to the installed host address, Wi-Fi adapter, the adapter's current RFC1918 subnet, executable, and TCP ports 3000/5105. It records enough state to restore those prior rules later. From a second device on the same Wi-Fi, open the configured frontend origin or verify both ports at the configured host address:

```powershell
Test-NetConnection <LAN_IPV4> -Port 3000
Test-NetConnection <LAN_IPV4> -Port 5105
```

If both checks fail while the local health checks pass, check Wi-Fi client/AP isolation or a company-managed firewall policy. Team Test codes travel over LAN HTTP without TLS, so use disposable UAT identities/codes only and rotate the signing key afterward.

When the LAN test ends, stop only the recorded processes and remove the managed firewall rules from an elevated PowerShell window:

```powershell
.\scripts\Stop-TeamTestLanFrontend.ps1
.\scripts\Stop-TeamTestHost.ps1
.\scripts\Remove-TeamTestLanFirewall.ps1
```

Provision a tester and generate that tester's personal code from the locally protected signing key:

```powershell
.\scripts\Add-TeamTestUser.ps1 `
  -Email "<TEAM_EMAIL>" `
  -DisplayName "<DISPLAY_NAME>" `
  -Initials "<INITIALS>" `
  -RoleCode "<ROLE_CODE>"
```

Do not copy `%LOCALAPPDATA%\IoTTeamCenter\TeamTest\secrets.json` to another account or machine. DPAPI binds it to the Windows account that installed the host.

After the machine is connected to the company Tailscale tailnet, expose only the loopback API through private HTTPS:

```powershell
tailscale serve --bg --yes http://127.0.0.1:5105
```

Only testers allowed by the company tailnet ACL can reach this URL, and their test devices must be connected to Tailscale. The host machine must remain powered on, awake, connected to SQL Server, and connected to Tailscale throughout the test. Use `tailscale serve reset` when UAT ends.

### Run on a managed staging host

Publish the API to an HTTPS staging host and inject these values through the host's secret/configuration system:

```text
ASPNETCORE_ENVIRONMENT=Staging
AllowedHosts=<STAGING_API_HOST>
Authentication__Mode=TeamTest
Authentication__TeamTestSigningKey=<RANDOM_32_TO_256_CHARACTER_SECRET>
Cors__AllowedOrigins__0=<EXACT_VERCEL_PREVIEW_ORIGIN>
Business__TimeZoneId=SE Asia Standard Time
ConnectionStrings__IoTTeamCenter=<UAT_SQL_CONNECTION_STRING>
```

`appsettings.Staging.json` uses local document storage under `App_Data/team-test-documents`, so NAS is not required for this temporary UAT mode. Treat uploaded test files as disposable. SQL encryption rules remain enabled.

If the isolated UAT SQL Server still uses a certificate chain that the staging API host cannot validate, first install the issuing CA certificate on the staging host. As a temporary fallback only, set `Database__TrustServerCertificateForTeamTest=true`. The API accepts this override only in `Staging + TeamTest`; Production rejects it. Remove the override after the trusted SQL certificate is installed.

Verify that `/health/live` and `/health/ready` succeed over HTTPS before deploying the frontend.

Generate each tester's personal code from a trusted operator machine. The script prompts for the same signing key with hidden input and never writes it to the command line:

```powershell
.\scripts\New-TeamTestAccessCode.ps1 -Email "<TEAM_EMAIL>"
```

Send only that tester's generated access code through the company's approved private channel. Never send the backend signing key.

## 3. Configure the Vercel Preview

Set these variables for Preview only, then redeploy:

```text
NEXT_PUBLIC_APP_MODE=team-test
NEXT_PUBLIC_AUTH_MODE=team-test
NEXT_PUBLIC_API_BASE_URL=<STAGING_API_HTTPS_ORIGIN>
NEXT_PUBLIC_BUSINESS_TIME_ZONE=Asia/Bangkok
SITE_ORIGIN=<EXACT_VERCEL_PREVIEW_ORIGIN>
```

Do not configure the signing key or personal access codes in Vercel. Production must continue to use `NEXT_PUBLIC_APP_MODE=production` and `NEXT_PUBLIC_AUTH_MODE=entra`.

## 4. Tester sign-in

1. Open the Vercel Preview URL.
2. Enter the exact email provisioned in the UAT database.
3. Enter the personal temporary team-test access code.
4. Confirm the displayed name, role, and permissions before entering test data.
5. Use Logout and close the browser when finished.
