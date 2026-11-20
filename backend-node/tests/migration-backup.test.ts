import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { MIGRATION_BACKUP_SQL, backupBeforeMigrations, migrationBackupSuffix } from "../src/migration-backup.js";

const base = { NODE_ENV: "development", Authentication__Mode: "Development", ConnectionStrings__IoTTeamCenter: "Server=unused;Database=Unused;User ID=test;Password=test;Encrypt=true", DocumentStorage__RootPath: "." };

test("the backup file is named after the first pending migration and the UTC time", () => {
  assert.equal(migrationBackupSuffix(109, new Date("2026-11-20T01:30:05.123Z")), "_before_migration_109_20261120T013005Z.bak");
  assert.equal(migrationBackupSuffix(7, new Date("2027-01-02T03:04:05.000Z")), "_before_migration_007_20270102T030405Z.bak");
});

test("the backup is a checked COPY_ONLY backup in the server's own backup directory, and stops without one", () => {
  assert.match(MIGRATION_BACKUP_SQL, /SERVERPROPERTY\('InstanceDefaultBackupPath'\)/);
  assert.match(MIGRATION_BACKUP_SQL, /THROW 51900,'No backup directory could be found on this SQL Server\. No migration was applied\.',1;/);
  assert.match(MIGRATION_BACKUP_SQL, /BACKUP DATABASE @database TO DISK=@path WITH COPY_ONLY,CHECKSUM,INIT;/);
  // A refused verify is reported; it does not undo a backup that was written.
  assert.match(MIGRATION_BACKUP_SQL, /BEGIN TRY RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM; SET @verified=1; END TRY BEGIN CATCH SET @verified=0; END CATCH;/);
});

test("the runner reports where the backup is, and refuses to go on without a file", async () => {
  const messages: string[] = [], seen: string[] = [];
  const now = new Date("2026-11-20T01:30:05Z");
  const done = await backupBeforeMigrations(async (statement, suffix) => { seen.push(statement, suffix); return { path: "/var/opt/mssql/data/App" + suffix, verified: true }; }, 109, (message) => messages.push(message), now);
  assert.deepEqual(done, { path: "/var/opt/mssql/data/App_before_migration_109_20261120T013005Z.bak", verified: true });
  assert.deepEqual(seen, [MIGRATION_BACKUP_SQL, "_before_migration_109_20261120T013005Z.bak"]);
  assert.deepEqual(messages, ["[migrate] Backing up the database before migration 109...",
    "[migrate] ✓ Backup written on the database host: /var/opt/mssql/data/App_before_migration_109_20261120T013005Z.bak (verified)"]);
  const unverified = await backupBeforeMigrations(async () => ({ path: "C:/b/App.bak", verified: false }), 110, () => undefined, now);
  assert.equal(unverified.verified, false);
  await assert.rejects(backupBeforeMigrations(async () => undefined, 110, () => undefined, now), /reported no file\. No migration was applied\./);
  await assert.rejects(backupBeforeMigrations(async () => { throw new Error("BACKUP DATABASE permission denied"); }, 110, () => undefined, now), /permission denied/);
});

test("the backup is asked for by the deploy, not by every start", () => {
  assert.equal(loadConfig(base).database.backupBeforeMigrations, undefined);
  assert.equal(loadConfig({ ...base, Database__BackupBeforeMigrations: "true" }).database.backupBeforeMigrations, true);
});
