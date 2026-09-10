/**
 * Idempotent migration runner.
 * Reads SQL files from MIGRATIONS_DIR, compares with dbo.schema_versions,
 * and runs any pending migrations in version order.
 *
 * Each SQL file is named NNN_name.sql where NNN is a zero-padded integer.
 * GO statements are used as batch separators (SQL Server convention).
 * All batches of a single migration share the same connection so that
 * explicit BEGIN TRANSACTION / COMMIT blocks span GO boundaries correctly.
 *
 * Safe to run on every startup: already-applied versions are skipped.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sql from "mssql";
import type { AppConfig } from "./config.js";

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

  // Read which versions are already applied
  let applied: Set<number>;
  {
    const pool = await new sql.ConnectionPool(connectionConfig(config.database)).connect();
    try {
      const result = await new sql.Request(pool).query<{ version: number }>(
        "SELECT version FROM dbo.schema_versions ORDER BY version;"
      );
      applied = new Set(result.recordset.map((r) => r.version));
    } finally {
      await pool.close();
    }
  }

  // Discover migration files
  let files: string[];
  try {
    files = (await readdir(migrationsDir))
      .filter((f) => /^\d{3}_.+\.sql$/i.test(f))
      .sort();
  } catch {
    log(`[migrate] Migrations directory not found: ${migrationsDir} — skipping auto-migration.`);
    return;
  }

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
    const sqlText = await readFile(filePath, "utf8");

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
      log(`[migrate] ✗ Migration ${file} FAILED: ${String(err)}`);
      await pool.close();
      throw err; // Stop; don't attempt subsequent migrations after a failure
    }
    await pool.close();
  }

  log("[migrate] All pending migrations applied.");
}
