import type { Transaction as TransactionType } from "mssql";
import type { Database } from "./db.js";
import type { CurrentUser } from "./types.js";
export declare function isProjectElevated(user: CurrentUser): boolean;
export declare function isMyWorkElevated(user: CurrentUser): boolean;
export declare function demandProjectScope(database: Database, user: CurrentUser, projectId: number, transaction?: TransactionType, myWork?: boolean): Promise<void>;
