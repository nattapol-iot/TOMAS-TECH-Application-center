import sql from "mssql";
import type {
  ConnectionPool as ConnectionPoolType,
  Request as RequestType,
  Transaction as TransactionType,
  config as SqlConfig,
} from "mssql";
import type { AppConfig } from "./config.js";

const { ConnectionPool, Request, Transaction } = sql;
type Executor = ConnectionPoolType | TransactionType;

export class DatabaseCommitOutcomeUnknownError extends Error {
  constructor(public readonly originalError: unknown) {
    super("SQL Server did not confirm whether the transaction commit completed.", { cause: originalError });
    this.name = "DatabaseCommitOutcomeUnknownError";
  }
}

export class DatabaseReadOnlyViolationError extends Error {
  constructor() {
    super("The database is connected in read-only mode.");
    this.name = "DatabaseReadOnlyViolationError";
  }
}

const MUTATING_SQL = /\b(?:ALTER|BACKUP|BULK|CREATE|DBCC|DELETE|DENY|DROP|EXEC(?:UTE)?|GRANT|INSERT|INTO|MERGE|NEXT\s+VALUE\s+FOR|RESTORE|REVOKE|TRUNCATE|UPDATE)\b/i;

export function isReadOnlySql(text: string): boolean {
  const executable = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .replace(/N?'(?:''|[^'])*'/gi, "''")
    .replace(/\[(?:\]\]|[^\]])*\]/g, "[]");
  return !MUTATING_SQL.test(executable);
}

function createRequest(executor: Executor): RequestType {
  return executor instanceof Transaction ? new Request(executor) : new Request(executor);
}

export class Database {
  private sharedPool: ConnectionPoolType | null = null;
  private sharedConnect: Promise<ConnectionPoolType> | null = null;

  constructor(private readonly config: AppConfig["database"]) {}

  get readOnly(): boolean {
    return this.config.readOnly === true;
  }

  private connectionConfig(): SqlConfig {
    // The stored secret is an ADO.NET connection string; tedious speaks TDS directly, so the
    // only translation is the option flags. Windows authentication is rejected up front because
    // tedious cannot do it on Linux and a silent fallback to SQL auth would be misleading.
    if (/(?:^|;)\s*(?:integrated\s+security|trusted_connection)\s*=\s*(?:true|yes|sspi)\s*(?:;|$)/i
      .test(this.config.connectionString)) {
      throw new Error("ConnectionStrings__IoTTeamCenter must use a SQL login; Windows authentication is not supported by this API.");
    }
    const parsed = ConnectionPool.parseConnectionString(this.config.connectionString);
    parsed.options = {
      ...parsed.options,
      encrypt: true,
      trustServerCertificate: this.config.trustServerCertificate,
      useUTC: true,
      appName: "IoTTeamCenter.NodeApi",
    } as NonNullable<SqlConfig["options"]>;
    parsed.pool = { max: this.config.applicationRoleName ? 1 : 10, min: 0, idleTimeoutMillis: 30_000 };
    parsed.requestTimeout = 30_000;
    parsed.connectionTimeout = 15_000;
    return parsed;
  }

  private async connectPool(): Promise<ConnectionPoolType> {
    const pool = new ConnectionPool(this.connectionConfig());
    pool.on("error", () => undefined);
    return pool.connect();
  }

  private async shared(): Promise<ConnectionPoolType> {
    if (this.sharedPool?.connected && this.sharedPool.healthy) return this.sharedPool;
    this.sharedConnect ??= this.connectPool().then((pool) => {
      this.sharedPool = pool;
      this.sharedConnect = null;
      return pool;
    }, (error: unknown) => {
      this.sharedConnect = null;
      throw error;
    });
    return this.sharedConnect;
  }

  private async session<T>(work: (executor: Executor) => Promise<T>): Promise<T> {
    if (!this.config.applicationRoleName || !this.config.applicationRolePassword) {
      return work(await this.shared());
    }

    const pool = await this.connectPool();
    try {
      const roleName = this.config.applicationRoleName.replaceAll("'", "''");
      const rolePassword = this.config.applicationRolePassword.replaceAll("'", "''");
      await new Request(pool).query(`EXEC sys.sp_setapprole N'${roleName}', N'${rolePassword}';`);
      return await work(pool);
    } finally {
      await pool.close();
    }
  }

  async withSession<T>(work: (executor: Executor) => Promise<T>): Promise<T> {
    if (this.readOnly) throw new DatabaseReadOnlyViolationError();
    return this.session(work);
  }

  async query<T extends object>(text: string, bind?: (request: RequestType) => void): Promise<sql.IResult<T>> {
    if (this.readOnly && !isReadOnlySql(text)) throw new DatabaseReadOnlyViolationError();
    return this.session(async (executor) => {
      const request = createRequest(executor);
      bind?.(request);
      return request.query<T>(text);
    });
  }

  async transaction<T>(
    work: (transaction: TransactionType) => Promise<T>,
    isolationLevel: number = sql.ISOLATION_LEVEL.SERIALIZABLE,
  ): Promise<T> {
    if (this.readOnly) throw new DatabaseReadOnlyViolationError();
    return this.session(async (executor) => {
      if (!(executor instanceof ConnectionPool)) throw new Error("A transaction requires a connection pool.");
      const transaction = new Transaction(executor);
      await transaction.begin(isolationLevel);
      let value: T;
      try {
        value = await work(transaction);
      } catch (error) {
        await transaction.rollback().catch(() => undefined);
        throw error;
      }
      try {
        await transaction.commit();
        return value;
      } catch (error) {
        // A network/cancellation failure after COMMIT was sent does not prove
        // rollback. Callers that own external files must preserve them for
        // reconciliation instead of risking committed metadata with no file.
        throw new DatabaseCommitOutcomeUnknownError(error);
      }
    });
  }

  async close(): Promise<void> {
    if (this.sharedPool) await this.sharedPool.close();
    this.sharedPool = null;
    this.sharedConnect = null;
  }
}

export { sql };
