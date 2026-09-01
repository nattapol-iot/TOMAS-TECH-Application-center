import type { Transaction as TransactionType } from "mssql";
export declare function issueDocumentNumber(transaction: TransactionType, documentType: string, issueDate: string): Promise<string>;
