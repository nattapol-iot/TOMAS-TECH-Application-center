# IoT Team Center Node.js API

This directory is the contract-compatible replacement for the ASP.NET Core API.
It uses Node.js, TypeScript, Fastify, SQL Server through ODBC Driver 18, the
existing Team Test/Entra identity contracts, and the existing database schema.

## Runtime state

The API is fully native Node.js. All 191 application routes—including Inquiry,
Estimate, Project, Material, Knowledge Hub, Sales Intake, Engineer Site Visit,
file upload/download, approvals, reporting, and administration—use Fastify and
SQL Server directly. There is no .NET compatibility gateway or runtime fallback.
SQL Server remains the single source of truth; no production data is copied.

## Commands

```powershell
bun install
bun run typecheck
bun run test
bun run build
.\scripts\Start-TeamTestNode.ps1
```

The API runs on Bun (`oven/bun` image, `bun dist/src/server.js`); tests use `bun test`, which runs the
`node:test` suites unchanged. SQL connections that trust the server certificate and name the server by IP
address send a placeholder TLS server name (`src/sql-transport.ts`), because Bun rejects an IP address there.

The default Team Test origin is `http://127.0.0.1:5105`. Real secrets are loaded
from the existing DPAPI-protected Team Test runtime and are never written to an
environment file or repository file.

## TMT ID authentication (`Authentication__Mode=TmtId`)

`TmtId` is a backend-for-frontend OIDC mode for the org Keycloak realm. The API
is the confidential client: it performs the authorization-code exchange with
PKCE S256, holds the `id_token`, and issues its own session cookie. Nothing
identity-related is compiled into the frontend bundle.

Routes, all on the API origin:

| Route | Purpose |
| --- | --- |
| `GET /api/auth/login?next=<path>` | Validates `next` as a same-origin relative path and redirects to Keycloak. |
| `GET /api/auth/callback` | Exchanges the code, creates the session cookie, returns the browser to `next`. |
| `GET /api/auth/logout` | Clears the session and redirects to the realm `end_session_endpoint`. |
| `GET /api/me` | The signed-in identity; `401` when there is no session. |

Every other route keeps the single enforcement seam in `src/auth.ts`: in
`TmtId` mode it requires the session cookie, and the other three modes are
untouched.

### Session state

The session is a `dir`/`A256GCM` encrypted JWT in an `HttpOnly; Secure;
SameSite=Lax` cookie, keyed by HKDF from `SESSION_SECRET`. There is no
server-side session store, so the session survives a restart and is valid on
every listener the process starts -- which also means `SESSION_SECRET` must be
identical everywhere and stable over time, and a session cannot be revoked
server-side before it expires (8 hours). The `id_token` rides inside the
encrypted payload so logout can send `id_token_hint`; if the sealed cookie
would exceed the browser's 4096-byte limit the `id_token` is dropped, a warning
is logged, and logout falls back to an end-session request without the hint.

The transient login state (state, nonce, PKCE verifier, `next`) is a separate
encrypted cookie scoped to `/api/auth` with `SameSite=None`, because the
callback can arrive on a cross-site return that a `Lax` cookie would withhold.
A stale or missing transient cookie restarts login exactly once; the retry
marker travels inside `state` itself, so a permanently broken cookie fails
closed instead of looping.

### Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `Authentication__Mode` | yes | `TmtId` |
| `OIDC_ISSUER` | yes | HTTPS issuer, e.g. `https://auth.tomastc.com/realms/internal`. Discovered lazily on first sign-in. |
| `OIDC_CLIENT_ID` | yes | Confidential client id. |
| `OIDC_CLIENT_SECRET` | yes | Client secret. Never written to a repository file. |
| `PUBLIC_BASE_URL` | yes | Bare origin that owns the registered redirect URI `<PUBLIC_BASE_URL>/api/auth/callback`. |
| `APP_BASE_URL` | no | Origin the browser returns to after login and logout. Defaults to `PUBLIC_BASE_URL`; set it only when the app and the API are on different origins. |
| `SESSION_SECRET` | yes | 32-512 characters. Must be stable across workers and restarts. |
| `SESSION_COOKIE_SECURE` | no | Defaults to `true`; `false` is rejected outside development. |
| `MASTER_DATA_URL` | no | Master-data directory origin. |
| `MASTER_DATA_API_KEY` | no | Sent as `X-API-Key`. |

`loadConfig()` fails fast when `Authentication__Mode=TmtId` and any required
value is missing or malformed, so a misconfigured process never starts.

Profile enrichment reads
`GET {MASTER_DATA_URL}/api/v1/employees/by-lineworks-user-id/{preferred_username}`
and is dormant -- it performs no network call at all -- unless both master-data
values are set. Results are cached in-process for five minutes and are read
only by `/api/me`, never by the per-request enforcement seam.

The same two values also turn on `src/master-data/` (all dormant without them):

- the company calendar: `GET /api/v1/company-calendar` is copied into `dbo.holidays` 10 seconds after start, then
  hourly, and on a signed-in bootstrap when the last sync is over five minutes old (NATIONAL, COMPANY and SPECIAL days,
  company-wide or branch `BKK`; rows from master have a null `created_by`);
- the baht rate offered on supplier quotations: `GET /api/v1/exchange-rates/thb` reads master's exchange rates;
- the signed-in person's own start date on the dashboard: master's `GET /api/v1/me` with their TMT ID token in
  `X-User-Token`. It needs the credentials vault (the token vault keeps each person's refresh token).

- the project-number search (`GET /api/v1/erp/projects`): master's `GET /api/v1/projects?search=`, latest first,
  cancelled ones left out, in place of the ERP's 30-row `purchasing_projects_list`;
- the customer and supplier registers: master's `GET /api/v1/customers` / `suppliers?presence=all` answer the register
  sync (`src/master-data/registers.ts`) in place of the ERP's `customers_list` / `suppliers_list`. Master keeps the
  ERP's ids, so existing links hold; a record deleted in master is closed here. Besides the round the screens start
  when they open, `src/master-data/register-sync.ts` runs one a minute after start and then hourly under the
  `Master data sync` account (migration 122; it cannot sign in), which is the actor on the rows and audit entries it writes.

- the employee directory (`src/master-data/employee-sync.ts`, 30 seconds after start, then hourly): names and nicknames
  of `dbo.employees` follow master's active directory, and an employee who matched before (migration 120 keeps
  master's `lineworks_user_id`) and is no longer listed is marked inactive. Rows match by email once; an email that
  never matched is left alone. Department, position, sizes, dates and rates stay with this app, and `dbo.users`
  accounts are not touched. A directory answer under 20 people changes nothing.

The key must be a user-bound key holding only `employee.self`, linked to a client with read grants on
`company_holiday`, `exchange_rate`, `project`, `customer` and `supplier`. With master connected, start dates come from
master alone, and only for the person signed in. Without master the project search and the registers fall back to
the ERP.

#### Copilot OCR (`COPILOT_OCR_URL`)

Business cards (`POST /api/v1/business-cards/scan`) and supplier quotation PDFs (`POST /api/v1/supplier-quotations/parse-pdf`)
are read by copilot's OCR API (`src/copilot-ocr/`, default `https://copilot.tomastc.com/api/v1/ocr`; `off` disables it).
- **Auth:** each call carries the signed-in person's own TMT ID access token from the token vault (copilot "user" mode).
  - The scan is theirs: it also appears in their copilot Document Scanner.
  - The Keycloak client `iot-team-center` carries an audience mapper for `copilot`.
  - Copilot lists `iot-team-center` as a user-mode client in its `chat_api_clients` setting.
- **Shapes:** a card is read as `kind=namecard`. A quotation is read as `kind=quotation` with our own `schema`
  (`QUOTATION_SCHEMA`), so the answer already matches the quotation form.
- **Waiting:** scans queue for one GPU. The API waits up to 280 s, then answers `504 copilot_busy`.
- **Errors:** a person with no token in the vault gets `409 copilot_sign_in_required` (sign in again).
- **Fallback:** without copilot, the quotation PDF still goes to the Python `pdf-parser`, and the card scanner reports that reading is not connected.

### Origin topology

Single origin is the simpler deployment: proxy `/api/auth/*` and `/api/me` to
the API from the same origin that serves the app, leave `APP_BASE_URL` unset,
and the session cookie is first-party with no CORS involved. Split origin (app
and API on different ports of the same host) also works: set `APP_BASE_URL` to
the app origin, list it in `Cors__AllowedOrigins__0`, and the API answers with
`Access-Control-Allow-Credentials` while the frontend sends
`credentials: "include"`.


### First-login provisioning

Only registered people can sign in (owner's decision, 2026-10-05). Creating an employee in
Employee Master makes the `dbo.users` row (`dbo.sync_employee_directory_user`, with the employee's
department). On the first TMT ID sign-in the callback links that row by email, writing the Keycloak
`sub` into `entra_object_id` so `CurrentUserService` keeps its single join, as
`database/scripts/030_provision_user.sql` does. Nobody else gets an account: an unknown email gets
`/api/me` but bootstrap answers `403 user_not_registered`. `TMT_ID_DEFAULT_ROLE_CODE`, which used to
create an account for anyone, is now ignored with a warning in the API log.
