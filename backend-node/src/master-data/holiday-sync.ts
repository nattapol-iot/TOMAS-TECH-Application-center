import sql from "mssql";
import type { Database } from "../db.js";
import { workingCalendarHolidays } from "./calendar.js";
import type { MasterDataClient } from "./client.js";
import { HOLIDAY_SYNC_INTERVAL_MS, MASTER_DATA_PATHS } from "./constants.js";

export type HolidaySync = { kick: (actorId: number) => void };

// Master owns the calendar: a year it lists is replaced whole, so a holiday master drops leaves here too.
// A year master does not list (older history) is left alone.
const REPLACE_LISTED_YEARS = `
  DECLARE @rows TABLE(holiday_date date PRIMARY KEY, name nvarchar(200) NOT NULL);
  INSERT INTO @rows(holiday_date, name) SELECT CONVERT(date, [date]), name FROM OPENJSON(@holidays) WITH ([date] char(10), name nvarchar(200));
  MERGE dbo.holidays WITH (HOLDLOCK) AS target USING @rows AS source ON target.holiday_date = source.holiday_date
  WHEN MATCHED AND target.name <> source.name THEN UPDATE SET name = source.name
  WHEN NOT MATCHED BY TARGET THEN INSERT(holiday_date, name, created_by) VALUES(source.holiday_date, source.name, @actor)
  WHEN NOT MATCHED BY SOURCE AND YEAR(target.holiday_date) IN (SELECT CONVERT(int, [value]) FROM OPENJSON(@years)) THEN DELETE;`;

/**
 * Copies master's calendar into dbo.holidays, which every schedule calculation reads. Like the ERP register sync there is no
 * background job: a signed-in request starts it, at most once an hour, and the person who started it is recorded on new rows.
 */
export function createHolidaySync(client: MasterDataClient, database: Database, onError: (error: unknown) => void,
  now: () => number = Date.now): HolidaySync {
  // ponytail: per-process throttle; with several API processes each syncs on its own hour, which is harmless.
  let lastStarted = Number.NEGATIVE_INFINITY;
  let running = false;

  const run = async (actorId: number) => {
    const holidays = workingCalendarHolidays(await client.listAll(MASTER_DATA_PATHS.companyCalendar));
    // An empty answer is far more likely an outage than a calendar without a single holiday.
    if (!holidays.length) return;
    const years = [...new Set(holidays.map((holiday) => Number(holiday.date.slice(0, 4))))];
    await database.query(REPLACE_LISTED_YEARS, (request) => {
      request.input("holidays", sql.NVarChar(sql.MAX), JSON.stringify(holidays));
      request.input("years", sql.NVarChar(sql.MAX), JSON.stringify(years));
      request.input("actor", sql.BigInt, actorId);
    });
  };

  return {
    kick(actorId) {
      if (running || now() - lastStarted < HOLIDAY_SYNC_INTERVAL_MS) return;
      lastStarted = now();
      running = true;
      void run(actorId).catch(onError).finally(() => { running = false; });
    },
  };
}
