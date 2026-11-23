import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { sealBound, type VaultKeys } from "../src/credential-vault.js";
import type { Database } from "../src/db.js";
import { TmtIdTokenVault } from "../src/tmt-id/token-vault.js";
import type { OidcProvider } from "../src/tmt-id/oidc-provider.js";

const keys: VaultKeys = { keys: new Map([[1, randomBytes(32)]]), activeKeyId: 1 };

function vaultWith(stored: boolean) {
  const statements: string[] = [];
  const sealed = sealBound(keys, "tmt-id-refresh:sub-1", "refresh-token");
  const database = {
    async query(statement: string) {
      statements.push(statement);
      if (!stored) return { recordset: [] };
      if (statement.includes("SELECT refresh_cipher")) return { recordset: [{ refresh_cipher: sealed.cipher, refresh_iv: sealed.iv, refresh_tag: sealed.tag, key_id: sealed.keyId, refresh_expires_at: null }] };
      if (statement.includes("SELECT 1 kept")) return { recordset: [{ kept: 1 }] };
      throw new Error(`Unexpected statement: ${statement}`);
    },
  } as unknown as Database;
  const provider = { async configuration() { throw new Error("TMT ID is unreachable"); } } as unknown as OidcProvider;
  return { vault: new TmtIdTokenVault(database, keys, provider), statements };
}

test("a person with a live access token does not need to sign in again", async () => {
  const { vault, statements } = vaultWith(false);
  await vault.save("sub-1", { access_token: "access", expires_in: 300 });
  assert.equal(await vault.needsSignIn("sub-1"), false);
  assert.deepEqual(statements, []);
});

test("a person with no refresh token kept must sign in again", async () => {
  const { vault } = vaultWith(false);
  assert.equal(await vault.needsSignIn("sub-1"), true);
});

test("TMT ID being briefly unreachable keeps the refresh token and does not ask the person to sign in", async () => {
  const { vault } = vaultWith(true);
  assert.equal(await vault.needsSignIn("sub-1"), false);
});
