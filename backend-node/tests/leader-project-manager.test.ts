import assert from "node:assert/strict";
import test from "node:test";
import { canCreateWithoutEstimate, isCredentialElevated, isProjectElevated, isProjectManagerRole } from "../src/project-scope.js";
import type { CurrentUser } from "../src/types.js";

// Owner 2026-11-26 (migration 138): a Leader has a Project Manager's standing, but reveals site credentials only on the
// projects they work on, because a Leader holds credential.reveal and a Project Manager does not.
const person = (roles: string[], department = "IoT Engineer Dept.") => ({ id: 1, name: "P", role: roles[0], roles, department }) as unknown as CurrentUser;

test("a Leader stands as a Project Manager does: every project, stage moves, a project without an estimate", () => {
  const leader = person(["Engineer", "Leader"]);
  assert.equal(isProjectElevated(leader), true);
  assert.equal(isProjectManagerRole(leader), true);
  assert.equal(canCreateWithoutEstimate(leader), true);
  assert.equal(isProjectElevated(person(["Engineer"])), false);
  assert.equal(isProjectManagerRole(person(["Engineer"])), false);
});

test("site credentials of every project stay with the roles elevated before migration 138, not with a Leader", () => {
  assert.equal(isCredentialElevated(person(["Engineer", "Leader"])), false);
  assert.equal(isCredentialElevated(person(["Leader"])), false);
  assert.equal(isCredentialElevated(person(["Project Manager"])), true);
  assert.equal(isCredentialElevated(person(["Engineering Manager"])), true);
  assert.equal(isCredentialElevated(person(["Engineer"])), false);
});
