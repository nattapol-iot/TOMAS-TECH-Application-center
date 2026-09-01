import type { Transaction as TransactionType } from "mssql";
export declare function appendStockLedger(transaction: TransactionType, eventKey: string, transactionType: string, itemId: number, quantity: number, bucket: string, location: string, referenceNumber: string, projectId: number | null, unitCost: number, actorId: number, note: string, occurredOn: string): Promise<void>;
