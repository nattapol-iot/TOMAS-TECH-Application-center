import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { revisionCostGroups } from "../lib/estimate-revision-view.ts";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("going back to an earlier revision opens a new one and keeps the history (owner 2026-11-18)", async () => {
  const [routes, workspace, client, screen, view, erpRoute] = await Promise.all([
    source("backend-node/src/routes/estimates.ts"),
    source("backend-node/src/routes/estimate-workspace-read.ts"),
    source("app/system/api-client.ts"),
    source("app/system/production/EstimateScreens.tsx"),
    source("app/system/production/EstimateRevisionView.tsx"),
    source("backend-node/src/routes/estimate-erp.ts"),
  ]);
  const start = routes.indexOf('app.post("/api/v1/estimates/:id/restore-revision"');
  assert.ok(start >= 0);
  const flow = routes.slice(start);
  // Same gate as Create Revision: estimate.write, the row version, and the owner or a manager.
  assert.match(flow, /demandPermission\(request, "estimate\.write"\)/);
  assert.match(flow, /current\.row_version\.equals\(rowVersion\)/);
  assert.match(flow, /Number\(current\.owner_id\) !== actor\.id && !managerOverride\(actor\)\) throw new ApiError\(403, "estimate_owner_required"/);
  // The source must be a revision in this estimate's history, and never the current one.
  assert.match(flow, /fromRevision === current\.revision\) throw new ApiError\(400/);
  assert.match(flow, /FROM dbo\.estimate_revisions WITH\(HOLDLOCK\) WHERE estimate_id=@id AND revision=@revision/);
  assert.match(flow, /"revision_not_found"/);
  // History is never rewritten: the revision in hand is snapshotted first, then the header moves on, then the lines are copied.
  const snapshot = flow.indexOf("ensureRevisionSnapshot(transaction, id, current.revision");
  const move = flow.indexOf("SET revision=@next_revision");
  const clone = flow.indexOf("cloneRevisionLines(transaction, id, fromRevision, nextRevision");
  assert.ok(snapshot > 0 && snapshot < move && move < clone, "snapshot, then header, then copy");
  assert.doesNotMatch(flow, /DELETE FROM|UPDATE dbo\.(cost_items|manhour_lines|expense_lines|other_cost_lines|estimate_revisions)/);
  assert.match(flow, /nextEstimateRevision\(transaction, id, current\.revision\)/);
  assert.ok(flow.indexOf("assertEstimateTotals", clone) > clone, "totals are checked after the copy");
  assert.match(flow, /"Revision restored"/);
  // Overhead is snapshotted for the header's current revision only (trigger 51404), so it comes after the header moves.
  const overhead = flow.indexOf("snapshotOverheadPolicy(transaction, id, nextRevision");
  assert.ok(overhead > move && overhead < clone, "header, then overhead, then copy");
  // The contingency rate lives on the header: it goes back with the lines, and the audit shows both rates.
  assert.match(flow, /contingency_rate=COALESCE\(@contingency_rate,contingency_rate\)/);
  assert.match(flow, /contingencyRate: Number\(current\.contingency_rate\) \}/);
  assert.match(flow, /contingencyRate: restoredRate \?\? Number\(current\.contingency_rate\)/);
  // The audit reason is never empty, because the ERP Cost Sheet takes its revision description from it.
  assert.match(flow, /reason: restoreRevisionReason\(fromRevision, comment\), comment \}/);
  assert.match(erpRoute, /a\.action IN\(N'Revision created',N'Revision requested',N'Revision restored'\)/);
  // A revision number is a SQL int; a larger one is refused as a bad request.
  assert.match(flow, /requiredInteger\(body\.fromRevision, "Source revision", 0, SQL_INT_MAX\)/);
  // The read of one earlier revision needs estimate.read only and takes its lines by that revision.
  const read = routes.slice(routes.indexOf('app.get("/api/v1/estimates/:id/revisions/:revision"'), start);
  assert.match(read, /demandPermission\(request, "estimate\.read"\)/);
  assert.equal([...read.matchAll(/revision=@revision AND \w+\.deleted_at IS NULL/g)].length, 4, "all four ledgers are read by revision");
  // The capability agrees with restoreRevisionPlan, or the button shows where the API refuses (or the reverse).
  assert.match(workspace, /canRestoreRevision: open && permissionRow\.can_write && elevated && \(EDITABLE\.has\(header\.status\) \|\| \["Approved", "Locked"\]\.includes\(header\.status\)\)/);
  assert.match(workspace, /a\.action=N'Revision restored'/);
  // The "copied from" rows are the last statement of the workspace batch, read as recordset 11 (after approvers 9 and events 10).
  const batchEnd = workspace.indexOf("`, (sqlRequest) => { sqlRequest.input(\"id\", sql.BigInt, id); sqlRequest.input(\"actor_user\"");
  const sourcesAt = workspace.indexOf("a.action=N'Revision restored'");
  assert.ok(batchEnd > sourcesAt && !workspace.slice(sourcesAt, batchEnd).includes("SELECT"), "no statement follows the sources query");
  assert.equal(workspace.slice(0, sourcesAt).split("${ESTIMATE_APPROVERS_SQL}").length, 2, "approvers come before it");
  assert.match(workspace, /result\.recordsets\[9\] \?\? \[\]/);
  assert.match(workspace, /result\.recordsets\[10\] \?\? \[\]/);
  assert.match(workspace, /result\.recordsets\[11\] \?\? \[\]/);
  // A conflict closes the dialog and reloads the estimate, so a retry never resends a stale row version.
  assert.match(view, /requestError instanceof ApiClientError && requestError\.status === 409\) \{ await onRestored\(message\); return; \}/);
  assert.match(client, /\/api\/v1\/estimates\/\$\{id\}\/restore-revision/);
  assert.match(client, /\/api\/v1\/estimates\/\$\{id\}\/revisions\/\$\{revision\}/);
  assert.match(screen, /canRestore=\{capabilities\.canRestoreRevision === true\}/);
  assert.match(screen, /data-guide="estimate\.revisionOpen"/);
  // The person confirms before anything is written, and the note fits the reason column next to the revision code.
  assert.match(view, /data-guide="estimate\.revisionRestore"[^>]*onClick=\{\(\) => setConfirming\(true\)\}/);
  assert.match(view, /const NOTE_MAX = 80;/);
  assert.match(routes, /export const RESTORE_COMMENT_MAX = 80;/);
});

test("an earlier revision's cost items group by category and module and show what counted", () => {
  const line = (id, categoryCode, module, lineTotal, amount) => ({ id, categoryCode, category: categoryCode === "01" ? "Hardware" : "Software", module,
    itemCode: `I${id}`, description: "", brand: "", model: "", supplierName: null, quantity: 1, unit: "pcs", unitCost: lineTotal, lineTotal, amount });
  const groups = revisionCostGroups([line(1, "01", "Conveyor", 100, 300), line(2, "01", "Conveyor ", 50, 150), line(3, "01", "Panel", 40, 40), line(4, "02", "Panel", 10, 10)]);
  assert.deepEqual(groups.map((group) => [group.title, group.lines.length, group.counted, group.multiplied]), [
    ["01 · Hardware · Conveyor", 2, 450, true],
    ["01 · Hardware · Panel", 1, 40, false],
    ["02 · Software · Panel", 1, 10, false],
  ]);
  assert.deepEqual(revisionCostGroups([]), []);
});
