import test from "node:test";
import assert from "node:assert/strict";
import { moveSibling, moveModule, dropModule } from "../lib/estimate-order.ts";
import { buildEstimateCostBreakdown, breakdownModules } from "../lib/estimate-cost-breakdown.ts";

test("move item swaps only adjacent siblings, without mutating source", () => {
 const lines = [{ id: 1 }, { id: 2 }, { id: 3 }];
 assert.deepEqual(moveSibling(lines, 1, -1).map(l => l.id), [2,1,3]);
 assert.deepEqual(moveSibling(lines, 1, 1).map(l => l.id), [1,3,2]);
 for (const [index, direction] of [[0,-1],[2,1],[-1,1]]) assert.deepEqual(moveSibling(lines,index,direction),lines);
 assert.deepEqual(lines.map(l => l.id),[1,2,3]);
});
test("module move preserves children, membership, values and ordering within each module", () => {
 const lines = [{ id: 1, module: "A", amount: 3 },{ id: 2, module: "A", amount: 8 },{ id: 3, module: "B", amount: 5 }];
 const moved = moveModule(lines,l => l.module,"B",-1);
 assert.deepEqual(moved.map(l => l.id),[3,1,2]);
 assert.equal(moved.reduce((s,l)=>s+l.amount,0),16);
 assert.deepEqual(moveModule(moved,l => l.module,"B",1),lines);
});
test("Summary retains persisted module and child order instead of sorting by names or ids", () => {
 const costItems = [ {id:9,module:"Z",lineTotal:5}, {id:3,module:"A",lineTotal:2}, {id:1,module:"A",lineTotal:4} ].map(l=>({...l,categoryCode:"01",category:"Hardware",description:"Item",brand:"",model:"",itemCode:"",quantity:1,unitCost:l.lineTotal,unit:"Pcs"}));
 const sections=buildEstimateCostBreakdown({costItems,manhourLines:[],expenseLines:[],otherCostLines:[]},{manhour:"",expenses:"",other:"",manDayUnit:""});
 assert.deepEqual(breakdownModules(sections[0]).map(m=>m.title),["Z","A"]);
 assert.deepEqual(breakdownModules(sections[0])[1].lines.map(l=>l.key),["cost:3","cost:1"]);
});

 test("drag insertion supports both directions, module boundaries and hidden rows", async () => {
  const { insertCostLine } = await import("../lib/estimate-order.ts");
  const ids = [1,2,3,4,5];
  assert.deepEqual(insertCostLine(ids,1,4,false),[2,3,1,4,5]);
  assert.deepEqual(insertCostLine(ids,1,4,true),[2,3,4,1,5]);
  assert.deepEqual(insertCostLine(ids,5,2,false),[1,5,2,3,4]);
  assert.deepEqual(insertCostLine(ids,5,2,true),[1,2,5,3,4]);
  for (const [source,target] of [[2,2],[9,2],[2,9]]) assert.deepEqual(insertCostLine(ids,source,target,true),ids);
  assert.deepEqual(ids,[1,2,3,4,5]);
 });

test("dragging a module lands it at the drop position, keeping every line and its order", () => {
 const lines = [{ id: 1, module: "A" }, { id: 2, module: "A" }, { id: 3, module: "B" }, { id: 4, module: "C" }];
 const keyOf = line => line.module;
 assert.deepEqual(dropModule(lines, keyOf, "C", "A", false).map(l => l.id), [4, 1, 2, 3]);
 assert.deepEqual(dropModule(lines, keyOf, "A", "C", true).map(l => l.id), [3, 4, 1, 2]);
 assert.deepEqual(dropModule(lines, keyOf, "A", "B", false).map(l => l.id), [1, 2, 3, 4]);
 // A drop on itself, on a module that is not there, or on a missing target changes nothing.
 for (const [key, target] of [["A", "A"], ["Z", "A"], ["A", "Z"]]) assert.deepEqual(dropModule(lines, keyOf, key, target, true), lines);
 assert.deepEqual(lines.map(l => l.id), [1, 2, 3, 4]);
});
