import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { adminSelfDecision } from "../src/routes/estimates.js";

test("only the Admin role may approve or send back an estimate it owns", () => {
  assert.equal(adminSelfDecision({ roles: ["Admin"] }), true);
  for (const role of ["Engineering Manager", "Engineer", "Sales", "Viewer", ""]) {
    assert.equal(adminSelfDecision({ roles: [role] }), false, role || "(empty role)");
  }
  // Admin held as an additional role is still Admin (migration 051).
  assert.equal(adminSelfDecision({ roles: ["Engineer", "Admin"] }), true);
  assert.equal(adminSelfDecision({ roles: [] }), false);
});

test("self-approval guards and workspace capabilities carry the Admin exemption together", async () => {
  const [workflow, workspace, review] = await Promise.all([
    readFile(new URL("../src/routes/estimates.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/estimate-workspace-read.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/estimate-review.ts", import.meta.url), "utf8"),
  ]);
  // The 403 codes stay in place for everyone else; the guardrail tests in tests/production-guardrails.test.mjs pin them too.
  assert.match(workflow, /ownerId === actor\.id && !adminSelfDecision\(actor\)\) throw new ApiError\(403, "self_approval_forbidden"/);
  assert.match(workflow, /Number\(current\.owner_id\) === actor\.id && !adminSelfDecision\(actor\)\) throw new ApiError\(403, "self_revision_forbidden"/);
  // The API capabilities must agree with the guards, otherwise the UI hides buttons the API would accept (or vice versa).
  // Since 2026-11-06 both go through mayDecideEstimate: a listed approver, with the same Admin exemption on their own estimate.
  assert.match(workspace, /const canDecide = mayDecideEstimate\(actor, header\.ownerId, approvers\);/);
  assert.match(workspace, /canApprove: canDecide && header\.status === "Engineering Review"/);
  assert.match(workspace, /canRequestRevision: canDecide && header\.status === "Engineering Review"/);
  assert.match(review, /approvers\.some\(\(approver\) => approver\.id === actor\.id\) && \(actor\.id !== ownerId \|\| actor\.roles\.includes\("Admin"\)\)/);
  assert.match(workflow, /mayDecideEstimate\(actor, ownerId, approvers\)/);
  assert.match(workflow, /mayDecideEstimate\(actor, Number\(current\.owner_id\), approvers\)/);
});
