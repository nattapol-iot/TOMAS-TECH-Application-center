export type TaskPlan = {
    assigneeId: number;
    start: string;
    workDays: number;
    manDays: number;
    note: string;
    scheduleVersion?: string | null;
};
export type Allocation = {
    key: string;
    start: string | null;
    end: string | null;
    manDays: number | null;
};
export declare function workDates(start: string, end: string, holidays: ReadonlySet<string>): string[];
export declare function planDates(plan: TaskPlan, holidays: ReadonlySet<string>): {
    start: string;
    end: string;
    calendarDays: number;
};
export declare function parseTaskPlan(value: unknown): TaskPlan;
export declare function workloadImpact(items: Allocation[], plan: TaskPlan, capacity: number | null, holidays: ReadonlySet<string>, replaced?: Allocation[]): {
    capacity: number | null;
    unknown: number;
    overloaded: boolean;
    needsReason: boolean;
    weeks: {
        start: string;
        end: string;
        before: number;
        removed: number;
        added: number;
        after: number;
        available: number | null;
        beforePercent: number | null;
        afterPercent: number | null;
        overloaded: boolean;
    }[];
    start: string;
    end: string;
    calendarDays: number;
};
