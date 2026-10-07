"use client";

/* ==========================================================================
   Shared interface primitives — icons, badges, panels, tables, drawers,
   modals and the small SVG charts used by the dashboard and the reports.
   ========================================================================== */

import { useEffect, useId, useRef } from "react";
import { useT } from "./i18n";

/* --------------------------------------------------------------------------
   Icons — inline so glyphs render identically on every workstation.
   -------------------------------------------------------------------------- */

const PATHS = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  quote: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15h6" /><path d="M9 11h2" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></>,
  settings: <><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>,
  search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  chevronDown: <polyline points="6 9 12 15 18 9" />,
  chevronRight: <polyline points="9 18 15 12 9 6" />,
  chevronLeft: <polyline points="15 18 9 12 15 6" />,
  arrowRight: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
  arrowLeft: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
  externalLink: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  minus: <line x1="5" y1="12" x2="19" y2="12" />,
  maximize: <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>,
  minimize: <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
  filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
  check: <polyline points="20 6 9 17 4 12" />,
  checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  alertTriangle: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  alertCircle: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
  x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>,
  edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  more: <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
  paperclip: <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  refresh: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
  truck: <><rect x="1" y="3" width="15" height="13" rx="1" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
  layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
  package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></>,
  send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
  gitBranch: <><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></>,
  compare: <><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" /><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" /><line x1="12" y1="2" x2="12" y2="22" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  table: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></>,
  play: <polygon points="5 3 19 12 5 21 5 3" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon${className ? ` ${className}` : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/* --------------------------------------------------------------------------
   Status vocabulary
   -------------------------------------------------------------------------- */

export type Tone = "green" | "amber" | "red" | "blue" | "slate" | "violet";

/**
 * One status, one colour, everywhere — grids, legends, drawers and dashboards
 * all resolve through toneOf(), so a status cannot look like one thing on one
 * screen and something else on another.
 *
 * The scheme reads as: slate = not started or frozen · blue = someone is
 * working on it · violet = under review · amber = waiting on somebody else ·
 * green = accepted · red = needs action or has failed.
 *
 * Green is reserved for a single meaning: this was accepted. "Estimate
 * Completed" is mid-workflow (the engineer is done, review has not happened) so
 * it is blue, and "Locked" is a frozen end state rather than an approval, so it
 * is slate. Three greens in one legend told the reader nothing.
 */
const TONE_BY_STATUS: Record<string, Tone> = {
  Approved: "green", Completed: "green", Reviewed: "green", Valid: "green",
  "Price Updated": "green", Received: "green",
  "Estimate Completed": "blue", Active: "blue", "Engineering Input": "blue",
  Estimating: "blue", "In Progress": "blue",
  "Engineering Review": "violet",
  Draft: "slate", New: "slate", "Not Started": "slate", "Not Requested": "slate",
  Superseded: "slate", Locked: "slate",
  "Waiting Supplier Price": "amber", "Waiting Supplier": "amber", "Waiting Information": "amber",
  Requested: "amber", Expiring: "amber", Hold: "amber",
  "Revision Required": "red", Overdue: "red", Expired: "red", Cancelled: "red", Rejected: "red",

  // Project lifecycle.
  Planning: "slate", Closed: "slate",
  Design: "blue", Development: "blue", Installation: "blue",
  Commissioning: "violet",
  Handover: "green",
  "On Hold": "amber",

  // Task and schedule.
  Open: "slate", Blocked: "red", Done: "green",

  // Knowledge Hub documents. Draft is deliberately the same slate as every other
  // Draft in the product; it was violet here only because this module carried a
  // private colour map.
  "In Review": "violet", "Pending Approval": "violet",
  "Request Changes": "red",
  Published: "green", Final: "green",
  "Review Due": "amber",
  Shared: "blue", Editing: "blue",
  Archived: "slate",

  // Sales intake and site visit. The same scheme as everywhere else: slate =
  // not started or frozen · blue = somebody is working on it · violet = under
  // review · amber = waiting on somebody else · green = accepted · red = needs
  // action or has failed. "Confirmed" is green because both parties accepted
  // the appointment; "Tentative" is slate because nobody has yet.
  "Pending Technical Review": "violet",
  "More Information Required": "red",
  "Ready to Schedule": "blue", Scheduled: "blue",
  Tentative: "slate",
  "Pending Engineer Confirmation": "amber", "Pending Customer Confirmation": "amber",
  Confirmed: "green",
  "Report Pending": "amber", "Report Under Review": "violet",
  "Reschedule Requested": "amber", "Customer No-show": "red",
  // Assignment responses.
  Proposed: "slate", Accepted: "green", Declined: "red",
  "Information Requested": "amber", "New Time Proposed": "amber", Withdrawn: "slate",
  // Site visit report.
  Submitted: "violet", "Revision Requested": "red", Acknowledged: "green",
};

export const toneOf = (status: string): Tone => TONE_BY_STATUS[status] ?? "slate";

export function Badge({ children, tone, dot }: { children: React.ReactNode; tone?: Tone; dot?: boolean }) {
  const t = useT();
  const resolved = tone ?? toneOf(String(children));
  const label = typeof children === "string" ? t(children) : children;
  return <span className={`badge ${resolved}`}>{dot ? <i className="badge-dot" /> : null}{label}</span>;
}

export function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Avatar({ initials, name, size = "sm" }: { initials: string; name?: string; size?: "sm" | "md" }) {
  return <span className={`avatar ${size}`} title={name} aria-hidden={!name}>{initials}</span>;
}

export function Person({ initials, name }: { initials: string; name: string }) {
  return <span className="person"><Avatar initials={initials} />{name}</span>;
}

/* --------------------------------------------------------------------------
   Layout blocks
   -------------------------------------------------------------------------- */

export function PageHeader({ eyebrow, title, subtitle, actions, meta }: {
  eyebrow?: string; title: string; subtitle?: string;
  actions?: React.ReactNode; meta?: React.ReactNode;
}) {
  const t = useT();
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow ? <p className="eyebrow">{t(eyebrow)}</p> : null}
        <h1>{t(title)}</h1>
        {subtitle ? <p className="page-sub">{t(subtitle)}</p> : null}
        {meta ? <div className="page-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, subtitle, actions, children, flush, className }: {
  title?: string; subtitle?: string; actions?: React.ReactNode;
  children: React.ReactNode; flush?: boolean; className?: string;
}) {
  const t = useT();
  return (
    <section className={`panel${className ? ` ${className}` : ""}`}>
      {title ? (
        <div className="panel-head">
          <div>
            <h2>{t(title)}</h2>
            {subtitle ? <p>{t(subtitle)}</p> : null}
          </div>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "panel-body flush" : "panel-body"}>{children}</div>
    </section>
  );
}

export function KpiCard({ label, value, note, tone = "slate", icon, onClick }: {
  label: string; value: string | number; note?: string; tone?: Tone; icon: IconName; onClick?: () => void;
}) {
  const t = useT();
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`kpi ${tone}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <span className="kpi-icon"><Icon name={icon} /></span>
      <span className="kpi-body">
        <span className="kpi-label">{t(label)}</span>
        <strong className="kpi-value">{value}</strong>
        {note ? <span className="kpi-note">{t(note)}</span> : null}
      </span>
    </Tag>
  );
}

export function SummaryTile({ label, value, note, strong, tone }: { label: string; value: string; note?: string; strong?: boolean; tone?: Tone }) {
  const t = useT();
  return (
    <div className={`summary-tile${strong ? " strong" : ""}${tone ? ` ${tone}` : ""}`}>
      <span>{t(label)}</span>
      <strong>{value}</strong>
      {note ? <em>{t(note)}</em> : null}
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone?: Tone }) {
  const resolved = tone ?? (value >= 100 ? "green" : value >= 60 ? "blue" : value > 0 ? "amber" : "slate");
  return (
    <span className="progress" role="img" aria-label={`${value}%`}>
      <b className={resolved} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

export function ProgressCell({ value }: { value: number }) {
  return (
    <div className="progress-cell">
      <Progress value={value} />
      <span>{value}%</span>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string; count?: number }[]; active: T; onChange: (id: T) => void;
}) {
  const t = useT();
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" type="button" aria-selected={active === tab.id}
          className={active === tab.id ? "tab active" : "tab"} onClick={() => onChange(tab.id)}>
          {t(tab.label)}
          {tab.count !== undefined ? <em>{tab.count}</em> : null}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Filter overviews — a distribution belongs in one bar, not one card per
   value, and every segment or chip is also the filter it names. Labels are
   dictionary keys: both components translate them. Styles live in
   app/system/segment-filters.css.
   -------------------------------------------------------------------------- */

export type FilterItem = {
  key: string; label: string; value: number; tone: Tone;
  /** A chart token such as var(--c2), for a ramp the six tones cannot draw; it overrides the tone in SegmentBar. */
  color?: string;
};

/** A stacked bar with a legend; picking the active segment again clears the filter. */
export function SegmentBar({ items, active, onPick, lead, label }: {
  items: FilterItem[]; active: string | null; onPick: (key: string | null) => void;
  /** Shown before the bar, e.g. the total it describes. */
  lead?: React.ReactNode;
  /** Accessible name of the group; a dictionary key. */
  label?: string;
}) {
  const t = useT();
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const pick = (key: string) => onPick(active === key ? null : key);
  return (
    <div className="segment-bar" role="group" aria-label={label ? t(label) : undefined}>
      {lead ? <div className="segment-bar-lead">{lead}</div> : null}
      <div className="segment-bar-track">
        {total ? items.filter((item) => item.value > 0).map((item) => (
          <button key={item.key} type="button" style={{ flexGrow: item.value, ...(item.color ? { background: item.color } : {}) }} aria-pressed={active === item.key}
            className={`segment-bar-seg ${item.tone}${active === item.key ? " active" : ""}`}
            title={`${t(item.label)} · ${item.value}`} aria-label={`${t(item.label)} ${item.value}`} onClick={() => pick(item.key)} />
        )) : <span className="segment-bar-empty" />}
      </div>
      <ul className="segment-bar-legend">
        {items.map((item) => (
          <li key={item.key}>
            <button type="button" aria-pressed={active === item.key} className={active === item.key ? "active" : ""} onClick={() => pick(item.key)}>
              <i aria-hidden="true" className={`segment-bar-dot ${item.tone}`} style={item.color ? { background: item.color } : undefined} />{t(item.label)}<strong>{item.value}</strong>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Counted shortcuts; a chip with nothing behind it is disabled unless it is the active filter. */
export function FilterChips({ items, active, onPick, label }: {
  items: FilterItem[]; active: string | null; onPick: (key: string | null) => void; label?: string;
}) {
  const t = useT();
  return (
    <ul className="filter-chips" aria-label={label ? t(label) : undefined}>
      {items.map((item) => (
        <li key={item.key}>
          <button type="button" aria-pressed={active === item.key} disabled={item.value === 0 && active !== item.key}
            className={`filter-chip ${item.tone}${active === item.key ? " active" : ""}`} onClick={() => onPick(active === item.key ? null : item.key)}>
            <span>{t(item.label)}</span><strong>{item.value}</strong>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const t = useT();
  return (
    <label className="search-field">
      <Icon name="search" />
      <input value={value} maxLength={200} onChange={(e) => onChange(e.target.value)} placeholder={t(placeholder)} />
      {value ? <button type="button" onClick={() => onChange("")} aria-label={t("Clear search")}><Icon name="x" /></button> : null}
    </label>
  );
}

export function Select({ label, value, options, onChange, width }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; width?: number;
}) {
  const t = useT();
  return (
    <label className="select-field" style={width ? { width } : undefined}>
      <span className="sr-only">{t(label)}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t(label)}>
        {options.map((option) => <option key={option} value={option}>{t(option)}</option>)}
      </select>
      <Icon name="chevronDown" />
    </label>
  );
}

export function Field({ label, children, hint, span }: { label: string; children: React.ReactNode; hint?: string; span?: 2 | 3 | 4 }) {
  const t = useT();
  return (
    <div className={`field${span ? ` span-${span}` : ""}`}>
      <label>{t(label)}</label>
      {children}
      {hint ? <small>{t(hint)}</small> : null}
    </div>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message: string; action?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} /></span>
      <strong>{t(title)}</strong>
      <p>{t(message)}</p>
      {action}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Overlays
   -------------------------------------------------------------------------- */

/*
 * Overlays stack (a Modal opened from the Plan's task drawer): Escape closes only the one on top, and
 * a key handler that already handled Escape (event.preventDefault) closes nothing. Focus moves to the
 * overlay's close button when it opens and returns to where it was when it closes.
 */
const overlayStack: symbol[] = [];
function useOverlay(onClose: () => void) {
  const token = useRef<symbol | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const own = Symbol("overlay");
    token.current = own;
    overlayStack.push(own);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    return () => {
      const index = overlayStack.indexOf(own);
      if (index >= 0) overlayStack.splice(index, 1);
      if (previous && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && overlayStack[overlayStack.length - 1] === token.current) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return closeButton;
}

export function Modal({ title, subtitle, onClose, children, footer, size = "md" }: {
  title: string; subtitle?: string; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl" | "wide" | "full";
}) {
  const t = useT();
  const closeButton = useOverlay(onClose);
  const labelId = useId();
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby={labelId}>
      <button type="button" className="overlay-backdrop" aria-label={t("Close dialog")} onClick={onClose} />
      <div className={`modal ${size}`}>
        <header className="overlay-head">
          <div>
            <h2 id={labelId}>{t(title)}</h2>
            {subtitle ? <p>{t(subtitle)}</p> : null}
          </div>
          <button ref={closeButton} type="button" className="icon-btn" onClick={onClose} aria-label={t("Close")}><Icon name="x" /></button>
        </header>
        <div className="overlay-body">{children}</div>
        {footer ? <footer className="overlay-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Drawer({ title, subtitle, onClose, children, footer, width = 520 }: {
  title: string; subtitle?: string; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; width?: number;
}) {
  const t = useT();
  const closeButton = useOverlay(onClose);
  const labelId = useId();
  return (
    <div className="overlay drawer-overlay" role="dialog" aria-modal="true" aria-labelledby={labelId}>
      <button type="button" className="overlay-backdrop" aria-label={t("Close drawer")} onClick={onClose} />
      <aside className="drawer" style={{ width }}>
        <header className="overlay-head">
          <div>
            <h2 id={labelId}>{t(title)}</h2>
            {subtitle ? <p>{t(subtitle)}</p> : null}
          </div>
          <button ref={closeButton} type="button" className="icon-btn" onClick={onClose} aria-label={t("Close")}><Icon name="x" /></button>
        </header>
        <div className="overlay-body">{children}</div>
        {footer ? <footer className="overlay-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Charts — small hand-drawn SVG so no chart library ships to the browser.
   -------------------------------------------------------------------------- */

const SERIES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)"];

export function BarChart({ data, unit = "", height = 168 }: { data: { label: string; value: number }[]; unit?: string; height?: number }) {
  const t = useT();
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bar-chart" style={{ height }}>
      {data.map((d, index) => (
        <div className="bar-col" key={d.label} title={`${t(d.label)}: ${d.value}${unit}`}>
          <span className="bar-value">{d.value}{unit}</span>
          <div className="bar-track">
            <b style={{ height: `${(d.value / max) * 100}%`, background: SERIES[index % SERIES.length] }} />
          </div>
          <span className="bar-label">{t(d.label)}</span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const t = useT();
  useEffect(() => {
    const timer = setTimeout(onDone, 3200);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  return <div className="toast" role="status"><Icon name="checkCircle" />{t(message)}</div>;
}

/**
 * Status colour legend, shown above a grid.
 *
 * The legend renders the very same <Badge> the grid rows render, so its colours
 * are derived from toneOf() rather than declared separately. They previously
 * were: the legend carried its own `kind` vocabulary with its own hex values,
 * and four of six colours disagreed with the badges they were explaining —
 * Draft was even a different colour on two screens. A legend that can disagree
 * with the thing it describes is worse than no legend, so the only way to keep
 * them honest is to give them one source.
 *
 * `kind` is accepted and ignored, so existing callers keep working. Pass the
 * raw English status: Badge translates it and looks up its tone.
 */
export function StatusLegend({ items }: { items: { label: string; kind?: string }[] }) {
  const t = useT();
  return (
    <div className="status-legend">
      <strong>{t("INFO Status Color:")}</strong>
      {items.map((item) => <Badge key={item.label}>{item.label}</Badge>)}
    </div>
  );
}

/** "Show N entries" plus a grid search box, the template grid header. */
export function GridControls({ pageSize, onPageSize, search, onSearch, right, hideSearch = false }: {
  pageSize: number;
  onPageSize: (value: number) => void;
  search: string;
  onSearch: (value: string) => void;
  right?: React.ReactNode;
  hideSearch?: boolean;
}) {
  const t = useT();
  return (
    <div className="grid-controls">
      <span>{t("Show")}</span>
      <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} aria-label={t("Rows per page")}>
        {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
      <span>{t("entries")}</span>
      {right}
      <span className="spacer" />
      {!hideSearch && <SearchInput value={search} onChange={onSearch} placeholder={t("Search in this grid…")} />}
    </div>
  );
}

/** Standard table-size selector used above every paginated data grid. */
export function TablePageSize({ value, onChange }: {
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useT();
  return (
    <div className="grid-controls table-page-size">
      <span>{t("Show")}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={t("Rows per page")}>
        {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
      <span>{t("entries")}</span>
    </div>
  );
}

/** Page numbers with an ellipsis once the list gets long. */
function pageNumbers(current: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pageCount - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < pageCount - 1) pages.push("…");
  pages.push(pageCount);
  return pages;
}

export function Pagination({ page, pageCount, from, to, total, onPage }: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useT();
  return (
    <div className="pagination">
      <span className="pagination-info">
        {t("Showing")} <strong>{from}</strong> {t("to")} <strong>{to}</strong> {t("of")} <strong>{total}</strong> {t("entries")}
      </span>
      <span className="spacer" />
      <nav className="pager" aria-label={t("Page")}>
        <button type="button" className="pager-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon name="chevronLeft" />{t("Previous")}
        </button>
        {pageNumbers(page, pageCount).map((entry, index) => (entry === "…"
          ? <span className="pager-gap" key={`gap-${index}`}>…</span>
          : (
            <button
              key={entry}
              type="button"
              className={entry === page ? "pager-btn page active" : "pager-btn page"}
              aria-current={entry === page ? "page" : undefined}
              onClick={() => onPage(entry)}
            >
              {entry}
            </button>
          )))}
        <button type="button" className="pager-btn" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          {t("Next")}<Icon name="chevronRight" />
        </button>
      </nav>
    </div>
  );
}
