import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { changeText, planChanges } from "../app/system/production/schedule-change-text.ts";

// The UX audit of the live site, 2026-11-26 (Codex, report.html): F02-F12.
const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");
const context = { lang: "TH", t: (key) => ({ "In Progress": "กำลังทำ", "Not Started": "ยังไม่เริ่ม" })[key] ?? key, day: (iso) => `d:${iso}` };

test("F06: a plan change reads in words: the parts that changed, statuses translated, ids only named", () => {
  const before = JSON.stringify({ parentId: 1808, sortOrder: 10, name: "Order hardware", planStart: "2026-11-23", planDays: 1, picUserIds: [10], planManDays: 0.2, discipline: null });
  const after = JSON.stringify({ parentId: 1808, sortOrder: 10, name: "Order hardware", planStart: "2026-11-26", planDays: 14, picUserIds: [10], planManDays: 0.2, discipline: null });
  assert.equal(planChanges(before, after, context), "วันเริ่ม d:2026-11-23 → d:2026-11-26 · จำนวนวัน 1 วัน → 14 วัน");
  assert.equal(changeText({ field: "plan", from: before, to: after }, context), "ปรับแผน: วันเริ่ม d:2026-11-23 → d:2026-11-26 · จำนวนวัน 1 วัน → 14 วัน");
  assert.equal(changeText({ field: "status", from: "In Progress", to: "Not Started" }, context), "สถานะ: กำลังทำ → ยังไม่เริ่ม");
  assert.equal(changeText({ field: "percent_complete", from: "40", to: "60" }, context), "ความคืบหน้า: 40% → 60%");
  assert.equal(changeText({ field: "actual_finish", from: null, to: "2026-11-25" }, context), "วันเสร็จจริง: – → d:2026-11-25");
  // A row moved under another heading: named, not shown as ids.
  const moved = planChanges(JSON.stringify({ parentId: 1, sortOrder: 1 }), JSON.stringify({ parentId: 2, sortOrder: 4 }), context);
  assert.equal(moved, "ย้ายไปใต้หัวข้ออื่น · ลำดับ");
  // Members by name when known, else a count.
  assert.equal(planChanges(JSON.stringify({ picUserIds: [] }), JSON.stringify({ picUserIds: [15] }), { ...context, personName: (id) => (id === 15 ? "Warit K." : undefined) }), "ผู้ทำ – → Warit K.");
  assert.equal(changeText({ field: "plan", from: "not json", to: "{}" }, context), "ปรับแผน");
});

test("F06: My Work's history and a row's history use the shared words, no raw JSON", async () => {
  const plan = await source("app/system/production/PlanningPricingScreens.tsx");
  assert.match(plan, /import \{ changeLabel, changeText \} from "\.\/schedule-change-text";/);
  assert.doesNotMatch(plan, /myWorkAuditFieldLabel|MY_WORK_AUDIT_FIELD_LABELS/);
  assert.equal((plan.match(/const changeWords = useChangeWords\(bootstrap\.team\);/g) ?? []).length, 3);
  const core = await source("app/system/production/CoreScreens.tsx");
  assert.match(core, /return `\$\{changeText\(entry, context\)\}\$\{comment\}`;/);
});

test("F05: Create project compares the draft with the form as it opens, defaults included", async () => {
  const core = await source("app/system/production/CoreScreens.tsx");
  assert.match(core, /useDraftField<CreateProjectInput>\(draftKey, "form", opened\?\.form \?\? emptyForm\)/);
  assert.match(core, /form: withDefaults\(emptyForm\),/);
});

test("F04: Create project offers people who can sign in, and a shared name says whose it is", async () => {
  const route = await source("backend-node/src/routes/projects.ts");
  assert.match(route, /SELECT u\.id,u\.name,u\.department,[\s\S]*?WHERE u\.is_active=1 AND u\.deleted_at IS NULL\s*GROUP BY u\.id,u\.name,u\.department/);
  const core = await source("app/system/production/CoreScreens.tsx");
  assert.equal((core.match(/\{personLabel\(member\)\}/g) ?? []).length, 2);
});

test("F02 F03: the waiting queue follows the page's search, shows its first rows, keeps no-MD rows apart", async () => {
  const screen = await source("app/system/production/ResourcePlanningScreen.tsx");
  assert.match(screen, /const waitingFound = waiting\.filter\(\(item\) => !queueQuery \|\| \[item\.reference, item\.title, item\.customer\]/);
  assert.match(screen, /const waitingListed = queueAll \? waitingShown : waitingShown\.slice\(0, QUEUE_PREVIEW\);/);
  assert.match(screen, /Number\(noEffort\(a\)\) - Number\(noEffort\(b\)\)/);
});

test("F07 F08 F09 F10 F11 F12: words that match what the screen does", async () => {
  const board = await source("app/system/production/TeamBoard.tsx");
  assert.match(board, /draft\.kind === "Away"\s*\? draft\.assigneeIds\.length\s*\? \[\]\s*: \["TeamBoard\.people"\]/);
  const boardCopy = await source("app/system/production/team-board-copy.ts");
  assert.match(boardCopy, /"ต้องกรอก: เรื่อง วันที่ เป็นงานไหน และรายละเอียดงานเบื้องต้น/);
  assert.match(boardCopy, /\["TeamBoard\.tabWeekly", "Allocation by week", "จัดคนรายสัปดาห์"/);
  const docs = await source("app/system/tomas-ui/ProjectDocumentsTab.tsx");
  assert.doesNotMatch(docs, /Portfolio\.noMatch/);
  const i18n = await source("app/system/i18n.ts");
  for (const key of ["Add member *", "Add to project", "Everyone who can see this project", "ProjectDocs.noMatchTitle"]) assert.ok(i18n.includes(`"${key}": {`), key);
  const cost = await source("app/system/production/project-cost-copy.ts");
  assert.match(cost, /"คน \(ตามแผนหรือคาดตอนจบ\) ใช้ \{percent\}% ของงบ เกิน \{days\} man-day"/);
  const core = await source("app/system/production/CoreScreens.tsx");
  assert.match(core, /const stageCounts = countBy\(\{ status: null \}, \(item\) => item\.status\);/);
  assert.match(core, /\{uiText\(value\)\}\n\s*<\/option>/, "Edit project names the stages in the reader's language");
});
