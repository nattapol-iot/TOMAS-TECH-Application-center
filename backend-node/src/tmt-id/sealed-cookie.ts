import { hkdfSync } from "node:crypto";
import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";

const KEY_INFO = "iot-team-center.tmt-id.v1";
const ISSUER = "iot-team-center";
const HEADER = { alg: "dir", enc: "A256GCM" } as const;

// The session travels in the cookie itself rather than in server memory so it
// survives a restart and stays valid across every listener the server starts.
// The payload is encrypted, not merely signed, because it carries the id_token
// needed for a real end-session redirect.
export class SealedCookieCodec {
  private readonly key: Uint8Array;

  constructor(
    sessionSecret: string,
    private readonly purpose: string,
  ) {
    this.key = new Uint8Array(
      hkdfSync("sha256", sessionSecret, KEY_INFO, purpose, 32),
    );
  }

  async seal(payload: JWTPayload, ttlSeconds: number): Promise<string> {
    return new EncryptJWT(payload)
      .setProtectedHeader(HEADER)
      .setIssuer(ISSUER)
      .setAudience(this.purpose)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .encrypt(this.key);
  }

  async open(value: string | undefined): Promise<JWTPayload | null> {
    if (!value) return null;
    try {
      const { payload } = await jwtDecrypt(value, this.key, {
        issuer: ISSUER,
        audience: this.purpose,
      });
      return payload;
    } catch {
      return null;
    }
  }
}