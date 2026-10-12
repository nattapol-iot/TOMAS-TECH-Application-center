import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { deleteStoredFile } from "../document-storage.js";
import { ApiError } from "../errors.js";
import { optionalPositiveLong, optionalText, positiveLong } from "../http.js";
import { artifactStorageKey, deployableAssetKind, deploymentBlocker, MAX_ARTIFACT_BYTES, storeArtifact, type ProgramState } from "../release-deployment.js";
import { permissionFor } from "../schedule-service.js";
import { notifyUsers } from "../site-visit-common.js";
import { wakeAgent } from "../site-monitor.js";
import type { CurrentUserService } from "../users.js";
import { createHubClient, type HubFetch } from "./tmthub-repositories.js";

/**
 * Release deployments to monitored programs (Site Monitor × TMTHub), four eyes:
 *
 *   GET  /api/v1/monitor/programs/:programId/releases     monitor.deploy   releases of the linked repository
 *   PUT  /api/v1/monitor/programs/:programId/repository   monitor.manage   link a program to a repository
 *   POST /api/v1/monitor/programs/:programId/deployments  monitor.deploy   request: copy the asset, record its hash
 *   GET  /api/v1/monitor/deployments                      monitor.read     list (by site, by status)
 *   POST /api/v1/monitor/deployments/:id/approve          monitor.approve  a different person; queues the Update
 *   POST /api/v1/monitor/deployments/:id/reject           monitor.approve  a different person
 *   POST /api/v1/monitor/deployments/:id/cancel           requester or monitor.approve, while pending
 *
 * The agent side (Update command, artifact download, result) lives in site-monitor.ts.
 */
const READ = "monitor.read";
const MANAGE = "monitor.manage";
const DEPLOY = "monitor.deploy";
const APPROVE = "monitor.approve";

type ProgramStateRow = {
  id: number | string; name: string; version: string | null; repository: string; removed_at: Date | null;
  agent_id: number | string; agent_name: string; is_online: boolean; allows_control: boolean; revoked_at: Date | null;
  site_name: string; site_active: boolean;
};

type DeploymentRow = {
  id: number | string; program_id: number | string; program_name: string; agent_id: number | string; agent_name: string;
  site_id: number | string; site_name: string; repository: string; release_tag: string; release_name: string; asset_name: string;
  asset_size: number | string; sha256: string; status: string; note: string; requested_by: number | string; requested_by_name: string;
  requested_at: Date; decided_by_name: string | null; decided_at: Date | null; decision_note: string; previous_version: string | null;
  new_version: string | null; result_message: string | null; completed_at: Date | null; storage_key: string; command_id: number | string | null;
};

export const PROGRAM_STATE_SQL = `
  SELECT p.id, p.name, p.version, p.repository, p.removed_at, a.id AS agent_id, a.name AS agent_name, a.is_online, a.allows_control,
         a.revoked_at, s.name AS site_name, s.is_active AS site_active
  FROM dbo.monitor_programs p
  INNER JOIN dbo.monitor_agents a ON a.id = p.agent_id
  INNER JOIN dbo.monitor_sites s ON s.id = a.site_id
  WHERE p.id = @id;`;

export const DEPLOYMENT_SELECT = `
  SELECT d.id, d.program_id, p.name AS program_name, d.agent_id, a.name AS agent_name, s.id AS site_id, s.name AS site_name,
         d.repository, d.release_tag, d.release_name, d.asset_name, d.asset_size, d.sha256, d.status, d.note, d.requested_by,
         ru.name AS requested_by_name, d.requested_at, du.name AS decided_by_name, d.decided_at, d.decision_note,
         d.previous_version, d.new_version, d.result_message, d.completed_at, d.storage_key, d.command_id
  FROM dbo.monitor_deployments d
  INNER JOIN dbo.monitor_programs p ON p.id = d.program_id
  INNER JOIN dbo.monitor_agents a ON a.id = d.agent_id
  INNER JOIN dbo.monitor_sites s ON s.id = a.site_id
  INNER JOIN dbo.users ru ON ru.id = d.requested_by
  LEFT JOIN dbo.users du ON du.id = d.decided_by`;

export const DEPLOYMENT_INSERT_SQL = `
  INSERT dbo.monitor_deployments (program_id, agent_id, repository, release_tag, release_name, asset_name, asset_size, sha256,
    storage_key, note, requested_by, previous_version)
  OUTPUT inserted.id
  VALUES (@program, @agent, @repository, @tag, @release_name, @asset_name, @asset_size, @sha256, @storage_key, @note, @actor, @previous_version);`;

/** Queues the Update and marks the deployment approved, in the transaction that checked everything. */
export const DEPLOYMENT_APPROVE_SQL = `
  DECLARE @command TABLE (id bigint NOT NULL);
  INSERT dbo.monitor_commands (agent_id, program_id, verb, requested_by, deployment_id)
  OUTPUT inserted.id INTO @command
  VALUES (@agent, @program, N'Update', @actor, @id);
  UPDATE dbo.monitor_deployments
  SET status = N'Approved', decided_by = @actor, decided_at = SYSUTCDATETIME(), decision_note = @note,
      command_id = (SELECT id FROM @command)
  WHERE id = @id AND status = N'PendingApproval';
  SELECT id FROM @command;`;

const iso = (value: Date | null) => (value ? value.toISOString() : null);

function deploymentDto(row: DeploymentRow, actorId: number, canApprove: boolean) {
  const pending = row.status === "PendingApproval";
  const own = Number(row.requested_by) === actorId;
  return {
    id: Number(row.id),
    program: { id: Number(row.program_id), name: row.program_name },
    agent: { id: Number(row.agent_id), name: row.agent_name },
    site: { id: Number(row.site_id), name: row.site_name },
    repository: row.repository, releaseTag: row.release_tag, releaseName: row.release_name,
    assetName: row.asset_name, assetSize: Number(row.asset_size), sha256: row.sha256,
    status: row.status, note: row.note,
    requestedBy: row.requested_by_name, requestedAt: iso(row.requested_at),
    decidedBy: row.decided_by_name, decidedAt: iso(row.decided_at), decisionNote: row.decision_note,
    previousVersion: row.previous_version, newVersion: row.new_version, resultMessage: row.result_message, completedAt: iso(row.completed_at),
    canDecide: pending && canApprove && !own,
    canCancel: pending && (own || canApprove),
    isOwn: own,
  };
}

function programState(row: ProgramStateRow): ProgramState {
  return {
    removed: row.removed_at !== null, agentRevoked: row.revoked_at !== null, siteActive: Boolean(row.site_active),
    agentOnline: Boolean(row.is_online), allowsControl: Boolean(row.allows_control), repository: row.repository ?? "",
  };
}

function isDuplicateKey(error: unknown): boolean {
  const number = (error as { number?: number })?.number ?? (error as { originalError?: { info?: { number?: number } } })?.originalError?.info?.number;
  return number === 2601 || number === 2627;
}

function noteOf(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length > 1000) throw new ApiError(400, "validation_failed", "The note cannot exceed 1000 characters.");
  return value;
}

export function registerReleaseDeploymentRoutes(
  app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService, fetchImpl: HubFetch = fetch,
): void {
  const hub = config.tmthub ? createHubClient(config.tmthub, fetchImpl) : null;
  const requireHub = () => {
    if (!hub) throw new ApiError(503, "tmthub_not_configured", "TMTHub is not connected to this application yet.");
    return hub;
  };
  const programId = (request: FastifyRequest) => positiveLong((request.params as Record<string, unknown>).programId, "programId");
  const deploymentId = (request: FastifyRequest) => positiveLong((request.params as Record<string, unknown>).id, "deployment");
  const body = (request: FastifyRequest) => (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;

  const readProgram = async (id: number, transaction?: TransactionType): Promise<ProgramStateRow> => {
    const result = transaction
      ? await new sql.Request(transaction).input("id", sql.BigInt, id).query<ProgramStateRow>(PROGRAM_STATE_SQL)
      : await database.query<ProgramStateRow>(PROGRAM_STATE_SQL, (request) => request.input("id", sql.BigInt, id));
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "monitor_program_not_found", "The program is no longer monitored.");
    return row;
  };

  const readDeployment = async (id: number, transaction: TransactionType): Promise<DeploymentRow> => {
    const result = await new sql.Request(transaction).input("id", sql.BigInt, id)
      .query<DeploymentRow>(`${DEPLOYMENT_SELECT.replace("FROM dbo.monitor_deployments d", "FROM dbo.monitor_deployments d WITH (UPDLOCK)")} WHERE d.id = @id;`);
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "monitor_deployment_not_found", "The deployment was not found.");
    return row;
  };

  app.get("/api/v1/monitor/programs/:programId/releases", async (request) => {
    await users.demandPermission(request, DEPLOY);
    const program = await readProgram(programId(request));
    if (!program.repository) throw new ApiError(409, "monitor_program_no_repository", "Link the program to its TMTHub repository first.");
    const releases = await requireHub().releases(program.repository);
    return {
      repository: program.repository,
      currentVersion: program.version ?? "",
      releases: releases.filter((release) => !release.draft).map((release) => ({
        id: release.id, tag: release.tag_name, name: release.name || release.tag_name, prerelease: release.prerelease,
        publishedAt: release.published_at, url: release.html_url, notes: (release.body ?? "").slice(0, 2000),
        assets: release.assets.map((asset) => ({
          id: asset.id, name: asset.name, size: asset.size,
          deployable: deployableAssetKind(asset.name) !== null && asset.size > 0 && asset.size <= MAX_ARTIFACT_BYTES,
        })),
      })),
    };
  });

  app.put("/api/v1/monitor/programs/:programId/repository", async (request) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const id = programId(request);
    const repository = typeof body(request).repository === "string" ? String(body(request).repository).trim() : "";
    if (repository && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository)) {
      throw new ApiError(400, "validation_failed", "Repository must be a TMTHub repository name.");
    }
    if (repository && hub) await hub.get(repository);
    const program = await readProgram(id);
    await database.transaction(async (transaction) => {
      await new sql.Request(transaction).input("id", sql.BigInt, id).input("repository", sql.NVarChar(100), repository)
        .query(`UPDATE dbo.monitor_programs SET repository = @repository WHERE id = @id;`);
      await insertAudit(transaction, actor.id, "MonitorProgram", id, program.name.slice(0, 50), "Repository linked",
        { repository: program.repository }, { repository });
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return { repository };
  });

  app.get("/api/v1/monitor/deployments", async (request) => {
    await users.demandPermission(request, READ);
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const status = optionalText(query.status, 20, "Status");
    const result = await database.query<DeploymentRow>(`
      ${DEPLOYMENT_SELECT}
      WHERE (@site IS NULL OR s.id = @site) AND (@program IS NULL OR d.program_id = @program)
        AND (@status IS NULL OR d.status = @status)
      ORDER BY CASE WHEN d.status = N'PendingApproval' THEN 0 ELSE 1 END, d.requested_at DESC
      OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY;
    `, (sqlRequest) => sqlRequest
      .input("site", sql.BigInt, optionalPositiveLong(query.siteId, "siteId"))
      .input("program", sql.BigInt, optionalPositiveLong(query.programId, "programId"))
      .input("status", sql.NVarChar(20), status));
    const canApprove = await permissionFor(database, actor.id, APPROVE);
    return {
      items: result.recordset.map((row) => deploymentDto(row, actor.id, canApprove)),
      canRequest: await permissionFor(database, actor.id, DEPLOY),
      canApprove,
    };
  });

  app.post("/api/v1/monitor/programs/:programId/deployments", async (request, reply) => {
    await users.demandPermission(request, DEPLOY);
    const actor = await users.required(request);
    const id = programId(request);
    const input = body(request);
    const releaseId = typeof input.releaseId === "number" && Number.isSafeInteger(input.releaseId) ? input.releaseId : Number.NaN;
    const assetName = typeof input.assetName === "string" ? input.assetName : "";
    const note = noteOf(input.note);
    if (!Number.isSafeInteger(releaseId) || releaseId <= 0) throw new ApiError(400, "validation_failed", "Choose a release.");
    if (!deployableAssetKind(assetName)) throw new ApiError(400, "validation_failed", "Choose a .zip or .exe file from the release.");

    const program = await readProgram(id);
    const blocked = deploymentBlocker(programState(program), "request");
    if (blocked) throw blocked;
    const client = requireHub();
    const release = (await client.releases(program.repository)).find((item) => item.id === releaseId && !item.draft);
    if (!release) throw new ApiError(404, "release_not_found", "The release no longer exists in TMTHub.");
    const asset = release.assets.find((item) => item.name === assetName);
    if (!asset) throw new ApiError(404, "release_asset_not_found", "The release has no file with that name.");
    if (asset.size > MAX_ARTIFACT_BYTES) throw new ApiError(413, "monitor_artifact_too_large", `A release file may be at most ${MAX_ARTIFACT_BYTES / 1024 / 1024} MB.`);

    // The exact bytes are copied and hashed now, so the approver approves what will be installed.
    const key = artifactStorageKey(asset.name);
    const download = await client.releaseAsset(program.repository, release.tag_name, asset.name);
    const stored = await storeArtifact(config.documentStorage, key, download.body, asset.size);
    let created: number;
    try {
      created = await database.transaction(async (transaction) => {
        const inserted = await new sql.Request(transaction)
          .input("program", sql.BigInt, id)
          .input("agent", sql.BigInt, Number(program.agent_id))
          .input("repository", sql.NVarChar(100), program.repository)
          .input("tag", sql.NVarChar(100), release.tag_name.slice(0, 100))
          .input("release_name", sql.NVarChar(200), (release.name || release.tag_name).slice(0, 200))
          .input("asset_name", sql.NVarChar(255), asset.name.slice(0, 255))
          .input("asset_size", sql.BigInt, stored.sizeBytes)
          .input("sha256", sql.Char(64), stored.sha256)
          .input("storage_key", sql.NVarChar(500), key)
          .input("note", sql.NVarChar(1000), note)
          .input("actor", sql.BigInt, actor.id)
          .input("previous_version", sql.NVarChar(100), program.version)
          .query<{ id: number | string }>(DEPLOYMENT_INSERT_SQL);
        const newId = Number(inserted.recordset[0]!.id);
        await insertAudit(transaction, actor.id, "MonitorDeployment", newId, `${program.name}`.slice(0, 50), "Requested", null, {
          program: program.name, site: program.site_name, repository: program.repository, release: release.tag_name,
          asset: asset.name, sha256: stored.sha256,
        });
        // Everyone who may approve hears about it, except the person who asked.
        const approvers = await new sql.Request(transaction).input("actor", sql.BigInt, actor.id).query<{ user_id: number | string }>(`
          SELECT DISTINCT ep.user_id FROM dbo.user_effective_permissions ep
          INNER JOIN dbo.users u ON u.id = ep.user_id AND u.is_active = 1 AND u.deleted_at IS NULL
          WHERE ep.code = N'monitor.approve' AND ep.user_id <> @actor;`);
        await notifyUsers(transaction, approvers.recordset.map((row) => Number(row.user_id)), "MonitorDeploymentRequested",
          `Update ${program.name} to ${release.tag_name}`, `${program.site_name} · ${program.agent_name} · requested by ${actor.name}`,
          "MonitorDeployment", newId, `monitor-deployment-${newId}`);
        return newId;
      });
    } catch (error) {
      await deleteStoredFile(config.documentStorage, key).catch(() => undefined);
      if (isDuplicateKey(error)) throw new ApiError(409, "monitor_deployment_open", "This program already has an update waiting or in progress.");
      throw error;
    }
    request.log.info({ actorId: actor.id, programId: id, deploymentId: created, release: release.tag_name, sha256: stored.sha256 }, "Release deployment requested");
    const result = await database.query<DeploymentRow>(`${DEPLOYMENT_SELECT} WHERE d.id = @id;`, (sqlRequest) => sqlRequest.input("id", sql.BigInt, created));
    return reply.code(201).send(deploymentDto(result.recordset[0]!, actor.id, await permissionFor(database, actor.id, APPROVE)));
  });

  app.post("/api/v1/monitor/deployments/:id/approve", async (request) => {
    await users.demandPermission(request, APPROVE);
    const actor = await users.required(request);
    const id = deploymentId(request);
    const note = noteOf(body(request).note);
    let agentId = 0;
    try {
      await database.transaction(async (transaction) => {
        const deployment = await readDeployment(id, transaction);
        if (deployment.status !== "PendingApproval") throw new ApiError(409, "monitor_deployment_decided", "This update was already decided.");
        if (Number(deployment.requested_by) === actor.id) {
          throw new ApiError(403, "monitor_deployment_own", "Someone other than the requester must approve this update.");
        }
        const program = await readProgram(Number(deployment.program_id), transaction);
        if (Number(program.agent_id) !== Number(deployment.agent_id)) {
          throw new ApiError(409, "monitor_deployment_stale", "The program moved to another machine; request the update again.");
        }
        const blocked = deploymentBlocker(programState(program), "approve");
        if (blocked) throw blocked;
        await new sql.Request(transaction)
          .input("id", sql.BigInt, id)
          .input("agent", sql.BigInt, Number(deployment.agent_id))
          .input("program", sql.BigInt, Number(deployment.program_id))
          .input("actor", sql.BigInt, actor.id)
          .input("note", sql.NVarChar(1000), note)
          .query(DEPLOYMENT_APPROVE_SQL);
        await insertAudit(transaction, actor.id, "MonitorDeployment", id, deployment.program_name.slice(0, 50), "Approved", null, {
          release: deployment.release_tag, asset: deployment.asset_name, sha256: deployment.sha256, note,
        });
        await notifyUsers(transaction, [Number(deployment.requested_by)], "MonitorDeploymentApproved",
          `Update of ${deployment.program_name} approved`, `${deployment.release_tag} · approved by ${actor.name}`,
          "MonitorDeployment", id, `monitor-deployment-${id}-approved`);
        agentId = Number(deployment.agent_id);
      }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    } catch (error) {
      if (isDuplicateKey(error)) throw new ApiError(409, "monitor_command_in_progress", "Another command for this program is running. Try again when it finishes.");
      throw error;
    }
    wakeAgent(agentId);
    request.log.info({ actorId: actor.id, deploymentId: id }, "Release deployment approved");
    return { ok: true };
  });

  const close = (outcome: "Rejected" | "Cancelled") => async (request: FastifyRequest) => {
    const actor = await users.required(request);
    const canApprove = await permissionFor(database, actor.id, APPROVE);
    const id = deploymentId(request);
    const note = noteOf(body(request).note);
    const storageKey = await database.transaction(async (transaction) => {
      const deployment = await readDeployment(id, transaction);
      if (deployment.status !== "PendingApproval") throw new ApiError(409, "monitor_deployment_decided", "This update was already decided.");
      const own = Number(deployment.requested_by) === actor.id;
      if (outcome === "Rejected" && (!canApprove || own)) {
        throw new ApiError(403, own ? "monitor_deployment_own" : "permission_denied", own
          ? "Someone other than the requester must decide this update; cancel it instead."
          : "Permission 'monitor.approve' is required.");
      }
      if (outcome === "Cancelled" && !own && !canApprove) throw new ApiError(403, "permission_denied", "Only the requester or an approver can cancel.");
      await new sql.Request(transaction).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id)
        .input("note", sql.NVarChar(1000), note).input("status", sql.NVarChar(20), outcome)
        .query(outcome === "Rejected"
          ? `UPDATE dbo.monitor_deployments SET status = @status, decided_by = @actor, decided_at = SYSUTCDATETIME(), decision_note = @note,
               completed_at = SYSUTCDATETIME() WHERE id = @id;`
          : `UPDATE dbo.monitor_deployments SET status = @status, decision_note = @note, completed_at = SYSUTCDATETIME() WHERE id = @id;`);
      await insertAudit(transaction, actor.id, "MonitorDeployment", id, deployment.program_name.slice(0, 50), outcome, null, { note });
      if (!own) {
        await notifyUsers(transaction, [Number(deployment.requested_by)], `MonitorDeployment${outcome}`,
          `Update of ${deployment.program_name} ${outcome.toLowerCase()}`, `${deployment.release_tag}${note ? ` · ${note}` : ""}`,
          "MonitorDeployment", id, `monitor-deployment-${id}-${outcome.toLowerCase()}`);
      }
      return deployment.storage_key;
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    // Nothing will install it now; the copy is not kept.
    await deleteStoredFile(config.documentStorage, storageKey).catch(() => undefined);
    return { ok: true };
  };
  app.post("/api/v1/monitor/deployments/:id/reject", async (request) => {
    await users.demandPermission(request, APPROVE);
    return close("Rejected")(request);
  });
  app.post("/api/v1/monitor/deployments/:id/cancel", async (request) => {
    await users.demandPermission(request, READ);
    return close("Cancelled")(request);
  });
}
