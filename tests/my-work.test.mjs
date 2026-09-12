import assert from "node:assert/strict";
import test from "node:test";
import {
  canFinishWork,
  needsZeroProgressFinishConfirmation,
  parseMyWorkExpansion,
  sortMyWorkGroups,
} from "../lib/my-work.ts";

test("saved group expansion accepts only boolean entries and survives damaged storage", () => {
  assert.deepEqual(parseMyWorkExpansion(null), {});
  assert.deepEqual(parseMyWorkExpansion("not-json"), {});
  assert.deepEqual(parseMyWorkExpansion("[]"), {});
  assert.deepEqual(parseMyWorkExpansion('{"project:1:true":true,"bad":"yes","closed":false}'), {
    "project:1:true": true,
    closed: false,
  });
});

test("blocked work cannot finish and a zero-percent finish needs confirmation", () => {
  assert.equal(canFinishWork("Blocked"), false);
  assert.equal(canFinishWork("In Progress"), true);
  assert.equal(needsZeroProgressFinishConfirmation(0, "Done"), true);
  assert.equal(needsZeroProgressFinishConfirmation(25, "Done"), false);
  assert.equal(needsZeroProgressFinishConfirmation(0, "In Progress"), false);
});

test("the mixed daily queue sorts every source by shared urgency and due date", () => {
  const rows = [
    { kind: "estimate", key: "EST-2", group: { urgency: 3, nearestDue: "2026-09-15", updatedAt: "2026-09-10T00:00:00Z" } },
    { kind: "schedule", key: "PRJ-1", group: { urgency: 0, nearestDue: "2026-09-20", updatedAt: "2026-09-11T00:00:00Z" } },
    { kind: "estimate", key: "EST-1", group: { urgency: 0, nearestDue: "2026-09-13", updatedAt: "2026-09-09T00:00:00Z" } },
  ];
  assert.deepEqual(sortMyWorkGroups(rows, "priority", (row) => row.key).map((row) => row.key), ["EST-1", "PRJ-1", "EST-2"]);
  assert.deepEqual(sortMyWorkGroups(rows, "project", (row) => row.key).map((row) => row.key), ["EST-1", "EST-2", "PRJ-1"]);
  assert.deepEqual(rows.map((row) => row.key), ["EST-2", "PRJ-1", "EST-1"], "sorting must not mutate the caller");
});
