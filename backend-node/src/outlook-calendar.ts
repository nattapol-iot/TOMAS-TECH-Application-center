import sql from "mssql";
import type { Database } from "./db.js";
import { GraphReadError, type EmailService } from "./email.js";

/*
 * Outlook calendars on the team board (owner request 2026-10-28): people book meetings and trips in Outlook that the
 * board never saw. The API reads each person's calendar through Microsoft Graph (application permission
 * Calendars.Read, granted by IT) and keeps a copy in dbo.outlook_events for a window around today. The board shows
 * the subject and time (only "busy" for a private event) and counts the hours in the day's load.
 *
 * The board reads the copy; a read older than STALE_MS starts a new sync in the background, and the board's
 * "Sync Outlook" button runs one at once. One sync at a time per API process.
 */

type Graph = Pick<EmailService, "graphGet" | "graphEnabled">;
export type OutlookSyncState = "never" | "running" | "ok" | "partial" | "denied" | "disabled" | "error";
export type OutlookSyncStatus = { state: OutlookSyncState; syncedAt: string | null; message: string; people: number; failed: number };

const STALE_MS = 15 * 60_000;
/** A button press within this of the last sync returns that sync instead of reading every calendar again. */
const MIN_GAP_MS = 60_000;
const WINDOW_BACK_DAYS = 14;
const WINDOW_AHEAD_DAYS = 120;
const CONCURRENCY = 5;
const MAX_PAGES = 20;
/** Invitations the board itself sends (team-calendar.ts): already on the board as team tasks. */
const BOARD_INVITE = /^team-task-\d+@iot-team-center$/i;
const DAY = 86_400_000;

export type GraphEvent = {
  id: string; iCalUId?: string; subject?: string | null; sensitivity?: string; showAs?: string; isAllDay?: boolean; isCancelled?: boolean;
  start?: { dateTime?: string }; end?: { dateTime?: string }; location?: { displayName?: string | null } | null;
};
export type OutlookRow = {
  eventId: string; subject: string | null; location: string | null; isPrivate: boolean; isAllDay: boolean; showAs: string; start: string; end: string;
};

/**
 * The events worth keeping: not cancelled, not "free", not one of the board's own invitations. Times are Bangkok
 * local (the Prefer header asks Graph for them) as "YYYY-MM-DDTHH:MM:SS". A private or confidential event keeps no
 * subject or place.
 */
export function outlookRows(events: readonly GraphEvent[]): OutlookRow[] {
  const rows: OutlookRow[] = [];
  for (const event of events) {
    const start = event.start?.dateTime?.slice(0, 19), end = event.end?.dateTime?.slice(0, 19);
    if (!event.id || !start || !end || event.isCancelled) continue;
    const showAs = (event.showAs ?? "busy").toLowerCase();
    if (showAs === "free" || (event.iCalUId && BOARD_INVITE.test(event.iCalUId))) continue;
    const isPrivate = ["private", "confidential"].includes((event.sensitivity ?? "").toLowerCase());
    rows.push({
      eventId: event.id.slice(0, 400),
      subject: isPrivate ? null : (event.subject ?? "").trim().slice(0, 300) || null,
      location: isPrivate ? null : (event.location?.displayName ?? "").trim().slice(0, 300) || null,
      isPrivate, isAllDay: Boolean(event.isAllDay), showAs: showAs.slice(0, 30), start, end: end < start ? start : end,
    });
  }
  return rows;
}

const bangkokToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

async function readCalendar(graph: Graph, email: string, from: string, to: string): Promise<GraphEvent[]> {
  const select = "id,iCalUId,subject,sensitivity,showAs,isAllDay,isCancelled,start,end,location";
  const window = `startDateTime=${encodeURIComponent(`${from}T00:00:00+07:00`)}&endDateTime=${encodeURIComponent(`${to}T23:59:59+07:00`)}`;
  let next: string | undefined = `/users/${encodeURIComponent(email)}/calendarView?${window}&$select=${select}&$top=250`;
  const events: GraphEvent[] = [];
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const body: { value?: GraphEvent[]; "@odata.nextLink"?: string } = await graph.graphGet(next, { Prefer: 'outlook.timezone="SE Asia Standard Time"' });
    events.push(...(body.value ?? []));
    next = body["@odata.nextLink"];
  }
  return events;
}

/** Replaces one person's events in the window, and records when their calendar was read and what went wrong. */
async function saveCalendar(db: Database, userId: number, from: string, to: string, rows: OutlookRow[] | null, error: string | null) {
  await db.transaction(async (transaction) => {
    const request = new sql.Request(transaction);
    request.input("user", sql.BigInt, userId).input("from", sql.NVarChar(19), `${from}T00:00:00`).input("to", sql.NVarChar(19), `${to}T23:59:59`)
      .input("rows", sql.NVarChar(sql.MAX), JSON.stringify(rows ?? [])).input("replace", sql.Bit, rows !== null)
      .input("error", sql.NVarChar(500), error?.slice(0, 500) ?? null);
    await request.query(`
      IF @replace=1
      BEGIN
        DELETE dbo.outlook_events WHERE user_id=@user AND (
          (end_at>=CONVERT(datetime2(0),@from,126) AND start_at<=CONVERT(datetime2(0),@to,126))
          OR event_id IN (SELECT event_id FROM OPENJSON(@rows) WITH (event_id nvarchar(400) '$.eventId')));
        INSERT dbo.outlook_events(user_id,event_id,subject,location,is_private,is_all_day,show_as,start_at,end_at)
        SELECT @user,event_id,subject,location,is_private,is_all_day,show_as,CONVERT(datetime2(0),start_at,126),CONVERT(datetime2(0),end_at,126)
        FROM OPENJSON(@rows) WITH (event_id nvarchar(400) '$.eventId', subject nvarchar(300) '$.subject', location nvarchar(300) '$.location',
          is_private bit '$.isPrivate', is_all_day bit '$.isAllDay', show_as nvarchar(30) '$.showAs', start_at nvarchar(19) '$.start', end_at nvarchar(19) '$.end');
      END;
      MERGE dbo.outlook_sync AS target USING (SELECT @user AS user_id) AS source ON target.user_id=source.user_id
      WHEN MATCHED THEN UPDATE SET synced_at=SYSUTCDATETIME(), error=@error
      WHEN NOT MATCHED THEN INSERT(user_id,synced_at,error) VALUES(@user,SYSUTCDATETIME(),@error);`);
  });
}

let status: OutlookSyncStatus = { state: "never", syncedAt: null, message: "", people: 0, failed: 0 };
let running: Promise<OutlookSyncStatus> | null = null;
let finishedAt = 0;

export const outlookStatus = (): OutlookSyncStatus => (running ? { ...status, state: "running" } : status);

/** Reads every active person's calendar into dbo.outlook_events. Never throws: the result says what happened. */
export function syncOutlook(db: Database, graph: Graph, today = bangkokToday()): Promise<OutlookSyncStatus> {
  if (running) return running;
  if (finishedAt && Date.now() - finishedAt < MIN_GAP_MS) return Promise.resolve(status);
  running = (async () => {
    if (!graph.graphEnabled) {
      status = { state: "disabled", syncedAt: null, message: "Microsoft Graph is not configured.", people: 0, failed: 0 };
      return status;
    }
    const from = shift(today, -WINDOW_BACK_DAYS), to = shift(today, WINDOW_AHEAD_DAYS);
    const people = (await db.query<{ id: number | string; email: string }>(
      `SELECT id,email FROM dbo.users WHERE is_active=1 AND deleted_at IS NULL AND email LIKE N'%_@_%';`)).recordset;
    let done = 0, failed = 0, denied = 0, lastError = "";
    const queue = [...people];
    const worker = async () => {
      for (let person = queue.shift(); person; person = queue.shift()) {
        const userId = Number(person.id);
        try {
          const rows = outlookRows(await readCalendar(graph, person.email.trim(), from, to));
          await saveCalendar(db, userId, from, to, rows, null);
          done++;
        } catch (error) {
          const read = error instanceof GraphReadError ? error : null;
          // No mailbox (a service account, another domain) is not a failure of the sync.
          if (read && (read.status === 404 || read.code === "MailboxNotEnabledForRESTAPI" || read.code === "ResourceNotFound")) { done++; await saveCalendar(db, userId, from, to, null, "No Outlook mailbox").catch(() => undefined); continue; }
          if (read?.status === 403 || read?.status === 401) denied++;
          failed++;
          lastError = error instanceof Error ? error.message : String(error);
          await saveCalendar(db, userId, from, to, null, lastError).catch(() => undefined);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, people.length) }, worker));
    // Events long gone from every window are not kept.
    await db.query(`DELETE dbo.outlook_events WHERE end_at < DATEADD(day,-60,CONVERT(datetime2(0),@from));`, (q) => q.input("from", sql.NVarChar(10), from)).catch(() => undefined);
    const state: OutlookSyncState = !failed ? "ok" : denied && !done ? "denied" : done ? "partial" : "error";
    status = { state, syncedAt: new Date().toISOString(), message: lastError, people: done, failed };
    return status;
  })().catch((error: unknown) => {
    status = { state: "error", syncedAt: status.syncedAt, message: error instanceof Error ? error.message : String(error), people: 0, failed: 0 };
    return status;
  }).finally(() => { running = null; finishedAt = Date.now(); });
  return running;
}

/** Starts a sync in the background when the last one is older than STALE_MS; the board does not wait for it. */
export function refreshOutlookIfStale(db: Database, graph: Graph): void {
  if (running || !graph.graphEnabled) return;
  if (finishedAt && Date.now() - finishedAt < STALE_MS) return;
  void syncOutlook(db, graph);
}

/** The events on the board's days, for everyone: Bangkok local start and end. */
export async function boardOutlookEvents(db: Database, from: string, to: string) {
  const result = await db.query<{ id: number | string; user_id: number | string; subject: string | null; location: string | null; is_private: boolean; is_all_day: boolean; show_as: string; start_at: string; end_at: string }>(`
    SELECT id,user_id,subject,location,is_private,is_all_day,show_as,CONVERT(char(19),start_at,126) start_at,CONVERT(char(19),end_at,126) end_at
    FROM dbo.outlook_events
    WHERE start_at < DATEADD(day,1,CONVERT(datetime2(0),@to)) AND end_at > CONVERT(datetime2(0),@from);`,
  (q) => q.input("from", sql.NVarChar(10), from).input("to", sql.NVarChar(10), to));
  return result.recordset.map((row) => ({
    id: Number(row.id), userId: Number(row.user_id), subject: row.is_private ? null : row.subject, location: row.is_private ? null : row.location,
    private: Boolean(row.is_private), allDay: Boolean(row.is_all_day), showAs: row.show_as, start: row.start_at, end: row.end_at,
  }));
}
