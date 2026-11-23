import sql from "mssql";
import type { Database } from "./db.js";
import { GraphReadError, type EmailService } from "./email.js";
import { timeText } from "./work-blocks.js";
import { addDays } from "./work-days.js";

/*
 * My week into Outlook (owner decision 2026-11-23: "เขียนลง Outlook ตรงๆ"). Every block of time a person books in the
 * app is written into their own Outlook calendar through Microsoft Graph with the app's own token (application
 * permission Calendars.ReadWrite): no invitation e-mail, and a change or removal in the app changes or removes the
 * entry. The entry is busy time, without a reminder, in the category OUTLOOK_CATEGORY. The Outlook read
 * (outlook-calendar.ts) leaves these entries out, so the board never counts them twice.
 *
 * The app's own change is saved first; the Outlook write follows and never fails the request. Its outcome is kept on
 * the block (outlook_state): Synced, Failed (tried again later), Denied (Graph refused: the permission is not granted
 * yet) or Off (Microsoft Graph is not set up). A removed block keeps its row until its entry is gone from Outlook.
 */

export type GraphWriter = Pick<EmailService, "graphEnabled" | "graphSend">;
export type OutlookWriteState = "Pending" | "Synced" | "Failed" | "Denied" | "Off";
export const OUTLOOK_CATEGORY = "IoT Team Center";
const TIME_ZONE = "SE Asia Standard Time";
/** How often one person's refused or failed entries are tried again. */
const RETRY_GAP_MS = 5 * 60_000;
/** The most entries one push writes. */
const PUSH_LIMIT = 40;

export type BlockForOutlook = { id: number; date: string; start: number; end: number; title: string; projectNo: string | null; eventId: string | null; deleted: boolean; state: string };
export type WriteResult = { state: OutlookWriteState; eventId: string | null; icalUid: string | null; error: string | null; gone: boolean };

const stamp = (date: string, minutes: number) => (minutes >= 24 * 60 ? `${addDays(date, 1)}T00:00:00` : `${date}T${timeText(minutes)}:00`);

/** The Outlook entry for a block: "<project> · <work>", busy, no reminder, in the app's category. */
export function blockEvent(block: Pick<BlockForOutlook, "date" | "start" | "end" | "title" | "projectNo">): Record<string, unknown> {
  const subject = (block.projectNo && !block.title.startsWith(block.projectNo) ? `${block.projectNo} · ${block.title}` : block.title).slice(0, 255);
  return {
    subject,
    body: {
      contentType: "Text",
      content:
        "ลงเวลาจาก IoT Team Center (งานของฉัน > สัปดาห์ของฉัน) แก้หรือลบที่แอป การแก้ใน Outlook จะถูกเขียนทับ\n" +
        "Booked in IoT Team Center (My Work > My week). Change or remove it there; changes made in Outlook are overwritten.",
    },
    start: { dateTime: stamp(block.date, block.start), timeZone: TIME_ZONE },
    end: { dateTime: stamp(block.date, block.end), timeZone: TIME_ZONE },
    showAs: "busy",
    isReminderOn: false,
    categories: [OUTLOOK_CATEGORY],
  };
}

const notFound = (error: unknown) => error instanceof GraphReadError && (error.status === 404 || error.code === "ErrorItemNotFound");

/** Writes one block into the person's calendar (or removes it) and says how it went. Never throws. */
export async function writeBlock(graph: GraphWriter, email: string, block: BlockForOutlook): Promise<WriteResult> {
  if (!graph.graphEnabled) return { state: "Off", eventId: block.eventId, icalUid: null, error: null, gone: block.deleted };
  const events = `/users/${encodeURIComponent(email.trim())}/events`;
  try {
    if (block.deleted) {
      if (block.eventId)
        await graph.graphSend("DELETE", `${events}/${encodeURIComponent(block.eventId)}`).catch((error: unknown) => {
          if (!notFound(error)) throw error;
        });
      return { state: "Synced", eventId: null, icalUid: null, error: null, gone: true };
    }
    const entry = blockEvent(block);
    if (block.eventId) {
      try {
        const saved = await graph.graphSend<{ id?: string; iCalUId?: string }>("PATCH", `${events}/${encodeURIComponent(block.eventId)}`, entry);
        return { state: "Synced", eventId: saved?.id ?? block.eventId, icalUid: saved?.iCalUId ?? null, error: null, gone: false };
      } catch (error) {
        // Removed in Outlook by the person: write it again.
        if (!notFound(error)) throw error;
      }
    }
    const created = await graph.graphSend<{ id?: string; iCalUId?: string }>("POST", events, entry);
    return { state: "Synced", eventId: created?.id ?? null, icalUid: created?.iCalUId ?? null, error: null, gone: false };
  } catch (error) {
    const read = error instanceof GraphReadError ? error : null;
    const denied = read !== null && (read.status === 401 || read.status === 403);
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    return { state: denied ? "Denied" : "Failed", eventId: block.eventId, icalUid: null, error: message, gone: false };
  }
}

/** Blocks to write: changed ones, removed ones (a removed block with no entry is simply dropped), and on a retry the rest. */
const PENDING_SQL = `
  SELECT TOP (${PUSH_LIMIT}) b.id,b.work_date,b.start_minute,b.end_minute,b.title,p.project_no,b.outlook_event_id,
    CASE WHEN b.deleted_at IS NULL THEN 0 ELSE 1 END deleted,b.outlook_state,b.revision
  FROM dbo.work_blocks b LEFT JOIN dbo.projects p ON p.id=b.project_id
  WHERE b.user_id=@user AND (b.outlook_state=N'Pending' OR (@retry=1 AND b.outlook_state IN (N'Failed',N'Denied',N'Off')))
  ORDER BY b.id;`;

/**
 * The outcome of one write. The entry's id is always kept (so it is never written twice); the state only when the
 * block has not changed again since it was read.
 */
const SAVE_SQL = `
  IF @gone=1 DELETE dbo.work_blocks WHERE id=@id AND user_id=@user AND deleted_at IS NOT NULL;
  ELSE UPDATE dbo.work_blocks SET outlook_event_id=@event,outlook_ical_uid=COALESCE(@uid,outlook_ical_uid),
      outlook_state=CASE WHEN revision=@revision THEN @state ELSE outlook_state END,
      outlook_error=CASE WHEN revision=@revision THEN @error ELSE outlook_error END
    WHERE id=@id AND user_id=@user;`;

const running = new Map<number, Promise<void>>();
const lastRetry = new Map<number, number>();

/**
 * Writes the person's pending entries (and, at most every RETRY_GAP_MS, the failed and refused ones) into Outlook.
 * One push per person at a time; a push asked for while one runs follows it.
 */
export function pushBlocks(db: Database, graph: GraphWriter, userId: number, email: string, options: { retry?: boolean } = {}): Promise<void> {
  const retry = Boolean(options.retry) && Date.now() - (lastRetry.get(userId) ?? 0) >= RETRY_GAP_MS;
  if (retry) lastRetry.set(userId, Date.now());
  const previous = running.get(userId) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      const rows = (await db.query<Record<string, unknown>>(PENDING_SQL, (q) => q.input("user", sql.BigInt, userId).input("retry", sql.Bit, retry))).recordset;
      for (const row of rows) {
        const block: BlockForOutlook = {
          id: Number(row.id),
          date: row.work_date instanceof Date ? row.work_date.toISOString().slice(0, 10) : String(row.work_date).slice(0, 10),
          start: Number(row.start_minute),
          end: Number(row.end_minute),
          title: String(row.title ?? ""),
          projectNo: row.project_no == null ? null : String(row.project_no),
          eventId: row.outlook_event_id == null ? null : String(row.outlook_event_id),
          deleted: Boolean(row.deleted),
          state: String(row.outlook_state),
        };
        const result = await writeBlock(graph, email, block);
        await db.query(SAVE_SQL, (q) =>
          q
            .input("id", sql.BigInt, block.id)
            .input("user", sql.BigInt, userId)
            .input("gone", sql.Bit, result.gone)
            .input("revision", sql.Int, Number(row.revision))
            .input("event", sql.NVarChar(400), result.eventId)
            .input("uid", sql.NVarChar(400), result.icalUid)
            .input("state", sql.NVarChar(20), result.state)
            .input("error", sql.NVarChar(300), result.error),
        );
      }
    })
    .catch(() => undefined)
    .finally(() => {
      if (running.get(userId) === next) running.delete(userId);
    });
  running.set(userId, next);
  return next;
}

/** Where the person's Outlook entries stand, for the page: all written, some waiting, refused, failed or switched off. */
export function outlookWriteSummary(states: readonly string[], graphEnabled: boolean): { state: "ok" | "pending" | "denied" | "failed" | "off"; waiting: number } {
  if (!graphEnabled) return { state: "off", waiting: 0 };
  const waiting = states.filter((state) => state !== "Synced").length;
  const state = states.includes("Denied") ? "denied" : states.includes("Failed") ? "failed" : states.includes("Pending") || states.includes("Off") ? "pending" : "ok";
  return { state, waiting };
}
