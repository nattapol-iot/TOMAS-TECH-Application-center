import assert from "node:assert/strict";
import test from "node:test";
import { laborPackageInput, laborPackagePermissions, suggestedCopyCode } from "../lib/labor-package-master.ts";

const detail = {
  id: 7, code: "ENG-COMM", name: "Commissioning", costType: "Engineering", department: "Engineering",
  projectType: "Machine", description: "Reusable commissioning work", status: "Draft", revision: 3,
  createdByName: "Maker", updatedByName: "Editor", createdAt: "2026-09-10", updatedAt: "2026-09-11",
  lineCount: 1, referenceTotal: 25000, referenceManDays: 5, rowVersion: "AAAA",
  lines: [{
    id: 71, sortOrder: 4, activity: "Site test", department: "Software", level: "Senior Engineer",
    costType: "Engineering", provider: "Supplier", rateId: 12, rateCode: "ENG-SR", rateStillEffective: false,
    rateBasis: "Hourly", defaultEngineers: 2, defaultManDays: 1.25, defaultHours: 10,
    defaultHoursPerDay: 8, referenceDailyRate: 5000, defaultErpCategory: "Service", remark: "Keep this note",
  }],
};

test("master save mapping preserves every writable package and activity field", () => {
  assert.deepEqual(laborPackageInput(detail), {
    code: "ENG-COMM", name: "Commissioning", costType: "Engineering", department: "Engineering",
    projectType: "Machine", description: "Reusable commissioning work", status: "Draft",
    lines: [{
      activity: "Site test", department: "Software", level: "Senior Engineer", costType: "Engineering",
      provider: "Supplier", rateId: 12, rateBasis: "Hourly", defaultEngineers: 2, defaultManDays: 1.25,
      defaultHours: 10, defaultHoursPerDay: 8, referenceDailyRate: 5000,
      defaultErpCategory: "Service", remark: "Keep this note",
    }],
  });
});

test("publish needs estimate.write and master.write while draft edit needs estimate.write", () => {
  assert.deepEqual(laborPackagePermissions(["estimate.write"]), { canEditDraft: true, canPublish: false });
  assert.deepEqual(laborPackagePermissions(["master.write"]), { canEditDraft: false, canPublish: false });
  assert.deepEqual(laborPackagePermissions(["estimate.write", "master.write"]), { canEditDraft: true, canPublish: true });
});

test("copy code stays editable, distinct, and within the API limit", () => {
  assert.equal(suggestedCopyCode("ENG-COMM"), "ENG-COMM-COPY");
  const code = suggestedCopyCode("1234567890123456789012345678901234567890");
  assert.equal(code.length, 40);
  assert.equal(code.endsWith("-COPY"), true);
  assert.notEqual(code, "1234567890123456789012345678901234567890");
});
