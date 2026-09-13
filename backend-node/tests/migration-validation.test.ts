import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  migrationReadiness,
  REQUIRED_MIGRATIONS,
  validateAppliedMigrationIdentities,
  validateMigrationFiles,
} from "../src/migration-validation.js";

const migrationsDirectory = resolve(process.cwd(), "../database/migrations");

test("required migration files have unique versions and exact semantic identities", async () => {
  const fileNames = (await readdir(migrationsDirectory)).filter((fileName) => /^\d{3}_.+\.sql$/i.test(fileName));
  const files = await Promise.all(fileNames.map(async (fileName) => ({
    fileName,
    sql: await readFile(join(migrationsDirectory, fileName), "utf8"),
  })));
  assert.doesNotThrow(() => validateMigrationFiles(files));
  const roleMigration = files.find(({ fileName }) => fileName === "041_user_role_management.sql")!.sql;
  assert.match(roleMigration, /IF EXISTS \(SELECT 1 FROM dbo\.schema_versions WHERE version = 41\)\s+RETURN;[\s\S]*?BEGIN TRANSACTION;/);
  assert.doesNotMatch(
    roleMigration.slice(roleMigration.indexOf("IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 41)")),
    /RETURN;\s*GO\s*BEGIN TRANSACTION;/i,
  );
});

test("duplicate migration numbers fail before migration selection", () => {
  const files = REQUIRED_MIGRATIONS.map(({ version, fileName, name }) => ({
    fileName,
    sql: `INSERT dbo.schema_versions(version,name) VALUES(${version},N'${name}')`,
  }));
  assert.throws(
    () => validateMigrationFiles([...files, { fileName: "041_duplicate.sql", sql: "SELECT 1" }]),
    /Duplicate migration version\(s\): 41/,
  );
});

test("applied migration identities reject the legacy role-as-037 collision", () => {
  assert.throws(
    () => validateAppliedMigrationIdentities([{
      version: 37,
      name: "Admin-managed primary user roles with audited least-privilege writes",
    }]),
    /operator inspects and reconciles that database/,
  );
});

test("readiness requires every exact identity from 25 through 45", () => {
  const applied = REQUIRED_MIGRATIONS.map(({ version, name }) => ({ version, name }));
  assert.deepEqual(migrationReadiness(applied), {
    ready: true,
    missingVersions: [],
    mismatchedVersions: [],
  });

  const incomplete = applied
    .filter(({ version }) => version !== 39)
    .map((migration) => migration.version === 37 ? { ...migration, name: "wrong" } : migration);
  assert.deepEqual(migrationReadiness(incomplete), {
    ready: false,
    missingVersions: [39],
    mismatchedVersions: [37],
  });
});
