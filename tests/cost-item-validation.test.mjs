import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../lib/cost-item-validation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { validCostItemNumbers } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
test("fractional quantities, zero budget prices and four decimal costs are supported", () => {
  for (const values of [[1, 0], [0.0001, 1], [1.25, 123.4567], [3, 19.99]]) assert.equal(validCostItemNumbers(...values), true);
});
test("blank, non-finite, negative and over-precision inputs cannot be saved", () => {
  for (const values of [[NaN, 1], [1, NaN], [Infinity, 0], [1, Infinity], [0, 1], [-1, 1], [1, -1], [0.00001, 1], [1, 1.12345]]) assert.equal(validCostItemNumbers(...values), false);
});
test("SQL numeric and extended line total limits are enforced before submission", () => {
  for (const values of [[1e9, 1], [1, 1e9], [1e8, 1e8]]) assert.equal(validCostItemNumbers(...values), false);
  assert.equal(validCostItemNumbers(999999999.9999, 1), true);
});
