import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { runConfiguredMigrations } from "../src/startup-migrations.js";

function config(runMigrations?: string) {
  return loadConfig({
    NODE_ENV: "development",
    Authentication__Mode: "Development",
    ConnectionStrings__IoTTeamCenter: "Server=unused;Database=Unused;User ID=test;Password=test;Encrypt=true",
    DocumentStorage__RootPath: ".",
    ...(runMigrations === undefined ? {} : { Database__RunMigrations: runMigrations }),
  });
}

test("startup never invokes the migration runner when migrations are explicitly disabled", async () => {
  let calls = 0;
  const messages: string[] = [];
  await runConfiguredMigrations(config("false"), (message) => messages.push(message), async () => { calls += 1; });
  assert.equal(calls, 0);
  assert.deepEqual(messages, ["[migrate] Disabled by explicit non-production configuration."]);
});

test("startup invokes the migration runner by default", async () => {
  let calls = 0;
  await runConfiguredMigrations(config(), () => undefined, async () => { calls += 1; });
  assert.equal(calls, 1);
});
