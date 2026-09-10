import assert from "node:assert/strict";
import test from "node:test";
import { createTeamTestAccessCode, teamTestAccessCodeMatches } from "../src/auth.js";
import {
  isPrivateIpv4,
  loadConfig,
  normalizeBusinessTimeZone,
} from "../src/config.js";

test("Team Test codes match the existing HMAC-SHA256 base64url contract", () => {
  const signingKey = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGH";
  const code = createTeamTestAccessCode(signingKey, "Engineer@TOMASTC.COM");
  assert.equal(code, createTeamTestAccessCode(signingKey, "engineer@tomastc.com"));
  assert.equal(teamTestAccessCodeMatches(signingKey, "engineer@tomastc.com", code), true);
  assert.equal(teamTestAccessCodeMatches(signingKey, "other@tomastc.com", code), false);
});

test("private LAN detection accepts only RFC1918 IPv4", () => {
  assert.equal(isPrivateIpv4("10.0.0.1"), true);
  assert.equal(isPrivateIpv4("172.16.0.1"), true);
  assert.equal(isPrivateIpv4("172.31.255.255"), true);
  assert.equal(isPrivateIpv4("192.168.1.125"), true);
  assert.equal(isPrivateIpv4("172.32.0.1"), false);
  assert.equal(isPrivateIpv4("8.8.8.8"), false);
  assert.equal(isPrivateIpv4("localhost"), false);
});

test("Windows business time zone ids are normalized for Node.js", () => {
  assert.equal(
    normalizeBusinessTimeZone("SE Asia Standard Time"),
    "Asia/Bangkok",
  );
  assert.equal(normalizeBusinessTimeZone("Asia/Bangkok"), "Asia/Bangkok");
  assert.throws(
    () => normalizeBusinessTimeZone("TOMAS/Invalid"),
    /not supported by this Node\.js host/,
  );
});

test("TeamTest fails closed outside staging", () => {
  assert.throws(() => loadConfig({
    NODE_ENV: "production",
    Authentication__Mode: "TeamTest",
  }), /only in staging/);
});

test("remote-database safety overrides are explicit and never allowed in production", () => {
  const base: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
    Authentication__Mode: "Development",
    ConnectionStrings__IoTTeamCenter: "Server=localhost;Database=Unused;User ID=test;Password=test;Encrypt=true",
    DocumentStorage__RootPath: ".",
    Database__RunMigrations: "false",
    Database__ReadOnly: "true",
  };
  const configured = loadConfig(base);
  assert.equal(configured.database.runMigrations, false);
  assert.equal(configured.database.readOnly, true);
  assert.throws(() => loadConfig({ ...base, Database__RunMigrations: "maybe" }), /must be true or false/);
  assert.throws(() => loadConfig({ ...base, Database__RunMigrations: "true" }), /requires Database__RunMigrations=false/);
  assert.throws(() => loadConfig({
    ...base,
    NODE_ENV: "production",
    Authentication__Mode: "Entra",
    Authentication__TenantId: "11111111-1111-4111-8111-111111111111",
    Authentication__ClientId: "22222222-2222-4222-8222-222222222222",
    Authentication__Audience: "22222222-2222-4222-8222-222222222222",
    Authentication__RequiredScope: "access_as_user",
    Cors__AllowedOrigins__0: "https://iot.example.com",
  }), /not allowed in production/);

  const teamTest = loadConfig({
    ...base,
    NODE_ENV: "staging",
    Authentication__Mode: "TeamTest",
    Authentication__TeamTestSigningKey: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGH",
    Cors__AllowedOrigins__0: "http://127.0.0.1:3010",
    Database__ApplicationRoleName: "iot_team_company_test",
    Database__ApplicationRolePassword: "0123456789abcdefghijklmnopqrstuvwxyz_ABCD",
    Database__TrustServerCertificateForTeamTest: "true",
  });
  assert.equal(teamTest.database.runMigrations, false);
  assert.equal(teamTest.database.readOnly, true);
});

test("Microsoft Graph email fails closed when confidential settings are incomplete", () => {
  const base: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
    Authentication__Mode: "Development",
    ConnectionStrings__IoTTeamCenter: "Server=localhost;Database=Unused;Integrated Security=true",
    DocumentStorage__RootPath: ".",
    Email__Mode: "MicrosoftGraph",
  };
  assert.throws(() => loadConfig(base), /Email__TenantId is required/);
  assert.throws(() => loadConfig({ ...base, Email__TenantId: "not-a-guid" }), /Email__TenantId must be a GUID/);
  const configured = loadConfig({
    ...base,
    Email__TenantId: "11111111-1111-4111-8111-111111111111",
    Email__ClientId: "22222222-2222-4222-8222-222222222222",
    Email__ClientSecret: "test-secret",
    Email__SenderUser: "iot-team-center@example.com",
    Email__ApplicationBaseUrl: "https://iot.example.com",
  });
  assert.equal(configured.email.mode, "MicrosoftGraph");
  assert.equal(configured.email.senderUser, "iot-team-center@example.com");
});
