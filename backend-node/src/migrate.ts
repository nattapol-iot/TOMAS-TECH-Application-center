/**
 * Idempotent migration runner.
 * Reads SQL files from MIGRATIONS_DIR, compares with dbo.schema_versions,
 * and runs any pending migrations in version order.
 *
 * Each SQL file is named NNN_name.sql where NNN is a zero-padded integer.
 * GO statements are used as batch separators (SQL Server convention).
 * All batches of a single migration share the same connection (pool max=1)
 * so explicit BEGIN TRANSACTION / COMMIT blocks span GO boundaries correctly.
 *
 * Safe to run on every startup: already-applied versions are skipped.
 *
 * ── MIGRATION AUTHORING RULES ───────────────────────────────────────────────
 * 1. CREATE TRIGGER must be the FIRST statement in its batch (SQL Server rule).
 *    Always put it in its own GO-separated batch:
 *      IF OBJECT_ID('dbo.trg', 'TR') IS NOT NULL DROP TRIGGER dbo.trg;
 *      GO
 *      CREATE TRIGGER dbo.trg ...  ← first line of this batch
 *
 * 2. Record INSERT INTO schema_versions LAST (after all GO batches) so that
 *    if any batch fails the runner retries all batches on next startup.
 *
 * 3. Wrap CREATE TABLE / ALTER TABLE in IF NOT EXISTS so batches are safe
 *    to re-run if a prior attempt partially succeeded and was interrupted.
 *
 * 4. Test every migration against a local SQL Server before pushing.
 *    A syntax error kills the API container on startup.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sql from "mssql";
import type { AppConfig } from "./config.js";
import {
  validateAppliedMigrationIdentities,
  validateMigrationFiles,
  type AppliedMigration,
} from "./migration-validation.js";

// Default: /app/migrations (set in Dockerfile ENV; override via env var for dev)
const DEFAULT_MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  ?? join(fileURLToPath(new URL(".", import.meta.url)), "../../migrations");

function connectionConfig(config: AppConfig["database"]): sql.config {
  const parsed = sql.ConnectionPool.parseConnectionString(config.connectionString);
  parsed.options = {
    ...parsed.options,
    encrypt: true,
    trustServerCertificate: config.trustServerCertificate,
    useUTC: true,
    appName: "IoTTeamCenter.NodeApi.Migrate",
  } as NonNullable<sql.config["options"]>;
  // Force a single connection so BEGIN TRANSACTION / COMMIT span GO batches
  parsed.pool = { max: 1, min: 0, idleTimeoutMillis: 30_000 };
  parsed.requestTimeout = 120_000; // DDL on large tables may be slow
  parsed.connectionTimeout = 15_000;
  return parsed;
}

export async function runPendingMigrations(
  config: AppConfig,
  log: (msg: string) => void = console.log,
): Promise<void> {
  const migrationsDir = DEFAULT_MIGRATIONS_DIR;

  let files: string[];
  try {
    files = (await readdir(migrationsDir))
      .filter((f) => /^\d{3}_.+\.sql$/i.test(f))
      .sort();
  } catch {
    log(`[migrate] Migrations directory not found: ${migrationsDir} — skipping auto-migration.`);
    return;
  }

  const migrationFiles = await Promise.all(files.map(async (fileName) => ({
    fileName,
    sql: await readFile(join(migrationsDir, fileName), "utf8"),
  })));
  validateMigrationFiles(migrationFiles);

  // Identity is checked before any version is skipped. This prevents a
  // historically reused number from silently standing in for another schema.
  let appliedRows: AppliedMigration[];
  {
    const pool = await new sql.ConnectionPool(connectionConfig(config.database)).connect();
    try {
      const result = await new sql.Request(pool).query<AppliedMigration>(
        "SELECT version, name FROM dbo.schema_versions ORDER BY version;"
      );
      appliedRows = result.recordset;
      validateAppliedMigrationIdentities(appliedRows);
    } finally {
      await pool.close();
    }
  }
  const applied = new Set(appliedRows.map((row) => Number(row.version)));

  const pending = files.filter((f) => {
    const v = parseInt(f.slice(0, 3), 10);
    return !isNaN(v) && !applied.has(v);
  });

  if (pending.length === 0) {
    log("[migrate] All migrations already applied.");
    return;
  }

  log(`[migrate] ${pending.length} pending migration(s): ${pending.join(", ")}`);

  for (const file of pending) {
    const version = parseInt(file.slice(0, 3), 10);
    const filePath = join(migrationsDir, file);
    const sqlText = migrationFiles.find((migration) => migration.fileName === file)?.sql
      ?? await readFile(filePath, "utf8");

    // Split on bare GO lines (sqlcmd batch separator)
    const batches = sqlText
      .split(/^\s*GO\s*$/gim)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    // Use a single dedicated connection pool (max=1) so BEGIN TRANSACTION / COMMIT span batches
    const pool = await new sql.ConnectionPool(connectionConfig(config.database)).connect();
    try {
      log(`[migrate] Applying ${file} (${batches.length} batch${batches.length === 1 ? "" : "es"})...`);
      for (const batch of batches) {
        await new sql.Request(pool).query(batch);
      }
      log(`[migrate] ✓ Migration ${version} (${file}) applied successfully.`);
    } catch (err) {
      // A syntax error or constraint violation in any batch stops the server.
      // Fix the SQL file and redeploy — do NOT push untested migration files.
      log(`[migrate] ✗ Migration ${file} FAILED (batch error). The API will not start until this is resolved.`);
      log(`[migrate] Error: ${String(err)}`);
      await pool.close();
      throw err; // Stop; don't attempt subsequent migrations after a failure
    }
    await pool.close();
  }

  log("[migrate] All pending migrations applied.");
}
