import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { openSecret, parseVaultKeys, sealSecret } from "../src/credential-vault.js";
import { parseCredentialInput } from "../src/routes/site-credentials.js";

const key = (bytes = 32) => randomBytes(bytes).toString("base64");

test("the key ring is id:base64 of 32 bytes; the highest id encrypts", () => {
  assert.equal(parseVaultKeys(undefined), undefined);
  assert.equal(parseVaultKeys("  "), undefined);
  const ring = parseVaultKeys(`1:${key()}, 3:${key()},2:${key()}`)!;
  assert.equal(ring.activeKeyId, 3);
  assert.equal(ring.keys.size, 3);
  assert.throws(() => parseVaultKeys(`1:${key(16)}`), /32 bytes/);
  assert.throws(() => parseVaultKeys(`one:${key()}`), /id:base64/);
  assert.throws(() => parseVaultKeys(`1:${key()},1:${key()}`), /twice/);
  assert.throws(() => parseVaultKeys(`0:${key()}`), /1-255/);
});

test("a secret round-trips, exactly, and nothing about it is in the ciphertext", () => {
  const ring = parseVaultKeys(`1:${key()}`)!;
  const secret = "  P@ss wörd 中文 \u{1F512}  ";
  const sealed = sealSecret(ring, 42, secret);
  assert.equal(sealed.keyId, 1);
  assert.equal(sealed.iv.length, 12);
  assert.equal(sealed.tag.length, 16);
  assert.equal(sealed.cipher.includes(Buffer.from("P@ss")), false);
  assert.equal(openSecret(ring, 42, sealed), secret);
  // A fresh IV every time: the same secret never encrypts the same way twice.
  assert.notDeepEqual(sealSecret(ring, 42, secret).cipher, sealed.cipher);
});

test("a ciphertext moved to another row, tampered with, or under a missing key is never revealed", () => {
  const ring = parseVaultKeys(`1:${key()}`)!;
  const sealed = sealSecret(ring, 7, "plc-admin-password");
  assert.throws(() => openSecret(ring, 8, sealed), { code: "credential_unreadable" });
  const tampered = { ...sealed, cipher: Buffer.from(sealed.cipher) };
  tampered.cipher[0] = (tampered.cipher[0] ?? 0) ^ 0xff;
  assert.throws(() => openSecret(ring, 7, tampered), { code: "credential_unreadable" });
  assert.throws(() => openSecret(parseVaultKeys(`2:${key()}`)!, 7, sealed), { code: "credential_key_missing" });
});

test("an old key still reads its secrets after a new key is added", () => {
  const first = key();
  const before = parseVaultKeys(`1:${first}`)!;
  const sealed = sealSecret(before, 5, "router-secret");
  const rotated = parseVaultKeys(`1:${first},2:${key()}`)!;
  assert.equal(openSecret(rotated, 5, sealed), "router-secret");
  assert.equal(sealSecret(rotated, 5, "router-secret").keyId, 2);
  assert.throws(() => sealSecret(before, 1, ""), /cannot be empty/);
  assert.throws(() => sealSecret(before, 1, "x".repeat(4001)), /4000/);
});

test("credential input needs a customer, a kind, a label and (to add) a secret kept exactly as typed", () => {
  const parsed = parseCredentialInput({ customerId: 3, kind: "VPN", label: "  Plant VPN ", secret: " s3cret ", assetId: "9" }, true);
  assert.equal(parsed.label, "Plant VPN");
  assert.equal(parsed.secret, " s3cret ");
  assert.equal(parsed.assetId, 9);
  assert.throws(() => parseCredentialInput({ customerId: 3, kind: "VPN", label: "x" }, true), /secret is required/);
  assert.equal(parseCredentialInput({ customerId: 3, kind: "VPN", label: "x" }, false).secret, null);
  assert.throws(() => parseCredentialInput({ customerId: 3, kind: "SSH", label: "x", secret: "y" }, true), /Kind must be one of/);
  assert.throws(() => parseCredentialInput({ kind: "VPN", label: "x", secret: "y" }, true), /Customer is required/);
  assert.throws(() => parseCredentialInput({ customerId: 3, kind: "VPN", label: " ", secret: "y" }, true), /Label is required/);
});
