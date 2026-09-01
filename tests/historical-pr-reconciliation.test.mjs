import test from "node:test";
import assert from "node:assert/strict";
import { historicalPrComparison } from "../lib/historical-pr-reconciliation.ts";

const lines = [
  { key: "old", status: "Cancelled", actualCost: 900, totalPrice: 1000 },
  { key: "new", status: "Approved", actualCost: 180, totalPrice: 200 },
  { key: "pending", status: "Pending", actualCost: null, totalPrice: 50 },
  { key: "free", status: "Approved", actualCost: 0, totalPrice: 30 },
  { key: "unknown", status: "Unknown", actualCost: 100, totalPrice: 100 },
  { key: "other", status: "Approved", actualCost: 500, totalPrice: 500 },
];
const links = Object.fromEntries(lines.filter(line => line.key !== "other").map(line => [line.key, { estimateLineId: 1 }]));
test("historical comparison counts only mapped active rows and preserves zero actual", () => {
  assert.deepEqual(historicalPrComparison(lines, links, { id: 1, quantity: 2, unitCost: 100 }),
    { amount: 230, budget: 200, variance: 30, quotedRows: 1 });
});
test("zero or missing estimate budget does not assert an overrun", () => {
  assert.equal(historicalPrComparison(lines, links, { id: 1, quantity: 1, unitCost: 0 }).variance, null);
});
