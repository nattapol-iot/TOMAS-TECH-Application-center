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
  if (desk.health?.trim().toLowerCase() !== "ok") return "unhealthy";
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
  return total !== null && total > 0 && Number.isFinite(total) && used !== null && Number.isFinite(used) && used >= 0 ? percent((used / total) * 100) : null;
}

export function diskPercent(agent: HostAgent): number | null {
  const { diskFreeBytes: free, diskTotalBytes: total } = agent.host;
  return total !== null && total > 0 && Number.isFinite(total) && free !== null && Number.isFinite(free) && free >= 0 ? percent(((total - free) / total) * 100) : null;
}

export function percent(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : null;
}

export function hasPosition(site: FleetSite): site is FleetSite & { latitude: number; longitude: number } {
  return (
    typeof site.latitude === "number" &&
    Number.isFinite(site.latitude) &&
    Math.abs(site.latitude) < 90 &&
    typeof site.longitude === "number" &&
    Number.isFinite(site.longitude) &&
    Math.abs(site.longitude) <= 180
  );
}

export function relativeAge(iso: string | null, now: number, locale: string): string {
  const time = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(time)) return "—";
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  const [size, unit] = seconds < 60 ? ([1, "second"] as const) : seconds < 3600 ? ([60, "minute"] as const) : seconds < 86400 ? ([3600, "hour"] as const) : ([86400, "day"] as const);
  return new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "short" }).format(-Math.floor(seconds / size), unit);
}

export type FleetSort = "site" | "name" | "problems" | "cpu" | "mem" | "disk" | "seen";
export function sortFleet(agents: FleetAgent[], sort: FleetSort, locale: string, now = Date.now()): FleetAgent[] {
  const score = (agent: FleetAgent) =>
    sort === "problems"
      ? agentProblems(agent, now).length
      : sort === "seen"
        ? Date.parse(agent.lastSeenAt ?? "") || 0
        : sort === "cpu" || sort === "mem" || sort === "disk"
          ? (loadOf(agent, sort) ?? -1)
          : 0;
  return [...agents].sort((a, b) => (sort === "site" ? a.site.name.localeCompare(b.site.name, locale) : score(b) - score(a)) || a.name.localeCompare(b.name, locale) || a.id - b.id);
}

/** Completion-based polling: manual refresh shares the same lock and failures back off to 60s. */
export function createMonitorPoll(
  task: () => Promise<void>,
  interval: number,
  environment = {
    visible: () => document.visibilityState === "visible",
    schedule: (run: () => void, delay: number) => window.setTimeout(run, delay),
    cancel: (timer: number) => window.clearTimeout(timer),
    subscribe: (run: () => void) => {
      document.addEventListener("visibilitychange", run);
      return () => document.removeEventListener("visibilitychange", run);
    },
  },
) {
  let stopped = false;
  let busy = false;
  let failures = 0;
  let timer: number | undefined;
  const clear = () => {
    if (timer !== undefined) environment.cancel(timer);
    timer = undefined;
  };
  const refresh = async () => {
    if (stopped || busy || !environment.visible()) return;
    clear();
    busy = true;
    try {
      await task();
      failures = 0;
    } catch {
      failures += 1;
    } finally {
      busy = false;
      if (!stopped && environment.visible())
        timer = environment.schedule(
          () => {
            void refresh();
          },
          Math.min(60_000, interval * 2 ** Math.min(failures, 3)),
        );
    }
  };
  const unsubscribe = environment.subscribe(() => {
    clear();
    if (environment.visible()) void refresh();
  });
  void refresh();
  return {
    refresh,
    stop: () => {
      stopped = true;
      clear();
      unsubscribe();
    },
  };
}

/** Counts use the full fleet summaries; the incident feed is deliberately capped by the API. */
export function fleetKpis(sites: FleetSite[], agents: FleetAgent[], now = Date.now()): (number | null)[] {
  const watched = sites.filter((site) => site.isActive && site.agentCount > 0);
  const desks = agents.filter((agent) => agent.tmtdesk);
  return [
    watched.filter((site) => site.agentsOnline > 0).length,
    agents.filter((agent) => agent.isOnline).length,
    sites.reduce((sum, site) => sum + (Number.isFinite(site.openIncidents) ? site.openIncidents : 0), 0),
    desks.length ? Math.round((desks.filter((agent) => deskState(agent, now) === "healthy").length / desks.length) * 100) : null,
    agents.reduce((sum, agent) => sum + (agent.isOnline && Number.isFinite(agent.tmtdesk?.activeSessions) ? agent.tmtdesk!.activeSessions : 0), 0),
  ];
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
  if (site.openIncidents > 0 || open.length > 0 || site.programsRunning < site.programCount || mine.some((agent) => agentProblems(agent, now).length > 0)) return "warning";
  return "ok";
}

export type IncidentSeverity = "critical" | "high" | "warning";

export function incidentSeverity(kind: CommandCenterIncident["kind"]): IncidentSeverity {
  return kind === "AgentOffline" ? "critical" : kind === "ProgramStopped" ? "high" : "warning";
}

export type LoadMetric = "cpu" | "mem" | "disk";

export function loadOf(agent: FleetAgent, metric: LoadMetric): number | null {
  if (!agent.isOnline) return null;
  return metric === "cpu" ? percent(agent.host.cpuPercent) : metric === "mem" ? memoryPercent(agent) : diskPercent(agent);
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
