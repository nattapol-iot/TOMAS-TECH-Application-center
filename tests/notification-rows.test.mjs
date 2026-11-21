import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { noticeRows, supportRowText } from "../lib/notification-rows.ts";
import { supportLabel } from "../app/system/support-copy.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const th = (key) => supportLabel(key, "TH");
const en = (key) => supportLabel(key, "EN");

let nextId = 100;
const support = (ticket, event, status = null, subject = "ระบบไม่คำนวณ Working day") => ({
  id: nextId++, kind: "SUPPORT_UPDATE", title: "Support Center", detail: "Open Support Center to view the update.",
  entityType: "SupportTicket", entityId: ticket, isRead: false, createdAt: "2026-11-19T08:59:58Z",
  support: { ticketNo: `SUP-2026-${String(ticket).padStart(5, "0")}`, subject, event, status, actorName: "Pattanasak Chaonchom" },
});

// Team report 2026-11-21: a support member took, answered and resolved two tickets within a second, and the
// reporter's bell showed six rows that all read "มีความคืบหน้าเรื่องที่แจ้ง / ดูเรื่องที่แจ้ง".
test("one support ticket is one bell row that says which ticket and what happened", () => {
  const project = { id: 1, kind: "PROJECT_CREATED", title: "Project PJ250014 · NIPPN - Production", detail: "You were added", entityType: "Project", entityId: 14, isRead: false, createdAt: "2026-11-19T08:00:00Z" };
  // The API sends newest first.
  const items = [
    support(13, "StatusChanged", "Resolved"), support(13, "Comment"), support(13, "Assigned"),
    support(12, "StatusChanged", "Resolved", "Plan days"), support(12, "Comment", null, "Plan days"), support(12, "Assigned", null, "Plan days"),
    project,
  ];
  const rows = noticeRows(items);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => !row.isRead).length, 3, "the badge counts rows, not events");
  assert.deepEqual(rows[0].ids, items.slice(0, 3).map((item) => item.id), "a click marks every event of the ticket read");
  assert.equal(rows[0].item, items[0], "the newest event decides time and place");
  assert.deepEqual(supportRowText(rows[0], th), {
    title: "SUP-2026-00013 · ระบบไม่คำนวณ Working day",
    detail: "Pattanasak Chaonchom: เปลี่ยนผู้รับผิดชอบ · ข้อความใหม่ · สถานะ: แก้ไขแล้ว",
  });
  assert.equal(supportRowText(rows[0], en).detail, "Pattanasak Chaonchom: Assignment updated · New message · Status: Resolved");
  assert.equal(supportRowText(rows[1], th).title, "SUP-2026-00012 · Plan days");
  assert.equal(rows[2].item, project, "other notifications are left as they are");
});

test("read and unread events of one ticket stay apart, repeats count up", () => {
  const older = { ...support(13, "Created"), isRead: true };
  const rows = noticeRows([support(13, "Comment"), support(13, "Comment"), older]);
  assert.equal(rows.length, 2);
  assert.equal(supportRowText(rows[0], th).detail, "Pattanasak Chaonchom: ข้อความใหม่ ×2");
  assert.equal(supportRowText(rows[1], th).detail, "Pattanasak Chaonchom: เรื่องใหม่");
});

test("without the subject or the event the row falls back to the ticket number or the old text", () => {
  const hidden = support(13, "Comment", null, null);
  assert.equal(supportRowText(noticeRows([hidden])[0], th).title, "SUP-2026-00013");
  const bare = { ...support(13, null), support: null };
  assert.deepEqual(supportRowText(noticeRows([bare])[0], th), { title: "มีความคืบหน้าเรื่องที่แจ้ง", detail: "ดูเรื่องที่แจ้ง" });
  const thanks = { ...support(13, "Recognition"), kind: "SUPPORT_RECOGNITION", support: null };
  assert.equal(supportRowText(noticeRows([thanks])[0], th).title, "มีคำขอบคุณหรือคะแนนจากทีมดูแล");
});

test("the notification API gives the subject only to readers who can still open the ticket", async () => {
  const route = await read("backend-node/src/routes/visit-master.ts");
  assert.match(route, /CASE WHEN t\.reporter_id=@actor OR @supportManage=1 OR EXISTS\(SELECT 1 FROM dbo\.support_members m WHERE m\.user_id=@actor AND m\.category_code=t\.category_code\) THEN t\.subject END support_subject/);
  assert.match(route, /e\.id=TRY_CONVERT\(bigint,SUBSTRING\(n\.dedupe_key,9,30\)\) AND e\.ticket_id=t\.id/);
  // The event body (a reply, or an internal note) never reaches the bell.
  assert.doesNotMatch(route.slice(route.indexOf('app.get("/api/v1/me/notifications/"'), route.indexOf('app.post("/api/v1/me/notifications/read"')), /e\.body/);
});

test("the bell shows the folded rows and marks a whole row read", async () => {
  const app = await read("app/system/ProductionApp.tsx");
  assert.match(app, /const notificationRows = useMemo\(\(\) => noticeRows\(notifications\), \[notifications\]\);/);
  assert.match(app, /JSON\.stringify\(\{ ids: row\.ids, all: false \}\)/);
  assert.match(app, /supportRowText\(row, \(key\) => supportLabel\(key, language\)\)/);
});
