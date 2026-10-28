import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ApiError } from "./errors.js";

/**
 * Site credentials vault: AES-256-GCM with keys from the environment, never from the database.
 *
 *   CREDENTIAL_VAULT_KEYS=1:<base64 32 bytes>[,2:<base64 32 bytes>...]
 *
 * New secrets use the highest key id; older ids stay readable, so a key is rotated by adding a new
 * one and re-saving secrets, never by replacing the old one. The authenticated data binds a secret
 * to its credential row, so a ciphertext copied onto another row does not decrypt.
 */
export type VaultKeys = { keys: Map<number, Buffer>; activeKeyId: number };
export type SealedSecret = { cipher: Buffer; iv: Buffer; tag: Buffer; keyId: number };

const MAX_SECRET_LENGTH = 4000;

export function parseVaultKeys(raw: string | undefined): VaultKeys | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const keys = new Map<number, Buffer>();
  for (const part of value.split(",")) {
    const match = /^\s*(\d{1,3}):([A-Za-z0-9+/=]+)\s*$/.exec(part);
    if (!match) throw new Error("CREDENTIAL_VAULT_KEYS must be id:base64 pairs separated by commas.");
    const id = Number(match[1]);
    const key = Buffer.from(match[2]!, "base64");
    if (id < 1 || id > 255) throw new Error("CREDENTIAL_VAULT_KEYS key ids must be 1-255.");
    if (key.length !== 32) throw new Error(`CREDENTIAL_VAULT_KEYS key ${id} must be 32 bytes (base64 of 32 random bytes).`);
    if (keys.has(id)) throw new Error(`CREDENTIAL_VAULT_KEYS lists key ${id} twice.`);
    keys.set(id, key);
  }
  return { keys, activeKeyId: Math.max(...keys.keys()) };
}

const siteCredential = (credentialId: number) => `tmt-site-credential:${credentialId}`;

export function sealSecret(vault: VaultKeys, credentialId: number, secret: string): SealedSecret {
  if (!secret) throw new ApiError(400, "validation_failed", "The secret cannot be empty.");
  if (secret.length > MAX_SECRET_LENGTH) throw new ApiError(400, "validation_failed", `The secret cannot exceed ${MAX_SECRET_LENGTH} characters.`);
  return sealBound(vault, siteCredential(credentialId), secret);
}

export function openSecret(vault: VaultKeys, credentialId: number, sealed: SealedSecret): string {
  return openBound(vault, siteCredential(credentialId), sealed);
}

/** The same sealing for other secrets: `binding` is the authenticated data that ties a ciphertext to its row. */
export function sealBound(vault: VaultKeys, binding: string, secret: string): SealedSecret {
  const key = vault.keys.get(vault.activeKeyId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(binding, "utf8"));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { cipher: encrypted, iv, tag: cipher.getAuthTag(), keyId: vault.activeKeyId };
}

export function openBound(vault: VaultKeys, binding: string, sealed: SealedSecret): string {
  const key = vault.keys.get(sealed.keyId);
  if (!key) throw new ApiError(500, "credential_key_missing", `Vault key ${sealed.keyId} is not configured; the secret cannot be read.`);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, sealed.iv);
    decipher.setAAD(Buffer.from(binding, "utf8"));
    decipher.setAuthTag(sealed.tag);
    return Buffer.concat([decipher.update(sealed.cipher), decipher.final()]).toString("utf8");
  } catch {
    throw new ApiError(500, "credential_unreadable", "The stored secret failed its integrity check and was not revealed.");
  }
}
