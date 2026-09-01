import sql from "mssql";
for (const port of [1434, 53739, 1433]) {
  try {
    const pool = await new sql.ConnectionPool({
      server: "127.0.0.1", port, database: "IoTTeamCenter_CodexTest_20260830_04",
      options: { trustServerCertificate: true, trustedConnection: true, enableArithAbort: true },
      connectionTimeout: 4000,
    }).connect();
    const r = await pool.request().query("SELECT @@SERVERNAME AS s, DB_NAME() AS db");
    console.log(`port ${port}: CONNECTED  ${r.recordset[0].s} / ${r.recordset[0].db}`);
    await pool.close();
    process.exit(0);
  } catch (e) {
    console.log(`port ${port}: ${e.message.slice(0, 100)}`);
  }
}
process.exit(1);
