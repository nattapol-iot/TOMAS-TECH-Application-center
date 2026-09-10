import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageEngineeringRates,
  canViewEngineeringRates,
  ENGINEERING_RATE_MANAGE_ROLES,
  ENGINEERING_RATE_VIEW_ROLES,
} from "../src/engineering-rate-access.js";

test("only management-level roles can view the engineering rate master", () => {
  for (const role of ["Admin", "Management", "CEO", "Engineering Manager", "Project Manager", "Sales Manager"]) {
    assert.equal(canViewEngineeringRates(role), true, `${role} should be allowed to view rates`);
  }
  for (const role of ["Engineer", "Engineering Coordinator", "Purchasing", "Warehouse", "Inventory Controller", "Viewer"]) {
    assert.equal(canViewEngineeringRates(role), false, `${role} should not be allowed to view rates`);
  }
  assert.deepEqual(ENGINEERING_RATE_VIEW_ROLES, ["Admin", "Management", "CEO", "Engineering Manager", "Project Manager", "Sales Manager"]);
});

test("only Engineering Manager and Admin can change engineering rates", () => {
  assert.deepEqual(ENGINEERING_RATE_MANAGE_ROLES, ["Admin", "Engineering Manager"]);
  assert.equal(canManageEngineeringRates("Admin"), true);
  assert.equal(canManageEngineeringRates("Engineering Manager"), true);
  assert.equal(canManageEngineeringRates("Management"), false);
  assert.equal(canManageEngineeringRates("Inventory Controller"), false);
});
