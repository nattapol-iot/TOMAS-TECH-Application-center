import type { FastifyBaseLogger } from "fastify";
import type { AppConfig, TmtIdConfig } from "../config.js";
import { CALLBACK_PATH } from "./constants.js";
import {
  createMasterDataDirectory,
  type MasterDataDirectory,
} from "./master-data.js";
import { createOidcProvider, type OidcProvider } from "./oidc-provider.js";
import { TmtIdCookies } from "./session-cookies.js";

export type TmtIdRuntime = {
  settings: TmtIdConfig;
  redirectUri: string;
  cookies: TmtIdCookies;
  provider: OidcProvider;
  directory: MasterDataDirectory | null;
};

export function createTmtIdRuntime(
  config: AppConfig,
  log: FastifyBaseLogger,
): TmtIdRuntime | null {
  const settings = config.tmtId;
  if (config.auth.mode !== "TmtId" || !settings) return null;
  return {
    settings,
    redirectUri: `${settings.publicBaseUrl}${CALLBACK_PATH}`,
    cookies: new TmtIdCookies(
      settings.sessionSecret,
      settings.sessionCookieSecure,
      (bytes) =>
        log.warn(
          { bytes },
          "TMT ID session exceeded the cookie budget; the id_token was dropped",
        ),
    ),
    provider: createOidcProvider(settings),
    directory: createMasterDataDirectory(settings, fetch, (error) =>
      log.warn({ err: error }, "TMT ID master-data enrichment failed"),
    ),
  };
}