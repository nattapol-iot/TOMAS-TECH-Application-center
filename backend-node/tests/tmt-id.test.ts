import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { resolveCallbackAction } from "../src/tmt-id/callback-guard.js";
import {
  LOGIN_COOKIE_PATH,
  RETRY_STATE_PREFIX,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "../src/tmt-id/constants.js";
import { createMasterDataDirectory } from "../src/tmt-id/master-data.js";
import { sanitizeNextPath } from "../src/tmt-id/next-path.js";
import { PROVISIONED_EMAIL_FALLBACK_DOMAIN } from "../src/tmt-id/constants.js";
import { createUserProvisioning, deriveProvisionedUser } from "../src/tmt-id/user-provisioning.js";
import { SealedCookieCodec } from "../src/tmt-id/sealed-cookie.js";
import {
  loginCookieAttributes,
  sessionCookieAttributes,
} from "../src/tmt-id/session-cookies.js";
import type { TmtIdConfig } from "../src/config.js";
import type { TransientLogin } from "../src/tmt-id/types.js";

const SESSION_SECRET = "tmt-id-test-session-secret-0123456789abcdef";

const TMT_ID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  Authentication__Mode: "TmtId",
  ConnectionStrings__IoTTeamCenter:
    "Server=localhost;Database=UnusedTmtIdTest;Integrated Security=true",
  DocumentStorage__RootPath: ".",
  OIDC_ISSUER: "https://auth.example.com/realms/internal",
  OIDC_CLIENT_ID: "iot-team-center",
  OIDC_CLIENT_SECRET: "test-client-secret",
  PUBLIC_BASE_URL: "https://iot-team-center.example.com:8445",
  APP_BASE_URL: "https://iot-team-center.example.com:8444",
  SESSION_SECRET,
};

function login(overrides: Partial<TransientLogin> = {}): TransientLogin {
  return {
    state: "n.state-value",
    nonce: "nonce-value",
    codeVerifier: "code-verifier-value",
    next: "/estimates",
    ...overrides,
  };
}

test("?next accepts only same-origin relative paths", () => {
  assert.equal(sanitizeNextPath("/estimates?tab=open#row"), "/estimates?tab=open#row");
  assert.equal(sanitizeNextPath("/"), "/");
  assert.equal(sanitizeNextPath("https://evil.example.com/steal"), "/");
  assert.equal(sanitizeNextPath("//evil.example.com/steal"), "/");
  assert.equal(sanitizeNextPath("/\\evil.example.com/steal"), "/");
  assert.equal(sanitizeNextPath("estimates"), "/");
  assert.equal(sanitizeNextPath(undefined), "/");
  assert.equal(sanitizeNextPath(42), "/");
  assert.equal(sanitizeNextPath(`/estimates${String.fromCharCode(10)}Set-Cookie: x=1`), "/");
  assert.equal(sanitizeNextPath(`/${"a".repeat(3000)}`), "/");
});

test("a state mismatch restarts login once and then fails closed", () => {
  const first = resolveCallbackAction(null, { state: "n.unknown", code: "authcode" });
  assert.deepEqual(first, { kind: "retry", next: "/" });

  const stale = resolveCallbackAction(login({ next: "/projects" }), {
    state: "n.different",
    code: "authcode",
  });
  assert.deepEqual(stale, { kind: "retry", next: "/projects" });

  const afterRetry = resolveCallbackAction(null, {
    state: `${RETRY_STATE_PREFIX}unknown`,
    code: "authcode",
  });
  assert.deepEqual(afterRetry, { kind: "fail", reason: "state_mismatch" });

  const provider = resolveCallbackAction(login(), { error: "access_denied" });
  assert.deepEqual(provider, { kind: "fail", reason: "access_denied" });

  const matched = login();
  assert.deepEqual(
    resolveCallbackAction(matched, { state: matched.state, code: "authcode" }),
    { kind: "exchange", login: matched },
  );
});

test("session and transient login cookies carry the required attributes", () => {
  assert.deepEqual(sessionCookieAttributes(true), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  const transient = loginCookieAttributes(true);
  assert.equal(transient.httpOnly, true);
  assert.equal(transient.secure, true);
  assert.equal(transient.sameSite, "none");
  assert.equal(transient.path, LOGIN_COOKIE_PATH);

  // SameSite=None without Secure is rejected by every current browser, so a
  // plain-http local run must fall back rather than emit a dead cookie.
  assert.equal(loginCookieAttributes(false).sameSite, "lax");
});

test("Authentication__Mode=TmtId fails closed when a required setting is missing", () => {
  assert.throws(
    () => loadConfig({ ...TMT_ID_ENV, SESSION_SECRET: undefined }),
    /SESSION_SECRET is required/,
  );
  assert.throws(
    () => loadConfig({ ...TMT_ID_ENV, OIDC_CLIENT_SECRET: undefined }),
    /OIDC_CLIENT_SECRET is required/,
  );
  assert.throws(
    () => loadConfig({ ...TMT_ID_ENV, SESSION_SECRET: "too-short" }),
    /SESSION_SECRET must contain 32-512 characters/,
  );
  assert.throws(
    () => loadConfig({ ...TMT_ID_ENV, OIDC_ISSUER: "http://auth.example.com/realms/internal" }),
    /OIDC_ISSUER must use HTTPS/,
  );
  assert.throws(
    () => loadConfig({ ...TMT_ID_ENV, MASTER_DATA_URL: "https://master.example.com" }),
    /required together/,
  );

  const config = loadConfig(TMT_ID_ENV);
  assert.equal(config.auth.mode, "TmtId");
  assert.equal(config.tmtId?.sessionCookieSecure, true);
  assert.equal(config.tmtId?.appBaseUrl, "https://iot-team-center.example.com:8444");
  assert.equal(config.tmtId?.masterDataUrl, undefined);
});

test("/api/me answers 401 without a session and 200 with one", async () => {
  const config = loadConfig(TMT_ID_ENV);
  const { app } = await buildApp(config);
  try {
    await app.ready();

    const anonymous = await app.inject({ method: "GET", url: "/api/me" });
    assert.equal(anonymous.statusCode, 401);
    assert.equal(anonymous.json().code, "unauthenticated");

    const sealed = await new SealedCookieCodec(SESSION_SECRET, "session").seal(
      { sub: "keycloak-subject", preferredUsername: "somchai.t", email: "somchai.t@tomastc.com" },
      SESSION_TTL_SECONDS,
    );
    const signedIn = await app.inject({
      method: "GET",
      url: "/api/me",
      cookies: { [SESSION_COOKIE_NAME]: sealed },
    });
    assert.equal(signedIn.statusCode, 200);
    assert.deepEqual(signedIn.json(), {
      authenticationMode: "TmtId",
      sub: "keycloak-subject",
      preferredUsername: "somchai.t",
      email: "somchai.t@tomastc.com",
      name: null,
      role: null,
      department: null,
      employeeNo: null,
    });

    const tampered = await app.inject({
      method: "GET",
      url: "/api/me",
      cookies: { [SESSION_COOKIE_NAME]: `${sealed.slice(0, -4)}AAAA` },
    });
    assert.equal(tampered.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("the master-data adapter stays dormant until both settings are present", async () => {
  const settings: TmtIdConfig = {
    issuer: "https://auth.example.com/realms/internal",
    clientId: "iot-team-center",
    clientSecret: "test-client-secret",
    publicBaseUrl: "https://iot-team-center.example.com:8445",
    appBaseUrl: "https://iot-team-center.example.com:8444",
    sessionSecret: SESSION_SECRET,
    sessionCookieSecure: true,
  };
  let calls = 0;
  const spy: typeof fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ employeeNo: 1042, nameEn: "Somchai T.", department: "IoT", position: "Engineer" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  assert.equal(createMasterDataDirectory(settings, spy), null);
  assert.equal(
    createMasterDataDirectory({ ...settings, masterDataUrl: "https://master.example.com" }, spy),
    null,
  );
  assert.equal(
    createMasterDataDirectory({ ...settings, masterDataApiKey: "test-api-key" }, spy),
    null,
  );
  assert.equal(calls, 0);

  const directory = createMasterDataDirectory(
    { ...settings, masterDataUrl: "https://master.example.com", masterDataApiKey: "test-api-key" },
    spy,
  );
  assert.ok(directory);
  assert.deepEqual(await directory.profile("somchai.t"), {
    employeeNo: 1042,
    name: "Somchai T.",
    department: "IoT",
    role: "Engineer",
    email: null,
  });
  // The second read is served from the in-process cache, so enrichment never
  // multiplies directory traffic by request volume.
  await directory.profile("somchai.t");
  assert.equal(calls, 1);
  assert.equal(await directory.profile(""), null);
  assert.equal(calls, 1);
});
test("first-login provisioning derives a stable user from the token", () => {
  const user = deriveProvisionedUser({
    sub: "9f1c2b3a-0000-4000-8000-000000000001",
    preferredUsername: "somchai.p",
    email: "Somchai.P@By-Works.net",
    name: "Somchai Prasert Na Ayutthaya",
  });
  assert.equal(user.objectId, "9f1c2b3a-0000-4000-8000-000000000001");
  assert.equal(user.email, "somchai.p@by-works.net");
  assert.equal(user.name, "Somchai Prasert Na Ayutthaya");
  assert.equal(user.initials, "SPNA");

  const fallback = deriveProvisionedUser({ sub: "sub-2", preferredUsername: "nok.k" });
  assert.equal(fallback.email, `nok.k@${PROVISIONED_EMAIL_FALLBACK_DOMAIN}`);
  assert.equal(fallback.name, "nok.k");
  assert.equal(fallback.initials, "N");
});

test("provisioning stays dormant without TMT_ID_DEFAULT_ROLE_CODE", () => {
  const database = { query: async () => { throw new Error("must not be called"); } };
  assert.equal(createUserProvisioning(database, undefined), null);
  assert.notEqual(createUserProvisioning(database, "Admin"), null);
});

test("TMT_ID_DEFAULT_ROLE_CODE is validated as a role code", () => {
  assert.equal(loadConfig({ ...TMT_ID_ENV, TMT_ID_DEFAULT_ROLE_CODE: "Admin" }).tmtId?.defaultRoleCode, "Admin");
  assert.equal(loadConfig(TMT_ID_ENV).tmtId?.defaultRoleCode, undefined);
  assert.throws(() => loadConfig({ ...TMT_ID_ENV, TMT_ID_DEFAULT_ROLE_CODE: "1; DROP TABLE" }), /TMT_ID_DEFAULT_ROLE_CODE/);
});
