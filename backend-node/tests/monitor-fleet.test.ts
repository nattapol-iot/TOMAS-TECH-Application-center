import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import type { FastifyBaseLogger } from "fastify";
import { parseVaultKeys } from "../src/credential-vault.js";
import type { Database } from "../src/db.js";
import { ApiError } from "../src/errors.js";
import {
  LINE_PUSH_URL,
  MonitorAlertSender,
  alertText,
  linePushBody,
  openAlertSecret,
  sealAlertSecret,
  teamsCardBody,
  validateLineTarget,
  validateLineToken,
  validateTeamsWebhook,
  type AlertMessage,
} from "../src/monitor-alerts.js";
import { parseScriptJobInput, SCRIPT_APPROVE_SQL } from "../src/routes/monitor-fleet.js";
import {
  CLAIM_COMMANDS_SQL,
  COMMAND_RESULT_SQL,
  COMMAND_SELECT,
  cutUtf8,
  parseScriptResult,
  parseSiteInput,
  parseSitePosition,
  scriptTargetStatus,
} from "../src/routes/site-monitor.js";
import { EXPIRE_COMMANDS_SQL, parseHeartbeat, parseTmtdesk, tmtdeskUnhealthy } from "../src/site-monitor.js";

const BATCH = "0f8fad5b-d9cb-469f-a165-70867728950e";
const NOW = new Date("2026-11-25T03:00:00Z");

// ── heartbeat "tmtdesk" block (TMT Control Panel Services/WebMonitorClient.cs, TmtDeskStatus.cs) ──

test("the TMTDesk block is read as TMT Control Panel sends it, and an ID is kept only when it is nine digits", () => {
  const report = parseTmtdesk({
    installed: true, running: true, id: "123 456 789", version: "0.5.0", mode: "service", rendezvous: "rdv.example.com:21116",
    helperRunning: true, activeSessions: 2, captureMethod: "dxgi", health: "ok",
    lastFrameUtc: "2026-11-25T02:59:58Z", updatedUtc: "2026-11-25T02:59:59+00:00",
  }, NOW)!;
  assert.deepEqual(report, {
    installed: true, running: true, id: "123456789", version: "0.5.0", mode: "service", rendezvous: "rdv.example.com:21116",
    helperRunning: true, activeSessions: 2, captureMethod: "dxgi", health: "ok",
    lastFrameAt: "2026-11-25T02:59:58.000Z", updatedAt: "2026-11-25T02:59:59.000Z",
  });
  assert.equal(tmtdeskUnhealthy(report), false);

  for (const id of ["12345678", "1234567890", "abc", 123456789, null]) assert.equal(parseTmtdesk({ installed: true, id }, NOW)?.id, null, String(id));
  // An unreadable status file comes as installed + health "unknown"; odd values never fail the heartbeat.
  const invalid = parseTmtdesk({ installed: true, health: "unknown", activeSessions: -3, lastFrameUtc: "2099-01-01T00:00:00Z", version: 7 }, NOW)!;
  assert.equal(invalid.activeSessions, 0);
  assert.equal(invalid.lastFrameAt, null, "a time in the future is dropped");
  assert.equal(invalid.version, "");
  assert.equal(tmtdeskUnhealthy(invalid), true);
  assert.equal(parseTmtdesk({ installed: true, running: true }, NOW)?.health, "unknown");
  assert.equal(parseTmtdesk("yes", NOW), null);
  assert.equal(parseTmtdesk([], NOW), null);
});

test("TMTDesk is unhealthy when installed and not running, or reporting anything but ok", () => {
  const base = parseTmtdesk({ installed: true, running: true, health: "OK" }, NOW)!;
  assert.equal(tmtdeskUnhealthy(base), false, "health is compared without case");
  assert.equal(tmtdeskUnhealthy({ ...base, running: false }), true);
  assert.equal(tmtdeskUnhealthy({ ...base, health: "stalled" }), true);
  assert.equal(tmtdeskUnhealthy({ ...base, installed: false, running: false }), false, "not installed is not a problem");
  assert.equal(tmtdeskUnhealthy(null), false);
});

test("a heartbeat without the block (older Control Panel) still parses, with tmtdesk null", () => {
  assert.equal(parseHeartbeat({ batchId: BATCH }, NOW).tmtdesk, null);
  const parsed = parseHeartbeat({ batchId: BATCH, tmtdesk: { installed: true, running: false, id: "987-654-321" } }, NOW);
  assert.equal(parsed.tmtdesk?.id, "987654321");
  assert.equal(parsed.tmtdesk?.running, false);
});

// ── site position ──

test("a site position is decimal degrees, both or neither", () => {
  assert.deepEqual(parseSitePosition({}), { latitude: null, longitude: null });
  assert.deepEqual(parseSitePosition({ latitude: "13.7563", longitude: 100.5018 }), { latitude: 13.7563, longitude: 100.5018 });
  assert.deepEqual(parseSitePosition({ latitude: 12.12345678, longitude: 101.1 }), { latitude: 12.123457, longitude: 101.1 });
  assert.throws(() => parseSitePosition({ latitude: 13 }), ApiError);
  assert.throws(() => parseSitePosition({ latitude: 91, longitude: 100 }), ApiError);
  assert.throws(() => parseSitePosition({ latitude: 13, longitude: "east" }), ApiError);
  assert.equal(parseSiteInput({ name: "Site A", latitude: 13.7, longitude: 100.5 }).latitude, 13.7);
});

// ── RunScript: delivery, result and job form ──

test("RunScript commands carry the approved script to the agent and its target is marked delivered", () => {
  assert.match(CLAIM_COMMANDS_SQL, /program_id bigint NULL/);
  assert.match(CLAIM_COMMANDS_SQL, /LEFT JOIN dbo\.monitor_programs p ON p\.id = k\.program_id/);
  assert.match(CLAIM_COMMANDS_SQL, /UPDATE t SET status = N'Delivered'[\s\S]*monitor_script_targets/);
  assert.match(CLAIM_COMMANDS_SQL, /j\.job_key, j\.shell, j\.script, j\.timeout_seconds/);
  assert.match(COMMAND_SELECT, /LEFT JOIN dbo\.monitor_programs p/);
  assert.match(COMMAND_RESULT_SQL, /UPDATE dbo\.monitor_script_targets[\s\S]*exit_code = @exit_code, stdout = @stdout/);
  // A script has its own timeout before the agent is considered silent.
  assert.match(EXPIRE_COMMANDS_SQL, /WHEN c\.verb = N'RunScript' THEN ISNULL\(\(/);
  assert.match(EXPIRE_COMMANDS_SQL, /UPDATE t\s+SET status = c\.status/);
  // Approval queues one command per reachable machine and skips the rest with the reason.
  assert.match(SCRIPT_APPROVE_SQL, /N'RunScript', @actor/);
  assert.match(SCRIPT_APPROVE_SQL, /The machine was offline when the job was approved\./);
});

test("a script result keeps exit code, output and duration, cut at 64 KB of UTF-8 without splitting a character", () => {
  const result = parseScriptResult({
    success: true, message: "OK", jobId: "x", exitCode: 0, stdout: "สวัสดี\n", stderr: "", stdoutTruncated: false, stderrTruncated: false, durationMs: 1532.7,
  });
  assert.deepEqual(result, { exitCode: 0, stdout: "สวัสดี\n", stderr: "", stdoutTruncated: false, stderrTruncated: false, durationMs: 1532 });
  const big = parseScriptResult({ stdout: "ก".repeat(30_000), stderrTruncated: true, exitCode: 1.5 });
  assert.equal(Buffer.byteLength(big.stdout, "utf8") <= 64 * 1024, true);
  assert.equal(big.stdout.length, Math.floor((64 * 1024) / 3));
  assert.equal(big.stdoutTruncated, true);
  assert.equal(big.stderrTruncated, true);
  assert.equal(big.exitCode, null, "a fractional exit code is not an exit code");
  assert.deepEqual(cutUtf8("a\u{1F512}b", 4), { text: "a", cut: true });
  // Results of other commands carry none of it.
  assert.deepEqual(parseScriptResult({ success: true, message: "OK", outcome: "Updated" }), {
    exitCode: null, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false, durationMs: null,
  });
});

test("an agent with scripts turned off answers rejected, which is kept apart from a failed script", () => {
  assert.equal(scriptTargetStatus(false, "rejected: scripts disabled"), "Rejected");
  assert.equal(scriptTargetStatus(false, "rejected: invalid script job"), "Rejected");
  assert.equal(scriptTargetStatus(false, "Script failed"), "Failed");
  assert.equal(scriptTargetStatus(false, "timeout: process tree killed"), "Failed");
  assert.equal(scriptTargetStatus(true, "OK"), "Succeeded");
});

test("the script job form enforces the agent's own limits before anyone approves", () => {
  const job = parseScriptJobInput({ title: " Check ", script: "Get-Service", agentIds: [3, 3, 4] });
  assert.deepEqual(job, { title: "Check", shell: "powershell", script: "Get-Service", timeoutSeconds: 300, note: "", agentIds: [3, 4] });
  assert.equal(parseScriptJobInput({ title: "x", shell: "cmd", script: "dir", timeoutSeconds: 3600, agentIds: [1] }).shell, "cmd");
  assert.throws(() => parseScriptJobInput({ title: "x", shell: "bash", script: "ls", agentIds: [1] }), ApiError);
  assert.throws(() => parseScriptJobInput({ title: "x", script: "  ", agentIds: [1] }), ApiError);
  assert.throws(() => parseScriptJobInput({ title: "x", script: "ก".repeat(22_000), agentIds: [1] }), { code: "monitor_script_too_large" });
  assert.throws(() => parseScriptJobInput({ title: "x", script: "a", timeoutSeconds: 0, agentIds: [1] }), ApiError);
  assert.throws(() => parseScriptJobInput({ title: "x", script: "a", timeoutSeconds: 3601, agentIds: [1] }), ApiError);
  assert.throws(() => parseScriptJobInput({ title: "x", script: "a", agentIds: [] }), ApiError);
  assert.throws(() => parseScriptJobInput({ title: "x", script: "a", agentIds: ["1"] }), ApiError);
  assert.throws(() => parseScriptJobInput({ title: "x", script: "a", agentIds: Array.from({ length: 201 }, (_, index) => index + 1) }), ApiError);
});

// ── alert channels ──

const message: AlertMessage = {
  state: "open", kind: "ProgramStopped", title: "Apache stopped", siteName: "โรงงาน A", location: "Rayong", agentName: "Server 1",
  machineName: "WEB-01", programName: "Apache", openedAt: "25 Nov 2026, 10:00:00", resolvedAt: "", priority: 1,
};

test("only Microsoft webhook hosts over https are accepted for Teams, and LINE IDs and tokens are checked", () => {
  assert.equal(validateTeamsWebhook("https://contoso.webhook.office.com/webhookb2/abc@def/IncomingWebhook/x/y"), "https://contoso.webhook.office.com/webhookb2/abc@def/IncomingWebhook/x/y");
  assert.ok(validateTeamsWebhook("https://prod-12.southeastasia.logic.azure.com:443/workflows/1/triggers/manual/paths/invoke?sig=x"));
  for (const bad of ["http://contoso.webhook.office.com/x", "https://evil.example.com/webhook.office.com", "https://webhook.office.com.evil.io/x",
    "https://user:pass@contoso.webhook.office.com/x", "https://10.0.0.1/x", "not a url", ""]) {
    assert.throws(() => validateTeamsWebhook(bad), { code: "monitor_alert_teams_url_invalid" }, bad);
  }
  assert.equal(validateLineTarget(`C${"a".repeat(32)}`), `C${"a".repeat(32)}`);
  assert.throws(() => validateLineTarget(`X${"a".repeat(32)}`), ApiError);
  assert.throws(() => validateLineTarget(`U${"A".repeat(32)}`), ApiError);
  assert.ok(validateLineToken("abcDEF123+/=".repeat(10)));
  assert.throws(() => validateLineToken("short"), ApiError);
  assert.throws(() => validateLineToken(`${"a".repeat(40)} b`), ApiError);
});

test("alert messages name the site, machine and step, in LINE text and a Teams adaptive card", () => {
  const text = alertText(message, "https://iot.example.com/#/site-monitor");
  assert.match(text, /^🔴 โรงงาน A: Apache stopped/);
  assert.match(text, /Machine: Server 1 · WEB-01/);
  assert.match(text, /Responsible person #1/);
  assert.match(text, /https:\/\/iot\.example\.com\/#\/site-monitor$/);
  assert.match(alertText({ ...message, state: "escalated", priority: 2 }, null), /escalated to #2/);
  assert.match(alertText({ ...message, state: "resolved", resolvedAt: "10:20" }, null), /^🟢 Resolved/);
  assert.match(alertText({ ...message, kind: "TMTDeskUnhealthy" }, null), /TMTDesk on Server 1 is unhealthy/);
  assert.deepEqual(linePushBody("Cabc", message, null).messages[0]?.type, "text");
  const card = teamsCardBody(message, "https://iot.example.com/#/site-monitor");
  assert.equal(card.type, "message");
  assert.equal(card.attachments[0]?.contentType, "application/vnd.microsoft.card.adaptive");
  assert.equal(card.attachments[0]?.content.type, "AdaptiveCard");
  assert.ok(JSON.stringify(card).includes("Open Site Monitor"));
});

test("a channel secret is sealed to its site and channel and never readable from another", () => {
  const ring = parseVaultKeys(`1:${randomBytes(32).toString("base64")}`)!;
  const sealed = sealAlertSecret(ring, 5, "Line", "token-value-1234567890");
  assert.equal(openAlertSecret(ring, 5, "Line", sealed), "token-value-1234567890");
  assert.throws(() => openAlertSecret(ring, 6, "Line", sealed), { code: "credential_unreadable" });
  assert.throws(() => openAlertSecret(ring, 5, "Teams", sealed), { code: "credential_unreadable" });
});

const silentLog = { warn: () => undefined, info: () => undefined, error: () => undefined } as unknown as FastifyBaseLogger;

test("LINE is pushed with the token as a bearer header and Teams posted to its URL; a failure never shows the token", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return calls.length === 3 ? new Response('{"message":"The request body has 1 error(s)"}', { status: 400 }) : new Response("{}", { status: 200 });
  }) as typeof fetch;
  const sender = new MonitorAlertSender({} as Database, undefined, fetcher, silentLog, "https://iot.example.com/");
  await sender.send("Line", "secret-token-abcdef", `C${"0".repeat(32)}`, message);
  assert.equal(calls[0]?.url, LINE_PUSH_URL);
  assert.equal((calls[0]!.init.headers as Record<string, string>).Authorization, "Bearer secret-token-abcdef");
  assert.equal(JSON.parse(String(calls[0]?.init.body)).to, `C${"0".repeat(32)}`);
  assert.equal(calls[0]?.init.redirect, "error", "a redirect could carry the token elsewhere");
  await sender.send("Teams", "https://contoso.webhook.office.com/webhookb2/x", "", message);
  assert.equal(calls[1]?.url, "https://contoso.webhook.office.com/webhookb2/x");
  await assert.rejects(sender.send("Line", "secret-token-abcdef", `C${"0".repeat(32)}`, message), (error: unknown) =>
    error instanceof ApiError && /HTTP 400/.test(error.message) && !error.message.includes("secret-token"));
  assert.equal(sender.link(), "https://iot.example.com/#/site-monitor");
  // Without vault keys nothing is read or sent.
  await sender.notifySite(1, message);
  assert.equal(calls.length, 3);
});

test("migration 133 widens incidents and commands without breaking the existing rules", async () => {
  const sql = await readFile(resolve(process.cwd(), "../database/migrations/133_monitor_fleet_command_center.sql"), "utf8");
  assert.match(sql, /THROW 51133, 'Migration 132 must be applied before migration 133\.'/);
  assert.match(sql, /kind IN \(N'ProgramStopped', N'AgentOffline', N'TMTDeskUnhealthy'\)/);
  assert.match(sql, /verb IN \(N'Start', N'Stop', N'Restart', N'Update', N'RunScript'\)/);
  assert.match(sql, /\(verb = N'RunScript' AND program_id IS NULL\) OR \(verb <> N'RunScript' AND program_id IS NOT NULL\)/);
  // Still one command in flight per program; script commands, without a program, do not collide.
  assert.match(sql, /WHERE status IN \(N'Pending', N'Delivered'\) AND program_id IS NOT NULL;/);
  assert.match(sql, /CONSTRAINT CK_monitor_script_jobs_four_eyes CHECK \(decided_by IS NULL OR decided_by <> requested_by\)/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.doesNotMatch(sql, /secret\s+nvarchar/i, "alert secrets are only stored sealed");
  const rollback = await readFile(resolve(process.cwd(), "../database/rollback/133_monitor_fleet_command_center.rollback.sql"), "utf8");
  assert.match(rollback, /DELETE FROM dbo\.schema_versions WHERE version = 133;/);
});
