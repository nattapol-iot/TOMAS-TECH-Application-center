"use client";
/* Projects > Overview in Timeline mode: the same filtered, sorted projects as the list, one bar per
   project from the overview fields (no schedule fetch), and a project's tasks loaded only when it is
   expanded. Clicking a project opens its plan; clicking a task opens the plan on that task. A task
   search (task name or person) finds rows across every project in scope and opens just those. */

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { ganttWindow, shiftGanttAnchor } from "../../../lib/gantt";
import { apiRequest } from "../api-client";
import { useT } from "../i18n";
import { searchScheduleTasks, type ProjectOverviewItem } from "../project-overview-client";
import { Icon, type Tone } from "../ui";
import { GanttChart, GanttLegend, GanttToolbar, scheduleTone, type GanttRowSpec, type GanttZoomChoice } from "./GanttChart";
import type { ProjectSchedule, ScheduleTask } from "./PlanningPricingScreens";
import { HealthBadge } from "./ProjectPlanFields";

const HEALTH_TONE: Record<string, Tone> = { Delayed: "red", "At Risk": "amber", "On Track": "blue", "No plan": "slate", "On Hold": "slate", Completed: "green" };

/** Loads and opens up to this many projects at once, so one click cannot fire a request per project in the company. */
const EXPAND_LIMIT = 20;

type LoadedSchedule = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; schedule: ProjectSchedule };
type TaskSearch = { query: string; matches: Map<number, Set<number>>; truncated: boolean } | { query: string; error: string };

const taskMatches = (task: ScheduleTask, hits: Set<number>): boolean => hits.has(task.id) || task.children.some((child) => taskMatches(child, hits));

export function ProjectPortfolioGantt({ rows, today, canReadSchedule, includeClosed = false, openProjectSchedule }: {
  rows: ProjectOverviewItem[];
  today: string;
  canReadSchedule: boolean;
  includeClosed?: boolean;
  openProjectSchedule?: (id: number, taskId?: number) => void;
}) {
  const t = useT();
  const [zoom, setZoom] = useState<GanttZoomChoice>("quarter");
  const [anchor, setAnchor] = useState(today);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [schedules, setSchedules] = useState<Map<number, LoadedSchedule>>(() => new Map());
  const [taskQuery, setTaskQuery] = useState("");
  const [search, setSearch] = useState<TaskSearch | null>(null);
  const [searching, setSearching] = useState(false);
  const range = useMemo(() => ganttWindow(zoom === "fit" ? "quarter" : zoom, anchor), [zoom, anchor]);

  const load = useCallback(async (projectId: number) => {
    setSchedules((current) => new Map(current).set(projectId, { status: "loading" }));
    try {
      const schedule = await apiRequest<ProjectSchedule>(`/api/v1/projects/${projectId}/schedule`);
      setSchedules((current) => new Map(current).set(projectId, { status: "ready", schedule }));
    } catch (failure) {
      setSchedules((current) => new Map(current).set(projectId, { status: "error", message: failure instanceof Error ? failure.message : t("Could not load") }));
    }
  }, [t]);
  const open = (projectIds: number[]) => {
    setExpanded(new Set(projectIds));
    for (const id of projectIds) { const loaded = schedules.get(id); if (!loaded || loaded.status === "error") void load(id); }
  };
  const expandable = rows.filter((item) => canReadSchedule && item.taskCount > 0);
  const toggle = (projectId: number) => {
    const opening = !expanded.has(projectId);
    setExpanded((current) => { const next = new Set(current); if (opening) next.add(projectId); else next.delete(projectId); return next; });
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
      open(rows.filter((item) => matches.has(item.id)).slice(0, EXPAND_LIMIT).map((item) => item.id));
    } catch (failure) {
      if (request === searchSequence.current) setSearch({ query, error: failure instanceof Error ? failure.message : t("Could not load") });
    } finally { if (request === searchSequence.current) setSearching(false); }
  };
  const clearSearch = () => { searchSequence.current += 1; setSearching(false); setSearch(null); setTaskQuery(""); setExpanded(new Set()); };
  const hits = search && "matches" in search ? search.matches : null;
  const visibleRows = hits ? rows.filter((item) => hits.has(item.id)) : rows;

  const ganttRows: GanttRowSpec[] = [];
  for (const item of visibleRows) {
    const isOpen = expanded.has(item.id);
    ganttRows.push({
      key: `project:${item.id}`, depth: 0, kind: "project",
      label: <><span className="mono">{item.number}</span> · {item.name}</>,
      meta: `${item.managerName} · ${Math.round(Number(item.progress) || 0)}%`,
      status: <HealthBadge health={item.health ?? "No plan"} />,
      expandable: canReadSchedule && item.taskCount > 0, expanded: isOpen, onToggle: () => toggle(item.id),
      ...(openProjectSchedule ? { onOpen: () => openProjectSchedule(item.id) } : {}),
      start: item.planStart, finish: item.planFinish, progress: Number(item.progress), tone: HEALTH_TONE[item.health ?? "No plan"] ?? "slate",
      forecastFinish: item.forecastFinish, target: item.targetDelivery,
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
          key: `task:${item.id}:${task.id}`, depth, kind: task.kind === "phase" ? "phase" : task.children.length ? "phase" : "task",
          label: <><span className="mono">{task.wbs}</span> {task.name}</>,
          meta: [task.pics.map((pic) => pic.name).join(", ") || task.picExternal, t(task.status)].filter(Boolean).join(" · "),
          ...(openProjectSchedule ? { onOpen: () => openProjectSchedule(item.id, task.id) } : {}),
          start: task.planStart, finish: task.planFinish, progress: Number(task.percentComplete),
          tone: scheduleTone(task, today), forecastFinish: task.forecastFinish,
          baselineStart: task.baselineStart, baselineFinish: task.baselineFinish, milestone: task.isMilestone,
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

  return <div className="portfolio-gantt">
    <div className="portfolio-gantt-bar">
      <GanttToolbar zoom={zoom} onZoom={setZoom} onShift={(direction) => setAnchor((value) => shiftGanttAnchor(zoom === "fit" ? "quarter" : zoom, value, direction))} onToday={() => setAnchor(today)} />
      {canReadSchedule ? <div className="gantt-nav">
        <button type="button" className="btn ghost sm" disabled={!expandable.length || Boolean(hits)} title={expandable.length > EXPAND_LIMIT ? t("Gantt.expandLimit").replace("{n}", String(EXPAND_LIMIT)) : undefined} onClick={() => open(expandable.slice(0, EXPAND_LIMIT).map((item) => item.id))}><Icon name="plus" />{t("Gantt.expandVisible")}</button>
        <button type="button" className="btn ghost sm" disabled={!expanded.size} onClick={() => setExpanded(new Set())}><Icon name="minus" />{t("Gantt.collapseAll")}</button>
      </div> : null}
      <GanttLegend baseline={expanded.size > 0} target />
    </div>
    {canReadSchedule ? <form className="portfolio-gantt-search" role="search" onSubmit={(event) => { void runSearch(event); }}>
      <input type="search" value={taskQuery} maxLength={100} onChange={(event) => setTaskQuery(event.target.value)} placeholder={t("Gantt.taskSearch")} aria-label={t("Gantt.taskSearch")} />
      <button className="btn default sm" type="submit" disabled={searching || taskQuery.trim().length < 2}><Icon name="search" />{t("Gantt.findTasks")}</button>
      {search ? <button className="btn ghost sm" type="button" onClick={clearSearch}><Icon name="x" />{t("Gantt.clearSearch")}</button> : null}
      {search && "error" in search ? <span className="danger-text" role="alert">{search.error}</span> : null}
      {hits ? <span className="muted" role="status">{t("Gantt.searchResult").replace("{tasks}", String(shownTaskMatches)).replace("{projects}", String(visibleRows.length))}
        {hiddenMatches ? ` · ${t("Gantt.searchHidden").replace("{n}", String(hiddenMatches))}` : ""}{notOpened ? ` · ${t("Gantt.expandLimit").replace("{n}", String(EXPAND_LIMIT))}` : ""}{search && "truncated" in search && search.truncated ? ` · ${t("Gantt.searchTruncated")}` : ""}</span> : null}
    </form> : null}
    <GanttChart rows={ganttRows} range={range} today={today} sideHeader="Gantt.projectColumn" label="Gantt.portfolioLabel" />
  </div>;
}
