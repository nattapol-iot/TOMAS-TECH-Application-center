import { HOURS_PER_DAY, awaySlotHours, coveredMinutes, datesBetween, isWorkingDay, outlookHours, outlookSpan, teamTaskShare, type OutlookEventDay, type TeamTaskDay } from "./work-days.js";

/*
 * Team overview > Team week (owner decision 2026-11-23, part 2 of the My week design): everyone's week in hours, read
 * from what each person booked on My week (migration 124), the meetings in their Outlook, their team tasks and their
 * time away, with the hours they confirmed. It counts a day the way the hours draft does (work-days.ts draftDay):
 * a block takes its own time less the minutes a meeting took; a team task takes its share of the day.
 *
 * What the reader may not see stays hidden: a block on a project the reader is not part of shows as "work" without
 * its project number, and a note typed for other work never shows its text.
 */

export type WeekBlock = { userId: number; date: string; start: number; end: number; workKey: string | null; projectId: number | null; projectNo: string | null };
export type WeekMeeting = OutlookEventDay & { userId: number };
export type WeekTask = TeamTaskDay & { userId: number };
export type WeekAway = { userId: number; start: string; end: string };
export type WeekInput = {
  from: string;
  to: string;
  holidays: ReadonlySet<string>;
  blocks: readonly WeekBlock[];
  meetings: readonly WeekMeeting[];
  tasks: readonly WeekTask[];
  away: readonly WeekAway[];
  confirmed: ReadonlyMap<string, number>;
  /** Projects the reader may see (null: all of them). */
  visibleProjects: ReadonlySet<number> | null;
};
/** What a day of someone's week holds, in hours: one chip per piece of work. */
export type Chip = { label: string; kind: "project" | "work" | "other" | "meeting" | "task" | "away"; hours: number };
export type WeekDay = { date: string; working: boolean; booked: number; meetings: number; tasks: number; away: number; total: number; free: number; confirmed: number | null; chips: Chip[] };
export type WeekRow = { userId: number; days: WeekDay[]; total: number; away: number; capacity: number; confirmed: number; unconfirmedDays: number };

const round2 = (value: number) => Math.round(value * 100) / 100;
const dayKey = (userId: number, date: string) => `${userId}|${date}`;

/** The chip a block shows: its project number when the reader may see the project, else what kind of work it is. */
export function blockLabel(block: Pick<WeekBlock, "workKey" | "projectId" | "projectNo">, visible: ReadonlySet<number> | null): { label: string; kind: Chip["kind"] } {
  if (block.projectId !== null && block.projectNo && (visible === null || visible.has(block.projectId))) return { label: block.projectNo, kind: "project" };
  if (block.workKey === null) return { label: "Other", kind: "other" };
  const prefix = block.workKey.slice(0, block.workKey.lastIndexOf("-"));
  return { label: prefix.startsWith("Estimate") ? "Estimate" : prefix.startsWith("Inquiry") ? "Inquiry" : prefix === "Issue" ? "Issue" : "Work", kind: "work" };
}

/** One person's day. */
export function teamDay(userId: number, date: string, input: WeekInput): WeekDay {
  const working = isWorkingDay(date, input.holidays);
  const meetings = input.meetings.filter((meeting) => meeting.userId === userId);
  const spans = meetings.map((meeting) => outlookSpan(meeting, date)).filter((span): span is { start: number; end: number } => span !== null);
  const chips = new Map<string, Chip>();
  const add = (label: string, kind: Chip["kind"], hours: number) => {
    if (hours <= 0) return;
    const key = `${kind}|${label}`;
    const chip = chips.get(key);
    if (chip) chip.hours += hours;
    else chips.set(key, { label, kind, hours });
  };
  let booked = 0;
  for (const block of input.blocks) {
    if (block.userId !== userId || block.date !== date) continue;
    const hours = (block.end - block.start - coveredMinutes(block.start, block.end, spans)) / 60;
    const { label, kind } = blockLabel(block, input.visibleProjects);
    add(label, kind, hours);
    booked += Math.max(0, hours);
  }
  const meetingHours = Math.min(
    HOURS_PER_DAY,
    meetings.reduce((sum, meeting) => sum + outlookHours(meeting, date), 0),
  );
  add("Meetings", "meeting", meetingHours);
  let taskHours = 0,
    away = 0;
  for (const task of input.tasks) {
    if (task.userId !== userId || date < task.start || date > task.end) continue;
    if (task.kind === "Away") {
      away += awaySlotHours(task);
      continue;
    }
    const hours = teamTaskShare(task, date, input.holidays) * HOURS_PER_DAY;
    add(task.projectNo && (input.visibleProjects === null || (task.projectId !== null && input.visibleProjects.has(task.projectId))) ? task.projectNo : "Team task", "task", hours);
    taskHours += hours;
  }
  if (input.away.some((span) => span.userId === userId && date >= span.start && date <= span.end)) away = HOURS_PER_DAY;
  away = Math.min(HOURS_PER_DAY, away);
  add("Away", "away", working ? away : 0);
  const total = round2(booked + meetingHours + taskHours);
  const confirmed = input.confirmed.get(dayKey(userId, date));
  return {
    date,
    working,
    booked: round2(booked),
    meetings: round2(meetingHours),
    tasks: round2(taskHours),
    away: working ? round2(away) : 0,
    total,
    free: working ? round2(Math.max(0, HOURS_PER_DAY - away - total)) : 0,
    confirmed: confirmed === undefined ? null : round2(confirmed),
    chips: [...chips.values()].map((chip) => ({ ...chip, hours: round2(chip.hours) })).sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label)),
  };
}

/** A day whose hours are still to be confirmed: a working day up to today, not confirmed, not away the whole day. */
export const isUnconfirmed = (day: Pick<WeekDay, "date" | "working" | "confirmed" | "away">, today: string) => day.working && day.date <= today && day.confirmed === null && day.away < HOURS_PER_DAY;

/** The days from..to (up to today) a person has still to confirm, by the same rule as Team week (the plan Sheet's follow-up list). */
export const unconfirmedDates = (userId: number, input: WeekInput, today: string): string[] => datesBetween(input.from, input.to).filter((date) => isUnconfirmed(teamDay(userId, date, input), today));

/** Everyone's week: one row per person, with the days whose hours are still to be confirmed (working days up to today). */
export function teamWeek(userIds: readonly number[], input: WeekInput, today: string): WeekRow[] {
  const dates = datesBetween(input.from, input.to);
  return userIds.map((userId) => {
    const days = dates.map((date) => teamDay(userId, date, input));
    const capacity = days.filter((day) => day.working).length * HOURS_PER_DAY;
    return {
      userId,
      days,
      total: round2(days.reduce((sum, day) => sum + day.total, 0)),
      away: round2(days.reduce((sum, day) => sum + day.away, 0)),
      capacity,
      confirmed: round2(days.reduce((sum, day) => sum + (day.confirmed ?? 0), 0)),
      unconfirmedDays: days.filter((day) => isUnconfirmed(day, today)).length,
    };
  });
}

export type { OutlookEventDay, TeamTaskDay };
