import type { Transaction as TransactionType } from "mssql";
export type BudgetPicture = {
    approvedBudget: number;
    actualConsumed: number;
    openCommitment: number;
    reservedValue: number;
    siblingOpenPrValue: number;
    amount: number;
    forecastBefore: number;
    forecastAfter: number;
    remainingAfter: number;
    withinBudget: boolean;
};
export type RuleFlag = {
    code: string;
    text: string;
};
export declare function budgetPicture(transaction: TransactionType, projectId: number, excludePrId: number | null): Promise<BudgetPicture>;
export declare function procurementRuleFlags(transaction: TransactionType, prId: number): Promise<RuleFlag[]>;
