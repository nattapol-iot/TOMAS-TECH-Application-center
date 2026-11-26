import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// One owner for an inquiry and its estimate (bug 2026-11-26: EBARA INQ-2611-0019 named Sukanya on the inquiry while
// EST-2611-0021 still named the person it was created with).

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("every path that links an estimate to an inquiry leaves them with the same owner", async () => {
  const [inquiries, estimates, historical, siteVisit] = await Promise.all([
    source("backend-node/src/routes/inquiries.ts"),
    source("backend-node/src/routes/estimates.ts"),
    source("backend-node/src/routes/estimate-historical-import.ts"),
    source("backend-node/src/routes/site-visit-reports.ts"),
  ]);
  // Assigning the inquiry's owner moves its estimate, in the same transaction as the inquiry update.
  const assignment = inquiries.slice(inquiries.indexOf('app.put("/api/v1/inquiries/:id/assignment"'), inquiries.indexOf('app.put("/api/v1/inquiries/:id/qualification"'));
  assert.match(assignment, /UPDATE dbo\.inquiries SET estimate_owner_id=@owner_id/);
  assert.match(assignment, /const estimateMoved = await alignEstimateOwner\(transaction, id, estimateOwnerId, actor\.id\);/);
  assert.match(assignment, /estimateOwnerMoved: estimateMoved \?/);
  // Creating an estimate with another estimator gives the inquiry that estimator too.
  assert.match(estimates, /UPDATE dbo\.inquiries SET estimate_id=@estimate_id,estimate_owner_id=@owner_id,status=N'Estimating'/);
  assert.match(historical, /UPDATE dbo\.inquiries SET estimate_id=@estimate,estimate_owner_id=@owner,status=N'Estimating'/);
  // A site visit report's estimate already takes the inquiry's owner.
  assert.match(siteVisit, /insert\.input\("owner", sql\.BigInt, Number\(inquiry\.estimate_owner_id\)\)/);
});

test("the assign drawer says the estimate follows, and lets an estimate that drifted be put right", async () => {
  const screens = await source("app/system/production/InquiryScreens.tsx");
  const drawer = screens.match(/function AssignOwnerDrawer\([\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.ok(drawer, "AssignOwnerDrawer found");
  assert.match(drawer, /const unchanged = ownerId === detail\.estimateOwnerId && \(!estimate \|\| estimate\.ownerId === ownerId\);/);
  assert.match(drawer, /disabled=\{busy \|\| unchanged\}/);
  assert.match(drawer, /className=\{estimateDrifted \? "callout warning" : "info-strip"\}/);
  for (const mark of ['guide="inquiry.assignOwnerSelect"', 'data-guide="inquiry.assignOwnerSave"']) assert.ok(drawer.includes(mark), mark);
  assert.match(screens, /data-guide="inquiry\.assignOwner" onClick=\{\(\) => setAssignOpen\(true\)\}/);
  // The create dialog says that its owner becomes the inquiry's owner.
  assert.match(await source("app/system/production/EstimateScreens.tsx"), /<Field label="Estimate owner \*" hint="Also becomes the inquiry's owner">/);
});
