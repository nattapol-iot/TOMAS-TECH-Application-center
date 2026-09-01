import type { Transaction as TransactionType } from "mssql";
import type { CurrentUser } from "./types.js";
export declare function insertMaterialAudit(transaction: TransactionType, actor: CurrentUser, action: string, entityType: string, entityId: number, entityNumber: string, before: unknown, after: unknown, options?: {
    quantity?: number | null;
    projectId?: number | null;
    reason?: string | null;
    attachmentStorageKey?: string | null;
    approverId?: number | null;
}): Promise<void>;
