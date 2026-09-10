import { access } from "node:fs/promises";
import { constants } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import {
  migrationReadiness,
  REQUIRED_MIGRATIONS,
  REQUIRED_SCHEMA_VERSION,
  REQUIRED_SCHEMA_VERSIONS,
  type AppliedMigration,
} from "../migration-validation.js";

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

      const result = await database.query<AppliedMigration>(
        "SELECT version, name FROM dbo.schema_versions ORDER BY version;",
      );
      const schemaVersion = result.recordset.reduce(
        (maximum, migration) => Math.max(maximum, Number(migration.version)),
        0,
      );
      const readiness = migrationReadiness(result.recordset);
      if (!readiness.ready) {
        return reply
          .status(503)
          .send({
            status: "migrations_required",
            schemaVersion,
            requiredSchemaVersion: REQUIRED_SCHEMA_VERSION,
            requiredSchemaVersions: REQUIRED_SCHEMA_VERSIONS,
            requiredSchemaIdentities: REQUIRED_MIGRATIONS.map(({ version, name }) => ({ version, name })),
            missingSchemaVersions: readiness.missingVersions,
            mismatchedSchemaVersions: readiness.mismatchedVersions,
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
