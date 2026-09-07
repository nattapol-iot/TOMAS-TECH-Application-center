// Loads @fastify/cookie's Fastify type augmentation (request.cookies,
// reply.setCookie) without emitting a runtime import in this module.
import type {} from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  LOGIN_COOKIE_NAME,
  LOGIN_COOKIE_PATH,
  LOGIN_TTL_SECONDS,
  SESSION_COOKIE_BUDGET_BYTES,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "./constants.js";
import { SealedCookieCodec } from "./sealed-cookie.js";
import type { CookieAttributes, TmtIdSession, TransientLogin } from "./types.js";

export function sessionCookieAttributes(secure: boolean): CookieAttributes {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

// The provider can return the browser to the callback through a cross-site
// POST, and a Lax cookie is withheld on exactly that navigation, so the
// transient login state has to be SameSite=None. None requires Secure, so a
// plain-http local run falls back to Lax rather than emitting a cookie every
// browser rejects.
export function loginCookieAttributes(secure: boolean): CookieAttributes {
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: LOGIN_COOKIE_PATH,
    maxAge: LOGIN_TTL_SECONDS,
  };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function unixSeconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export class TmtIdCookies {
  private readonly sessionCodec: SealedCookieCodec;
  private readonly loginCodec: SealedCookieCodec;

  constructor(
    sessionSecret: string,
    private readonly secure: boolean,
    private readonly onOversizedSession?: (bytes: number) => void,
  ) {
    this.sessionCodec = new SealedCookieCodec(sessionSecret, "session");
    this.loginCodec = new SealedCookieCodec(sessionSecret, "login");
  }

  async writeSession(reply: FastifyReply, session: TmtIdSession): Promise<void> {
    let sealed = await this.sessionCodec.seal({ ...session }, SESSION_TTL_SECONDS);
    if (sealed.length > SESSION_COOKIE_BUDGET_BYTES) {
      // Dropping the id_token keeps the person signed in; logout then ends the
      // provider session without id_token_hint instead of failing outright.
      this.onOversizedSession?.(sealed.length);
      const { idToken: _idToken, ...withoutIdToken } = session;
      sealed = await this.sessionCodec.seal({ ...withoutIdToken }, SESSION_TTL_SECONDS);
    }
    void reply.setCookie(SESSION_COOKIE_NAME, sealed, sessionCookieAttributes(this.secure));
  }

  async readSession(request: FastifyRequest): Promise<TmtIdSession | null> {
    const payload = await this.sessionCodec.open(request.cookies[SESSION_COOKIE_NAME]);
    if (!payload) return null;
    const sub = text(payload.sub);
    const preferredUsername = text(payload.preferredUsername);
    if (!sub || !preferredUsername) return null;
    const email = text(payload.email);
    const name = text(payload.name);
    const idToken = text(payload.idToken);
    const authTime = unixSeconds(payload.authTime);
    const issuedAt = unixSeconds(payload.issuedAt);
    return {
      sub,
      preferredUsername,
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      ...(idToken ? { idToken } : {}),
      ...(authTime === undefined ? {} : { authTime }),
      ...(issuedAt === undefined ? {} : { issuedAt }),
    };
  }

  clearSession(reply: FastifyReply): void {
    void reply.clearCookie(SESSION_COOKIE_NAME, sessionCookieAttributes(this.secure));
  }

  async writeLogin(reply: FastifyReply, login: TransientLogin): Promise<void> {
    const sealed = await this.loginCodec.seal({ ...login }, LOGIN_TTL_SECONDS);
    void reply.setCookie(LOGIN_COOKIE_NAME, sealed, loginCookieAttributes(this.secure));
  }

  async readLogin(request: FastifyRequest): Promise<TransientLogin | null> {
    const payload = await this.loginCodec.open(request.cookies[LOGIN_COOKIE_NAME]);
    if (!payload) return null;
    const state = text(payload.state);
    const nonce = text(payload.nonce);
    const codeVerifier = text(payload.codeVerifier);
    const next = text(payload.next);
    if (!state || !nonce || !codeVerifier || !next) return null;
    return { state, nonce, codeVerifier, next };
  }

  clearLogin(reply: FastifyReply): void {
    void reply.clearCookie(LOGIN_COOKIE_NAME, loginCookieAttributes(this.secure));
  }
}