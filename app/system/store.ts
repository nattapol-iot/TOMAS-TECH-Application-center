"use client";

/* ==========================================================================
   Schedule store

   My Work writes across projects and the schedule workspace reads the same
   rows, so this state cannot live inside one screen. One array, one write
   seam — every mutation goes through here, is stamped, and lands in the
   append-only update feed. These functions map one-to-one onto the API the
   back end will expose; resolveSchedule stays pure and runs server-side.
   ========================================================================== */

import { useSyncExternalStore } from "react";
import {
  SCHEDULE_BASELINES, SCHEDULE_TASKS, SCHEDULE_TEMPLATES, SCHEDULE_UPDATES,
  type ScheduleBaseline, type ScheduleTask, type ScheduleUpdate,
} from "./data";
import { addDays, endFromDays, nextWorkDay, TODAY_ISO } from "./calc";
import type { Session } from "./session";

export type ScheduleState = {
  tasks: ScheduleTask[];
  updates: ScheduleUpdate[];
  baselines: ScheduleBaseline[];
  version: number;
};

let state: ScheduleState = {
  tasks: SCHEDULE_TASKS,
  updates: SCHEDULE_UPDATES,
  baselines: SCHEDULE_BASELINES,
  version: 0,
};

const listeners = new Set<() => void>();

const emit = (next: Partial<ScheduleState>) => {
  state = { ...state, ...next, version: state.version + 1 };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useScheduleStore = (): ScheduleState =>
  useSyncExternalStore(subscribe, () => state, () => state);

/* ---- ids and log entries -------------------------------------------------- */

let taskSeq = 100;
const nextTaskId = () => {
  let id = `st${(taskSeq += 1)}`;
  while (state.tasks.some((task) => task.id === id)) id = `st${(taskSeq += 1)}`;
  return id;
};

let updateSeq = 100;
const nextUpdateId = () => `su${(updateSeq += 1)}`;

const stamp = (session: Session) => ({ updatedBy: session.user.id, updatedAt: TODAY_ISO });

const logEntry = (
  task: ScheduleTask, session: Session, field: ScheduleUpdate["field"],
  from: string, to: string, comment = "",
): ScheduleUpdate => ({
  id: nextUpdateId(), projectId: task.projectId, taskId: task.id,
  by: session.user.id, at: `${TODAY_ISO} 09:00`,
  field, from, to, comment, requestDays: 0, answer: "", answerBy: "", answerNote: "",
});

/* ---- writes --------------------------------------------------------------- */

const LOGGED_FIELDS: (keyof ScheduleTask)[] = ["percentDone", "status", "actualStart", "actualEnd", "forecastEnd", "note"];

export function patchTask(id: string, patch: Partial<ScheduleTask>, session: Session, comment = "") {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task) return;
  const entries: ScheduleUpdate[] = [];
  for (const field of LOGGED_FIELDS) {
    if (field in patch && patch[field] !== task[field]) {
      entries.push(logEntry(task, session, field as ScheduleUpdate["field"], String(task[field] ?? ""), String(patch[field] ?? ""), comment));
    }
  }
  const planChanged = ["planStart", "planDays", "predecessorId", "startMode", "lagDays"].some(
    (field) => field in patch && patch[field as keyof ScheduleTask] !== task[field as keyof ScheduleTask],
  );
  if (planChanged) entries.push(logEntry(task, session, "plan", `${task.planStart} +${task.planDays}d`, `${patch.planStart ?? task.planStart} +${patch.planDays ?? task.planDays}d`, comment));
  emit({
    tasks: state.tasks.map((entry) => (entry.id === id ? { ...entry, ...patch, ...stamp(session) } : entry)),
    updates: entries.length ? [...state.updates, ...entries] : state.updates,
  });
}

export function addTask(draft: Omit<ScheduleTask, "id">, session: Session): string {
  const id = nextTaskId();
  const task: ScheduleTask = { ...draft, id, ...stamp(session) };
  emit({
    tasks: [...state.tasks, task],
    updates: [...state.updates, logEntry(task, session, "created", "", task.name || "(new row)")],
  });
  return id;
}

export function removeTask(id: string, session: Session) {
  const doomed = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const task of state.tasks) {
      if (task.parentId && doomed.has(task.parentId) && !doomed.has(task.id)) {
        doomed.add(task.id);
        grew = true;
      }
    }
  }
  const root = state.tasks.find((entry) => entry.id === id);
  emit({
    tasks: state.tasks.filter((entry) => !doomed.has(entry.id)),
    updates: root ? [...state.updates, logEntry(root, session, "deleted", root.name, `${doomed.size} row(s)`)] : state.updates,
  });
}

/** A member asks for more days. Changes no date until the PM accepts. */
export function requestDays(taskId: string, days: number, comment: string, session: Session) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return;
  emit({
    updates: [...state.updates, {
      ...logEntry(task, session, "request", "", `+${days} days`, comment),
      requestDays: days,
    }],
  });
}

export function answerRequest(updateId: string, answer: "Accepted" | "Rejected", note: string, session: Session) {
  const request = state.updates.find((entry) => entry.id === updateId);
  if (!request) return;
  const updates = state.updates.map((entry) =>
    (entry.id === updateId ? { ...entry, answer, answerBy: session.user.id, answerNote: note } : entry));
  if (answer === "Accepted") {
    const task = state.tasks.find((entry) => entry.id === request.taskId);
    if (task) {
      emit({
        updates,
        tasks: state.tasks.map((entry) =>
          (entry.id === request.taskId
            ? { ...entry, planDays: entry.planDays + request.requestDays, ...stamp(session) }
            : entry)),
      });
      return;
    }
  }
  emit({ updates });
}

/** Freeze the plan as the promise: every current row becomes the baseline. */
export function freezeBaseline(projectId: string, label: string, reason: string, session: Session) {
  const rev = Math.max(0, ...state.baselines.filter((entry) => entry.projectId === projectId).map((entry) => entry.rev)) + 1;
  const mine = state.tasks.filter((entry) => entry.projectId === projectId);
  const finish = mine.map((entry) => endFromDays(entry.planStart || TODAY_ISO, entry.planDays)).sort().slice(-1)[0] ?? "";
  emit({
    tasks: state.tasks.map((entry) => (entry.projectId === projectId
      ? {
        ...entry,
        baselineStart: entry.planStart,
        baselineEnd: entry.planStart ? endFromDays(entry.planStart, entry.planDays) : "",
        baselineDays: entry.planDays,
        baselineRev: rev,
      }
      : entry)),
    baselines: [...state.baselines, {
      id: `sb-${projectId}-${rev}`, projectId, rev,
      label: label || `Rev ${rev}`,
      takenAt: TODAY_ISO, takenBy: session.user.id, reason,
      taskCount: mine.filter((entry) => entry.kind !== "phase").length,
      promisedFinish: finish,
    }],
    updates: [...state.updates, {
      id: nextUpdateId(), projectId, taskId: "",
      by: session.user.id, at: `${TODAY_ISO} 09:00`,
      field: "baseline", from: `Rev ${rev - 1}`, to: `Rev ${rev}`, comment: reason,
      requestDays: 0, answer: "", answerBy: "", answerNote: "",
    }],
  });
}

/** Create the standard phase/task tree on an empty plan. */
export function applyTemplate(projectId: string, templateId: string, from: string, session: Session) {
  const template = SCHEDULE_TEMPLATES.find((entry) => entry.id === templateId);
  if (!template) return;
  const created: ScheduleTask[] = [];
  const byPath = new Map<string, ScheduleTask>();
  let cursor = nextWorkDay(from);
  let prevSibling: ScheduleTask | undefined;

  for (const row of template.rows) {
    const isPhase = !row.path.includes(".");
    const parentPath = isPhase ? "" : row.path.slice(0, row.path.lastIndexOf("."));
    const parent = byPath.get(parentPath);
    const start = isPhase ? "" : cursor;
    const task: ScheduleTask = {
      id: nextTaskId(), projectId,
      parentId: parent?.id ?? "",
      order: created.filter((entry) => entry.parentId === (parent?.id ?? "")).length * 10 + 10,
      kind: isPhase ? "phase" : "task",
      name: row.name, milestone: row.milestone ?? false,
      origin: "PM", createdBy: session.user.id, visibility: row.visibility,
      planStart: start, planDays: Math.max(1, row.days),
      startMode: row.linkPrev && prevSibling && !isPhase ? "linked" : "manual",
      predecessorId: row.linkPrev && prevSibling && !isPhase ? prevSibling.id : "",
      lagDays: 0, picIds: [], picExternal: "", planManDays: 0,
      baselineStart: "", baselineEnd: "", baselineDays: 0, baselineRev: 0,
      actualStart: "", actualEnd: "", forecastEnd: "", percentDone: 0, status: "Not Started",
      blockedReason: "", note: "", actualManDays: 0,
      updatedBy: session.user.id, updatedAt: TODAY_ISO,
    };
    byPath.set(row.path, task);
    created.push(task);
    if (!isPhase) {
      if (!row.linkPrev) cursor = nextWorkDay(addDays(cursor, Math.max(1, Math.floor(row.days / 2))));
      prevSibling = task;
    } else {
      prevSibling = undefined;
    }
  }

  emit({
    tasks: [...state.tasks, ...created],
    updates: [...state.updates, {
      id: nextUpdateId(), projectId, taskId: "",
      by: session.user.id, at: `${TODAY_ISO} 09:00`,
      field: "created", from: "", to: `${template.name} (${created.length} rows)`, comment: "",
      requestDays: 0, answer: "", answerBy: "", answerNote: "",
    }],
  });
}
