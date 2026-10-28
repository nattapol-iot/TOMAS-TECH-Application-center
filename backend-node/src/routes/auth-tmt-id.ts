import type { FastifyInstance } from "fastify";
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  buildEndSessionUrl,
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";
import { ApiError } from "../errors.js";
import { resolveCallbackAction } from "../tmt-id/callback-guard.js";
import {
  FIRST_ATTEMPT_STATE_PREFIX,
  RETRY_QUERY_KEY,
  RETRY_STATE_PREFIX,
  TMT_ID_SCOPE,
} from "../tmt-id/constants.js";
import { sanitizeNextPath } from "../tmt-id/next-path.js";
import type { TmtIdRuntime } from "../tmt-id/runtime.js";
import { deriveProvisionedUser, type UserProvisioning } from "../tmt-id/user-provisioning.js";
import type { MeResponse, TmtIdSession } from "../tmt-id/types.js";
import { tokenHasAudience, type IssuedTokens, type TmtIdTokenVault } from "../tmt-id/token-vault.js";
import { ERP_AUDIENCE } from "../erp-purchasing.js";

type LoginQuery = { next?: string; retry?: string };
type CallbackQuery = { state?: string; code?: string; error?: string };

function unixSeconds(claim: unknown): number | undefined {
  return typeof claim === "number" && Number.isFinite(claim) && claim > 0
    ? claim
    : undefined;
}

function claimText(claim: unknown): string | undefined {
  return typeof claim === "string" && claim.trim() ? claim.trim() : undefined;
}

export function registerTmtIdAuthRoutes(
  app: FastifyInstance,
  runtime: TmtIdRuntime,
  provisioning: UserProvisioning | null,
  tokenVault: TmtIdTokenVault | null = null,
): void {
  let audienceWarned = false;
  const { cookies, provider, directory, redirectUri, settings } = runtime;
  const appHome = `${settings.appBaseUrl}/`;

  app.get<{ Querystring: LoginQuery }>(
    "/api/auth/login",
    { config: { public: true } },
    async (request, reply) => {
      const next = sanitizeNextPath(request.query.next);
      const retrying = request.query[RETRY_QUERY_KEY] === "1";
      const configuration = await provider.configuration();
      const codeVerifier = randomPKCECodeVerifier();
      const state = `${retrying ? RETRY_STATE_PREFIX : FIRST_ATTEMPT_STATE_PREFIX}${randomState()}`;
      const nonce = randomNonce();
      const authorizationUrl = buildAuthorizationUrl(configuration, {
        redirect_uri: redirectUri,
        scope: TMT_ID_SCOPE,
        state,
        nonce,
        code_challenge: await calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: "S256",
      });
      await cookies.writeLogin(reply, { state, nonce, codeVerifier, next });
      return reply.redirect(authorizationUrl.href, 302);
    },
  );

  app.get<{ Querystring: CallbackQuery }>(
    "/api/auth/callback",
    { config: { public: true } },
    async (request, reply) => {
      const login = await cookies.readLogin(request);
      const action = resolveCallbackAction(login, request.query);
      cookies.clearLogin(reply);
      if (action.kind === "fail") {
        throw new ApiError(
          401,
          "tmt_id_login_failed",
          "The TMT ID sign-in could not be completed. Please start again.",
          { reason: action.reason },
        );
      }
      if (action.kind === "retry") {
        const target = `/api/auth/login?next=${encodeURIComponent(action.next)}&${RETRY_QUERY_KEY}=1`;
        return reply.redirect(target, 302);
      }

      const configuration = await provider.configuration();
      const tokens = await authorizationCodeGrant(
        configuration,
        new URL(`${settings.publicBaseUrl}${request.url}`),
        {
          pkceCodeVerifier: action.login.codeVerifier,
          expectedState: action.login.state,
          expectedNonce: action.login.nonce,
        },
      );
      const claims = tokens.claims();
      const sub = claimText(claims?.sub);
      const preferredUsername = claimText(claims?.preferred_username);
      if (!sub || !preferredUsername) {
        throw new ApiError(
          401,
          "tmt_id_incomplete_identity",
          "The TMT ID token does not carry both sub and preferred_username.",
        );
      }
      const email = claimText(claims?.email);
      const name = claimText(claims?.name);
      const authTime = unixSeconds(claims?.auth_time);
      const issuedAt = unixSeconds(claims?.iat);
      const session: TmtIdSession = {
        sub,
        preferredUsername,
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        ...(tokens.id_token ? { idToken: tokens.id_token } : {}),
        ...(authTime === undefined ? {} : { authTime }),
        ...(issuedAt === undefined ? {} : { issuedAt }),
      };
      // Only an email the provider vouches for may open an account by its domain.
      const emailVerified = claims?.email_verified === true;
      if (email && !emailVerified) {
        // Keycloak marks a brokered email verified only when the identity provider is set to trust it.
        request.log.info({ emailVerified: claims?.email_verified ?? null }, "TMT ID email is not verified; it cannot open an account by its domain.");
      }
      await provisioning?.ensure(session, { emailVerified });
      if (tokenVault) {
        // Kept so an approved requisition can be sent to the ERP as this person; a failure here must not block sign-in.
        if (!audienceWarned && !tokenHasAudience(tokens.access_token, ERP_AUDIENCE)) {
          audienceWarned = true;
          request.log.warn("TMT ID access tokens lack the pegasus-erp-mcp audience; the ERP will refuse them until the ERP team adds the audience mapper to this client.");
        }
        await tokenVault.save(sub, tokens as IssuedTokens).catch((error: unknown) => request.log.error({ err: error }, "Could not keep the TMT ID refresh token"));
      }
      await cookies.writeSession(reply, session);
      return reply.redirect(`${settings.appBaseUrl}${action.login.next}`, 302);
    },
  );

  app.get(
    "/api/auth/logout",
    { config: { public: true } },
    async (request, reply) => {
      const session = await cookies.readSession(request);
      cookies.clearSession(reply);
      if (session && tokenVault) await tokenVault.forget(session.sub).catch((error: unknown) => request.log.error({ err: error }, "Could not delete the TMT ID refresh token"));
      try {
        const configuration = await provider.configuration();
        // Clearing only the local cookie is not a sign-out: the provider still
        // holds an SSO session and the next login silently re-authenticates.
        const endSessionUrl = buildEndSessionUrl(configuration, {
          post_logout_redirect_uri: appHome,
          ...(session?.idToken
            ? { id_token_hint: session.idToken }
            : { client_id: settings.clientId }),
        });
        return reply.redirect(endSessionUrl.href, 302);
      } catch (error) {
        request.log.error(
          { err: error },
          "TMT ID end-session redirect unavailable; the local session was cleared",
        );
        return reply.redirect(appHome, 302);
      }
    },
  );

  app.get("/api/me", async (request): Promise<MeResponse> => {
    const identity = request.identity;
    if (!identity || identity.mode !== "TmtId" || !identity.preferredUsername) {
      throw new ApiError(401, "unauthenticated", "Authentication is required.");
    }
    const profile = await directory?.profile(identity.preferredUsername);
    return {
      authenticationMode: "TmtId",
      sub: identity.value,
      preferredUsername: identity.preferredUsername,
      email: identity.email ?? profile?.email ?? null,
      // What the sign-in screen shows a person who is not registered, so Employee Master gets exactly this email.
      signInEmail: deriveProvisionedUser({ sub: identity.value, preferredUsername: identity.preferredUsername, ...(identity.email ? { email: identity.email } : {}) }).email,
      name: identity.name ?? profile?.name ?? null,
      role: profile?.role ?? null,
      department: profile?.department ?? null,
      employeeNo: profile?.employeeNo ?? null,
    };
  });
}