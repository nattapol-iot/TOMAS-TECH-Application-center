"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  acknowledgeMonitorIncident, createMonitorAgent, createMonitorSite, getMonitorCommand, getMonitorLogs, getMonitorSite,
  getMonitorSites, revokeMonitorAgent, rotateMonitorAgentKey, sendMonitorCommand, updateMonitorSite,
  type BootstrapData, type MonitorAgent, type MonitorCommand, type MonitorIncident, type MonitorLog, type MonitorProgram,
  type MonitorSite, type MonitorSiteDetail, type MonitorSiteInput, type MonitorVerb,
} from "../api-client";
import { API_BASE_URL } from "../api-origin";
import { localeFor, useLanguage, useT, type Lang } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Field, FilterChips, Icon, Modal, PageHeader, Panel, Progress, SearchInput, Toolbar, type FilterItem, type Tone } from "../ui";

/**
 * Site Monitor: every customer site's programs as TMT Control Panel reports them — running or not,
 * resources, logs and open problems — with start/stop/restart and the people emailed 1 → 2 → 3.
 * Site, machine and program names are shown as written, never through the dictionary.
 */

type Notify = (message: string) => void;
type Team = BootstrapData["team"];
export type SiteHealth = "Healthy" | "Problem" | "Offline" | "NoMachine" | "Inactive";

const HEALTH_TONE: Record<SiteHealth, Tone> = { Healthy: "green", Problem: "red", Offline: "amber", NoMachine: "slate", Inactive: "slate" };
const HEALTH_ORDER: SiteHealth[] = ["Problem", "Offline", "Healthy", "NoMachine", "Inactive"];
const OVERVIEW_REFRESH_MS = 20_000;
const DETAIL_REFRESH_MS = 10_000;
const COMMAND_WATCH_MS = 90_000;

export function siteHealth(site: MonitorSite): SiteHealth {
  if (!site.isActive) return "Inactive";
  if (site.agentCount === 0) return "NoMachine";
  if (site.agentsOnline === 0) return "Offline";
  if (site.openIncidents > 0 || site.programsRunning < site.programCount || site.agentsOnline < site.agentCount) return "Problem";
  return "Healthy";
}

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function percentText(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/** "2d 4h", "5h 12m", "8m" — unit names come from the browser's Intl data in the reader's language. */
function useDuration() {
  const { lang } = useLanguage();
  const locale = localeFor(lang);
  const unit = (name: "day" | "hour" | "minute", value: number) =>
    new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "narrow" }).format(value);
  return (seconds: number | null): string => {
    if (seconds === null) return "—";
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    if (days > 0) return `${unit("day", days)} ${unit("hour", hours)}`;
    if (hours > 0) return `${unit("hour", hours)} ${unit("minute", minutes)}`;
    return unit("minute", Math.max(minutes, 0));
  };
}

function minutesText(lang: Lang, minutes: number): string {
  return new Intl.NumberFormat(localeFor(lang), { style: "unit", unit: "minute", unitDisplay: "long" }).format(minutes);
}

/** "3 minutes ago" in the reader's language, from the browser's own Intl data. */
function relativeTime(lang: Lang) {
  const format = new Intl.RelativeTimeFormat(localeFor(lang), { numeric: "auto" });
  return (iso: string | null): string => {
    if (!iso) return "—";
    const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    if (abs < 60) return format.format(seconds, "second");
    if (abs < 3_600) return format.format(Math.round(seconds / 60), "minute");
    if (abs < 86_400) return format.format(Math.round(seconds / 3_600), "hour");
    return format.format(Math.round(seconds / 86_400), "day");
  };
}

function useDateTime() {
  const { lang } = useLanguage();
  const format = new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (iso: string | null) => (iso ? format.format(new Date(iso)) : "—");
}

function serverUrl(): string {
  if (API_BASE_URL) return API_BASE_URL;
  return typeof window === "undefined" ? "" : window.location.origin;
}

// ── screen ─────────────────────────────────────────────────────────────────

export function SiteMonitorScreen({ bootstrap, notify }: { bootstrap: BootstrapData; notify: Notify }) {
  const canControl = bootstrap.permissions.includes("monitor.control");
  const canManage = bootstrap.permissions.includes("monitor.manage");
  const [siteId, setSiteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<MonitorSite | "new" | null>(null);
  const [revision, setRevision] = useState(0);

  return (
    <div className="stack site-monitor">
      {siteId === null ? (
        <SiteOverview canManage={canManage} revision={revision} onOpen={setSiteId} onCreate={() => setEditing("new")} />
      ) : (
        <SiteDetailView key={siteId} siteId={siteId} canControl={canControl} canManage={canManage} revision={revision}
          notify={notify} onBack={() => setSiteId(null)} onEdit={setEditing} />
      )}
      {editing ? (
        <SiteEditorModal site={editing === "new" ? null : editing} team={bootstrap.team} notify={notify}
          onClose={() => setEditing(null)}
          onSaved={(savedId) => { setEditing(null); setRevision((value) => value + 1); if (editing === "new") setSiteId(savedId); }} />
      ) : null}
    </div>
  );
}

// ── overview ───────────────────────────────────────────────────────────────

function SiteOverview({ canManage, revision, onOpen, onCreate }: {
  canManage: boolean; revision: number; onOpen: (siteId: number) => void; onCreate: () => void;
}) {
  const t = useT();
  const { lang } = useLanguage();
  const ago = relativeTime(lang);
  const [sites, setSites] = useState<MonitorSite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    getMonitorSites()
      .then((result) => { if (active) { setSites(result.sites); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [tick, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setTick((value) => value + 1); }, OVERVIEW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(() => {
    const result: Record<SiteHealth, number> = { Healthy: 0, Problem: 0, Offline: 0, NoMachine: 0, Inactive: 0 };
    for (const site of sites ?? []) result[siteHealth(site)] += 1;
    return result;
  }, [sites]);
  const chips: FilterItem[] = HEALTH_ORDER.map((health) => ({ key: health, label: `Monitor.health.${health}`, value: counts[health], tone: HEALTH_TONE[health] }));
  const needle = query.trim().toLocaleLowerCase();
  const visible = (sites ?? [])
    .filter((site) => !filter || siteHealth(site) === filter)
    .filter((site) => !needle || `${site.name} ${site.location} ${site.description}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => HEALTH_ORDER.indexOf(siteHealth(a)) - HEALTH_ORDER.indexOf(siteHealth(b)) || a.name.localeCompare(b.name, "th"));

  return (
    <>
      <PageHeader title="Site Monitor" subtitle="Monitor.subtitle" actions={<>
        <button className="btn default" type="button" onClick={() => setTick((value) => value + 1)}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
        {canManage ? <button className="btn primary" type="button" onClick={onCreate}><Icon name="plus" /><LocalizedText text={"Monitor.addSite"} /></button> : null}
      </>} />

      <Toolbar>
        <FilterChips items={chips} active={filter} onPick={setFilter} label="Monitor.filterByHealth" />
        <SearchInput value={query} onChange={setQuery} placeholder="Monitor.searchSites" />
      </Toolbar>

      {error && sites === null ? (
        <Panel><EmptyState icon="alertTriangle" title="Could not load" message={error}
          action={<button className="btn default" type="button" onClick={() => setTick((value) => value + 1)}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>} /></Panel>
      ) : sites === null ? (
        <Panel><EmptyState icon="clock" title="Loading…" message="Monitor.loading" /></Panel>
      ) : sites.length === 0 ? (
        <Panel><EmptyState icon="cpu" title="Monitor.emptyTitle" message={canManage ? "Monitor.emptyManage" : "Monitor.emptyRead"} /></Panel>
      ) : (
        <Panel flush>
          {error ? <p className="site-monitor-stale" role="status"><Icon name="alertTriangle" /><LocalizedText text={"Monitor.staleData"} /></p> : null}
          <div className="table-wrap">
            <table className="grid site-monitor-table">
              <colgroup><col /><col style={{ width: 130 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 150 }} /><col style={{ width: 200 }} /></colgroup>
              <thead>
                <tr>
                  <th><LocalizedText text={"Monitor.site"} /></th>
                  <th><LocalizedText text={"Monitor.status"} /></th>
                  <th className="num"><LocalizedText text={"Monitor.programsRunning"} /></th>
                  <th className="num"><LocalizedText text={"Monitor.machinesOnline"} /></th>
                  <th className="num"><LocalizedText text={"Monitor.openProblems"} /></th>
                  <th><LocalizedText text={"Monitor.lastReport"} /></th>
                  <th><LocalizedText text={"Monitor.firstContact"} /></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((site) => {
                  const health = siteHealth(site);
                  const first = site.contacts.find((contact) => contact.priority === 1);
                  return (
                    <tr key={site.id} className="clickable" onClick={() => onOpen(site.id)}>
                      <td className="wrap">
                        <div className="cell-primary">
                          <strong title={site.name}>{site.name}</strong>
                          {site.location ? <span title={site.location}>{site.location}</span> : null}
                        </div>
                      </td>
                      <td><Badge tone={HEALTH_TONE[health]} dot>{`Monitor.health.${health}`}</Badge></td>
                      <td className="num">{site.programsRunning} / {site.programCount}</td>
                      <td className="num">{site.agentsOnline} / {site.agentCount}</td>
                      <td className="num">{site.openIncidents > 0 ? <strong className="site-monitor-alert">{site.openIncidents}</strong> : "0"}</td>
                      <td title={site.lastSeenAt ?? ""}>{ago(site.lastSeenAt)}</td>
                      <td className="wrap">{first ? <span title={first.email}>{first.name}</span> : <span className="muted"><LocalizedText text={"Monitor.noContact"} /></span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length === 0 ? <EmptyState icon="search" title="Monitor.noMatchTitle" message="Monitor.noMatchMessage" /> : null}
          <p className="site-monitor-footnote">{t("Monitor.autoRefresh")}</p>
        </Panel>
      )}
    </>
  );
}

// ── site detail ────────────────────────────────────────────────────────────

type Confirm =
  | { kind: "command"; program: MonitorProgram; verb: MonitorVerb; agentName: string }
  | { kind: "revoke"; agent: MonitorAgent }
  | { kind: "rotate"; agent: MonitorAgent };

function SiteDetailView({ siteId, canControl, canManage, revision, notify, onBack, onEdit }: {
  siteId: number; canControl: boolean; canManage: boolean; revision: number; notify: Notify;
  onBack: () => void; onEdit: (site: MonitorSite) => void;
}) {
  const t = useT();
  const { lang } = useLanguage();
  const ago = relativeTime(lang);
  const duration = useDuration();
  const dateTime = useDateTime();
  const [detail, setDetail] = useState<MonitorSiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingAgent, setAddingAgent] = useState(false);
  const [shownKey, setShownKey] = useState<{ machine: string; key: string } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getMonitorSite(siteId)
      .then((result) => { if (active) { setDetail(result); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [siteId, tick, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setTick((value) => value + 1); }, DETAIL_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = () => setTick((value) => value + 1);

  /** Follows a queued command until the agent reports back, then tells the person. */
  const watchCommand = async (command: MonitorCommand) => {
    const deadline = Date.now() + COMMAND_WATCH_MS;
    let current = command;
    while (mounted.current && (current.status === "Pending" || current.status === "Delivered") && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      try {
        current = (await getMonitorCommand(command.id)).command;
      } catch {
        break;
      }
      if (mounted.current) refresh();
    }
    if (!mounted.current) return;
    const outcome = current.status === "Succeeded" ? "Monitor.command.succeeded"
      : current.status === "Failed" || current.status === "Expired" ? "Monitor.command.failed" : "Monitor.command.stillRunning";
    notify(`${t(outcome)} · ${t(`Monitor.verb.${current.verb}`)} ${current.programName}${current.resultMessage ? ` — ${current.resultMessage}` : ""}`);
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "command") {
        const { command } = await sendMonitorCommand(confirm.program.id, confirm.verb);
        setConfirm(null);
        notify(`${t("Monitor.command.queued")} · ${t(`Monitor.verb.${confirm.verb}`)} ${confirm.program.name}`);
        refresh();
        void watchCommand(command);
      } else if (confirm.kind === "rotate") {
        const result = await rotateMonitorAgentKey(confirm.agent.id);
        setConfirm(null);
        setShownKey({ machine: confirm.agent.name, key: result.key });
        refresh();
      } else {
        await revokeMonitorAgent(confirm.agent.id);
        setConfirm(null);
        notify(t("Monitor.agentRemoved"));
        refresh();
      }
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  const acknowledge = async (incident: MonitorIncident) => {
    try {
      await acknowledgeMonitorIncident(incident.id);
      notify(t("Monitor.acknowledged"));
      refresh();
    } catch (reason) {
      notify(errorText(reason));
    }
  };

  if (!detail) {
    return (
      <>
        <BackLink onBack={onBack} />
        <Panel>{error
          ? <EmptyState icon="alertTriangle" title="Could not load" message={error}
              action={<button className="btn default" type="button" onClick={refresh}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>} />
          : <EmptyState icon="clock" title="Loading…" message="Monitor.loading" />}</Panel>
      </>
    );
  }

  const { site, agents, programs, incidents, commands } = detail;
  const health = siteHealth(site);
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const openIncidents = incidents.filter((incident) => !incident.resolvedAt);
  const history = incidents.filter((incident) => incident.resolvedAt);

  const commandBlocker = (program: MonitorProgram, agent: MonitorAgent | undefined): string | null => {
    if (!site.isActive) return "Monitor.blocked.inactive";
    if (!agent?.isOnline) return "Monitor.blocked.offline";
    if (!agent.allowsControl) return "Monitor.blocked.controlOff";
    if (program.pendingCommand) return "Monitor.blocked.inFlight";
    return null;
  };

  return (
    <>
      <BackLink onBack={onBack} />
      {/* PageHeader translates its title; a site name is shown exactly as written. */}
      <header className="page-header">
        <div className="page-header-text">
          <h1>{site.name}</h1>
          {site.location ? <p className="page-sub">{site.location}</p> : null}
          <div className="page-meta"><Badge tone={HEALTH_TONE[health]} dot>{`Monitor.health.${health}`}</Badge></div>
        </div>
        <div className="page-actions">
          <button className="btn default" type="button" onClick={refresh}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
          {canManage ? <button className="btn default" type="button" onClick={() => onEdit(site)}><Icon name="edit" /><LocalizedText text={"Monitor.editSite"} /></button> : null}
          {canManage ? <button className="btn primary" type="button" onClick={() => setAddingAgent(true)}><Icon name="plus" /><LocalizedText text={"Monitor.addMachine"} /></button> : null}
        </div>
      </header>
      {error ? <p className="site-monitor-stale" role="status"><Icon name="alertTriangle" /><LocalizedText text={"Monitor.staleData"} /></p> : null}

      {openIncidents.length > 0 ? (
        <Panel title="Monitor.openProblems" className="site-monitor-problems">
          <ul className="site-monitor-incidents">
            {openIncidents.map((incident) => (
              <li key={incident.id}>
                <Icon name="alertTriangle" />
                <div>
                  <strong>{incident.kind === "ProgramStopped" ? incident.programName : incident.agentName}</strong>
                  <span>
                    <LocalizedText text={incident.kind === "ProgramStopped" ? "Monitor.incident.ProgramStopped" : "Monitor.incident.AgentOffline"} />
                    {" · "}{ago(incident.openedAt)}
                    {incident.kind === "ProgramStopped" ? <>{" · "}{incident.agentName}</> : null}
                  </span>
                  <span className="muted">
                    {incident.notifiedLevel > 0 ? `${t("Monitor.notifiedUpTo")} ${incident.notifiedLevel}` : t("Monitor.notNotifiedYet")}
                    {incident.acknowledgedAt ? ` · ${t("Monitor.acknowledgedBy")} ${incident.acknowledgedBy ?? ""}` : ""}
                  </span>
                </div>
                {canControl && !incident.acknowledgedAt ? (
                  <button className="btn default sm" type="button" onClick={() => void acknowledge(incident)}><Icon name="check" /><LocalizedText text={"Monitor.acknowledge"} /></button>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="site-monitor-layout">
        <div className="stack">
          <Panel title="Monitor.programs" subtitle="Monitor.programsHint" flush>
            {programs.length === 0 ? (
              <EmptyState icon="package" title="Monitor.noProgramsTitle" message={agents.length === 0 ? "Monitor.noMachinesMessage" : "Monitor.noProgramsMessage"} />
            ) : (
              <div className="table-wrap">
                <table className="grid site-monitor-programs">
                  <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: 80 }} /><col style={{ width: 90 }} /><col style={{ width: 90 }} /><col style={{ width: 110 }} />{canControl ? <col style={{ width: 220 }} /> : null}</colgroup>
                  <thead>
                    <tr>
                      <th><LocalizedText text={"Monitor.program"} /></th>
                      <th><LocalizedText text={"Monitor.status"} /></th>
                      <th className="num"><LocalizedText text={"Monitor.cpu"} /></th>
                      <th className="num"><LocalizedText text={"Monitor.memory"} /></th>
                      <th className="num"><LocalizedText text={"Monitor.uptime"} /></th>
                      <th><LocalizedText text={"Monitor.since"} /></th>
                      {canControl ? <th aria-label={t("Monitor.control")} /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {programs.map((program) => {
                      const agent = agentById.get(program.agentId);
                      const known = agent?.isOnline === true;
                      const blocker = commandBlocker(program, agent);
                      return (
                        <tr key={program.id}>
                          <td className="wrap">
                            <div className="cell-primary">
                              <strong title={program.name}>{program.name}{program.runAsAdmin ? <> <Badge tone="violet"><LocalizedText text={"Monitor.admin"} /></Badge></> : null}</strong>
                              <span title={agent?.machineName ?? agent?.name}>{agent?.name ?? "—"}{program.group ? ` · ${program.group}` : ""}</span>
                            </div>
                          </td>
                          <td>
                            {program.pendingCommand ? (
                              <Badge tone="blue" dot>{`Monitor.pending.${program.pendingCommand.verb}`}</Badge>
                            ) : !known ? (
                              <Badge tone="slate" dot>{"Monitor.state.unknown"}</Badge>
                            ) : (
                              <Badge tone={program.isRunning ? "green" : "red"} dot>{program.isRunning ? "Monitor.state.running" : "Monitor.state.stopped"}</Badge>
                            )}
                          </td>
                          <td className="num">{program.isRunning && known ? percentText(program.cpuPercent) : "—"}</td>
                          <td className="num">{program.isRunning && known ? formatBytes(program.memoryBytes) : "—"}</td>
                          <td className="num">{program.isRunning && known ? duration(program.uptimeSeconds) : "—"}</td>
                          <td title={dateTime(program.statusChangedAt)}>{ago(program.statusChangedAt)}</td>
                          {canControl ? (
                            <td>
                              <div className="site-monitor-actions" title={blocker ? t(blocker) : undefined}>
                                {(["Start", "Stop", "Restart"] as const).map((verb) => {
                                  const pointless = known && ((verb === "Start" && program.isRunning) || (verb === "Stop" && !program.isRunning));
                                  return (
                                    <button key={verb} type="button" className={`btn sm ${verb === "Stop" ? "danger" : verb === "Start" ? "primary" : "default"}`}
                                      disabled={blocker !== null || pointless}
                                      onClick={() => setConfirm({ kind: "command", program, verb, agentName: agent?.name ?? "" })}>
                                      <LocalizedText text={`Monitor.verb.${verb}`} />
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Monitor.machines" subtitle="Monitor.machinesHint" flush>
            {agents.length === 0 ? (
              <EmptyState icon="cpu" title="Monitor.noMachinesTitle" message={canManage ? "Monitor.noMachinesManage" : "Monitor.noMachinesMessage"} />
            ) : (
              <div className="table-wrap">
                <table className="grid site-monitor-machines">
                  <colgroup><col /><col style={{ width: 100 }} /><col style={{ width: 110 }} /><col style={{ width: 150 }} /><col style={{ width: 150 }} /><col style={{ width: 90 }} />{canManage ? <col style={{ width: 170 }} /> : null}</colgroup>
                  <thead>
                    <tr>
                      <th><LocalizedText text={"Monitor.machine"} /></th>
                      <th><LocalizedText text={"Monitor.status"} /></th>
                      <th className="num"><LocalizedText text={"Monitor.cpu"} /></th>
                      <th><LocalizedText text={"Monitor.memory"} /></th>
                      <th><LocalizedText text={"Monitor.disk"} /></th>
                      <th className="num"><LocalizedText text={"Monitor.uptime"} /></th>
                      {canManage ? <th aria-label={t("Monitor.keyActions")} /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((agent) => {
                      const memory = agent.host.memoryTotalBytes && agent.host.memoryUsedBytes !== null
                        ? Math.round((agent.host.memoryUsedBytes / agent.host.memoryTotalBytes) * 100) : null;
                      const diskUsed = agent.host.diskTotalBytes && agent.host.diskFreeBytes !== null
                        ? Math.round(((agent.host.diskTotalBytes - agent.host.diskFreeBytes) / agent.host.diskTotalBytes) * 100) : null;
                      return (
                        <tr key={agent.id}>
                          <td className="wrap">
                            <div className="cell-primary">
                              <strong title={agent.name}>{agent.name}</strong>
                              <span>
                                {agent.machineName ?? t("Monitor.neverReported")}
                                {agent.agentVersion ? ` · v${agent.agentVersion}` : ""}
                                {` · ${t("Monitor.key")} …${agent.keyHint}`}
                              </span>
                              <span className="muted">
                                {t(agent.allowsControl ? "Monitor.controlAllowed" : "Monitor.controlOff")}
                                {" · "}{t("Monitor.lastReport")} {ago(agent.lastSeenAt)}
                              </span>
                            </div>
                          </td>
                          <td><Badge tone={agent.isOnline ? "green" : "amber"} dot>{agent.isOnline ? "Monitor.online" : "Monitor.offline"}</Badge></td>
                          <td className="num">{agent.isOnline ? percentText(agent.host.cpuPercent) : "—"}</td>
                          <td>
                            {memory === null ? "—" : (
                              <div className="site-monitor-meter">
                                <Progress value={memory} tone={memory >= 90 ? "red" : memory >= 75 ? "amber" : "blue"} />
                                <span>{formatBytes(agent.host.memoryUsedBytes)} / {formatBytes(agent.host.memoryTotalBytes)}</span>
                              </div>
                            )}
                          </td>
                          <td>
                            {diskUsed === null ? "—" : (
                              <div className="site-monitor-meter">
                                <Progress value={diskUsed} tone={diskUsed >= 90 ? "red" : diskUsed >= 80 ? "amber" : "blue"} />
                                <span>{formatBytes(agent.host.diskFreeBytes)} {t("Monitor.free")}</span>
                              </div>
                            )}
                          </td>
                          <td className="num">{duration(agent.host.uptimeSeconds)}</td>
                          {canManage ? (
                            <td>
                              <div className="site-monitor-actions">
                                <button className="btn default sm" type="button" onClick={() => setConfirm({ kind: "rotate", agent })}><LocalizedText text={"Monitor.newKey"} /></button>
                                <button className="btn danger sm" type="button" onClick={() => setConfirm({ kind: "revoke", agent })}><LocalizedText text={"Monitor.removeMachine"} /></button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <LogsPanel siteId={siteId} agents={agents} refreshKey={tick} />
        </div>

        <div className="stack">
          <Panel title="Monitor.responsible" subtitle={site.escalationMinutes === 0 ? "Monitor.escalation.allAtOnce" : "Monitor.escalation.stepwise"}
            actions={canManage ? <button className="btn ghost sm" type="button" onClick={() => onEdit(site)}><Icon name="edit" /><LocalizedText text={"Edit"} /></button> : undefined}>
            {site.escalationMinutes > 0 ? <p className="site-monitor-footnote">{t("Monitor.escalation.every")} {minutesText(lang, site.escalationMinutes)}</p> : null}
            <ol className="site-monitor-contacts">
              {[1, 2, 3].map((priority) => {
                const contact = site.contacts.find((item) => item.priority === priority);
                return (
                  <li key={priority}>
                    <span className="site-monitor-priority">{priority}</span>
                    {contact ? <div><strong>{contact.name}</strong><span>{contact.email}</span></div>
                      : <div className="muted"><LocalizedText text={"Monitor.noContact"} /></div>}
                  </li>
                );
              })}
            </ol>
            {site.description ? <p className="site-monitor-description">{site.description}</p> : null}
          </Panel>

          <Panel title="Monitor.recentCommands" flush>
            {commands.length === 0 ? <EmptyState icon="play" title="Monitor.noCommandsTitle" message="Monitor.noCommandsMessage" /> : (
              <ul className="site-monitor-list">
                {commands.map((command) => (
                  <li key={command.id}>
                    <div>
                      <strong><LocalizedText text={`Monitor.verb.${command.verb}`} /> · {command.programName}</strong>
                      <span>{command.requestedBy} · {ago(command.requestedAt)}</span>
                      {command.resultMessage ? <span className="muted">{command.resultMessage}</span> : null}
                    </div>
                    <Badge tone={command.status === "Succeeded" ? "green" : command.status === "Failed" || command.status === "Expired" ? "red" : "blue"}>
                      {`Monitor.commandStatus.${command.status}`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Monitor.history" subtitle="Monitor.historyHint" flush>
            {history.length === 0 ? <EmptyState icon="checkCircle" title="Monitor.noHistoryTitle" message="Monitor.noHistoryMessage" /> : (
              <ul className="site-monitor-list">
                {history.map((incident) => (
                  <li key={incident.id}>
                    <div>
                      <strong>{incident.kind === "ProgramStopped" ? incident.programName : incident.agentName}</strong>
                      <span><LocalizedText text={incident.kind === "ProgramStopped" ? "Monitor.incident.ProgramStopped" : "Monitor.incident.AgentOffline"} /> · {dateTime(incident.openedAt)}</span>
                      <span className="muted">{t("Monitor.resolvedAfter")} {duration(Math.max(0, (new Date(incident.resolvedAt!).getTime() - new Date(incident.openedAt).getTime()) / 1000))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {confirm ? (
        <ConfirmModal busy={busy} onClose={() => setConfirm(null)} onConfirm={() => void runConfirmed()}
          title={confirm.kind === "command" ? `Monitor.confirm.${confirm.verb}` : confirm.kind === "rotate" ? "Monitor.confirm.rotate" : "Monitor.confirm.revoke"}
          danger={confirm.kind === "revoke" || (confirm.kind === "command" && confirm.verb !== "Start")}
          subject={confirm.kind === "command" ? `${confirm.program.name} · ${confirm.agentName} · ${site.name}` : `${confirm.agent.name} · ${site.name}`}
          message={confirm.kind === "command" ? "Monitor.confirm.commandMessage" : confirm.kind === "rotate" ? "Monitor.confirm.rotateMessage" : "Monitor.confirm.revokeMessage"} />
      ) : null}
      {addingAgent ? (
        <AddMachineModal siteId={site.id} notify={notify} onClose={() => setAddingAgent(false)}
          onCreated={(machine, key) => { setAddingAgent(false); setShownKey({ machine, key }); refresh(); }} />
      ) : null}
      {shownKey ? <AgentKeyModal machine={shownKey.machine} agentKey={shownKey.key} onClose={() => setShownKey(null)} /> : null}
    </>
  );
}


function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button className="btn ghost site-monitor-back" type="button" onClick={onBack}>
      <Icon name="arrowLeft" /><LocalizedText text={"Monitor.allSites"} />
    </button>
  );
}

// ── logs ───────────────────────────────────────────────────────────────────

const LOG_LEVELS = ["Problems", "Error", "Warning", "Info", "All"] as const;
type LogLevelFilter = typeof LOG_LEVELS[number];

function LogsPanel({ siteId, agents, refreshKey }: { siteId: number; agents: MonitorAgent[]; refreshKey: number }) {
  const t = useT();
  const dateTime = useDateTime();
  const [level, setLevel] = useState<LogLevelFilter>("Problems");
  const [agentId, setAgentId] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<MonitorLog[] | null>(null);
  const [older, setOlder] = useState<{ filter: string; logs: MonitorLog[]; exhausted: boolean }>({ filter: "", logs: [], exhausted: false });
  const [error, setError] = useState<string | null>(null);

  // Typing settles for a moment before the search runs.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    getMonitorLogs(siteId, { level: level === "All" ? undefined : level, agentId: agentId || undefined, q: search || undefined, limit: 100 })
      .then((result) => { if (active) { setLogs(result.logs); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [siteId, level, agentId, search, refreshKey]);

  const filterKey = `${level}|${agentId}|${search}`;
  // A new filter starts again from the newest lines (derived at render, not corrected in an effect).
  const page = older.filter === filterKey ? older : { filter: filterKey, logs: [], exhausted: false };
  const recentIds = new Set((logs ?? []).map((log) => log.id));
  const all = [...(logs ?? []), ...page.logs.filter((log) => !recentIds.has(log.id))];

  const loadOlder = async () => {
    const last = all.at(-1);
    if (!last) return;
    try {
      const result = await getMonitorLogs(siteId, { level: level === "All" ? undefined : level, agentId: agentId || undefined, q: search || undefined, beforeId: last.id, limit: 200 });
      setOlder({ filter: filterKey, logs: [...page.logs, ...result.logs], exhausted: result.logs.length < 200 });
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  return (
    <Panel title="Monitor.logs" subtitle="Monitor.logsHint" flush>
      <div className="site-monitor-log-filters">
        <div className="site-monitor-segments" role="group" aria-label={t("Monitor.logLevel")}>
          {LOG_LEVELS.map((item) => (
            <button key={item} type="button" aria-pressed={level === item} className={level === item ? "active" : ""} onClick={() => setLevel(item)}>
              <LocalizedText text={`Monitor.logs.${item}`} />
            </button>
          ))}
        </div>
        {agents.length > 1 ? (
          <label className="select-field">
            <span className="sr-only">{t("Monitor.machine")}</span>
            <select value={agentId} onChange={(event) => setAgentId(Number(event.target.value))} aria-label={t("Monitor.machine")}>
              <option value={0}>{t("Monitor.allMachines")}</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
            <Icon name="chevronDown" />
          </label>
        ) : null}
        <SearchInput value={query} onChange={setQuery} placeholder="Monitor.searchLogs" />
      </div>
      {error && logs === null ? <EmptyState icon="alertTriangle" title="Could not load" message={error} />
        : logs === null ? <EmptyState icon="clock" title="Loading…" message="Monitor.loadingLogs" />
        : all.length === 0 ? <EmptyState icon="file" title="Monitor.noLogsTitle" message="Monitor.noLogsMessage" />
        : (
          <div className="table-wrap tall">
            <table className="grid site-monitor-logs">
              <colgroup><col style={{ width: 150 }} /><col style={{ width: 90 }} />{agents.length > 1 ? <col style={{ width: 140 }} /> : null}<col /></colgroup>
              <thead>
                <tr>
                  <th><LocalizedText text={"Monitor.time"} /></th>
                  <th><LocalizedText text={"Monitor.level"} /></th>
                  {agents.length > 1 ? <th><LocalizedText text={"Monitor.machine"} /></th> : null}
                  <th><LocalizedText text={"Monitor.message"} /></th>
                </tr>
              </thead>
              <tbody>
                {all.map((log) => (
                  <tr key={log.id} className={`site-monitor-log ${log.level.toLowerCase()}`}>
                    <td>{dateTime(log.loggedAt)}</td>
                    <td><Badge tone={log.level === "Error" ? "red" : log.level === "Warning" ? "amber" : "slate"}>{`Monitor.level.${log.level}`}</Badge></td>
                    {agents.length > 1 ? <td title={log.agentName}>{log.agentName}</td> : null}
                    <td className="wrap"><span className="site-monitor-message">{log.message}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!page.exhausted && all.length >= 100 ? (
              <div className="site-monitor-more"><button className="btn default sm" type="button" onClick={() => void loadOlder()}><LocalizedText text={"Monitor.olderLogs"} /></button></div>
            ) : null}
          </div>
        )}
    </Panel>
  );
}

// ── dialogs ────────────────────────────────────────────────────────────────

function ConfirmModal({ title, subject, message, danger, busy, onConfirm, onClose }: {
  title: string; subject: string; message: string; danger: boolean; busy: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} size="sm" onClose={onClose} footer={<>
      <button className="btn default" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
      <button className={`btn ${danger ? "danger" : "primary"}`} type="button" onClick={onConfirm} disabled={busy}>
        <LocalizedText text={busy ? "Monitor.working" : "Monitor.confirmButton"} />
      </button>
    </>}>
      <p className="site-monitor-confirm-subject"><strong>{subject}</strong></p>
      <p><LocalizedText text={message} /></p>
    </Modal>
  );
}

function AddMachineModal({ siteId, notify, onClose, onCreated }: {
  siteId: number; notify: Notify; onClose: () => void; onCreated: (machine: string, key: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const result = await createMonitorAgent(siteId, name.trim());
      onCreated(result.agent.name, result.key);
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Monitor.addMachine" subtitle="Monitor.addMachineHint" size="sm" onClose={onClose} footer={<>
      <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" disabled={busy || !name.trim()} onClick={() => void save()}><LocalizedText text={"Monitor.createKey"} /></button>
    </>}>
      <div className="form-grid two">
        <Field label="Monitor.machineName" hint="Monitor.machineNameHint" span={2}>
          <input value={name} maxLength={150} onChange={(event) => setName(event.target.value)} placeholder={t("Monitor.machineNamePlaceholder")} />
        </Field>
      </div>
    </Modal>
  );
}

function AgentKeyModal({ machine, agentKey, onClose }: { machine: string; agentKey: string; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState<"url" | "key" | null>(null);
  const url = serverUrl();
  const copy = async (what: "url" | "key", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
    } catch {
      setCopied(null);
    }
  };
  return (
    <Modal title="Monitor.keyTitle" subtitle="Monitor.keyOnce" size="md" onClose={onClose}
      footer={<button className="btn primary" type="button" onClick={onClose}><LocalizedText text={"Monitor.keySaved"} /></button>}>
      <p className="site-monitor-confirm-subject"><strong>{machine}</strong></p>
      <div className="site-monitor-secret">
        <span>{t("Monitor.serverUrl")}</span>
        <code>{url}</code>
        <button className="btn default sm" type="button" onClick={() => void copy("url", url)}><Icon name={copied === "url" ? "check" : "copy"} /><LocalizedText text={"Monitor.copy"} /></button>
      </div>
      <div className="site-monitor-secret">
        <span>{t("Monitor.agentKey")}</span>
        <code>{agentKey}</code>
        <button className="btn default sm" type="button" onClick={() => void copy("key", agentKey)}><Icon name={copied === "key" ? "check" : "copy"} /><LocalizedText text={"Monitor.copy"} /></button>
      </div>
      <ol className="site-monitor-steps">
        <li><LocalizedText text={"Monitor.setup.step1"} /></li>
        <li><LocalizedText text={"Monitor.setup.step2"} /></li>
        <li><LocalizedText text={"Monitor.setup.step3"} /></li>
      </ol>
    </Modal>
  );
}

function SiteEditorModal({ site, team, notify, onClose, onSaved }: {
  site: MonitorSite | null; team: Team; notify: Notify; onClose: () => void; onSaved: (siteId: number) => void;
}) {
  const t = useT();
  const [name, setName] = useState(site?.name ?? "");
  const [location, setLocation] = useState(site?.location ?? "");
  const [description, setDescription] = useState(site?.description ?? "");
  const [escalation, setEscalation] = useState(String(site?.escalationMinutes ?? 15));
  const [offline, setOffline] = useState(String(site?.offlineMinutes ?? 3));
  const [active, setActive] = useState(site?.isActive ?? true);
  const [contacts, setContacts] = useState<number[]>(() =>
    [1, 2, 3].map((priority) => site?.contacts.find((contact) => contact.priority === priority)?.userId ?? 0));
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => team.filter((person) => person.email).slice().sort((a, b) => a.name.localeCompare(b.name, "th")), [team]);
  const escalationValue = Number(escalation);
  const offlineValue = Number(offline);
  const chosen = contacts.filter(Boolean);
  const problem = !name.trim() ? "Monitor.validation.name"
    : !Number.isInteger(escalationValue) || escalationValue < 0 || escalationValue > 1440 ? "Monitor.validation.escalation"
    : !Number.isInteger(offlineValue) || offlineValue < 1 || offlineValue > 120 ? "Monitor.validation.offline"
    : new Set(chosen).size !== chosen.length ? "Monitor.validation.duplicateContact"
    : chosen.length === 0 ? "Monitor.validation.noContact"
    : null;

  const save = async () => {
    const input: MonitorSiteInput = {
      name: name.trim(), location: location.trim(), description: description.trim(),
      escalationMinutes: escalationValue, offlineMinutes: offlineValue, isActive: active,
      contacts: contacts.map((userId, index) => ({ priority: index + 1, userId })).filter((contact) => contact.userId > 0),
      ...(site ? { rowVersion: site.rowVersion } : {}),
    };
    setBusy(true);
    try {
      if (site) {
        await updateMonitorSite(site.id, input);
        onSaved(site.id);
      } else {
        const result = await createMonitorSite(input);
        onSaved(result.id);
      }
      notify(t("Monitor.siteSaved"));
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={site ? "Monitor.editSite" : "Monitor.addSite"} size="md" onClose={onClose} footer={<>
      {problem ? <span className="site-monitor-hint"><LocalizedText text={problem} /></span> : null}
      <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" disabled={busy || (problem !== null && problem !== "Monitor.validation.noContact")} onClick={() => void save()}>
        <LocalizedText text={busy ? "Monitor.working" : "Save"} />
      </button>
    </>}>
      <div className="form-grid two">
        <Field label="Monitor.siteName" span={2}>
          <input value={name} maxLength={150} onChange={(event) => setName(event.target.value)} placeholder={t("Monitor.siteNamePlaceholder")} />
        </Field>
        <Field label="Monitor.location" span={2}>
          <input value={location} maxLength={300} onChange={(event) => setLocation(event.target.value)} />
        </Field>
        <Field label="Monitor.description" span={2}>
          <textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {[1, 2, 3].map((priority) => (
          <Field key={priority} label={`Monitor.contact.${priority}`} span={priority === 1 ? 2 : undefined}>
            <select value={contacts[priority - 1]} onChange={(event) => {
              const next = [...contacts];
              next[priority - 1] = Number(event.target.value);
              setContacts(next);
            }}>
              <option value={0}>{t("Monitor.contactNone")}</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}
            </select>
          </Field>
        ))}
        <Field label="Monitor.escalationMinutes" hint="Monitor.escalationHint">
          <input type="number" min={0} max={1440} value={escalation} onChange={(event) => setEscalation(event.target.value)} />
        </Field>
        <Field label="Monitor.offlineMinutes" hint="Monitor.offlineHint">
          <input type="number" min={1} max={120} value={offline} onChange={(event) => setOffline(event.target.value)} />
        </Field>
        <Field label="Monitor.siteActive" span={2}>
          <label className="site-monitor-check">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            <LocalizedText text={"Monitor.siteActiveHint"} />
          </label>
        </Field>
      </div>
    </Modal>
  );
}
