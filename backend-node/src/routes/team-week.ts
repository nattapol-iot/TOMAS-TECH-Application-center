import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { dateOnly, parseDateOnly } from "../http.js";
import { bangkokToday } from "../issue-batches.js";
import { isProjectElevated } from "../project-scope.js";
import { teamWeek, type WeekAway, type WeekBlock, type WeekInput, type WeekMeeting, type WeekTask } from "../team-week.js";
import type { CurrentUserService } from "../users.js";
import { HOURS_PER_DAY, MAX_WINDOW_DAYS, dayNumber } from "../work-days.js";

/*
 * GET /api/v1/team-week?from&to   Team overview > Team week: everyone's days in hours, from My week blocks, Outlook
 *                                 meetings, team tasks and time away, with the hours each person confirmed.
 * Read with team.board, like the rest of Team overview. Rules: team-week.ts.
 */

type Row = Record<string, unknown>;

export const TEAM_WEEK_SQL = `SET NOCOUNT ON;
      SELECT holiday_date FROM dbo.holidays WHERE holiday_date BETWEEN @from AND @to;
      SELECT b.user_id,b.work_date,b.start_minute,b.end_minute,b.work_key,b.project_id,p.project_no
      FROM dbo.work_blocks b LEFT JOIN dbo.projects p ON p.id=b.project_id AND p.deleted_at IS NULL
      WHERE b.deleted_at IS NULL AND b.work_date BETWEEN @from AND @to;
      SELECT e.user_id,e.is_all_day,CONVERT(char(19),e.start_at,126) start_at,CONVERT(char(19),e.end_at,126) end_at
      FROM dbo.outlook_events e
      WHERE e.start_at<DATEADD(day,1,CONVERT(datetime2(0),@to)) AND e.end_at>CONVERT(datetime2(0),@from)
        AND NOT EXISTS(SELECT 1 FROM dbo.work_blocks wb WHERE wb.user_id=e.user_id AND wb.outlook_event_id=e.event_id);
      SELECT a.user_id,t.id,t.kind,t.title,t.project_id,p.project_no,t.start_date,t.end_date,t.time_slot,
        CONVERT(char(5),t.start_time,108) start_time,CONVERT(char(5),t.end_time,108) end_time,t.man_days
      FROM dbo.team_tasks t JOIN dbo.team_task_assignees a ON a.task_id=t.id
      LEFT JOIN dbo.projects p ON p.id=t.project_id AND p.deleted_at IS NULL
      WHERE t.deleted_at IS NULL AND t.status<>N'Cancelled' AND t.end_date>=@from AND t.start_date<=@to;
      SELECT e.user_id,CONVERT(date,SWITCHOFFSET(e.starts_at,'+07:00')) start_date,
        CONVERT(date,SWITCHOFFSET(DATEADD(second,-1,e.ends_at),'+07:00')) end_date
      FROM dbo.engineer_availability e
      WHERE e.deleted_at IS NULL AND CONVERT(date,SWITCHOFFSET(e.ends_at,'+07:00'))>=@from AND CONVERT(date,SWITCHOFFSET(e.starts_at,'+07:00'))<=@to;
      SELECT d.user_id,d.work_date,(SELECT COALESCE(SUM(h.hours),0) FROM dbo.work_hours h WHERE h.user_id=d.user_id AND h.work_date=d.work_date) hours
      FROM dbo.work_days d WHERE d.work_date BETWEEN @from AND @to;
      SELECT p.id FROM dbo.projects p
      WHERE p.deleted_at IS NULL AND @elevated=0 AND (p.manager_id=@actor OR p.lead_engineer_id=@actor
        OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor));
      SELECT u.id FROM dbo.users u WHERE u.is_active=1 AND u.deleted_at IS NULL;`;

const day = (row: Row, key: string) => dateOnly((row[key] ?? null) as Date | string | null)!;
const text = (row: Row, key: string) => String(row[key] ?? "");
const optionalId = (row: Row, key: string) => (row[key] === null || row[key] === undefined ? null : Number(row[key]));

/** The recordsets of TEAM_WEEK_SQL as the week's input, and the people to show. */
export function teamWeekRead(sets: Row[][], from: string, to: string, elevated: boolean): { input: WeekInput; userIds: number[] } {
  const [holidayRows = [], blockRows = [], meetingRows = [], taskRows = [], awayRows = [], dayRows = [], projectRows = [], userRows = []] = sets;
  const blocks: WeekBlock[] = blockRows.map((row) => ({
    userId: Number(row.user_id),
    date: day(row, "work_date"),
    start: Number(row.start_minute),
    end: Number(row.end_minute),
    workKey: row.work_key == null ? null : text(row, "work_key"),
    projectId: optionalId(row, "project_id"),
    projectNo: row.project_no == null ? null : text(row, "project_no"),
  }));
  const meetings: WeekMeeting[] = meetingRows.map((row, index) => ({
    id: index + 1,
    userId: Number(row.user_id),
    subject: null,
    allDay: Boolean(row.is_all_day),
    start: text(row, "start_at"),
    end: text(row, "end_at"),
  }));
  const tasks: WeekTask[] = taskRows.map((row) => ({
    userId: Number(row.user_id),
    id: Number(row.id),
    kind: row.kind === "Away" ? "Away" : row.kind === "Appointment" ? "Appointment" : "Task",
    title: text(row, "title"),
    projectId: optionalId(row, "project_id"),
    projectNo: row.project_no == null ? null : text(row, "project_no"),
    start: day(row, "start_date"),
    end: day(row, "end_date"),
    slot: text(row, "time_slot"),
    startTime: row.start_time ? text(row, "start_time").trim() : null,
    endTime: row.end_time ? text(row, "end_time").trim() : null,
    manDays: Number(row.man_days ?? 0),
  }));
  const away: WeekAway[] = awayRows.map((row) => ({ userId: Number(row.user_id), start: day(row, "start_date"), end: day(row, "end_date") }));
  const confirmed = new Map(dayRows.map((row) => [`${Number(row.user_id)}|${day(row, "work_date")}`, Number(row.hours)] as const));
  return {
    input: {
      from,
      to,
      holidays: new Set(holidayRows.map((row) => day(row, "holiday_date"))),
      blocks,
      meetings,
      tasks,
      away,
      confirmed,
      visibleProjects: elevated ? null : new Set(projectRows.map((row) => Number(row.id))),
    },
    userIds: userRows.map((row) => Number(row.id)),
  };
}

export function registerTeamWeekRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/team-week", async (request) => {
    await users.demandPermission(request, "team.board");
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const from = parseDateOnly(query.from, "From")!,
      to = parseDateOnly(query.to, "To")!;
    if (to < from || dayNumber(to) - dayNumber(from) + 1 > MAX_WINDOW_DAYS) throw new ApiError(400, "validation_failed", `Choose a window of at most ${MAX_WINDOW_DAYS} days.`);
    const elevated = isProjectElevated(actor);
    const result = await database.query<Row>(TEAM_WEEK_SQL, (q) => q.input("actor", sql.BigInt, actor.id).input("elevated", sql.Bit, elevated).input("from", sql.Date, from).input("to", sql.Date, to));
    const { input, userIds } = teamWeekRead(result.recordsets as unknown as Row[][], from, to, elevated);
    const today = bangkokToday();
    return { from, to, today, hoursPerDay: HOURS_PER_DAY, rows: teamWeek(userIds, input, today) };
  });
}
