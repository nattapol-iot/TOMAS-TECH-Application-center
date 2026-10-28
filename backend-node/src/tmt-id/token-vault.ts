import sql from "mssql";
import { refreshTokenGrant } from "openid-client";
import { openBound, sealBound, type VaultKeys } from "../credential-vault.js";
import type { Database } from "../db.js";
import type { OidcProvider } from "./oidc-provider.js";

/** What the token endpoint returned at sign-in or on refresh; Keycloak adds refresh_expires_in. */
export type IssuedTokens = { access_token?: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: unknown };
export type TokenSource = { accessToken: (subject: string) => Promise<string | null>; dropAccess: (subject: string) => void };

const binding = (subject: string) => `tmt-id-refresh:${subject}`;
const seconds = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

/**
 * Keeps each person's TMT ID refresh token so a call to another system (the Pegasus ERP) can carry that person's own
 * access token after sign-in: when their requisition is approved, for example. The refresh token is sealed with the
 * credentials vault key ring and bound to its subject; access tokens stay in memory only. A token the provider refuses is
 * deleted, and so is the row at sign-out, so the ERP is reached only while the person's TMT ID session is alive.
 */
export class TmtIdTokenVault implements TokenSource {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();
  private readonly refreshing = new Map<string, Promise<string | null>>();

  constructor(private readonly database: Database, private readonly vault: VaultKeys, private readonly provider: OidcProvider,
    private readonly onError: (error: unknown) => void = () => {}, private readonly now: () => number = Date.now) {}

  async save(subject: string, tokens: IssuedTokens): Promise<void> {
    if (tokens.access_token && seconds(tokens.expires_in)) this.cache.set(subject, { token: tokens.access_token, expiresAt: this.now() + seconds(tokens.expires_in)! * 1000 });
    if (!tokens.refresh_token) return;
    const sealed = sealBound(this.vault, binding(subject), tokens.refresh_token);
    const expires = seconds(tokens.refresh_expires_in);
    await this.database.query(`MERGE dbo.user_oidc_tokens AS target USING (SELECT @subject subject) AS source ON target.subject=source.subject
      WHEN MATCHED THEN UPDATE SET refresh_cipher=@cipher,refresh_iv=@iv,refresh_tag=@tag,key_id=@key,refresh_expires_at=@expires,updated_at=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT(subject,refresh_cipher,refresh_iv,refresh_tag,key_id,refresh_expires_at) VALUES(@subject,@cipher,@iv,@tag,@key,@expires);`, (r) => {
      r.input("subject", sql.NVarChar(100), subject); r.input("cipher", sql.VarBinary(sql.MAX), sealed.cipher); r.input("iv", sql.VarBinary(12), sealed.iv);
      r.input("tag", sql.VarBinary(16), sealed.tag); r.input("key", sql.TinyInt, sealed.keyId);
      r.input("expires", sql.DateTimeOffset, expires ? new Date(this.now() + expires * 1000) : null); });
  }

  /** Forget the cached access token only, so the next call refreshes it. */
  dropAccess(subject: string): void { this.cache.delete(subject); }

  async forget(subject: string): Promise<void> {
    this.cache.delete(subject);
    await this.database.query(`DELETE FROM dbo.user_oidc_tokens WHERE subject=@subject;`, (r) => r.input("subject", sql.NVarChar(100), subject));
  }

  /** A current access token for the subject, refreshed when needed; null when there is none or the provider refuses it. */
  async accessToken(subject: string): Promise<string | null> {
    const cached = this.cache.get(subject);
    if (cached && cached.expiresAt - 60_000 > this.now()) return cached.token;
    const pending = this.refreshing.get(subject);
    if (pending) return pending;
    // One refresh per subject at a time: Keycloak rotates refresh tokens, so two at once would void each other.
    const work = this.refresh(subject).finally(() => this.refreshing.delete(subject));
    this.refreshing.set(subject, work);
    return work;
  }

  private async refresh(subject: string): Promise<string | null> {
    const row = (await this.database.query<{ refresh_cipher: Buffer; refresh_iv: Buffer; refresh_tag: Buffer; key_id: number; refresh_expires_at: Date | null }>(
      `SELECT refresh_cipher,refresh_iv,refresh_tag,key_id,refresh_expires_at FROM dbo.user_oidc_tokens WHERE subject=@subject;`,
      (r) => r.input("subject", sql.NVarChar(100), subject))).recordset[0];
    if (!row) return null;
    if (row.refresh_expires_at && new Date(row.refresh_expires_at).getTime() <= this.now()) { await this.forget(subject); return null; }
    let refreshToken: string;
    try { refreshToken = openBound(this.vault, binding(subject), { cipher: row.refresh_cipher, iv: row.refresh_iv, tag: row.refresh_tag, keyId: Number(row.key_id) }); }
    catch (error) { this.onError(error); await this.forget(subject); return null; }
    try {
      const tokens = await refreshTokenGrant(await this.provider.configuration(), refreshToken);
      await this.save(subject, { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken, refresh_expires_in: (tokens as IssuedTokens).refresh_expires_in });
      return tokens.access_token ?? null;
    } catch (error) {
      this.onError(error);
      // invalid_grant: the TMT ID session is over or the token was revoked, so the person must sign in again. Anything else
      // (the provider briefly unreachable) keeps the token for the next try.
      if ((error as { error?: unknown }).error === "invalid_grant") await this.forget(subject);
      return null;
    }
  }
}

/** Whether an access token names the audience, read from its payload without trusting it (the receiving service verifies). */
export function tokenHasAudience(accessToken: string | undefined, audience: string): boolean {
  const payload = accessToken?.split(".")[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { aud?: unknown };
    return Array.isArray(claims.aud) ? claims.aud.includes(audience) : claims.aud === audience;
  } catch { return false; }
}
