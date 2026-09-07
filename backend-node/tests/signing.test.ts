import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import {
  canonicalPayload,
  chainHash,
  demandDocumentClass,
  demandLocale,
  evaluateSigningAssurance,
  isVerifyCodeShape,
  newVerifyCode,
  normalizeRevisionLabel,
  numberPrefix,
  requireReason,
  sha256Hex,
} from "../src/signing-core.js";
import type { Identity } from "../src/types.js";

function requestWith(identity: Identity | null): FastifyRequest {
  return { identity } as FastifyRequest;
}

test("the canonical payload is order-independent and drops absent fields", () => {
  const one = canonicalPayload([["b", "2"], ["a", "1"], ["c", null], ["d", undefined]]);
  const other = canonicalPayload([["a", "1"], ["d", undefined], ["b", "2"]]);
  assert.equal(one, other, "field order must not change the hash");
  assert.equal(one, "a=1\nb=2\n");
  // A newline inside a value would otherwise be indistinguishable from the
  // separator between fields.
  assert.equal(canonicalPayload([["a", "one\ntwo"]]), "a=one\\ntwo\n");
  assert.equal(canonicalPayload([["a", "back\\slash"]]), "a=back\\\\slash\n");
});

test("the chain links each event to the one before it", () => {
  const first = chainHash(null, sha256Hex("payload-1"));
  const second = chainHash(first, sha256Hex("payload-2"));
  const third = chainHash(second, sha256Hex("payload-3"));
  assert.notEqual(first, second);
  assert.equal(chainHash(first, sha256Hex("payload-2")), second, "the same inputs give the same link");
  // Rewriting event 2 breaks event 3, which is the whole point of the chain.
  const tampered = chainHash(first, sha256Hex("payload-2-edited"));
  assert.notEqual(chainHash(tampered, sha256Hex("payload-3")), third);
});

test("a verification code is readable off paper and validates its own shape", () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = newVerifyCode();
    assert.match(code, /^TC-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.ok(isVerifyCodeShape(code));
    // I, L, O and U are excluded so a code cannot be mistyped as another code.
    assert.doesNotMatch(code.slice(3), /[ILOU]/);
  }
  assert.equal(isVerifyCodeShape("TC-IIII-IIII-IIII"), false);
  assert.equal(isVerifyCodeShape("nonsense"), false);
  assert.equal(isVerifyCodeShape(null), false);
});

test("document classes, prefixes and revision labels are validated, not assumed", () => {
  assert.equal(demandDocumentClass("QUOTATION"), "QUOTATION");
  assert.throws(() => demandDocumentClass("ESTIMATE"), /document class/);
  assert.throws(() => demandDocumentClass(null), /document class/);
  // Estimate is deliberately not signable: it is an internal cost document with
  // its own two-stage approval, and the customer receives the Quotation.
  assert.equal(numberPrefix("QUOTATION"), "QT");
  assert.equal(numberPrefix("PR_PO"), "PRD");

  assert.equal(normalizeRevisionLabel(undefined), "R00");
  assert.equal(normalizeRevisionLabel("r03"), "R03");
  assert.throws(() => normalizeRevisionLabel("A1"), /revision label/);
  assert.throws(() => normalizeRevisionLabel("RXX"), /revision label/);

  assert.equal(demandLocale("th"), "th");
  assert.throws(() => demandLocale("de"), /locale/);

  assert.equal(requireReason("  needs a new dimension  ", "reason_required"), "needs a new dimension");
  assert.throws(() => requireReason("   ", "reason_required"), /reason is required/);
});

test("signing assurance reports how presence was established, and refuses stale credentials", () => {
  const now = Math.floor(Date.now() / 1_000);

  // Development and team-test can never evidence a live human, so they are
  // labelled rather than dressed up as something stronger.
  assert.equal(evaluateSigningAssurance(requestWith({
    mode: "Development", value: "dev", partitionKey: "dev",
  })).evidence, "development");
  assert.equal(evaluateSigningAssurance(requestWith({
    mode: "TeamTest", value: "a@b.c", partitionKey: "tt",
  })).evidence, "team-test");

  // auth_time is the identity provider asserting when the human last signed in.
  assert.equal(evaluateSigningAssurance(requestWith({
    mode: "Entra", value: "oid", partitionKey: "oid", authTime: now - 30,
  })).evidence, "entra-auth_time");

  // A silent refresh also produces a recent iat, so it is recorded as the
  // weaker label rather than pretending to be auth_time.
  assert.equal(evaluateSigningAssurance(requestWith({
    mode: "Entra", value: "oid", partitionKey: "oid", issuedAt: now - 30,
  })).evidence, "entra-token-iat");

  assert.throws(() => evaluateSigningAssurance(requestWith({
    mode: "Entra", value: "oid", partitionKey: "oid", authTime: now - 4_000,
  })), /Signing requires a sign-in/);

  // A token dated in the future is a clock problem, not evidence.
  assert.throws(() => evaluateSigningAssurance(requestWith({
    mode: "Entra", value: "oid", partitionKey: "oid", authTime: now + 3_600,
  })), /Signing requires a sign-in/);

  // No timestamp at all means presence cannot be evidenced.
  assert.throws(() => evaluateSigningAssurance(requestWith({
    mode: "Entra", value: "oid", partitionKey: "oid",
  })), /cannot be evidenced/);

  assert.throws(() => evaluateSigningAssurance(requestWith(null)), /Authentication is required/);
});
