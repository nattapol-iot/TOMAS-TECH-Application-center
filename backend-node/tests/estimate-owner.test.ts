import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import sql from "mssql";
import type { Transaction } from "mssql";
import { alignEstimateOwner } from "../src/estimate-owner.js";

// Bug 2026-11-26: EBARA INQ-2611-0019 was given to Sukanya on the inquiry while EST-2611-0021 kept its first owner.
// The inquiry's owner now carries over to its estimate and to the previous owner's open sections.

type Statement = { statement: string; params: Record<string, unknown> };

function installSqlMock(t: TestContext, estimate: { id: number; estimate_no: string; owner_id: number } | null, sectionsMoved = 2) {
  const statements: Statement[] = [];
  const bags = new WeakMap<object, Record<string, unknown>>();
  t.mock.method(sql.Request.prototype, "input", function (this: object, name: string, ...rest: unknown[]) {
    const bag = bags.get(this) ?? {};
    bag[name] = rest.length > 1 ? rest[1] : rest[0];
    bags.set(this, bag);
    return this;
  });
  t.mock.method(sql.Request.prototype, "query", async function (this: object, statement: string) {
    statements.push({ statement, params: { ...(bags.get(this) ?? {}) } });
    if (statement.includes("FROM dbo.estimates WITH(UPDLOCK,HOLDLOCK) WHERE inquiry_id=@inquiry")) return { recordset: estimate ? [estimate] : [] };
    if (statement.includes("UPDATE dbo.estimates SET owner_id=@owner")) return { recordset: [], rowsAffected: [1, sectionsMoved] };
    return { recordset: [], rowsAffected: [1] };
  });
  return statements;
}

const transaction = {} as Transaction;

test("an inquiry without an estimate has nothing to move", async (t) => {
  const statements = installSqlMock(t, null);
  assert.equal(await alignEstimateOwner(transaction, 19, 42, 1), null);
  assert.equal(statements.length, 1);
  assert.equal(statements[0]!.params.inquiry, 19);
});

test("an estimate that already has the owner is left alone", async (t) => {
  const statements = installSqlMock(t, { id: 21, estimate_no: "EST-2611-0021", owner_id: 42 });
  assert.equal(await alignEstimateOwner(transaction, 19, 42, 1), null);
  assert.ok(!statements.some((s) => s.statement.includes("UPDATE")));
});

test("the estimate takes the inquiry's owner, with the previous owner's open sections, and the change is audited", async (t) => {
  const statements = installSqlMock(t, { id: 21, estimate_no: "EST-2611-0021", owner_id: 7 }, 2);
  const moved = await alignEstimateOwner(transaction, 19, 42, 1);
  assert.deepEqual(moved, { estimateId: 21, estimateNumber: "EST-2611-0021", previousOwnerId: 7, sectionsMoved: 2 });
  const update = statements.find((s) => s.statement.includes("UPDATE dbo.estimates SET owner_id=@owner"))!;
  assert.deepEqual([update.params.id, update.params.owner, update.params.previous, update.params.actor], [21, 42, 7, 1]);
  // Only the previous owner's sections that are not finished move; finished work keeps who did it.
  assert.match(
    update.statement,
    /UPDATE dbo\.estimate_assignments SET owner_id=@owner,support_id=CASE WHEN support_id=@owner THEN NULL ELSE support_id END\s+WHERE estimate_id=@id AND owner_id=@previous AND status NOT IN\(N'Completed',N'Reviewed'\)/,
  );
  const audit = statements.find((s) => s.statement.includes("INSERT INTO dbo.audit_log") && s.params.action === "Owner changed");
  assert.ok(audit, "the move is written to the audit log");
  assert.deepEqual([audit.params.entity_type, audit.params.entity_id, JSON.parse(String(audit.params.before)).ownerId], ["Estimate", 21, 7]);
});
