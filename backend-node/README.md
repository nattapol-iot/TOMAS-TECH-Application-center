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
npm install
npm run typecheck
npm test
npm run build
.\scripts\Start-TeamTestNode.ps1
```

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

### Origin topology

Single origin is the simpler deployment: proxy `/api/auth/*` and `/api/me` to
the API from the same origin that serves the app, leave `APP_BASE_URL` unset,
and the session cookie is first-party with no CORS involved. Split origin (app
and API on different ports of the same host) also works: set `APP_BASE_URL` to
the app origin, list it in `Cors__AllowedOrigins__0`, and the API answers with
`Access-Control-Allow-Credentials` while the frontend sends
`credentials: "include"`.


### First-login provisioning

`TMT_ID_DEFAULT_ROLE_CODE` (a `dbo.roles.code`, for example `Admin`) makes the callback create the
`dbo.users` row for anyone TMT ID authenticates, keyed by the Keycloak `sub` in `entra_object_id`
so `CurrentUserService` keeps its single join. A row already known by email is promoted to that
object id instead of duplicated, mirroring `database/scripts/030_provision_user.sql`. Leave the
variable unset to require manual provisioning; then `/api/me` succeeds but bootstrap answers
`403 user_not_registered` until an operator provisions the person.
