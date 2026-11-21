import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a deploy backs the database up before the first pending migration (owner 2026-11-20)", () => {
  const deploy = read("scripts/macos/deploy.sh");
  assert.ok(deploy.includes("compose run --rm --no-deps -e ConnectionStrings__Migrations -e Database__BackupBeforeMigrations=true api bun"));
  const runner = read("backend-node/src/migrate.ts");
  // After the pending list is known, before the loop that applies it; a failed backup throws, so nothing is applied.
  const pending = runner.indexOf("pending migration(s):"), backup = runner.indexOf("await backupBeforeMigrations("), apply = runner.indexOf("for (const file of pending) {");
  assert.ok(pending > 0 && pending < backup && backup < apply);
  assert.ok(runner.includes("if (config.database.backupBeforeMigrations) {"));
  assert.match(runner.slice(backup, apply), /Backup before migration FAILED\. No migration was applied\.[^]*throw err;/);
});
