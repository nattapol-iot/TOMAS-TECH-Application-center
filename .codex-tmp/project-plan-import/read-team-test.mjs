import sql from "../../backend-node/node_modules/mssql/msnodesqlv8.js";

const connectionString = process.env.TEAMTEST_CONNECTION;
if (!connectionString) throw new Error("TEAMTEST_CONNECTION is required.");
const appRole = process.env.TEAMTEST_APP_ROLE;
const appRolePassword = process.env.TEAMTEST_APP_ROLE_PASSWORD;

const parsed = sql.ConnectionPool.parseConnectionString(connectionString);
const usesWindowsAuthentication = /(?:^|;)\s*(?:integrated\s+security|trusted_connection)\s*=\s*(?:true|yes|sspi)\s*(?:;|$)/i.test(connectionString);
const odbcValue = (value) => `{${String(value).replaceAll("}", "}}")}}`;
const server = parsed.options?.instanceName ? `${parsed.server}\\${parsed.options.instanceName}` : parsed.port && parsed.port !== 1433 ? `${parsed.server},${parsed.port}` : parsed.server;
const odbcConnection = [
  "Driver={ODBC Driver 18 for SQL Server}", `Server=${odbcValue(server)}`,
  ...(parsed.database ? [`Database=${odbcValue(parsed.database)}`] : []),
  ...(usesWindowsAuthentication ? ["Trusted_Connection=Yes"] : [`UID=${odbcValue(parsed.user ?? "")}`, `PWD=${odbcValue(parsed.password ?? "")}`]),
  "Encrypt=Yes", "TrustServerCertificate=Yes", "APP={Codex Project Plan Dry Run}",
].join(";");

const pool = await new sql.ConnectionPool({ ...parsed, connectionString: odbcConnection }).connect();
try {
  if (appRole && appRolePassword) {
    const roleName = appRole.replaceAll("'", "''"), rolePassword = appRolePassword.replaceAll("'", "''");
    await pool.request().query(`EXEC sys.sp_setapprole N'${roleName}', N'${rolePassword}';`);
  }
  const users = await pool.request().query(`
    SELECT u.id,u.name,u.email,r.code role_code,u.department,u.level,u.is_active
    FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id
    WHERE u.deleted_at IS NULL ORDER BY u.name;
  `);
  const projects = await pool.request().query(`
    SELECT p.id,p.project_no,p.name,p.status,
           (SELECT COUNT(*) FROM dbo.schedule_tasks t WHERE t.project_id=p.id AND t.deleted_at IS NULL) task_count
    FROM dbo.projects p WHERE p.deleted_at IS NULL ORDER BY p.project_no;
  `);
  const customers = await pool.request().query(`SELECT id,code,name FROM dbo.customers WHERE deleted_at IS NULL ORDER BY name;`);
  console.log(JSON.stringify({ users: users.recordset, projects: projects.recordset, customers: customers.recordset }, null, 2));
} finally {
  await pool.close();
}
