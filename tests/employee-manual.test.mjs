import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("employee manual is wired into the authenticated application", async () => {
  const [app, screen, activity] = await Promise.all([
    read("app/system/ProductionApp.tsx"),
    read("app/system/production/EmployeeManualScreen.tsx"),
    read("app/system/activity-client.ts"),
  ]);

  assert.match(app, /\{ view: "manual", label: "Employee Manual", icon: "book" \}/);
  assert.match(app, /view === "manual" \? <EmployeeManualScreen \/>/);
  assert.match(app, /employeeManualLabel\(language\)/);
  assert.match(screen, /\/manual\/employee-operation-manual\.html/);
  assert.match(screen, /embedded=1/);
  assert.match(screen, /download="IoT-Team-Center-Employee-Manual\.html"/);
  assert.match(screen, /TH:[\s\S]*EN:[\s\S]*JP:/);
  assert.match(activity, /manual:'Manual document'/);
});

test("public handbook is self-contained and identical to the generated artifact", async () => {
  const [generated, publicCopy] = await Promise.all([
    read("output/IoT-Team-Center-Employee-Manual.html"),
    read("public/manual/employee-operation-manual.html"),
  ]);

  assert.equal(publicCopy, generated);
  assert.equal((publicCopy.match(/@font-face/g) ?? []).length, 2);
  assert.equal((publicCopy.match(/data:font\/woff2;base64,/g) ?? []).length, 2);
  assert.doesNotMatch(publicCopy, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.match(publicCopy, /pageParams\.get\('embedded'\) === '1'/);
  assert.match(publicCopy, /\['th','en','ja'\]\.includes\(requestedLanguage\)/);
  assert.match(publicCopy, /<summary>2\.3 เปิดและค้นหาในคู่มือจากแอป/);
});
