import assert from "node:assert/strict";
import test from "node:test";
import { drawingApprovers } from "../src/drawing-workflow.js";

test("drawing workflow uses three named project participants", () => {
  assert.deepEqual(drawingApprovers(7, 8, 9), { DRAWN_BY: 7, CHECKED_BY: 8, APPROVED_BY: 9 });
});
test("drawing cannot be submitted without both project approvers", () => {
  assert.throws(() => drawingApprovers(7, null, 9), /Assign a project/);
  assert.throws(() => drawingApprovers(7, 8, null), /Assign a project/);
});
test("neither author self-approval nor combined leader-manager is permitted", () => {
  for (const ids of [[7,7,9],[7,8,7],[7,8,8]]) {
    assert.throws(() => drawingApprovers(ids[0]!,ids[1]!,ids[2]!), /three different people/);
  }
});
