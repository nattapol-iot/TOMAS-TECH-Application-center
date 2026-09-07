import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("locked estimates can open a forward-only revision with audit protection", async () => {
  const [routes, workspace, client, screen] = await Promise.all([
    source("backend-node/src/routes/estimates.ts"),
    source("backend-node/src/routes/estimate-workspace-read.ts"),
    source("app/system/api-client.ts"),
    source("app/system/production/EstimateScreens.tsx"),
  ]);
  const start = routes.indexOf('app.post("/api/v1/estimates/:id/create-revision"');
  const end = routes.indexOf('app.post("/api/v1/estimates/:id/request-revision"', start);
  assert.ok(start >= 0 && end > start);
  const flow = routes.slice(start, end);
  assert.match(flow, /demandPermission\(request, "estimate\.write"\)/);
  assert.match(flow, /\["approved", "locked"\]/);
  assert.match(flow, /ensureRevisionSnapshot/);
  assert.match(flow, /SET revision=@next_revision,status=N'Revision Required'/);
  assert.match(flow, /cloneRevisionLines/);
  assert.ok(flow.indexOf("SET revision=@next_revision") < flow.indexOf("cloneRevisionLines"));
  assert.match(flow, /"Revision created"/);
  assert.match(flow, /"Estimate revision created"/);
  assert.match(workspace, /canCreateRevision: permissionRow\.can_write && elevated && \["Approved", "Locked"\]\.includes\(header\.status\)/);
  assert.match(client, /"create-revision"/);
  assert.match(screen, /capabilities\.canCreateRevision/);
  assert.match(screen, /The locked revision remains immutable/);
});
