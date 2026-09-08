import { discovery, type Configuration } from "openid-client";
import type { TmtIdConfig } from "../config.js";

export type OidcProvider = { configuration: () => Promise<Configuration> };

export function createOidcProvider(config: TmtIdConfig): OidcProvider {
  let discovered: Promise<Configuration> | null = null;
  return {
    configuration() {
      // Only a successful discovery is memoized. Caching the rejected promise
      // would leave sign-in broken until the process restarts whenever the
      // provider is briefly unreachable at first use.
      discovered ??= discovery(
        new URL(config.issuer),
        config.clientId,
        config.clientSecret,
      ).catch((error: unknown) => {
        discovered = null;
        throw error;
      });
      return discovered;
    },
  };
}