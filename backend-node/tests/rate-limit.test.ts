import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { createTeamTestAccessCode } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { FAILED_SIGN_INS_PER_MINUTE, failedSignInLimit, PER_PERSON_REQUESTS_PER_MINUTE, UNIDENTIFIED_REQUESTS_PER_MINUTE } from "../src/rate-limits.js";

const baseEnv = {
  NODE_ENV: "development",
  Authentication__Mode: "Development",
  ConnectionStrings__IoTTeamCenter: "Server=localhost;Database=UnusedRateLimitTest;Integrated Security=true",
  DocumentStorage__RootPath: ".",
  Database__RunMigrations: "false",
};

// A signed-in route that never touches the database, so only the limiter decides the status.
async function probeApp(extra: Record<string, string> = {}) {
  const { app } = await buildApp(loadConfig({ ...baseEnv, ...extra }));
  app.get("/api/v1/rate-probe", async (request) => ({ ip: request.ip }));
  await app.ready();
  return app;
}

test("each signed-in person has their own request bucket behind one proxy address", async () => {
  const app = await probeApp();
  try {
    const as = (user: string) => app.inject({ method: "GET", url: "/api/v1/rate-probe", headers: { "x-dev-user-id": user } });
    for (let index = 0; index < PER_PERSON_REQUESTS_PER_MINUTE; index += 1) {
      assert.equal((await as("engineer-a")).statusCode, 200, `request ${index + 1} of engineer-a`);
    }
    const limited = await as("engineer-a");
    assert.equal(limited.statusCode, 429, "engineer-a has used their own minute");
    assert.equal(limited.json().code, "rate_limited");
    assert.equal((await as("engineer-b")).statusCode, 200, "engineer-b still has a full bucket");
  } finally {
    await app.close();
  }
});

test("signed-in traffic never counts toward an address limit", async () => {
  const app = await probeApp();
  try {
    // More people than any per-address allowance, all from one address.
    for (let index = 0; index < UNIDENTIFIED_REQUESTS_PER_MINUTE + 50; index += 1) {
      const response = await app.inject({ method: "GET", url: "/api/v1/rate-probe", headers: { "x-dev-user-id": `person-${index}` } });
      assert.equal(response.statusCode, 200, `person ${index + 1}`);
    }
  } finally {
    await app.close();
  }
});

test("requests with nobody signed in share a larger allowance per address", async () => {
  const app = await probeApp();
  try {
    for (let index = 0; index < UNIDENTIFIED_REQUESTS_PER_MINUTE; index += 1) {
      assert.equal((await app.inject({ method: "GET", url: "/health/live" })).statusCode, 200, `probe ${index + 1}`);
    }
    assert.equal((await app.inject({ method: "GET", url: "/health/live" })).statusCode, 429);
  } finally {
    await app.close();
  }
});

test("rejected credentials are limited per address and signed-in people are not", async () => {
  const { app } = await buildApp(loadConfig({
    ...baseEnv,
    NODE_ENV: "staging",
    Authentication__Mode: "TeamTest",
    Authentication__TeamTestSigningKey: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGH",
    Cors__AllowedOrigins__0: "http://127.0.0.1:3010",
    Database__ApplicationRoleName: "iot_team_company_test",
    Database__ApplicationRolePassword: "0123456789abcdefghijklmnopqrstuvwxyz_ABCD",
    Database__TrustServerCertificateForTeamTest: "true",
    Database__ReadOnly: "true",
  }));
  app.get("/api/v1/rate-probe", async () => ({ ok: true }));
  await app.ready();
  try {
    const guess = () => app.inject({ method: "GET", url: "/api/v1/rate-probe", headers: { host: "localhost", "x-team-test-email": "engineer@tomastc.com", "x-team-test-code": "wrong" } });
    for (let index = 0; index < FAILED_SIGN_INS_PER_MINUTE; index += 1) {
      assert.equal((await guess()).statusCode, 401, `guess ${index + 1}`);
    }
    const blocked = await guess();
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json().code, "rate_limited");
    const signedIn = await app.inject({ method: "GET", url: "/api/v1/rate-probe", headers: {
      host: "localhost", "x-team-test-email": "engineer@tomastc.com",
      "x-team-test-code": createTeamTestAccessCode("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGH", "engineer@tomastc.com"),
    } });
    assert.equal(signedIn.statusCode, 200, "a valid credential from the same address still gets in");
  } finally {
    await app.close();
  }
});

test("the rejected-credential counter resets each minute, groups IPv6 by /64 and stays bounded", () => {
  let clock = 0;
  const limit = failedSignInLimit(2, () => clock);
  limit.record("100.64.0.21");
  limit.record("100.64.0.21");
  assert.throws(() => limit.record("100.64.0.21"), /Too many requests/);
  clock = 60_000;
  assert.doesNotThrow(() => limit.record("100.64.0.21"), "a new minute starts a new window");

  limit.record("2001:db8:1:2::10");
  limit.record("2001:db8:1:2::99");
  assert.throws(() => limit.record("2001:db8:1:2:abcd::1"), /Too many requests/, "one /64 is one address");

  const many = failedSignInLimit(1, () => clock);
  for (let index = 0; index < 20_000; index += 1) many.record(`10.${index >> 16}.${(index >> 8) & 255}.${index & 255}`);
  // The oldest addresses were dropped to keep memory bounded, so they start a fresh window.
  assert.doesNotThrow(() => many.record("10.0.0.0"));
});

test("Http__TrustProxy names the proxy whose forwarded address becomes the client address", async () => {
  assert.throws(() => loadConfig({ ...baseEnv, Http__TrustProxy: "true" }), /must list proxy addresses/);
  assert.throws(() => loadConfig({ ...baseEnv, Http__TrustProxy: "*" }), /must list proxy addresses/);
  assert.throws(() => loadConfig({ ...baseEnv, Http__TrustProxy: "caddy" }), /hop count or a comma-separated list/);
  assert.equal(loadConfig(baseEnv).trustProxy, false);
  assert.equal(loadConfig({ ...baseEnv, Http__TrustProxy: "false" }).trustProxy, false);
  assert.equal(loadConfig({ ...baseEnv, Http__TrustProxy: "1" }).trustProxy, 1);
  assert.equal(loadConfig({ ...baseEnv, Http__TrustProxy: "uniquelocal, 172.18.0.0/16" }).trustProxy, "uniquelocal, 172.18.0.0/16");

  const direct = await probeApp();
  try {
    const response = await direct.inject({ method: "GET", url: "/api/v1/rate-probe", headers: { "x-forwarded-for": "100.64.0.21" } });
    assert.equal(response.json().ip, "127.0.0.1", "without the setting a forwarded address is ignored");
  } finally {
    await direct.close();
  }

  for (const setting of ["loopback", "1"]) {
    const proxied = await probeApp({ Http__TrustProxy: setting });
    try {
      const response = await proxied.inject({ method: "GET", url: "/api/v1/rate-probe", headers: { "x-forwarded-for": "100.64.0.21" } });
      assert.equal(response.json().ip, "100.64.0.21", `Http__TrustProxy=${setting}`);
    } finally {
      await proxied.close();
    }
  }
});
