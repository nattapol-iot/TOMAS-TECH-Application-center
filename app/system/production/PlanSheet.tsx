"use client";
/* Projects > Plan, the Sheet view (V2, owner 2026-11-23/24): the plan typed like the team's Excel Gantt. One row per
   plan row and one cell per field. A cell saves itself when it is left: the whole row goes back to the API with the
   one field changed (PUT /schedule/tasks/:id), % DONE goes as a progress update (POST /updates). Saves run one at a
   time in the order they were typed, each on the newest row version, and the plan is read again when they stop.
   What a typed date, link or percentage means is in lib/plan-sheet.ts. "After" (ต่อจาก) is finish-to-start only and
   its +N counts work days (owner 2026-11-24); the plan keeps storing calendar days, so existing plans do not move. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { Icon } from "../ui";
import { linkedStart, nextWorkDay } from "../../../lib/gantt";
import { percentChangePatch } from "../../../lib/my-work";
import {
  calendarLagToWorking,
  linkText,
  mondayOn,
  parseDays,
  parseLink,
  parsePercent,
  parseSheetDate,
  sheetOrder,
  shiftDay,
  spanDays,
  workingLagToCalendar,
  type SheetLinkRow,
} from "../../../lib/plan-sheet";
import type { ProjectSchedule, ScheduleTask } from "./PlanningPricingScreens";
import "./plan-sheet.css";

type Fields = {
  name: string;
  picExternal: string;
  planStart: string | null;
  planDays: number;
  startMode: string;
  predecessorId: number | null;
  lagDays: number;
  picUserIds: number[];
  discipline: string | null;
};
type Patch = Partial<Fields>;
type Column = "name" | "pic" | "start" | "end" | "days" | "done" | "work" | "after" | "member" | "discipline" | "status";
type Result = { patch?: Patch; percent?: number; notice?: string } | { error: string; wbs?: string };
type Row = {
  task: ScheduleTask;
  fields: Fields;
  parent: boolean;
  start: string | null;
  finish: string | null;
  days: number | null;
  workDays: number | null;
  percent: number;
  after: string;
  member: string;
};
type Job = { seq: number; retried?: boolean } & (
  | { type: "plan"; taskId: number; patch: Patch }
  | { type: "progress"; taskId: number; percent: number }
  | { type: "create"; parentId: number | null; beforeId: number | null; kind: "phase" | "task"; fields: Fields; percent?: number }
);
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type JobInput = DistributiveOmit<Job, "seq">;
type Pending = { seq: number; taskId: number; patch?: Patch; percent?: number };
type Ghost = { seq: number; parentId: number | null; beforeId: number | null; name: string };
type Draft = { key: number; parentId: number | null; beforeId: number | null; kind: "phase" | "task"; start: string | null };
type Cell = { id: number; col: number };
type Editing = Cell & { initial: string; typed: string | null };
type Removal = { label: string; reason?: string; onRemove: () => void } | undefined;

const COLUMNS: { key: Column; label: string; hint?: string; className: string; select?: boolean }[] = [
  { key: "name", label: "Sheet.colTask", className: "sh-name" },
  { key: "pic", label: "Sheet.colPic", hint: "Sheet.colPicHint", className: "sh-pic" },
  { key: "start", label: "Sheet.colStart", className: "sh-date" },
  { key: "end", label: "Sheet.colEnd", className: "sh-date" },
  { key: "days", label: "Sheet.colDays", className: "sh-num" },
  { key: "done", label: "Sheet.colDone", className: "sh-num" },
  { key: "work", label: "Sheet.colWork", className: "sh-num" },
  { key: "after", label: "Sheet.colAfter", hint: "Sheet.colAfterHint", className: "sh-after" },
  { key: "member", label: "Sheet.colMember", hint: "Sheet.colMemberHint", className: "sh-member", select: true },
  { key: "discipline", label: "Sheet.colDiscipline", className: "sh-disc", select: true },
  { key: "status", label: "Sheet.colStatus", className: "sh-status" },
];
const LAST_COLUMN = COLUMNS.length - 1;
const DISCIPLINES = ["Electrical", "Mechanical", "Software", "Installation"] as const;
const DISCIPLINE_SHORT: Record<string, string> = { EE: "Electrical", ME: "Mechanical", SW: "Software", IN: "Installation" };
const STATUS_LABEL: Record<string, string> = { "Not Started": "Sheet.stNotStarted", "In Progress": "Sheet.stInProgress", Blocked: "Sheet.stBlocked", Done: "Sheet.stDone" };
const UNDO_LIMIT = 50;

const isConflict = (error: unknown) => error instanceof ApiClientError && error.status === 409 && error.code === "concurrency_conflict";
const failureText = (error: unknown) => (error instanceof Error ? error.message : "The request could not be completed.");
const versionBytes = (value: string) => {
  try {
    return Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    return [];
  }
};
/** Whether row version `a` is newer than `b`: SQL Server row versions are 8-byte counters, sent as base64. */
function newer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  const left = versionBytes(a),
    right = versionBytes(b);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const step = (left[index] ?? 0) - (right[index] ?? 0);
    if (step) return step > 0;
  }
  return false;
}
const newest = (a: string | null | undefined, b: string | null | undefined) => (newer(b, a) ? b : a) ?? b ?? null;
/** A date as the cells show it, the way the team types it: 19/11/26. */
const cellDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "");
const isWorkDay = (iso: string, holidays: ReadonlySet<string>) => {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(iso);
};
function countWorkDays(start: string, finish: string, holidays: ReadonlySet<string>): number {
  let count = 0;
  for (let day = start, guard = 0; day <= finish && guard < 3700; day = shiftDay(day, 1), guard++) if (isWorkDay(day, holidays)) count += 1;
  return count;
}
const fieldsOf = (task: ScheduleTask): Fields => ({
  name: task.name,
  picExternal: task.picExternal ?? "",
  planStart: task.storedPlanStart === undefined ? task.planStart : task.storedPlanStart,
  planDays: task.planDays,
  startMode: task.startMode,
  predecessorId: task.predecessorId,
  lagDays: task.lagDays,
  picUserIds: task.pics.map((pic) => pic.id),
  discipline: task.discipline ?? null,
});
const sameValue = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((value, index) => value === b[index]) : a === b);
/** The fields of `patch` that differ from `fields`; null when nothing changes. */
function changed(fields: Fields, patch: Patch): Patch | null {
  const out: Patch = {};
  for (const key of Object.keys(patch) as (keyof Fields)[]) if (!sameValue(patch[key], fields[key])) (out as Record<string, unknown>)[key] = patch[key];
  return Object.keys(out).length ? out : null;
}
const pick = (fields: Fields, keys: (keyof Fields)[]): Patch => Object.fromEntries(keys.map((key) => [key, fields[key]])) as Patch;
const flatById = (schedule: ProjectSchedule) => new Map(sheetOrder(schedule.tasks).map((task) => [task.id, task] as const));

export function PlanSheet({
  schedule,
  team,
  today,
  lockedIds,
  notify,
  onReload,
  onOpenTask,
  removeFor,
  ensureMembers,
  canAddSub,
}: {
  schedule: ProjectSchedule;
  /** The people a row may be given: everyone for a planner, the project's own people for a member (usePlanTeam). */
  team: readonly { id: number; name: string; email?: string }[];
  today: string;
  /** Rows that wait on a day request: the server refuses every plan change on them. */
  lockedIds: ReadonlySet<number | null>;
  notify: (message: string) => void;
  /** Reads the plan again and hands it back (null when it could not be read). */
  onReload: () => Promise<ProjectSchedule | null>;
  onOpenTask: (taskId: number) => void;
  /** The plan's own delete rules and confirmation (the bin on a Gantt row). */
  removeFor: (task: ScheduleTask) => Removal;
  /** A person named on a row joins the project first, because a PIC must be a member. */
  ensureMembers: (userIds: number[]) => Promise<void>;
  canAddSub: (task: ScheduleTask) => boolean;
}) {
  const t = useT();
  const canPlan = schedule.canPlan;
  const holidays = useMemo(() => new Set(schedule.holidays ?? []), [schedule.holidays]);
  const [pending, setPending] = useState<readonly Pending[]>([]);
  const [ghosts, setGhosts] = useState<readonly Ghost[]>([]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const [active, setActive] = useState<Cell | null>(null);
  const [anchor, setAnchor] = useState<Cell | null>(null);
  // The same two cells, kept as they change: two keys in one tick (a held arrow) each move from the one before.
  const cursor = useRef<{ active: Cell | null; anchor: Cell | null }>({ active: null, anchor: null });
  const place = useCallback((next: Cell, corner: Cell | null) => {
    cursor.current = { active: next, anchor: corner };
    setActive(next);
    setAnchor(corner);
  }, []);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const [undoCount, setUndoCount] = useState(0);

  const model = useMemo(() => {
    const all = sheetOrder(schedule.tasks);
    const byTask = new Map(all.map((task) => [task.id, task] as const));
    const patches = new Map<number, Patch>(),
      percents = new Map<number, number>();
    for (const entry of pending) {
      if (entry.patch) patches.set(entry.taskId, { ...patches.get(entry.taskId), ...entry.patch });
      if (entry.percent !== undefined) percents.set(entry.taskId, entry.percent);
    }
    const teamName = new Map(team.map((person) => [person.id, person.name] as const));
    const linkRows: SheetLinkRow[] = all.map((task) => {
      const patch = patches.get(task.id);
      return {
        id: task.id,
        parentId: task.parentId,
        wbs: task.wbs,
        kind: task.kind,
        predecessorId: patch?.predecessorId !== undefined ? patch.predecessorId : task.predecessorId,
        startMode: patch?.startMode ?? task.startMode,
      };
    });
    const rows: Row[] = all.map((task) => {
      const patch = patches.get(task.id),
        fields = { ...fieldsOf(task), ...patch },
        parent = task.children.length > 0;
      let start = task.planStart,
        finish = task.planFinish,
        workDays: number | null = start && finish ? task.workDays : null;
      if (patch && !parent) {
        const predecessorFinish = fields.predecessorId === null ? null : (byTask.get(fields.predecessorId)?.planFinish ?? null);
        start = fields.startMode === "linked" ? (linkedStart(predecessorFinish, fields.lagDays, holidays) ?? task.planStart) : fields.planStart;
        finish = start ? shiftDay(start, Math.max(1, fields.planDays) - 1) : null;
        workDays = start && finish ? countWorkDays(start, finish, holidays) : null;
      }
      const predecessorFinish = fields.predecessorId === null ? null : (byTask.get(fields.predecessorId)?.planFinish ?? null);
      const gap = predecessorFinish ? calendarLagToWorking(predecessorFinish, fields.lagDays, holidays) : fields.lagDays;
      const members = patch?.picUserIds ? patch.picUserIds.map((id) => teamName.get(id) ?? task.pics.find((pic) => pic.id === id)?.name ?? `#${id}`) : task.pics.map((pic) => pic.name);
      return {
        task,
        fields,
        parent,
        start,
        finish,
        workDays,
        days: start && finish ? spanDays(start, finish) : null,
        percent: percents.get(task.id) ?? Number(task.percentComplete),
        after: linkText(fields, linkRows, gap),
        member: members.join(", "),
      };
    });
    const byId = new Map(rows.map((row) => [row.task.id, row] as const));
    const visible: Row[] = [];
    let hideBelow: number | null = null;
    for (const row of rows) {
      if (hideBelow !== null) {
        if (row.task.depth > hideBelow) continue;
        hideBelow = null;
      }
      visible.push(row);
      if (row.parent && collapsed.has(row.task.id)) hideBelow = row.task.depth;
    }
    return { rows, byId, visible, linkRows };
  }, [schedule, pending, collapsed, holidays, team]);

  // The Gantt beside the cells: whole weeks from the plan's first Monday, narrower days for a longer plan.
  const timeline = useMemo(() => {
    let first: string | null = null,
      last: string | null = null;
    for (const row of model.rows) {
      if (row.start && (!first || row.start < first)) first = row.start;
      if (row.finish && (!last || row.finish > last)) last = row.finish;
    }
    const from = mondayOn(first ? shiftDay(first, -2) : today);
    const until = last && last > today ? last : today;
    const weeks = Math.min(80, Math.max(6, Math.ceil((spanDays(from, until) + 10) / 7)));
    const width = weeks <= 12 ? 16 : weeks <= 26 ? 10 : weeks <= 52 ? 6 : 4;
    const x = (iso: string) => spanDays(from, iso) - 1;
    const stripes = [...holidays]
      .filter((day) => day >= from && x(day) < weeks * 7)
      .map((day) => {
        const left = x(day) * width;
        return `linear-gradient(90deg, transparent ${left}px, var(--sheet-hol) ${left}px, var(--sheet-hol) ${left + width}px, transparent ${left + width}px)`;
      });
    return { from, weeks, width, x, todayX: x(today), stripes: stripes.join(", ") };
  }, [model.rows, today, holidays]);
  const weekLabel = useMemo(() => new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "short", timeZone: "UTC" }), []);

  // Everything the save queue and the native listeners read runs through this, so they always see the latest render.
  const live = useRef({ schedule, model, t, notify, onReload, ensureMembers, today, holidays, canPlan });
  useLayoutEffect(() => {
    live.current = { schedule, model, t, notify, onReload, ensureMembers, today, holidays, canPlan };
  });
  // The newest plan this view has seen, from the props or its own reads, and the versions its own saves handed back.
  const latest = useRef(schedule);
  useLayoutEffect(() => {
    if (schedule.projectId !== latest.current.projectId || !newer(latest.current.scheduleVersion, schedule.scheduleVersion)) latest.current = schedule;
  }, [schedule]);
  const versions = useRef({ schedule: null as string | null, rows: new Map<number, string>() });
  const saved = useRef(new Map<number, Patch>());
  const queue = useRef<Job[]>([]);
  const running = useRef(false);
  const stale = useRef(false);
  const seq = useRef(0);
  const doneSeq = useRef(0);
  const undo = useRef<{ taskId: number; patch: Patch }[]>([]);
  const draftKey = useRef(0);
  const table = useRef<HTMLTableElement | null>(null);
  const editRef = useRef<Editing | null>(null);

  const say = useCallback((text: string, error = false) => setNote({ text, error }), []);
  const dropPending = useCallback((test: (entry: { seq: number }) => boolean) => {
    setPending((current) => (current.some(test) ? current.filter((entry) => !test(entry)) : current));
    setGhosts((current) => (current.some(test) ? current.filter((entry) => !test(entry)) : current));
  }, []);

  /** Reads the plan again between saves; edits already saved leave the screen's overlay once the plan shows them. */
  const refresh = useCallback(async () => {
    const upTo = doneSeq.current;
    const loaded = await live.current.onReload().catch(() => null);
    if (loaded && loaded.projectId === latest.current.projectId && !newer(latest.current.scheduleVersion, loaded.scheduleVersion)) latest.current = loaded;
    saved.current.clear();
    stale.current = false;
    dropPending((entry) => entry.seq <= upTo);
  }, [dropPending]);

  const run = useCallback(async (job: Job) => {
    const plan = latest.current,
      scheduleVersion = newest(plan.scheduleVersion, versions.current.schedule);
    const remember = (id: number, result: { rowVersion?: string; scheduleVersion?: string | null }) => {
      if (result.rowVersion) versions.current.rows.set(id, newest(versions.current.rows.get(id), result.rowVersion)!);
      if (result.scheduleVersion) versions.current.schedule = newest(versions.current.schedule, result.scheduleVersion);
    };
    if (job.type === "create") {
      const { fields, kind } = job;
      if (kind === "task" && live.current.canPlan && fields.picUserIds.length) await live.current.ensureMembers(fields.picUserIds);
      const created = await apiRequest<{ id: number; rowVersion: string; scheduleVersion: string }>(`/api/v1/projects/${plan.projectId}/schedule/tasks`, {
        method: "POST",
        body: JSON.stringify({
          scheduleVersion,
          parentId: job.parentId,
          beforeId: job.beforeId,
          sortOrder: 0,
          kind,
          name: fields.name,
          isMilestone: false,
          visibility: kind === "phase" ? "Customer" : "Internal",
          planStart: fields.planStart,
          planDays: fields.planDays,
          startMode: fields.startMode,
          predecessorId: fields.predecessorId,
          lagDays: fields.lagDays,
          picUserIds: kind === "phase" ? [] : fields.picUserIds,
          picExternal: kind === "phase" ? "" : fields.picExternal,
          planManDays: 0,
          ...(kind === "phase" || !fields.discipline ? {} : { discipline: fields.discipline }),
        }),
      });
      remember(created.id, created);
      // Rows after it were renumbered, so their versions moved: the plan is read again before one of them is saved.
      if (job.beforeId !== null || job.percent) stale.current = true;
      if (job.percent) queue.current.unshift({ seq: ++seq.current, type: "progress", taskId: created.id, percent: job.percent });
      return;
    }
    const task = flatById(plan).get(job.taskId);
    if (!task) return;
    const rowVersion = newest(task.rowVersion, versions.current.rows.get(task.id));
    if (job.type === "progress") {
      const patch = percentChangePatch(task, job.percent, live.current.today);
      if (!patch) return;
      const result = await apiRequest<{ rowVersion: string; scheduleVersion: string }>(`/api/v1/schedule/tasks/${task.id}/updates`, {
        method: "POST",
        body: JSON.stringify({
          scheduleVersion,
          rowVersion,
          percentComplete: Number(task.percentComplete),
          status: task.status,
          actualStart: task.actualStart,
          actualFinish: task.actualFinish,
          forecastFinish: task.forecastFinish,
          remark: task.remark ?? "",
          ...patch,
        }),
      });
      remember(task.id, result);
      return;
    }
    const fields = { ...fieldsOf(task), ...saved.current.get(task.id), ...job.patch };
    if (live.current.canPlan && job.patch.picUserIds?.length) await live.current.ensureMembers(job.patch.picUserIds);
    const result = await apiRequest<{ rowVersion: string; scheduleVersion: string }>(`/api/v1/schedule/tasks/${task.id}`, {
      method: "PUT",
      body: JSON.stringify({
        scheduleVersion,
        rowVersion,
        parentId: task.parentId,
        sortOrder: task.sortOrder,
        kind: task.kind,
        name: fields.name,
        isMilestone: task.isMilestone,
        visibility: task.visibility,
        planStart: fields.planStart,
        planDays: fields.planDays,
        startMode: fields.startMode,
        predecessorId: fields.predecessorId,
        lagDays: fields.lagDays,
        picUserIds: fields.picUserIds,
        picExternal: fields.picExternal,
        planManDays: Number(task.planManDays) || 0,
        ...(task.kind === "phase" ? {} : { discipline: fields.discipline }),
      }),
    });
    remember(task.id, result);
    saved.current.set(task.id, { ...saved.current.get(task.id), ...job.patch });
  }, []);

  /** Runs the queued saves one by one; the plan is read again whenever the queue runs dry. */
  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    let wrote = false;
    try {
      while (queue.current.length) {
        const job = queue.current.shift()!;
        if (job.type !== "create" && stale.current) await refresh();
        try {
          await run(job);
          doneSeq.current = Math.max(doneSeq.current, job.seq);
          wrote = true;
        } catch (failure) {
          const { t: translate, notify: tell, schedule: plan } = live.current;
          const label = job.type === "create" ? job.fields.name : (flatById(latest.current).get(job.taskId)?.wbs ?? "");
          if (isConflict(failure) && !job.retried) {
            // Someone else saved this plan meanwhile: read it again and put this one edit on top of what they saved.
            await refresh();
            queue.current.unshift({ ...job, retried: true });
            continue;
          }
          dropPending((entry) => entry.seq === job.seq);
          if (isConflict(failure)) {
            tell(`${plan.projectNo} · ${label} ${translate("Plan.changedReloaded")}`);
            stale.current = true;
          } else {
            say(`${label} · ${translate("Plan.saveFailed")}: ${translate(failureText(failure))}`, true);
            tell(`${plan.projectNo} · ${label} ${translate("Plan.saveFailed")}`);
          }
        }
        if (!queue.current.length && (wrote || stale.current)) {
          await refresh();
          wrote = false;
        }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
    setSavedOnce(true);
  }, [refresh, run, dropPending, say]);

  const enqueue = useCallback(
    (job: JobInput) => {
      const entry = { ...job, seq: ++seq.current } as Job;
      queue.current.push(entry);
      void drain();
      return entry.seq;
    },
    [drain],
  );

  const startOf = (row: Row, fields: Fields): string | null => {
    if (row.parent) return row.start;
    if (fields.startMode !== "linked") return fields.planStart;
    const before = fields.predecessorId === null ? null : model.byId.get(fields.predecessorId);
    return linkedStart(before?.finish ?? null, fields.lagDays, holidays) ?? row.start;
  };
  /** The row just above in the sheet that has a finish: what +N in START counts from. */
  const finishAbove = (row: Row): string | null => {
    const at = model.rows.indexOf(row);
    for (let index = at - 1; index >= 0; index--) if (model.rows[index]!.finish) return model.rows[index]!.finish;
    return null;
  };
  const lockOf = (row: Row, column: Column): string => {
    const { task } = row;
    if (column === "work" || column === "status") return "Sheet.calculated";
    if (column === "done") {
      if (task.kind === "phase" || row.parent) return "Sheet.headingNoProgress";
      return task.canProgress ? "" : "Sheet.progressRights";
    }
    if (task.id > 0) {
      if (!canPlan && !task.canEditOwn) return "Sheet.readOnly";
      if (task.managedByResourcePlan) return "Sheet.resourceRow";
      if (lockedIds.has(task.id)) return "Sheet.lockedRow";
    }
    if (task.kind === "phase" && (column === "pic" || column === "after" || column === "member" || column === "discipline")) return "Sheet.headingRow";
    if (row.parent && (column === "start" || column === "end" || column === "days" || column === "after")) return "Sheet.rollupDates";
    if (column === "member" && task.kind === "detail") return "Sheet.detailMember";
    if (column === "member" && task.pics.length > 1) return "Sheet.manyMembers";
    if (column === "days" && task.isMilestone) return "Sheet.milestoneDay";
    return "";
  };
  const memberFor = (text: string, own: readonly { id: number; name: string }[]): number | null | undefined => {
    const value = text.trim().toLowerCase();
    if (!value) return null;
    const mine = own.find((pic) => String(pic.id) === value || pic.name.toLowerCase() === value);
    if (mine) return mine.id;
    const found =
      team.find((person) => String(person.id) === value || person.name.toLowerCase() === value || (person.email ?? "").toLowerCase() === value) ??
      team.find((person) => person.name.toLowerCase().startsWith(value));
    return found ? found.id : undefined;
  };
  const disciplineFor = (text: string): string | null | undefined => {
    const value = text.trim();
    if (!value) return null;
    const lower = value.toLowerCase();
    return DISCIPLINES.find((code) => code.toLowerCase() === lower || t(`Discipline.${code}`).toLowerCase() === lower) ?? DISCIPLINE_SHORT[value.toUpperCase()];
  };
  /** What one typed cell changes on its row; `fields` already holds the cells typed before it on the same row. */
  const cellResult = (row: Row, column: Column, raw: string, fields: Fields): Result => {
    const text = raw.trim(),
      { task } = row;
    switch (column) {
      case "name":
        return text ? { patch: { name: text.slice(0, 500) } } : { error: "Sheet.needsName" };
      case "pic":
        return { patch: { picExternal: text.slice(0, 300) } };
      case "start":
      case "end": {
        const start = startOf(row, fields);
        const date = column === "start" ? parseSheetDate(text, today, finishAbove(row)) : parseSheetDate(text, start ?? today, start);
        if (date === "") return task.kind === "phase" ? { patch: { planStart: null, planDays: 1 } } : { error: "Sheet.badDate" };
        if (date === null) return { error: "Sheet.badDate" };
        if (column === "end" && start && !task.isMilestone) return date < start ? { error: "Sheet.endBeforeStart" } : { patch: { planDays: spanDays(start, date) } };
        const patch: Patch = { planStart: date, ...(task.isMilestone || !start ? { planDays: 1 } : {}) };
        if (fields.startMode === "linked") {
          const before = model.linkRows.find((candidate) => candidate.id === fields.predecessorId);
          return { patch: { ...patch, startMode: "manual", predecessorId: null, lagDays: 0 }, notice: t("Sheet.unlinked").replace("{wbs}", before?.wbs ?? "") };
        }
        return { patch };
      }
      case "days": {
        if (!startOf(row, fields)) return { error: "Sheet.startFirst" };
        const days = parseDays(text);
        return days === null ? { error: "Sheet.badDays" } : { patch: { planDays: days } };
      }
      case "done": {
        const percent = text === "" ? 0 : parsePercent(text);
        return percent === null ? { error: "Sheet.badPercent" } : { percent };
      }
      case "after": {
        const self: SheetLinkRow = { id: task.id, parentId: task.parentId, wbs: task.wbs, kind: task.kind, predecessorId: fields.predecessorId, startMode: fields.startMode };
        const link = parseLink(text, self, model.linkRows);
        if ("error" in link) return link;
        if (link.predecessorId === null) return { patch: { startMode: "manual", predecessorId: null, lagDays: 0, planStart: startOf(row, fields) ?? today } };
        const before = model.byId.get(link.predecessorId)?.finish ?? null;
        return { patch: { startMode: "linked", predecessorId: link.predecessorId, lagDays: before ? workingLagToCalendar(before, link.lagDays, holidays) : link.lagDays } };
      }
      case "member": {
        const id = memberFor(text, task.pics);
        return id === undefined ? { error: "Sheet.memberUnknown" } : { patch: { picUserIds: id === null ? [] : [id] } };
      }
      case "discipline": {
        const code = disciplineFor(text);
        return code === undefined ? { error: "Sheet.disciplineUnknown" } : { patch: { discipline: code } };
      }
      default:
        return { error: "Sheet.calculated" };
    }
  };
  /** Queues what a row's typed cells change, shows it at once, and keeps the old values for Ctrl+Z. */
  const apply = (row: Row, patch: Patch | undefined, percent: number | undefined, keepUndo = true) => {
    const change = patch ? changed(row.fields, patch) : null;
    if (change) {
      if (keepUndo) {
        undo.current = [...undo.current.slice(1 - UNDO_LIMIT), { taskId: row.task.id, patch: pick(row.fields, Object.keys(change) as (keyof Fields)[]) }];
        setUndoCount(undo.current.length);
      }
      const id = enqueue({ type: "plan", taskId: row.task.id, patch: change });
      setPending((current) => [...current, { seq: id, taskId: row.task.id, patch: change }]);
    }
    if (percent !== undefined && percent !== row.percent) {
      const id = enqueue({ type: "progress", taskId: row.task.id, percent });
      setPending((current) => [...current, { seq: id, taskId: row.task.id, percent }]);
    }
    return Boolean(change) || (percent !== undefined && percent !== row.percent);
  };
  const commit = (row: Row, column: Column, text: string) => {
    const lock = lockOf(row, column);
    if (lock) return say(t(lock), true);
    const result = cellResult(row, column, text, row.fields);
    if ("error" in result) return say(t(result.error).replace("{wbs}", result.wbs ?? ""), true);
    if (apply(row, result.patch, result.percent)) setNote(result.notice ? { text: result.notice, error: false } : null);
  };

  const cellText = (row: Row, column: Column): string => {
    switch (column) {
      case "name":
        return row.fields.name;
      case "pic":
        return row.task.kind === "phase" ? "" : row.fields.picExternal;
      case "start":
        return cellDate(row.start);
      case "end":
        return cellDate(row.finish);
      case "days":
        return row.days === null ? "" : String(row.days);
      case "done":
        return row.task.kind === "phase" && !row.start ? "" : `${Math.round(row.percent)}%`;
      case "work":
        return row.workDays === null ? "" : String(row.workDays);
      case "after":
        return row.after;
      case "member":
        return row.member;
      case "discipline":
        return row.fields.discipline ? t(`Discipline.${row.fields.discipline}`) : "";
      case "status":
        return row.task.kind === "phase" ? "" : t(STATUS_LABEL[row.task.status] ?? row.task.status);
    }
  };

  // Moving around: the active cell, and the corner a Shift-move or Shift-click runs the selection from.
  const indexOf = (cell: Cell | null) => (cell ? model.visible.findIndex((row) => row.task.id === cell.id) : -1);
  const activeIndex = indexOf(active);
  const activeRow = activeIndex >= 0 ? model.visible[activeIndex]! : null;
  const area = (() => {
    const from = indexOf(anchor),
      to = activeIndex;
    if (!active || to < 0) return null;
    const start = from >= 0 ? from : to,
      startColumn = from >= 0 && anchor ? anchor.col : active.col;
    return { r0: Math.min(start, to), r1: Math.max(start, to), c0: Math.min(startColumn, active.col), c1: Math.max(startColumn, active.col) };
  })();
  const focusTable = () => table.current?.focus({ preventScroll: true });
  const moveBy = (down: number, across: number, extend: boolean) => {
    const rows = model.visible,
      { active: from, anchor: corner } = cursor.current;
    if (!rows.length) return;
    const at = indexOf(from);
    const index = at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + down));
    const next = { id: rows[index]!.task.id, col: Math.max(0, Math.min(LAST_COLUMN, (from?.col ?? 0) + across)) };
    place(next, extend ? (corner ?? from ?? next) : next);
  };
  const startEdit = (row: Row, col: number, typed: string | null) => {
    const column = COLUMNS[col]!.key,
      lock = lockOf(row, column);
    if (lock) return say(t(lock), column !== "work" && column !== "status");
    const initial =
      column === "member"
        ? String(row.fields.picUserIds[0] ?? "")
        : column === "discipline"
          ? (row.fields.discipline ?? "")
          : column === "done"
            ? String(Math.round(row.percent))
            : cellText(row, column);
    const next = { id: row.task.id, col, initial, typed };
    editRef.current = next;
    setEditing(next);
  };
  /** Leaves the cell being typed: `value` null throws the typing away; then the selection moves as Enter or Tab asks. */
  const finishEdit = (value: string | null, down: number, across: number) => {
    const current = editRef.current;
    if (!current) return;
    editRef.current = null;
    setEditing(null);
    const row = model.byId.get(current.id),
      column = COLUMNS[current.col]!;
    if (row && value !== null && value !== current.initial) commit(row, column.key, value);
    if (down || across) moveBy(down, across, false);
    focusTable();
  };
  const focusEditor = useCallback((node: HTMLInputElement | HTMLSelectElement | null) => {
    if (!node || node === document.activeElement) return;
    node.focus({ preventScroll: true });
    if (node instanceof HTMLInputElement) {
      if (editRef.current?.typed !== null && editRef.current?.typed !== undefined) node.setSelectionRange(node.value.length, node.value.length);
      else node.select();
    }
  }, []);

  const undoLast = () => {
    const last = undo.current.at(-1),
      row = last ? model.byId.get(last.taskId) : undefined;
    undo.current = undo.current.slice(0, -1);
    setUndoCount(undo.current.length);
    if (!last || !row) return say(t("Sheet.undoNothing"));
    if (apply(row, last.patch, undefined, false)) say(`${row.task.wbs} · ${t("Sheet.undone")}`);
    else undoLast();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTableElement>) => {
    if (event.target !== event.currentTarget) return;
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const arrow = arrows[event.key],
      control = event.ctrlKey || event.metaKey;
    if (control && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoLast();
      return;
    }
    if (arrow) {
      event.preventDefault();
      moveBy(arrow[0], arrow[1], event.shiftKey);
    } else if (event.key === "Tab") {
      if ((event.shiftKey && (active?.col ?? 0) === 0) || (!event.shiftKey && (active?.col ?? 0) === LAST_COLUMN)) return;
      event.preventDefault();
      moveBy(0, event.shiftKey ? -1 : 1, false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      moveBy(event.shiftKey ? -1 : 1, 0, false);
    } else if (event.key === "F2" && activeRow && active) {
      event.preventDefault();
      startEdit(activeRow, active.col, null);
    } else if (event.key === "Escape") {
      if (active) place(active, active);
    } else if ((event.key === "Delete" || event.key === "Backspace") && activeRow && active) {
      event.preventDefault();
      const column = COLUMNS[active.col]!.key,
        lock = lockOf(activeRow, column);
      if (lock) say(t(lock), column !== "work" && column !== "status");
      else if (cellText(activeRow, column) !== "") commit(activeRow, column, "");
    } else if (event.key.length === 1 && !control && !event.altKey && activeRow && active) {
      event.preventDefault();
      startEdit(activeRow, active.col, COLUMNS[active.col]!.select ? null : event.key);
    }
  };
  const onCopy = (event: React.ClipboardEvent<HTMLTableElement>) => {
    if (event.target !== event.currentTarget || !area) return;
    event.preventDefault();
    const lines: string[] = [];
    for (let index = area.r0; index <= area.r1; index++) {
      const row = model.visible[index]!;
      lines.push(
        COLUMNS.slice(area.c0, area.c1 + 1)
          .map((column) => cellText(row, column.key).replace(/[\t\n]/g, " "))
          .join("\t"),
      );
    }
    event.clipboardData.setData("text/plain", lines.join("\n"));
    say(t("Sheet.copied"));
  };
  /** A block copied from Excel: cells land from the active cell; lines past the last row become new rows. */
  const onPaste = (event: React.ClipboardEvent<HTMLTableElement>) => {
    if (event.target !== event.currentTarget || !activeRow || !active) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const lines = text
      .replace(/\r/g, "")
      .replace(/\n+$/, "")
      .split("\n")
      .map((line) => line.split("\t"));
    const problems: string[] = [];
    let cells = 0,
      lastRow = activeRow;
    const typeLine = (row: Row, line: string[]) => {
      let fields = row.fields,
        patch: Patch | undefined,
        percent: number | undefined;
      line.forEach((value, across) => {
        const column = COLUMNS[active.col + across]?.key;
        if (!column || column === "work" || column === "status") return;
        const lock = lockOf(row, column);
        if (lock) {
          if (value.trim() && value.trim() !== cellText(row, column)) problems.push(`${row.task.wbs || row.fields.name} ${t(COLUMNS[active.col + across]!.label)}: ${t(lock)}`);
          return;
        }
        if (value.trim() === cellText(row, column)) return;
        const result = cellResult(row, column, value, fields);
        if ("error" in result) {
          problems.push(`${row.task.wbs || row.fields.name} ${t(COLUMNS[active.col + across]!.label)}: ${t(result.error).replace("{wbs}", result.wbs ?? "")}`);
          return;
        }
        if (result.percent !== undefined) percent = result.percent;
        if (result.patch) {
          patch = { ...patch, ...result.patch };
          fields = { ...fields, ...result.patch };
        }
        cells += 1;
      });
      return { fields, patch, percent };
    };
    const extra: string[][] = [];
    lines.forEach((line, down) => {
      const row = model.visible[activeIndex + down];
      if (!row) return extra.push(line);
      lastRow = row;
      const typed = typeLine(row, line);
      apply(row, typed.patch, typed.percent);
    });
    if (extra.length) {
      // New rows go under the last heading pasted into, or just after the last row pasted into, at its level.
      const parentId = lastRow.task.kind === "phase" ? lastRow.task.id : lastRow.task.parentId;
      const parent = parentId === null ? null : (model.byId.get(parentId) ?? null);
      if (active.col !== 0) problems.push(t("Sheet.pasteNoName"));
      else if (!canPlan && !parent?.task.canAddChild) problems.push(t("Sheet.readOnly"));
      else {
        const siblings = parent ? parent.task.children : schedule.tasks;
        const beforeId = lastRow.task.kind === "phase" ? null : (siblings[siblings.findIndex((task) => task.id === lastRow.task.id) + 1]?.id ?? null);
        const kind = parentId === null ? "phase" : "task";
        let start = kind === "phase" ? null : lastRow.finish ? nextWorkDay(shiftDay(lastRow.finish, 1), holidays) : today;
        extra.forEach((line, index) => {
          const name = (line[0] ?? "").trim();
          if (!name) return;
          const base: Fields = { name, picExternal: "", planStart: start, planDays: 1, startMode: "manual", predecessorId: null, lagDays: 0, picUserIds: [], discipline: null };
          const task = {
            ...lastRow.task,
            id: -1 - index,
            parentId,
            kind,
            depth: (parent?.task.depth ?? 0) + 1,
            wbs: "",
            pics: [],
            children: [],
            isMilestone: false,
            managedByResourcePlan: false,
            canEditOwn: true,
            canProgress: true,
            storedPlanStart: start,
            planStart: start,
            planFinish: start,
            planDays: 1,
            startMode: "manual",
            predecessorId: null,
            lagDays: 0,
            picExternal: "",
            discipline: null,
            name,
          } as ScheduleTask;
          const typed = typeLine({ task, fields: base, parent: false, start, finish: start, days: start ? 1 : null, workDays: null, percent: 0, after: "", member: "" }, line);
          const fields = { ...base, ...typed.patch };
          const id = enqueue({ type: "create", parentId, beforeId, kind, fields, ...(typed.percent ? { percent: typed.percent } : {}) });
          setGhosts((current) => [...current, { seq: id, parentId, beforeId, name }]);
          const finish = fields.planStart ? shiftDay(fields.planStart, fields.planDays - 1) : null;
          if (finish) start = nextWorkDay(shiftDay(finish, 1), holidays);
          cells += 1;
        });
      }
    }
    say(`${t("Sheet.pasted").replace("{count}", String(cells))}${problems.length ? ` · ${problems.slice(0, 4).join(" · ")}${problems.length > 4 ? " …" : ""}` : ""}`, problems.length > 0);
  };

  const editHandler = useRef<(cell: Cell) => void>(() => undefined);
  useLayoutEffect(() => {
    editHandler.current = (cell: Cell) => {
      const row = model.byId.get(cell.id);
      if (row) startEdit(row, cell.col, null);
    };
  });
  // The mouse: press on a cell to select it, Shift-click to run a selection to it, double-click to type in it.
  useEffect(() => {
    const frame = table.current;
    if (!frame) return;
    const cellOf = (target: EventTarget | null): Cell | null => {
      if (!(target instanceof Element) || target.closest("input,select,button,a")) return null;
      const cell = target.closest<HTMLElement>("td[data-c]"),
        line = cell?.closest<HTMLElement>("tr[data-id]");
      return cell && line ? { id: Number(line.dataset.id), col: Number(cell.dataset.c) } : null;
    };
    const down = (event: MouseEvent) => {
      const cell = event.button === 0 ? cellOf(event.target) : null;
      if (!cell) return;
      event.preventDefault();
      frame.focus({ preventScroll: true });
      place(cell, event.shiftKey ? (cursor.current.anchor ?? cursor.current.active ?? cell) : cell);
    };
    const double = (event: MouseEvent) => {
      const cell = cellOf(event.target);
      if (cell) editHandler.current(cell);
    };
    frame.addEventListener("mousedown", down);
    frame.addEventListener("dblclick", double);
    return () => {
      frame.removeEventListener("mousedown", down);
      frame.removeEventListener("dblclick", double);
    };
  }, [place]);
  // Keeps the active cell in view as the keyboard moves it.
  useEffect(() => {
    if (!active) return;
    table.current?.querySelector(`tr[data-id="${active.id}"] td[data-c="${active.col}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  // Adding rows: the + on a row, or the buttons above. A heading takes a task at its end; a task, a row just below it.
  const placeFor = (row: Row | null, sub: boolean): Omit<Draft, "key" | "start"> | null => {
    if (!row) {
      const lastHeading = [...schedule.tasks].reverse().find((task) => task.kind === "phase");
      return lastHeading ? { parentId: lastHeading.id, beforeId: null, kind: "task" } : canPlan ? { parentId: null, beforeId: null, kind: "phase" } : null;
    }
    if (sub)
      return row.task.kind === "task" && canAddSub(row.task) && !lockedIds.has(row.task.id) && (canPlan || row.task.canAddChild) ? { parentId: row.task.id, beforeId: null, kind: "task" } : null;
    if (row.task.kind === "phase") return canPlan || row.task.canAddChild ? { parentId: row.task.id, beforeId: null, kind: "task" } : null;
    if (row.task.kind === "detail") return null;
    const parent = row.task.parentId === null ? null : (model.byId.get(row.task.parentId) ?? null);
    if (parent && (lockedIds.has(parent.task.id) || (!canPlan && !parent.task.canAddChild))) return null;
    if (!parent && !canPlan) return null;
    const siblings = parent ? parent.task.children : schedule.tasks;
    return { parentId: row.task.parentId, beforeId: siblings[siblings.findIndex((task) => task.id === row.task.id) + 1]?.id ?? null, kind: row.task.parentId === null ? "phase" : "task" };
  };
  const draftStart = (place: Omit<Draft, "key" | "start">): string | null => {
    if (place.kind === "phase") return null;
    const parent = place.parentId === null ? null : model.byId.get(place.parentId);
    const above = (() => {
      if (place.beforeId !== null) {
        const at = model.rows.findIndex((row) => row.task.id === place.beforeId);
        return at > 0 ? model.rows[at - 1]! : null;
      }
      const at = parent ? model.rows.indexOf(parent) : -1;
      let end = at;
      while (parent && end + 1 < model.rows.length && model.rows[end + 1]!.task.depth > parent.task.depth) end++;
      return end >= 0 ? model.rows[end]! : null;
    })();
    if (!above || above === parent) return parent?.start ?? today;
    return above.finish ? nextWorkDay(shiftDay(above.finish, 1), holidays) : today;
  };
  const openDraft = (place: Omit<Draft, "key" | "start"> | null) => {
    if (!place) return say(t("Sheet.subNotHere"), true);
    if (place.parentId !== null && collapsed.has(place.parentId)) setCollapsed((current) => new Set([...current].filter((id) => id !== place.parentId)));
    draftKey.current = ++seq.current;
    setDraft({ ...place, key: draftKey.current, start: draftStart(place) });
  };
  const closeDraft = () => {
    draftKey.current = 0;
    setDraft(null);
    focusTable();
  };
  const submitDraft = (key: number, value: string, keepOpen: boolean) => {
    const current = draft,
      name = value.trim().slice(0, 500);
    if (!current || key !== draftKey.current) return;
    if (!name) {
      draftKey.current = 0;
      setDraft(null);
      focusTable();
      return;
    }
    const fields: Fields = { name, picExternal: "", planStart: current.start, planDays: 1, startMode: "manual", predecessorId: null, lagDays: 0, picUserIds: [], discipline: null };
    const id = enqueue({ type: "create", parentId: current.parentId, beforeId: current.beforeId, kind: current.kind, fields });
    setGhosts((list) => [...list, { seq: id, parentId: current.parentId, beforeId: current.beforeId, name }]);
    if (keepOpen) {
      draftKey.current = ++seq.current;
      setDraft({ ...current, key: draftKey.current, start: current.start ? nextWorkDay(shiftDay(current.start, 1), holidays) : null });
    } else closeDraft();
  };
  const toggle = (id: number) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Where the typing row and the rows still saving sit: before the row they go before, else after their parent's rows.
  const placeAt = (parentId: number | null, beforeId: number | null) => {
    const rows = model.visible;
    if (beforeId !== null) {
      const at = rows.findIndex((row) => row.task.id === beforeId);
      if (at >= 0) return at;
    }
    if (parentId === null) return rows.length;
    const at = rows.findIndex((row) => row.task.id === parentId);
    if (at < 0) return -1;
    let end = at + 1;
    while (end < rows.length && rows[end]!.task.depth > rows[at]!.task.depth) end++;
    return end;
  };
  const extras = new Map<number, React.ReactNode[]>();
  const addExtra = (at: number, node: React.ReactNode) => {
    if (at >= 0) extras.set(at, [...(extras.get(at) ?? []), node]);
  };
  for (const ghost of ghosts) {
    const parent = ghost.parentId === null ? null : model.byId.get(ghost.parentId);
    addExtra(
      placeAt(ghost.parentId, ghost.beforeId),
      <tr key={`ghost-${ghost.seq}`} className="sh-ghost">
        <td className="sh-gut" />
        <td className="sh-wbs" />
        <td className="sh-c sh-name">
          <span className="sh-label" style={{ paddingLeft: (parent?.task.depth ?? 0) * 14 }}>
            {ghost.name}
          </span>
        </td>
        <td className="sh-c sh-wait" colSpan={COLUMNS.length - 1}>
          <span className="spinner" />
          {t("Sheet.saving")}
        </td>
        <td className="sh-tl" />
      </tr>,
    );
  }
  if (draft) {
    const parent = draft.parentId === null ? null : model.byId.get(draft.parentId);
    addExtra(
      placeAt(draft.parentId, draft.beforeId),
      <tr key={`draft-${draft.key}`} className="sh-draft">
        <td className="sh-gut" />
        <td className="sh-wbs">
          <Icon name="plus" />
        </td>
        <td className="sh-c sh-name">
          <input
            key={draft.key}
            ref={focusEditor}
            className="sh-input"
            maxLength={500}
            placeholder={t(draft.kind === "phase" ? "Plan.addHeading" : "Sheet.newName")}
            aria-label={t("Sheet.newName")}
            style={{ marginLeft: (parent?.task.depth ?? 0) * 14 }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                submitDraft(draft.key, event.currentTarget.value, true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                closeDraft();
              }
            }}
            onBlur={(event) => submitDraft(draft.key, event.currentTarget.value, false)}
          />
        </td>
        <td className="sh-c sh-hint" colSpan={COLUMNS.length - 1}>
          {t("Sheet.newHint")}
        </td>
        <td className="sh-tl" />
      </tr>,
    );
  }

  const removal = activeRow && !busy ? removeFor(activeRow.task) : undefined;
  const addTaskPlace = placeFor(activeRow, false),
    addSubPlace = activeRow ? placeFor(activeRow, true) : null;
  const trackWidth = timeline.weeks * 7 * timeline.width;
  const tableStyle = { "--dw": `${timeline.width}px`, "--today-x": `${timeline.todayX * timeline.width}px`, "--sheet-stripes": timeline.stripes || "none" } as React.CSSProperties;
  const editor = (row: Row, col: number) => {
    const column = COLUMNS[col]!;
    const keys = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      event.stopPropagation();
      const value = event.currentTarget.value;
      if (event.key === "Enter") {
        event.preventDefault();
        finishEdit(value, event.shiftKey ? -1 : 1, 0);
      } else if (event.key === "Tab") {
        event.preventDefault();
        finishEdit(value, 0, event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finishEdit(null, 0, 0);
      } else if (!column.select && editing?.typed !== null && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        finishEdit(value, event.key === "ArrowUp" ? -1 : 1, 0);
      }
    };
    if (column.key === "member")
      return (
        <select
          ref={focusEditor}
          className="sh-input"
          defaultValue={editing?.initial ?? ""}
          aria-label={`${row.task.wbs} ${t(column.label)}`}
          onKeyDown={keys}
          onBlur={(event) => finishEdit(event.currentTarget.value, 0, 0)}
        >
          <option value="">{t("Sheet.noMember")}</option>
          {[...team, ...row.task.pics.filter((pic) => !team.some((person) => person.id === pic.id))]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
        </select>
      );
    if (column.key === "discipline")
      return (
        <select
          ref={focusEditor}
          className="sh-input"
          defaultValue={editing?.initial ?? ""}
          aria-label={`${row.task.wbs} ${t(column.label)}`}
          onKeyDown={keys}
          onBlur={(event) => finishEdit(event.currentTarget.value, 0, 0)}
        >
          <option value="">{t("Sheet.noDiscipline")}</option>
          {DISCIPLINES.map((code) => (
            <option key={code} value={code}>
              {t(`Discipline.${code}`)}
            </option>
          ))}
        </select>
      );
    return (
      <input
        ref={focusEditor}
        className="sh-input"
        defaultValue={editing?.typed ?? editing?.initial ?? ""}
        autoComplete="off"
        aria-label={`${row.task.wbs} ${t(column.label)}`}
        inputMode={column.key === "days" || column.key === "done" ? "numeric" : undefined}
        onKeyDown={keys}
        onBlur={(event) => finishEdit(event.currentTarget.value, 0, 0)}
      />
    );
  };

  const body: React.ReactNode[] = [];
  model.visible.forEach((row, index) => {
    body.push(...(extras.get(index) ?? []));
    const { task } = row,
      on = active?.id === task.id,
      inArea = area && index >= area.r0 && index <= area.r1;
    const plus = placeFor(row, false),
      late = task.kind !== "phase" && task.status !== "Done" && row.finish !== null && row.finish < today;
    const barLeft = row.start ? timeline.x(row.start) * timeline.width : 0,
      barWidth = row.start && row.finish ? spanDays(row.start, row.finish) * timeline.width : 0;
    body.push(
      <tr key={task.id} data-id={task.id} className={`sh-row k-${task.kind}${row.parent ? " parent" : ""}${on ? " current" : ""}`}>
        <td className="sh-gut">
          {plus ? (
            <button
              type="button"
              className="sh-plus"
              title={t(task.kind === "phase" ? "Sheet.addUnder" : "Sheet.addBelow")}
              aria-label={`${t(task.kind === "phase" ? "Sheet.addUnder" : "Sheet.addBelow")} ${task.wbs}`}
              onClick={() => openDraft(plus)}
            >
              <Icon name="plus" />
            </button>
          ) : null}
        </td>
        <td className="sh-wbs">{task.wbs}</td>
        {COLUMNS.map((column, col) => {
          const selected = inArea && col >= area.c0 && col <= area.c1,
            current = on && active?.col === col;
          const locked = lockOf(row, column.key) !== "";
          const typing = editing && editing.id === task.id && editing.col === col;
          const text = cellText(row, column.key);
          return (
            <td
              key={column.key}
              data-c={col}
              aria-selected={Boolean(selected || current)}
              className={`sh-c ${column.className}${current ? " on" : ""}${selected && !current ? " sel" : ""}${locked ? " ro" : ""}${typing ? " typing" : ""}${column.key === "status" ? ` st-${task.status.replace(/\s+/g, "-").toLowerCase()}` : ""}${column.key === "end" && late ? " late" : ""}`}
            >
              {typing ? (
                editor(row, col)
              ) : column.key === "name" ? (
                <span className="sh-label" style={{ paddingLeft: Math.max(0, task.depth - 1) * 14 }}>
                  {row.parent ? (
                    <button
                      type="button"
                      className="sh-fold"
                      aria-expanded={!collapsed.has(task.id)}
                      aria-label={`${t(collapsed.has(task.id) ? "Sheet.unfold" : "Sheet.fold")} ${task.wbs}`}
                      onClick={() => toggle(task.id)}
                    >
                      <Icon name={collapsed.has(task.id) ? "chevronRight" : "chevronDown"} />
                    </button>
                  ) : (
                    <i className="sh-fold-gap" />
                  )}
                  <span className="sh-text">{text}</span>
                  <button type="button" className="sh-open" title={t("Sheet.openTask")} aria-label={`${t("Sheet.openTask")} ${task.wbs}`} onClick={() => onOpenTask(task.id)}>
                    <Icon name="externalLink" />
                  </button>
                </span>
              ) : (
                <span className="sh-text">{text}</span>
              )}
            </td>
          );
        })}
        <td className="sh-tl">
          <div className="sh-track" style={{ width: trackWidth }}>
            {row.start && row.finish ? (
              task.isMilestone ? (
                <i className="sh-ms" style={{ left: barLeft + timeline.width / 2 - 5 }} title={`${task.wbs} ${task.name}`} />
              ) : (
                <i
                  className={`sh-bar k-${task.kind}${row.parent ? " roll" : ""}${task.status === "Done" ? " done" : late ? " late" : ""}`}
                  style={{ left: barLeft, width: Math.max(2, barWidth) }}
                  title={`${task.wbs} ${task.name} · ${cellDate(row.start)} – ${cellDate(row.finish)}`}
                >
                  {row.percent > 0 && task.kind !== "phase" ? <b style={{ width: `${Math.min(100, row.percent)}%` }} /> : null}
                </i>
              )
            ) : null}
          </div>
        </td>
      </tr>,
    );
  });
  body.push(...(extras.get(model.visible.length) ?? []));

  const saving = busy || pending.length > 0 || ghosts.length > 0;
  return (
    <div className="plan-sheet" data-guide="plan.sheet">
      <div className="sh-bar-top">
        <div className="sh-actions" data-guide="plan.sheetAdd">
          {canPlan ? (
            <button type="button" className="btn ghost sm" onClick={() => openDraft({ parentId: null, beforeId: null, kind: "phase" })}>
              <Icon name="plus" />
              {t("Plan.addHeading")}
            </button>
          ) : null}
          <button type="button" className="btn ghost sm" disabled={!addTaskPlace} onClick={() => openDraft(addTaskPlace)}>
            <Icon name="plus" />
            {t("Sheet.addTask")}
          </button>
          <button type="button" className="btn ghost sm" disabled={!addSubPlace} title={t("Sheet.addSubTitle")} onClick={() => openDraft(addSubPlace)}>
            <Icon name="plus" />
            {t("Sheet.addSub")}
          </button>
          <button type="button" className="btn ghost sm" disabled={!removal} title={removal?.reason ?? t("Sheet.deleteSelected")} onClick={() => removal?.onRemove()}>
            <Icon name="trash" />
            {t("Plan.deleteRow")}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            disabled={!undoCount}
            onClick={() => {
              undoLast();
              focusTable();
            }}
          >
            <Icon name="refresh" />
            {t("Sheet.undo")}
          </button>
        </div>
        <span className={`sh-state${note?.error ? " error" : ""}`} role="status">
          {note ? (
            <>
              <span className="sh-note">{note.text}</span>
              <button type="button" className="sh-note-x" aria-label="×" onClick={() => setNote(null)}>
                <Icon name="x" />
              </button>
            </>
          ) : null}
          {saving ? (
            <>
              <span className="spinner" />
              {t("Sheet.saving")}
            </>
          ) : savedOnce ? (
            <em>
              <Icon name="check" />
              {t("Sheet.saved")}
            </em>
          ) : (
            <em>{t("Sheet.autoSave")}</em>
          )}
        </span>
      </div>
      <div className="sh-scroll">
        <table ref={table} className="sh-table" role="grid" tabIndex={0} aria-label={t("Sheet.label")} style={tableStyle} onKeyDown={onKeyDown} onCopy={onCopy} onPaste={onPaste}>
          <thead>
            <tr>
              <th className="sh-gut" scope="col" aria-label="+" />
              <th className="sh-wbs" scope="col">
                WBS
              </th>
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col" className={`sh-c ${column.className}`} title={column.hint ? t(column.hint) : undefined}>
                  {column.key === "after" ? <span data-guide="plan.sheetAfter">{t(column.label)}</span> : t(column.label)}
                  {column.hint ? <small>{t(column.hint)}</small> : null}
                </th>
              ))}
              <th className="sh-tl" scope="col">
                <div className="sh-weeks" style={{ width: trackWidth }}>
                  {Array.from({ length: timeline.weeks }, (_, week) => (
                    <span key={week} style={{ width: 7 * timeline.width }}>
                      {timeline.width >= 6 ? weekLabel.format(new Date(`${shiftDay(timeline.from, week * 7)}T00:00:00Z`)) : ""}
                    </span>
                  ))}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
      <p className="sh-keys">{t("Sheet.keys")}</p>
    </div>
  );
}
