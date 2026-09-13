import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOrder, assertCompleteOrder } from "../src/routes/estimate-order.js";

test("order accepts only known ledgers and unique safe positive ids", () => {
 assert.deepEqual(parseOrder({sourceType:"CostItem",orderedIds:[3,1,2]}),{sourceType:"CostItem",ids:[3,1,2]});
 for (const ids of [[],[1,1],[0],[-1],[1.5],["1"],[Number.MAX_SAFE_INTEGER+1]]) assert.throws(()=>parseOrder({sourceType:"CostItem",orderedIds:ids}));
 for (const sourceType of ["__proto__","toString","cost_items",null]) assert.throws(()=>parseOrder({sourceType,orderedIds:[1]}));
});
test("order rejects omitted, deleted and cross-estimate ids", () => {
 assert.doesNotThrow(()=>assertCompleteOrder([3,2,1],[1,2,3]));
 for (const ids of [[1,2],[1,2,4],[1,2,3,4]]) assert.throws(()=>assertCompleteOrder(ids,[1,2,3]),/changed/);
});
test("order writes retain permission, revision lock, concurrency and transactional audit", async () => {
 const source=await readFile(new URL("../src/routes/estimate-order.ts",import.meta.url),"utf8");
 for (const expected of ["demandPermission(request, \"estimate.write\")","database.transaction","lockEditableEstimate(transaction, id, version)","estimateAssignees","assertCompleteOrder(ids","UPDLOCK,HOLDLOCK","line.revision=@revision","touchEstimate","insertAudit"]) assert.ok(source.includes(expected),expected);
 const revision=await readFile(new URL("../src/routes/estimates.ts",import.meta.url),"utf8");
 assert.equal((revision.match(/source\.sort_order/g)||[]).length,4);
 assert.doesNotMatch(revision,/INSERT dbo\.estimate_erp_mappings\([^)]*sort_order/);
});
