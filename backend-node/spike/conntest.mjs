import sql from "mssql/msnodesqlv8.js";
const tries = [
  "Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=IoTTeamCenter_CodexTest_20260830_04;Trusted_Connection=Yes;TrustServerCertificate=Yes;",
  "Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=IoTTeamCenter_CodexTest_20260830_04;Trusted_Connection=Yes;TrustServerCertificate=Yes;",
];
for (const connectionString of tries) {
  const driver = connectionString.match(/Driver=\{([^}]+)\}/)[1];
  try {
    const pool = await new sql.ConnectionPool({ connectionString }).connect();
    const r = await pool.request().query("SELECT @@SERVERNAME AS s, DB_NAME() AS db, SUSER_SNAME() AS login");
    console.log(`${driver}: CONNECTED  ${r.recordset[0].s} / ${r.recordset[0].db} as ${r.recordset[0].login}`);
    await pool.close();
    process.exit(0);
  } catch (e) {
    console.log(`${driver}: ${e.message.slice(0, 120)}`);
  }
}
process.exit(1);
