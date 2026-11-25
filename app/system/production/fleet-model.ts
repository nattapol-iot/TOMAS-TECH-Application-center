/*
 * Fleet and Command Center rules, kept free of React so tests/fleet-model.test.mjs can check them: what a machine's
 * TMTDesk chip says, which machines count as a problem, a site's colour on the map and the top machines by load.
 */
import type { CommandCenterIncident, FleetAgent, FleetSite, MonitorAgent } from "../api-client";

export type DeskState = "healthy" | "unhealthy" | "stopped" | "stale" | "offline" | "none";
export type DeskTone = "green" | "amber" | "red" | "slate";

/** A TMTDesk report older than this, on a machine that is still reporting, is stale. */
export const DESK_STALE_MS = 3 * 60_000;
/** Resource use at or above this is a problem on the Fleet screen and in the Command Center. */
export const LOAD_LIMIT = 90;

type DeskAgent = Pick<MonitorAgent, "isOnline" | "tmtdesk">;

export function deskState(agent: DeskAgent, now = Date.now()): DeskState {
  const desk = agent.tmtdesk;
  if (!desk) return "none";
  if (!agent.isOnline) return "offline";
  const reported = desk.reportedAt ? Date.parse(desk.reportedAt) : Number.NaN;
  if (!Number.isFinite(reported) || now - reported > DESK_STALE_MS) return "stale";
  if (!desk.running) return "stopped";
  if (desk.health.trim().toLowerCase() !== "ok") return "unhealthy";
  return "healthy";
}

export const DESK_TONE: Record<DeskState, DeskTone> = {
  healthy: "green",
  unhealthy: "amber",
  stopped: "red",
  stale: "amber",
  offline: "slate",
  none: "slate",
};

type HostAgent = Pick<MonitorAgent, "host">;

export function memoryPercent(agent: HostAgent): number | null {
  const { memoryUsedBytes: used, memoryTotalBytes: total } = agent.host;
  return total && used !== null ? Math.min(100, Math.round((used / total) * 100)) : null;
}

export function diskPercent(agent: HostAgent): number | null {
  const { diskFreeBytes: free, diskTotalBytes: total } = agent.host;
  return total && free !== null ? Math.min(100, Math.max(0, Math.round(((total - free) / total) * 100))) : null;
}

export type Problem = "offline" | "incident" | "program" | "desk" | "cpu" | "memory" | "disk";

/** Why a machine needs attention; empty when it does not. */
export function agentProblems(agent: FleetAgent, now = Date.now()): Problem[] {
  const problems: Problem[] = [];
  if (!agent.site.isActive) return problems;
  if (!agent.isOnline) problems.push("offline");
  if (agent.openIncidents > 0) problems.push("incident");
  if (agent.isOnline && agent.programsRunning < agent.programCount) problems.push("program");
  const desk = deskState(agent, now);
  if (desk === "unhealthy" || desk === "stopped" || desk === "stale") problems.push("desk");
  if (agent.isOnline) {
    if ((agent.host.cpuPercent ?? 0) >= LOAD_LIMIT) problems.push("cpu");
    if ((memoryPercent(agent) ?? 0) >= LOAD_LIMIT) problems.push("memory");
    if ((diskPercent(agent) ?? 0) >= LOAD_LIMIT) problems.push("disk");
  }
  return problems;
}

/** Free-text search over what people call a machine: its name, Windows name, site, TMTDesk ID and versions. */
export function matchesFleetSearch(agent: FleetAgent, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [agent.name, agent.machineName ?? "", agent.site.name, agent.tmtdeskId ?? "", agent.agentVersion ?? "", agent.tmtdesk?.version ?? ""]
    .join(" ")
    .toLocaleLowerCase()
    .includes(needle.replace(/\s+/g, " "));
}

export type SiteSeverity = "critical" | "warning" | "ok" | "idle";

/**
 * A site's colour in the Command Center: red when a machine is offline or a program stopped, amber for TMTDesk
 * trouble, high load or a partial outage, green when all is well, grey when inactive or without machines.
 */
export function siteSeverity(site: FleetSite, agents: FleetAgent[], incidents: CommandCenterIncident[], now = Date.now()): SiteSeverity {
  if (!site.isActive || site.agentCount === 0) return "idle";
  const open = incidents.filter((incident) => incident.siteId === site.id && !incident.resolvedAt);
  if (site.agentsOnline === 0 || open.some((incident) => incident.kind !== "TMTDeskUnhealthy")) return "critical";
  const mine = agents.filter((agent) => agent.site.id === site.id);
  if (open.length > 0 || site.programsRunning < site.programCount || mine.some((agent) => agentProblems(agent, now).length > 0)) return "warning";
  return "ok";
}

export type IncidentSeverity = "critical" | "high" | "warning";

export function incidentSeverity(kind: CommandCenterIncident["kind"]): IncidentSeverity {
  return kind === "AgentOffline" ? "critical" : kind === "ProgramStopped" ? "high" : "warning";
}

export type LoadMetric = "cpu" | "mem" | "disk";

export function loadOf(agent: FleetAgent, metric: LoadMetric): number | null {
  if (!agent.isOnline) return null;
  return metric === "cpu" ? agent.host.cpuPercent : metric === "mem" ? memoryPercent(agent) : diskPercent(agent);
}

/** The busiest reporting machines for one metric, highest first. */
export function topByLoad(agents: FleetAgent[], metric: LoadMetric, count: number): FleetAgent[] {
  return agents
    .filter((agent) => loadOf(agent, metric) !== null)
    .sort((a, b) => (loadOf(b, metric) ?? 0) - (loadOf(a, metric) ?? 0) || a.name.localeCompare(b.name))
    .slice(0, count);
}

/** "123456789" -> "123 456 789", the way TMTDesk shows an ID. */
export function tmtdeskIdText(id: string): string {
  return id.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
}

/** TMTDesk opens tmtdesk:// links and asks before connecting, so the link itself grants nothing. */
export function tmtdeskLink(agent: Pick<MonitorAgent, "tmtdeskId" | "machineName" | "name">): string {
  return `tmtdesk://connect/${agent.tmtdeskId}?name=${encodeURIComponent(agent.machineName ?? agent.name)}`;
}

/** "1m 05s", "12.4s", "850ms" for a script's duration. */
export function durationText(milliseconds: number | null): string {
  if (milliseconds === null) return "—";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** UTF-8 size of a script, which is what the 64 KB limit counts. */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export const SCRIPT_LIMIT_BYTES = 64 * 1024;
