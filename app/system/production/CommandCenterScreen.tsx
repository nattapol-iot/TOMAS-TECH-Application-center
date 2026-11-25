"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getMonitorCommandCenter,
  getMonitorFleet,
  getMonitorSite,
  type CommandCenterData,
  type CommandCenterIncident,
  type FleetAgent,
  type FleetData,
  type FleetSite,
  type MonitorSample,
  type MonitorSiteDetail,
} from "../api-client";
import { localeFor, useLanguage, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, Icon } from "../ui";
import { TmtdeskChip } from "./FleetParts";
import {
  agentProblems,
  createMonitorPoll,
  fleetKpis,
  incidentSeverity,
  loadOf,
  percent,
  relativeAge,
  siteSeverity,
  tmtdeskIdText,
  tmtdeskLink,
  topByLoad,
  type LoadMetric,
  type SiteSeverity,
} from "./fleet-model";
import "./command-center.css";

/**
 * Command Center: the operations-room view of Site Monitor for a TV or wall screen, laid out like a SCADA overview
 * (owner request 2026-11-25: an engineer's screen, not a map). The centre is a station overview: one faceplate per
 * site with a status lamp, PCs online, programs running, peak CPU and open alarms, worst first, under an alarm
 * summary bar. Around it: live KPIs, the incident feed, the busiest machines with an hour of history, remote
 * sessions, commands and script jobs. It polls the existing APIs; nothing here changes anything on a machine.
 *
 * Keys: F full screen (TV mode), S spotlight on/off, R refresh, ← → step through problem sites, 1 2 3 CPU / RAM /
 * disk, Esc close. When nobody touches it the spotlight walks through the sites that need attention.
 * The dark look is scoped to .ops-center (command-center.css); nothing else in the app changes.
 */
type Notify = (message: string) => void;

const REFRESH_MS = 12_000;
const STALE_MS = 45_000;
const IDLE_MS = 20_000;
const SPOTLIGHT_MS = 8_000;
const TOP_COUNT = 6;
const SEVERITY_ORDER: Record<SiteSeverity, number> = { critical: 0, warning: 1, ok: 2, idle: 3 };

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function useAgeText() {
  const { lang } = useLanguage();
  return (iso: string | null, now: number) => relativeAge(iso, now, localeFor(lang));
}

function incidentSubject(incident: CommandCenterIncident): string {
  return incident.kind === "ProgramStopped" ? `${incident.programName ?? ""} · ${incident.agentName}` : incident.agentName;
}

export function CommandCenterScreen(_props: { notify: Notify }) {
  const t = useT();
  const { lang } = useLanguage();
  const ageText = useAgeText();
  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [center, setCenter] = useState<CommandCenterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const refresh = useRef<() => void>(() => {});
  const [history, setHistory] = useState<(number | null)[][]>([]);
  const [help, setHelp] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<number | null>(null);
  const [tv, setTv] = useState(false);
  const [spotlightOn, setSpotlightOn] = useState(true);
  const [spot, setSpot] = useState(0);
  const [metric, setMetric] = useState<LoadMetric>("cpu");
  // The summary chips filter the faceplates (a state, or sites with open alarms); null shows every site.
  const [plantFilter, setPlantFilter] = useState<PlantFilter | null>(null);
  const lastInput = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    lastInput.current = Date.now();
    const poll = createMonitorPoll(async () => {
      try {
        // Wait for both requests, even if one fails, before releasing the polling lock.
        const [fleetResult, centerResult] = await Promise.allSettled([getMonitorFleet(), getMonitorCommandCenter()]);
        if (fleetResult.status === "rejected") throw fleetResult.reason;
        if (centerResult.status === "rejected") throw centerResult.reason;
        if (!active) return;
        setFleet(fleetResult.value);
        setCenter(centerResult.value);
        setHistory((previous) => [...previous.slice(-1), fleetKpis(fleetResult.value.sites, fleetResult.value.agents)]);
        setError(null);
        setLastOk(Date.now());
      } catch (reason) {
        if (active) setError(errorText(reason));
        throw reason;
      }
    }, REFRESH_MS);
    refresh.current = poll.refresh;
    return () => {
      active = false;
      poll.stop();
    };
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(clock);
  }, []);

  const sites = useMemo(() => fleet?.sites ?? [], [fleet]);
  const agents = useMemo(() => fleet?.agents ?? [], [fleet]);
  const incidents = useMemo(() => center?.incidents ?? [], [center]);
  const openIncidents = incidents.filter((incident) => !incident.resolvedAt);
  const severityOf = useMemo(() => {
    const map = new Map<number, SiteSeverity>();
    for (const site of sites) map.set(site.id, siteSeverity(site, agents, incidents));
    return map;
  }, [sites, agents, incidents]);
  const problemSites = useMemo(
    () =>
      sites
        .filter((site) => {
          const severity = severityOf.get(site.id);
          return severity === "critical" || severity === "warning";
        })
        .sort((a, b) => SEVERITY_ORDER[severityOf.get(a.id)!] - SEVERITY_ORDER[severityOf.get(b.id)!] || a.name.localeCompare(b.name, "th")),
    [sites, severityOf],
  );
  const spotlightSite = spotlightOn && selected === null && problemSites.length > 0 ? problemSites[spot % problemSites.length] : null;

  // The spotlight walks through problem sites while nobody is using the screen.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && Date.now() - lastInput.current >= IDLE_MS) setSpot((value) => value + 1);
    }, SPOTLIGHT_MS);
    return () => window.clearInterval(timer);
  }, []);

  const toggleTv = useCallback(() => setTv((value) => !value), []);

  useEffect(() => {
    if (!tv) return;
    const overflow = document.body.style.overflow;
    const siblings = [...document.body.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== root.current);
    const previousInert = siblings.map((element) => element.inert);
    siblings.forEach((element) => {
      element.inert = true;
    });
    document.body.style.overflow = "hidden";
    root.current?.focus();
    // The portal escapes transformed app containers; fixed TV mode also works without Fullscreen API permission.
    void root.current?.requestFullscreen?.().catch(() => undefined);
    return () => {
      document.body.style.overflow = overflow;
      siblings.forEach((element, index) => {
        element.inert = previousInert[index];
      });
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, [tv]);

  // Leaving full screen with the browser's own Esc also leaves TV mode.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setTv(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const touch = () => {
      lastInput.current = Date.now();
    };
    const onKey = (event: KeyboardEvent) => {
      touch();
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest("input, textarea, select, [contenteditable]")) return;
      const key = event.key.toLowerCase();
      if (event.repeat) return;
      if (key === "escape") {
        event.preventDefault();
        if (help) {
          setHelp(false);
          helpButton.current?.focus();
        } else if (selected !== null) setSelected(null);
        else if (tv) toggleTv();
        return;
      }
      if (key === "?") {
        event.preventDefault();
        setHelp((value) => !value);
        return;
      }
      if (help || selected !== null) return;
      if (key === "f") toggleTv();
      else if (key === "s") setSpotlightOn((value) => !value);
      else if (key === "r") refresh.current();
      else if (key === "1") setMetric("cpu");
      else if (key === "2") setMetric("mem");
      else if (key === "3") setMetric("disk");
      else if (key === "arrowright" || key === "arrowleft") {
        if (problemSites.length === 0) return;
        event.preventDefault();
        setSpotlightOn(true);
        setSpot((value) => (value + (key === "arrowright" ? 1 : problemSites.length - 1)) % problemSites.length);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", touch);
    window.addEventListener("pointermove", touch, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("pointermove", touch);
    };
  }, [problemSites.length, selected, tv, help, toggleTv]);

  const stale = error !== null || (lastOk !== null && now - lastOk > STALE_MS);
  const clock = new Intl.DateTimeFormat(localeFor(lang), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
  const date = new Intl.DateTimeFormat(localeFor(lang), { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(now);

  const content = (
    <div ref={root} tabIndex={-1} className={`ops-center${tv ? " ops-tv" : ""}`} data-guide="ops.screen">
      <header className="ops-top">
        <div className="ops-brand">
          <span className="ops-brand-mark" aria-hidden="true" />
          <div>
            <h1>
              <LocalizedText text={"Command Center"} />
            </h1>
            <p>
              <LocalizedText text={"Ops.subtitle"} />
            </p>
          </div>
        </div>
        <div className={`ops-live${stale ? " stale" : ""}`} role="status" title={error ?? undefined}>
          <span className="ops-live-dot" aria-hidden="true" />
          <span>{stale ? t("Ops.stale") : lastOk === null ? t("Ops.loading") : t("Ops.live")}</span>
          <span className="ops-mono">{lastOk ? `${t("Ops.updated")} ${ageText(new Date(lastOk).toISOString(), now)}` : "—"}</span>
        </div>
        <div className="ops-clock">
          <strong className="ops-mono">{clock}</strong>
          <span>{date}</span>
        </div>
        <div className="ops-controls">
          <button
            type="button"
            className={`ops-btn${spotlightOn ? " on" : ""}`}
            aria-pressed={spotlightOn}
            aria-label={t("Ops.spotlight")}
            title={t("Ops.spotlightHint")}
            onClick={() => setSpotlightOn((value) => !value)}
            data-guide="ops.spotlight"
          >
            <Icon name="eye" />
            <span>
              <LocalizedText text={"Ops.spotlight"} />
            </span>
          </button>
          <button type="button" className="ops-btn" title={t("Refresh")} aria-label={t("Refresh")} onClick={() => refresh.current()}>
            <Icon name="refresh" />
          </button>
          <button
            ref={helpButton}
            type="button"
            className="ops-btn"
            title={t("Ops.shortcuts")}
            aria-label={t("Ops.shortcuts")}
            aria-expanded={help}
            onClick={() => setHelp((value) => !value)}
            data-guide="ops.help"
          >
            ?
          </button>
          <button type="button" className={`ops-btn${tv ? " on" : ""}`} aria-pressed={tv} aria-label={t(tv ? "Ops.exitTv" : "Ops.tv")} title={t("Ops.tvHint")} onClick={toggleTv} data-guide="ops.tv">
            <Icon name={tv ? "minimize" : "maximize"} />
            <span>
              <LocalizedText text={tv ? "Ops.exitTv" : "Ops.tv"} />
            </span>
          </button>
        </div>
      </header>

      {fleet === null || center === null ? (
        <div className="ops-loading">
          {error ? (
            <>
              <p>
                <Icon name="alertTriangle" /> <LocalizedText text={"Could not load"} />
              </p>
              <p>{error}</p>
              <button type="button" className="ops-btn" onClick={() => refresh.current()}>
                <LocalizedText text={"Try again"} />
              </button>
            </>
          ) : (
            <LocalizedText text={"Ops.loading"} />
          )}
        </div>
      ) : (
        <>
          <aside className="ops-col ops-left">
            <Kpis sites={sites} agents={agents} values={history.at(-1) ?? []} previous={history.length > 1 ? history[0] : undefined} />
            <TopMachines agents={agents} samples={center.samples} metric={metric} onMetric={setMetric} />
          </aside>

          <section className="ops-map-panel ops-plant" data-guide="ops.map" aria-label={t("Ops.plantLabel")}>
            <PlantHeader sites={sites} severityOf={severityOf} incidents={openIncidents} filter={plantFilter} onFilter={setPlantFilter} />
            {stale ? (
              <p className="ops-stale-banner" role="status">
                <Icon name="alertTriangle" />
                <LocalizedText text={"Monitor.staleData"} />
              </p>
            ) : null}
            {sites.length === 0 ? (
              <div className="ops-map-empty">
                <h2>
                  <LocalizedText text={"Ops.noSites"} />
                </h2>
                <p>
                  <LocalizedText text={"Ops.noSitesHint"} />
                </p>
                <a className="ops-btn" href="#/monitor">
                  <LocalizedText text={"Ops.openInMonitor"} />
                </a>
              </div>
            ) : (
              <SiteOverview
                sites={sites}
                agents={agents}
                severityOf={severityOf}
                incidents={openIncidents}
                filter={plantFilter}
                spotlight={spotlightSite?.id ?? null}
                selected={selected}
                now={now}
                onPick={setSelected}
              />
            )}
            {spotlightSite ? (
              <SpotlightCard site={spotlightSite} severity={severityOf.get(spotlightSite.id)!} incidents={openIncidents} now={now} onOpen={() => setSelected(spotlightSite.id)} />
            ) : null}
          </section>

          <aside className="ops-col ops-right">
            <IncidentFeed incidents={incidents} now={now} onPick={setSelected} />
            <Activity agents={agents} center={center} now={now} />
          </aside>

          <Ticker incidents={openIncidents} now={now} empty={!sites.some((site) => site.isActive && site.agentCount > 0)} problems={problemSites.length > 0} stale={stale} />
        </>
      )}

      {selected !== null ? (
        <SiteDrawer
          key={selected}
          siteId={selected}
          fleetAgents={agents.filter((agent) => agent.site.id === selected)}
          severity={severityOf.get(selected) ?? "idle"}
          now={now}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {help ? (
        <ShortcutHelp
          onClose={() => {
            setHelp(false);
            helpButton.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
  return tv ? createPortal(content, document.body) : content;
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const t = useT();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
  }, []);
  return (
    <aside className="ops-help ops-panel" role="dialog" aria-label={t("Ops.shortcuts")}>
      <div className="ops-panel-head">
        <h2>{t("Ops.shortcuts")}</h2>
        <button ref={close} type="button" className="ops-btn" onClick={onClose} aria-label={t("Close")}>
          <Icon name="x" />
        </button>
      </div>
      <dl>
        {[
          ["F", "Ops.tv"],
          ["Esc", "Ops.escape"],
          ["S", "Ops.spotlight"],
          ["R", "Refresh"],
          ["← →", "Ops.stepSites"],
          ["1 / 2 / 3", "Ops.metricsHelp"],
          ["?", "Ops.shortcuts"],
        ].map(([key, label]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{t(label)}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

// ── KPIs ───────────────────────────────────────────────────────────────────

function Kpis({ sites, agents, values, previous }: { sites: FleetSite[]; agents: FleetAgent[]; values: (number | null)[]; previous?: (number | null)[] }) {
  const watched = sites.filter((site) => site.isActive && site.agentCount > 0).length;
  const labels = ["Ops.kpi.sites", "Ops.kpi.agents", "Ops.kpi.incidents", "Ops.kpi.deskHealthy", "Ops.kpi.sessions"];
  return (
    <section className="ops-panel ops-kpis" data-guide="ops.kpis">
      {labels.map((label, index) => {
        const value = values[index] ?? null;
        const before = previous?.[index];
        const delta = value !== null && before !== null && before !== undefined ? value - before : null;
        const total = index === 0 ? watched : index === 1 ? agents.length : undefined;
        const tone = index === 2 && (value ?? 0) > 0 ? "bad" : (total !== undefined && (value ?? 0) < total) || (index === 3 && value !== null && value < 100) ? "warn" : index === 4 ? "info" : "ok";
        return <Kpi key={label} label={label} value={value === null ? "—" : String(value) + (index === 3 ? "%" : "")} total={total} delta={delta} percentage={index === 3} tone={tone} />;
      })}
    </section>
  );
}

function Kpi({ label, value, total, delta, percentage, tone }: { label: string; value: string; total?: number; delta: number | null; percentage: boolean; tone: "ok" | "warn" | "bad" | "info" }) {
  const t = useT();
  return (
    <div className={`ops-kpi ${tone}`}>
      <span className="ops-kpi-label">{t(label)}</span>
      <strong className="ops-mono">
        {value}
        {total !== undefined ? <small> / {total}</small> : null}
      </strong>
      <span className="ops-kpi-trend" title={t("Ops.trendHint")}>
        <span className="ops-mono">{delta === null ? "—" : `${delta > 0 ? "↑ +" : delta < 0 ? "↓ " : "→ "}${delta}${percentage ? ` ${t("Ops.percentagePoints")}` : ""}`}</span>
        {t(delta === null ? "Ops.trendWaiting" : "Ops.trendHint")}
      </span>
    </div>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  values = values.filter(Number.isFinite);
  if (values.length < 2) return <svg className="ops-spark" viewBox="0 0 100 28" aria-hidden="true" />;
  const step = 100 / (values.length - 1);
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(26 - (Math.min(100, Math.max(0, value)) / 100) * 24).toFixed(1)}`).join(" ");
  return (
    <svg className={`ops-spark ${tone}`} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={`0,28 ${points} 100,28`} className="ops-spark-fill" />
      <polyline points={points} className="ops-spark-line" />
    </svg>
  );
}

function TopMachines({ agents, samples, metric, onMetric }: { agents: FleetAgent[]; samples: Record<string, MonitorSample[]>; metric: LoadMetric; onMetric: (metric: LoadMetric) => void }) {
  const t = useT();
  const top = topByLoad(agents, metric, TOP_COUNT);
  const metrics: { key: LoadMetric; label: string }[] = [
    { key: "cpu", label: "Monitor.cpu" },
    { key: "mem", label: "Monitor.memory" },
    { key: "disk", label: "Monitor.disk" },
  ];
  return (
    <section className="ops-panel ops-top-machines" data-guide="ops.top">
      <div className="ops-panel-head">
        <h2>
          <LocalizedText text={"Ops.topMachines"} />
        </h2>
        <div className="ops-segments" role="group" aria-label={t("Ops.metric")}>
          {metrics.map((item) => (
            <button key={item.key} type="button" aria-pressed={metric === item.key} className={metric === item.key ? "on" : ""} onClick={() => onMetric(item.key)}>
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>
      {top.length === 0 ? (
        <p className="ops-empty">
          <LocalizedText text={"Ops.noMachines"} />
        </p>
      ) : (
        <ol className="ops-machines">
          {top.map((agent) => {
            const value = loadOf(agent, metric) ?? 0;
            const tone = value >= 90 ? "bad" : value >= 75 ? "warn" : "ok";
            const history = (samples?.[String(agent.id)] ?? []).map((sample) => sample[metric]).filter((item): item is number => typeof item === "number" && Number.isFinite(item));
            return (
              <li key={agent.id} className={tone}>
                <div className="ops-machine-name">
                  <strong title={agent.name}>{agent.name}</strong>
                  <span title={agent.site.name}>{agent.site.name}</span>
                </div>
                <Sparkline values={[...history, value]} tone={tone} />
                <span className="ops-machine-value ops-mono">{Math.round(value)}%</span>
                <span className="ops-bar" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, value)}%` }} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ── site overview (SCADA-style faceplates) ─────────────────────────────────

/** The alarm summary across the top of the overview: how many sites stand in each state, and open alarms. */
type PlantFilter = SiteSeverity | "alarms";

/** Open alarms per site: the larger of the site's own count and the feed, which the API caps at 60 incidents. */
function alarmsBySite(sites: FleetSite[], incidents: CommandCenterIncident[]): Map<number, number> {
  const feed = new Map<number, number>();
  for (const incident of incidents) feed.set(incident.siteId, (feed.get(incident.siteId) ?? 0) + 1);
  return new Map(sites.map((site) => [site.id, Math.max(site.openIncidents, feed.get(site.id) ?? 0)]));
}

/**
 * The alarm summary across the top of the overview: how many sites stand in each state and how many alarms are
 * open. Each chip filters the faceplates to what it counts; pressing it again shows every site.
 */
function PlantHeader({
  sites,
  severityOf,
  incidents,
  filter,
  onFilter,
}: {
  sites: FleetSite[];
  severityOf: Map<number, SiteSeverity>;
  incidents: CommandCenterIncident[];
  filter: PlantFilter | null;
  onFilter: (filter: PlantFilter | null) => void;
}) {
  const t = useT();
  const counts: Record<PlantFilter, number> = { critical: 0, warning: 0, ok: 0, idle: 0, alarms: 0 };
  for (const site of sites) counts[severityOf.get(site.id) ?? "idle"] += 1;
  for (const value of alarmsBySite(sites, incidents).values()) counts.alarms += value;
  const chip = (key: PlantFilter, label: string, lamp: boolean) => (
    <li key={key} className={`${key}${counts[key] ? "" : " zero"}`}>
      <button
        type="button"
        aria-pressed={filter === key}
        disabled={!counts[key] && filter !== key}
        title={t(filter === key ? "Ops.filterClear" : "Ops.filterHint")}
        onClick={() => onFilter(filter === key ? null : key)}
      >
        {lamp ? <i aria-hidden="true" /> : null}
        {label}
        <strong className="ops-mono">{counts[key]}</strong>
      </button>
    </li>
  );
  return (
    <div className="ops-plant-head">
      <h2>
        <LocalizedText text={"Ops.plant"} />
        <span className="ops-mono ops-plant-count">{sites.length}</span>
      </h2>
      <ul className="ops-legend" aria-label={t("Ops.filterHint")}>
        {(["critical", "warning", "ok", "idle"] as const).map((severity) => chip(severity, t(`Ops.severity.${severity}`), true))}
        {chip("alarms", t("Ops.tile.alarms"), false)}
      </ul>
    </div>
  );
}

/** A filled share of a whole, the way an HMI bar graph shows a value against its range; empty when unknown. */
function Meter({ value, total, tone }: { value: number | null; total: number; tone?: "warn" | "bad" | null }) {
  const width = value === null || total <= 0 ? 0 : Math.max(0, Math.min(100, (value / total) * 100));
  return (
    <span className={`ops-meter${tone ? ` ${tone}` : ""}`} aria-hidden="true">
      <span style={{ width: `${width}%` }} />
    </span>
  );
}

/**
 * The station overview: a faceplate per site, worst first. Colour marks only what is abnormal (red alarm, amber
 * warning); a healthy site stays grey with a small green lamp, the way a high-performance HMI keeps the eye on trouble.
 */
function SiteOverview({
  sites,
  agents,
  severityOf,
  incidents,
  filter,
  spotlight,
  selected,
  now,
  onPick,
}: {
  sites: FleetSite[];
  agents: FleetAgent[];
  severityOf: Map<number, SiteSeverity>;
  incidents: CommandCenterIncident[];
  filter: PlantFilter | null;
  spotlight: number | null;
  selected: number | null;
  now: number;
  onPick: (siteId: number) => void;
}) {
  const t = useT();
  const ageText = useAgeText();
  const alarmsOf = alarmsBySite(sites, incidents);
  const shown = filter === null ? sites : sites.filter((site) => (filter === "alarms" ? (alarmsOf.get(site.id) ?? 0) > 0 : (severityOf.get(site.id) ?? "idle") === filter));
  const ordered = [...shown].sort((a, b) => SEVERITY_ORDER[severityOf.get(a.id) ?? "idle"] - SEVERITY_ORDER[severityOf.get(b.id) ?? "idle"] || a.name.localeCompare(b.name, "th"));
  if (ordered.length === 0)
    return (
      <p className="ops-empty">
        <LocalizedText text={"Ops.filterEmpty"} />
      </p>
    );
  return (
    <ol className="ops-tiles">
      {ordered.map((site) => {
        const severity = severityOf.get(site.id) ?? "idle";
        const alarms = alarmsOf.get(site.id) ?? 0;
        const loads = agents
          .filter((agent) => agent.site.id === site.id)
          .map((agent) => loadOf(agent, "cpu"))
          .filter((value): value is number => value !== null);
        const cpu = loads.length ? Math.round(Math.max(...loads)) : null;
        const focus = site.id === spotlight || site.id === selected;
        const pcTone = site.agentCount > 0 && site.agentsOnline < site.agentCount ? (site.agentsOnline === 0 ? "bad" : "warn") : null;
        return (
          <li key={site.id}>
            <button
              type="button"
              className={`ops-tile ${severity}${focus ? " focus" : ""}`}
              aria-label={`${site.name}: ${t(`Ops.severity.${severity}`)}`}
              aria-current={site.id === selected ? "true" : undefined}
              onClick={() => onPick(site.id)}
            >
              <span className="ops-tile-head">
                <i className="ops-lamp" aria-hidden="true" />
                <strong>{site.name}</strong>
                <span className="ops-tile-state">{t(`Ops.severity.${severity}`)}</span>
              </span>
              {site.location ? <span className="ops-tile-loc">{site.location}</span> : null}
              <span className="ops-tile-values">
                <span className="ops-tile-row">
                  <span>{t("Ops.kpi.agents")}</span>
                  <span className="ops-mono">{site.agentCount ? `${site.agentsOnline}/${site.agentCount}` : "—"}</span>
                  <Meter value={site.agentCount ? site.agentsOnline : null} total={site.agentCount} tone={pcTone} />
                </span>
                <span className="ops-tile-row">
                  <span>{t("Monitor.programsRunning")}</span>
                  <span className="ops-mono">{site.programCount ? `${site.programsRunning}/${site.programCount}` : "—"}</span>
                  <Meter value={site.programCount ? site.programsRunning : null} total={site.programCount} tone={site.programsRunning < site.programCount ? "warn" : null} />
                </span>
                <span className="ops-tile-row">
                  <span>{t("Ops.tile.cpu")}</span>
                  <span className="ops-mono">{cpu === null ? "—" : `${cpu}%`}</span>
                  <Meter value={cpu} total={100} tone={cpu === null ? null : cpu >= 90 ? "bad" : cpu >= 75 ? "warn" : null} />
                </span>
              </span>
              <span className="ops-tile-foot">
                <span className={`ops-tile-alarms${alarms ? " on" : ""}`}>
                  {t("Ops.tile.alarms")} <strong className="ops-mono">{alarms}</strong>
                </span>
                <span className="ops-mono">{site.lastSeenAt ? ageText(site.lastSeenAt, now) : "—"}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function SpotlightCard({ site, severity, incidents, now, onOpen }: { site: FleetSite; severity: SiteSeverity; incidents: CommandCenterIncident[]; now: number; onOpen: () => void }) {
  const t = useT();
  const ageText = useAgeText();
  const mine = incidents.filter((incident) => incident.siteId === site.id);
  return (
    <div className={`ops-spotlight ${severity}`} role="status" aria-live="polite">
      <span className="ops-spotlight-tag">
        <Icon name="eye" /> <LocalizedText text={"Ops.spotlight"} />
      </span>
      <h3>{site.name}</h3>
      {site.location ? <p className="ops-dim">{site.location}</p> : null}
      <p className="ops-mono">
        {t("Ops.kpi.agents")} {site.agentsOnline}/{site.agentCount} · {t("Monitor.programsRunning")} {site.programsRunning}/{site.programCount}
      </p>
      <ul>
        {mine.slice(0, 3).map((incident) => (
          <li key={incident.id} className={incidentSeverity(incident.kind)}>
            <span>{incidentSubject(incident)}</span>
            <span className="ops-mono">{ageText(incident.openedAt, now)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="ops-btn" onClick={onOpen}>
        <LocalizedText text={"Ops.openSite"} />
        <Icon name="arrowRight" />
      </button>
    </div>
  );
}

// ── incident feed, activity, ticker ────────────────────────────────────────

function IncidentFeed({ incidents, now, onPick }: { incidents: CommandCenterIncident[]; now: number; onPick: (siteId: number) => void }) {
  const t = useT();
  const ageText = useAgeText();
  return (
    <section className="ops-panel ops-feed" data-guide="ops.feed">
      <div className="ops-panel-head">
        <h2>
          <LocalizedText text={"Ops.incidents"} />
        </h2>
        <span className="ops-count ops-mono">{incidents.filter((incident) => !incident.resolvedAt).length}</span>
      </div>
      {incidents.length === 0 ? (
        <p className="ops-empty ok">
          <Icon name="checkCircle" /> <LocalizedText text={"Ops.noIncidents"} />
        </p>
      ) : (
        <ol className="ops-incidents">
          {incidents.slice(0, 24).map((incident) => {
            const severity = incident.resolvedAt ? "resolved" : incidentSeverity(incident.kind);
            return (
              <li key={incident.id} className={severity}>
                <button type="button" onClick={() => onPick(incident.siteId)}>
                  <span className="ops-sev">{t(`Ops.sev.${severity}`)}</span>
                  <span className="ops-incident-text">
                    <strong>{incident.siteName}</strong>
                    <span>
                      {incidentSubject(incident)} · {t(`Monitor.incident.${incident.kind}`)}
                    </span>
                  </span>
                  <span className="ops-mono ops-age">{incident.resolvedAt ? `✓ ${ageText(incident.resolvedAt, now)}` : ageText(incident.openedAt, now)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Activity({ agents, center, now }: { agents: FleetAgent[]; center: CommandCenterData; now: number }) {
  const t = useT();
  const ageText = useAgeText();
  const sessions = agents.filter((agent) => agent.isOnline && (agent.tmtdesk?.activeSessions ?? 0) > 0);
  return (
    <section className="ops-panel ops-activity" data-guide="ops.activity">
      <div className="ops-panel-head">
        <h2>
          <LocalizedText text={"Ops.sessions"} />
        </h2>
        <span className="ops-count ops-mono">{sessions.length}</span>
      </div>
      {sessions.length === 0 ? (
        <p className="ops-empty">
          <LocalizedText text={"Ops.noSessions"} />
        </p>
      ) : (
        <ul className="ops-list">
          {sessions.slice(0, 6).map((agent) => (
            <li key={agent.id}>
              <span className="ops-live-dot" aria-hidden="true" />
              <span>
                {agent.name} · {agent.site.name}
              </span>
              <span className="ops-mono">{agent.tmtdesk?.activeSessions}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="ops-panel-head">
        <h2>
          <LocalizedText text={"Ops.commands"} />
        </h2>
      </div>
      {center.commands.length === 0 ? (
        <p className="ops-empty">
          <LocalizedText text={"Monitor.noCommandsTitle"} />
        </p>
      ) : (
        <ul className="ops-list">
          {center.commands.slice(0, 6).map((command) => (
            <li key={command.id} className={command.status === "Failed" || command.status === "Expired" ? "bad" : command.status === "Succeeded" ? "ok" : "info"}>
              <span className="ops-tag">{t(`Monitor.verb.${command.verb}`)}</span>
              <span title={command.resultMessage ?? undefined}>
                {command.subject} · {command.siteName}
              </span>
              <span className="ops-mono">{ageText(command.requestedAt, now)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="ops-panel-head">
        <h2>
          <LocalizedText text={"Script.jobs"} />
        </h2>
      </div>
      {center.jobs.length === 0 ? (
        <p className="ops-empty">
          <LocalizedText text={"Script.noJobsTitle"} />
        </p>
      ) : (
        <ul className="ops-list">
          {center.jobs.slice(0, 5).map((job) => (
            <li key={job.id} className={job.status === "Running" ? "info" : job.status === "PendingApproval" ? "warn" : job.counts.failed > 0 ? "bad" : "ok"}>
              <span className="ops-tag">{t(`Script.status.${job.status}`)}</span>
              <span>{job.title}</span>
              <span className="ops-mono">
                {job.counts.succeeded}/{job.counts.targets}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Ticker({ incidents, now, empty, problems, stale }: { incidents: CommandCenterIncident[]; now: number; empty: boolean; problems: boolean; stale: boolean }) {
  const t = useT();
  const ageText = useAgeText();
  if (incidents.length === 0) {
    return (
      <footer className="ops-ticker calm">
        <span className="ops-live-dot" aria-hidden="true" />
        <LocalizedText text={stale ? "Ops.stale" : empty ? "Ops.noMachines" : problems ? "Ops.attention" : "Ops.allClear"} />
      </footer>
    );
  }
  const items = incidents.map((incident) => (
    <span key={incident.id} className={`ops-ticker-item ${incidentSeverity(incident.kind)}`}>
      ▲ {incident.siteName} — {incidentSubject(incident)} · {t(`Monitor.incident.${incident.kind}`)} · {ageText(incident.openedAt, now)}
    </span>
  ));
  return (
    <footer className="ops-ticker" aria-label={t("Ops.incidents")}>
      <div className="ops-ticker-track">
        {items}
        <span aria-hidden="true" className="ops-ticker-copy">
          {items}
        </span>
      </div>
    </footer>
  );
}

// ── site detail slide-in ───────────────────────────────────────────────────

function SiteDrawer({ siteId, fleetAgents, severity, now, onClose }: { siteId: number; fleetAgents: FleetAgent[]; severity: SiteSeverity; now: number; onClose: () => void }) {
  const t = useT();
  const ageText = useAgeText();
  const [detail, setDetail] = useState<MonitorSiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useRef<() => void>(() => {});
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    const poll = createMonitorPoll(async () => {
      try {
        const result = await getMonitorSite(siteId);
        if (active) {
          setDetail(result);
          setError(null);
        }
      } catch (reason) {
        if (active) setError(errorText(reason));
        throw reason;
      }
    }, REFRESH_MS);
    refresh.current = poll.refresh;
    return () => {
      active = false;
      poll.stop();
    };
  }, [siteId]);

  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    return () => {
      if (previous instanceof HTMLElement || previous instanceof SVGElement) previous.focus();
    };
  }, []);

  const site = detail?.site.id === siteId ? detail.site : null;
  const open = detail?.incidents.filter((incident) => !incident.resolvedAt) ?? [];
  return (
    <aside className={`ops-drawer ${severity}`} role="dialog" aria-modal="false" aria-label={site?.name ?? t("Ops.siteDetail")}>
      <header>
        <div>
          <span className="ops-spotlight-tag">{t(`Ops.severity.${severity}`)}</span>
          <h2>{site?.name ?? "…"}</h2>
          {site?.location ? <p className="ops-dim">{site.location}</p> : null}
        </div>
        <button ref={close} type="button" className="ops-btn" onClick={onClose} aria-label={t("Close")}>
          <Icon name="x" />
        </button>
      </header>
      {error ? (
        <div className="ops-drawer-error" role="status">
          <p>
            <LocalizedText text={detail ? "Monitor.staleData" : "Could not load"} />
          </p>
          <p>{error}</p>
          <button type="button" className="ops-btn" onClick={() => refresh.current()}>
            <LocalizedText text={"Try again"} />
          </button>
        </div>
      ) : null}
      {!detail || !site ? (
        !error ? (
          <p className="ops-empty">
            <LocalizedText text={"Ops.loading"} />
          </p>
        ) : null
      ) : (
        <div className="ops-drawer-body">
          <p className="ops-dim">
            {t("Monitor.lastReport")}: {ageText(site.lastSeenAt, now)}
          </p>
          {open.length > 0 ? (
            <section>
              <h3>
                <LocalizedText text={"Monitor.openProblems"} />
              </h3>
              <ul className="ops-incidents compact">
                {open.map((incident) => (
                  <li key={incident.id} className={incidentSeverity(incident.kind)}>
                    <span className="ops-sev">{t(`Ops.sev.${incidentSeverity(incident.kind)}`)}</span>
                    <span className="ops-incident-text">
                      <strong>{incident.kind === "ProgramStopped" ? incident.programName : incident.agentName}</strong>
                      <span>
                        {t(`Monitor.incident.${incident.kind}`)}
                        {incident.acknowledgedBy ? ` · ${t("Monitor.acknowledgedBy")} ${incident.acknowledgedBy}` : ""}
                      </span>
                    </span>
                    <span className="ops-mono ops-age">{ageText(incident.openedAt, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="ops-empty ok">
              <LocalizedText text={"Ops.noOpenIncidents"} />
            </p>
          )}
          <section>
            <h3>
              <LocalizedText text={"Monitor.machines"} />
            </h3>
            {detail.agents.length === 0 ? (
              <p className="ops-empty">
                <LocalizedText text={"Ops.noMachines"} />
              </p>
            ) : null}
            <ul className="ops-agents">
              {detail.agents.map((agent) => {
                const fleetAgent = fleetAgents.find((item) => item.id === agent.id);
                const problems = fleetAgent ? agentProblems(fleetAgent, now) : [];
                return (
                  <li key={agent.id} className={!agent.isOnline ? "bad" : problems.length > 0 ? "warn" : "ok"}>
                    <div className="ops-agent-head">
                      <strong>{agent.name}</strong>
                      <span className="ops-dim">{agent.machineName ?? ""}</span>
                      {agent.tmtdeskId ? (
                        <a className="ops-btn" href={tmtdeskLink(agent)} title={`${t("Monitor.remoteHint")} · TMTDesk ${tmtdeskIdText(agent.tmtdeskId)}`}>
                          <Icon name="externalLink" />
                          <span>
                            <LocalizedText text={"Monitor.remote"} />
                          </span>
                        </a>
                      ) : null}
                    </div>
                    <div className="ops-agent-stats ops-mono">
                      <Badge tone={agent.isOnline ? "green" : "red"} dot>
                        {agent.isOnline ? "Monitor.online" : "Monitor.offline"}
                      </Badge>
                      <span>
                        {t("Monitor.cpu")} {agent.isOnline && percent(agent.host.cpuPercent) !== null ? `${percent(agent.host.cpuPercent)}%` : "—"}
                      </span>
                      {fleetAgent
                        ? (["mem", "disk"] as const).map((metric) => (
                            <span key={metric}>
                              {t(metric === "mem" ? "Monitor.memory" : "Monitor.disk")} {loadOf(fleetAgent, metric) === null ? "—" : `${loadOf(fleetAgent, metric)}%`}
                            </span>
                          ))
                        : null}
                    </div>
                    <span className="ops-dim" title={agent.lastSeenAt ?? undefined}>
                      {t("Monitor.lastReport")}: {ageText(agent.lastSeenAt, now)}
                    </span>
                    <TmtdeskChip agent={agent} />
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <h3>
              <LocalizedText text={"Monitor.programs"} />
            </h3>
            {detail.programs.length === 0 ? (
              <p className="ops-empty">
                <LocalizedText text={"Ops.noPrograms"} />
              </p>
            ) : null}
            <ul className="ops-list">
              {detail.programs.map((program) => {
                const agent = detail.agents.find((item) => item.id === program.agentId);
                return (
                  <li key={program.id} className={!agent?.isOnline ? "warn" : program.isRunning ? "ok" : "bad"}>
                    <span className="ops-tag">{t(!agent?.isOnline ? "Monitor.offline" : program.isRunning ? "Monitor.state.running" : "Monitor.state.stopped")}</span>
                    <span title={`${agent?.name ?? ""} · ${ageText(program.reportedAt, now)}`}>
                      {program.name} · {agent?.name}
                    </span>
                    <span className="ops-mono">{agent?.isOnline && program.isRunning && percent(program.cpuPercent) !== null ? `${percent(program.cpuPercent)}%` : "—"}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <a className="ops-btn wide" href={`#/site-monitor?site=${siteId}`}>
            <LocalizedText text={"Ops.openInMonitor"} />
            <Icon name="arrowRight" />
          </a>
        </div>
      )}
    </aside>
  );
}
