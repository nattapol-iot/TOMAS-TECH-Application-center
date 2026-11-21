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
const REPLACE_LISTED_YEARS = `
  DECLARE @rows TABLE(holiday_date date PRIMARY KEY, name nvarchar(200) NOT NULL);
  INSERT INTO @rows(holiday_date, name) SELECT CONVERT(date, [date]), name FROM OPENJSON(@holidays) WITH ([date] char(10), name nvarchar(200));
  MERGE dbo.holidays WITH (HOLDLOCK) AS target USING @rows AS source ON target.holiday_date = source.holiday_date
  WHEN MATCHED AND target.name <> source.name THEN UPDATE SET name = source.name
  WHEN NOT MATCHED BY TARGET THEN INSERT(holiday_date, name) VALUES(source.holiday_date, source.name)
  WHEN NOT MATCHED BY SOURCE AND YEAR(target.holiday_date) IN (SELECT CONVERT(int, [value]) FROM OPENJSON(@years)) THEN DELETE;`;

/**
 * Copies master's calendar into dbo.holidays, which every schedule calculation reads: shortly after start, then hourly, and
 * when people use the app, so a holiday HR changes in master shows within minutes.
 */
export function createHolidaySync(client: MasterDataClient, database: Database, onError: (error: unknown) => void,
  now: () => number = Date.now): HolidaySync {
  let timer: NodeJS.Timeout | null = null, firstRun: NodeJS.Timeout | null = null, running = false;
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
    void run().catch(onError).finally(() => { running = false; });
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
