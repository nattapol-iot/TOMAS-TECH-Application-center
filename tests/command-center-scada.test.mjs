import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Command Center opens from its link: the hash guard allows it under monitor.read", () => {
  const shell = read("app/system/ProductionApp.tsx");
  const allowed = shell.slice(shell.indexOf("function allowedViews"), shell.indexOf("return allowed;", shell.indexOf("function allowedViews")));
  assert.match(allowed, /if \(data\.permissions\.includes\("monitor\.read"\)\) allowed\.push\("command-center", "fleet", "site-monitor"\);/);
  // Site Monitor still links to it, and the API asks for the same permission.
  assert.match(read("app/system/production/MonitorScreen.tsx"), /href="#\/command-center"/);
  assert.match(read("backend-node/src/routes/monitor-fleet.ts"), /GET {2}\/api\/v1\/monitor\/command-center {24}monitor\.read/);
});

test("the centre of Command Center is a SCADA-style site overview, not a map (owner 2026-11-25)", () => {
  const screen = read("app/system/production/CommandCenterScreen.tsx");
  const css = read("app/system/production/command-center.css");
  assert.doesNotMatch(screen, /thailand-map|OpsMap|ops-graticule|ops-land/);
  assert.match(screen, /<PlantHeader sites=\{sites\} severityOf=\{severityOf\} incidents=\{openIncidents\} filter=\{plantFilter\} onFilter=\{setPlantFilter\} \/>/);
  assert.match(screen, /<SiteOverview sites=\{sites\} agents=\{agents\}/);
  // Worst first, then by name.
  assert.match(screen, /SEVERITY_ORDER\[severityOf\.get\(a\.id\) \?\? "idle"\] - SEVERITY_ORDER\[severityOf\.get\(b\.id\) \?\? "idle"\]/);
  for (const key of ["Ops.plant", "Ops.plantLabel", "Ops.tile.cpu", "Ops.tile.alarms"]) assert.match(screen, new RegExp(`"${key.replaceAll(".", "\\.")}"`), key);
  // Flat, neutral and glow-free: no grid or radial background, no scanline, no glow shadows.
  assert.match(css, /--ops-bg: var\(--n-900\);/);
  assert.match(css, /--ops-glow: none;/);
  assert.doesNotMatch(css, /\.ops-center::after|radial-gradient|repeating-linear-gradient|drop-shadow|0 0 8px currentColor/);
  assert.match(css, /\.ops-center \.ops-tile\.critical \.ops-tile-head \{\s*background: var\(--ops-bad\);/);
});

test("Command Center UX: chips filter the faceplates, empty counts read as a dash, no navy or tiny text left", () => {
  const screen = read("app/system/production/CommandCenterScreen.tsx");
  const css = read("app/system/production/command-center.css");
  // A chip is a toggle button for what it counts; pressing it again clears the filter.
  assert.match(screen, /aria-pressed=\{filter === key\}/);
  assert.match(screen, /onClick=\{\(\) => onFilter\(filter === key \? null : key\)\}/);
  assert.match(screen, /filter === "alarms" \? \(alarmsOf\.get\(site\.id\) \?\? 0\) > 0 : \(severityOf\.get\(site\.id\) \?\? "idle"\) === filter/);
  assert.match(screen, /"Ops\.filterEmpty"/);
  // A site without PCs or programs shows a dash, not 0\/0 over an empty bar.
  assert.match(screen, /site\.programCount \? `\$\{site\.programsRunning\}\/\$\{site\.programCount\}` : "—"/);
  // One accent through the token, dark native controls, no navy blocks, nothing under 0.8em.
  assert.match(css, /--ops-accent: var\(--blue\);/);
  assert.match(css, /color-scheme: dark;/);
  assert.doesNotMatch(css, /--navy-|var\(--c2\)|font-size: 0\.[67]\d*em/);
});
