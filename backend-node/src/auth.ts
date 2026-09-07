import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";
import type { TmtIdRuntime } from "./tmt-id/runtime.js";
import type { TmtIdSession } from "./tmt-id/types.js";
import type { Identity } from "./types.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createTeamTestAccessCode(signingKey: string, email: string): string {
  return createHmac("sha256", signingKey).update(email.trim().toLowerCase(), "utf8").digest("base64url");
}

export function teamTestAccessCodeMatches(signingKey: string, email: string, supplied: string): boolean {
  const expected = Buffer.from(createTeamTestAccessCode(signingKey, email), "ascii");
  const actual = Buffer.from(supplied, "ascii");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function developmentIdentity(request: FastifyRequest): Identity {
  const objectId = header(request, "x-dev-user-id") ?? "dev-user";
  const email = header(request, "x-dev-user-email") ?? "developer@tomastc.local";
  return { mode: "Development", value: objectId, objectId, email, partitionKey: objectId };
}

function teamTestIdentity(request: FastifyRequest, signingKey: string): Identity {
  const email = header(request, "x-team-test-email")?.trim().toLowerCase();
  const accessCode = header(request, "x-team-test-code");
  if (!email || !accessCode) throw new ApiError(401, "unauthenticated", "Authentication is required.");
  if (email.length > 256 || !EMAIL_PATTERN.test(email)) throw new ApiError(401, "invalid_test_email", "The team-test email is invalid.");
  if (!teamTestAccessCodeMatches(signingKey, email, accessCode)) throw new ApiError(401, "invalid_credentials", "The team-test credentials are invalid.");
  const identityHash = createHash("sha256").update(email, "utf8").digest("hex").slice(0, 24).toUpperCase();
  return { mode: "TeamTest", value: email, email, objectId: `team-test:${identityHash}`, partitionKey: `team-test:${identityHash}` };
}

function tmtIdIdentity(session: TmtIdSession): Identity {
  return {
    mode: "TmtId",
    value: session.sub,
    objectId: session.sub,
    partitionKey: session.sub,
    preferredUsername: session.preferredUsername,
    ...(session.email ? { email: session.email } : {}),
    ...(session.name ? { name: session.name } : {}),
    ...(session.authTime === undefined ? {} : { authTime: session.authTime }),
    ...(session.issuedAt === undefined ? {} : { issuedAt: session.issuedAt }),
  };
}

export function registerAuthentication(
  app: FastifyInstance,
  config: AppConfig,
  tmtId: TmtIdRuntime | null = null,
): void {
  const entra = config.auth.mode === "Entra"
    ? {
        issuer: `https://login.microsoftonline.com/${config.auth.tenantId!}/v2.0`,
        jwks: createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.auth.tenantId!}/discovery/v2.0/keys`)),
      }
    : null;

  app.decorateRequest("identity", null);
  app.decorateRequest("currentUser", null);
  app.addHook("preHandler", async (request) => {
    if (request.routeOptions.config.public === true) return;
    if (config.auth.mode === "Development") {
      request.identity = developmentIdentity(request);
      return;
    }
    if (config.auth.mode === "TeamTest") {
      request.identity = teamTestIdentity(request, config.auth.teamTestSigningKey!);
      return;
    }
    if (config.auth.mode === "TmtId") {
      if (!tmtId) throw new ApiError(500, "tmt_id_unavailable", "TMT ID authentication is not initialized.");
      const session = await tmtId.cookies.readSession(request);
      if (!session) throw new ApiError(401, "unauthenticated", "Authentication is required.");
      request.identity = tmtIdIdentity(session);
      return;
    }

    const authorization = header(request, "authorization");
    if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "unauthenticated", "Authentication is required.");
    try {
      const verified = await jwtVerify(authorization.slice(7), entra!.jwks, {
        issuer: entra!.issuer,
        audience: config.auth.audience!,
        clockTolerance: 120,
      });
      const scopes = typeof verified.payload.scp === "string" ? verified.payload.scp.split(" ") : [];
      if (!scopes.includes(config.auth.requiredScope!)) throw new ApiError(403, "missing_scope", "The delegated API scope is required.");
      const objectId = typeof verified.payload.oid === "string" ? verified.payload.oid : undefined;
      if (!objectId) throw new ApiError(401, "missing_oid", "The Entra token does not contain an object id.");
      const unixSeconds = (claim: unknown): number | undefined =>
        typeof claim === "number" && Number.isFinite(claim) && claim > 0 ? claim : undefined;
      const authTime = unixSeconds(verified.payload.auth_time);
      const issuedAt = unixSeconds(verified.payload.iat);
      request.identity = {
        mode: "Entra",
        value: objectId,
        objectId,
        partitionKey: objectId,
        ...(authTime === undefined ? {} : { authTime }),
        ...(issuedAt === undefined ? {} : { issuedAt }),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(401, "invalid_token", "The Entra access token is invalid.");
    }
  });
}
