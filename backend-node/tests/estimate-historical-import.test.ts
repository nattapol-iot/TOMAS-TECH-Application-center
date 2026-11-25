import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/errors.js";
import { mayImportForProject, parseHistoricalImport } from "../src/routes/estimate-historical-import.js";
import type { CurrentUser } from "../src/types.js";

const TODAY = "2026-11-25";

const body = (overrides: Record<string, unknown> = {}) => ({
  sourceName: "PJ250040_Estimate cost_R1.xlsx",
  sourceRevision: "R1",
  sourceDate: "2025-03-10",
  sourceTotal: 2500,
  hoursPerDay: 8,
  lines: [
    { kind: "cost", categoryCode: "01", module: "Panel", itemCode: "PLC-1", description: "PLC", quantity: 2, unit: "pc", unitCost: 1000, source: "Summary cost!9" },
    { kind: "manhour", categoryCode: "06", module: "Electrical labour", itemCode: "XL-Sum-10", description: "Design", quantity: 1, unit: "Day", unitCost: 500, source: "Summary cost!10" },
  ],
  projectId: 12,
  ownerId: 7,
  dueDate: "2026-12-02",
  contingencyRate: 0,
  ...overrides,
});

const rejects = (value: Record<string, unknown>, pattern: RegExp) =>
  assert.throws(
    () => parseHistoricalImport(value, TODAY),
    (error: unknown) => error instanceof ApiError && pattern.test(error.message),
  );

test("an old workbook dated in the past, for one project and owner, is accepted", () => {
  const parsed = parseHistoricalImport(body(), TODAY);
  assert.equal(parsed.projectId, 12);
  assert.equal(parsed.ownerId, 7);
  assert.equal(parsed.sourceDate, "2025-03-10");
  assert.equal(parsed.lines.length, 2);
  assert.equal(parsed.contingencyRate, 0);
  assert.match(parsed.sourceHash, /^[a-f0-9]{64}$/);
});

test("the workbook date is a past date within twenty years, and the due date starts today", () => {
  rejects(body({ sourceDate: "2026-11-26" }), /past date/);
  rejects(body({ sourceDate: "2005-01-01" }), /past date/);
  assert.equal(parseHistoricalImport(body({ sourceDate: TODAY }), TODAY).sourceDate, TODAY);
  rejects(body({ dueDate: "2026-11-24" }), /Due date/);
  rejects(body({ dueDate: "2032-01-01" }), /Due date/);
});

test("rows must add up to the workbook total, and a project and owner are required", () => {
  rejects(body({ sourceTotal: 2600 }), /does not match/);
  rejects(body({ projectId: undefined }), /Project/);
  rejects(body({ ownerId: 0 }), /owner/i);
  rejects(body({ contingencyRate: 120 }), /Contingency/);
});

test("the project's manager or lead engineer imports for it; an engineering manager or admin for any project", () => {
  const user = (id: number, role: string, roles: string[] = [role]) => ({ id, role, roles }) as unknown as CurrentUser;
  const project = { managerId: 3, leadEngineerId: 4 };
  assert.ok(mayImportForProject(user(3, "Project Manager"), project));
  assert.ok(mayImportForProject(user(4, "Engineer"), project));
  assert.ok(!mayImportForProject(user(5, "Engineer"), project));
  assert.ok(mayImportForProject(user(5, "Engineering Manager"), project));
  assert.ok(mayImportForProject(user(6, "Engineer", ["Engineer", "Admin"]), project));
});
