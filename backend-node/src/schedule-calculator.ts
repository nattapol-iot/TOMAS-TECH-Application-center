import { ApiError } from "./errors.js";

export type ScheduleCalculationTask = {
  id: number; parentId: number | null; sortOrder: number; planStart: string | null; planDays: number;
  startMode: string; predecessorId: number | null; lagDays: number; actualStart: string | null;
  actualFinish: string | null; forecastFinish: string | null; percentComplete: number; status: string;
};

export type ResolvedScheduleTask = {
  source: ScheduleCalculationTask; wbs: string; depth: number; planStart: string | null; planFinish: string | null;
  actualStart: string | null; actualFinish: string | null; forecastFinish: string | null; workDays: number;
  weight: number; percentComplete: number; status: string; children: ResolvedScheduleTask[];
};

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const result = date.toISOString().slice(0, 10);
  if (result < "0001-01-01" || result > "9999-12-31") throw new ApiError(422, "schedule_date_out_of_range", "The schedule dates and duration exceed the supported date range.");
  return result;
}

function isWorkDay(value: string, holidays: ReadonlySet<string>): boolean {
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(value);
}

function nextWorkDay(value: string, holidays: ReadonlySet<string>): string {
  let candidate = value;
  while (!isWorkDay(candidate, holidays)) candidate = addDays(candidate, 1);
  return candidate;
}

export function networkDays(start: string | null, finish: string | null, holidays: ReadonlySet<string>): number {
  if (!start || !finish || finish < start) return 0;
  let count = 0;
  for (let day = start; ; day = addDays(day, 1)) {
    if (isWorkDay(day, holidays)) count += 1;
    if (day === finish) break;
  }
  return count;
}

function minimum(values: Array<string | null>): string | null {
  const available = values.filter((value): value is string => Boolean(value));
  return available.length ? available.sort()[0]! : null;
}

function maximum(values: Array<string | null>): string | null {
  const available = values.filter((value): value is string => Boolean(value));
  return available.length ? available.sort().at(-1)! : null;
}

export function resolveSchedule(tasks: ScheduleCalculationTask[], holidays: ReadonlySet<string>) {
  const bySource = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map<number, ScheduleCalculationTask[]>();
  for (const task of tasks) {
    const key = task.parentId ?? 0;
    const list = children.get(key) ?? [];
    list.push(task); children.set(key, list);
  }
  for (const list of children.values()) list.sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  const byId = new Map<number, ResolvedScheduleTask>();
  const visiting = new Set<number>();

  const resolveOne = (task: ScheduleCalculationTask): ResolvedScheduleTask => {
    const cached = byId.get(task.id); if (cached) return cached;
    if (visiting.has(task.id)) throw new ApiError(409, "schedule_cycle", "The schedule contains a circular parent or predecessor relationship.");
    visiting.add(task.id);
    const resolvedChildren = (children.get(task.id) ?? []).map(resolveOne);
    let result: ResolvedScheduleTask;
    if (resolvedChildren.length) {
      const planStart = minimum(resolvedChildren.map((child) => child.planStart));
      const planFinish = maximum(resolvedChildren.map((child) => child.planFinish));
      const actualStart = minimum(resolvedChildren.map((child) => child.actualStart));
      const actualFinish = resolvedChildren.every((child) => child.status === "Done") ? maximum(resolvedChildren.map((child) => child.actualFinish)) : null;
      const forecastFinish = maximum(resolvedChildren.map((child) => child.forecastFinish ?? child.planFinish));
      const weight = resolvedChildren.reduce((sum, child) => sum + child.weight, 0);
      const progress = weight ? resolvedChildren.reduce((sum, child) => sum + child.percentComplete * child.weight, 0) / weight : 0;
      const status = resolvedChildren.every((child) => child.status === "Done") ? "Done"
        : resolvedChildren.some((child) => child.status === "Blocked") ? "Blocked"
          : resolvedChildren.some((child) => child.status !== "Not Started" || child.percentComplete > 0 || child.actualStart) ? "In Progress" : "Not Started";
      result = { source: task, wbs: "", depth: 0, planStart, planFinish, actualStart, actualFinish, forecastFinish,
        workDays: networkDays(planStart, planFinish, holidays), weight: Math.max(1, weight),
        percentComplete: Math.round(progress * 100) / 100, status, children: resolvedChildren };
    } else {
      let planStart = task.planStart;
      if (task.startMode === "linked" && task.predecessorId) {
        const predecessor = bySource.get(task.predecessorId);
        if (!predecessor) throw new ApiError(409, "schedule_predecessor_missing", "A linked task refers to an inactive predecessor.");
        const predecessorFinish = resolveOne(predecessor).planFinish;
        if (predecessorFinish) planStart = nextWorkDay(addDays(predecessorFinish, 1 + task.lagDays), holidays);
      }
      const planFinish = planStart ? addDays(planStart, Math.max(1, task.planDays) - 1) : null;
      const workDays = networkDays(planStart, planFinish, holidays);
      result = { source: task, wbs: "", depth: 0, planStart, planFinish, actualStart: task.actualStart,
        actualFinish: task.actualFinish, forecastFinish: task.forecastFinish, workDays, weight: Math.max(1, workDays),
        percentComplete: task.percentComplete, status: task.status, children: [] };
    }
    visiting.delete(task.id); byId.set(task.id, result); return result;
  };

  const roots = (children.get(0) ?? []).map(resolveOne);
  tasks.forEach(resolveOne);
  const number = (siblings: ResolvedScheduleTask[], prefix: string, depth: number): void => {
    siblings.forEach((item, index) => {
      item.wbs = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      item.depth = depth; number(item.children, item.wbs, depth + 1);
    });
  };
  number(roots, "", 0);
  return { roots, byId };
}
