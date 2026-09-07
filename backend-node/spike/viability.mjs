/**
 * Node backend viability spike.
 *
 * The same eight checks the PHP spike ran, so the two options are compared on
 * identical evidence rather than on preference. PHP passed 6 of 8: it failed
 * the rowversion binary round-trip and returned Thai and Japanese as mojibake.
 *
 * Read-only apart from work inside transactions that are always rolled back.
 *
 * Run:  node backend-node/spike/viability.mjs
 */

import sql from "mssql/msnodesqlv8.js";

const database = process.env.IOT_DB ?? "IoTTeamCenter_CodexTest_20260830_04";
const server = process.env.IOT_SQL_SERVER ?? "localhost";

let passed = 0;
let failed = 0;

function check(label, ok, detail = "") {
  if (ok) { passed++; } else { failed++; }
  const status = ok ? "PASS" : "*** FAIL ***";
  console.log(`${label.padEnd(46)} ${status}${detail ? `  (${detail})` : ""}`);
}

// Windows authentication through the ODBC driver, matching how sqlcmd -E and
// the C# API connect in development. Production will use a SQL login instead,
// supplied through IOT_SQL_CONNECTION.
const config = {
  connectionString:
    process.env.IOT_SQL_CONNECTION ??
    `Driver={ODBC Driver 18 for SQL Server};Server=${server};Database=${database};` +
      "Trusted_Connection=Yes;TrustServerCertificate=Yes;",
};

console.log(`Node ${process.version} · mssql + msnodesqlv8 (ODBC Driver 18)`);
console.log(`Target: ${server} / ${database}\n`);

let pool;

// ---------------------------------------------------------------------------
// T1 · Connect with Windows authentication.
// ---------------------------------------------------------------------------
try {
  pool = await new sql.ConnectionPool(config).connect();
  check("T1 connect (Windows auth)", true);
} catch (error) {
  check("T1 connect (Windows auth)", false, error.message);
  process.exit(1);
}

// The filtered unique index on knowledge_document_versions rejects any write
// made with QUOTED_IDENTIFIER OFF (msg 1934). Prove the driver sets it.
try {
  const result = await pool.request().query("SELECT SESSIONPROPERTY('QUOTED_IDENTIFIER') AS qi");
  check("T1b QUOTED_IDENTIFIER is ON", Number(result.recordset[0].qi) === 1, "required by the filtered index");
} catch (error) {
  check("T1b QUOTED_IDENTIFIER is ON", false, error.message);
}

// ---------------------------------------------------------------------------
// T2 · Read the schema the API serves.
// ---------------------------------------------------------------------------
try {
  const docs = await pool.request().query("SELECT COUNT(*) AS n FROM dbo.knowledge_documents WHERE archived_at IS NULL");
  const schema = await pool.request().query("SELECT MAX(version) AS v FROM dbo.schema_versions");
  check("T2 read knowledge tables", true, `${docs.recordset[0].n} documents, schema v${schema.recordset[0].v}`);
} catch (error) {
  check("T2 read knowledge tables", false, error.message);
}

// ---------------------------------------------------------------------------
// T3 · Stored procedure with an OUTPUT parameter.
// The document number allocator is a procedure; the value must come back.
// ---------------------------------------------------------------------------
try {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const request = new sql.Request(transaction);
  request.input("prefix", sql.NVarChar(10), "STD");
  request.input("scope_code", sql.NVarChar(20), "EE");
  request.output("document_number", sql.NVarChar(40));
  const result = await request.execute("dbo.issue_knowledge_document_number");
  const number = result.output.document_number;
  await transaction.rollback();
  check("T3 stored proc OUTPUT parameter", /^STD-EE-\d{4}$/.test(number ?? ""), number);
} catch (error) {
  check("T3 stored proc OUTPUT parameter", false, error.message);
}

// ---------------------------------------------------------------------------
// T4 · Serializable transaction with UPDLOCK/HOLDLOCK — the publish path.
// ---------------------------------------------------------------------------
try {
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const request = new sql.Request(transaction);
  request.input("document_id", sql.BigInt, 1);
  const result = await request.query(`
    SELECT id FROM dbo.knowledge_document_versions WITH (UPDLOCK, HOLDLOCK)
     WHERE document_id = @document_id AND status = N'Published'`);
  await transaction.rollback();
  const locked = result.recordset[0]?.id;
  check("T4 SERIALIZABLE + UPDLOCK/HOLDLOCK", true, locked ? `locked version ${locked}` : "no published row");
} catch (error) {
  check("T4 SERIALIZABLE + UPDLOCK/HOLDLOCK", false, error.message);
}

// ---------------------------------------------------------------------------
// T5 · rowversion optimistic concurrency.
// 183 writes in the C# API are guarded by "WHERE row_version = @rv".
// This is where PHP failed: it tried to convert the binary token to UCS-2.
// ---------------------------------------------------------------------------
try {
  const row = (await pool.request().query(
    "SELECT TOP 1 id, row_version FROM dbo.knowledge_documents ORDER BY id")).recordset[0];

  if (!row) {
    check("T5 rowversion round-trip", false, "no rows to test against");
  } else {
    const current = await pool.request()
      .input("id", sql.BigInt, row.id)
      .input("rv", sql.Binary(8), row.row_version)
      .query("SELECT COUNT(*) AS n FROM dbo.knowledge_documents WHERE id = @id AND row_version = @rv");

    // A stale token must not match, or the guard is decorative.
    const stale = await pool.request()
      .input("id", sql.BigInt, row.id)
      .input("rv", sql.Binary(8), Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]))
      .query("SELECT COUNT(*) AS n FROM dbo.knowledge_documents WHERE id = @id AND row_version = @rv");

    const currentMatches = current.recordset[0].n;
    const staleMatches = stale.recordset[0].n;
    check("T5 rowversion round-trip", currentMatches === 1 && staleMatches === 0,
      `current matches=${currentMatches}, stale matches=${staleMatches}`);
  }
} catch (error) {
  check("T5 rowversion round-trip", false, error.message);
}

// ---------------------------------------------------------------------------
// T6 · The database guards still bite from Node.
// ---------------------------------------------------------------------------
try {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let refused = false;
  try {
    await new sql.Request(transaction).query(`
      UPDATE dbo.knowledge_audit_events SET reason = N'tampered'
       WHERE id = (SELECT MIN(id) FROM dbo.knowledge_audit_events)`);
  } catch (inner) {
    refused = inner.message.includes("append-only");
  }
  await transaction.rollback();
  check("T6 append-only trigger refuses Node too", refused, "THROW 51172 surfaced as an error");
} catch (error) {
  check("T6 append-only trigger refuses Node too", false, error.message);
}

// ---------------------------------------------------------------------------
// T7 · Rollback actually rolls back.
// ---------------------------------------------------------------------------
try {
  const before = (await pool.request().query("SELECT COUNT(*) AS n FROM dbo.knowledge_number_sequences")).recordset[0].n;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  await new sql.Request(transaction).query(
    "INSERT INTO dbo.knowledge_number_sequences(prefix, scope_code, scope_name) VALUES (N'ZZZ', N'SPIKE', N'rollback probe')");
  await transaction.rollback();
  const after = (await pool.request().query("SELECT COUNT(*) AS n FROM dbo.knowledge_number_sequences")).recordset[0].n;
  check("T7 rollback leaves no trace", before === after, `${before} -> ${after}`);
} catch (error) {
  check("T7 rollback leaves no trace", false, error.message);
}

// ---------------------------------------------------------------------------
// T8 · Unicode round-trip. This is where PHP returned mojibake and would have
// corrupted the multilingual master data silently.
// ---------------------------------------------------------------------------
try {
  const result = await pool.request()
    .input("code", sql.NVarChar(40), "STANDARDS")
    .query("SELECT name_en, name_th, name_ja FROM dbo.knowledge_categories WHERE code = @code");
  const row = result.recordset[0];
  const ok = Boolean(row) && row.name_th.includes("มาตรฐาน") && row.name_ja.includes("標準");
  check("T8 Thai + Japanese round-trip", ok, row ? `${row.name_th} / ${row.name_ja}` : "category missing");
} catch (error) {
  check("T8 Thai + Japanese round-trip", false, error.message);
}

// ---------------------------------------------------------------------------
// T9 · Concurrency, which the C# API relies on and neither spike tested yet.
// Two transactions racing for the same row: one must wait, not both proceed.
// ---------------------------------------------------------------------------
try {
  const first = new sql.Transaction(pool);
  await first.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  await new sql.Request(first)
    .input("id", sql.BigInt, 1)
    .query("SELECT prefix FROM dbo.knowledge_number_sequences WITH (UPDLOCK, HOLDLOCK) WHERE id = @id");

  const second = new sql.Transaction(pool);
  await second.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const blocked = new sql.Request(second);
  blocked.input("id", sql.BigInt, 1);

  let timedOut = false;
  await Promise.race([
    blocked.query("SELECT prefix FROM dbo.knowledge_number_sequences WITH (UPDLOCK, HOLDLOCK) WHERE id = @id")
      .then(() => { timedOut = false; })
      .catch(() => { timedOut = false; }),
    new Promise((resolve) => setTimeout(() => { timedOut = true; resolve(); }, 1200)),
  ]);

  await first.rollback();
  try { await second.rollback(); } catch { /* already unwound */ }
  check("T9 second writer is blocked by the lock", timedOut, timedOut ? "waited, as it must" : "was NOT blocked");
} catch (error) {
  check("T9 second writer is blocked by the lock", false, error.message);
}

await pool.close();

console.log("");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
