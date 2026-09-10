import assert from "node:assert/strict";
import test from "node:test";
import { Database, DatabaseReadOnlyViolationError, isReadOnlySql } from "../src/db.js";

test("read-only SQL classification rejects database mutations without flagging literals or comments", () => {
  assert.equal(isReadOnlySql("SELECT id, N'UPDATE' AS label FROM dbo.users -- DELETE is documentation"), true);
  assert.equal(isReadOnlySql("SELECT * INTO dbo.copy FROM dbo.users"), false);
  assert.equal(isReadOnlySql("WITH target AS (SELECT id FROM dbo.users) UPDATE target SET id=id"), false);
  assert.equal(isReadOnlySql("EXEC dbo.some_procedure"), false);
  assert.equal(isReadOnlySql("SELECT NEXT VALUE FOR dbo.sequence"), false);
});

test("read-only database rejects mutating queries and transactions before connecting", async () => {
  const database = new Database({
    connectionString: "Server=unreachable;Database=Unused;User ID=test;Password=test;Encrypt=true",
    trustServerCertificate: false,
    runMigrations: false,
    readOnly: true,
  });
  await assert.rejects(database.query("UPDATE dbo.knowledge_articles SET view_count=view_count+1"), DatabaseReadOnlyViolationError);
  await assert.rejects(database.transaction(async () => undefined), DatabaseReadOnlyViolationError);
  await assert.rejects(database.withSession(async () => undefined), DatabaseReadOnlyViolationError);
});
