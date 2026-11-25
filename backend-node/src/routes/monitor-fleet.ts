import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { positiveLong } from "../http.js";
import {
  ALERT_CHANNELS,
  MonitorAlertSender,
  parseAlertChannel,
  sealAlertSecret,
  openAlertSecret,
  secretHint,
  validateLineTarget,
  validateLineToken,
  validateTeamsWebhook,
  type AlertChannel,
} from "../monitor-alerts.js";
import { permissionFor } from "../schedule-service.js";
import { notifyUsers } from "../site-visit-common.js";
import { HEARTBEAT_SECONDS, wakeAgent } from "../site-monitor.js";
import type { CurrentUserService } from "../users.js";
import { AGENT_COLUMNS, SITE_SUMMARY, agentDto, siteDto, type AgentRow, type SiteRow } from "./site-monitor.js";

/**
 * Fleet, Command Center, script jobs and alert channels (Site Monitor, migration 133):
 *
 *   GET  /api/v1/monitor/fleet                                 monitor.read     every machine of every site, with TMTDesk
 *   GET  /api/v1/monitor/command-center                        monitor.read     incident feed, recent commands, jobs, samples
 *   GET  /api/v1/monitor/script-jobs                           monitor.read     recent jobs (no script, no output)
 *   GET  /api/v1/monitor/script-jobs/:id                       monitor.script or monitor.approve: script and per-machine results
 *   POST /api/v1/monitor/script-jobs                           monitor.script   request a job for chosen machines
 *   POST /api/v1/monitor/script-jobs/:id/approve               monitor.approve  a different person; queues RunScript commands
 *   POST /api/v1/monitor/script-jobs/:id/reject                monitor.approve  a different person
 *   POST /api/v1/monitor/script-jobs/:id/cancel                requester or monitor.approve, while pending
 *   GET  /api/v1/monitor/sites/:siteId/alert-channels          monitor.manage   LINE / Teams settings (never the secret)
 *   PUT  /api/v1/monitor/sites/:siteId/alert-channels/:channel monitor.manage   save or clear a channel
 *   POST /api/v1/monitor/sites/:siteId/alert-channels/:channel/test  monitor.manage  send a test message
 *
 * The agent side of RunScript (delivery and result) lives in routes/site-monitor.ts.
 */
const READ = "monitor.read";
const MANAGE = "monitor.manage";
const SCRIPT = "monitor.script";
const APPROVE = "monitor.approve";

export const SCRIPT_MAX_BYTES = 64 * 1024;
export const SCRIPT_MAX_TARGETS = 200;
export const SCRIPT_DEFAULT_TIMEOUT = 300;

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
const numberOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function body(request: FastifyRequest): Record<string, unknown> {
  const value = request.body;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function noteOf(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length > 1000) throw new ApiError(400, "validation_failed", "The note cannot exceed 1000 characters.");
  return value;
}

export type ScriptJobInput = {
  title: string;
  shell: "powershell" | "cmd";
  script: string;
  timeoutSeconds: number;
  note: string;
  agentIds: number[];
};

/** The job form: the same limits TMT Control Panel enforces (ScriptRunner.cs), checked before anyone approves. */
export function parseScriptJobInput(raw: Record<string, unknown>): ScriptJobInput {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) throw new ApiError(400, "validation_failed", "Give the job a title.");
  if (title.length > 200) throw new ApiError(400, "value_too_long", "The title cannot exceed 200 characters.");
  const shell = raw.shell === "cmd" ? "cmd" : raw.shell === "powershell" || raw.shell === undefined ? "powershell" : null;
  if (!shell) throw new ApiError(400, "validation_failed", "shell must be powershell or cmd.");
  const script = typeof raw.script === "string" ? raw.script.replaceAll("\u0000", "") : "";
  if (!script.trim()) throw new ApiError(400, "validation_failed", "Write the script to run.");
  if (Buffer.byteLength(script, "utf8") > SCRIPT_MAX_BYTES) throw new ApiError(400, "monitor_script_too_large", "A script may be at most 64 KB.");
  const timeoutSeconds = raw.timeoutSeconds === undefined ? SCRIPT_DEFAULT_TIMEOUT : raw.timeoutSeconds;
  if (typeof timeoutSeconds !== "number" || !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600) {
    throw new ApiError(400, "validation_failed", "The timeout must be a whole number of seconds from 1 to 3600.");
  }
  if (!Array.isArray(raw.agentIds) || raw.agentIds.length === 0) throw new ApiError(400, "validation_failed", "Choose at least one machine.");
  if (raw.agentIds.length > SCRIPT_MAX_TARGETS) throw new ApiError(400, "validation_failed", `A job can run on at most ${SCRIPT_MAX_TARGETS} machines.`);
  const agentIds = [...new Set(raw.agentIds)].map((value) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new ApiError(400, "validation_failed", "A machine id is invalid.");
    return value;
  });
  return { title, shell, script, timeoutSeconds, note: noteOf(raw.note), agentIds };
}

export function scriptDigest(script: string): string {
  return createHash("sha256").update(script, "utf8").digest("hex");
}

type FleetAgentRow = AgentRow & {
  site_id: number | string; site_name: string; site_active: boolean;
  open_incidents: number; program_count: number; programs_running: number;
};

type JobRow = {
  id: number | string; job_key: string; title: string; shell: string; timeout_seconds: number; note: string; status: string;
  requested_by: number | string; requested_by_name: string; requested_at: Date; decided_by_name: string | null; decided_at: Date | null;
  decision_note: string; completed_at: Date | null; script_bytes: number | string;
  targets: number; waiting: number; running: number; succeeded: number; failed: number; rejected: number; skipped: number;
};

type TargetRow = {
  id: number | string; job_id: number | string; agent_id: number | string; agent_name: string; machine_name: string | null;
  site_id: number | string; site_name: string; status: string; exit_code: number | null; stdout: string | null; stderr: string | null;
  stdout_truncated: boolean; stderr_truncated: boolean; duration_ms: number | string | null; result_message: string | null;
  completed_at: Date | null;
};

export const JOB_SELECT = `
  SELECT j.id, j.job_key, j.title, j.shell, j.timeout_seconds, j.note, j.status, j.requested_by, ru.name AS requested_by_name,
         j.requested_at, du.name AS decided_by_name, j.decided_at, j.decision_note, j.completed_at, DATALENGTH(j.script) / 2 AS script_bytes,
         (SELECT COUNT(*) FROM dbo.monitor_script_targets t WHERE t.job_id = j.id) AS targets,
         (SELECT COUNT(*) FROM dbo.monitor_script_targets t WHERE t.job_id = j.id AND t.status = N'Waiting') AS waiting,
         (SELECT COUNT(*) FROM dbo.monitor_script_targets t WHERE t.job_id = j.id AND t.status IN (N'Pending', N'Delivered')) AS running,
         (SELECT COUNT(*) FROM dbo.monitor_script_targets t WHERE t.job_id = j.id AND t.status = N'Succeeded') AS succeeded,
         (SELECT COUNT(*) FROM dbo.monitor_script_targets t WHERE t.job_id = j.id AND t.status IN (N'Failed', N'Expired')) AS failed,
         (SELECT COUNT(*) FROM dbo.monitor_script_targets t WHERE t.job_id = j.id AND t.status = N'Rejected') AS rejected,
         (SELECT COUNT(*) FROM dbo.monitor_script_targets t WHERE t.job_id = j.id AND t.status IN (N'Skipped', N'Cancelled')) AS skipped
  FROM dbo.monitor_script_jobs j
  INNER JOIN dbo.users ru ON ru.id = j.requested_by
  LEFT JOIN dbo.users du ON du.id = j.decided_by`;

const TARGET_SELECT = `
  SELECT t.id, t.job_id, t.agent_id, a.name AS agent_name, a.machine_name, s.id AS site_id, s.name AS site_name, t.status,
         t.exit_code, t.stdout, t.stderr, t.stdout_truncated, t.stderr_truncated, t.duration_ms, t.result_message, t.completed_at
  FROM dbo.monitor_script_targets t
  INNER JOIN dbo.monitor_agents a ON a.id = t.agent_id
  INNER JOIN dbo.monitor_sites s ON s.id = a.site_id`;

function jobDto(row: JobRow, actorId: number, canApprove: boolean) {
  const pending = row.status === "PendingApproval";
  const own = Number(row.requested_by) === actorId;
  return {
    id: Number(row.id), jobKey: row.job_key.toLowerCase(), title: row.title, shell: row.shell, timeoutSeconds: Number(row.timeout_seconds),
    note: row.note, status: row.status, requestedBy: row.requested_by_name, requestedAt: iso(row.requested_at),
    decidedBy: row.decided_by_name, decidedAt: iso(row.decided_at), decisionNote: row.decision_note, completedAt: iso(row.completed_at),
    scriptBytes: Number(row.script_bytes ?? 0),
    counts: {
      targets: Number(row.targets), waiting: Number(row.waiting), running: Number(row.running), succeeded: Number(row.succeeded),
      failed: Number(row.failed), rejected: Number(row.rejected), skipped: Number(row.skipped),
    },
    canDecide: pending && canApprove && !own,
    canCancel: pending && (own || canApprove),
    isOwn: own,
  };
}

function targetDto(row: TargetRow) {
  return {
    id: Number(row.id), agentId: Number(row.agent_id), agentName: row.agent_name, machineName: row.machine_name,
    siteId: Number(row.site_id), siteName: row.site_name, status: row.status, exitCode: row.exit_code,
    stdout: row.stdout ?? "", stderr: row.stderr ?? "", stdoutTruncated: Boolean(row.stdout_truncated), stderrTruncated: Boolean(row.stderr_truncated),
    durationMs: numberOrNull(row.duration_ms), resultMessage: row.result_message, completedAt: iso(row.completed_at),
  };
}

/** Queues one RunScript per reachable machine; the others are skipped with the reason. Returns the queued agent ids. */
export const SCRIPT_APPROVE_SQL = `
  DECLARE @queued TABLE (target_id bigint NOT NULL, agent_id bigint NOT NULL);
  DECLARE @command TABLE (id bigint NOT NULL, agent_id bigint NOT NULL);

  UPDATE t SET status = N'Skipped', completed_at = SYSUTCDATETIME(),
    result_message = CASE WHEN a.revoked_at IS NOT NULL THEN N'The machine was removed from Site Monitor.'
                          WHEN s.is_active = 0 THEN N'The site is inactive.'
                          ELSE N'The machine was offline when the job was approved.' END
  FROM dbo.monitor_script_targets t
  INNER JOIN dbo.monitor_agents a ON a.id = t.agent_id
  INNER JOIN dbo.monitor_sites s ON s.id = a.site_id
  WHERE t.job_id = @id AND t.status = N'Waiting' AND (a.revoked_at IS NOT NULL OR s.is_active = 0 OR a.is_online = 0);

  INSERT @queued (target_id, agent_id)
  SELECT t.id, t.agent_id FROM dbo.monitor_script_targets t WHERE t.job_id = @id AND t.status = N'Waiting';

  INSERT dbo.monitor_commands (agent_id, program_id, verb, requested_by)
  OUTPUT inserted.id, inserted.agent_id INTO @command
  SELECT q.agent_id, NULL, N'RunScript', @actor FROM @queued q;

  UPDATE t SET status = N'Pending', command_id = c.id
  FROM dbo.monitor_script_targets t
  INNER JOIN @queued q ON q.target_id = t.id
  INNER JOIN @command c ON c.agent_id = q.agent_id;

  UPDATE dbo.monitor_script_jobs
  SET status = CASE WHEN EXISTS (SELECT 1 FROM @queued) THEN N'Running' ELSE N'Completed' END,
      decided_by = @actor, decided_at = SYSUTCDATETIME(), decision_note = @note,
      completed_at = CASE WHEN EXISTS (SELECT 1 FROM @queued) THEN NULL ELSE SYSUTCDATETIME() END
  WHERE id = @id AND status = N'PendingApproval';

  SELECT agent_id FROM @queued;`;

type ChannelRow = {
  channel: AlertChannel; is_enabled: boolean; target: string; secret_hint: string; last_sent_at: Date | null; last_error: string | null;
  updated_at: Date; updated_by_name: string; secret_cipher: Buffer; secret_iv: Buffer; secret_tag: Buffer; key_id: number;
};

export function registerMonitorFleetRoutes(
  app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService, fetchImpl: typeof fetch = fetch,
): void {
  const alerts = new MonitorAlertSender(database, config.credentialVault, fetchImpl, app.log, config.email.applicationBaseUrl);
  const jobId = (request: FastifyRequest) => positiveLong((request.params as Record<string, unknown>).id, "job");
  const siteIdOf = (request: FastifyRequest) => positiveLong((request.params as Record<string, unknown>).siteId, "siteId");

  // ── fleet and command center ───────────────────────────────────────────

  app.get("/api/v1/monitor/fleet", async (request) => {
    await users.demandPermission(request, READ);
    const result = await database.query<SiteRow | FleetAgentRow>(`
      ${SITE_SUMMARY}
      ORDER BY s.is_active DESC, s.name;

      SELECT ${AGENT_COLUMNS}, a.site_id, s.name AS site_name, s.is_active AS site_active,
        (SELECT COUNT(*) FROM dbo.monitor_incidents i WHERE i.agent_id = a.id AND i.resolved_at IS NULL) AS open_incidents,
        (SELECT COUNT(*) FROM dbo.monitor_programs p WHERE p.agent_id = a.id AND p.removed_at IS NULL) AS program_count,
        (SELECT COUNT(*) FROM dbo.monitor_programs p WHERE p.agent_id = a.id AND p.removed_at IS NULL AND p.is_running = 1) AS programs_running
      FROM dbo.monitor_agents a
      INNER JOIN dbo.monitor_sites s ON s.id = a.site_id
      WHERE a.revoked_at IS NULL
      ORDER BY s.name, a.name;
    `);
    const [sites, agents] = result.recordsets as unknown as [SiteRow[], FleetAgentRow[]];
    return {
      generatedAt: new Date().toISOString(),
      heartbeatSeconds: HEARTBEAT_SECONDS,
      sites: sites.map((site) => ({ ...siteDto(site, []), contacts: undefined })),
      agents: agents.map((row) => ({
        ...agentDto(row),
        keyHint: undefined,
        site: { id: Number(row.site_id), name: row.site_name, isActive: Boolean(row.site_active) },
        openIncidents: Number(row.open_incidents ?? 0),
        programCount: Number(row.program_count ?? 0),
        programsRunning: Number(row.programs_running ?? 0),
      })),
    };
  });

  app.get("/api/v1/monitor/command-center", async (request) => {
    await users.demandPermission(request, READ);
    const result = await database.query<Record<string, unknown>>(`
      SELECT TOP (60) i.id, i.kind, i.title, i.site_id, s.name AS site_name, i.agent_id, a.name AS agent_name, p.name AS program_name,
             i.opened_at, i.resolved_at, i.acknowledged_at, i.notified_level
      FROM dbo.monitor_incidents i
      INNER JOIN dbo.monitor_sites s ON s.id = i.site_id
      INNER JOIN dbo.monitor_agents a ON a.id = i.agent_id
      LEFT JOIN dbo.monitor_programs p ON p.id = i.program_id
      WHERE i.resolved_at IS NULL OR i.resolved_at > DATEADD(hour, -24, SYSUTCDATETIME())
      ORDER BY CASE WHEN i.resolved_at IS NULL THEN 0 ELSE 1 END, i.opened_at DESC;

      SELECT TOP (15) c.id, c.verb, c.status, c.requested_at, c.completed_at, c.result_message, u.name AS requested_by_name,
             a.name AS agent_name, s.name AS site_name, COALESCE(p.name, sj.title, N'') AS subject
      FROM dbo.monitor_commands c
      INNER JOIN dbo.monitor_agents a ON a.id = c.agent_id
      INNER JOIN dbo.monitor_sites s ON s.id = a.site_id
      INNER JOIN dbo.users u ON u.id = c.requested_by
      LEFT JOIN dbo.monitor_programs p ON p.id = c.program_id
      LEFT JOIN dbo.monitor_script_targets st ON st.command_id = c.id
      LEFT JOIN dbo.monitor_script_jobs sj ON sj.id = st.job_id
      ORDER BY c.id DESC;

      ${JOB_SELECT}
      ORDER BY CASE WHEN j.status IN (N'PendingApproval', N'Running') THEN 0 ELSE 1 END, j.requested_at DESC
      OFFSET 0 ROWS FETCH NEXT 8 ROWS ONLY;

      SELECT m.agent_id, m.sampled_at, m.cpu_percent, m.memory_percent, m.disk_percent
      FROM dbo.monitor_agent_samples m
      INNER JOIN dbo.monitor_agents a ON a.id = m.agent_id AND a.revoked_at IS NULL
      WHERE m.sampled_at > DATEADD(minute, -60, SYSUTCDATETIME())
      ORDER BY m.agent_id, m.sampled_at;
    `);
    const [incidents, commands, jobs, samples] = result.recordsets as unknown as [Record<string, unknown>[], Record<string, unknown>[], JobRow[], Record<string, unknown>[]];
    const series: Record<string, { t: string; cpu: number | null; mem: number | null; disk: number | null }[]> = {};
    for (const row of samples) {
      const key = String(row.agent_id);
      (series[key] ??= []).push({
        t: iso(row.sampled_at as Date)!, cpu: numberOrNull(row.cpu_percent), mem: numberOrNull(row.memory_percent), disk: numberOrNull(row.disk_percent),
      });
    }
    return {
      generatedAt: new Date().toISOString(),
      incidents: incidents.map((row) => ({
        id: Number(row.id), kind: row.kind, title: row.title, siteId: Number(row.site_id), siteName: row.site_name,
        agentId: Number(row.agent_id), agentName: row.agent_name, programName: row.program_name ?? null,
        openedAt: iso(row.opened_at as Date), resolvedAt: iso(row.resolved_at as Date | null), acknowledgedAt: iso(row.acknowledged_at as Date | null),
        notifiedLevel: Number(row.notified_level),
      })),
      commands: commands.map((row) => ({
        id: Number(row.id), verb: row.verb, status: row.status, requestedAt: iso(row.requested_at as Date), completedAt: iso(row.completed_at as Date | null),
        resultMessage: row.result_message ?? null, requestedBy: row.requested_by_name, agentName: row.agent_name, siteName: row.site_name, subject: row.subject,
      })),
      jobs: jobs.map((row) => jobDto(row, 0, false)),
      samples: series,
    };
  });

  // ── script jobs ────────────────────────────────────────────────────────

  const readJob = async (id: number, transaction: TransactionType): Promise<JobRow> => {
    const result = await new sql.Request(transaction).input("id", sql.BigInt, id)
      .query<JobRow>(`${JOB_SELECT.replace("FROM dbo.monitor_script_jobs j", "FROM dbo.monitor_script_jobs j WITH (UPDLOCK)")} WHERE j.id = @id;`);
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "monitor_script_job_not_found", "The script job was not found.");
    return row;
  };

  app.get("/api/v1/monitor/script-jobs", async (request) => {
    await users.demandPermission(request, READ);
    const actor = await users.required(request);
    const result = await database.query<JobRow>(`
      ${JOB_SELECT}
      ORDER BY CASE WHEN j.status = N'PendingApproval' THEN 0 WHEN j.status = N'Running' THEN 1 ELSE 2 END, j.requested_at DESC
      OFFSET 0 ROWS FETCH NEXT 30 ROWS ONLY;`);
    const canApprove = await permissionFor(database, actor.id, APPROVE);
    return {
      items: result.recordset.map((row) => jobDto(row, actor.id, canApprove)),
      canRequest: await permissionFor(database, actor.id, SCRIPT),
      canApprove,
    };
  });

  // The script and the machines' output can hold credentials: only the people who write or approve scripts see them.
  app.get("/api/v1/monitor/script-jobs/:id", async (request) => {
    const actor = await users.required(request);
    const canApprove = await permissionFor(database, actor.id, APPROVE);
    if (!canApprove && !(await permissionFor(database, actor.id, SCRIPT))) {
      throw new ApiError(403, "permission_denied", "Permission 'monitor.script' or 'monitor.approve' is required.");
    }
    const id = jobId(request);
    const result = await database.query<JobRow | TargetRow | { script: string }>(`
      ${JOB_SELECT} WHERE j.id = @id;
      SELECT script FROM dbo.monitor_script_jobs WHERE id = @id;
      ${TARGET_SELECT} WHERE t.job_id = @id ORDER BY s.name, a.name;
    `, (sqlRequest) => sqlRequest.input("id", sql.BigInt, id));
    const [jobs, scripts, targets] = result.recordsets as unknown as [JobRow[], { script: string }[], TargetRow[]];
    const job = jobs[0];
    if (!job) throw new ApiError(404, "monitor_script_job_not_found", "The script job was not found.");
    return { job: jobDto(job, actor.id, canApprove), script: scripts[0]?.script ?? "", targets: targets.map(targetDto) };
  });

  app.post("/api/v1/monitor/script-jobs", async (request, reply) => {
    await users.demandPermission(request, SCRIPT);
    const actor = await users.required(request);
    const input = parseScriptJobInput(body(request));
    const digest = scriptDigest(input.script);
    const created = await database.transaction(async (transaction) => {
      const found = await new sql.Request(transaction)
        .input("ids", sql.NVarChar(sql.MAX), JSON.stringify(input.agentIds))
        .query<{ id: number | string; name: string; site_name: string }>(`
          SELECT a.id, a.name, s.name AS site_name
          FROM dbo.monitor_agents a
          INNER JOIN dbo.monitor_sites s ON s.id = a.site_id
          INNER JOIN OPENJSON(@ids) WITH (id bigint '$') k ON k.id = a.id
          WHERE a.revoked_at IS NULL;`);
      if (found.recordset.length !== input.agentIds.length) {
        throw new ApiError(422, "monitor_agent_not_found", "One of the chosen machines is no longer monitored. Reload and choose again.");
      }
      const inserted = await new sql.Request(transaction)
        .input("title", sql.NVarChar(200), input.title)
        .input("shell", sql.NVarChar(12), input.shell)
        .input("script", sql.NVarChar(sql.MAX), input.script)
        .input("timeout", sql.Int, input.timeoutSeconds)
        .input("note", sql.NVarChar(1000), input.note)
        .input("actor", sql.BigInt, actor.id)
        .input("ids", sql.NVarChar(sql.MAX), JSON.stringify(input.agentIds))
        .query<{ id: number | string }>(`
          DECLARE @job TABLE (id bigint NOT NULL);
          INSERT dbo.monitor_script_jobs (title, shell, script, timeout_seconds, note, requested_by)
          OUTPUT inserted.id INTO @job
          VALUES (@title, @shell, @script, @timeout, @note, @actor);
          INSERT dbo.monitor_script_targets (job_id, agent_id)
          SELECT (SELECT id FROM @job), k.id FROM OPENJSON(@ids) WITH (id bigint '$') k;
          SELECT id FROM @job;`);
      const newId = Number(inserted.recordset[0]!.id);
      // The audit keeps the script's fingerprint, not its text: scripts can hold credentials.
      await insertAudit(transaction, actor.id, "MonitorScriptJob", newId, input.title.slice(0, 50), "Requested", null, {
        title: input.title, shell: input.shell, timeoutSeconds: input.timeoutSeconds, scriptSha256: digest,
        scriptBytes: Buffer.byteLength(input.script, "utf8"), note: input.note,
        machines: found.recordset.map((row) => `${row.site_name} · ${row.name}`),
      });
      const approvers = await new sql.Request(transaction).input("actor", sql.BigInt, actor.id).query<{ user_id: number | string }>(`
        SELECT DISTINCT ep.user_id FROM dbo.user_effective_permissions ep
        INNER JOIN dbo.users u ON u.id = ep.user_id AND u.is_active = 1 AND u.deleted_at IS NULL
        WHERE ep.code = N'monitor.approve' AND ep.user_id <> @actor;`);
      await notifyUsers(transaction, approvers.recordset.map((row) => Number(row.user_id)), "MonitorScriptRequested",
        `Run script "${input.title}" on ${input.agentIds.length} machine(s)`, `${input.shell} · requested by ${actor.name}`,
        "MonitorScriptJob", newId, `monitor-script-${newId}`);
      return newId;
    });
    request.log.info({ actorId: actor.id, jobId: created, machines: input.agentIds.length, scriptSha256: digest }, "Site Monitor script job requested");
    const result = await database.query<JobRow>(`${JOB_SELECT} WHERE j.id = @id;`, (sqlRequest) => sqlRequest.input("id", sql.BigInt, created));
    return reply.code(201).send(jobDto(result.recordset[0]!, actor.id, await permissionFor(database, actor.id, APPROVE)));
  });

  app.post("/api/v1/monitor/script-jobs/:id/approve", async (request) => {
    await users.demandPermission(request, APPROVE);
    const actor = await users.required(request);
    const id = jobId(request);
    const note = noteOf(body(request).note);
    const queued = await database.transaction(async (transaction) => {
      const job = await readJob(id, transaction);
      if (job.status !== "PendingApproval") throw new ApiError(409, "monitor_script_job_decided", "This script job was already decided.");
      if (Number(job.requested_by) === actor.id) throw new ApiError(403, "monitor_script_job_own", "Someone other than the requester must approve this script.");
      const result = await new sql.Request(transaction)
        .input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id).input("note", sql.NVarChar(1000), note)
        .query<{ agent_id: number | string }>(SCRIPT_APPROVE_SQL);
      const agents = result.recordset.map((row) => Number(row.agent_id));
      const script = await new sql.Request(transaction).input("id", sql.BigInt, id)
        .query<{ script: string }>(`SELECT script FROM dbo.monitor_script_jobs WHERE id = @id;`);
      await insertAudit(transaction, actor.id, "MonitorScriptJob", id, job.title.slice(0, 50), "Approved", null, {
        note, scriptSha256: scriptDigest(script.recordset[0]?.script ?? ""), queuedMachines: agents.length, skippedMachines: Number(job.targets) - agents.length,
      });
      await notifyUsers(transaction, [Number(job.requested_by)], "MonitorScriptApproved", `Script "${job.title}" approved`,
        `${agents.length} machine(s) queued · approved by ${actor.name}`, "MonitorScriptJob", id, `monitor-script-${id}-approved`);
      return agents;
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    for (const agentId of queued) wakeAgent(agentId);
    request.log.info({ actorId: actor.id, jobId: id, queued: queued.length }, "Site Monitor script job approved");
    return { ok: true, queued: queued.length };
  });

  const close = (outcome: "Rejected" | "Cancelled") => async (request: FastifyRequest) => {
    const actor = await users.required(request);
    const canApprove = await permissionFor(database, actor.id, APPROVE);
    const id = jobId(request);
    const note = noteOf(body(request).note);
    await database.transaction(async (transaction) => {
      const job = await readJob(id, transaction);
      if (job.status !== "PendingApproval") throw new ApiError(409, "monitor_script_job_decided", "This script job was already decided.");
      const own = Number(job.requested_by) === actor.id;
      if (outcome === "Rejected" && (!canApprove || own)) {
        throw new ApiError(403, own ? "monitor_script_job_own" : "permission_denied", own
          ? "Someone other than the requester must decide this script; cancel it instead."
          : "Permission 'monitor.approve' is required.");
      }
      if (outcome === "Cancelled" && !own && !canApprove) throw new ApiError(403, "permission_denied", "Only the requester or an approver can cancel.");
      await new sql.Request(transaction).input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id)
        .input("note", sql.NVarChar(1000), note).input("status", sql.NVarChar(20), outcome)
        .query(`
          UPDATE dbo.monitor_script_jobs
          SET status = @status, decision_note = @note, completed_at = SYSUTCDATETIME(),
              decided_by = CASE WHEN @status = N'Rejected' THEN @actor ELSE NULL END,
              decided_at = CASE WHEN @status = N'Rejected' THEN SYSUTCDATETIME() ELSE NULL END
          WHERE id = @id;
          UPDATE dbo.monitor_script_targets SET status = N'Cancelled', completed_at = SYSUTCDATETIME()
          WHERE job_id = @id AND status = N'Waiting';`);
      await insertAudit(transaction, actor.id, "MonitorScriptJob", id, job.title.slice(0, 50), outcome, null, { note });
      if (!own) {
        await notifyUsers(transaction, [Number(job.requested_by)], `MonitorScript${outcome}`, `Script "${job.title}" ${outcome.toLowerCase()}`,
          note || outcome, "MonitorScriptJob", id, `monitor-script-${id}-${outcome.toLowerCase()}`);
      }
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return { ok: true };
  };
  app.post("/api/v1/monitor/script-jobs/:id/reject", async (request) => {
    await users.demandPermission(request, APPROVE);
    return close("Rejected")(request);
  });
  app.post("/api/v1/monitor/script-jobs/:id/cancel", async (request) => {
    await users.demandPermission(request, READ);
    return close("Cancelled")(request);
  });

  // ── alert channels ─────────────────────────────────────────────────────

  const readChannels = async (siteId: number): Promise<ChannelRow[]> => {
    const result = await database.query<ChannelRow>(`
      SELECT c.channel, c.is_enabled, c.target, c.secret_hint, c.last_sent_at, c.last_error, c.updated_at, u.name AS updated_by_name,
             c.secret_cipher, c.secret_iv, c.secret_tag, c.key_id
      FROM dbo.monitor_site_alert_channels c INNER JOIN dbo.users u ON u.id = c.updated_by
      WHERE c.site_id = @site;`, (sqlRequest) => sqlRequest.input("site", sql.BigInt, siteId));
    return result.recordset;
  };

  const siteName = async (siteId: number, transaction?: TransactionType): Promise<{ name: string; location: string }> => {
    const query = `SELECT name, location FROM dbo.monitor_sites WHERE id = @site;`;
    const result = transaction
      ? await new sql.Request(transaction).input("site", sql.BigInt, siteId).query<{ name: string; location: string }>(query)
      : await database.query<{ name: string; location: string }>(query, (sqlRequest) => sqlRequest.input("site", sql.BigInt, siteId));
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "monitor_site_not_found", "The site was not found.");
    return row;
  };

  app.get("/api/v1/monitor/sites/:siteId/alert-channels", async (request) => {
    await users.demandPermission(request, MANAGE);
    const siteId = siteIdOf(request);
    await siteName(siteId);
    const rows = await readChannels(siteId);
    return {
      vaultConfigured: alerts.configured,
      channels: ALERT_CHANNELS.map((channel) => {
        const row = rows.find((item) => item.channel === channel);
        return row
          ? {
              channel, configured: true, enabled: Boolean(row.is_enabled), target: row.target, secretHint: row.secret_hint,
              lastSentAt: iso(row.last_sent_at), lastError: row.last_error, updatedAt: iso(row.updated_at), updatedBy: row.updated_by_name,
            }
          : { channel, configured: false, enabled: false, target: "", secretHint: "", lastSentAt: null, lastError: null, updatedAt: null, updatedBy: null };
      }),
    };
  });

  app.put("/api/v1/monitor/sites/:siteId/alert-channels/:channel", async (request) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const siteId = siteIdOf(request);
    const channel = parseAlertChannel((request.params as Record<string, unknown>).channel);
    const input = body(request);
    const remove = input.remove === true;
    const enabled = input.enabled !== false;
    const target = channel === "Line" && !remove ? validateLineTarget(input.target) : "";
    const rawSecret = typeof input.secret === "string" ? input.secret.trim() : "";
    const secret = rawSecret ? (channel === "Line" ? validateLineToken(rawSecret) : validateTeamsWebhook(rawSecret)) : null;
    if (!remove && !config.credentialVault) {
      throw new ApiError(503, "credential_vault_not_configured", "Alert tokens are stored encrypted; ask an administrator to set CREDENTIAL_VAULT_KEYS first.");
    }
    await database.transaction(async (transaction) => {
      const site = await siteName(siteId, transaction);
      const before = await new sql.Request(transaction).input("site", sql.BigInt, siteId).input("channel", sql.NVarChar(10), channel)
        .query<{ is_enabled: boolean; target: string; secret_hint: string }>(
          `SELECT is_enabled, target, secret_hint FROM dbo.monitor_site_alert_channels WITH (UPDLOCK, HOLDLOCK) WHERE site_id = @site AND channel = @channel;`);
      const previous = before.recordset[0] ?? null;
      const write = new sql.Request(transaction).input("site", sql.BigInt, siteId).input("channel", sql.NVarChar(10), channel)
        .input("actor", sql.BigInt, actor.id).input("enabled", sql.Bit, enabled).input("target", sql.NVarChar(100), target);
      if (remove) {
        await write.query(`DELETE FROM dbo.monitor_site_alert_channels WHERE site_id = @site AND channel = @channel;`);
      } else if (secret) {
        const sealed = sealAlertSecret(config.credentialVault!, siteId, channel, secret);
        await write
          .input("cipher", sql.VarBinary(sql.MAX), sealed.cipher).input("iv", sql.VarBinary(12), sealed.iv)
          .input("tag", sql.VarBinary(16), sealed.tag).input("key", sql.TinyInt, sealed.keyId).input("hint", sql.NVarChar(8), secretHint(secret))
          .query(`
            UPDATE dbo.monitor_site_alert_channels
            SET is_enabled = @enabled, target = @target, secret_cipher = @cipher, secret_iv = @iv, secret_tag = @tag, key_id = @key,
                secret_hint = @hint, last_error = NULL, updated_by = @actor, updated_at = SYSUTCDATETIME()
            WHERE site_id = @site AND channel = @channel;
            IF @@ROWCOUNT = 0
              INSERT dbo.monitor_site_alert_channels (site_id, channel, is_enabled, target, secret_cipher, secret_iv, secret_tag, key_id, secret_hint, updated_by)
              VALUES (@site, @channel, @enabled, @target, @cipher, @iv, @tag, @key, @hint, @actor);`);
      } else {
        if (!previous) throw new ApiError(400, "validation_failed", channel === "Line" ? "Paste the LINE channel access token." : "Paste the Teams webhook URL.");
        await write.query(`
          UPDATE dbo.monitor_site_alert_channels SET is_enabled = @enabled, target = @target, updated_by = @actor, updated_at = SYSUTCDATETIME()
          WHERE site_id = @site AND channel = @channel;`);
      }
      // Never the token or URL: only which one (its last characters) and whether it changed.
      await insertAudit(transaction, actor.id, "MonitorSite", siteId, site.name.slice(0, 50), remove ? `${channel} alerts removed` : `${channel} alerts saved`,
        previous ? { enabled: Boolean(previous.is_enabled), target: previous.target, secretHint: previous.secret_hint } : null,
        remove ? null : { enabled, target, secretChanged: secret !== null, secretHint: secret ? secretHint(secret) : previous?.secret_hint ?? "" });
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return { ok: true };
  });

  app.post("/api/v1/monitor/sites/:siteId/alert-channels/:channel/test", async (request) => {
    await users.demandPermission(request, MANAGE);
    const actor = await users.required(request);
    const siteId = siteIdOf(request);
    const channel = parseAlertChannel((request.params as Record<string, unknown>).channel);
    if (!config.credentialVault) throw new ApiError(503, "credential_vault_not_configured", "CREDENTIAL_VAULT_KEYS is not configured.");
    const site = await siteName(siteId);
    const row = (await readChannels(siteId)).find((item) => item.channel === channel);
    if (!row) throw new ApiError(404, "monitor_alert_channel_missing", "Save the channel first.");
    const secret = openAlertSecret(config.credentialVault, siteId, channel, { cipher: row.secret_cipher, iv: row.secret_iv, tag: row.secret_tag, keyId: Number(row.key_id) });
    let error: string | null = null;
    try {
      await alerts.send(channel, secret, row.target, {
        state: "test", kind: null, title: "Test", siteName: site.name, location: site.location, agentName: "", machineName: "",
        programName: "", openedAt: "", resolvedAt: "", priority: 0,
      });
    } catch (reason) {
      error = reason instanceof Error ? reason.message.slice(0, 300) : "Sending failed.";
    }
    await database.transaction(async (transaction) => {
      await new sql.Request(transaction).input("site", sql.BigInt, siteId).input("channel", sql.NVarChar(10), channel).input("error", sql.NVarChar(300), error)
        .query(`UPDATE dbo.monitor_site_alert_channels
                SET last_sent_at = CASE WHEN @error IS NULL THEN SYSUTCDATETIME() ELSE last_sent_at END, last_error = @error
                WHERE site_id = @site AND channel = @channel;`);
      await insertAudit(transaction, actor.id, "MonitorSite", siteId, site.name.slice(0, 50), `${channel} alert test`, null, { delivered: error === null, error });
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    if (error) throw new ApiError(502, "monitor_alert_send_failed", error);
    return { ok: true };
  });
}
