import sql from "mssql/msnodesqlv8.js";
import type { ConnectionPool as ConnectionPoolType, Request as RequestType, Transaction as TransactionType } from "mssql";
import type { AppConfig } from "./config.js";
type Executor = ConnectionPoolType | TransactionType;
export declare class DatabaseCommitOutcomeUnknownError extends Error {
    readonly originalError: unknown;
    constructor(originalError: unknown);
}
export declare class Database {
    private readonly config;
    private sharedPool;
    private sharedConnect;
    constructor(config: AppConfig["database"]);
    private connectionConfig;
    private connectPool;
    private shared;
    withSession<T>(work: (executor: Executor) => Promise<T>): Promise<T>;
    query<T extends object>(text: string, bind?: (request: RequestType) => void): Promise<sql.IResult<T>>;
    transaction<T>(work: (transaction: TransactionType) => Promise<T>, isolationLevel?: number): Promise<T>;
    close(): Promise<void>;
}
export { sql };
