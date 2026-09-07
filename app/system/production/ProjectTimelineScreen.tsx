"use client";
import { LocalizedText } from "../LocalizedText";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { dateFromDay, dayNumber, planningWeeks } from "../../../lib/resource-planning";
import { useLanguage } from "../i18n";
import {
  Badge,
  EmptyState,
  Icon,
  KpiCard,
  PageHeader,
  Panel,
  SearchInput,
  Select,
} from "../ui";
import {
  loadSchedules,
  type ProjectSchedule,
  type ScheduleTask,
} from "./PlanningPricingScreens";
import "./project-timeline.css";

type Props = {
  openProjectSchedule?: (id: number) => void;
};

type TimelineRow =
  | { kind: "project"; project: ProjectSchedule; depth: 0 }
  | { kind: "task"; project: ProjectSchedule; task: ScheduleTask; depth: number };

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const taskKey = (projectId: number, taskId: number) => `task:${projectId}:${taskId}`;
const projectKey = (projectId: number) => `project:${projectId}`;
const normalized = (value: string) => value.trim().toLocaleLowerCase();

function taskContains(task: ScheduleTask, query: string): boolean {
  return (
    [task.wbs, task.name, task.status, task.picExternal, ...task.pics.map((pic) => pic.name)]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query) || task.children.some((child) => taskContains(child, query))
  );
}

function collectExpandable(project: ProjectSchedule, target: Set<string>) {
  target.add(projectKey(project.projectId));
  const visit = (tasks: ScheduleTask[]) => {
    for (const task of tasks) {
      if (task.children.length) target.add(taskKey(project.projectId, task.id));
      visit(task.children);
    }
  };
  visit(project.tasks);
}

function flattenProject(
  project: ProjectSchedule,
  expanded: Set<string>,
  query: string,
): TimelineRow[] {
  const result: TimelineRow[] = [{ kind: "project", project, depth: 0 }];
  if (!expanded.has(projectKey(project.projectId)) && !query) return result;
  const visit = (tasks: ScheduleTask[], depth: number) => {
    for (const task of tasks) {
      if (query && !taskContains(task, query)) continue;
      result.push({ kind: "task", project, task, depth });
      if (task.children.length && (query || expanded.has(taskKey(project.projectId, task.id)))) {
        visit(task.children, depth + 1);
      }
    }
  };
  visit(project.tasks, 1);
  return result;
}

function taskCount(tasks: ScheduleTask[]): number {
  return tasks.reduce((sum, task) => sum + 1 + taskCount(task.children), 0);
}

function barPosition(start: string | null, finish: string | null, first: string, last: string) {
  if (!start || !finish) return null;
  const windowStart = dayNumber(first);
  const windowEnd = dayNumber(last) + 1;
  const barStart = Math.max(dayNumber(start), windowStart);
  const barEnd = Math.min(dayNumber(finish) + 1, windowEnd);
  if (!Number.isFinite(barStart) || !Number.isFinite(barEnd) || barEnd <= barStart) return null;
  return {
    left: ((barStart - windowStart) / (windowEnd - windowStart)) * 100,
    width: ((barEnd - barStart) / (windowEnd - windowStart)) * 100,
  };
}

export function ProductionProjectTimeline({ openProjectSchedule }: Props) {
  const { lang, t } = useLanguage();
  const [schedules, setSchedules] = useState<ProjectSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [start, setStart] = useState(() => dateFromDay(dayNumber(today()) - 14));
  const [horizon, setHorizon] = useState("16");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadSchedules();
      setSchedules(result.schedules);
      setSkipped(result.skippedSchedules);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("Could not load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const weeks = useMemo(() => planningWeeks(start || today(), Number(horizon)), [start, horizon]);
  const search = normalized(query);
  const projects = useMemo(
    () =>
      schedules.filter((project) => {
        if (status !== "All statuses" && project.projectStatus !== status) return false;
        if (!search) return true;
        return (
          [project.projectNo, project.projectName, project.projectStatus]
            .join(" ")
            .toLocaleLowerCase()
            .includes(search) || project.tasks.some((task) => taskContains(task, search))
        );
      }),
    [schedules, search, status],
  );
  const rows = projects.flatMap((project) => flattenProject(project, expanded, search));
  const statuses = [...new Set(schedules.map((project) => project.projectStatus))].sort();
  const totalTasks = schedules.reduce((sum, project) => sum + taskCount(project.tasks), 0);
  const blocked = schedules.reduce((sum, project) => sum + project.summary.blockedCount, 0);
  const lateProjects = schedules.filter(
    (project) =>
      project.summary.percentComplete < 100 &&
      Boolean(project.summary.planFinish && project.summary.planFinish < today()),
  ).length;
  const averageProgress = schedules.length
    ? Math.round(
        schedules.reduce((sum, project) => sum + project.summary.percentComplete, 0) /
          schedules.length,
      )
    : 0;
  const firstDay = weeks[0]?.start ?? start;
  const lastDay = weeks.at(-1)?.end ?? start;
  const todayPosition = barPosition(today(), today(), firstDay, lastDay)?.left;
  const locale = lang === "TH" ? "th-TH" : lang === "JP" ? "ja-JP" : "en-GB";
  const formatWeek = (value: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
      new Date(`${value}T00:00:00`),
    );
  const shiftWindow = (direction: -1 | 1) =>
    setStart(dateFromDay(dayNumber(start) + direction * Number(horizon) * 7));
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const expandAll = () => {
    const next = new Set<string>();
    for (const project of projects) collectExpandable(project, next);
    setExpanded(next);
  };
  const timelineStyle = {
    "--timeline-weeks": weeks.length,
    "--timeline-width": `${Math.max(weeks.length * 92, 920)}px`,
  } as CSSProperties;

  return (
    <div className="project-timeline-page">
      <PageHeader
        eyebrow={t("PROJECT CONTROL")}
        title={t("Project Timeline")}
        subtitle={t("See every project, expand its tasks, and spot schedule risk in one Gantt view.")}
        actions={
          <button type="button" className="btn default" disabled={loading} onClick={() => void load()}>
            <Icon name="refresh" />
            {t("Refresh")}
          </button>
        }
      />

      {error && (
        <div className="callout danger" role="alert">
          {error}
        </div>
      )}
      {skipped > 0 && (
        <div className="callout warning" role="status">
          {skipped} {t("project schedule(s) could not be loaded")}
        </div>
      )}

      <div className="kpi-grid four">
        <KpiCard label={t("Projects on timeline")} value={schedules.length} note={t("Loaded project schedules")} tone="blue" icon="folder" />
        <KpiCard label={t("Total tasks")} value={totalTasks} note={t("Across all loaded projects")} tone="slate" icon="table" />
        <KpiCard label={t("Schedule risks")} value={lateProjects + blocked} note={`${lateProjects} ${t("late projects")} · ${blocked} ${t("blocked tasks")}`} tone={lateProjects + blocked ? "red" : "green"} icon="alertTriangle" />
        <KpiCard label={t("Average progress")} value={`${averageProgress}%`} note={t("Across all projects")} tone="green" icon="trendingUp" />
      </div>

      <div className="toolbar project-timeline-toolbar" aria-label={t("Project timeline filters")}>
        <div className="project-timeline-filter search">
          <span>{t("Search")}</span>
          <SearchInput value={query} onChange={setQuery} placeholder={t("Search project, task, WBS or engineer…")} />
        </div>
        <div className="project-timeline-filter">
          <span>{t("Project status")}</span>
          <Select label="Project status" value={status} onChange={setStatus} options={["All statuses", ...statuses]} />
        </div>
        <div className="project-timeline-filter range">
          <span>{t("Planning window")}</span>
          <div className="project-timeline-window">
            <button type="button" className="icon-btn" onClick={() => shiftWindow(-1)} aria-label={t("Previous period")} title={t("Previous period")}>
              <Icon name="chevronLeft" />
            </button>
            <label className="project-timeline-date">
              <input type="date" value={start} onChange={(event) => setStart(event.target.value)} aria-label={t("Start date")} />
            </label>
            <Select label="Timeline range" value={horizon} onChange={setHorizon} options={["8", "12", "16", "26"]} />
            <span className="project-timeline-weeks">{t("weeks")}</span>
            <button type="button" className="icon-btn" onClick={() => shiftWindow(1)} aria-label={t("Next period")} title={t("Next period")}>
              <Icon name="chevronRight" />
            </button>
            <button type="button" className="btn default" onClick={() => setStart(dateFromDay(dayNumber(today()) - 14))}>
              <Icon name="calendar" />
              {t("Today")}
            </button>
          </div>
        </div>
        <div className="project-timeline-actions">
          <button type="button" className="btn default" disabled={!projects.length} onClick={expandAll}>
            <Icon name="plus" />
            {t("Expand all")}
          </button>
          <button type="button" className="btn default" disabled={!expanded.size} onClick={() => setExpanded(new Set())}>
            <Icon name="minus" />
            {t("Collapse all")}
          </button>
        </div>
      </div>

      <div className="project-timeline-legend" aria-label={t("Timeline legend")}>
        <span>{t("Legend")}</span>
        <i className="project" /> {t("Project")}
        <i className="task" /> {t("Task")}
        <i className="done" /> {t("Completed")}
        <i className="risk" /> {t("Late / blocked")}
        <small>{t("The filled part of each bar is progress")}</small>
      </div>

      <Panel
        title={t("Portfolio Gantt")}
        subtitle={`${projects.length} ${t("projects")} · ${rows.length} ${t("visible rows")} · ${formatWeek(firstDay)} – ${formatWeek(lastDay)}`}
        flush
      >
        {loading ? (
          <div className="project-timeline-loading" role="status">
            <span className="spinner" />
            {t("Loading project schedules…")}
          </div>
        ) : projects.length ? (
          <div className="project-timeline-scroll" role="region" style={timelineStyle} aria-label={t("Project timeline Gantt chart")}>
            <div className="project-gantt">
              <div className="project-gantt-head">
                <div className="project-gantt-side-head">{t("Project / task")}</div>
                <div className="project-gantt-weeks">
                  {weeks.map((week) => (
                    <span key={week.start} className={today() >= week.start && today() <= week.end ? "current" : ""}>
                      <strong>{formatWeek(week.start)}</strong>
                      <small>{new Date(`${week.start}T00:00:00`).getFullYear()}</small>
                    </span>
                  ))}
                </div>
              </div>
              {rows.map((row) => {
                const isProject = row.kind === "project";
                const item = isProject ? row.project.summary : row.task;
                const bar = barPosition(item.planStart, item.planFinish, firstDay, lastDay);
                const progress = isProject ? row.project.summary.percentComplete : row.task.percentComplete;
                const statusText = isProject ? row.project.projectStatus : row.task.status;
                const isRisk =
                  statusText === "Blocked" ||
                  (progress < 100 && Boolean(item.planFinish && item.planFinish < today()));
                const hasChildren = isProject ? row.project.tasks.length > 0 : row.task.children.length > 0;
                const key = isProject ? projectKey(row.project.projectId) : taskKey(row.project.projectId, row.task.id);
                const isExpanded = search ? true : expanded.has(key);
                return (
                  <div className={`project-gantt-row ${isProject ? "project-row" : "task-row"}`} key={isProject ? key : `${key}:${row.depth}`}>
                    <div className="project-gantt-side">
                      <div className="project-gantt-name" style={{ paddingLeft: isProject ? 0 : Math.min(row.depth - 1, 4) * 18 }}>
                        {hasChildren ? (
                          <button type="button" className="project-gantt-toggle" onClick={() => toggle(key)} aria-expanded={isExpanded} aria-label={t(isExpanded ? "Collapse" : "Expand")}>
                            <Icon name={isExpanded ? "chevronDown" : "chevronRight"} />
                          </button>
                        ) : (
                          <span className="project-gantt-toggle-spacer" />
                        )}
                        <span className={`project-gantt-kind ${isProject ? "project" : row.task.isMilestone ? "milestone" : row.task.kind}`} />
                        <button type="button" className="project-gantt-label" onClick={() => openProjectSchedule?.(row.project.projectId)}>
                          <strong>
                            {isProject ? row.project.projectNo : row.task.wbs} <LocalizedText text={"·"} /> {isProject ? row.project.projectName : row.task.name}
                          </strong>
                          <small>
                            {isProject
                              ? `${row.project.summary.taskCount} ${t("tasks")} · ${row.project.summary.doneCount} ${t("done")}`
                              : `${row.task.pics.map((pic) => pic.name).join(", ") || row.task.picExternal || t("No PIC")} · ${row.task.planDays} ${t("days")}`}
                          </small>
                        </button>
                        <Badge tone={isRisk ? "red" : progress >= 100 ? "green" : "slate"}>{statusText}</Badge>
                      </div>
                    </div>
                    <div className="project-gantt-track">
                      {todayPosition !== undefined && <span className="project-gantt-today" style={{ left: `${todayPosition}%` }} />}
                      {bar ? (
                        <button
                          type="button"
                          className={`project-timeline-bar ${isProject ? "project" : "task"}${progress >= 100 ? " done" : ""}${isRisk ? " risk" : ""}`}
                          style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                          title={`${isProject ? row.project.projectNo : row.task.wbs} · ${item.planStart} → ${item.planFinish} · ${progress}%`}
                          onClick={() => openProjectSchedule?.(row.project.projectId)}
                        >
                          <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                          <span>{progress}%</span>
                        </button>
                      ) : (
                        <span className="project-gantt-no-date">{t("No dates in this window")}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState icon="calendar" title={t("No projects found")} message={t("Try changing the search, status, or planning window.")} />
        )}
      </Panel>
    </div>
  );
}
