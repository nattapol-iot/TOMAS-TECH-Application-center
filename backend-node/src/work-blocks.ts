import { ApiError } from "./errors.js";
import { bodyObject, parseDateOnly } from "./http.js";
import { MAX_NOTE, WORK_KEY, addDays, editableFrom } from "./work-days.js";

/*
 * My week (migration 124, owner decision 2026-11-23): people book time for a piece of their work on their own
 * calendar in the app instead of typing their week into Outlook. The app writes each block into their Outlook calendar
 * (outlook-write.ts) and drafts the day's hours from the blocks (work-days.ts draftDay), so confirming the day stays
 * one press. These are the rules for one block of time; the routes are in routes/work-blocks.ts.
 *
 * A block is on one day, in steps of BLOCK_STEP minutes, at most MAX_BLOCK_MINUTES long, and never overlaps another
 * of the person's blocks (an Outlook meeting may overlap it: the draft then counts the meeting, not the block).
 * Blocks may be booked from the oldest day whose hours can still be confirmed up to BOOK_DAYS_AHEAD days ahead.
 */

export const BLOCK_STEP = 15;
export const MAX_BLOCK_MINUTES = 12 * 60;
export const BOOK_DAYS_AHEAD = 180;
export const MAX_BLOCKS_PER_DAY = 40;

/** The work a block is for: a piece of the person's work, or other work typed as a note (towards a project or none). */
export type BlockWork = { workKey: string } | { workKey: null; note: string; projectId: number | null };
export type BlockInput = { date: string; start: number; end: number; work: BlockWork };
export type BlockPatch = { date?: string; start?: number; end?: number; work?: BlockWork };
export type BlockSpan = { id: number; start: number; end: number };

const invalid = (message: string) => new ApiError(400, "validation_failed", message);

/** "HH:MM" as minutes after midnight; "24:00" is the end of the day. */
export function parseBlockTime(value: unknown, label: string): number {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) throw invalid(`${label} must be a time in HH:MM format.`);
  const hours = Number(value.slice(0, 2)),
    minutes = Number(value.slice(3, 5));
  const total = hours * 60 + minutes;
  if (minutes > 59 || total > 24 * 60) throw invalid(`${label} must be a time of day.`);
  if (total % BLOCK_STEP !== 0) throw invalid(`${label} must be on a quarter hour.`);
  return total;
}

/** Minutes after midnight as "HH:MM". */
export const timeText = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function parseWork(body: Record<string, unknown>): BlockWork | undefined {
  if (body.workKey !== undefined && body.workKey !== null) {
    if (typeof body.workKey !== "string" || !WORK_KEY.test(body.workKey) || body.workKey.startsWith("Outlook-")) throw invalid("A block's work must be one of your pieces of work.");
    return { workKey: body.workKey };
  }
  if (body.note === undefined) return undefined;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note || note.length > MAX_NOTE) throw invalid(`Other work needs a note of 1 to ${MAX_NOTE} characters.`);
  let projectId: number | null = null;
  if (body.projectId !== undefined && body.projectId !== null) {
    if (typeof body.projectId !== "number" || !Number.isSafeInteger(body.projectId) || body.projectId < 1) throw invalid("Project must be a project id.");
    projectId = body.projectId;
  }
  return { workKey: null, note, projectId };
}

/** Start before end, on one day, at most MAX_BLOCK_MINUTES. */
export function checkSpan(start: number, end: number): void {
  if (end <= start) throw invalid("A block must end after it starts.");
  if (end - start > MAX_BLOCK_MINUTES) throw invalid(`A block is at most ${MAX_BLOCK_MINUTES / 60} hours.`);
}

/** The body of POST /me/work-blocks: { date, start, end, workKey } or { date, start, end, note, projectId? }. */
export function parseBlockInput(value: unknown): BlockInput {
  const body = bodyObject(value);
  const date = parseDateOnly(body.date, "Date")!;
  const start = parseBlockTime(body.start, "Start"),
    end = parseBlockTime(body.end, "End");
  checkSpan(start, end);
  const work = parseWork(body);
  if (!work) throw invalid("Choose the work the block is for, or type a note for other work.");
  return { date, start, end, work };
}

/** The body of PATCH /me/work-blocks/:id: any of date, start, end and the work. */
export function parseBlockPatch(value: unknown): BlockPatch {
  const body = bodyObject(value);
  const patch: BlockPatch = {};
  if (body.date !== undefined) patch.date = parseDateOnly(body.date, "Date")!;
  if (body.start !== undefined) patch.start = parseBlockTime(body.start, "Start");
  if (body.end !== undefined) patch.end = parseBlockTime(body.end, "End");
  const work = parseWork(body);
  if (work) patch.work = work;
  if (!Object.keys(patch).length) throw invalid("Nothing to change.");
  return patch;
}

/** Whether a span overlaps one of the person's other blocks that day (touching ends do not overlap). */
export const overlapsBlock = (blocks: readonly BlockSpan[], start: number, end: number, ignoreId?: number) => blocks.some((block) => block.id !== ignoreId && block.start < end && start < block.end);

/** The days a block may be booked on: from the oldest day still confirmable up to BOOK_DAYS_AHEAD days ahead. */
export const bookableFrom = (today: string) => editableFrom(today);
export const bookableTo = (today: string) => addDays(today, BOOK_DAYS_AHEAD);
export const isBookable = (date: string, today: string) => date >= bookableFrom(today) && date <= bookableTo(today);
