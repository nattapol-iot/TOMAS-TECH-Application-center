export type ScheduleCalculationTask = {
    id: number;
    parentId: number | null;
    sortOrder: number;
    planStart: string | null;
    planDays: number;
    startMode: string;
    predecessorId: number | null;
    lagDays: number;
    actualStart: string | null;
    actualFinish: string | null;
    forecastFinish: string | null;
    percentComplete: number;
    status: string;
};
export type ResolvedScheduleTask = {
    source: ScheduleCalculationTask;
    wbs: string;
    depth: number;
    planStart: string | null;
    planFinish: string | null;
    actualStart: string | null;
    actualFinish: string | null;
    forecastFinish: string | null;
    workDays: number;
    weight: number;
    percentComplete: number;
    status: string;
    children: ResolvedScheduleTask[];
};
export declare function networkDays(start: string | null, finish: string | null, holidays: ReadonlySet<string>): number;
export declare function resolveSchedule(tasks: ScheduleCalculationTask[], holidays: ReadonlySet<string>): {
    roots: ResolvedScheduleTask[];
    byId: Map<number, ResolvedScheduleTask>;
};
