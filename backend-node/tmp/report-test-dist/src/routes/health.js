import { access } from "node:fs/promises";
import { constants } from "node:fs";
const REQUIRED_SCHEMA_VERSION = 30;
export function registerHealthRoutes(app, config, database) {
    app.get("/health/live", { config: { public: true } }, async () => ({
        status: "ok",
        service: "IoTTeamCenter.NodeApi",
        timestamp: new Date().toISOString(),
    }));
    app.get("/health/ready", { config: { public: true } }, async (_request, reply) => {
        try {
            await access(config.documentStorage.rootPath, constants.R_OK | constants.W_OK);
        }
        catch {
            return reply
                .status(503)
                .send({
                status: "document_storage_unavailable",
                timestamp: new Date().toISOString(),
            });
        }
        const result = await database.query("SELECT COALESCE(MAX(version), 0) AS schema_version, CASE WHEN EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=25) AND EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=26) AND EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=27) AND EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=28) AND EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=29) AND EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=30) THEN 1 ELSE 0 END AS required_schemas_ready FROM dbo.schema_versions;");
        const schemaVersion = Number(result.recordset[0]?.schema_version ?? 0);
        if (schemaVersion < REQUIRED_SCHEMA_VERSION || !result.recordset[0]?.required_schemas_ready) {
            return reply
                .status(503)
                .send({
                status: "migrations_required",
                schemaVersion,
                requiredSchemaVersion: REQUIRED_SCHEMA_VERSION,
                requiredSchemaVersions: [25, 26, 27, 28, 29, 30],
                timestamp: new Date().toISOString(),
            });
        }
        return {
            status: "ready",
            schemaVersion,
            documentStorage: "available",
            timestamp: new Date().toISOString(),
        };
    });
}
//# sourceMappingURL=health.js.map