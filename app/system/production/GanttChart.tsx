"use client";
/* The shared Gantt for the Projects screens: the portfolio timeline (one row per project, expanding
   into its plan) and a project's Plan tab draw with this one component and lib/gantt.ts, so a bar
   means the same thing everywhere. Bars are buttons that open the row; the chart fits its container.
   The label column's edge can be dragged (or moved with the arrow keys on its grip) to show longer
   names; each chart remembers its width in this browser, and a double-click on the grip resets it.
   A row that may be rescheduled has a bar that drags to new dates (and stretches from its end), and
   links between rows are drawn as finish-to-start arrows over the track. */

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { GANTT_ZOOMS, dayNumber, ganttDragDays, ganttLanes, ganttLinkPath, ganttPoint, ganttShift, ganttSlip, ganttSpan, type GanttWindow, type GanttZoom } from "../../../lib/gantt";
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
  /** Several bars on one row in place of start–finish, e.g. everything one person has on; overlapping ones stack in lanes. */
  segments?: GanttSegment[];
  /** The bar drags to new dates by whole days; `resize` also lets its end be pulled. onChange gets the dropped dates. */
  reschedule?: { resize: boolean; onChange: (start: string, finish: string) => void };
  /** The row has a grip to drag it up or down the chart (GanttChart onMoveRow). */
  movable?: boolean;
};
/** Where a dragged row is dropped: just before or just after the row `target`. */
export type GanttRowDrop = { key: string; target: string; place: "before" | "after" };
/** A finish-to-start link, by row key: `to` starts after `from` finishes. */
export type GanttLink = { from: string; to: string };
export type GanttSegment = { key: string; start: string | null; finish: string | null; tone: Tone; title: string; onOpen?: () => void };

/** A row's segments that fall in the window, each with its lane. */
function placeSegments(segments: GanttSegment[], range: GanttWindow) {
  const shown = segments.flatMap((segment) => {
    const span = ganttSpan(segment.start, segment.finish ?? segment.start, range);
    return span && segment.start ? [{ segment, span, start: segment.start, finish: segment.finish ?? segment.start }] : [];
  });
  const { lanes, count } = ganttLanes(shown);
  return { shown: shown.map((entry, index) => ({ ...entry, lane: lanes[index]! })), count };
}

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

export function GanttLegend({ baseline = false, target = false, links = false, draggable = false }: { baseline?: boolean; target?: boolean; links?: boolean; draggable?: boolean }) {
  const t = useT();
  return <ul className="gantt-legend" aria-label={t("Gantt.legend")}>
    <li><i className="gantt-key bar" aria-hidden="true" />{t("Gantt.legendPlan")}</li>
    <li><i className="gantt-key done" aria-hidden="true" />{t("Gantt.legendDone")}</li>
    <li><i className="gantt-key slip" aria-hidden="true" />{t("Gantt.legendSlip")}</li>
    {baseline ? <li><i className="gantt-key baseline" aria-hidden="true" />{t("Gantt.legendBaseline")}</li> : null}
    <li><i className="gantt-key milestone" aria-hidden="true" />{t("Gantt.legendMilestone")}</li>
    {links ? <li><i className="gantt-key link" aria-hidden="true" />{t("Gantt.legendLink")}</li> : null}
    {target ? <li><i className="gantt-key target" aria-hidden="true" />{t("Gantt.legendTarget")}</li> : null}
    <li><i className="gantt-key today" aria-hidden="true" />{t("Gantt.today")}</li>
    {draggable ? <li className="gantt-legend-hint">{t("Gantt.dragHint")}</li> : null}
  </ul>;
}

/** Draws each link as an elbow arrow from the predecessor's bar end to the successor's bar start, measured from the DOM. */
function drawLinks(chart: HTMLElement, svg: SVGSVGElement, layer: SVGGElement, links: readonly GanttLink[], markerId: string) {
  const box = chart.getBoundingClientRect();
  const rows = chart.querySelectorAll<HTMLElement>("[data-gantt-row]");
  const last = rows[rows.length - 1];
  svg.setAttribute("width", String(chart.clientWidth));
  svg.setAttribute("height", String(last ? last.getBoundingClientRect().bottom - box.top + chart.scrollTop : 0));
  const byKey = new Map([...rows].map((row) => [row.dataset.ganttRow ?? "", row]));
  const paths: SVGPathElement[] = [];
  for (const link of links) {
    const fromRow = byKey.get(link.from), toRow = byKey.get(link.to);
    const fromBar = fromRow?.querySelector<HTMLElement>("[data-gantt-bar]"), toBar = toRow?.querySelector<HTMLElement>("[data-gantt-bar]");
    // A bar cut off by the window edge has no real end or start to point at.
    if (!fromRow || !fromBar || !toBar || fromBar.classList.contains("clip-end") || toBar.classList.contains("clip-start")) continue;
    const from = fromBar.getBoundingClientRect(), to = toBar.getBoundingClientRect();
    const y = (rect: DOMRect) => rect.top + rect.height / 2 - box.top + chart.scrollTop;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ganttLinkPath({ x: from.right - box.left, y: y(from) }, { x: to.left - box.left, y: y(to) }, fromRow.getBoundingClientRect().height / 2));
    path.setAttribute("marker-end", `url(#${markerId})`);
    paths.push(path);
  }
  layer.replaceChildren(...paths);
}

/** The label column's width limits in pixels; the track always keeps at least TRACK_MIN of the chart. */
const SIDE_MIN = 160;
const SIDE_MAX = 900;
const SIDE_STEP = 24;
const TRACK_MIN = 160;
const sideStorageKey = (label: string) => `tomas-tech-gantt-side:${label}`;
function readSide(label: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(sideStorageKey(label)));
    return Number.isFinite(value) && value >= SIDE_MIN && value <= SIDE_MAX ? value : null;
  } catch { return null; }
}
function saveSide(label: string, value: number | null) {
  try {
    if (value === null) window.localStorage.removeItem(sideStorageKey(label));
    else window.localStorage.setItem(sideStorageKey(label), String(value));
  } catch { /* storage blocked: the width lasts for this visit only */ }
}

export function GanttChart({ rows, range, today, sideHeader, label, links = [], onMoveRow, canMoveRow }: {
  rows: GanttRowSpec[];
  range: GanttWindow;
  today: string;
  /** Dictionary key for the label column's heading. */
  sideHeader: string;
  /** Dictionary key naming the chart for assistive technology. */
  label: string;
  links?: readonly GanttLink[];
  /** A movable row was dropped (or moved with the arrow keys on its grip). */
  onMoveRow?: (drop: GanttRowDrop) => void;
  /** Whether a row may land there; a place it may not is not offered while dragging. */
  canMoveRow?: (drop: GanttRowDrop) => boolean;
}) {
  const t = useT();
  const locale = currentLocale();
  const columnLabel = (start: string, kind: "week" | "month") => new Intl.DateTimeFormat(locale, kind === "week" ? { day: "numeric", month: "short", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${start}T00:00:00Z`));
  const dayLabel = (date: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const todayAt = ganttPoint(today, range);
  const chartRef = useRef<HTMLDivElement>(null);
  const linkSvg = useRef<SVGSVGElement>(null), linkLayer = useRef<SVGGElement>(null);
  const markerId = `gantt-arrow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // The bar being dragged and by how many days; a drag that moved swallows the click that follows it.
  const [drag, setDrag] = useState<{ key: string; mode: "move" | "resize"; days: number } | null>(null);
  const dragged = useRef(false);
  const startDrag = (event: ReactPointerEvent<HTMLElement>, row: GanttRowSpec) => {
    const edit = row.reschedule, track = event.currentTarget.closest<HTMLElement>(".gantt-track"), start = row.start, finish = row.finish;
    if (event.button !== 0 || !edit || !track || !start || !finish) return;
    event.stopPropagation();
    const mode = edit.resize && (event.target as HTMLElement).closest(".gantt-bar-grip") ? "resize" : "move";
    const target = event.currentTarget, width = track.clientWidth, x0 = event.clientX;
    // A stretch keeps at least one day.
    const shortest = dayNumber(start) - dayNumber(finish);
    let days = 0, moved = false;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (!moved && Math.abs(moveEvent.clientX - x0) < 4) return;
      moved = true;
      const next = ganttDragDays(moveEvent.clientX - x0, width, range.days);
      const clamped = mode === "resize" ? Math.max(shortest, next) : next;
      if (clamped !== days || !dragged.current) { days = clamped; dragged.current = true; setDrag({ key: row.key, mode, days }); }
    };
    const stop = (save: boolean) => {
      target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", up); target.removeEventListener("pointercancel", cancel);
      setDrag(null);
      // The click event comes right after pointerup; let it see the drag, then forget it.
      window.setTimeout(() => { dragged.current = false; }, 0);
      if (save && moved && days) edit.onChange(mode === "move" ? ganttShift(start, days) : start, ganttShift(finish, days));
    };
    const up = () => stop(true), cancel = () => stop(false);
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", up); target.addEventListener("pointercancel", cancel);
  };
  const open = (row: GanttRowSpec) => { if (!dragged.current) row.onOpen?.(); };
  // A row dragged by its grip: the drop place is shown as a line on the row it would land beside.
  const [rowDrop, setRowDrop] = useState<{ key: string; drop: GanttRowDrop | null } | null>(null);
  const startRowDrag = (event: ReactPointerEvent<HTMLButtonElement>, row: GanttRowSpec) => {
    const chart = chartRef.current;
    if (event.button !== 0 || !onMoveRow || !chart) return;
    event.preventDefault(); event.stopPropagation();
    const grip = event.currentTarget;
    grip.setPointerCapture(event.pointerId);
    let drop: GanttRowDrop | null = null, y = event.clientY, frame = 0;
    const locate = (x: number) => {
      const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-gantt-row]");
      const target = element?.dataset.ganttRow;
      if (!element || !target || target === row.key) return null;
      const box = element.getBoundingClientRect();
      const next: GanttRowDrop = { key: row.key, target, place: y < box.top + box.height / 2 ? "before" : "after" };
      return canMoveRow && !canMoveRow(next) ? null : next;
    };
    const move = (moveEvent: PointerEvent) => { y = moveEvent.clientY; drop = locate(moveEvent.clientX); setRowDrop({ key: row.key, drop }); };
    // Near the top or bottom of a long plan, the chart scrolls while the row is held there.
    const scroll = () => {
      const box = chart.getBoundingClientRect();
      if (y < box.top + 56) chart.scrollTop -= 12; else if (y > box.bottom - 32) chart.scrollTop += 12;
      frame = window.requestAnimationFrame(scroll);
    };
    frame = window.requestAnimationFrame(scroll);
    const stop = (save: boolean) => {
      window.cancelAnimationFrame(frame);
      grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", escape);
      setRowDrop(null);
      if (save && drop) onMoveRow(drop);
    };
    const up = () => stop(true), cancel = () => stop(false);
    const escape = (keyEvent: globalThis.KeyboardEvent) => { if (keyEvent.key === "Escape") stop(false); };
    grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", cancel); window.addEventListener("keydown", escape);
    setRowDrop({ key: row.key, drop: null });
  };
  // The arrow keys on a grip move the row past its neighbour, for those who do not drag.
  const moveRowByKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const neighbour = rows[index + step], row = rows[index];
    if (!step || !neighbour || !row || !onMoveRow) return;
    event.preventDefault();
    const drop: GanttRowDrop = { key: row.key, target: neighbour.key, place: step < 0 ? "before" : "after" };
    if (!canMoveRow || canMoveRow(drop)) onMoveRow(drop);
  };
  // Links are drawn after layout and again whenever the chart or its label column changes size.
  useLayoutEffect(() => {
    const chart = chartRef.current, svg = linkSvg.current, layer = linkLayer.current;
    if (!chart || !svg || !layer) return;
    const draw = () => drawLinks(chart, svg, layer, links, markerId);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(chart);
    const scale = chart.querySelector(".gantt-scale");
    if (scale) observer.observe(scale);
    return () => observer.disconnect();
  });
  // null keeps the stylesheet's width, which already narrows on small screens.
  const [side, setSide] = useState<number | null>(() => typeof window === "undefined" ? null : readSide(label));
  const [resizing, setResizing] = useState(false);
  const sideHead = () => chartRef.current?.querySelector<HTMLElement>(".gantt-side-head") ?? null;
  const maxSide = () => Math.max(SIDE_MIN, Math.min(SIDE_MAX, (chartRef.current?.clientWidth ?? 0) - TRACK_MIN));
  const resizeTo = (width: number) => { const next = Math.round(Math.min(maxSide(), Math.max(SIDE_MIN, width))); setSide(next); saveSide(label, next); };
  const onEdge = (clientX: number) => { const head = sideHead(); return head !== null && Math.abs(clientX - head.getBoundingClientRect().right) <= 5; };
  // A drag captures the pointer on the chart, so a double-click lands here rather than on the grip.
  const resetSide = (event: { clientX: number }) => { if (!onEdge(event.clientX)) return; setSide(null); saveSide(label, null); };
  // A press on the column edge (each row's 8px edge strip, or the header grip) drags it; anywhere else is a normal click.
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const chart = chartRef.current, head = sideHead();
    if (event.button !== 0 || !chart || !head || !onEdge(event.clientX)) return;
    const box = head.getBoundingClientRect();
    event.preventDefault();
    const max = maxSide();
    let width = box.width;
    chart.setPointerCapture(event.pointerId);
    setResizing(true);
    // While dragging, only the CSS variable moves (no re-render of every row); the width is kept on release.
    const move = (moveEvent: PointerEvent) => {
      width = Math.round(Math.min(max, Math.max(SIDE_MIN, moveEvent.clientX - box.left)));
      chart.style.setProperty("--gantt-side", `${width}px`);
    };
    const end = () => {
      chart.removeEventListener("pointermove", move); chart.removeEventListener("pointerup", end); chart.removeEventListener("pointercancel", end);
      setResizing(false); setSide(width); saveSide(label, width);
    };
    chart.addEventListener("pointermove", move); chart.addEventListener("pointerup", end); chart.addEventListener("pointercancel", end);
  };
  const resizeByKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const current = side ?? sideHead()?.getBoundingClientRect().width ?? 300;
    const next = event.key === "ArrowLeft" ? current - SIDE_STEP : event.key === "ArrowRight" ? current + SIDE_STEP
      : event.key === "Home" ? SIDE_MIN : event.key === "End" ? maxSide() : null;
    if (next === null) return;
    event.preventDefault();
    resizeTo(next);
  };
  // The track keeps TRACK_MIN even when a wide saved width meets a narrower window.
  const sideStyle = side === null ? undefined : { "--gantt-side": `min(${side}px, calc(100% - ${TRACK_MIN}px))` } as CSSProperties;
  return <div ref={chartRef} className={`gantt${resizing ? " resizing" : ""}${drag ? " dragging" : ""}${rowDrop ? " moving-row" : ""}`} role="region" aria-label={t(label)} style={sideStyle} onPointerDown={startResize} onDoubleClick={resetSide}>
    {links.length ? <svg ref={linkSvg} className="gantt-links" aria-hidden="true">
      <defs><marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" /></marker></defs>
      <g ref={linkLayer} />
    </svg> : null}
    <div className="gantt-head">
      <div className="gantt-side-head">{t(sideHeader)}
        <button type="button" className="gantt-resizer" aria-label={t("Gantt.resizeColumn")} title={t("Gantt.resizeColumnHint")} onKeyDown={resizeByKey} />
      </div>
      <div className="gantt-scale">
        {range.columns.map((column) => {
          const span = ganttSpan(column.start, column.end, range);
          const current = today >= column.start && today <= column.end;
          return span ? <span key={column.start} className={current ? "current" : undefined} style={{ left: `${span.left}%`, width: `${span.width}%` }}>{columnLabel(column.start, column.kind)}</span> : null;
        })}
      </div>
    </div>
    {rows.map((row, index) => {
      // While its bar is dragged, a row is drawn at the dates it would be dropped on.
      const shift = drag?.key === row.key ? drag : null;
      const start = shift?.mode === "move" && row.start ? ganttShift(row.start, shift.days) : row.start;
      const finish = shift && row.finish ? ganttShift(row.finish, shift.days) : row.finish;
      const segments = row.segments ? placeSegments(row.segments, range) : null;
      const bar = row.milestone || segments ? null : ganttSpan(start, finish, range);
      const diamond = row.milestone ? ganttPoint(finish ?? start, range) : null;
      const slip = shift ? null : ganttSlip(row.finish, row.forecastFinish, range);
      const baseline = ganttSpan(row.baselineStart ?? null, row.baselineFinish ?? null, range);
      const target = ganttPoint(row.target ?? null, range);
      const progress = row.progress === null || row.progress === undefined ? null : Math.max(0, Math.min(100, Math.round(Number(row.progress))));
      const done = progress === 100;
      const movable = row.reschedule ? ` movable${shift ? " moving" : ""}` : "";
      const grab = row.reschedule ? { onPointerDown: (event: ReactPointerEvent<HTMLElement>) => startDrag(event, row) } : {};
      // Where the dates being dropped on are written: after the bar, or before it near the right edge.
      const end = bar ? bar.left + bar.width : diamond;
      const dropLabel = shift && start && finish && end !== null && end !== undefined
        ? <span className="gantt-drop-label" style={end > 75 ? { right: `calc(${100 - (bar ? bar.left : end)}% + 8px)` } : { left: `calc(${end}% + 8px)` }}>
          {row.milestone || start === finish ? dayLabel(finish) : `${dayLabel(start)} → ${dayLabel(finish)}`}</span> : null;
      const dropHere = rowDrop?.drop?.target === row.key ? ` drop-${rowDrop.drop.place}` : "";
      return <div key={row.key} data-gantt-row={row.key} className={`gantt-row ${row.kind}${row.selected ? " selected" : ""}${dropHere}${rowDrop?.key === row.key ? " row-moving" : ""}`}>
        <div className="gantt-side" style={{ paddingLeft: 8 + Math.min(row.depth, 5) * 16 }}>
          {row.movable && onMoveRow ? <button type="button" className="gantt-grip" aria-label={`${t("Gantt.moveRow")} · ${row.title}`} title={t("Gantt.moveRowHint")}
            onPointerDown={(event) => startRowDrag(event, row)} onKeyDown={(event) => moveRowByKey(event, index)}><Icon name="grip" /></button> : null}
          {row.expandable
            ? <button type="button" className="gantt-toggle" aria-expanded={Boolean(row.expanded)} aria-label={t(row.expanded ? "Collapse" : "Expand")} onClick={row.onToggle}><Icon name={row.expanded ? "chevronDown" : "chevronRight"} /></button>
            : <span className="gantt-toggle-spacer" />}
          {row.onOpen
            ? <button type="button" className="gantt-label" title={row.title} onClick={row.onOpen}><span className="gantt-label-main">{row.label}</span>{row.meta ? <small>{row.meta}</small> : null}</button>
            : <span className="gantt-label" title={row.title}><span className="gantt-label-main">{row.label}</span>{row.meta ? <small>{row.meta}</small> : null}</span>}
          {row.status ? <span className="gantt-status">{row.status}</span> : null}
        </div>
        <div className="gantt-track" style={segments && segments.count > 1 ? { minHeight: 14 + segments.count * 10 } : undefined}>
          {range.columns.map((column) => {
            const span = ganttSpan(column.start, column.end, range);
            return span ? <span key={column.start} className="gantt-gridline" style={{ left: `${span.left}%` }} aria-hidden="true" /> : null;
          })}
          {baseline ? <span className="gantt-baseline" style={{ left: `${baseline.left}%`, width: `${baseline.width}%` }} aria-hidden="true" /> : null}
          {bar ? <button type="button" data-gantt-bar="" className={`gantt-bar ${row.tone}${row.kind === "task" ? "" : " summary"}${done ? " done" : ""}${bar.clippedStart ? " clip-start" : ""}${bar.clippedEnd ? " clip-end" : ""}${movable}`}
            style={{ left: `${bar.left}%`, width: `${bar.width}%` }} title={row.title} aria-label={row.title} onClick={() => open(row)} disabled={!row.onOpen && !row.reschedule} tabIndex={-1} {...grab}>
            {progress !== null ? <i style={{ width: `${progress}%` }} /> : null}
            {progress !== null && bar.width > 6 ? <span>{progress}%</span> : null}
            {row.reschedule?.resize ? <b className="gantt-bar-grip" title={t("Gantt.stretchHint")} /> : null}
          </button> : null}
          {segments?.shown.map(({ segment, span, lane }) => <button key={segment.key} type="button"
            className={`gantt-bar gantt-segment ${segment.tone}${span.clippedStart ? " clip-start" : ""}${span.clippedEnd ? " clip-end" : ""}`}
            style={{ left: `${span.left}%`, width: `${span.width}%`, top: segments.count > 1 ? 8 + lane * 10 : 15 }}
            title={segment.title} aria-label={segment.title} onClick={segment.onOpen} disabled={!segment.onOpen} tabIndex={-1} />)}
          {slip ? <span className="gantt-slip" style={{ left: `${slip.left}%`, width: `${slip.width}%` }} title={`${t("Gantt.legendSlip")} → ${row.forecastFinish}`} aria-hidden="true" /> : null}
          {diamond !== null ? <button type="button" data-gantt-bar="" className={`gantt-diamond ${row.tone}${done ? " done" : ""}${movable}`} style={{ left: `${diamond}%` }} title={row.title} aria-label={row.title} onClick={() => open(row)} disabled={!row.onOpen && !row.reschedule} tabIndex={-1} {...grab} /> : null}
          {dropLabel}
          {target !== null ? <span className="gantt-target" style={{ left: `${target}%` }} title={`${t("Gantt.legendTarget")} ${row.target}`} aria-hidden="true" /> : null}
          {todayAt !== null ? <span className="gantt-today" style={{ left: `${todayAt}%` }} aria-hidden="true" /> : null}
          {!bar && diamond === null && !segments?.shown.length ? <span className="gantt-undated">{row.placeholder ?? (row.start || row.finish ? t("Gantt.outside") : t("Gantt.undated"))}</span> : null}
        </div>
      </div>;
    })}
  </div>;
}
