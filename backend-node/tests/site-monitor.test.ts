import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "../src/config.js";
import { EmailService } from "../src/email.js";
import { ApiError } from "../src/errors.js";
import { parseSiteInput } from "../src/routes/site-monitor.js";
import {
  AGENT_KEY_PATTERN,
  agentKeyHint,
  generateAgentKey,
  hashAgentKey,
  nextNotificationLevel,
  normalizeLogLevel,
  parseHeartbeat,
  waitForAgentWake,
  wakeAgent,
} from "../src/site-monitor.js";

const BATCH = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("agent keys are random, match the accepted format and are stored only as a hash", () => {
  const first = generateAgentKey();
  const second = generateAgentKey();
  assert.notEqual(first, second);
  assert.match(first, AGENT_KEY_PATTERN);
  assert.equal(hashAgentKey(first).length, 64);
  assert.equal(hashAgentKey(first), hashAgentKey(first));
  assert.notEqual(hashAgentKey(first), hashAgentKey(second));
  assert.equal(agentKeyHint(first), first.slice(-4));
  assert.doesNotMatch("tmtmon_short", AGENT_KEY_PATTERN);
});

test("heartbeat parsing clamps values, drops duplicates and keeps stopped programs empty", () => {
  const now = new Date("2026-10-08T03:00:00Z");
  const parsed = parseHeartbeat({
    batchId: BATCH.toUpperCase(),
    machineName: "  WEB-01  ",
    agentVersion: "2.1.0",
    allowsControl: true,
    host: { cpuPercent: 140, memoryUsedBytes: 1024.7, memoryTotalBytes: -5, diskFreeBytes: "x" },
    programs: [
      { key: "apache", name: "Apache", group: "Site A", isRunning: true, cpuPercent: 12.345, memoryBytes: 1048576, uptimeSeconds: 60, processCount: 2 },
      { key: "apache", name: "Duplicate", isRunning: false },
      { key: "mysql", name: "", isRunning: false, cpuPercent: 50, memoryBytes: 10 },
    ],
    events: [
      { programKey: "mysql", kind: "Stopped", userInitiated: false, at: "2026-10-08T02:59:58Z" },
      { programKey: "mysql", kind: "Exploded" },
    ],
    logs: [
      { level: "Warning", message: "  disk low  ", at: "2026-10-08T02:59:00Z" },
      { level: "ERROR", message: "crash", at: "1999-01-01T00:00:00Z" },
      { level: "Info", message: "   " },
    ],
  }, now);

  assert.equal(parsed.batchId, BATCH);
  assert.equal(parsed.machineName, "WEB-01");
  assert.equal(parsed.host.cpuPercent, 100);
  assert.equal(parsed.host.memoryUsedBytes, 1024);
  assert.equal(parsed.host.memoryTotalBytes, 0);
  assert.equal(parsed.host.diskFreeBytes, null);
  assert.deepEqual(parsed.programs.map((program) => program.key), ["apache", "mysql"]);
  assert.equal(parsed.programs[0]?.cpuPercent, 12.3);
  assert.equal(parsed.programs[0]?.name, "Apache");
  assert.equal(parsed.programs[1]?.name, "mysql", "an empty name falls back to the key");
  assert.equal(parsed.programs[1]?.cpuPercent, null, "a stopped program reports no usage");
  assert.equal(parsed.programs[1]?.memoryBytes, null);
  assert.deepEqual(parsed.events.map((event) => event.kind), ["Stopped"]);
  assert.deepEqual(parsed.logs.map((log) => [log.level, log.message]), [["Warning", "disk low"], ["Error", "crash"]]);
  assert.equal(parsed.logs[1]?.at, now.toISOString(), "an implausible timestamp becomes the receive time");
});

test("heartbeat parsing rejects a malformed structure", () => {
  assert.throws(() => parseHeartbeat({}), ApiError);
  assert.throws(() => parseHeartbeat({ batchId: BATCH, programs: "nope" }), ApiError);
  assert.throws(() => parseHeartbeat({ batchId: BATCH, programs: [{ key: "has space" }] }), ApiError);
  assert.throws(() => parseHeartbeat({ batchId: BATCH, logs: new Array(501).fill({ message: "x" }) }), ApiError);
});

test("log levels from the Control Panel map onto Info, Warning and Error", () => {
  assert.equal(normalizeLogLevel("WARNING"), "Warning");
  assert.equal(normalizeLogLevel("error"), "Error");
  assert.equal(normalizeLogLevel("Fatal"), "Error");
  assert.equal(normalizeLogLevel("INFO"), "Info");
  assert.equal(normalizeLogLevel(undefined), "Info");
});

test("escalation notifies person 1 at once, then 2 and 3 every interval, or everyone when the interval is 0", () => {
  const opened = new Date("2026-10-08T00:00:00Z");
  const at = (minutes: number) => new Date(opened.getTime() + minutes * 60_000);
  assert.equal(nextNotificationLevel(0, opened, 15, at(0)), 1);
  assert.equal(nextNotificationLevel(1, opened, 15, at(14)), null);
  assert.equal(nextNotificationLevel(1, opened, 15, at(15)), 2);
  assert.equal(nextNotificationLevel(2, opened, 15, at(29)), null);
  assert.equal(nextNotificationLevel(2, opened, 15, at(30)), 3);
  assert.equal(nextNotificationLevel(3, opened, 15, at(999)), null);
  assert.equal(nextNotificationLevel(0, opened, 0, at(0)), 3);
});

test("a waiting command long-poll wakes on a new command and times out otherwise", async () => {
  const started = Date.now();
  const waiting = waitForAgentWake(41, 5_000);
  wakeAgent(41);
  await waiting;
  assert.ok(Date.now() - started < 1_000);

  const timeoutStart = Date.now();
  await waitForAgentWake(42, 30);
  assert.ok(Date.now() - timeoutStart >= 25);

  const aborted = new AbortController();
  const pending = waitForAgentWake(43, 5_000, aborted.signal);
  aborted.abort();
  await pending;
});

test("site form needs a name and at most three distinct responsible people", () => {
  const site = parseSiteInput({
    name: "  Site A  ", escalationMinutes: 10, offlineMinutes: 5,
    contacts: [{ priority: 2, userId: 8 }, { priority: 1, userId: 7 }],
  });
  assert.equal(site.name, "Site A");
  assert.deepEqual(site.contacts, [{ priority: 1, userId: 7 }, { priority: 2, userId: 8 }]);
  assert.equal(site.isActive, true);

  assert.throws(() => parseSiteInput({ name: "" }), ApiError);
  assert.throws(() => parseSiteInput({ name: "A", escalationMinutes: 2000 }), ApiError);
  assert.throws(() => parseSiteInput({ name: "A", contacts: [{ priority: 1, userId: 7 }, { priority: 1, userId: 8 }] }), ApiError);
  assert.throws(() => parseSiteInput({ name: "A", contacts: [{ priority: 1, userId: 7 }, { priority: 2, userId: 7 }] }), ApiError);
  assert.throws(() => parseSiteInput({ name: "A", contacts: [{ priority: 4, userId: 7 }] }), ApiError);
});

test("incident email names the site, program and recent errors, escaped", async () => {
  const graphConfig: AppConfig["email"] = {
    mode: "MicrosoftGraph",
    tenantId: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222",
    clientSecret: "test-secret",
    senderUser: "iot-team-center@example.com",
    applicationBaseUrl: "https://iot.example.com",
  };
  const sent: Array<{ subject: string; content: string; to: string[] }> = [];
  const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input).includes("/oauth2/v2.0/token")) return Response.json({ access_token: "token", expires_in: 3600 });
    const payload = JSON.parse(String(init?.body)) as { message: { subject: string; body: { content: string }; toRecipients: { emailAddress: { address: string } }[] } };
    sent.push({ subject: payload.message.subject, content: payload.message.body.content, to: payload.message.toRecipients.map((r) => r.emailAddress.address) });
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const result = await new EmailService(graphConfig, fetcher).sendSiteMonitorIncident({
    state: "open", kind: "ProgramStopped", siteName: "Site A", location: "Rayong", agentName: "Server 1",
    machineName: "WEB-01", programName: "Apache <httpd>", openedAt: "8 Oct 2026, 10:00:00", resolvedAt: "",
    priority: 1, recentLogs: [{ at: "10:00", level: "Error", message: "Port 80 in use & busy" }],
    recipients: [{ name: "Somchai", email: "somchai@example.com" }],
  });
  assert.equal(result.status, "sent");
  assert.equal(sent[0]?.subject, "[Site Monitor] Site A: Apache <httpd> stopped");
  assert.match(sent[0]!.content, /Apache &lt;httpd&gt;/);
  assert.match(sent[0]!.content, /Port 80 in use &amp; busy/);
  assert.match(sent[0]!.content, /#\/site-monitor/);
  assert.deepEqual(sent[0]?.to, ["somchai@example.com"]);
});
