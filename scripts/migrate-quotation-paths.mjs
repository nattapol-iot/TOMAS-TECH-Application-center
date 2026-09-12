#!/usr/bin/env node
/**
 * Migrate existing supplier quotation files from the old storage layout
 *   supplier-quotations/{YYYY}/{MM}/{uuid}{ext}
 * to the new layout
 *   Quotations/{SupplierName}/{YYYY}/{uuid}{ext}
 *
 * Usage (inside the API Docker container):
 *   node /app/scripts/migrate-quotation-paths.mjs [--dry-run]
 *
 * Or from the Mac mini host via docker exec:
 *   docker --context colima-iot compose -f docker-compose.dev.yml -f docker-compose.tls.yml \
 *     exec -T api node /app/scripts/migrate-quotation-paths.mjs [--dry-run]
 *
 * The script:
 *   1. Reads every supplier_quotations row (including soft-deleted) that still
 *      uses the old "supplier-quotations/..." key prefix.
 *   2. Copies each file to the new path (preserving the original UUID).
 *   3. Updates the storage_key column in the DB.
 *   4. Deletes the old file after a successful DB update.
 *
 * Idempotent: rows whose key already starts with "Quotations/" are skipped.
 * Safe to re-run if interrupted mid-way.
 *
 * Requirements: the same environment variables the API container uses must be set:
 *   ConnectionStrings__IoTTeamCenter  — ADO.NET SQL Server connection string
 *   DocumentStorage__RootPath         — absolute path to the storage root
 */

import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import mssql from "mssql";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ────────────────────────────────────────────────────────────────

function sanitizeSegment(name) {
  return (
    String(name)
      .trim()
      .replace(/[/\\:*?"<>|\p{Cc}]/gu, "_")
      .replace(/\.+$/, "")
      .replace(/\s+/g, " ")
      .slice(0, 100)
      .trim() || "Unknown"
  );
}

function newKey(oldKey, supplierName, receivedDate) {
  // Extract UUID+extension from old key, e.g. "supplier-quotations/2026/09/abc-123.pdf"
  const filename = oldKey.split("/").at(-1); // "abc-123.pdf"
  const dot = filename.lastIndexOf(".");
  const uuid = dot >= 0 ? filename.slice(0, dot) : filename;
  const ext  = dot >= 0 ? filename.slice(dot)  : "";
  const year = String(receivedDate).slice(0, 4);
  return `Quotations/${sanitizeSegment(supplierName)}/${year}/${uuid}${ext}`;
}

function storagePathFor(rootPath, key) {
  const segments = key.split("/");
  return resolve(rootPath, ...segments);
}

// ── DB config — parses the same ADO.NET connection string the API uses ────

function dbConfig() {
  const connStr = process.env["ConnectionStrings__IoTTeamCenter"];
  if (!connStr) {
    console.error("ERROR: ConnectionStrings__IoTTeamCenter is not set.");
    process.exit(1);
  }
  // Mirror what db.ts does: parse the ADO.NET string then explicitly set TLS
  // options. parseConnectionString does NOT reliably forward TrustServerCertificate
  // into the tedious options object, so we must set it ourselves.
  const config = mssql.ConnectionPool.parseConnectionString(connStr);
  config.options = {
    ...config.options,
    encrypt: true,
    trustServerCertificate: true,
    useUTC: true,
  };
  config.requestTimeout = 30_000;
  config.connectionTimeout = 15_000;
  return config;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const rootPath = process.env.DocumentStorage__RootPath ?? process.env.DEV_DOCUMENT_STORAGE_PATH;
  if (!rootPath) {
    console.error("ERROR: DocumentStorage__RootPath (or DEV_DOCUMENT_STORAGE_PATH) is not set.");
    process.exit(1);
  }

  console.log(`Storage root : ${rootPath}`);
  console.log(`Mode         : ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log("");

  const pool = await new mssql.ConnectionPool(dbConfig()).connect();

  // Fetch all rows that still have the old prefix (soft-deleted rows included
  // because the file may still be on disk and should be tidied up).
  const { recordset: rows } = await pool.request().query(`
    SELECT sq.id, sq.storage_key, sq.received_date, s.name AS supplier_name
    FROM   dbo.supplier_quotations sq
    INNER JOIN dbo.suppliers s ON s.id = sq.supplier_id
    WHERE  sq.storage_key LIKE 'supplier-quotations/%'
    ORDER  BY sq.id;
  `);

  if (rows.length === 0) {
    console.log("Nothing to migrate — all rows already use the new path layout.");
    await pool.close();
    return;
  }

  console.log(`Rows to migrate: ${rows.length}\n`);

  let ok = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const oldKey      = String(row.storage_key);
    const supplierName = String(row.supplier_name);
    const receivedDate = row.received_date instanceof Date
      ? row.received_date.toISOString().slice(0, 10)
      : String(row.received_date).slice(0, 10);

    const targetKey = newKey(oldKey, supplierName, receivedDate);
    const oldPath   = storagePathFor(rootPath, oldKey);
    const newPath   = storagePathFor(rootPath, targetKey);

    process.stdout.write(`  [${row.id}] ${oldKey}\n       → ${targetKey} ... `);

    // Check old file exists
    let fileSize;
    try {
      fileSize = (await stat(oldPath)).size;
    } catch {
      console.log("SKIP (source file not found on disk)");
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`DRY RUN (${fileSize} bytes)`);
      ok++;
      continue;
    }

    try {
      // 1. Copy to new location
      await mkdir(dirname(newPath), { recursive: true });
      await copyFile(oldPath, newPath);

      // 2. Update DB
      const req = pool.request();
      req.input("newKey", mssql.NVarChar(1000), targetKey);
      req.input("id",     mssql.BigInt,         row.id);
      await req.query("UPDATE dbo.supplier_quotations SET storage_key = @newKey WHERE id = @id;");

      // 3. Delete old file
      await rm(oldPath, { force: true });

      console.log(`OK (${fileSize} bytes)`);
      ok++;
    } catch (err) {
      console.log(`FAILED — ${err.message}`);
      // Try to clean up a partial copy so the next run can retry cleanly
      await rm(newPath, { force: true }).catch(() => undefined);
      failed++;
    }
  }

  console.log(`\nDone. ok=${ok}  skipped=${skipped}  failed=${failed}`);
  if (failed > 0) {
    console.error("Some rows failed. Re-run the script to retry them.");
    process.exitCode = 1;
  }

  await pool.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
