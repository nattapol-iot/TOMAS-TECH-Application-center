"use client";

/* ==========================================================================
   Shared interface primitives — icons, badges, panels, tables, drawers,
   modals and the small SVG charts used by the dashboard and the reports.
   ========================================================================== */

import { useEffect, useId, useRef, useState } from "react";

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
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  minus: <line x1="5" y1="12" x2="19" y2="12" />,
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

const TONE_BY_STATUS: Record<string, Tone> = {
  Approved: "green", Locked: "green", Completed: "green", Reviewed: "green", Valid: "green",
  "Estimate Completed": "green", "Price Updated": "green", Received: "green", Active: "blue",
  "Engineering Review": "violet", "Engineering Input": "blue", Estimating: "blue", "In Progress": "blue",
  Draft: "slate", New: "slate", "Not Started": "slate", "Not Requested": "slate", Superseded: "slate",
  "Waiting Supplier Price": "amber", "Waiting Supplier": "amber", "Waiting Information": "amber",
  Requested: "amber", Expiring: "amber", Hold: "amber",
  "Revision Required": "red", Overdue: "red", Expired: "red", Cancelled: "red", Rejected: "red",
};

export const toneOf = (status: string): Tone => TONE_BY_STATUS[status] ?? "slate";

export function Badge({ children, tone, dot }: { children: React.ReactNode; tone?: Tone; dot?: boolean }) {
  const resolved = tone ?? toneOf(String(children));
  return <span className={`badge ${resolved}`}>{dot ? <i className="badge-dot" /> : null}{children}</span>;
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
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
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
  return (
    <section className={`panel${className ? ` ${className}` : ""}`}>
      {title ? (
        <div className="panel-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
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
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`kpi ${tone}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <span className="kpi-icon"><Icon name={icon} /></span>
      <span className="kpi-body">
        <span className="kpi-label">{label}</span>
        <strong className="kpi-value">{value}</strong>
        {note ? <span className="kpi-note">{note}</span> : null}
      </span>
    </Tag>
  );
}

export function SummaryTile({ label, value, note, strong, tone }: { label: string; value: string; note?: string; strong?: boolean; tone?: Tone }) {
  return (
    <div className={`summary-tile${strong ? " strong" : ""}${tone ? ` ${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <em>{note}</em> : null}
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
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" type="button" aria-selected={active === tab.id}
          className={active === tab.id ? "tab active" : "tab"} onClick={() => onChange(tab.id)}>
          {tab.label}
          {tab.count !== undefined ? <em>{tab.count}</em> : null}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search-field">
      <Icon name="search" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value ? <button type="button" onClick={() => onChange("")} aria-label="Clear search"><Icon name="x" /></button> : null}
    </label>
  );
}

export function Select({ label, value, options, onChange, width }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; width?: number;
}) {
  return (
    <label className="select-field" style={width ? { width } : undefined}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <Icon name="chevronDown" />
    </label>
  );
}

export function Field({ label, children, hint, span }: { label: string; children: React.ReactNode; hint?: string; span?: 2 | 3 | 4 }) {
  return (
    <div className={`field${span ? ` span-${span}` : ""}`}>
      <label>{label}</label>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} /></span>
      <strong>{title}</strong>
      <p>{message}</p>
      {action}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Overlays
   -------------------------------------------------------------------------- */

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
}

export function Modal({ title, subtitle, onClose, children, footer, size = "md" }: {
  title: string; subtitle?: string; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  useEscape(onClose);
  const labelId = useId();
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby={labelId}>
      <button type="button" className="overlay-backdrop" aria-label="Close dialog" onClick={onClose} />
      <div className={`modal ${size}`}>
        <header className="overlay-head">
          <div>
            <h2 id={labelId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
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
  useEscape(onClose);
  const labelId = useId();
  return (
    <div className="overlay drawer-overlay" role="dialog" aria-modal="true" aria-labelledby={labelId}>
      <button type="button" className="overlay-backdrop" aria-label="Close drawer" onClick={onClose} />
      <aside className="drawer" style={{ width }}>
        <header className="overlay-head">
          <div>
            <h2 id={labelId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="overlay-body">{children}</div>
        {footer ? <footer className="overlay-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function Menu({ label, items }: { label: string; items: { label: string; icon?: IconName; onClick?: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        {label}<Icon name="chevronDown" />
      </button>
      {open ? (
        <div className="menu" role="menu">
          {items.map((item) => (
            <button key={item.label} role="menuitem" type="button" onClick={() => { setOpen(false); item.onClick?.(); }}>
              {item.icon ? <Icon name={item.icon} /> : null}{item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Charts — small hand-drawn SVG so no chart library ships to the browser.
   -------------------------------------------------------------------------- */

const SERIES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)"];

export function BarChart({ data, unit = "", height = 168 }: { data: { label: string; value: number }[]; unit?: string; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bar-chart" style={{ height }}>
      {data.map((d, index) => (
        <div className="bar-col" key={d.label} title={`${d.label}: ${d.value}${unit}`}>
          <span className="bar-value">{d.value}{unit}</span>
          <div className="bar-track">
            <b style={{ height: `${(d.value / max) * 100}%`, background: SERIES[index % SERIES.length] }} />
          </div>
          <span className="bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function HBarList({ data, format }: { data: { label: string; value: number; note?: string }[]; format?: (value: number) => string }) {
  // Bars are drawn as a share of the total so the bar width and the printed
  // percentage always tell the same story.
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  return (
    <ul className="hbar-list">
      {data.map((d, index) => (
        <li key={d.label}>
          <div className="hbar-top">
            <span>{d.label}</span>
            <strong>{format ? format(d.value) : d.value}<em>{Math.round((d.value / total) * 100)}%</em></strong>
          </div>
          <div className="hbar-track"><b style={{ width: `${(d.value / total) * 100}%`, background: SERIES[index % SERIES.length] }} /></div>
          {d.note ? <small>{d.note}</small> : null}
        </li>
      ))}
    </ul>
  );
}

export function Donut({ data, centerLabel, centerValue, format }: {
  data: { label: string; value: number }[]; centerLabel: string; centerValue: string; format?: (v: number) => string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashes = data.map((d) => (d.value / total) * circumference);
  const offsets = dashes.map((_, index) => dashes.slice(0, index).reduce((sum, dash) => sum + dash, 0));
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${centerLabel} ${centerValue}`}>
        <g transform="translate(70,70) rotate(-90)">
          {data.map((d, index) => (
            <circle key={d.label} r={radius} fill="none" strokeWidth="18"
              stroke={SERIES[index % SERIES.length]}
              strokeDasharray={`${dashes[index]} ${circumference - dashes[index]}`}
              strokeDashoffset={-offsets[index]} />
          ))}
        </g>
        <text x="70" y="64" textAnchor="middle" className="donut-value">{centerValue}</text>
        <text x="70" y="82" textAnchor="middle" className="donut-label">{centerLabel}</text>
      </svg>
      <ul className="donut-legend">
        {data.map((d, index) => (
          <li key={d.label}>
            <i style={{ background: SERIES[index % SERIES.length] }} />
            <span>{d.label}</span>
            <strong>{format ? format(d.value) : d.value}</strong>
            <em>{Math.round((d.value / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LineChart({ points, format }: { points: { label: string; value: number }[]; format?: (v: number) => string }) {
  const width = 1000;
  const height = 240;
  const padding = { top: 24, right: 48, bottom: 30, left: 56 };
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const x = (index: number) => padding.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => padding.top + innerH - ((value - min + span * 0.15) / (span * 1.3)) * innerH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${padding.top + innerH} L${x(0).toFixed(1)},${padding.top + innerH} Z`;

  return (
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price trend">
      {[0, 0.5, 1].map((ratio) => (
        <line key={ratio} x1={padding.left} x2={width - padding.right}
          y1={padding.top + innerH * ratio} y2={padding.top + innerH * ratio} className="grid-line" />
      ))}
      <path d={area} className="line-area" />
      <path d={path} className="line-path" />
      {points.map((p, i) => {
        // Keep the first and last labels inside the viewBox instead of letting
        // them hang past the edge and get clipped.
        const anchor = i === 0 ? "start" : i === points.length - 1 ? "end" : "middle";
        return (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.value)} r="4.5" className="line-dot" />
            <text x={x(i)} y={y(p.value) - 12} textAnchor={anchor} className="line-value">{format ? format(p.value) : p.value}</text>
            <text x={x(i)} y={height - 8} textAnchor={anchor} className="line-label">{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = values.map((value, index) => {
    const x = (index / (values.length - 1 || 1)) * 60;
    const y = 20 - ((value - min) / span) * 16;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg className={`sparkline ${rising ? "up" : "down"}`} viewBox="0 0 60 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3200);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  return <div className="toast" role="status"><Icon name="checkCircle" />{message}</div>;
}
