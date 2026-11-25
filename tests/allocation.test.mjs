import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { awayByDate, confirmedManDays, planningLoad, planningWeeks } from "../lib/resource-planning.ts";
import { PLAN_DISCIPLINES, draftPick, draftValue, isPlanDiscipline } from "../lib/plan-discipline.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

/*
 * Allocation (owner, 2026-11-22): one head names the people of every project. The PM adds a plan row with its discipline
 * and no member; it waits in the queue on Team overview > Allocation · weekly, where days away come off each person's
 * capacity and the hours confirmed in My Work stand beside the plan.
 */
test("days away come off the week's capacity; a morning or an afternoon is half a day", () => {
  const spans = [
    { userId: 7, start: "2026-11-23", end: "2026-11-24", slot: "Day" },
    { userId: 7, start: "2026-11-25", end: "2026-11-25", slot: "AM" },
    { userId: 7, start: "2026-11-25", end: "2026-11-25", slot: "PM" },
    { userId: 7, start: "2026-11-29", end: "2026-11-29", slot: "Day" },
    { userId: 8, start: "2026-11-23", end: "2026-11-27", slot: "Day" },
  ];
  const away = awayByDate(spans, 7);
  assert.equal(away.get("2026-11-23"), 1);
  assert.equal(away.get("2026-11-25"), 1, "two halves make a day, never more");
  assert.equal(away.has("2026-11-29"), false, "a Sunday is not a working day");
  const [week] = planningLoad([], planningWeeks("2026-11-23", 1), 5, "2026-11-23", [], away).weekly;
  assert.equal(week.awayDays, 3);
  assert.equal(week.available, 2);
  // Without days away the capacity is as before.
  assert.equal(planningLoad([], planningWeeks("2026-11-23", 1), 5, "2026-11-23").weekly[0].available, 5);
});

test("confirmed hours become man-days, 8 hours to the day, per person and week", () => {
  const rows = [
    { userId: 7, date: "2026-11-23", hours: 8 },
    { userId: 7, date: "2026-11-24", hours: 4 },
    { userId: 7, date: "2026-11-30", hours: 8 },
    { userId: 8, date: "2026-11-23", hours: 8 },
  ];
  assert.equal(confirmedManDays(rows, 7, "2026-11-23", "2026-11-29"), 1.5);
  assert.equal(confirmedManDays(rows, 9, "2026-11-23", "2026-11-29"), 0);
});

test("the draft row's one select picks a person or a discipline waiting for people", () => {
  assert.deepEqual([...PLAN_DISCIPLINES], ["Electrical", "Mechanical", "Software", "Installation"]);
  assert.deepEqual(draftPick("12"), { memberId: 12, discipline: null });
  assert.deepEqual(draftPick("d:Mechanical"), { memberId: null, discipline: "Mechanical" });
  assert.deepEqual(draftPick("d:Plumbing"), { memberId: null, discipline: null });
  assert.deepEqual(draftPick(""), { memberId: null, discipline: null });
  assert.equal(draftValue({ memberId: null, discipline: "Software" }), "d:Software");
  assert.equal(draftValue({ memberId: 4, discipline: null }), "4");
  assert.equal(isPlanDiscipline("Unassigned"), false);
});

test("migration 123 adds the discipline, checked to the four values, registered and in the fresh deploy", async () => {
  const [migration, rollback, validation, fresh] = await Promise.all([
    source("database/migrations/123_plan_row_discipline.sql"),
    source("database/rollback/123_plan_row_discipline.rollback.sql"),
    source("backend-node/src/migration-validation.ts"),
    source("database/scripts/020_deploy_fresh_database.sql"),
  ]);
  assert.match(migration, /IF NOT EXISTS \(SELECT 1 FROM dbo\.schema_versions WHERE version = 122\)/);
  assert.match(migration, /ALTER TABLE dbo\.schedule_tasks ADD discipline nvarchar\(20\) NULL;/);
  assert.match(migration, /CHECK \(discipline IS NULL OR discipline IN \(N'Electrical', N'Mechanical', N'Software', N'Installation'\)\)/);
  assert.match(migration, /VALUES \(123, N'Plan row discipline'\)/);
  assert.match(rollback, /DROP COLUMN discipline/);
  assert.match(validation, /\{ version: 123, fileName: "123_plan_row_discipline\.sql", name: "Plan row discipline" \}/);
  assert.match(fresh, /:r database\/migrations\/122_master_data_sync_account\.sql\n:r database\/migrations\/123_plan_row_discipline\.sql/);
});

test("a task under a heading may wait with no member, with or without a discipline; the head names people with the assign route", async () => {
  const [routes, service, workload, planning, cost] = await Promise.all([
    source("backend-node/src/routes/schedule.ts"),
    source("backend-node/src/schedule-service.ts"),
    source("backend-node/src/resource-workload.ts"),
    source("backend-node/src/routes/resource-planning.ts"),
    source("backend-node/src/project-cost.ts"),
  ]);
  assert.match(service, /export const PLAN_DISCIPLINES = \["Electrical", "Mechanical", "Software", "Installation"\] as const;/);
  assert.match(service, /if \(kind === "phase" && discipline\) throw new ApiError/);
  // Member optional (owner, 2026-11-24, the plan Sheet): a task under a heading may lose or never have a member.
  assert.match(routes, /if \(parent\.kind === "phase"\) return \[\];/);
  assert.doesNotMatch(routes, /"schedule_member_required", "A task under a main heading/);
  assert.match(routes, /if \(input\.discipline === undefined\) input\.discipline = existing\.discipline \?\? null;/, "an older client keeps the row's discipline");
  // The assign route: plan owners only, people join the project, only the PICs change, the people are told.
  const assign = routes.slice(routes.indexOf('app.post("/api/v1/schedule/tasks/:id/assign"'), routes.indexOf('app.delete("/api/v1/schedule/tasks/:id"'));
  assert.ok(assign.length > 500, "the assign route exists");
  assert.match(assign, /demandRowPlanOwner\(transaction, database, task\.projectId, actor\)/);
  assert.match(
    assign,
    /await ensureMembers\(transaction, task\.projectId, userIds, actor\.id\);\s*await validatePics\(transaction, project, userIds\);\s*const added = await replacePics\(transaction, id, userIds\);/,
  );
  assert.match(assign, /hasPendingRequest\(transaction, id\)/);
  assert.match(assign, /queueTaskAssignmentNotices/);
  assert.doesNotMatch(assign, /plan_start=|plan_man_days=/, "dates and effort stay as planned");
  // The workload carries a plan row's task id and discipline, the days away and the confirmed hours.
  assert.match(workload, /taskId: task\.id,\s*\.\.\.\(task\.discipline \? \{ discipline: task\.discipline \} : \{\}\),/);
  assert.match(planning, /SET NOCOUNT ON;\$\{PLANNING_SQL\}\$\{WORKLOAD_SQL\}\$\{ALLOCATION_SQL\}/);
  assert.match(planning, /t\.kind=N'Away' AND t\.status<>N'Cancelled'/);
  assert.match(planning, /v\.kind IN\(N'Leave',N'Training',N'Other Assignment',N'Unavailable'\)/);
  assert.match(planning, /FROM dbo\.work_hours h/);
  assert.match(planning, /away: awayRows\s*\.filter\(ours\)/, "My Work reads only the caller's own");
  // Projects > Cost: a typed discipline comes before the PIC's department.
  assert.match(cost, /const typed = LABOR_DISCIPLINES\.find\(\(discipline\) => discipline !== "Unassigned" && discipline === row\.discipline\);\s*if \(typed\) return \[typed\];/);
});

test("the Plan asks for people by discipline: the Sheet's member select and the Edit row field", async () => {
  const [plan, sheet] = await Promise.all([source("app/system/production/PlanningPricingScreens.tsx"), source("app/system/production/PlanSheet.tsx")]);
  assert.match(sheet, /<optgroup label=\{t\("Plan\.waitingForPeople"\)\}>/);
  assert.doesNotMatch(plan, /Plan\.memberRequired/, "a member is optional (owner, 2026-11-24)");
  assert.match(plan, /<label className="field span-2" data-guide="plan\.discipline">/);
});

test("Allocation · weekly: the queue, the assign dialog, days away and confirmed hours in the table", async () => {
  const [screen, copy, guides] = await Promise.all([
    source("app/system/production/ResourcePlanningScreen.tsx"),
    source("app/system/production/team-board-copy.ts"),
    source("app/system/production/guide-catalog.ts"),
  ]);
  assert.match(screen, /const waiting = unassigned\.filter\(\(item\) => item\.type === "Project" && item\.taskId !== undefined && isOpenWork\(item\)\);/);
  assert.match(screen, /<Panel title="Alloc\.queueTitle" subtitle="Alloc\.queueSubtitle" guide="alloc\.queue" flush>/);
  assert.match(screen, /data-guide="alloc\.assign"/);
  assert.match(screen, /const canAssign = canPlan && manages;/);
  assert.match(screen, /planningLoad\(items, weeks, capacity, todayIso, data\.holidays, away\)/);
  assert.match(screen, /confirmedManDays\(data\.actuals \?\? \[\], user\.id, week\.start, week\.end\)/);
  // The dialog: the row's discipline first (Installation takes anyone), then the freest over the row's weeks.
  assert.match(screen, /const matches = !wanted \|\| wanted === "Installation" \|\| disciplineOfDepartment\(user\.department\) === wanted;/);
  assert.match(screen, /\.sort\(\(a, b\) => Number\(b\.matches\) - Number\(a\.matches\) \|\| b\.free - a\.free/);
  assert.match(screen, /await assignPlanRow\(item\.taskId, picked\);/);
  // Renamed when Team overview went to two tabs (2026-11-23).
  assert.match(copy, /\["TeamBoard\.tabWeekly", "Allocation · 12 weeks", "จัดคน 12 สัปดาห์", "要員配置・12週"\]/);
  assert.match(guides, /id: "allocation-assign"/);
});
