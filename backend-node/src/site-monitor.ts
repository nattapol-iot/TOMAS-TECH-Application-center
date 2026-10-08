import { createHash, randomBytes } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import sql from "mssql";
import type { Database } from "./db.js";
import type { EmailService } from "./email.js";
import { ApiError } from "./errors.js";

/**
 * Site Monitor core: TMT Control Panel agents report program state, machine resources and log lines;
 * incidents escalate by email to the site's responsible people 1 → 2 → 3. Pure helpers live here so
 * they can be unit-tested without a database; routes/site-monitor.ts wires them to HTTP.
 */

/** How often agents are asked to report. Offline detection uses the site's offline_minutes. */
export const HEARTBEAT_SECONDS = 15;
/** Longest a command long-poll is held open. */
export const COMMAND_WAIT_SECONDS = 25;
/** A queued command nobody picked up expires; a delivered one with no result fails. */
export const COMMAND_PICKUP_SECONDS = 120;
export const COMMAND_RESULT_SECONDS = 180;
export const LOG_RETENTION_DAYS = 30;

const MAX_PROGRAMS = 200;
const MAX_EVENTS = 200;
const MAX_LOGS = 500;

// ── Agent keys ──────────────────────────────────────────────────────────────

const AGENT_KEY_PREFIX = "tmtmon_";
export const AGENT_KEY_PATTERN = /^tmtmon_[A-Za-z0-9_-]{43}$/;

/** A new agent key: shown to the admin once; only its hash is stored. */
export function generateAgentKey(): string {
  return AGENT_KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function hashAgentKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** The last characters of a key, so people can tell which key a machine uses without seeing it. */
export function agentKeyHint(key: string): string {
  return key.slice(-4);
}

// ── Heartbeat payload ───────────────────────────────────────────────────────

export type LogLevel = "Info" | "Warning" | "Error";

export type HeartbeatProgram = {
  key: string;
  name: string;
  group: string;
  runAsAdmin: boolean;
  isRunning: boolean;
  cpuPercent: number | null;
  memoryBytes: number | null;
  uptimeSeconds: number | null;
  processCount: number;
};

export type HeartbeatInput = {
  batchId: string;
  machineName: string;
  agentVersion: string;
  allowsControl: boolean;
  host: {
    cpuPercent: number | null;
    memoryUsedBytes: number | null;
    memoryTotalBytes: number | null;
    diskFreeBytes: number | null;
    diskTotalBytes: number | null;
    uptimeSeconds: number | null;
  };
  programs: HeartbeatProgram[];
  /** Confirmed transitions; userInitiated = started/stopped on purpose (never an incident). */
  events: { programKey: string; kind: "Stopped" | "Recovered"; userInitiated: boolean; at: string }[];
  logs: { level: LogLevel; message: string; at: string }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROGRAM_KEY = /^[A-Za-z0-9_-]{1,64}$/;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown, maximum: number, field: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, "validation_failed", `${field} must be a list.`);
  if (value.length > maximum) throw new ApiError(400, "validation_failed", `${field} may contain at most ${maximum} items.`);
  return value;
}

/** Trimmed text cut to the column width; agent text is informational, so long values are truncated, not rejected. */
function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.replaceAll("\u0000", "").trim().slice(0, maximum) : "";
}

/** A finite number within range, or null. */
function measure(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, value));
}

function wholeNumber(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number | null {
  const number = measure(value, 0, maximum);
  return number === null ? null : Math.floor(number);
}

function percent(value: unknown): number | null {
  const number = measure(value, 0, 100);
  return number === null ? null : Math.round(number * 10) / 10;
}

export function normalizeLogLevel(value: unknown): LogLevel {
  const level = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (level.startsWith("err") || level === "fatal" || level === "critical") return "Error";
  if (level.startsWith("warn")) return "Warning";
  return "Info";
}

/** A timestamp the agent sent, kept when plausible (±7 days), otherwise the receive time. */
function timestamp(value: unknown, now: Date): string {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  const week = 7 * 24 * 3_600_000;
  return Number.isFinite(parsed) && Math.abs(parsed - now.getTime()) <= week
    ? new Date(parsed).toISOString()
    : now.toISOString();
}

/** Validates and normalizes a heartbeat. Malformed structure is a 400; odd values are clamped. */
export function parseHeartbeat(body: unknown, now = new Date()): HeartbeatInput {
  const input = record(body);
  const batchId = typeof input.batchId === "string" ? input.batchId.trim() : "";
  if (!UUID.test(batchId)) throw new ApiError(400, "validation_failed", "batchId must be a UUID.");

  const host = record(input.host);
  const programs: HeartbeatProgram[] = [];
  const seen = new Set<string>();
  for (const raw of list(input.programs, MAX_PROGRAMS, "programs")) {
    const program = record(raw);
    const key = typeof program.key === "string" ? program.key.trim() : "";
    if (!PROGRAM_KEY.test(key)) throw new ApiError(400, "validation_failed", "Each program needs a key of letters, digits, '-' or '_' (at most 64).");
    if (seen.has(key)) continue;
    seen.add(key);
    const isRunning = program.isRunning === true;
    programs.push({
      key,
      name: text(program.name, 200) || key,
      group: text(program.group, 150),
      runAsAdmin: program.runAsAdmin === true,
      isRunning,
      cpuPercent: isRunning ? percent(program.cpuPercent) : null,
      memoryBytes: isRunning ? wholeNumber(program.memoryBytes) : null,
      uptimeSeconds: isRunning ? wholeNumber(program.uptimeSeconds) : null,
      processCount: isRunning ? wholeNumber(program.processCount, 100_000) ?? 0 : 0,
    });
  }

  const events: HeartbeatInput["events"] = [];
  for (const raw of list(input.events, MAX_EVENTS, "events")) {
    const event = record(raw);
    const programKey = typeof event.programKey === "string" ? event.programKey.trim() : "";
    const kind = event.kind === "Stopped" || event.kind === "Recovered" ? event.kind : null;
    if (!PROGRAM_KEY.test(programKey) || !kind) continue;
    events.push({ programKey, kind, userInitiated: event.userInitiated === true, at: timestamp(event.at, now) });
  }

  const logs: HeartbeatInput["logs"] = [];
  for (const raw of list(input.logs, MAX_LOGS, "logs")) {
    const log = record(raw);
    const message = text(log.message, 2000);
    if (!message) continue;
    logs.push({ level: normalizeLogLevel(log.level), message, at: timestamp(log.at, now) });
  }

  return {
    batchId: batchId.toLowerCase(),
    machineName: text(input.machineName, 128),
    agentVersion: text(input.agentVersion, 40),
    allowsControl: input.allowsControl === true,
    host: {
      cpuPercent: percent(host.cpuPercent),
      memoryUsedBytes: wholeNumber(host.memoryUsedBytes),
      memoryTotalBytes: wholeNumber(host.memoryTotalBytes),
      diskFreeBytes: wholeNumber(host.diskFreeBytes),
      diskTotalBytes: wholeNumber(host.diskTotalBytes),
      uptimeSeconds: wholeNumber(host.uptimeSeconds),
    },
    programs,
    events,
    logs,
  };
}

// ── Escalation ──────────────────────────────────────────────────────────────

/**
 * The contact priority to notify next for an open, unacknowledged incident, or null when nothing
 * is due. Step 1 is immediate; step n+1 is due escalationMinutes × n after the incident opened.
 * escalationMinutes 0 notifies all three at once.
 */
export function nextNotificationLevel(notifiedLevel: number, openedAt: Date, escalationMinutes: number, now: Date): number | null {
  if (notifiedLevel >= 3) return null;
  if (escalationMinutes <= 0) return 3;
  if (notifiedLevel <= 0) return 1;
  const due = openedAt.getTime() + escalationMinutes * 60_000 * notifiedLevel;
  return now.getTime() >= due ? notifiedLevel + 1 : null;
}

// ── Command long-poll wake-ups ──────────────────────────────────────────────

// Module-level so every API instance in this process (one per listen address) shares them.
const waiters = new Map<number, Set<() => void>>();

/** Wakes the agent's waiting long-poll (if it is held by this process) so a new command goes out at once. */
export function wakeAgent(agentId: number): void {
  const set = waiters.get(agentId);
  if (!set) return;
  waiters.delete(agentId);
  for (const done of [...set]) done();
}

export function wakeAllAgents(): void {
  for (const agentId of [...waiters.keys()]) wakeAgent(agentId);
}

/** Resolves on wake, timeout or abort, whichever comes first. */
export function waitForAgentWake(agentId: number, milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let set = waiters.get(agentId);
    if (!set) {
      set = new Set();
      waiters.set(agentId, set);
    }
    const own = set;
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      own.delete(done);
      if (own.size === 0 && waiters.get(agentId) === own) waiters.delete(agentId);
      resolve();
    };
    const timer = setTimeout(done, Math.max(0, milliseconds));
    if (signal?.aborted) {
      done();
      return;
    }
    signal?.addEventListener("abort", done, { once: true });
    own.add(done);
  });
}

// ── Background sweeper ──────────────────────────────────────────────────────

type IncidentRow = {
  id: number | string;
  kind: "ProgramStopped" | "AgentOffline";
  notified_level: number;
  opened_at: Date;
  resolved_at: Date | null;
  site_id: number | string;
  site_name: string;
  location: string;
  escalation_minutes: number;
  agent_id: number | string;
  agent_name: string;
  machine_name: string | null;
  program_name: string | null;
};

type ContactRow = { name: string; email: string };
type LogRow = { level: string; message: string; logged_at: Date };

const SWEEP_INTERVAL_MS = 30_000;
const PURGE_INTERVAL_MS = 3_600_000;

let activeSweeper: SiteMonitorSweeper | null = null;

/** Runs a sweep soon (after a heartbeat opened an incident), through whichever sweeper this process runs. */
export function kickSiteMonitorSweeper(): void {
  activeSweeper?.kick();
}

/**
 * Starts the sweeper unless this process already runs one (the API listens once per configured
 * address, all on one database) or the database is read-only. Returns whether it started.
 */
export function startSiteMonitorSweeper(sweeper: SiteMonitorSweeper): boolean {
  if (activeSweeper || sweeper.readOnly) return false;
  activeSweeper = sweeper;
  sweeper.start();
  return true;
}

export function stopSiteMonitorSweeper(sweeper: SiteMonitorSweeper): void {
  sweeper.stop();
  if (activeSweeper === sweeper) activeSweeper = null;
}

/**
 * Marks silent agents offline, expires stale commands, sends escalation and resolution emails and
 * purges old log lines. Every state change is an atomic claim in SQL, so two API processes sweeping
 * the same database never send the same email twice.
 */
export class SiteMonitorSweeper {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private again = false;
  private lastPurge = 0;
  private readonly dateFormat: Intl.DateTimeFormat;

  constructor(
    private readonly database: Database,
    private readonly email: EmailService,
    timeZone: string,
    private readonly log: FastifyBaseLogger,
  ) {
    this.dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium", timeStyle: "medium" });
  }

  get readOnly(): boolean {
    return this.database.readOnly;
  }

  /** Use startSiteMonitorSweeper(), which keeps it to one sweeper per process. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.kick(), SWEEP_INTERVAL_MS);
    this.timer.unref();
    setTimeout(() => this.kick(), 5_000).unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  kick(): void {
    void this.run();
  }

  async run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      await this.step("offline", () => this.markOffline());
      await this.step("commands", () => this.expireCommands());
      await this.step("escalation", () => this.escalate());
      await this.step("resolution", () => this.notifyResolved());
      if (Date.now() - this.lastPurge > PURGE_INTERVAL_MS) {
        this.lastPurge = Date.now();
        await this.step("purge", () => this.purge());
      }
    } finally {
      this.running = false;
      if (this.again && this.timer) {
        this.again = false;
        this.kick();
      }
    }
  }

  private async step(name: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.log.error({ err: error, step: name }, "Site Monitor sweep step failed");
    }
  }

  private format(value: Date | null): string {
    return value ? this.dateFormat.format(value) : "";
  }

  async markOffline(): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await new sql.Request(transaction).query(`
        DECLARE @now datetimeoffset(0) = SYSUTCDATETIME();
        DECLARE @went TABLE (id bigint NOT NULL, site_id bigint NOT NULL, name nvarchar(150) NOT NULL);

        UPDATE a
        SET is_online = 0, status_changed_at = @now
        OUTPUT inserted.id, inserted.site_id, inserted.name INTO @went
        FROM dbo.monitor_agents a
        INNER JOIN dbo.monitor_sites s ON s.id = a.site_id
        WHERE a.is_online = 1 AND a.revoked_at IS NULL
          AND a.last_seen_at < DATEADD(minute, -s.offline_minutes, @now);

        INSERT dbo.monitor_incidents(site_id, agent_id, program_id, kind, title, opened_at)
        SELECT w.site_id, w.id, NULL, N'AgentOffline', LEFT(w.name + N' is offline', 300), @now
        FROM @went w
        INNER JOIN dbo.monitor_sites s ON s.id = w.site_id AND s.is_active = 1
        WHERE NOT EXISTS (
          SELECT 1 FROM dbo.monitor_incidents i
          WHERE i.agent_id = w.id AND i.kind = N'AgentOffline' AND i.resolved_at IS NULL);
      `);
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  }

  async expireCommands(): Promise<void> {
    await this.database.query(`
      UPDATE dbo.monitor_commands
      SET status = N'Expired', completed_at = SYSUTCDATETIME(),
          result_message = N'The agent did not pick up the command in time.'
      WHERE status = N'Pending' AND requested_at < DATEADD(second, -${COMMAND_PICKUP_SECONDS}, SYSUTCDATETIME());

      UPDATE dbo.monitor_commands
      SET status = N'Failed', completed_at = SYSUTCDATETIME(),
          result_message = N'The agent did not report a result.'
      WHERE status = N'Delivered' AND delivered_at < DATEADD(second, -${COMMAND_RESULT_SECONDS}, SYSUTCDATETIME());
    `);
  }

  private incidentQuery(where: string): string {
    return `
      SELECT i.id, i.kind, i.notified_level, i.opened_at, i.resolved_at,
             s.id AS site_id, s.name AS site_name, s.location, s.escalation_minutes,
             a.id AS agent_id, a.name AS agent_name, a.machine_name, p.name AS program_name
      FROM dbo.monitor_incidents i
      INNER JOIN dbo.monitor_sites s ON s.id = i.site_id
      INNER JOIN dbo.monitor_agents a ON a.id = i.agent_id
      LEFT JOIN dbo.monitor_programs p ON p.id = i.program_id
      WHERE ${where};`;
  }

  async escalate(now = new Date()): Promise<void> {
    const open = await this.database.query<IncidentRow>(this.incidentQuery(
      "i.resolved_at IS NULL AND i.acknowledged_at IS NULL AND i.notified_level < 3 AND s.is_active = 1"));
    for (const incident of open.recordset) {
      const current = Number(incident.notified_level);
      const target = nextNotificationLevel(current, incident.opened_at, Number(incident.escalation_minutes), now);
      if (target === null) continue;
      const claim = await this.database.query<{ claimed: number }>(`
        UPDATE dbo.monitor_incidents
        SET notified_level = @target, last_notified_at = SYSUTCDATETIME()
        WHERE id = @id AND notified_level = @current AND resolved_at IS NULL AND acknowledged_at IS NULL;
        SELECT @@ROWCOUNT AS claimed;
      `, (request) => {
        request.input("id", sql.BigInt, incident.id);
        request.input("current", sql.TinyInt, current);
        request.input("target", sql.TinyInt, target);
      });
      if (!claim.recordset[0]?.claimed) continue;
      await this.send(incident, "open", current, target);
    }
  }

  async notifyResolved(): Promise<void> {
    const resolved = await this.database.query<IncidentRow>(this.incidentQuery(
      "i.resolved_at IS NOT NULL AND i.notified_level > 0 AND i.resolution_notified_at IS NULL AND i.resolved_at > DATEADD(day, -1, SYSUTCDATETIME())"));
    for (const incident of resolved.recordset) {
      const claim = await this.database.query<{ claimed: number }>(`
        UPDATE dbo.monitor_incidents SET resolution_notified_at = SYSUTCDATETIME()
        WHERE id = @id AND resolution_notified_at IS NULL;
        SELECT @@ROWCOUNT AS claimed;
      `, (request) => request.input("id", sql.BigInt, incident.id));
      if (!claim.recordset[0]?.claimed) continue;
      await this.send(incident, "resolved", 0, Number(incident.notified_level));
    }
  }

  /** Emails the contacts whose priority is in (fromLevel, toLevel]. */
  private async send(incident: IncidentRow, state: "open" | "resolved", fromLevel: number, toLevel: number): Promise<void> {
    const details = await this.database.query<ContactRow | LogRow>(`
      SELECT u.name, u.email
      FROM dbo.monitor_site_contacts c
      INNER JOIN dbo.users u ON u.id = c.user_id
      WHERE c.site_id = @site AND c.priority > @from AND c.priority <= @to
        AND u.is_active = 1 AND u.deleted_at IS NULL
      ORDER BY c.priority;

      SELECT TOP (8) level, message, logged_at
      FROM dbo.monitor_logs
      WHERE agent_id = @agent AND level IN (N'Error', N'Warning')
        AND logged_at >= DATEADD(hour, -2, @opened)
      ORDER BY logged_at DESC;
    `, (request) => {
      request.input("site", sql.BigInt, incident.site_id);
      request.input("agent", sql.BigInt, incident.agent_id);
      request.input("from", sql.TinyInt, fromLevel);
      request.input("to", sql.TinyInt, toLevel);
      request.input("opened", sql.DateTimeOffset, incident.opened_at);
    });
    const recipients = (details.recordsets as unknown as [ContactRow[], LogRow[]])[0];
    const logs = (details.recordsets as unknown as [ContactRow[], LogRow[]])[1];
    if (recipients.length === 0) {
      this.log.warn({ incidentId: Number(incident.id), state, fromLevel, toLevel }, "Site Monitor incident has no responsible person to email");
      return;
    }
    const result = await this.email.sendSiteMonitorIncident({
      state,
      kind: incident.kind,
      siteName: incident.site_name,
      location: incident.location,
      agentName: incident.agent_name,
      machineName: incident.machine_name ?? "",
      programName: incident.program_name ?? "",
      openedAt: this.format(incident.opened_at),
      resolvedAt: this.format(incident.resolved_at),
      priority: fromLevel + 1,
      recentLogs: logs.map((log) => ({ at: this.format(log.logged_at), level: log.level, message: log.message })),
      recipients,
    });
    this.log.info({ incidentId: Number(incident.id), state, toLevel, status: result.status, recipients: result.recipients }, "Site Monitor incident email");
  }

  async purge(): Promise<void> {
    await this.database.query(`
      DELETE TOP (20000) FROM dbo.monitor_logs
      WHERE received_at < DATEADD(day, -${LOG_RETENTION_DAYS}, SYSUTCDATETIME());

      DELETE TOP (5000) FROM dbo.monitor_commands
      WHERE completed_at < DATEADD(day, -180, SYSUTCDATETIME());
    `);
  }
}
