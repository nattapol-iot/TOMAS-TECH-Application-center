import assert from "node:assert/strict";
import test from "node:test";
import { auditJson } from "../src/audit.js";
test("audit JSON keeps object/array payloads and envelopes scalar values for SQL ISJSON", () => {
  assert.equal(auditJson(null), null);
  assert.equal(auditJson(undefined), null);
  assert.equal(auditJson({ status: "Draft" }), '{"status":"Draft"}');
  assert.equal(auditJson([1, 2]), "[1,2]");
  assert.equal(auditJson("INQ-2609-0005"), '{"value":"INQ-2609-0005"}');
  assert.equal(auditJson(10), '{"value":10}');
  assert.equal(auditJson(false), '{"value":false}');
});
