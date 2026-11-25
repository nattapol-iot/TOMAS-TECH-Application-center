"use client";

import { useEffect, useMemo, useState } from "react";
import { getMonitorFleet, type BootstrapData, type FleetAgent, type FleetData } from "../api-client";
import { localeFor, useLanguage, useT, type Lang } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Icon, KpiCard, PageHeader, Panel, SearchInput, Toolbar } from "../ui";
import { LoadMeter, TmtdeskChip } from "./FleetParts";
import { agentProblems, deskState, diskPercent, matchesFleetSearch, memoryPercent, tmtdeskIdText, tmtdeskLink } from "./fleet-model";
import { ScriptJobModal, ScriptJobsPanel, ScriptRequestModal } from "./MonitorScripts";
import "./fleet.css";

/**
 * Fleet: every machine of every monitored site in one table — online, TMTDesk, load, last report and a Remote
 * button — with filters, search and multi-select for running an approved script on several machines at once.
 * Site and machine names are shown as written, never through the dictionary.
 */
type Notify = (message: string) => void;
const REFRESH_MS = 15_000;
const ALL = "";

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

export function FleetScreen({ bootstrap, notify }: { bootstrap: BootstrapData; notify: Notify }) {
  const t = useT();
  const { lang } = useLanguage();
  const ago = relativeTime(lang);
  const canScript = bootstrap.permissions.includes("monitor.script");
  const [data, setData] = useState<FleetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [site, setSite] = useState(ALL);
  const [version, setVersion] = useState(ALL);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [openJob, setOpenJob] = useState<number | null>(null);
  const [jobsRevision, setJobsRevision] = useState(0);

  useEffect(() => {
    let active = true;
    getMonitorFleet()
      .then((result) => { if (active) { setData(result); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [tick]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setTick((value) => value + 1); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const agents = useMemo(() => data?.agents ?? [], [data]);
  const sites = useMemo(() => [...new Map(agents.map((agent) => [agent.site.id, agent.site.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "th")), [agents]);
  const versions = useMemo(() => [...new Set(agents.map((agent) => agent.tmtdesk?.version).filter((value): value is string => Boolean(value)))].sort(), [agents]);
  const visible = agents
    .filter((agent) => site === ALL || String(agent.site.id) === site)
    .filter((agent) => version === ALL || (version === "none" ? !agent.tmtdesk : agent.tmtdesk?.version === version))
    .filter((agent) => !problemsOnly || agentProblems(agent).length > 0)
    .filter((agent) => matchesFleetSearch(agent, query));
  // Only machines still listed stay picked (derived at render, so a refresh never keeps a removed machine).
  const pickedSet = new Set(picked.filter((id) => agents.some((agent) => agent.id === id)));
  const pickedAgents = agents.filter((agent) => pickedSet.has(agent.id));
  const allVisiblePicked = visible.length > 0 && visible.every((agent) => pickedSet.has(agent.id));

  const online = agents.filter((agent) => agent.isOnline).length;
  const withDesk = agents.filter((agent) => agent.tmtdesk);
  const deskHealthy = withDesk.filter((agent) => deskState(agent) === "healthy").length;
  const problems = agents.filter((agent) => agentProblems(agent).length > 0).length;
  const sessions = agents.reduce((sum, agent) => sum + (agent.isOnline ? agent.tmtdesk?.activeSessions ?? 0 : 0), 0);

  const toggle = (id: number) => setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const toggleAll = () => setPicked(allVisiblePicked ? picked.filter((id) => !visible.some((agent) => agent.id === id)) : [...new Set([...picked, ...visible.map((agent) => agent.id)])]);

  return (
    <div className="stack fleet">
      <PageHeader title="Fleet" subtitle="Fleet.subtitle" actions={<>
        <a className="btn default" href="#/command-center" data-guide="fleet.commandCenter"><Icon name="maximize" /><LocalizedText text={"Command Center"} /></a>
        <button className="btn default" type="button" onClick={() => setTick((value) => value + 1)}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
      </>} />

      <div className="kpi-grid">
        <KpiCard icon="cpu" label="Fleet.kpi.online" value={`${online} / ${agents.length}`} tone={online < agents.length ? "amber" : "green"} />
        <KpiCard icon="globe" label="Fleet.kpi.deskHealthy" value={`${deskHealthy} / ${withDesk.length}`} tone={deskHealthy < withDesk.length ? "amber" : "green"} />
        <KpiCard icon="alertTriangle" label="Fleet.kpi.problems" value={problems} tone={problems > 0 ? "red" : "green"} onClick={() => setProblemsOnly(true)} />
        <KpiCard icon="eye" label="Fleet.kpi.sessions" value={sessions} tone={sessions > 0 ? "blue" : "slate"} />
      </div>

      <Toolbar>
        <SearchInput guide="fleet.search" value={query} onChange={setQuery} placeholder="Fleet.search" />
        <label className="select-field">
          <span className="sr-only">{t("Monitor.site")}</span>
          <select value={site} onChange={(event) => setSite(event.target.value)} aria-label={t("Monitor.site")}>
            <option value={ALL}>{t("Fleet.allSites")}</option>
            {sites.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
          </select>
          <Icon name="chevronDown" />
        </label>
        <label className="select-field">
          <span className="sr-only">{t("Fleet.deskVersion")}</span>
          <select value={version} onChange={(event) => setVersion(event.target.value)} aria-label={t("Fleet.deskVersion")}>
            <option value={ALL}>{t("Fleet.allVersions")}</option>
            {versions.map((item) => <option key={item} value={item}>TMTDesk {item}</option>)}
            <option value="none">{t("Fleet.noDesk")}</option>
          </select>
          <Icon name="chevronDown" />
        </label>
        <button type="button" className={`filter-chip red${problemsOnly ? " active" : ""}`} aria-pressed={problemsOnly} data-guide="fleet.problems"
          onClick={() => setProblemsOnly((value) => !value)}>
          <span>{t("Fleet.problemsOnly")}</span><strong>{problems}</strong>
        </button>
      </Toolbar>

      {pickedAgents.length > 0 ? (
        <div className="fleet-selection" role="status">
          <strong>{pickedAgents.length}</strong> <LocalizedText text={"Fleet.selected"} />
          <span className="fleet-selection-actions">
            {canScript ? (
              <button className="btn primary sm" type="button" data-guide="fleet.runScript" onClick={() => setRequesting(true)}>
                <Icon name="play" /><LocalizedText text={"Fleet.runScript"} />
              </button>
            ) : null}
            <button className="btn ghost sm" type="button" onClick={() => setPicked([])}><Icon name="x" /><LocalizedText text={"Fleet.clearSelection"} /></button>
          </span>
        </div>
      ) : null}

      {error && data === null ? (
        <Panel><EmptyState icon="alertTriangle" title="Could not load" message={error}
          action={<button className="btn default" type="button" onClick={() => setTick((value) => value + 1)}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>} /></Panel>
      ) : data === null ? (
        <Panel><EmptyState icon="clock" title="Loading…" message="Fleet.loading" /></Panel>
      ) : agents.length === 0 ? (
        <Panel><EmptyState icon="cpu" title="Fleet.emptyTitle" message="Fleet.emptyMessage" /></Panel>
      ) : (
        <Panel flush guide="fleet.table">
          {error ? <p className="site-monitor-stale" role="status"><Icon name="alertTriangle" /><LocalizedText text={"Monitor.staleData"} /></p> : null}
          <div className="table-wrap">
            <table className="grid fleet-table">
              <colgroup>
                <col style={{ width: 40 }} /><col /><col style={{ width: 170 }} /><col style={{ width: 100 }} /><col style={{ width: 190 }} />
                <col style={{ width: 80 }} /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allVisiblePicked} onChange={toggleAll} aria-label={t("Fleet.selectAll")} /></th>
                  <th><LocalizedText text={"Monitor.machine"} /></th>
                  <th><LocalizedText text={"Monitor.site"} /></th>
                  <th><LocalizedText text={"Monitor.status"} /></th>
                  <th>TMTDesk</th>
                  <th className="num"><LocalizedText text={"Monitor.cpu"} /></th>
                  <th><LocalizedText text={"Monitor.memory"} /></th>
                  <th><LocalizedText text={"Monitor.disk"} /></th>
                  <th><LocalizedText text={"Monitor.lastReport"} /></th>
                  <th aria-label={t("Monitor.remote")} />
                </tr>
              </thead>
              <tbody>
                {visible.map((agent) => <FleetRow key={agent.id} agent={agent} picked={pickedSet.has(agent.id)} onToggle={() => toggle(agent.id)} ago={ago} />)}
              </tbody>
            </table>
          </div>
          {visible.length === 0 ? <EmptyState icon="search" title="Monitor.noMatchTitle" message="Fleet.noMatch" /> : null}
          <p className="site-monitor-footnote">{t("Fleet.autoRefresh")}</p>
        </Panel>
      )}

      <ScriptJobsPanel revision={jobsRevision} notify={notify} onOpen={setOpenJob} onChanged={() => setJobsRevision((value) => value + 1)} />

      {requesting ? (
        <ScriptRequestModal agents={pickedAgents} notify={notify} onClose={() => setRequesting(false)}
          onRequested={(job) => { setRequesting(false); setPicked([]); setJobsRevision((value) => value + 1); setOpenJob(job.id); }} />
      ) : null}
      {openJob !== null ? (
        <ScriptJobModal jobId={openJob} notify={notify} onClose={() => setOpenJob(null)} onChanged={() => setJobsRevision((value) => value + 1)} />
      ) : null}
    </div>
  );
}

function FleetRow({ agent, picked, onToggle, ago }: { agent: FleetAgent; picked: boolean; onToggle: () => void; ago: (iso: string | null) => string }) {
  const t = useT();
  const problems = agentProblems(agent);
  return (
    <tr className={problems.length > 0 ? "fleet-problem" : undefined}>
      <td><input type="checkbox" checked={picked} onChange={onToggle} aria-label={`${t("Fleet.select")} ${agent.name}`} /></td>
      <td className="wrap">
        <div className="cell-primary">
          <strong title={agent.name}>{agent.name}</strong>
          <span>
            {agent.machineName ?? t("Monitor.neverReported")}
            {agent.agentVersion ? ` · CP v${agent.agentVersion}` : ""}
            {agent.openIncidents > 0 ? <> · <span className="site-monitor-alert">{agent.openIncidents} {t("Fleet.openProblems")}</span></> : null}
          </span>
        </div>
      </td>
      <td className="wrap"><span title={agent.site.name}>{agent.site.name}</span></td>
      <td><Badge tone={agent.isOnline ? "green" : "amber"} dot>{agent.isOnline ? "Monitor.online" : "Monitor.offline"}</Badge></td>
      <td><TmtdeskChip agent={agent} /></td>
      <td className="num">{agent.isOnline && agent.host.cpuPercent !== null ? `${agent.host.cpuPercent.toFixed(0)}%` : "—"}</td>
      <td>{agent.isOnline ? <LoadMeter value={memoryPercent(agent)} /> : "—"}</td>
      <td>{agent.isOnline ? <LoadMeter value={diskPercent(agent)} warnAt={80} /> : "—"}</td>
      <td title={agent.lastSeenAt ?? ""}>{ago(agent.lastSeenAt)}</td>
      <td>
        {agent.tmtdeskId ? (
          <a className="btn default sm" href={tmtdeskLink(agent)} title={`${t("Monitor.remoteHint")} · TMTDesk ${tmtdeskIdText(agent.tmtdeskId)}`}>
            <Icon name="externalLink" /><LocalizedText text={"Monitor.remote"} />
          </a>
        ) : <span className="muted" title={t("Fleet.noDeskId")}>—</span>}
      </td>
    </tr>
  );
}
