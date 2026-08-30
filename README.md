# IoT Team Center

Production-oriented internal application for TOMAS TECH's IoT team. It replaces the
estimate-cost prototype's in-browser sample data with Microsoft Entra sign-in, an
ASP.NET Core API, role-based access control, audit history, and Microsoft SQL Server
as the system of record.

The system manages **internal engineering cost only**. It does not calculate selling
price, markup, gross margin, or profit margin.

## Release status

This repository is a **Production Candidate**, not a completed live deployment.
The code, schema, and local SQL workflow have passed the checks documented below,
but go-live still requires staging evidence with the real Entra registrations,
HTTPS domains/certificates, IIS host, least-privileged SQL login, backup/restore,
organization-approved monitoring and recovery targets, and a tested company NAS
share/service identity for document storage.

## Architecture

```text
OpenAI Sites / vinext frontend
            |
            | HTTPS + Microsoft Entra access token
            v
ASP.NET Core API on Windows Server / IIS
            |\
            | \ SMB over the company Tailscale network
            |  v
            |  Company NAS / \\100.98.152.4\<SHARE_NAME>
            |
            | encrypted Microsoft.Data.SqlClient connection
            v
Microsoft SQL Server / IoTTeamCenter (structured system of record)
```

The browser never connects directly to SQL Server. SQL Server must only accept
traffic from the API host, and the API must use a dedicated least-privileged database
login rather than `sa`. SQL Server remains the system of record for structured
business data and document metadata. The project-document API stores file contents
on the company NAS through an exact UNC path from the IIS/API host; never place live SQL Server
`MDF` or `LDF` files on this share and never rely on a Windows mapped drive.

The company NAS manual identifies the SMB host as `\\100.98.152.4`, but it does
not identify a share name. The exact `\\100.98.152.4\<SHARE_NAME>` root, a dedicated
least-privileged NAS service identity, ACLs, Tailscale connectivity from the API
host, malware scanning, monitoring, and backup/restore evidence must be supplied
and tested before document storage is enabled. Staff access follows the company
process: install Tailscale on Windows, sign in with the company Microsoft account,
accept the IT device invitation, and use the NAS username/password issued by an
administrator. Do not reuse a staff or NAS administrator credential for the API.

## Production release scope

The production entry point currently exposes these database-backed workflows:

- Microsoft Entra sign-in and exact Entra object-ID-to-user mapping
- dashboard and current-user bootstrap
- inquiry search, list, status, and creation
- estimate creation, validation, submit, approval, and revision request
- estimate cost lines with server-calculated totals and optimistic concurrency
- project creation from an approved estimate, including metadata for the standard 15 folders
- record-scoped project document list, upload, and download through the API, with NAS bytes and SQL metadata/SHA-256
- inventory item, balance, reorder, and immutable ledger views
- authenticated creation of customer, supplier, inventory-item, and engineering-rate master data
- team, role, permission, audit, and health foundations

The SQL schema also contains schedule, broader document-lifecycle/scan-state, BOM, procurement, receiving,
material issue, and stock-ledger foundations. Their prototype screens remain in the
repository for product reference, but they are deliberately excluded from the
production navigation until authenticated API workflows for those modules are
finished. See [FEATURES.md](FEATURES.md) for the full domain specification.

## Repository layout

| Path | Purpose |
| --- | --- |
| `app/system/ProductionApp.tsx` | Authenticated production shell and permission-filtered navigation |
| `app/system/production/` | Live API-backed screens |
| `app/system/auth-client.ts` | Microsoft Entra SPA authentication |
| `app/system/api-client.ts` | Bearer-token API client, timeout, and error handling |
| `backend/IoTTeamCenter.Api/` | ASP.NET Core API for IIS |
| `database/migrations/` | Versioned SQL Server schema migrations |
| `database/scripts/` | Fresh deployment, login grants, user provisioning, and optional dev seed |
| `docs/` | Production deployment and operations runbooks |
| `tests/production-guardrails.test.mjs` | Checks preventing demo/D1 paths from returning to production |

## Local verification

Prerequisites: Node.js `>=22.13.0`, .NET SDK 10, and optionally SQL Server 2019+
with `sqlcmd` for database integration testing.

```powershell
npm install
npm test
dotnet build .\backend\IoTTeamCenter.Api\IoTTeamCenter.Api.csproj -c Release
```

Copy `.env.example` to an ignored local environment file and replace its placeholders
before using Microsoft sign-in. Public frontend settings are not secrets, but tenant,
client, scope, API URL, and site origin must still match the real registrations.

```powershell
npm run dev
```

The production build fails closed when required values are missing or when public
origins are not HTTPS:

```powershell
npm run build
```

For local API development only, `appsettings.Development.json` enables the explicit
development authentication handler. This handler is unavailable in Production.
Never publish development settings or development seed data.

## Deployment

- [Production deployment guide](docs/PRODUCTION_DEPLOYMENT.md)
- [Operations runbook](docs/OPERATIONS_RUNBOOK.md)
- [Frontend environment template](.env.example)
- [API configuration template](backend/IoTTeamCenter.Api/appsettings.json)

Production deployment requires real Microsoft Entra registrations, HTTPS DNS and
certificates for the Sites frontend and API, an IIS host, SQL Server TLS, a secure
application credential supplied through the server's secret/configuration channel,
the Entra object ID of the first application administrator, and a confirmed NAS
share/service identity with tested recovery. No SQL, NAS, or client-secret values
belong in this repository.

## Security invariants

- Authentication is performed by Microsoft Entra; the application stores no Microsoft password.
- Authorization is enforced again in the API from database roles and permissions.
- Production API startup fails when Entra or CORS configuration is absent.
- Production SQL connections require encryption and reject untrusted certificates.
- Writes use row-version checks where concurrent edits can lose data.
- Business numbers are allocated transactionally and audit/stock ledgers are append-only.
- Legacy unauthenticated app routes and the prototype D1 binding are not part of production.
