import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/errors.js";
import { parseTemplate } from "../src/routes/schedule-templates.js";

const rejects = (body: unknown, pattern: RegExp) => assert.throws(() => parseTemplate(body),
  (error: unknown) => error instanceof ApiError && error.statusCode === 400 && pattern.test(error.message));

test("a master schedule keeps its rows in order, with days or with only a name", () => {
  assert.deepEqual(parseTemplate({ name: " Line upgrade ", rows: [
    { name: " Kick-off ", startOffsetDays: 0, durationDays: 1 },
    { name: "Go Live" },
  ] }), { name: "Line upgrade", rows: [
    { name: "Kick-off", startOffsetDays: 0, durationDays: 1 },
    { name: "Go Live", startOffsetDays: null, durationDays: null },
  ] });
});

test("each row names what is wrong with it", () => {
  rejects({ name: "", rows: [{ name: "A" }] }, /Template name is required/);
  rejects({ name: "X", rows: [] }, /at least one row/);
  rejects({ name: "X", rows: Array.from({ length: 51 }, () => ({ name: "A" })) }, /more than 50 rows/);
  rejects({ name: "X", rows: [{ name: "" }] }, /Row 1 name is required/);
  rejects({ name: "X", rows: [{ name: "A", startOffsetDays: 3 }] }, /Row 1 needs both a start day and a duration, or neither/);
  rejects({ name: "X", rows: [{ name: "A", startOffsetDays: -1, durationDays: 2 }] }, /Row 1 start day/);
  rejects({ name: "X", rows: [{ name: "A", startOffsetDays: 0, durationDays: 0 }] }, /Row 1 duration/);
  rejects({ name: "X", rows: [{ name: "A", startOffsetDays: 1.5, durationDays: 2 }] }, /whole number of days/);
});
