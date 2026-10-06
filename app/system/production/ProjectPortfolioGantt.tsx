"use client";
/* Projects > Overview in Timeline mode: the same filtered, sorted projects as the list, one bar per
   project from the overview fields (no schedule fetch), and a project's tasks loaded only when it is
   expanded. Clicking a project opens its plan; clicking a task opens the plan on that task. */

import { useCallback, useMemo, useState } from "react";
import { ganttWindow, shiftGanttAnchor } from "../../../lib/gantt";
import { apiRequest } from "../api-client";
import { useT } from "../i18n";
import type { ProjectOverviewItem } from "../project-overview-client";
import { Icon, type Tone } from "../ui";
import { GanttChart, GanttLegend, GanttToolbar, scheduleTone, type GanttRowSpec, type GanttZoomChoice } from "./GanttChart";
import type { ProjectSchedule, ScheduleTask } from "./PlanningPricingScreens";
import { HealthBadge } from "./ProjectPlanFields";

const HEALTH_TONE: Record<string, Tone> = { Delayed: "red", "At Risk": "amber", "On Track": "blue", "No plan": "slate", "On Hold": "slate", Completed: "green" };

const EXPAND_LIMIT = 20;

type LoadedSchedule = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; schedule: ProjectSchedule };

export function ProjectPortfolioGantt({ rows, today, canReadSchedule, openProjectSchedule }: {
  rows: ProjectOverviewItem[];
  today: string;
  canReadSchedule: boolean;
  openProjectSchedule?: (id: number, taskId?: number) => void;
}) {
  const t = useT();
  const [zoom, setZoom] = useState<GanttZoomChoice>("quarter");
  const [anchor, setAnchor] = useState(today);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [schedules, setSchedules] = useState<Map<number, LoadedSchedule>>(() => new Map());
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
/** Loads and opens up to this many visible projects at once, so one click cannot fire a request per project in the company. */
  const expandable = rows.filter((item) => canReadSchedule && item.taskCount > 0);
  const expandVisible = () => {
    const next = expandable.slice(0, EXPAND_LIMIT);
    setExpanded(new Set(next.map((item) => item.id)));
    for (const item of next) { const loaded = schedules.get(item.id); if (!loaded || loaded.status === "error") void load(item.id); }
  };
  const toggle = (projectId: number) => {
    const opening = !expanded.has(projectId);
    setExpanded((current) => { const next = new Set(current); if (opening) next.add(projectId); else next.delete(projectId); return next; });
    const loaded = schedules.get(projectId);
    if (opening && (!loaded || loaded.status === "error")) void load(projectId);
  };

  const ganttRows: GanttRowSpec[] = [];
  for (const item of rows) {
    const open = expanded.has(item.id);
    ganttRows.push({
      key: `project:${item.id}`, depth: 0, kind: "project",
      label: <><span className="mono">{item.number}</span> · {item.name}</>,
      meta: `${item.managerName} · ${Math.round(Number(item.progress) || 0)}%`,
      status: <HealthBadge health={item.health ?? "No plan"} />,
      expandable: canReadSchedule && item.taskCount > 0, expanded: open, onToggle: () => toggle(item.id),
      ...(openProjectSchedule ? { onOpen: () => openProjectSchedule(item.id) } : {}),
      start: item.planStart, finish: item.planFinish, progress: Number(item.progress), tone: HEALTH_TONE[item.health ?? "No plan"] ?? "slate",
      forecastFinish: item.forecastFinish, target: item.targetDelivery,
      title: `${item.number} · ${item.name} · ${item.planStart ?? "—"} → ${item.planFinish ?? "—"} · ${Math.round(Number(item.progress) || 0)}%`,
    });
    if (!open) continue;
    const loaded = schedules.get(item.id);
    if (!loaded || loaded.status === "loading") {
      ganttRows.push({ key: `loading:${item.id}`, depth: 1, kind: "task", label: t("Loading…"), start: null, finish: null, tone: "slate", title: t("Loading…"), placeholder: t("Loading…") });
      continue;
    }
    if (loaded.status === "error") {
      ganttRows.push({ key: `error:${item.id}`, depth: 1, kind: "task", label: loaded.message, start: null, finish: null, tone: "red", title: loaded.message, placeholder: loaded.message });
      continue;
    }
    const visit = (tasks: ScheduleTask[], depth: number) => {
      for (const task of tasks) {
        ganttRows.push({
          key: `task:${item.id}:${task.id}`, depth, kind: task.kind === "phase" ? "phase" : task.children.length ? "phase" : "task",
          label: <><span className="mono">{task.wbs}</span> {task.name}</>,
          meta: [task.pics.map((pic) => pic.name).join(", ") || task.picExternal, t(task.status)].filter(Boolean).join(" · "),
          ...(openProjectSchedule ? { onOpen: () => openProjectSchedule(item.id, task.id) } : {}),
          start: task.planStart, finish: task.planFinish, progress: Number(task.percentComplete),
          tone: scheduleTone(task, today), forecastFinish: task.forecastFinish,
          baselineStart: task.baselineStart, baselineFinish: task.baselineFinish, milestone: task.isMilestone,
          title: `${task.wbs} ${task.name} · ${task.planStart ?? "—"} → ${task.planFinish ?? "—"} · ${Math.round(Number(task.percentComplete) || 0)}%`,
        });
        visit(task.children, depth + 1);
      }
    };
    visit(loaded.schedule.tasks, 1);
  }

  return <div className="portfolio-gantt">
    <div className="portfolio-gantt-bar">
      <GanttToolbar zoom={zoom} onZoom={setZoom} onShift={(direction) => setAnchor((value) => shiftGanttAnchor(zoom === "fit" ? "quarter" : zoom, value, direction))} onToday={() => setAnchor(today)} />
      {canReadSchedule ? <div className="gantt-nav">
        <button type="button" className="btn ghost sm" disabled={!expandable.length} title={expandable.length > EXPAND_LIMIT ? t("Gantt.expandLimit").replace("{n}", String(EXPAND_LIMIT)) : undefined} onClick={expandVisible}><Icon name="plus" />{t("Gantt.expandVisible")}</button>
        <button type="button" className="btn ghost sm" disabled={!expanded.size} onClick={() => setExpanded(new Set())}><Icon name="minus" />{t("Gantt.collapseAll")}</button>
      </div> : null}
      <GanttLegend baseline={expanded.size > 0} target />
    </div>
    <GanttChart rows={ganttRows} range={range} today={today} sideHeader="Gantt.projectColumn" label="Gantt.portfolioLabel" />
  </div>;
}
