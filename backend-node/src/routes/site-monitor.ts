import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import type { EmailService } from "../email.js";
import { ApiError } from "../errors.js";
import {
  AGENT_KEY_PATTERN,
  COMMAND_WAIT_SECONDS,
  HEARTBEAT_SECONDS,
  SiteMonitorSweeper,
  agentKeyHint,
  generateAgentKey,
  hashAgentKey,
  kickSiteMonitorSweeper,
  parseHeartbeat,
  startSiteMonitorSweeper,
  stopSiteMonitorSweeper,
  waitForAgentWake,
  wakeAgent,
  wakeAllAgents,
} from "../site-monitor.js";
import type { CurrentUserService } from "../users.js";

/**
 * Site Monitor HTTP API.
 *
 *   /api/v1/monitor/agent/*   TMT Control Panel (X-Agent-Key; no signed-in person)
 *   /api/v1/monitor/*         the Site Monitor screen (monitor.read / monitor.control / monitor.manage)
 */

type AgentIdentity = { id: number; siteId: number; name: string; siteName: string };
type Verb = "Start" | "Stop" | "Restart";

const READ = "monitor.read";
const CONTROL = "monitor.control";
const MANAGE = "monitor.manage";

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function id(value: unknown, field = "id"): number {
  const number = typeof value === "string" && /^\d{1,15}$/.test(value) ? Number(value) : typeof value === "number" ? value : Number.NaN;
  if (!Number.isSafeInteger(number) || number <= 0) throw new ApiError(400, "validation_failed", `${field} is invalid.`);
  return number;
}

function body(request: FastifyRequest): Record<string, unknown> {
  const value = request.body;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredText(value: unknown, maximum: number, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ApiError(400, "validation_failed", `${field} is required.`);
  if (text.length > maximum) throw new ApiError(400, "value_too_long", `${field} cannot exceed ${maximum} characters.`);
  return text;
}

function optionalText(value: unknown, maximum: number, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > maximum) throw new ApiError(400, "value_too_long", `${field} cannot exceed ${maximum} characters.`);
  return text;
}

function integerInRange(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ApiError(400, "validation_failed", `${field} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return value;
}

function verb(value: unknown): Verb {
  if (value === "Start" || value === "Stop" || value === "Restart") return value;
  throw new ApiError(400, "validation_failed", "verb must be Start, Stop or Restart.");
}

function header(request: FastifyRequest, name: string): string {
  const value = request.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function isDuplicateKey(error: unknown): boolean {
  const number = error instanceof sql.RequestError ? (error as sql.RequestError & { number?: number }).number : undefined;
  return number === 2601 || number === 2627;
}

export type SiteInput = {
  name: string;
  location: string;
  description: string;
  escalationMinutes: number;
  offlineMinutes: number;
  isActive: boolean;
  contacts: { priority: number; userId: number }[];
};

/** The site form: name, place, escalation timing and up to three distinct responsible people. */
export function parseSiteInput(raw: Record<string, unknown>): SiteInput {
  const contacts: SiteInput["contacts"] = [];
  const rawContacts = raw.contacts === undefined ? [] : raw.contacts;
  if (!Array.isArray(rawContacts) || rawContacts.length > 3) throw new ApiError(400, "validation_failed", "contacts must list at most three people.");
  for (const entry of rawContacts) {
    const contact = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const priority = integerInRange(contact.priority, 1, 3, "Contact priority");
    const userId = id(contact.userId, "Contact user");
    if (contacts.some((item) => item.priority === priority)) throw new ApiError(400, "validation_failed", "Each contact priority can be used once.");
    if (contacts.some((item) => item.userId === userId)) throw new ApiError(400, "validation_failed", "A person can be listed only once per site.");
    contacts.push({ priority, userId });
  }
  return {
    name: requiredText(raw.name, 150, "Site name"),
    location: optionalText(raw.location, 300, "Location"),
    description: optionalText(raw.description, 1000, "Description"),
    escalationMinutes: integerInRange(raw.escalationMinutes ?? 15, 0, 1440, "Escalation minutes"),
    offlineMinutes: integerInRange(raw.offlineMinutes ?? 3, 1, 120, "Offline minutes"),
    isActive: raw.isActive !== false,
    contacts: contacts.sort((a, b) => a.priority - b.priority),
  };
}

// ── row types ────────────────────────────────────────────────────────────────

type SiteRow = {
  id: number | string; name: string; location: string; description: string;
  escalation_minutes: number; offline_minutes: number; is_active: boolean; row_version: Buffer;
  agent_count?: number; agents_online?: number; program_count?: number; programs_running?: number;
  open_incidents?: number; last_seen_at?: Date | null;
};
type ContactRow = { site_id: number | string; priority: number; user_id: number | string; name: string; email: string };
type AgentRow = {
  id: number | string; name: string; key_hint: string; machine_name: string | null; agent_version: string | null;
  allows_control: boolean; is_online: boolean; last_seen_at: Date | null; status_changed_at: Date | null; created_at: Date;
  host_cpu_percent: number | null; host_memory_used_bytes: number | string | null; host_memory_total_bytes: number | string | null;
  host_disk_free_bytes: number | string | null; host_disk_total_bytes: number | string | null; host_uptime_seconds: number | string | null;
};
type ProgramRow = {
  id: number | string; agent_id: number | string; program_key: string; name: string; group_label: string;
  run_as_admin: boolean; is_running: boolean; cpu_percent: number | null; memory_bytes: number | string | null;
  uptime_seconds: number | string | null; process_count: number; status_changed_at: Date | null; reported_at: Date;
  command_id: number | string | null; command_verb: Verb | null; command_status: string | null;
};
type IncidentRow = {
  id: number | string; kind: string; agent_id: number | string; agent_name: string; program_id: number | string | null;
  program_name: string | null; opened_at: Date; resolved_at: Date | null; acknowledged_at: Date | null;
  acknowledged_by_name: string | null; notified_level: number;
};
type CommandRow = {
  id: number | string; program_id: number | string; program_name: string; verb: Verb; status: string;
  requested_by_name: string; requested_at: Date; completed_at: Date | null; result_message: string | null;
};
type LogRow = { id: number | string; agent_id: number | string; agent_name: string; level: string; message: string; logged_at: Date };

const SITE_SUMMARY = `
  SELECT s.id, s.name, s.location, s.description, s.escalation_minutes, s.offline_minutes, s.is_active, s.row_version,
    (SELECT COUNT(*) FROM dbo.monitor_agents a WHERE a.site_id = s.id AND a.revoked_at IS NULL) AS agent_count,
    (SELECT COUNT(*) FROM dbo.monitor_agents a WHERE a.site_id = s.id AND a.revoked_at IS NULL AND a.is_online = 1) AS agents_online,
    (SELECT COUNT(*) FROM dbo.monitor_programs p INNER JOIN dbo.monitor_agents a ON a.id = p.agent_id
      WHERE a.site_id = s.id AND a.revoked_at IS NULL AND p.removed_at IS NULL) AS program_count,
    (SELECT COUNT(*) FROM dbo.monitor_programs p INNER JOIN dbo.monitor_agents a ON a.id = p.agent_id
      WHERE a.site_id = s.id AND a.revoked_at IS NULL AND a.is_online = 1 AND p.removed_at IS NULL AND p.is_running = 1) AS programs_running,
    (SELECT COUNT(*) FROM dbo.monitor_incidents i WHERE i.site_id = s.id AND i.resolved_at IS NULL) AS open_incidents,
    (SELECT MAX(a.last_seen_at) FROM dbo.monitor_agents a WHERE a.site_id = s.id AND a.revoked_at IS NULL) AS last_seen_at
  FROM dbo.monitor_sites s`;

function siteDto(row: SiteRow, contacts: ContactRow[]) {
  return {
    id: Number(row.id),
    name: row.name,
    location: row.location,
    description: row.description,
    escalationMinutes: Number(row.escalation_minutes),
    offlineMinutes: Number(row.offline_minutes),
    isActive: Boolean(row.is_active),
    rowVersion: row.row_version.toString("base64"),
    agentCount: Number(row.agent_count ?? 0),
    agentsOnline: Number(row.agents_online ?? 0),
    programCount: Number(row.program_count ?? 0),
    programsRunning: Number(row.programs_running ?? 0),
    openIncidents: Number(row.open_incidents ?? 0),
    lastSeenAt: iso(row.last_seen_at),
    contacts: contacts.filter((contact) => Number(contact.site_id) === Number(row.id)).map((contact) => ({
      priority: Number(contact.priority), userId: Number(contact.user_id), name: contact.name, email: contact.email,
    })),
  };
}

function agentDto(row: AgentRow) {
  return {
    id: Number(row.id),
    name: row.name,
    keyHint: row.key_hint,
    machineName: row.machine_name,
    agentVersion: row.agent_version,
    allowsControl: Boolean(row.allows_control),
    isOnline: Boolean(row.is_online),
    lastSeenAt: iso(row.last_seen_at),
    statusChangedAt: iso(row.status_changed_at),
    createdAt: iso(row.created_at),
    host: {
      cpuPercent: numberOrNull(row.host_cpu_percent),
      memoryUsedBytes: numberOrNull(row.host_memory_used_bytes),
      memoryTotalBytes: numberOrNull(row.host_memory_total_bytes),
      diskFreeBytes: numberOrNull(row.host_disk_free_bytes),
      diskTotalBytes: numberOrNull(row.host_disk_total_bytes),
      uptimeSeconds: numberOrNull(row.host_uptime_seconds),
    },
  };
}

function commandDto(row: CommandRow) {
  return {
    id: Number(row.id), programId: Number(row.program_id), programName: row.program_name, verb: row.verb,
    status: row.status, requestedBy: row.requested_by_name, requestedAt: iso(row.requested_at),
    completedAt: iso(row.completed_at), resultMessage: row.result_message,
  };
}

const COMMAND_SELECT = `
  SELECT c.id, c.program_id, p.name AS program_name, c.verb, c.status, u.name AS requested_by_name,
         c.requested_at, c.completed_at, c.result_message
  FROM dbo.monitor_commands c
  INNER JOIN dbo.monitor_programs p ON p.id = c.program_id
  INNER JOIN dbo.users u ON u.id = c.requested_by`;

export function registerSiteMonitorRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
  email: EmailService,
): void {
  // One sweeper per process (the API listens once per configured address, all on one database).
  const sweeper = new SiteMonitorSweeper(database, email, config.businessTimeZone, app.log);
  if (startSiteMonitorSweeper(sweeper)) app.addHook("onClose", async () => stopSiteMonitorSweeper(sweeper));
  let closing = false;
  app.addHook("preClose", async () => {
    closing = true;
    wakeAllAgents();
  });

  // ── agent authentication ───────────────────────────────────────────────

  const agentFrom = async (request: FastifyRequest): Promise<AgentIdentity> => {
    const key = header(request, "x-agent-key");
    if (!AGENT_KEY_PATTERN.test(key)) throw new ApiError(401, "invalid_agent_key", "The agent key is missing or invalid.");
    const result = await database.query<{ id: number | string; site_id: number | string; name: string; site_name: string }>(`
      SELECT a.id, a.site_id, a.name, s.name AS site_name
      FROM dbo.monitor_agents a
      INNER JOIN dbo.monitor_sites s ON s.id = a.site_id
      WHERE a.key_hash = @hash AND a.revoked_at IS NULL;
    `, (request) => request.input("hash", sql.Char(64), hashAgentKey(key)));
    const row = result.recordset[0];
    if (!row) throw new ApiError(401, "invalid_agent_key", "The agent key is not recognised or has been revoked.");
    return { id: Number(row.id), siteId: Number(row.site_id), name: row.name, siteName: row.site_name };
  };

  // ── agent API ──────────────────────────────────────────────────────────

  /** Connection test from the Control Panel's settings dialog. */
  app.get("/api/v1/monitor/agent/ping", { config: { public: true } }, async (request) => {
    const agent = await agentFrom(request);
    return { agentName: agent.name, siteName: agent.siteName, heartbeatSeconds: HEARTBEAT_SECONDS };
  });

  /**
   * Program state, resources, transitions and log lines. A repeated batchId (the agent retrying
   * after a lost response) refreshes state but never inserts the same logs or incidents twice.
   */
  app.post("/api/v1/monitor/agent/heartbeat", { config: { public: true } }, async (request) => {
    const agent = await agentFrom(request);
    const input = parseHeartbeat(request.body);
    const programs = JSON.stringify(input.programs.map((program) => ({
      key: program.key, name: program.name, group: program.group, admin: program.runAsAdmin ? 1 : 0,
      running: program.isRunning ? 1 : 0, cpu: program.cpuPercent, memory: program.memoryBytes,
      uptime: program.uptimeSeconds, processes: program.processCount,
    })));
    const events = JSON.stringify(input.events.map((event) => ({
      programKey: event.programKey, kind: event.kind, userInitiated: event.userInitiated ? 1 : 0,
    })));
    const logs = JSON.stringify(input.logs);

    const outcome = await database.transaction(async (transaction) => {
      const sqlRequest = new sql.Request(transaction);
      sqlRequest.input("agent", sql.BigInt, agent.id);
      sqlRequest.input("batch", sql.UniqueIdentifier, input.batchId);
      sqlRequest.input("machine", sql.NVarChar(128), input.machineName || null);
      sqlRequest.input("version", sql.NVarChar(40), input.agentVersion || null);
      sqlRequest.input("allows", sql.Bit, input.allowsControl);
      sqlRequest.input("host_cpu", sql.Decimal(5, 1), input.host.cpuPercent);
      sqlRequest.input("host_mem_used", sql.BigInt, input.host.memoryUsedBytes);
      sqlRequest.input("host_mem_total", sql.BigInt, input.host.memoryTotalBytes);
      sqlRequest.input("host_disk_free", sql.BigInt, input.host.diskFreeBytes);
      sqlRequest.input("host_disk_total", sql.BigInt, input.host.diskTotalBytes);
      sqlRequest.input("host_uptime", sql.BigInt, input.host.uptimeSeconds);
      sqlRequest.input("programs", sql.NVarChar(sql.MAX), programs);
      sqlRequest.input("events", sql.NVarChar(sql.MAX), events);
      sqlRequest.input("logs", sql.NVarChar(sql.MAX), logs);
      const result = await sqlRequest.query<{ duplicate: boolean; opened: number }>(`
        DECLARE @now datetimeoffset(0) = SYSUTCDATETIME();
        DECLARE @duplicate bit = 0;
        IF EXISTS (SELECT 1 FROM dbo.monitor_agents WITH (UPDLOCK, HOLDLOCK) WHERE id = @agent AND last_batch_id = @batch)
          SET @duplicate = 1;

        UPDATE dbo.monitor_agents
        SET machine_name = @machine, agent_version = @version, allows_control = @allows,
            host_cpu_percent = @host_cpu, host_memory_used_bytes = @host_mem_used, host_memory_total_bytes = @host_mem_total,
            host_disk_free_bytes = @host_disk_free, host_disk_total_bytes = @host_disk_total, host_uptime_seconds = @host_uptime,
            last_batch_id = @batch, last_seen_at = @now,
            status_changed_at = CASE WHEN is_online = 0 THEN @now ELSE status_changed_at END,
            is_online = 1
        WHERE id = @agent;

        DECLARE @reported TABLE (
          program_key nvarchar(64) NOT NULL PRIMARY KEY, name nvarchar(200) NOT NULL, group_label nvarchar(150) NOT NULL,
          run_as_admin bit NOT NULL, is_running bit NOT NULL, cpu_percent decimal(5,1) NULL, memory_bytes bigint NULL,
          uptime_seconds bigint NULL, process_count int NOT NULL);
        INSERT @reported (program_key, name, group_label, run_as_admin, is_running, cpu_percent, memory_bytes, uptime_seconds, process_count)
        SELECT program_key, name, group_label, run_as_admin, is_running, cpu_percent, memory_bytes, uptime_seconds, process_count
        FROM OPENJSON(@programs) WITH (
          program_key nvarchar(64) '$.key', name nvarchar(200) '$.name', group_label nvarchar(150) '$.group',
          run_as_admin bit '$.admin', is_running bit '$.running', cpu_percent decimal(5,1) '$.cpu',
          memory_bytes bigint '$.memory', uptime_seconds bigint '$.uptime', process_count int '$.processes');

        UPDATE p
        SET name = s.name, group_label = s.group_label, run_as_admin = s.run_as_admin,
            status_changed_at = CASE WHEN p.is_running <> s.is_running OR p.removed_at IS NOT NULL THEN @now ELSE p.status_changed_at END,
            is_running = s.is_running, cpu_percent = s.cpu_percent, memory_bytes = s.memory_bytes,
            uptime_seconds = s.uptime_seconds, process_count = s.process_count, reported_at = @now, removed_at = NULL
        FROM dbo.monitor_programs p
        INNER JOIN @reported s ON s.program_key = p.program_key
        WHERE p.agent_id = @agent;

        INSERT dbo.monitor_programs (agent_id, program_key, name, group_label, run_as_admin, is_running,
                                     cpu_percent, memory_bytes, uptime_seconds, process_count, status_changed_at, reported_at)
        SELECT @agent, s.program_key, s.name, s.group_label, s.run_as_admin, s.is_running,
               s.cpu_percent, s.memory_bytes, s.uptime_seconds, s.process_count, @now, @now
        FROM @reported s
        WHERE NOT EXISTS (SELECT 1 FROM dbo.monitor_programs p WHERE p.agent_id = @agent AND p.program_key = s.program_key);

        -- Programs no longer configured on the machine.
        UPDATE dbo.monitor_programs
        SET removed_at = @now, is_running = 0, cpu_percent = NULL, memory_bytes = NULL, uptime_seconds = NULL,
            process_count = 0, status_changed_at = @now
        WHERE agent_id = @agent AND removed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM @reported s WHERE s.program_key = dbo.monitor_programs.program_key);

        -- The agent is reporting again, and programs that run (or were removed) are no longer a problem.
        UPDATE dbo.monitor_incidents SET resolved_at = @now
        WHERE agent_id = @agent AND kind = N'AgentOffline' AND resolved_at IS NULL;

        UPDATE i SET resolved_at = @now
        FROM dbo.monitor_incidents i
        INNER JOIN dbo.monitor_programs p ON p.id = i.program_id
        WHERE i.agent_id = @agent AND i.kind = N'ProgramStopped' AND i.resolved_at IS NULL
          AND (p.is_running = 1 OR p.removed_at IS NOT NULL);

        DECLARE @opened int = 0;
        IF @duplicate = 0
        BEGIN
          -- Only unexpected stops open an incident; a stop someone asked for is not a problem.
          INSERT dbo.monitor_incidents (site_id, agent_id, program_id, kind, title, opened_at)
          SELECT a.site_id, @agent, p.id, N'ProgramStopped', LEFT(p.name + N' stopped', 300), @now
          FROM (
            SELECT DISTINCT e.program_key
            FROM OPENJSON(@events) WITH (program_key nvarchar(64) '$.programKey', kind nvarchar(20) '$.kind', user_initiated bit '$.userInitiated') e
            WHERE e.kind = N'Stopped' AND e.user_initiated = 0
          ) stopped
          INNER JOIN dbo.monitor_programs p
            ON p.agent_id = @agent AND p.program_key = stopped.program_key AND p.is_running = 0 AND p.removed_at IS NULL
          INNER JOIN dbo.monitor_agents a ON a.id = @agent
          WHERE NOT EXISTS (
            SELECT 1 FROM dbo.monitor_incidents i
            WHERE i.agent_id = @agent AND i.kind = N'ProgramStopped' AND i.program_id = p.id AND i.resolved_at IS NULL);
          SET @opened = @@ROWCOUNT;

          INSERT dbo.monitor_logs (agent_id, level, message, logged_at)
          SELECT @agent, l.level, l.message, l.logged_at
          FROM OPENJSON(@logs) WITH (level nvarchar(10) '$.level', message nvarchar(2000) '$.message', logged_at datetimeoffset(3) '$.at') l;
        END;

        SELECT @duplicate AS duplicate, @opened AS opened;
      `);
      return result.recordset[0];
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);

    if ((outcome?.opened ?? 0) > 0) kickSiteMonitorSweeper();
    return { ok: true, duplicate: Boolean(outcome?.duplicate), heartbeatSeconds: HEARTBEAT_SECONDS, serverTime: new Date().toISOString() };
  });

  /** Long-poll: returns as soon as a command is queued for this agent, or empty after ?wait seconds. */
  app.get("/api/v1/monitor/agent/commands", { config: { public: true } }, async (request, reply) => {
    const agent = await agentFrom(request);
    const query = request.query as Record<string, unknown>;
    const requested = Number(typeof query.wait === "string" ? query.wait : 0);
    const waitMs = Math.min(COMMAND_WAIT_SECONDS, Math.max(0, Number.isFinite(requested) ? requested : 0)) * 1000;
    const deadline = Date.now() + waitMs;
    const gone = new AbortController();
    reply.raw.once("close", () => gone.abort());

    for (;;) {
      const claimed = await database.query<{ id: number | string; verb: Verb; program_key: string }>(`
        UPDATE c
        SET status = N'Delivered', delivered_at = SYSUTCDATETIME()
        OUTPUT inserted.id, inserted.verb, p.program_key
        FROM dbo.monitor_commands c
        INNER JOIN dbo.monitor_programs p ON p.id = c.program_id
        WHERE c.agent_id = @agent AND c.status = N'Pending';
      `, (sqlRequest) => sqlRequest.input("agent", sql.BigInt, agent.id));
      const commands = claimed.recordset.map((row) => ({ id: Number(row.id), verb: row.verb, programKey: row.program_key }));
      if (commands.length > 0) request.log.info({ agentId: agent.id, commands }, "Site Monitor commands delivered");
      const remaining = deadline - Date.now();
      if (commands.length > 0 || remaining <= 0 || closing || gone.signal.aborted) return { commands };
      // A command created in this process wakes us at once; one created elsewhere is seen within 10 s.
      await waitForAgentWake(agent.id, Math.min(10_000, remaining), gone.signal);
    }
  });

  app.post("/api/v1/monitor/agent/commands/:commandId/result", { config: { public: true } }, async (request) => {
    const agent = await agentFrom(request);
    const commandId = id((request.params as Record<string, unknown>).commandId, "commandId");
    const input = body(request);
    const success = input.success === true;
    const message = typeof input.message === "string" ? input.message.trim().slice(0, 1000) : "";
    const result = await database.query<{ updated: number }>(`
      UPDATE dbo.monitor_commands
      SET status = CASE WHEN @success = 1 THEN N'Succeeded' ELSE N'Failed' END,
          completed_at = SYSUTCDATETIME(), result_message = @message
      WHERE id = @id AND agent_id = @agent AND status IN (N'Pending', N'Delivered');
      SELECT @@ROWCOUNT AS updated;
    `, (sqlRequest) => {
      sqlRequest.input("id", sql.BigInt, commandId);
      sqlRequest.input("agent", sql.BigInt, agent.id);
      sqlRequest.input("success", sql.Bit, success);
      sqlRequest.input("message", sql.NVarChar(1000), message || null);
    });
    return { ok: (result.recordset[0]?.updated ?? 0) > 0 };
  });

  // ── screen API: reading ────────────────────────────────────────────────

  app.get("/api/v1/monitor/sites", async (request) => {
    await users.demandPermission(request, READ);
    const result = await database.query<SiteRow | ContactRow>(`
      ${SITE_SUMMARY}
      ORDER BY s.is_active DESC, s.name;

      SELECT c.site_id, c.priority, c.user_id, u.name, u.email
      FROM dbo.monitor_site_contacts c INNER JOIN dbo.users u ON u.id = c.user_id
      ORDER BY c.site_id, c.priority;
    `);
    const [sites, contacts] = result.recordsets as unknown as [SiteRow[], ContactRow[]];
    return { sites: sites.map((site) => siteDto(site, contacts)), heartbeatSeconds: HEARTBEAT_SECONDS };
  });

  app.get("/api/v1/monitor/sites/:siteId", async (request) => {
    await users.demandPermission(request, READ);
    const siteId = id((request.params as Record<string, unknown>).siteId, "siteId");
    const result = await database.query<SiteRow | ContactRow | AgentRow | ProgramRow | IncidentRow | CommandRow>(`
      ${SITE_SUMMARY}
      WHERE s.id = @site;

      SELECT c.site_id, c.priority, c.user_id, u.name, u.email
      FROM dbo.monitor_site_contacts c INNER JOIN dbo.users u ON u.id = c.user_id
      WHERE c.site_id = @site ORDER BY c.priority;

      SELECT id, name, key_hint, machine_name, agent_version, allows_control, is_online, last_seen_at, status_changed_at, created_at,
             host_cpu_percent, host_memory_used_bytes, host_memory_total_bytes, host_disk_free_bytes, host_disk_total_bytes, host_uptime_seconds
      FROM dbo.monitor_agents
      WHERE site_id = @site AND revoked_at IS NULL
      ORDER BY name;

      SELECT p.id, p.agent_id, p.program_key, p.name, p.group_label, p.run_as_admin, p.is_running, p.cpu_percent, p.memory_bytes,
             p.uptime_seconds, p.process_count, p.status_changed_at, p.reported_at,
             pending.id AS command_id, pending.verb AS command_verb, pending.status AS command_status
      FROM dbo.monitor_programs p
      INNER JOIN dbo.monitor_agents a ON a.id = p.agent_id
      OUTER APPLY (
        SELECT TOP (1) c.id, c.verb, c.status FROM dbo.monitor_commands c
        WHERE c.program_id = p.id AND c.status IN (N'Pending', N'Delivered') ORDER BY c.id DESC
      ) pending
      WHERE a.site_id = @site AND a.revoked_at IS NULL AND p.removed_at IS NULL
      ORDER BY a.name, p.name;

      SELECT TOP (50) i.id, i.kind, i.agent_id, a.name AS agent_name, i.program_id, p.name AS program_name,
             i.opened_at, i.resolved_at, i.acknowledged_at, ack.name AS acknowledged_by_name, i.notified_level
      FROM dbo.monitor_incidents i
      INNER JOIN dbo.monitor_agents a ON a.id = i.agent_id
      LEFT JOIN dbo.monitor_programs p ON p.id = i.program_id
      LEFT JOIN dbo.users ack ON ack.id = i.acknowledged_by
      WHERE i.site_id = @site AND (i.resolved_at IS NULL OR i.resolved_at > DATEADD(day, -14, SYSUTCDATETIME()))
      ORDER BY CASE WHEN i.resolved_at IS NULL THEN 0 ELSE 1 END, i.opened_at DESC;

      ${COMMAND_SELECT}
      INNER JOIN dbo.monitor_agents a ON a.id = c.agent_id
      WHERE a.site_id = @site
      ORDER BY c.id DESC
      OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;
    `, (sqlRequest) => sqlRequest.input("site", sql.BigInt, siteId));
    const [sites, contacts, agents, programs, incidents, commands] =
      result.recordsets as unknown as [SiteRow[], ContactRow[], AgentRow[], ProgramRow[], IncidentRow[], CommandRow[]];
    const site = sites[0];
    if (!site) throw new ApiError(404, "monitor_site_not_found", "The site was not found.");
    return {
      site: siteDto(site, contacts),
      agents: agents.map(agentDto),
      programs: programs.map((row) => ({
        id: Number(row.id), agentId: Number(row.agent_id), key: row.program_key, name: row.name, group: row.group_label,
        runAsAdmin: Boolean(row.run_as_admin), isRunning: Boolean(row.is_running), cpuPercent: numberOrNull(row.cpu_percent),
        memoryBytes: numberOrNull(row.memory_bytes), uptimeSeconds: numberOrNull(row.uptime_seconds),
        processCount: Number(row.process_count), statusChangedAt: iso(row.status_changed_at), reportedAt: iso(row.reported_at),
        pendingCommand: row.command_id === null ? null : { id: Number(row.command_id), verb: row.command_verb, status: row.command_status },
      })),
      incidents: incidents.map((row) => ({
        id: Number(row.id), kind: row.kind, agentId: Number(row.agent_id), agentName: row.agent_name,
        programId: numberOrNull(row.program_id), programName: row.program_name, openedAt: iso(row.opened_at),
        resolvedAt: iso(row.resolved_at), acknowledgedAt: iso(row.acknowledged_at),
        acknowledgedBy: row.acknowledged_by_name, notifiedLevel: Number(row.notified_level),
      })),
      commands: commands.map(commandDto),
    };
  });

  app.get("/api/v1/monitor/sites/:siteId/logs", async (request) => {
    await users.demandPermission(request, READ);
    const siteId = id((request.params as Record<string, unknown>).siteId, "siteId");
    const query = request.query as Record<string, unknown>;
    const level = typeof query.level === "string" && ["Info", "Warning", "Error", "Problems"].includes(query.level) ? query.level : null;
    const agentId = typeof query.agentId === "string" && query.agentId ? id(query.agentId, "agentId") : null;
    const beforeId = typeof query.beforeId === "string" && query.beforeId ? id(query.beforeId, "beforeId") : null;
    const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 200));
    const result = await database.query<LogRow>(`
      SELECT TOP (@limit) l.id, l.agent_id, a.name AS agent_name, l.level, l.message, l.logged_at
      FROM dbo.monitor_logs l
      INNER JOIN dbo.monitor_agents a ON a.id = l.agent_id
      WHERE a.site_id = @site
        AND (@level IS NULL OR l.level = @level OR (@level = N'Problems' AND l.level IN (N'Warning', N'Error')))
        AND (@agent IS NULL OR l.agent_id = @agent)
        AND (@before IS NULL OR l.id < @before)
        AND (@search IS NULL OR l.message LIKE N'%' + @search + N'%' ESCAPE N'\\')
      ORDER BY l.id DESC;
    `, (sqlRequest) => {
      sqlRequest.input("site", sql.BigInt, siteId);
      sqlRequest.input("limit", sql.Int, limit);
      sqlRequest.input("level", sql.NVarChar(10), level);
      sqlRequest.input("agent", sql.BigInt, agentId);
      sqlRequest.input("before", sql.BigInt, beforeId);
      sqlRequest.input("search", sql.NVarChar(200), search ? search.replace(/[\\%_[]/g, (character) => `\\${character}`) : null);
    });
    return {
      logs: result.recordset.map((row) => ({
        id: Number(row.id), agentId: Number(row.agent_id), agentName: row.agent_name, level: row.level,
        message: row.message, loggedAt: iso(row.logged_at),
      })),
    };
  });

  app.get("/api/v1/monitor/commands/:commandId", async (request) => {
    await users.demandPermission(request, READ);
    const commandId = id((request.params as Record<string, unknown>).commandId, "commandId");
    const result = await database.query<CommandRow>(`${COMMAND_SELECT} WHERE c.id = @id;`,
      (sqlRequest) => sqlRequest.input("id", sql.BigInt, commandId));
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "monitor_command_not_found", "The command was not found.");
    return { command: commandDto(row) };
  });

  // ── screen API: control ────────────────────────────────────────────────

  app.post("/api/v1/monitor/programs/:programId/commands", async (request) => {
    await users.demandPermission(request, CONTROL);
    const user = await users.required(request);
    const programId = id((request.params as Record<string, unknown>).programId, "programId");
    const requestedVerb = verb(body(request).verb);

    let created: { commandId: number; agentId: number };
    try {
      created = await database.transaction(async (transaction) => {
        const target = await new sql.Request(transaction).input("id", sql.BigInt, programId).query<{
          name: string; removed_at: Date | null; agent_id: number | string; agent_name: string; is_online: boolean;
          allows_control: boolean; revoked_at: Date | null; site_name: string; site_active: boolean;
        }>(`
          SELECT p.name, p.removed_at, a.id AS agent_id, a.name AS agent_name, a.is_online, a.allows_control, a.revoked_at,
                 s.name AS site_name, s.is_active AS site_active
          FROM dbo.monitor_programs p
          INNER JOIN dbo.monitor_agents a ON a.id = p.agent_id
          INNER JOIN dbo.monitor_sites s ON s.id = a.site_id
          WHERE p.id = @id;
        `);
        const program = target.recordset[0];
        if (!program || program.removed_at || program.revoked_at) throw new ApiError(404, "monitor_program_not_found", "The program is no longer monitored.");
        if (!program.site_active) throw new ApiError(409, "monitor_site_inactive", "The site is inactive.");
        if (!program.is_online) throw new ApiError(409, "monitor_agent_offline", "The machine running this program is offline, so it cannot receive the command.");
        if (!program.allows_control) throw new ApiError(409, "monitor_control_disabled", "Remote control is turned off in TMT Control Panel on this machine.");

        const inserted = await new sql.Request(transaction)
          .input("agent", sql.BigInt, program.agent_id)
          .input("program", sql.BigInt, programId)
          .input("verb", sql.NVarChar(10), requestedVerb)
          .input("user", sql.BigInt, user.id)
          .query<{ id: number | string }>(`
            INSERT dbo.monitor_commands (agent_id, program_id, verb, requested_by)
            OUTPUT inserted.id
            VALUES (@agent, @program, @verb, @user);
          `);
        const commandId = Number(inserted.recordset[0]!.id);
        await insertAudit(transaction, user.id, "MonitorProgram", programId, program.name.slice(0, 50), `${requestedVerb} requested`,
          null, { commandId, verb: requestedVerb, site: program.site_name, agent: program.agent_name, program: program.name });
        return { commandId, agentId: Number(program.agent_id) };
      }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    } catch (error) {
      if (isDuplicateKey(error)) throw new ApiError(409, "monitor_command_in_progress", "A command for this program is already in progress. Wait for it to finish.");
      throw error;
    }
    wakeAgent(created.agentId);
    request.log.info({ actorId: user.id, programId, verb: requestedVerb, commandId: created.commandId }, "Site Monitor command queued");
    const result = await database.query<CommandRow>(`${COMMAND_SELECT} WHERE c.id = @id;`,
      (sqlRequest) => sqlRequest.input("id", sql.BigInt, created.commandId));
    return { command: commandDto(result.recordset[0]!) };
  });

  app.post("/api/v1/monitor/incidents/:incidentId/acknowledge", async (request) => {
    await users.demandPermission(request, CONTROL);
    const user = await users.required(request);
    const incidentId = id((request.params as Record<string, unknown>).incidentId, "incidentId");
    await database.transaction(async (transaction) => {
      const updated = await new sql.Request(transaction)
        .input("id", sql.BigInt, incidentId)
        .input("user", sql.BigInt, user.id)
        .query<{ updated: number; title: string | null }>(`
          UPDATE dbo.monitor_incidents
          SET acknowledged_at = SYSUTCDATETIME(), acknowledged_by = @user
          WHERE id = @id AND resolved_at IS NULL AND acknowledged_at IS NULL;
          SELECT @@ROWCOUNT AS updated, (SELECT title FROM dbo.monitor_incidents WHERE id = @id) AS title;
        `);
      const row = updated.recordset[0];
      if (!row?.updated) throw new ApiError(409, "monitor_incident_closed", "The incident is already acknowledged or resolved.");
      await insertAudit(transaction, user.id, "MonitorIncident", incidentId, "", "Acknowledged", null, { title: row.title });
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return { ok: true };
  });

  // ── screen API: configuration ──────────────────────────────────────────

  const writeContacts = async (transaction: TransactionType, siteId: number, contacts: SiteInput["contacts"]): Promise<void> => {
    await new sql.Request(transaction).input("site", sql.BigInt, siteId)
      .query(`DELETE FROM dbo.monitor_site_contacts WHERE site_id = @site;`);
    if (contacts.length === 0) return;
    const inserted = await new sql.Request(transaction)
      .input("site", sql.BigInt, siteId)
      .input("contacts", sql.NVarChar(sql.MAX), JSON.stringify(contacts))
      .query<{ inserted: number }>(`
        INSERT dbo.monitor_site_contacts (site_id, priority, user_id)
        SELECT @site, c.priority, c.user_id
        FROM OPENJSON(@contacts) WITH (priority tinyint '$.priority', user_id bigint '$.userId') c
        INNER JOIN dbo.users u ON u.id = c.user_id AND u.is_active = 1 AND u.deleted_at IS NULL AND LEN(u.email) > 0;
        SELECT @@ROWCOUNT AS inserted;
      `);
    if ((inserted.recordset[0]?.inserted ?? 0) !== contacts.length) {
      throw new ApiError(422, "monitor_contact_unavailable", "Each responsible person must be an active user with an email address.");
    }
  };

  app.post("/api/v1/monitor/sites", async (request) => {
    await users.demandPermission(request, MANAGE);
    const user = await users.required(request);
    const input = parseSiteInput(body(request));
    try {
      const siteId = await database.transaction(async (transaction) => {
        const inserted = await new sql.Request(transaction)
          .input("name", sql.NVarChar(150), input.name)
          .input("location", sql.NVarChar(300), input.location)
          .input("description", sql.NVarChar(1000), input.description)
          .input("escalation", sql.Int, input.escalationMinutes)
          .input("offline", sql.Int, input.offlineMinutes)
          .input("active", sql.Bit, input.isActive)
          .input("user", sql.BigInt, user.id)
          .query<{ id: number | string }>(`
            INSERT dbo.monitor_sites (name, location, description, escalation_minutes, offline_minutes, is_active, created_by)
            OUTPUT inserted.id
            VALUES (@name, @location, @description, @escalation, @offline, @active, @user);
          `);
        const newId = Number(inserted.recordset[0]!.id);
        await writeContacts(transaction, newId, input.contacts);
        await insertAudit(transaction, user.id, "MonitorSite", newId, input.name.slice(0, 50), "Created", null, input);
        return newId;
      });
      return { id: siteId };
    } catch (error) {
      if (isDuplicateKey(error)) throw new ApiError(409, "monitor_site_name_taken", "Another site already has this name.");
      throw error;
    }
  });

  app.put("/api/v1/monitor/sites/:siteId", async (request) => {
    await users.demandPermission(request, MANAGE);
    const user = await users.required(request);
    const siteId = id((request.params as Record<string, unknown>).siteId, "siteId");
    const raw = body(request);
    const input = parseSiteInput(raw);
    const rowVersion = typeof raw.rowVersion === "string" ? Buffer.from(raw.rowVersion, "base64") : null;
    if (!rowVersion || rowVersion.length !== 8) throw new ApiError(400, "validation_failed", "rowVersion is required.");
    try {
      await database.transaction(async (transaction) => {
        const before = await new sql.Request(transaction).input("site", sql.BigInt, siteId)
          .query<SiteRow>(`SELECT id, name, location, description, escalation_minutes, offline_minutes, is_active, row_version FROM dbo.monitor_sites WITH (UPDLOCK) WHERE id = @site;`);
        const previous = before.recordset[0];
        if (!previous) throw new ApiError(404, "monitor_site_not_found", "The site was not found.");
        if (!previous.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", "The site was changed by someone else. Reload it and try again.");
        await new sql.Request(transaction)
          .input("site", sql.BigInt, siteId)
          .input("name", sql.NVarChar(150), input.name)
          .input("location", sql.NVarChar(300), input.location)
          .input("description", sql.NVarChar(1000), input.description)
          .input("escalation", sql.Int, input.escalationMinutes)
          .input("offline", sql.Int, input.offlineMinutes)
          .input("active", sql.Bit, input.isActive)
          .query(`
            UPDATE dbo.monitor_sites
            SET name = @name, location = @location, description = @description, escalation_minutes = @escalation,
                offline_minutes = @offline, is_active = @active, updated_at = SYSUTCDATETIME()
            WHERE id = @site;
          `);
        await writeContacts(transaction, siteId, input.contacts);
        await insertAudit(transaction, user.id, "MonitorSite", siteId, input.name.slice(0, 50), "Updated", {
          name: previous.name, location: previous.location, description: previous.description,
          escalationMinutes: previous.escalation_minutes, offlineMinutes: previous.offline_minutes, isActive: previous.is_active,
        }, input);
      });
    } catch (error) {
      if (isDuplicateKey(error)) throw new ApiError(409, "monitor_site_name_taken", "Another site already has this name.");
      throw error;
    }
    return { ok: true };
  });

  app.post("/api/v1/monitor/sites/:siteId/agents", async (request) => {
    await users.demandPermission(request, MANAGE);
    const user = await users.required(request);
    const siteId = id((request.params as Record<string, unknown>).siteId, "siteId");
    const name = requiredText(body(request).name, 150, "Machine name");
    const key = generateAgentKey();
    const agentId = await database.transaction(async (transaction) => {
      const site = await new sql.Request(transaction).input("site", sql.BigInt, siteId)
        .query<{ name: string }>(`SELECT name FROM dbo.monitor_sites WHERE id = @site;`);
      if (!site.recordset[0]) throw new ApiError(404, "monitor_site_not_found", "The site was not found.");
      const inserted = await new sql.Request(transaction)
        .input("site", sql.BigInt, siteId)
        .input("name", sql.NVarChar(150), name)
        .input("hash", sql.Char(64), hashAgentKey(key))
        .input("hint", sql.NVarChar(8), agentKeyHint(key))
        .input("user", sql.BigInt, user.id)
        .query<{ id: number | string }>(`
          INSERT dbo.monitor_agents (site_id, name, key_hash, key_hint, created_by)
          OUTPUT inserted.id
          VALUES (@site, @name, @hash, @hint, @user);
        `);
      const newId = Number(inserted.recordset[0]!.id);
      // The key itself is never written anywhere but the response.
      await insertAudit(transaction, user.id, "MonitorAgent", newId, name.slice(0, 50), "Key created", null,
        { site: site.recordset[0].name, name, keyHint: agentKeyHint(key) });
      return newId;
    });
    return { agent: { id: agentId, name, keyHint: agentKeyHint(key) }, key };
  });

  app.post("/api/v1/monitor/agents/:agentId/rotate-key", async (request) => {
    await users.demandPermission(request, MANAGE);
    const user = await users.required(request);
    const agentId = id((request.params as Record<string, unknown>).agentId, "agentId");
    const key = generateAgentKey();
    await database.transaction(async (transaction) => {
      const updated = await new sql.Request(transaction)
        .input("id", sql.BigInt, agentId)
        .input("hash", sql.Char(64), hashAgentKey(key))
        .input("hint", sql.NVarChar(8), agentKeyHint(key))
        .query<{ updated: number; name: string | null }>(`
          UPDATE dbo.monitor_agents SET key_hash = @hash, key_hint = @hint, last_batch_id = NULL
          WHERE id = @id AND revoked_at IS NULL;
          SELECT @@ROWCOUNT AS updated, (SELECT name FROM dbo.monitor_agents WHERE id = @id) AS name;
        `);
      const row = updated.recordset[0];
      if (!row?.updated) throw new ApiError(404, "monitor_agent_not_found", "The machine was not found or its key was revoked.");
      await insertAudit(transaction, user.id, "MonitorAgent", agentId, (row.name ?? "").slice(0, 50), "Key rotated", null, { keyHint: agentKeyHint(key) });
    });
    return { key, keyHint: agentKeyHint(key) };
  });

  app.post("/api/v1/monitor/agents/:agentId/revoke", async (request) => {
    await users.demandPermission(request, MANAGE);
    const user = await users.required(request);
    const agentId = id((request.params as Record<string, unknown>).agentId, "agentId");
    await database.transaction(async (transaction) => {
      const updated = await new sql.Request(transaction)
        .input("id", sql.BigInt, agentId)
        .query<{ updated: number; name: string | null }>(`
          DECLARE @now datetimeoffset(0) = SYSUTCDATETIME();
          UPDATE dbo.monitor_agents SET revoked_at = @now, is_online = 0, status_changed_at = @now
          WHERE id = @id AND revoked_at IS NULL;
          DECLARE @updated int = @@ROWCOUNT;
          IF @updated = 1
          BEGIN
            UPDATE dbo.monitor_incidents SET resolved_at = @now WHERE agent_id = @id AND resolved_at IS NULL;
            UPDATE dbo.monitor_commands SET status = N'Expired', completed_at = @now, result_message = N'The machine was removed from Site Monitor.'
            WHERE agent_id = @id AND status IN (N'Pending', N'Delivered');
          END;
          SELECT @updated AS updated, (SELECT name FROM dbo.monitor_agents WHERE id = @id) AS name;
        `);
      const row = updated.recordset[0];
      if (!row?.updated) throw new ApiError(404, "monitor_agent_not_found", "The machine was not found or was already removed.");
      await insertAudit(transaction, user.id, "MonitorAgent", agentId, (row.name ?? "").slice(0, 50), "Key revoked", null, null);
    });
    wakeAgent(agentId);
    return { ok: true };
  });
}
