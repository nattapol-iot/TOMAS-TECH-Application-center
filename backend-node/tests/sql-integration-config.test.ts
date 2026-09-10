import assert from "node:assert/strict";
import { isAbsolute } from "node:path";
import test from "node:test";
import { parse } from "@tediousjs/connection-string";
import { createSqlIntegrationConfig } from "./sql-integration-config.js";

const validEnvironment = {
  IOT_RUN_SQL_INTEGRATION: "1",
  IOT_SQL_TEST_SERVER: "127.0.0.1,1433",
  IOT_SQL_TEST_USER: "ci;user",
  IOT_SQL_TEST_PASSWORD: 'secret;with"quote',
};
const id = "0123456789abcdef0123456789abcdef";

test("SQL integration config fails closed unless the explicit run flag and credentials are present", () => {
  assert.throws(() => createSqlIntegrationConfig("Guard", {}, id), /IOT_RUN_SQL_INTEGRATION=1/);
  assert.throws(
    () => createSqlIntegrationConfig("Guard", { IOT_RUN_SQL_INTEGRATION: "1" }, id),
    /IOT_SQL_TEST_SERVER is required/,
  );
  assert.throws(
    () => createSqlIntegrationConfig("Guard", { ...validEnvironment, IOT_SQL_TEST_PASSWORD: "" }, id),
    /IOT_SQL_TEST_PASSWORD is required/,
  );
});

test("SQL integration config accepts loopback only", () => {
  for (const server of ["localhost", "localhost\\SQLEXPRESS", "127.0.0.1", "127.10.20.30,1433", "::1", "[::1],1433"]) {
    assert.equal(createSqlIntegrationConfig("Guard", { ...validEnvironment, IOT_SQL_TEST_SERVER: server }, id).sqlcmdArgs[1], server);
  }
  for (const server of ["sql.example.test", "10.0.0.2", "192.168.1.20", "127.0.0.1,70000", "127.999.0.1"]) {
    assert.throws(
      () => createSqlIntegrationConfig("Guard", { ...validEnvironment, IOT_SQL_TEST_SERVER: server }, id),
      /loopback SQL Server/,
    );
  }
});

test("SQL credentials stay out of arguments and are safely encoded for each client", () => {
  const config = createSqlIntegrationConfig("Guard", validEnvironment, id);
  assert.deepEqual(config.sqlcmdArgs, ["-S", "127.0.0.1,1433", "-U", "ci;user", "-C", "-I", "-b"]);
  assert.equal(config.sqlcmdArgs.includes("-P"), false);
  assert.equal(config.sqlcmdArgs.includes(validEnvironment.IOT_SQL_TEST_PASSWORD), false);
  assert.equal(config.sqlcmdOptions.env.SQLCMDPASSWORD, validEnvironment.IOT_SQL_TEST_PASSWORD);
  assert.match(config.connectionString, /User ID="ci;user"/);
  assert.match(config.connectionString, /Password="secret;with""quote"/);
  assert.doesNotMatch(config.connectionString, /Integrated Security|Trusted_Connection/i);
  const parsed = parse(config.connectionString);
  assert.equal(parsed.get("user id"), validEnvironment.IOT_SQL_TEST_USER);
  assert.equal(parsed.get("password"), validEnvironment.IOT_SQL_TEST_PASSWORD);
});

test("SQL integration paths and database names do not depend on process.cwd", () => {
  const config = createSqlIntegrationConfig("Guard", validEnvironment, id);
  assert.equal(config.databaseName, `IoTTeamCenter_GuardCI_${id}`);
  assert.match(config.databaseName, /^IoTTeamCenter_[A-Za-z0-9]+CI_[a-f0-9]{32}$/);
  assert.equal(config.sqlcmdOptions.cwd, config.repoRoot);
  assert.ok(isAbsolute(config.freshDatabaseScript));
  assert.ok(isAbsolute(config.applicationLoginScript));
  assert.ok(config.storageRoot.startsWith(config.backendRoot));
});
