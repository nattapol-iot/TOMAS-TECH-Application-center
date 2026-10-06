"use client";
/* The shared Gantt for the Projects screens: the portfolio timeline (one row per project, expanding
   into its plan) and a project's Plan tab draw with this one component and lib/gantt.ts, so a bar
   means the same thing everywhere. Bars are buttons that open the row; the chart fits its container. */

import { type ReactNode } from "react";
import { GANTT_ZOOMS, ganttPoint, ganttSlip, ganttSpan, type GanttWindow, type GanttZoom } from "../../../lib/gantt";
import { currentLocale, useT } from "../i18n";
import { Icon, type Tone } from "../ui";
import "./gantt.css";

export type GanttRowSpec = {
  key: string;
  depth: number;
  kind: "project" | "phase" | "task";
  /** Main text; already plain data (names, numbers), not a dictionary key. */
  label: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
  start: string | null;
  finish: string | null;
  progress?: number | null;
  tone: Tone;
  baselineFinish?: string | null;
  baselineStart?: string | null;
  forecastFinish?: string | null;
  milestone?: boolean;
  /** The customer's delivery date, drawn as a flag on the row. */
  target?: string | null;
  selected?: boolean;
  /** Spoken and hover text for the bar, e.g. "2.3 Install PLC · 1 Oct → 3 Oct · 50%". */
  title: string;
  /** Shown in the track instead of a bar, e.g. while a project's tasks are loading. Plain text. */
  placeholder?: string;
};

/**
 * One colour rule for a scheduled row, the same as the project health rules: done is green; blocked
 * or past its plan finish (late against the current plan) is red; a forecast past the plan is amber;
 * not started is slate; otherwise blue.
 */
export function scheduleTone(item: { status: string; planFinish: string | null; forecastFinish?: string | null; percentComplete: number; countsTowardHealth?: boolean }, today: string): Tone {
  if (item.status === "Done" || Number(item.percentComplete) >= 100) return "green";
  if (item.status === "Blocked") return "red";
  // A Master Plan frame row is not late work (project-health.ts countedLeaves), so it is never painted late.
  if (item.countsTowardHealth !== false && item.planFinish !== null && item.planFinish < today) return "red";
  if (item.forecastFinish && item.planFinish && item.forecastFinish > item.planFinish) return "amber";
  return item.status === "Not Started" ? "slate" : "blue";
}

export type GanttZoomChoice = GanttZoom | "fit";
const ZOOM_LABEL: Record<GanttZoomChoice, string> = { month: "Gantt.month", quarter: "Gantt.quarter", half: "Gantt.half", year: "Gantt.year", fit: "Gantt.fit" };

/** Zoom presets, earlier / later and back to today. "Fit" shows a project's whole plan. */
export function GanttToolbar({ zoom, onZoom, onShift, onToday, allowFit = false }: {
  zoom: GanttZoomChoice; onZoom: (zoom: GanttZoomChoice) => void; onShift: (direction: -1 | 1) => void; onToday: () => void; allowFit?: boolean;
}) {
  const t = useT();
  const choices: GanttZoomChoice[] = allowFit ? ["fit", ...GANTT_ZOOMS] : [...GANTT_ZOOMS];
  return <div className="gantt-toolbar" role="group" aria-label={t("Gantt.zoom")}>
    <div className="chip-select" role="group" aria-label={t("Gantt.zoom")}>
      {choices.map((choice) => <button key={choice} type="button" className={zoom === choice ? "chip on" : "chip"} aria-pressed={zoom === choice} onClick={() => onZoom(choice)}>{t(ZOOM_LABEL[choice])}</button>)}
    </div>
    <div className="gantt-nav">
      <button type="button" className="icon-btn" disabled={zoom === "fit"} onClick={() => onShift(-1)} aria-label={t("Gantt.earlier")} title={t("Gantt.earlier")}><Icon name="chevronLeft" /></button>
      <button type="button" className="btn ghost sm" onClick={onToday}><Icon name="calendar" />{t("Gantt.today")}</button>
      <button type="button" className="icon-btn" disabled={zoom === "fit"} onClick={() => onShift(1)} aria-label={t("Gantt.later")} title={t("Gantt.later")}><Icon name="chevronRight" /></button>
    </div>
  </div>;
}

export function GanttLegend({ baseline = false, target = false }: { baseline?: boolean; target?: boolean }) {
  const t = useT();
  return <ul className="gantt-legend" aria-label={t("Gantt.legend")}>
    <li><i className="gantt-key bar" aria-hidden="true" />{t("Gantt.legendPlan")}</li>
    <li><i className="gantt-key done" aria-hidden="true" />{t("Gantt.legendDone")}</li>
    <li><i className="gantt-key slip" aria-hidden="true" />{t("Gantt.legendSlip")}</li>
    {baseline ? <li><i className="gantt-key baseline" aria-hidden="true" />{t("Gantt.legendBaseline")}</li> : null}
    <li><i className="gantt-key milestone" aria-hidden="true" />{t("Gantt.legendMilestone")}</li>
    {target ? <li><i className="gantt-key target" aria-hidden="true" />{t("Gantt.legendTarget")}</li> : null}
    <li><i className="gantt-key today" aria-hidden="true" />{t("Gantt.today")}</li>
  </ul>;
}

export function GanttChart({ rows, range, today, sideHeader, label }: {
  rows: GanttRowSpec[];
  range: GanttWindow;
  today: string;
  /** Dictionary key for the label column's heading. */
  sideHeader: string;
  /** Dictionary key naming the chart for assistive technology. */
  label: string;
}) {
  const t = useT();
  const locale = currentLocale();
  const columnLabel = (start: string, kind: "week" | "month") => new Intl.DateTimeFormat(locale, kind === "week" ? { day: "numeric", month: "short", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${start}T00:00:00Z`));
  const todayAt = ganttPoint(today, range);
  return <div className="gantt" role="region" aria-label={t(label)}>
    <div className="gantt-head">
      <div className="gantt-side-head">{t(sideHeader)}</div>
      <div className="gantt-scale">
        {range.columns.map((column) => {
          const span = ganttSpan(column.start, column.end, range);
          const current = today >= column.start && today <= column.end;
          return span ? <span key={column.start} className={current ? "current" : undefined} style={{ left: `${span.left}%`, width: `${span.width}%` }}>{columnLabel(column.start, column.kind)}</span> : null;
        })}
      </div>
    </div>
    {rows.map((row) => {
      const bar = row.milestone ? null : ganttSpan(row.start, row.finish, range);
      const diamond = row.milestone ? ganttPoint(row.finish ?? row.start, range) : null;
      const slip = ganttSlip(row.finish, row.forecastFinish, range);
      const baseline = ganttSpan(row.baselineStart ?? null, row.baselineFinish ?? null, range);
      const target = ganttPoint(row.target ?? null, range);
      const progress = row.progress === null || row.progress === undefined ? null : Math.max(0, Math.min(100, Math.round(Number(row.progress))));
      const done = progress === 100;
      return <div key={row.key} className={`gantt-row ${row.kind}${row.selected ? " selected" : ""}`}>
        <div className="gantt-side" style={{ paddingLeft: 8 + Math.min(row.depth, 5) * 16 }}>
          {row.expandable
            ? <button type="button" className="gantt-toggle" aria-expanded={Boolean(row.expanded)} aria-label={t(row.expanded ? "Collapse" : "Expand")} onClick={row.onToggle}><Icon name={row.expanded ? "chevronDown" : "chevronRight"} /></button>
            : <span className="gantt-toggle-spacer" />}
          {row.onOpen
            ? <button type="button" className="gantt-label" onClick={row.onOpen}><span className="gantt-label-main">{row.label}</span>{row.meta ? <small>{row.meta}</small> : null}</button>
            : <span className="gantt-label"><span className="gantt-label-main">{row.label}</span>{row.meta ? <small>{row.meta}</small> : null}</span>}
          {row.status ? <span className="gantt-status">{row.status}</span> : null}
        </div>
        <div className="gantt-track">
          {range.columns.map((column) => {
            const span = ganttSpan(column.start, column.end, range);
            return span ? <span key={column.start} className="gantt-gridline" style={{ left: `${span.left}%` }} aria-hidden="true" /> : null;
          })}
          {baseline ? <span className="gantt-baseline" style={{ left: `${baseline.left}%`, width: `${baseline.width}%` }} aria-hidden="true" /> : null}
          {bar ? <button type="button" className={`gantt-bar ${row.tone}${row.kind === "task" ? "" : " summary"}${done ? " done" : ""}${bar.clippedStart ? " clip-start" : ""}${bar.clippedEnd ? " clip-end" : ""}`}
            style={{ left: `${bar.left}%`, width: `${bar.width}%` }} title={row.title} aria-label={row.title} onClick={row.onOpen} disabled={!row.onOpen} tabIndex={-1}>
            {progress !== null ? <i style={{ width: `${progress}%` }} /> : null}
            {progress !== null && bar.width > 6 ? <span>{progress}%</span> : null}
          </button> : null}
          {slip ? <span className="gantt-slip" style={{ left: `${slip.left}%`, width: `${slip.width}%` }} title={`${t("Gantt.legendSlip")} → ${row.forecastFinish}`} aria-hidden="true" /> : null}
          {diamond !== null ? <button type="button" className={`gantt-diamond ${row.tone}${done ? " done" : ""}`} style={{ left: `${diamond}%` }} title={row.title} aria-label={row.title} onClick={row.onOpen} disabled={!row.onOpen} tabIndex={-1} /> : null}
          {target !== null ? <span className="gantt-target" style={{ left: `${target}%` }} title={`${t("Gantt.legendTarget")} ${row.target}`} aria-hidden="true" /> : null}
          {todayAt !== null ? <span className="gantt-today" style={{ left: `${todayAt}%` }} aria-hidden="true" /> : null}
          {!bar && diamond === null ? <span className="gantt-undated">{row.placeholder ?? (row.start || row.finish ? t("Gantt.outside") : t("Gantt.undated"))}</span> : null}
        </div>
      </div>;
    })}
  </div>;
}
