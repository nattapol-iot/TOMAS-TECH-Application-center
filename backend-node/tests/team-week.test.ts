import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { TEAM_WEEK_SQL, registerTeamWeekRoutes, teamWeekRead } from "../src/routes/team-week.js";
import { blockLabel, teamDay, teamWeek } from "../src/team-week.js";
import type { CurrentUserService } from "../src/users.js";

const at = (date: string) => new Date(`${date}T00:00:00Z`);
/**
 * The week of Monday 23 November 2026. Person 7 booked Wiring (P-1) 08:30-12:00 and PLC (P-2) 13:00-15:00 on Wednesday,
 * where a 14:00-15:00 Outlook call takes an hour of the PLC block; a 1 MD team task on Thursday; a morning away on
 * Friday. Person 8 was on leave all week. Person 7 confirmed Monday.
 */
const sets = () =>
  [
    [],
    [
      { user_id: 7, work_date: at("2026-11-25"), start_minute: 510, end_minute: 720, work_key: "Project-11", project_id: 1, project_no: "P-1" },
      { user_id: 7, work_date: at("2026-11-25"), start_minute: 780, end_minute: 900, work_key: "Project-21", project_id: 2, project_no: "P-2" },
      { user_id: 7, work_date: at("2026-11-26"), start_minute: 780, end_minute: 840, work_key: null, project_id: null, project_no: null },
    ],
    [{ user_id: 7, is_all_day: false, start_at: "2026-11-25T14:00:00", end_at: "2026-11-25T15:00:00" }],
    [
      {
        user_id: 7,
        id: 50,
        kind: "Task",
        title: "FAT",
        project_id: 1,
        project_no: "P-1",
        start_date: at("2026-11-26"),
        end_date: at("2026-11-26"),
        time_slot: "Day",
        start_time: null,
        end_time: null,
        man_days: 1,
      },
      {
        user_id: 7,
        id: 51,
        kind: "Away",
        title: "Dentist",
        project_id: null,
        project_no: null,
        start_date: at("2026-11-27"),
        end_date: at("2026-11-27"),
        time_slot: "AM",
        start_time: null,
        end_time: null,
        man_days: 0,
      },
    ],
    [{ user_id: 8, start_date: at("2026-11-23"), end_date: at("2026-11-27") }],
    [{ user_id: 7, work_date: at("2026-11-23"), hours: 8 }],
    [{ id: 1 }],
    [{ id: 7 }, { id: 8 }],
  ] as Record<string, unknown>[][];

test("a person's day: booked blocks less the minutes a meeting took, team tasks, time away and what was confirmed", () => {
  const { input, userIds } = teamWeekRead(sets(), "2026-11-23", "2026-11-27", false);
  assert.deepEqual(userIds, [7, 8]);
  const wednesday = teamDay(7, "2026-11-25", input);
  assert.deepEqual([wednesday.booked, wednesday.meetings, wednesday.total, wednesday.free], [4.5, 1, 5.5, 2.5]);
  // P-2 is not one of the reader's projects: its block shows as work, without its number.
  assert.deepEqual(
    wednesday.chips.map((chip) => [chip.label, chip.kind, chip.hours]),
    [
      ["P-1", "project", 3.5],
      ["Meetings", "meeting", 1],
      ["Work", "work", 1],
    ],
  );
  const thursday = teamDay(7, "2026-11-26", input);
  assert.deepEqual(
    thursday.chips.map((chip) => [chip.label, chip.kind, chip.hours]),
    [
      ["P-1", "task", 8],
      ["Other", "other", 1],
    ],
  );
  assert.equal(thursday.free, 0, "a day holding more than its hours has nothing free");
  const friday = teamDay(7, "2026-11-27", input);
  assert.deepEqual([friday.away, friday.free], [4, 4]);
  assert.equal(teamDay(7, "2026-11-23", input).confirmed, 8);
  assert.equal(teamDay(7, "2026-11-24", input).confirmed, null);
  const [mine, leave] = teamWeek([7, 8], input, "2026-11-25");
  assert.deepEqual([mine!.capacity, mine!.total, mine!.away, mine!.confirmed, mine!.unconfirmedDays], [40, 14.5, 4, 8, 2]);
  assert.deepEqual([leave!.away, leave!.unconfirmedDays], [40, 0], "a day away all of it needs no confirmation");
  // An elevated reader sees every project number.
  assert.deepEqual(blockLabel({ workKey: "Project-21", projectId: 2, projectNo: "P-2" }, null), { label: "P-2", kind: "project" });
  assert.deepEqual(blockLabel({ workKey: "Estimate-6", projectId: null, projectNo: null }, new Set()), { label: "Estimate", kind: "work" });
});

function harness(t: TestContext, permitted: boolean) {
  const reads: Record<string, unknown>[] = [];
  const app = Fastify();
  registerErrorHandler(app);
  const database = {
    query: async (statement: string, bind?: (request: { input: (name: string, ...rest: unknown[]) => unknown }) => void) => {
      assert.equal(statement, TEAM_WEEK_SQL);
      const params: Record<string, unknown> = {};
      const request = {
        input(name: string, ...rest: unknown[]) {
          params[name] = rest.length > 1 ? rest[1] : rest[0];
          return request;
        },
      };
      bind?.(request);
      reads.push(params);
      return { recordsets: sets(), recordset: [] };
    },
  } as unknown as Database;
  const users = {
    demandPermission: async (_request: unknown, permission: string) => {
      assert.equal(permission, "team.board");
      if (!permitted) throw new ApiError(403, "forbidden", "No access.");
    },
    required: async () => ({ id: 7, role: "Engineer", roles: ["Engineer"] }),
  } as unknown as CurrentUserService;
  registerTeamWeekRoutes(app, database, users);
  t.after(() => app.close());
  return { app, reads };
}

test("GET team-week: team.board readers only, a window of at most four weeks, project numbers only where the reader may see them", async (t) => {
  const { app, reads } = harness(t, true);
  const response = await app.inject({ method: "GET", url: "/api/v1/team-week?from=2026-11-23&to=2026-11-27" });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.rows.length, 2);
  assert.deepEqual([reads[0]!.actor, reads[0]!.elevated], [7, false]);
  // Team planner's four weeks (Monday 23 November to Sunday 20 December) fit; a day more does not.
  assert.equal((await app.inject({ method: "GET", url: "/api/v1/team-week?from=2026-11-23&to=2026-12-20" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/v1/team-week?from=2026-11-23&to=2026-12-21" })).statusCode, 400);
  const denied = harness(t, false);
  assert.equal((await denied.app.inject({ method: "GET", url: "/api/v1/team-week?from=2026-11-23&to=2026-11-27" })).statusCode, 403);
});
