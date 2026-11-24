import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/errors.js";
import { mondayOf, VENDOR_ROWS_SQL, vendorEntry } from "../src/routes/vendor-hours.js";

// Task doc 3.6: an outside supplier's people and hours per day, recorded by whoever looks after the row.
test("a day's entry: people with one decimal, hours default to people x 8, 0 people clears the day", () => {
  assert.deepEqual(vendorEntry({ people: 3 }), { people: 3, hours: 24, note: null });
  assert.deepEqual(vendorEntry({ people: 2.5, hours: 18, note: "  Panel wiring  " }), { people: 2.5, hours: 18, note: "Panel wiring" });
  assert.deepEqual(vendorEntry({ people: 0 }), { people: 0, hours: 0, note: null });
  for (const bad of [{ people: -1 }, { people: 201 }, { people: 1.25 }, { people: "x" }, { people: 2, hours: 0 }, { people: 0, hours: 3 }, { people: 1, hours: 5000 }])
    assert.throws(
      () => vendorEntry(bad),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
      JSON.stringify(bad),
    );
});

test("the week starts on Monday", () => {
  assert.equal(mondayOf("2026-11-25"), "2026-11-23");
  assert.equal(mondayOf("2026-11-23"), "2026-11-23");
  assert.equal(mondayOf("2026-11-29"), "2026-11-23", "Sunday belongs to the week before");
});

test("only outsourced leaf rows of open projects that the person looks after or runs", () => {
  for (const rule of [
    /t\.labor_source=N'Outsourced'/,
    /p\.status<>N'Closed'/,
    /t\.kind<>N'phase'/,
    /NOT EXISTS\(SELECT 1 FROM dbo\.schedule_tasks c WHERE c\.parent_id=t\.id/,
    /p\.manager_id=@actor OR p\.lead_engineer_id=@actor OR EXISTS\(SELECT 1 FROM dbo\.schedule_task_pics pic WHERE pic\.task_id=t\.id AND pic\.user_id=@actor\)/,
  ])
    assert.match(VENDOR_ROWS_SQL, rule);
});
