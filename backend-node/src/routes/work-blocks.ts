import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import type { EmailService } from "../email.js";
import { ApiError } from "../errors.js";
import { bodyObject, parseDateOnly } from "../http.js";
import { bangkokToday } from "../issue-batches.js";
import { outlookWriteSummary, pushBlocks, type GraphWriter } from "../outlook-write.js";
import type { CurrentUserService } from "../users.js";
import { MAX_BLOCKS_PER_DAY, bookableFrom, bookableTo, checkSpan, isBookable, overlapsBlock, parseBlockInput, parseBlockPatch, timeText, type BlockWork } from "../work-blocks.js";
import { HOURS_PER_DAY, MAX_WINDOW_DAYS, WORK_KEY, dayNumber } from "../work-days.js";
import { kindOfKey, readWorkDays, workDaysResponse, type WorkDaysRead } from "./work-days.js";

/*
 * My week (migration 124, owner decision 2026-11-23): the person's own calendar, which replaces typing the week into
 * Outlook. Rules for a block: work-blocks.ts; writing it into Outlook: outlook-write.ts; the day's draft: work-days.ts.
 *
 * GET    /api/v1/me/week?from&to          the days (as /me/work-days), the blocks, meetings, team tasks and time away
 *                                          in the window, and the person's open work with its hours
 * POST   /api/v1/me/work-blocks           book time: { date, start, end, workKey } or { date, start, end, note, projectId? }
 * PATCH  /api/v1/me/work-blocks/:id       move it, change its length or its work
 * DELETE /api/v1/me/work-blocks/:id       remove it (and its Outlook entry)
 * PUT    /api/v1/me/outlook-links         tie an Outlook meeting to a piece of work, or untie it: { outlookId, workKey | null }
 *
 * Everyone books their own time only; nobody books for someone else.
 */

type Row = Record<string, unknown>;
type Mail = Partial<Pick<EmailService, "graphEnabled" | "graphSend">>;
/** The Graph writer; a mail service without one (a test harness) has the Outlook write switched off. */
const writerOf = (email: Mail): GraphWriter =>
  typeof email.graphSend === "function" ? (email as GraphWriter) : { graphEnabled: false, graphSend: () => Promise.reject(new Error("Microsoft Graph is not configured.")) };

const round2 = (value: number) => Math.round(value * 100) / 100;
/** How long a save waits for its Outlook write before it answers; the write carries on after that. */
const OUTLOOK_WAIT_MS = 5_000;

/** The work a block is for, as the server knows it: a piece of the person's work, or their note. */
export function resolveBlockWork(work: BlockWork, read: Pick<WorkDaysRead, "choices" | "projects">): { workKey: string | null; projectId: number | null; title: string } {
  if (work.workKey !== null) {
    const choice = read.choices.get(work.workKey);
    if (!choice || choice.kind === "Outlook") throw new ApiError(422, "work_block_unknown_work", "The block names work that is not yours or no longer exists. Reload the week.");
    return { workKey: choice.workKey, projectId: choice.projectId, title: (choice.title || choice.reference || choice.workKey).slice(0, 300) };
  }
  if (work.projectId !== null && !read.projects.has(work.projectId)) throw new ApiError(422, "work_day_unknown_project", "Hours can count only towards a project you work on.");
  return { workKey: null, projectId: work.projectId, title: work.note.slice(0, 300) };
}

/** The week as My week shows it. */
export function weekResponse(read: WorkDaysRead, from: string, to: string, today: string, graphEnabled: boolean) {
  const base = workDaysResponse(read, from, to, today);
  const booked = new Map<string, number>();
  for (const block of read.blocks) if (block.workKey) booked.set(block.workKey, (booked.get(block.workKey) ?? 0) + (block.end - block.start) / 60);
  const blocks = read.blocks.map((block) => ({
    id: block.id,
    date: block.date,
    start: timeText(block.start),
    end: timeText(block.end),
    workKey: block.workKey,
    kind: kindOfKey(block.workKey, block.projectId),
    projectId: block.projectId,
    projectNo: block.projectNo,
    title: block.title,
    reference: block.workKey ? (read.choices.get(block.workKey)?.reference ?? "") : "",
    outlookState: block.outlookState,
    outlookError: block.outlookError,
  }));
  const meetings = read.meetings.map((meeting) => ({
    id: meeting.id,
    subject: meeting.subject,
    location: meeting.location,
    private: meeting.private,
    allDay: meeting.allDay,
    start: meeting.start,
    end: meeting.end,
    linkedWorkKey: read.links.get(meeting.eventId) ?? null,
  }));
  const teamTasks = read.tasks.map((task) => ({
    id: task.id,
    kind: task.kind,
    title: task.title,
    projectNo: task.projectNo,
    start: task.start,
    end: task.end,
    slot: task.slot,
    startTime: task.startTime,
    endTime: task.endTime,
  }));
  const seen = new Set<string>();
  const backlog = read.openItems
    .filter((item) => !seen.has(item.workKey) && seen.add(item.workKey))
    .map((item) => {
      const choice = read.choices.get(item.workKey);
      return {
        workKey: item.workKey,
        kind: choice?.kind ?? kindOfKey(item.workKey, null),
        reference: item.reference,
        title: item.title || item.reference,
        customer: item.customer,
        projectNo: choice?.projectNo ?? null,
        start: item.start,
        end: item.end,
        status: item.status,
        progress: item.progress,
        budgetHours: item.manDays === null ? null : round2(item.manDays * HOURS_PER_DAY),
        confirmedHours: round2(read.confirmedByKey.get(item.workKey) ?? 0),
        bookedHours: round2(booked.get(item.workKey) ?? 0),
      };
    })
    .sort((a, b) => (a.end ?? "9999").localeCompare(b.end ?? "9999") || a.reference.localeCompare(b.reference, undefined, { numeric: true }));
  return {
    ...base,
    blocks,
    meetings,
    teamTasks,
    leave: read.leave,
    backlog,
    outlookWrite: outlookWriteSummary(
      read.blocks.map((block) => block.outlookState),
      graphEnabled,
    ),
  };
}

const DAY_BLOCKS_SQL = `SELECT id,start_minute,end_minute FROM dbo.work_blocks WITH (UPDLOCK, HOLDLOCK)
  WHERE user_id=@actor AND work_date=@date AND deleted_at IS NULL;`;

async function dayBlocks(request: sql.Request) {
  return (await request.query<Row>(DAY_BLOCKS_SQL)).recordset.map((row) => ({ id: Number(row.id), start: Number(row.start_minute), end: Number(row.end_minute) }));
}

export function registerWorkBlockRoutes(app: FastifyInstance, database: Database, users: CurrentUserService, email: Mail): void {
  const graph = writerOf(email);
  /** Writes the person's changes into Outlook, waiting a moment so the answer can say how it went. */
  const pushNow = async (actor: { id: number; email: string }) => {
    await Promise.race([pushBlocks(database, graph, actor.id, actor.email), new Promise((resolve) => setTimeout(resolve, OUTLOOK_WAIT_MS))]);
  };
  const stateOf = async (actorId: number, id: number) =>
    (await database.query<Row>(`SELECT outlook_state,outlook_error FROM dbo.work_blocks WHERE id=@id AND user_id=@actor;`, (q) => q.input("id", sql.BigInt, id).input("actor", sql.BigInt, actorId)))
      .recordset[0];

  app.get("/api/v1/me/week", async (request) => {
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const from = parseDateOnly(query.from, "From")!,
      to = parseDateOnly(query.to, "To")!;
    if (to < from || dayNumber(to) - dayNumber(from) + 1 > MAX_WINDOW_DAYS) throw new ApiError(400, "validation_failed", `Choose a window of at most ${MAX_WINDOW_DAYS} days.`);
    const today = bangkokToday();
    const read = await readWorkDays(database, actor.id, from, to, today);
    // Entries still to write, or refused before (the permission may have been granted since), are tried again.
    if (read.blocks.some((block) => block.outlookState !== "Synced")) void pushBlocks(database, graph, actor.id, actor.email, { retry: true });
    return weekResponse(read, from, to, today, graph.graphEnabled);
  });

  app.post("/api/v1/me/work-blocks", async (request, reply) => {
    const actor = await users.required(request);
    const input = parseBlockInput(request.body);
    const today = bangkokToday();
    if (!isBookable(input.date, today)) throw new ApiError(409, "work_block_out_of_range", `Time can be booked from ${bookableFrom(today)} to ${bookableTo(today)}.`);
    const work = resolveBlockWork(input.work, await readWorkDays(database, actor.id, input.date, input.date, today));
    const id = await database.transaction(async (transaction) => {
      const request = new sql.Request(transaction).input("actor", sql.BigInt, actor.id).input("date", sql.Date, input.date);
      const blocks = await dayBlocks(request);
      if (overlapsBlock(blocks, input.start, input.end)) throw new ApiError(409, "work_block_overlap", "That time is already booked. Move or shorten the other block first.");
      if (blocks.length >= MAX_BLOCKS_PER_DAY) throw new ApiError(409, "work_block_too_many", `A day holds at most ${MAX_BLOCKS_PER_DAY} blocks.`);
      request
        .input("start", sql.SmallInt, input.start)
        .input("end", sql.SmallInt, input.end)
        .input("key", sql.NVarChar(40), work.workKey)
        .input("project", sql.BigInt, work.projectId)
        .input("title", sql.NVarChar(300), work.title);
      const inserted = await request.query<Row>(`INSERT dbo.work_blocks(user_id,work_date,start_minute,end_minute,work_key,project_id,title)
        OUTPUT inserted.id VALUES(@actor,@date,@start,@end,@key,@project,@title);`);
      return Number(inserted.recordset[0]!.id);
    });
    await pushNow(actor);
    const state = await stateOf(actor.id, id);
    reply.code(201);
    return { id, outlookState: state?.outlook_state ?? "Pending", outlookError: state?.outlook_error ?? null };
  });

  app.patch("/api/v1/me/work-blocks/:id", async (request) => {
    const actor = await users.required(request);
    const id = Number((request.params as Record<string, unknown>).id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(404, "not_found", "Block not found.");
    const patch = parseBlockPatch(request.body);
    const current = (
      await database.query<Row>(
        `SELECT work_date,start_minute,end_minute,work_key,project_id,title FROM dbo.work_blocks
      WHERE id=@id AND user_id=@actor AND deleted_at IS NULL;`,
        (q) => q.input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id),
      )
    ).recordset[0];
    if (!current) throw new ApiError(404, "not_found", "Block not found.");
    const today = bangkokToday();
    const oldDate = current.work_date instanceof Date ? current.work_date.toISOString().slice(0, 10) : String(current.work_date).slice(0, 10);
    const date = patch.date ?? oldDate,
      start = patch.start ?? Number(current.start_minute),
      end = patch.end ?? Number(current.end_minute);
    checkSpan(start, end);
    if (!isBookable(oldDate, today) || !isBookable(date, today)) throw new ApiError(409, "work_block_out_of_range", `Time can be booked from ${bookableFrom(today)} to ${bookableTo(today)}.`);
    const work = patch.work
      ? resolveBlockWork(patch.work, await readWorkDays(database, actor.id, date, date, today))
      : { workKey: current.work_key == null ? null : String(current.work_key), projectId: current.project_id == null ? null : Number(current.project_id), title: String(current.title) };
    await database.transaction(async (transaction) => {
      const request = new sql.Request(transaction).input("actor", sql.BigInt, actor.id).input("date", sql.Date, date);
      if (overlapsBlock(await dayBlocks(request), start, end, id)) throw new ApiError(409, "work_block_overlap", "That time is already booked. Move or shorten the other block first.");
      request
        .input("id", sql.BigInt, id)
        .input("start", sql.SmallInt, start)
        .input("end", sql.SmallInt, end)
        .input("key", sql.NVarChar(40), work.workKey)
        .input("project", sql.BigInt, work.projectId)
        .input("title", sql.NVarChar(300), work.title);
      const updated = await request.query(`UPDATE dbo.work_blocks SET work_date=@date,start_minute=@start,end_minute=@end,work_key=@key,project_id=@project,title=@title,
          outlook_state=N'Pending',outlook_error=NULL,revision=revision+1,updated_at=SYSUTCDATETIME()
        WHERE id=@id AND user_id=@actor AND deleted_at IS NULL;`);
      if (!updated.rowsAffected[0]) throw new ApiError(404, "not_found", "Block not found.");
    });
    await pushNow(actor);
    const state = await stateOf(actor.id, id);
    return { id, outlookState: state?.outlook_state ?? "Pending", outlookError: state?.outlook_error ?? null };
  });

  app.delete("/api/v1/me/work-blocks/:id", async (request, reply) => {
    const actor = await users.required(request);
    const id = Number((request.params as Record<string, unknown>).id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(404, "not_found", "Block not found.");
    const removed = await database.query(
      `UPDATE dbo.work_blocks SET deleted_at=SYSUTCDATETIME(),outlook_state=N'Pending',outlook_error=NULL,revision=revision+1,updated_at=SYSUTCDATETIME()
      WHERE id=@id AND user_id=@actor AND deleted_at IS NULL;`,
      (q) => q.input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id),
    );
    if (!removed.rowsAffected[0]) throw new ApiError(404, "not_found", "Block not found.");
    await pushNow(actor);
    reply.code(204);
  });

  app.put("/api/v1/me/outlook-links", async (request) => {
    const actor = await users.required(request);
    const body = bodyObject(request.body);
    const outlookId = Number(body.outlookId);
    if (!Number.isSafeInteger(outlookId) || outlookId < 1) throw new ApiError(400, "validation_failed", "outlookId must be an Outlook meeting's id.");
    const workKey = body.workKey === null || body.workKey === undefined ? null : body.workKey;
    if (workKey !== null && (typeof workKey !== "string" || !WORK_KEY.test(workKey) || workKey.startsWith("Outlook-")))
      throw new ApiError(400, "validation_failed", "workKey must be one of your pieces of work, or null.");
    const meeting = (
      await database.query<Row>(`SELECT event_id,CONVERT(char(10),start_at,126) start_date FROM dbo.outlook_events WHERE id=@id AND user_id=@actor;`, (q) =>
        q.input("id", sql.BigInt, outlookId).input("actor", sql.BigInt, actor.id),
      )
    ).recordset[0];
    if (!meeting) throw new ApiError(404, "not_found", "That Outlook meeting is no longer in your calendar. Reload the week.");
    const eventId = String(meeting.event_id);
    if (workKey === null) {
      await database.query(`DELETE dbo.outlook_event_links WHERE user_id=@actor AND event_id=@event;`, (q) => q.input("actor", sql.BigInt, actor.id).input("event", sql.NVarChar(400), eventId));
      return { outlookId, workKey: null };
    }
    const date = String(meeting.start_date).slice(0, 10);
    const read = await readWorkDays(database, actor.id, date, date, bangkokToday());
    const choice = read.choices.get(workKey);
    if (!choice || choice.kind === "Outlook") throw new ApiError(422, "work_block_unknown_work", "The meeting can be tied only to work of yours. Reload the week.");
    await database.query(
      `MERGE dbo.outlook_event_links AS target USING (SELECT @actor AS user_id,@event AS event_id) AS source
        ON target.user_id=source.user_id AND target.event_id=source.event_id
      WHEN MATCHED THEN UPDATE SET work_key=@key,linked_at=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT(user_id,event_id,work_key) VALUES(@actor,@event,@key);`,
      (q) => q.input("actor", sql.BigInt, actor.id).input("event", sql.NVarChar(400), eventId).input("key", sql.NVarChar(40), workKey),
    );
    return { outlookId, workKey };
  });
}
