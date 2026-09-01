import type { Transaction as TransactionType } from "mssql";
export declare function lockVisit(t: TransactionType, id: number, expected?: unknown): Promise<{
    id: number;
    number: string;
    status: string;
    intakeId: number;
    intakeNumber: string;
    salesOwnerId: number;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    travelBefore: number;
    travelAfter: number;
    requiredEngineerCount: number;
    slaPolicyId: number | null;
    reportDueDays: number;
    checkedInAt: Date | null;
    checkedOutAt: Date | null;
}>;
export declare function activeEngineerIds(t: TransactionType, visitId: number): Promise<number[]>;
export declare function demandAssignedEngineer(t: TransactionType, visitId: number, actorId: number): Promise<void>;
export declare function checkAvailability(t: TransactionType, engineerId: number, start: Date | string, end: Date | string, travelBefore: number, travelAfter: number, excludeVisitId: number | null, allowConflict: boolean): Promise<{
    conflicts: number;
    detail: string;
}>;
export declare function visitVersion(t: TransactionType, id: number): Promise<string>;
export declare function reportVersion(t: TransactionType, id: number): Promise<string>;
export declare function lockReport(t: TransactionType, visitId: number, expected?: unknown): Promise<{
    id: number;
    number: string;
    status: string;
    currentRevision: number;
    authorId: number;
    visitId: number;
    visitNumber: string;
}>;
export declare function ensureReport(t: TransactionType, visitId: number, visitNumber: string, actorId: number, dueAt: Date, today: string): Promise<string>;
