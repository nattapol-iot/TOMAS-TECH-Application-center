import sql from "mssql/msnodesqlv8.js";
const { ConnectionPool, Request, Transaction } = sql;
export class DatabaseCommitOutcomeUnknownError extends Error {
    originalError;
    constructor(originalError) {
        super("SQL Server did not confirm whether the transaction commit completed.", { cause: originalError });
        this.originalError = originalError;
        this.name = "DatabaseCommitOutcomeUnknownError";
    }
}
function createRequest(executor) {
    return executor instanceof Transaction ? new Request(executor) : new Request(executor);
}
function odbcValue(value) {
    return `{${value.replaceAll("}", "}}")}}`;
}
export class Database {
    config;
    sharedPool = null;
    sharedConnect = null;
    constructor(config) {
        this.config = config;
    }
    connectionConfig() {
        const parsed = ConnectionPool.parseConnectionString(this.config.connectionString);
        const usesWindowsAuthentication = /(?:^|;)\s*(?:integrated\s+security|trusted_connection)\s*=\s*(?:true|yes|sspi)\s*(?:;|$)/i
            .test(this.config.connectionString);
        const instanceName = parsed.options?.instanceName;
        const server = instanceName
            ? `${parsed.server}\\${instanceName}`
            : parsed.port && parsed.port !== 1433
                ? `${parsed.server},${parsed.port}`
                : parsed.server;
        const odbcConnection = [
            "Driver={ODBC Driver 18 for SQL Server}",
            `Server=${odbcValue(server)}`,
            ...(parsed.database ? [`Database=${odbcValue(parsed.database)}`] : []),
            ...(usesWindowsAuthentication
                ? ["Trusted_Connection=Yes"]
                : [`UID=${odbcValue(parsed.user ?? "")}`, `PWD=${odbcValue(parsed.password ?? "")}`]),
            "Encrypt=Yes",
            `TrustServerCertificate=${this.config.trustServerCertificate ? "Yes" : "No"}`,
            "APP={IoTTeamCenter.NodeApi}",
        ].join(";");
        parsed.options = {
            ...parsed.options,
            encrypt: true,
            trustServerCertificate: this.config.trustServerCertificate,
            trustedConnection: usesWindowsAuthentication,
            useUTC: true,
            appName: "IoTTeamCenter.NodeApi",
        };
        // The stored secret is an ADO.NET connection string. Convert it without
        // logging credentials; braced ODBC values also preserve punctuation safely.
        parsed.connectionString = odbcConnection;
        parsed.pool = { max: this.config.applicationRoleName ? 1 : 10, min: 0, idleTimeoutMillis: 30_000 };
        parsed.requestTimeout = 30_000;
        parsed.connectionTimeout = 15_000;
        return parsed;
    }
    async connectPool() {
        const pool = new ConnectionPool(this.connectionConfig());
        pool.on("error", () => undefined);
        return pool.connect();
    }
    async shared() {
        if (this.sharedPool?.connected && this.sharedPool.healthy)
            return this.sharedPool;
        this.sharedConnect ??= this.connectPool().then((pool) => {
            this.sharedPool = pool;
            this.sharedConnect = null;
            return pool;
        }, (error) => {
            this.sharedConnect = null;
            throw error;
        });
        return this.sharedConnect;
    }
    async withSession(work) {
        if (!this.config.applicationRoleName || !this.config.applicationRolePassword) {
            return work(await this.shared());
        }
        const pool = await this.connectPool();
        try {
            const roleName = this.config.applicationRoleName.replaceAll("'", "''");
            const rolePassword = this.config.applicationRolePassword.replaceAll("'", "''");
            await new Request(pool).query(`EXEC sys.sp_setapprole N'${roleName}', N'${rolePassword}';`);
            return await work(pool);
        }
        finally {
            await pool.close();
        }
    }
    async query(text, bind) {
        return this.withSession(async (executor) => {
            const request = createRequest(executor);
            bind?.(request);
            return request.query(text);
        });
    }
    async transaction(work, isolationLevel = sql.ISOLATION_LEVEL.SERIALIZABLE) {
        return this.withSession(async (executor) => {
            if (!(executor instanceof ConnectionPool))
                throw new Error("A transaction requires a connection pool.");
            const transaction = new Transaction(executor);
            await transaction.begin(isolationLevel);
            let value;
            try {
                value = await work(transaction);
            }
            catch (error) {
                await transaction.rollback().catch(() => undefined);
                throw error;
            }
            try {
                await transaction.commit();
                return value;
            }
            catch (error) {
                // A network/cancellation failure after COMMIT was sent does not prove
                // rollback. Callers that own external files must preserve them for
                // reconciliation instead of risking committed metadata with no file.
                throw new DatabaseCommitOutcomeUnknownError(error);
            }
        });
    }
    async close() {
        if (this.sharedPool)
            await this.sharedPool.close();
        this.sharedPool = null;
        this.sharedConnect = null;
    }
}
export { sql };
//# sourceMappingURL=db.js.map