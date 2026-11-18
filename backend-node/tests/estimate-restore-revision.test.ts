import assert from "node:assert/strict";
import test from "node:test";
import { RESTORE_COMMENT_MAX, restoreRevisionPlan, restoreRevisionReason } from "../src/routes/estimates.js";

test("an approved estimate reopens as a revision when it goes back; one being edited keeps its status", () => {
  // Approved or locked: the approval snapshot keeps its own status and the estimate reopens, as Create Revision does.
  assert.deepEqual(restoreRevisionPlan("Approved"), { closedAs: "Approved", reopens: true });
  assert.deepEqual(restoreRevisionPlan("Locked"), { closedAs: "Locked", reopens: true });
  // Being edited: the revision in hand is kept in the history as Superseded and the status does not move.
  for (const status of ["Draft", "Engineering Input", "Revision Required", "revision required"]) {
    assert.deepEqual(restoreRevisionPlan(status), { closedAs: "Superseded", reopens: false }, status);
  }
  // In review the submission stands until it is decided or withdrawn; a closed estimate does not move at all.
  for (const status of ["Engineering Review", "Cancelled", "Waiting Supplier Price", ""]) assert.equal(restoreRevisionPlan(status), null, status || "(empty)");
});

test("the reason kept on the set-aside revision names the source and fits the 100-character column", () => {
  assert.equal(restoreRevisionReason(1, null), "Went back to R01");
  assert.equal(restoreRevisionReason(12, "customer returned to the first scope"), "Went back to R12 · customer returned to the first scope");
  // The longest allowed note with a three-digit revision still fits.
  // Nothing is cut off: the whole note is there, so a larger RESTORE_COMMENT_MAX would fail here.
  const note = "x".repeat(RESTORE_COMMENT_MAX);
  const longest = restoreRevisionReason(123, note);
  assert.equal(longest, `Went back to R123 · ${note}`);
  assert.equal(longest.length, 100);
  // The Revision tab reads the code back with this pattern (EstimateScreens.tsx wentBackReason).
  assert.match(restoreRevisionReason(3, "note"), /^Went back to (R\d+)(?: · (.*))?$/);
});
