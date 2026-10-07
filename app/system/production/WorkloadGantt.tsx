"use client";
/* Resource Plan > Team workload as a Gantt: one row per person, spanning their open work, expanded into that work in
   their own order. Each bar is the planned dates; the slip past a bar is when the work would be done if the person
   works through it in that order (lib/resource-planning.ts projectWork). Overlaps show as bars stacked in time. */

import { useMemo, useState } from "react";
import { ganttWindow, shiftGanttAnchor } from "../../../lib/gantt";
import type { Commitment, Projection } from "../../../lib/resource-planning";
import { useT } from "../i18n";
import { Icon, type Tone } from "../ui";
import { useFullscreen } from "../use-fullscreen";
import { GanttChart, GanttLegend, GanttToolbar, scheduleTone, type GanttRowSpec, type GanttZoomChoice } from "./GanttChart";

export type WorkloadGanttPerson = {
  user: { id: number; name: string; department: string };
  /** Their open work in their order. */
  ordered: Commitment[];
  projection: Map<string, Projection>;
  peak: number | null;
  projectedLate: number;
};

const loadTone = (peak: number | null): Tone => (peak === null ? "slate" : peak > 100 ? "red" : peak >= 85 ? "amber" : "green");
const earliest = (values: Array<string | null>) => values.filter((value): value is string => value !== null).sort()[0] ?? null;
const latest = (values: Array<string | null>) => values.filter((value): value is string => value !== null).sort().at(-1) ?? null;

export function WorkloadGantt({ people, today, onPerson, onOpen }: {
  people: WorkloadGanttPerson[];
  today: string;
  /** Opens the person's work order. */
  onPerson: (userId: number) => void;
  onOpen: (item: Commitment) => void;
}) {
  const t = useT();
  const { ref: fullscreenRef, active: fullscreenActive, overlay: fullscreenOverlay, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen<HTMLDivElement>();
  const [zoom, setZoom] = useState<GanttZoomChoice>("quarter");
  const [anchor, setAnchor] = useState(today);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const range = useMemo(() => ganttWindow(zoom === "fit" ? "quarter" : zoom, anchor), [zoom, anchor]);
  const withWork = people.filter((person) => person.ordered.length > 0);
  const toggle = (userId: number) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    return next;
  });
  const choose = (userId: number) => { void exitFullscreen(); onPerson(userId); };
  const openItem = (item: Commitment) => { void exitFullscreen(); onOpen(item); };

  const rows: GanttRowSpec[] = [];
  for (const person of people) {
    const isOpen = expanded.has(person.user.id);
    const projectedEnd = latest(person.ordered.map((item) => person.projection.get(item.key)?.finish ?? null));
    rows.push({
      key: `person:${person.user.id}`, depth: 0, kind: "project",
      label: person.user.name,
      meta: `${person.user.department} · ${person.ordered.length} ${t("Workload.open")}${person.projectedLate ? ` · ${t("WorkQueue.lateCount").replace("{n}", String(person.projectedLate))}` : ""}`,
      expandable: person.ordered.length > 0, expanded: isOpen, onToggle: () => toggle(person.user.id),
      onOpen: () => choose(person.user.id),
      start: earliest(person.ordered.map((item) => item.start)), finish: latest(person.ordered.map((item) => item.end)),
      tone: loadTone(person.peak), forecastFinish: projectedEnd,
      title: `${person.user.name} · ${person.ordered.length} ${t("Workload.open")}`,
    });
    if (!isOpen) continue;
    person.ordered.forEach((item, index) => {
      const projected = person.projection.get(item.key);
      rows.push({
        key: `work:${person.user.id}:${item.key}`, depth: 1, kind: "task",
        label: <><span className="mono">{index + 1}.</span> {item.reference}</>,
        meta: item.title,
        onOpen: () => openItem(item),
        start: item.start, finish: item.end, progress: item.progress,
        tone: scheduleTone({ status: item.status, planFinish: item.end, forecastFinish: projected?.finish ?? null, percentComplete: item.progress }, today),
        forecastFinish: projected?.finish ?? null,
        title: `${item.reference} ${item.title} · ${item.start ?? "—"} → ${item.end ?? "—"} · ${Math.round(item.progress)}%${projected?.finish ? ` · ${t("WorkQueue.projected").replace("{date}", projected.finish)}` : ""}`,
      });
    });
  }

  return <div ref={fullscreenRef} className={`workload-gantt${fullscreenActive ? " is-fullscreen" : ""}${fullscreenOverlay ? " is-overlay" : ""}`}>
    <div className="workload-gantt-bar">
      <GanttToolbar zoom={zoom} onZoom={setZoom} onShift={(direction) => setAnchor((value) => shiftGanttAnchor(zoom === "fit" ? "quarter" : zoom, value, direction))} onToday={() => setAnchor(today)} />
      <div className="gantt-nav">
        <button type="button" className="btn ghost sm" disabled={!withWork.length} onClick={() => setExpanded(new Set(withWork.map((person) => person.user.id)))}><Icon name="plus" />{t("Workload.expandPeople")}</button>
        <button type="button" className="btn ghost sm" disabled={!expanded.size} onClick={() => setExpanded(new Set())}><Icon name="minus" />{t("Gantt.collapseAll")}</button>
        <button type="button" className="btn ghost sm" aria-pressed={fullscreenActive} title={t(fullscreenActive ? "Gantt.exitFullScreen" : "Gantt.fullScreen")} onClick={() => { void toggleFullscreen(); }}>
          <Icon name={fullscreenActive ? "minimize" : "maximize"} />{t(fullscreenActive ? "Gantt.exitFullScreen" : "Gantt.fullScreen")}
        </button>
      </div>
      <GanttLegend />
      <span className="muted workload-gantt-note">{t("Workload.ganttNote")}</span>
    </div>
    <GanttChart rows={rows} range={range} today={today} sideHeader="Workload.person" label="Workload.ganttLabel" />
  </div>;
}
