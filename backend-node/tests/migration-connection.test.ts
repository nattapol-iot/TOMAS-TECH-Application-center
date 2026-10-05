import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

const env = {
  NODE_ENV: "development",
  Authentication__Mode: "Development",
  ConnectionStrings__IoTTeamCenter: "Server=sql;Database=IoTTeamCenter;User ID=iot_team_app;Password=x;Encrypt=true",
  DocumentStorage__RootPath: ".",
};

test("migrations can run with an owner connection while the API uses the application login", () => {
  const owner = "Server=sql;Database=IoTTeamCenter;User ID=owner;Password=y;Encrypt=true";
  const separate = loadConfig({ ...env, ConnectionStrings__Migrations: owner }).database;
  assert.equal(separate.connectionString, env.ConnectionStrings__IoTTeamCenter);
  assert.equal(separate.migrationConnectionString, owner);

  // Compose passes an empty value when the host .env leaves it unset.
  assert.equal(loadConfig({ ...env, ConnectionStrings__Migrations: "" }).database.migrationConnectionString, undefined);
  assert.equal(loadConfig(env).database.migrationConnectionString, undefined);
});
