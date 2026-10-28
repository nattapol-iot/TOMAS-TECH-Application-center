import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig, loadSiteMonitorConfig } from "../src/config.js";
import { AGENT_FAILED_KEYS_PER_MINUTE, agentHostAllows } from "../src/site-monitor.js";

// Site Monitor's public hostname (a Cloudflare Tunnel, open to the internet) must serve the agent
// API and nothing else. None of these requests reaches the database.
const AGENT_HOST = "monitor-agent.example.com";
const baseEnv = {
  NODE_ENV: "development",
  Authentication__Mode: "Development",
  ConnectionStrings__IoTTeamCenter: "Server=localhost;Database=UnusedSiteMonitorHostTest;Integrated Security=true",
  DocumentStorage__RootPath: ".",
  Database__RunMigrations: "false",
  SiteMonitor__AgentPublicUrl: `https://${AGENT_HOST}/`,
};

test("the agent public URL is validated and its host is allowed by the same setting", () => {
  assert.equal(loadSiteMonitorConfig({}), undefined);
  assert.deepEqual(loadSiteMonitorConfig({ SiteMonitor__AgentPublicUrl: "https://Monitor-Agent.Example.com/" }),
    { agentPublicUrl: "https://monitor-agent.example.com", agentPublicHost: "monitor-agent.example.com" });
  for (const bad of ["http://monitor-agent.example.com", "https://monitor-agent.example.com/agent", "https://user:pw@monitor-agent.example.com", "monitor-agent"]) {
    assert.throws(() => loadSiteMonitorConfig({ SiteMonitor__AgentPublicUrl: bad }), /SiteMonitor__AgentPublicUrl/, bad);
  }
  const config = loadConfig({ ...baseEnv, AllowedHosts: "iot-team-center.example.com" });
  assert.deepEqual(config.allowedHosts, ["iot-team-center.example.com", AGENT_HOST]);
  assert.equal(config.siteMonitor?.agentPublicUrl, `https://${AGENT_HOST}`);
});

test("on the agent host only agent route patterns pass", () => {
  assert.equal(agentHostAllows(AGENT_HOST, "/api/v1/monitor/agent/heartbeat", AGENT_HOST), true);
  assert.equal(agentHostAllows("Monitor-Agent.Example.com", "/api/v1/monitor/agents/:agentId/revoke", AGENT_HOST), false);
  assert.equal(agentHostAllows(AGENT_HOST, undefined, AGENT_HOST), false);
  assert.equal(agentHostAllows("iot-team-center.example.com", "/api/v1/monitor/sites", AGENT_HOST), true);
  assert.equal(agentHostAllows(AGENT_HOST, "/api/v1/monitor/sites", undefined), true);
});

test("the agents' public hostname reaches the agent API and nothing else", async () => {
  const { app } = await buildApp(loadConfig(baseEnv));
  await app.ready();
  try {
    const onAgentHost = (url: string, method: "GET" | "POST" = "GET") =>
      app.inject({ method, url, headers: { host: AGENT_HOST, "x-dev-user-id": "intruder" } });

    for (const [url, method] of [
      ["/api/v1/monitor/sites", "GET"], ["/api/v1/bootstrap", "GET"], ["/health/live", "GET"], ["/", "GET"],
      ["/api/v1/monitor/agents/1/revoke", "POST"], ["/api/v1/monitor/agent/../sites", "GET"], ["/api/v1/monitor/agentx/ping", "GET"],
    ] as const) {
      const response = await onAgentHost(url, method);
      assert.equal(response.statusCode, 404, `${method} ${url}: ${response.body}`);
    }

    // The agent route itself is reached: refused for its missing key, not hidden.
    const ping = await onAgentHost("/api/v1/monitor/agent/ping");
    assert.equal(ping.statusCode, 401);
    assert.equal(ping.json().code, "invalid_agent_key");

    // The private address is unaffected.
    assert.equal((await app.inject({ method: "GET", url: "/health/live" })).statusCode, 200);
  } finally {
    await app.close();
  }
});

test("wrong agent keys from one address are cut off with 429", async () => {
  const { app } = await buildApp(loadConfig(baseEnv));
  await app.ready();
  try {
    const guess = () => app.inject({ method: "GET", url: "/api/v1/monitor/agent/ping", headers: { host: AGENT_HOST, "x-agent-key": "tmtmon_wrong" } });
    for (let attempt = 1; attempt <= AGENT_FAILED_KEYS_PER_MINUTE; attempt += 1) {
      assert.equal((await guess()).statusCode, 401, `attempt ${attempt}`);
    }
    const limited = await guess();
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().code, "rate_limited");
  } finally {
    await app.close();
  }
});

test("a heartbeat bigger than the agent body limit is refused before it is parsed", async () => {
  const { app } = await buildApp(loadConfig(baseEnv));
  await app.ready();
  try {
    const response = await app.inject({
      method: "POST", url: "/api/v1/monitor/agent/heartbeat",
      headers: { host: AGENT_HOST, "content-type": "application/json", "x-agent-key": "tmtmon_wrong" },
      payload: JSON.stringify({ padding: "x".repeat(5 * 1024 * 1024) }),
    });
    assert.equal(response.statusCode, 413);
  } finally {
    await app.close();
  }
});
