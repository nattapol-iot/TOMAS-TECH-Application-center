import { access } from "node:fs/promises";
import { constants } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";

const REQUIRED_SCHEMA_VERSION = 35;

export function registerHealthRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
): void {
  app.get("/health/live", { config: { public: true } }, async () => ({
    status: "ok",
    service: "IoTTeamCenter.NodeApi",
    timestamp: new Date().toISOString(),
  }));

  app.get(
    "/health/ready",
    { config: { public: true } },
    async (_request, reply) => {
      try {
        await access(
          config.documentStorage.rootPath,
          constants.R_OK | constants.W_OK,
        );
      } catch {
        return reply
          .status(503)
          .send({
            status: "document_storage_unavailable",
            timestamp: new Date().toISOString(),
          });
      }

      const result = await database.query<{ schema_version: number; required_schemas_ready:number }>(
        "SELECT COALESCE(MAX(version), 0) AS schema_version, CASE WHEN COUNT(DISTINCT CASE WHEN version BETWEEN 25 AND 35 THEN version END)=11 THEN 1 ELSE 0 END AS required_schemas_ready FROM dbo.schema_versions;",
      );
      const schemaVersion = Number(result.recordset[0]?.schema_version ?? 0);
      if (schemaVersion < REQUIRED_SCHEMA_VERSION || !result.recordset[0]?.required_schemas_ready) {
        return reply
          .status(503)
          .send({
            status: "migrations_required",
            schemaVersion,
            requiredSchemaVersion: REQUIRED_SCHEMA_VERSION,
            requiredSchemaVersions: [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35],
            timestamp: new Date().toISOString(),
          });
      }
      return {
        status: "ready",
        schemaVersion,
        documentStorage: "available",
        timestamp: new Date().toISOString(),
      };
    },
  );
}
