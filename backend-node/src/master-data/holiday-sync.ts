import sql from "mssql";
import type { Database } from "../db.js";
import { workingCalendarHolidays } from "./calendar.js";
import type { MasterDataClient } from "./client.js";
import { HOLIDAY_REFRESH_MIN_GAP_MS, HOLIDAY_SYNC_FIRST_RUN_MS, HOLIDAY_SYNC_INTERVAL_MS, MASTER_DATA_PATHS } from "./constants.js";

export type HolidaySync = {
  start: () => void;
  stop: () => void;
  /** A signed-in request asks for fresh holidays; it syncs unless a sync started within the last few minutes. */
  refresh: () => void;
};

// Master owns the calendar: a year it lists is replaced whole, so a holiday master drops leaves here too.
// A year master does not list (older history) is left alone. created_by stays null on rows master supplied.
// A holiday new to the app that falls on open planned work tells the project's manager and lead engineer (task doc 4.5):
// once per project and day (the dedupe key), on rows by their stored dates; the plan's follow-up list then asks to move
// each row's end or keep it (dbo.schedule_holiday_decisions, migration 130). Nothing moves on its own.
// One transaction: a bell that fails to go in rolls the calendar back too, so the next sync still sees the holiday as new.
export const REPLACE_LISTED_YEARS = `
  SET XACT_ABORT ON;
  BEGIN TRANSACTION;
  DECLARE @rows TABLE(holiday_date date PRIMARY KEY, name nvarchar(200) NOT NULL);
  DECLARE @changes TABLE(action nvarchar(10) NOT NULL, holiday_date date NULL, name nvarchar(200) NULL);
  INSERT INTO @rows(holiday_date, name) SELECT CONVERT(date, [date]), name FROM OPENJSON(@holidays) WITH ([date] char(10), name nvarchar(200));
  MERGE dbo.holidays WITH (HOLDLOCK) AS target USING @rows AS source ON target.holiday_date = source.holiday_date
  WHEN MATCHED AND target.name <> source.name THEN UPDATE SET name = source.name
  WHEN NOT MATCHED BY TARGET THEN INSERT(holiday_date, name) VALUES(source.holiday_date, source.name)
  WHEN NOT MATCHED BY SOURCE AND YEAR(target.holiday_date) IN (SELECT CONVERT(int, [value]) FROM OPENJSON(@years)) THEN DELETE
  OUTPUT $action, inserted.holiday_date, inserted.name INTO @changes;
  WITH hits AS (
    SELECT a.holiday_date, MAX(a.name) holiday_name, p.id project_id, MAX(p.project_no) project_no, COUNT(*) row_count,
      MAX(p.manager_id) manager_id, MAX(p.lead_engineer_id) lead_engineer_id
    FROM @changes a
    JOIN dbo.schedule_tasks t ON t.deleted_at IS NULL AND t.status <> N'Done' AND t.plan_start IS NOT NULL
      AND a.holiday_date BETWEEN t.plan_start AND DATEADD(day, ISNULL(t.plan_days, 1) - 1, t.plan_start)
      AND NOT EXISTS (SELECT 1 FROM dbo.schedule_tasks c WHERE c.parent_id = t.id AND c.deleted_at IS NULL)
    JOIN dbo.projects p ON p.id = t.project_id AND p.deleted_at IS NULL AND p.status <> N'Closed'
    WHERE a.action = N'INSERT' AND a.holiday_date >= CONVERT(date, SYSUTCDATETIME())
    GROUP BY a.holiday_date, p.id
  ), told AS (
    SELECT DISTINCT u.id user_id, h.project_id, h.project_no, h.holiday_date, h.holiday_name, h.row_count,
      LEFT(CONCAT(N'project-holiday:', h.project_id, N':', CONVERT(char(10), h.holiday_date, 23)), 200) dedupe_key
    FROM hits h
    CROSS APPLY (VALUES (h.manager_id), (h.lead_engineer_id)) person(id)
    JOIN dbo.users u ON u.id = person.id AND u.is_active = 1 AND u.deleted_at IS NULL
  )
  INSERT INTO dbo.notifications(user_id, kind, title, detail, entity_type, entity_id, dedupe_key)
  SELECT x.user_id, N'PROJECT_HOLIDAY_ON_WORK', LEFT(CONCAT(x.project_no, N' · วันหยุดใหม่ตรงกับงานในแผน'), 300),
    CONCAT(x.holiday_name, N' ', CONVERT(char(10), x.holiday_date, 23), N' ตรงกับงาน ', x.row_count,
      N' แถว เปิดแผนงาน > ตาราง > ต้องตาม เพื่อเลื่อนวันจบหรือคงไว้ · A new company holiday falls on ', x.row_count,
      N' planned rows: open the plan Sheet > To follow up to move each end or keep it.'),
    N'Project', x.project_id, x.dedupe_key
  FROM told x
  WHERE NOT EXISTS (SELECT 1 FROM dbo.notifications n WITH (UPDLOCK, HOLDLOCK) WHERE n.user_id = x.user_id AND n.dedupe_key = x.dedupe_key);
  COMMIT TRANSACTION;`;

/**
 * Copies master's calendar into dbo.holidays, which every schedule calculation reads: shortly after start, then hourly, and
 * when people use the app, so a holiday HR changes in master shows within minutes.
 */
export function createHolidaySync(client: MasterDataClient, database: Database, onError: (error: unknown) => void, now: () => number = Date.now): HolidaySync {
  let timer: NodeJS.Timeout | null = null,
    firstRun: NodeJS.Timeout | null = null,
    running = false;
  let lastStarted = Number.NEGATIVE_INFINITY;

  const run = async () => {
    const holidays = workingCalendarHolidays(await client.listAll(MASTER_DATA_PATHS.companyCalendar));
    // An empty answer is far more likely an outage than a calendar without a single holiday.
    if (!holidays.length) return;
    const years = [...new Set(holidays.map((holiday) => Number(holiday.date.slice(0, 4))))];
    await database.query(REPLACE_LISTED_YEARS, (request) => {
      request.input("holidays", sql.NVarChar(sql.MAX), JSON.stringify(holidays));
      request.input("years", sql.NVarChar(sql.MAX), JSON.stringify(years));
    });
  };

  const tick = () => {
    if (running) return;
    running = true;
    lastStarted = now();
    void run()
      .catch(onError)
      .finally(() => {
        running = false;
      });
  };

  return {
    refresh() {
      if (now() - lastStarted >= HOLIDAY_REFRESH_MIN_GAP_MS) tick();
    },
    start() {
      if (timer) return;
      timer = setInterval(tick, HOLIDAY_SYNC_INTERVAL_MS);
      timer.unref();
      firstRun = setTimeout(tick, HOLIDAY_SYNC_FIRST_RUN_MS);
      firstRun.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      if (firstRun) clearTimeout(firstRun);
      timer = null;
      firstRun = null;
    },
  };
}
