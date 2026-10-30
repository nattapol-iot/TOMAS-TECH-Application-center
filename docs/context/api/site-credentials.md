# site-credentials

[Module](../modules/installed-base.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `cbe55e4b`; generated, do not edit. [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/credentials` | 228–244 |
| POST | `/api/v1/credentials` | 246–264 |
| PUT | `/api/v1/credentials/:id` | 266–288 |
| POST | `/api/v1/credentials/:id/reveal` | 290–310 |
| DELETE | `/api/v1/credentials/:id` | 312–330 |
| GET | `/api/v1/credentials/:id/access` | 332–345 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `text` | [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>) | 40–47 |
| `idOrNull` | [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>) | 49–55 |
| `parseCredentialInput` | [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>) | 57–79 |
| `iso` | [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>) | 153–153 |
| `credentialDto` | [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>) | 155–168 |
| `bindInput` | [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>) | 170–181 |
| `checkReferences` | [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>) | 183–189 |
| `storeSecret` | [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>) | 191–200 |
| `log` | [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>) | 202–207 |
| `registerSiteCredentialRoutes` | [backend-node/src/routes/site-credentials.ts](<../../../backend-node/src/routes/site-credentials.ts>) | 209–346 |

## Direct local dependencies

- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/credential-vault.ts](<../../../backend-node/src/credential-vault.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/schedule-service.ts](<../../../backend-node/src/schedule-service.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.customer_sites`, `dbo.customers`, `dbo.installed_assets`, `dbo.project_members`, `dbo.projects`, `dbo.site_credential_access`, `dbo.site_credentials`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
