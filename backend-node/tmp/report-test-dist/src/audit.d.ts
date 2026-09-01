import type { Transaction as TransactionType } from "mssql";
/** SQL Server ISJSON() (without a type constraint) requires object/array roots. */
export declare function auditJson(value: unknown): string | null;
export declare function insertAudit(transaction: TransactionType, actorId: number, entityType: string, entityId: number, entityNumber: string, action: string, before: unknown, after: unknown): Promise<void>;
