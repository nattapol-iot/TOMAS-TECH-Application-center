import assert from "node:assert/strict";
import test from "node:test";
import { parseModuleDescriptionRows } from "../src/estimate-module-details.js";
test("description rows retain order and multiline text, without creating monetary lines", () => {
 assert.deepEqual(parseModuleDescriptionRows([" Design ", "", "Assembly\nInternal test"]), ["Design", "Assembly\nInternal test"]);
 assert.deepEqual(parseModuleDescriptionRows([]),[]);
 assert.equal(parseModuleDescriptionRows(undefined),undefined);
});
test("description rows reject malformed or excessive payloads", () => {
 for(const invalid of [null,"text",[{}],["x".repeat(501)],Array(21).fill("x")]) assert.throws(()=>parseModuleDescriptionRows(invalid));
});
