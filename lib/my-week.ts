/* My Work > My week (owner decision 2026-11-23): the person's own calendar in the app, which replaces typing the week
   into Outlook. The API (backend-node/src/routes/work-blocks.ts, migration 124) keeps the blocks of time they book,
   writes them into Outlook and drafts each day's hours from them; these helpers only lay the week out on screen and
   check what the person picks before it goes back. */

import { addDays, type WorkDay, type WorkDaysData, type WorkRowKind } from "./work-days";

export type WeekBlock = {
  id: number;
  date: string;
  start: string;
  end: string;
  workKey: string | null;
  kind: WorkRowKind;
  projectId: number | null;
  projectNo: string | null;
  title: string;
  reference: string;
  outlookState: "Pending" | "Synced" | "Failed" | "Denied" | "Off";
  outlookError: string | null;
};
export type WeekMeeting = { id: number; subject: string | null; location: string | null; private: boolean; allDay: boolean; start: string; end: string; linkedWorkKey: string | null };
export type WeekTeamTask = {
  id: number;
  kind: "Appointment" | "Task" | "Away";
  title: string;
  projectNo: string | null;
  start: string;
  end: string;
  slot: string;
  startTime: string | null;
  endTime: string | null;
};
export type BacklogItem = {
  workKey: string;
  kind: WorkRowKind;
  reference: string;
  title: string;
  customer: string;
  projectNo: string | null;
  start: string | null;
  end: string | null;
  status: string;
  progress: number;
  budgetHours: number | null;
  confirmedHours: number;
  bookedHours: number;
};
export type OutlookWrite = { state: "ok" | "pending" | "denied" | "failed" | "off"; waiting: number };
export type WeekData = WorkDaysData & {
  blocks: WeekBlock[];
  meetings: WeekMeeting[];
  teamTasks: WeekTeamTask[];
  leave: { start: string; end: string }[];
  backlog: BacklogItem[];
  outlookWrite: OutlookWrite;
};

/** Company hours (team-calendar.ts WORKING_HOURS): a morning is 08:30-12:00, an afternoon 13:00-17:30. */
export const WORK_START = 8 * 60 + 30;
export const LUNCH_START = 12 * 60;
export const LUNCH_END = 13 * 60;
export const WORK_END = 17 * 60 + 30;
/** One row of the calendar grid, in minutes; a block moves in these steps. */
export const STEP = 15;

export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const timeText = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const hoursOf = (start: number, end: number) => (end - start) / 60;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** The times a block may start or end: every quarter hour of the day (24:00 only as an end). */
export const timeChoices = (asEnd: boolean) => Array.from({ length: 96 }, (_, index) => (index + (asEnd ? 1 : 0)) * STEP).map(timeText);

/** Something on the calendar: a booked block, a meeting, a team task or time away. */
export type CalendarItem = {
  key: string;
  type: "block" | "meeting" | "task" | "leave";
  start: number;
  end: number;
  allDay: boolean;
  block?: WeekBlock;
  meeting?: WeekMeeting;
  task?: WeekTeamTask;
};
const dateOf = (stamp: string) => stamp.slice(0, 10);

/** What a date holds: timed items in the grid, whole-day items above it. */
export function dayItems(date: string, data: Pick<WeekData, "blocks" | "meetings" | "teamTasks" | "leave">): { timed: CalendarItem[]; allDay: CalendarItem[] } {
  const timed: CalendarItem[] = [],
    allDay: CalendarItem[] = [];
  for (const block of data.blocks) if (block.date === date) timed.push({ key: `b${block.id}`, type: "block", start: minutesOf(block.start), end: minutesOf(block.end), allDay: false, block });
  for (const meeting of data.meetings) {
    const first = dateOf(meeting.start),
      last = meeting.allDay || meeting.end.slice(11, 16) === "00:00" ? dateOf(addDays(dateOf(meeting.end), -1)) : dateOf(meeting.end);
    if (date < first || date > (last < first ? first : last)) continue;
    if (meeting.allDay || first !== dateOf(meeting.end)) {
      allDay.push({ key: `m${meeting.id}`, type: "meeting", start: 0, end: 0, allDay: true, meeting });
      continue;
    }
    timed.push({ key: `m${meeting.id}`, type: "meeting", start: minutesOf(meeting.start.slice(11, 16)), end: minutesOf(meeting.end.slice(11, 16)), allDay: false, meeting });
  }
  for (const task of data.teamTasks) {
    if (date < task.start || date > task.end) continue;
    const type = task.kind === "Away" ? "leave" : "task";
    const span =
      task.slot === "AM"
        ? [WORK_START, LUNCH_START]
        : task.slot === "PM"
          ? [LUNCH_END, WORK_END]
          : task.slot === "Time" && task.startTime && task.endTime && task.start === task.end
            ? [minutesOf(task.startTime), minutesOf(task.endTime)]
            : null;
    if (span && span[1]! > span[0]!) timed.push({ key: `t${task.id}`, type, start: span[0]!, end: span[1]!, allDay: false, task });
    else allDay.push({ key: `t${task.id}`, type, start: 0, end: 0, allDay: true, task });
  }
  data.leave.forEach((leave, index) => {
    if (date >= leave.start && date <= leave.end) allDay.push({ key: `l${index}`, type: "leave", start: 0, end: 0, allDay: true });
  });
  timed.sort((a, b) => a.start - b.start || b.end - a.end || a.key.localeCompare(b.key));
  return { timed, allDay };
}

/** Side-by-side columns for items that overlap: each item's lane, and how many lanes its day needs. */
export function laneOf(items: readonly { start: number; end: number }[]): { lanes: number[]; count: number } {
  const ends: number[] = [];
  const lanes = items.map((item) => {
    let lane = ends.findIndex((end) => end <= item.start);
    if (lane < 0) {
      lane = ends.length;
      ends.push(item.end);
    } else ends[lane] = item.end;
    return lane;
  });
  return { lanes, count: Math.max(1, ends.length) };
}

/** The hours the grid shows: the working day, widened to whole hours around anything earlier or later. */
export function gridWindow(items: readonly { start: number; end: number }[]): { start: number; end: number } {
  const start = Math.min(8 * 60, ...items.map((item) => Math.floor(item.start / 60) * 60));
  const end = Math.max(18 * 60, ...items.map((item) => Math.ceil(item.end / 60) * 60));
  return { start: Math.max(0, start), end: Math.min(24 * 60, end) };
}

/** Whether a span overlaps one of the day's booked blocks (another than `ignoreId`); touching ends do not. */
export const overlapsBlocks = (blocks: readonly WeekBlock[], date: string, start: number, end: number, ignoreId?: number) =>
  blocks.some((block) => block.id !== ignoreId && block.date === date && minutesOf(block.start) < end && start < minutesOf(block.end));

/**
 * The first free hour of a day for a new block: from 08:30 (or `after`), around lunch, not over a block or a meeting.
 * Shorter when the day has only a shorter gap; null when the working day is full.
 */
export function freeSlot(timed: readonly CalendarItem[], length = 60, after = WORK_START): { start: number; end: number } | null {
  const busy = [...timed.filter((item) => item.type !== "task" || item.end - item.start < 8 * 60), { start: LUNCH_START, end: LUNCH_END }]
    .map((item) => ({ start: item.start, end: item.end }))
    .sort((a, b) => a.start - b.start);
  let best: { start: number; end: number } | null = null;
  let cursor = Math.max(WORK_START, Math.ceil(after / STEP) * STEP);
  for (const span of [...busy, { start: WORK_END, end: WORK_END }]) {
    if (span.end <= cursor) continue;
    const gapEnd = Math.min(span.start, WORK_END);
    if (gapEnd - cursor >= length) return { start: cursor, end: cursor + length };
    if (gapEnd - cursor >= STEP && (!best || gapEnd - cursor > best.end - best.start)) best = { start: cursor, end: gapEnd };
    cursor = Math.max(cursor, span.end);
    if (cursor >= WORK_END) break;
  }
  return best;
}

/** The days shown: Monday to Friday, and Saturday or Sunday when something is on them. */
export function shownDates(monday: string, data: Pick<WeekData, "blocks" | "meetings" | "teamTasks" | "days"> | null): string[] {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  return dates.filter((date, index) => {
    if (index < 5) return true;
    if (!data) return false;
    const day = data.days.find((entry) => entry.date === date);
    return (
      Boolean(day?.confirmed?.hours) ||
      data.blocks.some((block) => block.date === date) ||
      data.meetings.some((meeting) => dateOf(meeting.start) === date && !meeting.allDay) ||
      data.teamTasks.some((task) => task.kind !== "Away" && date >= task.start && date <= task.end)
    );
  });
}

/** Hours a timed item takes, lunch left out (as the hours draft counts meetings). */
export const itemHours = (item: Pick<CalendarItem, "start" | "end" | "type">) =>
  item.type === "block" ? hoursOf(item.start, item.end) : Math.max(0, hoursOf(item.start, item.end) - Math.max(0, Math.min(item.end, LUNCH_END) - Math.max(item.start, LUNCH_START)) / 60);

/** The week in hours: the working capacity, what is booked (blocks and meetings), time away, what is free and what is confirmed. */
export function weekSummary(data: WeekData, dates: readonly string[]) {
  let capacity = 0,
    booked = 0,
    away = 0,
    confirmed = 0;
  for (const date of dates) {
    const day = data.days.find((entry) => entry.date === date);
    if (day?.working) capacity += data.hoursPerDay;
    away += Math.min(day?.awayHours ?? 0, data.hoursPerDay);
    confirmed += day?.confirmed?.hours ?? 0;
    booked += dayItems(date, data)
      .timed.filter((item) => item.type === "block" || item.type === "meeting")
      .reduce((sum, item) => sum + itemHours(item), 0);
  }
  return { capacity: round2(capacity), booked: round2(booked), away: round2(away), free: round2(Math.max(0, capacity - away - booked)), confirmed: round2(confirmed) };
}

/** Hours booked on a day (blocks and meetings), shown in the day's heading. */
export const dayBooked = (date: string, data: Pick<WeekData, "blocks" | "meetings" | "teamTasks" | "leave">) =>
  round2(
    dayItems(date, data)
      .timed.filter((item) => item.type === "block" || item.type === "meeting")
      .reduce((sum, item) => sum + itemHours(item), 0),
  );

/** What is left of a piece of work: its planned hours less those confirmed; null when it has no planned hours. */
export const hoursLeft = (item: Pick<BacklogItem, "budgetHours" | "confirmedHours">) => (item.budgetHours === null ? null : round2(Math.max(0, item.budgetHours - item.confirmedHours)));

/** The body of POST / PATCH /api/v1/me/work-blocks. */
export function blockBody(draft: { date: string; start: string; end: string; workKey: string; note: string; projectId: string }) {
  const times = { date: draft.date, start: draft.start, end: draft.end };
  return draft.workKey ? { ...times, workKey: draft.workKey } : { ...times, note: draft.note.trim(), projectId: draft.projectId ? Number(draft.projectId) : null };
}

/** The day a confirmed or drafted day shows in its footing. */
export const dayOf = (data: Pick<WorkDaysData, "days">, date: string): WorkDay | undefined => data.days.find((day) => day.date === date);
