"use client";
/* Projects > Overview in Timeline mode: the same filtered, sorted projects as the list, one line per project from the
   overview fields (no schedule fetch): a card (customer · number, name · dates, health and manager) and the plan's main
   headings as coloured, named phases (owner 2026-11-26), or one bar while it has none. A project's tasks load only when it is
   expanded. Clicking a project opens its plan; clicking a task opens the plan on that task. A task
   search (task name or person) finds rows across every project in scope and opens just those. The
   whole block, sort controls included, can go full screen; opening a plan leaves full screen first.
   "Original plan" draws each phase's last frozen baseline as a grey line under it, and the year list shows one calendar
   year, January to December (owner 2026-11-27). */

import { useCallback, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { calendarYearWindow, ganttWindow, ganttYears, shiftGanttAnchor } from "../../../lib/gantt";
import { customerShort, phaseColor } from "../../../lib/gantt-phase-colors";
import { apiRequest } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { searchScheduleTasks, type ProjectOverviewItem } from "../project-overview-client";
import { Icon } from "../ui";
import { useFullscreen } from "../use-fullscreen";
import { GanttChart, GanttLegend, GanttToolbar, scheduleTone, type GanttRowSpec, type GanttZoomChoice } from "./GanttChart";
import type { ProjectSchedule, ScheduleTask } from "./PlanningPricingScreens";
import { HealthBadge, PROJECT_HEALTH_TONE } from "./ProjectPlanFields";

/** Loads and opens up to this many projects at once, so one click cannot fire a request per project in the company. */
const EXPAND_LIMIT = 20;

type LoadedSchedule = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; schedule: ProjectSchedule };
type TaskSearch = { query: string; matches: Map<number, Set<number>>; truncated: boolean } | { query: string; error: string };

const taskMatches = (task: ScheduleTask, hits: Set<number>): boolean => hits.has(task.id) || task.children.some((child) => taskMatches(child, hits));

export function ProjectPortfolioGantt({
  rows,
  today,
  canReadSchedule,
  includeClosed = false,
  openProjectSchedule,
  controls,
}: {
  rows: ProjectOverviewItem[];
  today: string;
  canReadSchedule: boolean;
  includeClosed?: boolean;
  openProjectSchedule?: (id: number, taskId?: number) => void;
  /** Drawn above the zoom bar, inside the full-screen area (the portfolio's sort). */
  controls?: ReactNode;
}) {
  const t = useT();
  // The ref apart from the state: React Compiler treats an object holding a ref as a ref and refuses its state reads.
  const { ref: fullscreenRef, ...fullscreen } = useFullscreen<HTMLDivElement>();
  // The plan opens on another tab, so full screen ends first; otherwise it would keep covering the page.
  const openPlan = openProjectSchedule
    ? (id: number, taskId?: number) => {
        void fullscreen.exit();
        openProjectSchedule(id, taskId);
      }
    : undefined;
  // A year shows most projects' phases whole; the week view is a press away.
  const [zoom, setZoom] = useState<GanttZoomChoice>("year");
  // The phases on one line, overlapping ones over each other; off, overlapping phases stack.
  const [oneLine, setOneLine] = useState(true);
  // Each phase's original plan (its last frozen baseline) as a grey line under it.
  const [showBaseline, setShowBaseline] = useState(false);
  // A calendar year picked from the list, January to December; null is the window around the anchor.
  const [year, setYear] = useState<number | null>(null);
  const dayText = useMemo(() => new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "short", timeZone: "UTC" }), []);
  const day = (iso: string | null) => (iso ? dayText.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : null);
  const [anchor, setAnchor] = useState(today);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [schedules, setSchedules] = useState<Map<number, LoadedSchedule>>(() => new Map());
  const [taskQuery, setTaskQuery] = useState("");
  const [search, setSearch] = useState<TaskSearch | null>(null);
  const [searching, setSearching] = useState(false);
  const range = useMemo(() => (year !== null ? calendarYearWindow(year) : ganttWindow(zoom === "fit" ? "year" : zoom, anchor)), [year, zoom, anchor]);
  const yearText = useMemo(() => new Intl.DateTimeFormat(currentLocale(), { year: "numeric", timeZone: "UTC" }), []);
  // The years the projects shown run through, this year included; a year the arrows stepped to stays listed.
  const yearOptions = useMemo(() => {
    const years = ganttYears(
      rows.flatMap((item) => [item.planStart, item.planFinish, item.targetDelivery]),
      today,
    );
    if (year !== null && !years.includes(year)) years.push(year);
    return years.sort((a, b) => a - b).map((value) => ({ value, label: yearText.format(new Date(Date.UTC(value, 0, 1))) }));
  }, [rows, today, yearText, year]);
  // A range button or Today leaves the picked year; the arrows step a year at a time while one is picked.
  const changeZoom = (next: GanttZoomChoice) => {
    setYear(null);
    setZoom(next);
  };
  const pickYear = (next: number | null) => {
    setYear(next);
    if (next !== null) setZoom("year");
  };

  const load = useCallback(
    async (projectId: number) => {
      setSchedules((current) => new Map(current).set(projectId, { status: "loading" }));
      try {
        const schedule = await apiRequest<ProjectSchedule>(`/api/v1/projects/${projectId}/schedule`);
        setSchedules((current) => new Map(current).set(projectId, { status: "ready", schedule }));
      } catch (failure) {
        setSchedules((current) => new Map(current).set(projectId, { status: "error", message: failure instanceof Error ? failure.message : t("Could not load") }));
      }
    },
    [t],
  );
  const open = (projectIds: number[]) => {
    setExpanded(new Set(projectIds));
    for (const id of projectIds) {
      const loaded = schedules.get(id);
      if (!loaded || loaded.status === "error") void load(id);
    }
  };
  const expandable = rows.filter((item) => canReadSchedule && item.taskCount > 0);
  const toggle = (projectId: number) => {
    const opening = !expanded.has(projectId);
    setExpanded((current) => {
      const next = new Set(current);
      if (opening) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
    const loaded = schedules.get(projectId);
    if (opening && (!loaded || loaded.status === "error")) void load(projectId);
  };
  // Only the latest search may land: Clear, or a newer search, makes an answer still in flight stale.
  const searchSequence = useRef(0);
  const runSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = taskQuery.trim();
    if (query.length < 2) return;
    const request = ++searchSequence.current;
    setSearching(true);
    try {
      const result = await searchScheduleTasks(query, includeClosed);
      if (request !== searchSequence.current) return;
      const matches = new Map<number, Set<number>>();
      for (const match of result.matches) matches.set(match.projectId, (matches.get(match.projectId) ?? new Set()).add(match.taskId));
      setSearch({ query, matches, truncated: result.truncated });
      // Open the matching projects that this view shows, in its order.
      open(
        rows
          .filter((item) => matches.has(item.id))
          .slice(0, EXPAND_LIMIT)
          .map((item) => item.id),
      );
    } catch (failure) {
      if (request === searchSequence.current) setSearch({ query, error: failure instanceof Error ? failure.message : t("Could not load") });
    } finally {
      if (request === searchSequence.current) setSearching(false);
    }
  };
  const clearSearch = () => {
    searchSequence.current += 1;
    setSearching(false);
    setSearch(null);
    setTaskQuery("");
    setExpanded(new Set());
  };
  const hits = search && "matches" in search ? search.matches : null;
  const visibleRows = hits ? rows.filter((item) => hits.has(item.id)) : rows;

  const ganttRows: GanttRowSpec[] = [];
  for (const item of visibleRows) {
    const isOpen = expanded.has(item.id);
    const phases = item.phases ?? [];
    const customer = customerShort(item.customerName);
    const dates = item.planStart && item.planFinish ? `${day(item.planStart)} – ${day(item.planFinish)}` : null;
    ganttRows.push({
      key: `project:${item.id}`,
      depth: 0,
      kind: "project",
      label: (
        <>
          {customer ? `${customer} · ` : ""}
          <span className="mono">{item.number}</span>
        </>
      ),
      meta: [item.name, dates].filter(Boolean).join(" · "),
      footer: (
        <>
          <HealthBadge health={item.health ?? "No plan"} />
          <span className="gantt-foot-pm">
            <Icon name="user" /> {item.managerName} · {Math.round(Number(item.progress) || 0)}%
          </span>
        </>
      ),
      accent: PROJECT_HEALTH_TONE[item.health ?? "No plan"] ?? "slate",
      // The plan's main headings, each in the colour of its kind of work and named on the bar.
      ...(phases.length
        ? {
            oneLane: oneLine,
            segments: phases.map((phase, index) => {
              const color = phaseColor(phase.name, index);
              return {
                key: `phase:${item.id}:${phase.id}`,
                start: phase.start,
                finish: phase.finish,
                tone: "blue" as const,
                label: phase.name,
                color: color.fill,
                ink: color.ink,
                title: `${phase.name} · ${day(phase.start)} – ${day(phase.finish)} · ${phase.progress}%${
                  phase.baselineStart && phase.baselineFinish ? ` · ${t("Gantt.baseline")} ${day(phase.baselineStart)} – ${day(phase.baselineFinish)}` : ""
                }`,
                ...(showBaseline ? { baselineStart: phase.baselineStart ?? null, baselineFinish: phase.baselineFinish ?? null } : {}),
                ...(openPlan ? { onOpen: () => openPlan(item.id, phase.id) } : {}),
              };
            }),
          }
        : {}),
      expandable: canReadSchedule && item.taskCount > 0,
      expanded: isOpen,
      onToggle: () => toggle(item.id),
      ...(openPlan ? { onOpen: () => openPlan(item.id) } : {}),
      start: item.planStart,
      finish: item.planFinish,
      progress: Number(item.progress),
      tone: PROJECT_HEALTH_TONE[item.health ?? "No plan"] ?? "slate",
      forecastFinish: item.forecastFinish,
      target: item.targetDelivery,
      title: `${item.number} · ${item.name} · ${item.planStart ?? "—"} → ${item.planFinish ?? "—"} · ${Math.round(Number(item.progress) || 0)}%`,
    });
    if (!isOpen) continue;
    const loaded = schedules.get(item.id);
    if (!loaded || loaded.status === "loading") {
      ganttRows.push({ key: `loading:${item.id}`, depth: 1, kind: "task", label: t("Loading…"), start: null, finish: null, tone: "slate", title: t("Loading…"), placeholder: t("Loading…") });
      continue;
    }
    if (loaded.status === "error") {
      ganttRows.push({ key: `error:${item.id}`, depth: 1, kind: "task", label: loaded.message, start: null, finish: null, tone: "red", title: loaded.message, placeholder: loaded.message });
      continue;
    }
    const projectHits = hits?.get(item.id) ?? null;
    const visit = (tasks: ScheduleTask[], depth: number) => {
      for (const task of tasks) {
        // Under a search, only the matching rows and the rows above them.
        if (projectHits && !taskMatches(task, projectHits)) continue;
        ganttRows.push({
          key: `task:${item.id}:${task.id}`,
          depth,
          kind: task.kind === "phase" ? "phase" : task.children.length ? "phase" : "task",
          label: (
            <>
              <span className="mono">{task.wbs}</span> {task.name}
            </>
          ),
          meta: [task.pics.map((pic) => pic.name).join(", ") || task.picExternal, t(task.status)].filter(Boolean).join(" · "),
          ...(openPlan ? { onOpen: () => openPlan(item.id, task.id) } : {}),
          start: task.planStart,
          finish: task.planFinish,
          progress: Number(task.percentComplete),
          tone: scheduleTone(task, today),
          forecastFinish: task.forecastFinish,
          baselineStart: task.baselineStart,
          baselineFinish: task.baselineFinish,
          milestone: task.isMilestone,
          selected: Boolean(projectHits?.has(task.id)),
          title: `${task.wbs} ${task.name} · ${task.planStart ?? "—"} → ${task.planFinish ?? "—"} · ${Math.round(Number(task.percentComplete) || 0)}%`,
        });
        visit(task.children, depth + 1);
      }
    };
    visit(loaded.schedule.tasks, 1);
  }
  const hiddenMatches = hits ? [...hits.keys()].filter((id) => !rows.some((item) => item.id === id)).length : 0;
  // Counted in the projects shown, so both figures describe the same rows; hidden ones are reported apart.
  const shownTaskMatches = hits ? visibleRows.reduce((sum, item) => sum + (hits.get(item.id)?.size ?? 0), 0) : 0;
  const notOpened = hits ? Math.max(0, visibleRows.length - EXPAND_LIMIT) : 0;

  return (
    <div ref={fullscreenRef} className={`portfolio-gantt${fullscreen.active ? " is-fullscreen" : ""}${fullscreen.overlay ? " is-overlay" : ""}`}>
      {controls}
      <div className="portfolio-gantt-bar">
        <GanttToolbar
          zoom={zoom}
          onZoom={changeZoom}
          onShift={(direction) => (year !== null ? setYear(year + direction) : setAnchor((value) => shiftGanttAnchor(zoom === "fit" ? "year" : zoom, value, direction)))}
          onToday={() => {
            setYear(null);
            setAnchor(today);
          }}
          year={{ value: year, options: yearOptions, onChange: pickYear }}
        />
        <div className="gantt-nav">
          {canReadSchedule ? (
            <>
              <button
                type="button"
                className="btn ghost sm"
                disabled={!expandable.length || Boolean(hits)}
                title={expandable.length > EXPAND_LIMIT ? t("Gantt.expandLimit").replace("{n}", String(EXPAND_LIMIT)) : undefined}
                onClick={() => open(expandable.slice(0, EXPAND_LIMIT).map((item) => item.id))}
              >
                <Icon name="plus" />
                {t("Gantt.expandVisible")}
              </button>
              <button type="button" className="btn ghost sm" disabled={!expanded.size} onClick={() => setExpanded(new Set())}>
                <Icon name="minus" />
                {t("Gantt.collapseAll")}
              </button>
            </>
          ) : null}
          <button type="button" className="btn ghost sm" data-guide="project.oneLine" aria-pressed={oneLine} title={t("Gantt.oneLineHint")} onClick={() => setOneLine(!oneLine)}>
            <Icon name="minus" />
            {t("Gantt.oneLine")}
          </button>
          <button type="button" className="btn ghost sm" data-guide="project.baseline" aria-pressed={showBaseline} title={t("Gantt.baselineHint")} onClick={() => setShowBaseline(!showBaseline)}>
            <Icon name="compare" />
            {t("Gantt.baseline")}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            aria-pressed={fullscreen.active}
            title={t(fullscreen.active ? "Gantt.exitFullScreen" : "Gantt.fullScreen")}
            onClick={() => {
              void fullscreen.toggle();
            }}
          >
            <Icon name={fullscreen.active ? "minimize" : "maximize"} />
            {t(fullscreen.active ? "Gantt.exitFullScreen" : "Gantt.fullScreen")}
          </button>
        </div>
        <GanttLegend baseline={expanded.size > 0 || showBaseline} target />
      </div>
      {canReadSchedule ? (
        <form
          className="portfolio-gantt-search"
          role="search"
          onSubmit={(event) => {
            void runSearch(event);
          }}
        >
          <input type="search" value={taskQuery} maxLength={100} onChange={(event) => setTaskQuery(event.target.value)} placeholder={t("Gantt.taskSearch")} aria-label={t("Gantt.taskSearch")} />
          <button className="btn default sm" type="submit" disabled={searching || taskQuery.trim().length < 2}>
            <Icon name="search" />
            {t("Gantt.findTasks")}
          </button>
          {search ? (
            <button className="btn ghost sm" type="button" onClick={clearSearch}>
              <Icon name="x" />
              {t("Gantt.clearSearch")}
            </button>
          ) : null}
          {search && "error" in search ? (
            <span className="danger-text" role="alert">
              {search.error}
            </span>
          ) : null}
          {hits ? (
            <span className="muted" role="status">
              {t("Gantt.searchResult").replace("{tasks}", String(shownTaskMatches)).replace("{projects}", String(visibleRows.length))}
              {hiddenMatches ? ` · ${t("Gantt.searchHidden").replace("{n}", String(hiddenMatches))}` : ""}
              {notOpened ? ` · ${t("Gantt.expandLimit").replace("{n}", String(EXPAND_LIMIT))}` : ""}
              {search && "truncated" in search && search.truncated ? ` · ${t("Gantt.searchTruncated")}` : ""}
            </span>
          ) : null}
        </form>
      ) : null}
      <GanttChart rows={ganttRows} range={range} today={today} sideHeader="Gantt.projectColumn" label="Gantt.portfolioLabel" />
    </div>
  );
}
