import type { Transaction } from "mssql";
export declare function drawingApprovers(ownerId: number, leaderId: number | null, managerId: number | null): {
    DRAWN_BY: number;
    CHECKED_BY: number;
    APPROVED_BY: number;
};
/** Assignment, not a job-title string or a task-name keyword, authorizes import. */
export declare function demandDrawingTask(transaction: Transaction, projectId: number, taskId: number, memberId: number): Promise<void>;
export declare function loadDrawingApprovers(transaction: Transaction, projectId: number, ownerId: number): Promise<{
    DRAWN_BY: number;
    CHECKED_BY: number;
    APPROVED_BY: number;
}>;
