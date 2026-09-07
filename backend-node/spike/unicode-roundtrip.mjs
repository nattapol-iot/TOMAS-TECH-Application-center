import sql from "mssql/msnodesqlv8.js";
const pool = await new sql.ConnectionPool({
  connectionString: "Driver={ODBC Driver 18 for SQL Server};Server=localhost;" +
    "Database=IoTTeamCenter_CodexTest_20260830_04;Trusted_Connection=Yes;TrustServerCertificate=Yes;",
}).connect();

const th = "มาตรฐานและ SOP";
const ja = "標準・SOP";

// Round-trip through a parameter, without touching any table.
const r = await pool.request()
  .input("th", sql.NVarChar(200), th)
  .input("ja", sql.NVarChar(200), ja)
  .query("SELECT @th AS th, @ja AS ja, CONVERT(varbinary(20), LEFT(@th, 4)) AS th_bytes");

const back = r.recordset[0];
console.log("sent  th:", th, "| ja:", ja);
console.log("back  th:", back.th, "| ja:", back.ja);
console.log("bytes th:", back.th_bytes.toString("hex"));
console.log(back.th === th && back.ja === ja
  ? "\nPASS — Node writes and reads Thai and Japanese losslessly. The driver is fine; the stored data is what is corrupt."
  : "\nFAIL — the driver itself mangles Unicode.");
await pool.close();
