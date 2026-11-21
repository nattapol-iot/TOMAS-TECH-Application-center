import { isIP } from "node:net";

const TRUSTED_CERTIFICATE_SERVER_NAME = "sqlserver.invalid";

/**
 * The TLS options every SQL connection uses. tedious sends the server address as the TLS server name, and Bun's
 * tls.connect rejects an IP address there (Node only warns, DEP0123). With the certificate trusted the name is never
 * checked, so a placeholder hostname stands in for an IP address.
 */
export function encryptedTransport(server: string | undefined, trustServerCertificate: boolean) {
  return {
    encrypt: true,
    trustServerCertificate,
    ...(trustServerCertificate && server && isIP(server) ? { serverName: TRUSTED_CERTIFICATE_SERVER_NAME } : {}),
  };
}
