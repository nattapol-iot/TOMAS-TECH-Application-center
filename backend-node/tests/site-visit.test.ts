import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateReadiness,
  requireTransition,
  SITE_VISIT_PERMISSIONS,
  VISIT_TRANSITIONS,
} from "../src/site-visit-common.js";
import { skillMatch } from "../src/site-visit-data.js";

test("sales intake readiness blocks missing customer-critical information", () => {
  const result = evaluateReadiness({
    customerId: 0,
    siteName: "",
    siteAddress: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    problemStatement: "",
    expectedResult: "",
    purposeCount: 0,
    machineName: "",
    machineModel: "",
    existingSystem: "",
    attachmentCount: 0,
    windowCount: 0,
    safetyRequirement: "",
    siteAccessRequirement: "",
    skillCount: 0,
  });
  assert.equal(result.canSubmit, false);
  assert.equal(result.blockerCount, 5);
  assert.equal(result.score, 0);
});

test("site visit workflow enforces both state and permission", () => {
  assert.doesNotThrow(() =>
    requireTransition(
      VISIT_TRANSITIONS,
      "Report Under Review",
      "Completed",
      new Set([SITE_VISIT_PERMISSIONS.visitReportApprove]),
    ),
  );
  assert.throws(
    () =>
      requireTransition(
        VISIT_TRANSITIONS,
        "Report Under Review",
        "Completed",
        new Set(),
      ),
    /Permission 'visit.report_approve' is required/,
  );
  assert.throws(
    () =>
      requireTransition(
        VISIT_TRANSITIONS,
        "Tentative",
        "Closed",
        new Set([SITE_VISIT_PERMISSIONS.visitSchedule]),
      ),
    /cannot move directly/,
  );
});

test("skill match is normalized and reports missing skills", () => {
  assert.deepEqual(skillMatch(["PLC", "vision", "PLC"], ["Vision"]), {
    percent: 50,
    missing: ["PLC"],
  });
});
