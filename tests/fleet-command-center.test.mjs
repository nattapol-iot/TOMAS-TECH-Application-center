import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DICTIONARY } from "../app/system/i18n.ts";
import { FLEET_COPY } from "../app/system/production/fleet-copy.ts";
import {
  agentProblems, deskState, diskPercent, durationText, matchesFleetSearch, memoryPercent, siteSeverity, tmtdeskLink, topByLoad, utf8Bytes,
} from "../app/system/production/fleet-model.ts";
import { THAILAND, THAILAND_BOUNDS, boundsFor, outlinePath, projection } from "../app/system/production/thailand-map.ts";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const NOW = Date.parse("2026-11-25T03:00:00Z");
const minutesAgo = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

const desk = (overrides = {}) => ({
  running: true, version: "0.5.0", mode: "service", rendezvous: "", helperRunning: true, activeSessions: 0, captureMethod: "dxgi",
  health: "ok", lastFrameAt: null, updatedAt: minutesAgo(0), reportedAt: minutesAgo(0), unhealthySince: null, ...overrides,
});
const agent = (overrides = {}) => ({
  id: 1, name: "Server 1", machineName: "WEB-01", agentVersion: "2.3.0", allowsControl: true, isOnline: true, lastSeenAt: minutesAgo(0),
  statusChangedAt: null, createdAt: null, tmtdeskId: "123456789", tmtdeskIdManual: false, tmtdesk: desk(),
  host: { cpuPercent: 20, memoryUsedBytes: 4, memoryTotalBytes: 16, diskFreeBytes: 50, diskTotalBytes: 100, uptimeSeconds: 10 },
  site: { id: 7, name: "โรงงาน A", isActive: true }, openIncidents: 0, programCount: 2, programsRunning: 2, ...overrides,
});
const site = (overrides = {}) => ({
  id: 7, name: "โรงงาน A", location: "", description: "", escalationMinutes: 15, offlineMinutes: 3, isActive: true, rowVersion: "",
  agentCount: 1, agentsOnline: 1, programCount: 2, programsRunning: 2, openIncidents: 0, lastSeenAt: null, latitude: 13.7, longitude: 100.5,
  ...overrides,
});

test("the TMTDesk chip tells healthy, unhealthy, stopped, stale, offline and not reported apart", () => {
  assert.equal(deskState(agent(), NOW), "healthy");
  assert.equal(deskState(agent({ tmtdesk: desk({ health: "stalled" }) }), NOW), "unhealthy");
  assert.equal(deskState(agent({ tmtdesk: desk({ running: false }) }), NOW), "stopped");
  assert.equal(deskState(agent({ tmtdesk: desk({ reportedAt: minutesAgo(10) }) }), NOW), "stale");
  assert.equal(deskState(agent({ isOnline: false }), NOW), "offline");
  assert.equal(deskState(agent({ tmtdesk: null }), NOW), "none");
});

test("a machine is a problem when offline, with an incident, a stopped program, TMTDesk trouble or load at 90 %", () => {
  assert.deepEqual(agentProblems(agent(), NOW), []);
  assert.deepEqual(agentProblems(agent({ isOnline: false }), NOW), ["offline"]);
  assert.deepEqual(agentProblems(agent({ openIncidents: 1, programsRunning: 1 }), NOW), ["incident", "program"]);
  assert.deepEqual(agentProblems(agent({ tmtdesk: desk({ running: false }) }), NOW), ["desk"]);
  assert.deepEqual(agentProblems(agent({ host: { cpuPercent: 95, memoryUsedBytes: 15, memoryTotalBytes: 16, diskFreeBytes: 5, diskTotalBytes: 100, uptimeSeconds: 1 } }), NOW), ["cpu", "memory", "disk"]);
  assert.deepEqual(agentProblems(agent({ isOnline: false, site: { id: 7, name: "x", isActive: false } }), NOW), [], "an inactive site is not watched");
  assert.equal(memoryPercent(agent()), 25);
  assert.equal(diskPercent(agent()), 50);
  assert.equal(diskPercent(agent({ host: { ...agent().host, diskTotalBytes: null } })), null);
});

test("search covers the names people use, and the busiest machines come first", () => {
  assert.ok(matchesFleetSearch(agent(), "web-01"));
  assert.ok(matchesFleetSearch(agent(), "โรงงาน"));
  assert.ok(matchesFleetSearch(agent(), "123456789"));
  assert.ok(!matchesFleetSearch(agent(), "nothing"));
  const fleet = [agent({ id: 1, name: "A" }), agent({ id: 2, name: "B", host: { ...agent().host, cpuPercent: 80 } }), agent({ id: 3, name: "C", isOnline: false })];
  assert.deepEqual(topByLoad(fleet, "cpu", 5).map((item) => item.id), [2, 1]);
});

test("a site is red for an outage or a stopped program, amber for TMTDesk or partial trouble, grey when not watched", () => {
  const incident = (kind, siteId = 7) => ({ id: 1, kind, title: "", siteId, siteName: "", agentId: 1, agentName: "", programName: null, openedAt: minutesAgo(1), resolvedAt: null, acknowledgedAt: null, notifiedLevel: 0 });
  assert.equal(siteSeverity(site(), [agent()], [], NOW), "ok");
  assert.equal(siteSeverity(site({ agentsOnline: 0 }), [agent()], [], NOW), "critical");
  assert.equal(siteSeverity(site(), [agent()], [incident("ProgramStopped")], NOW), "critical");
  assert.equal(siteSeverity(site(), [agent()], [incident("TMTDeskUnhealthy")], NOW), "warning");
  assert.equal(siteSeverity(site(), [agent()], [incident("AgentOffline", 8)], NOW), "ok", "another site's incident");
  assert.equal(siteSeverity(site({ programsRunning: 1 }), [agent()], [], NOW), "warning");
  assert.equal(siteSeverity(site({ isActive: false }), [agent()], [], NOW), "idle");
  assert.equal(siteSeverity(site({ agentCount: 0 }), [], [], NOW), "idle");
});

test("the map projects Thailand into the view and widens for a site outside it", () => {
  const map = projection(THAILAND_BOUNDS);
  assert.equal(map.height, 1000);
  assert.ok(map.width > 500 && map.width < 700, `width ${map.width}`);
  for (const point of THAILAND) {
    const [x, y] = map.project(point);
    assert.ok(x > 0 && x < map.width && y > 0 && y < map.height, `${point} outside the view`);
  }
  const [bkkX, bkkY] = map.project([100.5018, 13.7563]);
  const [maeSaiX, maeSaiY] = map.project([99.88, 20.43]);
  assert.ok(maeSaiY < bkkY && Math.abs(maeSaiX - bkkX) < 60, "Mae Sai is north of Bangkok");
  assert.match(outlinePath(THAILAND, map.project), /^M[\d.]+ [\d.]+ L.* Z$/);
  assert.deepEqual(boundsFor([[100.5, 13.7]]), THAILAND_BOUNDS);
  assert.ok(boundsFor([[106.7, 10.8]]).east > THAILAND_BOUNDS.east, "Ho Chi Minh City widens the view east");
});

test("Remote links, durations and the script size are what TMTDesk and the agent expect", () => {
  assert.equal(tmtdeskLink({ tmtdeskId: "123456789", machineName: "WEB 01", name: "x" }), "tmtdesk://connect/123456789?name=WEB%2001");
  assert.equal(durationText(850), "850ms");
  assert.equal(durationText(12_400), "12.4s");
  assert.equal(durationText(65_000), "1m 05s");
  assert.equal(durationText(null), "—");
  assert.equal(utf8Bytes("ก"), 3);
});

test("every Fleet, Script, Ops and Alerts key the screens ask for has Thai, English and Japanese", async () => {
  const files = ["FleetScreen.tsx", "FleetParts.tsx", "MonitorScripts.tsx", "MonitorAlerts.tsx", "CommandCenterScreen.tsx", "SiteMonitorScreen.tsx", "thailand-map.ts"];
  const texts = await Promise.all(files.map((file) => source(`app/system/production/${file}`)));
  const asked = new Set(texts.flatMap((text) => [...text.matchAll(/"((?:Fleet|Script|Ops|Alerts)\.[A-Za-z.]+)"/g)].map((match) => match[1])));
  // Template keys: `Fleet.desk.${state}`, `Script.status.${…}`, `Ops.severity.${…}` and the like.
  for (const state of ["healthy", "unhealthy", "stopped", "stale", "offline", "none"]) asked.add(`Fleet.desk.${state}`);
  for (const status of ["PendingApproval", "Running", "Completed", "Rejected", "Cancelled"]) asked.add(`Script.status.${status}`);
  for (const status of ["Waiting", "Pending", "Delivered", "Succeeded", "Failed", "Rejected", "Skipped", "Expired", "Cancelled"]) asked.add(`Script.target.${status}`);
  for (const severity of ["critical", "warning", "ok", "idle"]) asked.add(`Ops.severity.${severity}`);
  for (const severity of ["critical", "high", "warning", "resolved"]) asked.add(`Ops.sev.${severity}`);
  for (const kind of ["ProgramStopped", "AgentOffline", "TMTDeskUnhealthy"]) asked.add(`Monitor.incident.${kind}`);
  for (const verb of ["Start", "Stop", "Restart", "Update", "RunScript"]) asked.add(`Monitor.verb.${verb}`);
  const missing = [...asked].filter((key) => !["th", "en", "jp"].every((lang) => DICTIONARY[key]?.[lang]?.trim()));
  assert.deepEqual(missing, []);
  assert.ok(asked.size > 120, `only ${asked.size} keys found; the extraction is broken`);
  for (const [key, copy] of Object.entries(FLEET_COPY)) for (const lang of ["th", "en", "jp"]) assert.ok(copy[lang]?.trim(), `${key} ${lang}`);
});

test("Fleet and Command Center are lazy menu screens beside Site Monitor, and the dark look stays scoped", async () => {
  const [lazy, shell, css, fleetCss, center] = await Promise.all([
    source("app/system/production/LazyScreens.tsx"), source("app/system/ProductionApp.tsx"), source("app/system/production/command-center.css"),
    source("app/system/production/fleet.css"), source("app/system/production/CommandCenterScreen.tsx"),
  ]);
  assert.match(lazy, /export const FleetScreen = dynamic\(\(\) => import\("\.\/FleetScreen"\)\.then\(\(m\) => m\.FleetScreen\), screen\);/);
  assert.match(lazy, /export const CommandCenterScreen = dynamic\(\(\) => import\("\.\/CommandCenterScreen"\)\.then\(\(m\) => m\.CommandCenterScreen\), screen\);/);
  assert.match(shell, /\{view === "fleet" \? <FleetScreen bootstrap=\{bootstrap\} notify=\{setToast\} \/> : null\}/);
  assert.match(shell, /\{view === "command-center" \? <CommandCenterScreen notify=\{setToast\} \/> : null\}/);
  assert.match(center, /import "\.\/command-center\.css";/);
  // Every rule of the wall screen lives under .ops-center (or a keyframe / media block), and no colour is invented.
  const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(^|})\s*([^{}@]+)\{/g)].map((match) => match[2].trim())
    .filter((selector) => !/^(from|to|\d+%)/.test(selector));
  for (const selector of selectors) for (const part of selector.split(",")) assert.match(part.trim(), /^\.ops-/, part.trim());
  assert.equal((css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length, 0);
  assert.equal((fleetCss.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length, 0);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
