"use client";
/* The team board as a Gantt (owner request 2026-10-22): one row per person, expanded into their work in the same
   filters as the grid and the list (RFQs, estimates, project work, appointments and site visits, added tasks, days
   away). A person's own row draws every piece of their work on one line, stacked where they overlap, so a collapsed
   chart still shows who is busy when. Bars are planned dates; clicking one opens the task or the work, as a chip on
   the grid does. */

import { useMemo, useState, type ReactNode } from "react";
import { ganttWindow, shiftGanttAnchor } from "../../../lib/gantt";
import { useT } from "../i18n";
import { Icon, type Tone } from "../ui";
import { useFullscreen } from "../use-fullscreen";
import { GanttChart, GanttToolbar, type GanttRowSpec, type GanttZoomChoice } from "./GanttChart";

/** One piece of work on a person's row, already filtered and labelled by the board. */
export type GanttWork = {
  key: string;
  label: ReactNode;
  meta: string;
  title: string;
  start: string | null;
  end: string | null;
  tone: Tone;
  onOpen?: () => void;
};
export type GanttPerson = { key: string; name: string; meta: string; work: GanttWork[] };

/** The bar colours, as the board's rowTone sets them. */
const LEGEND: Array<[Tone, string[]]> = [
  ["blue", ["TeamBoard.listRfq"]], ["green", ["TeamBoard.listEst"]], ["violet", ["TeamBoard.chipPrj"]],
  ["amber", ["TeamBoard.listAppointment"]], ["slate", ["TeamBoard.kindTask", "TeamBoard.typeAway"]], ["red", ["TeamBoard.late"]],
];

export function TeamBoardGantt({ people, today }: { people: GanttPerson[]; today: string }) {
  const t = useT();
  const { ref, active, overlay, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>();
  const [zoom, setZoom] = useState<GanttZoomChoice>("month");
  const [anchor, setAnchor] = useState(today);
  // Everyone starts open: the filters above already narrow who is shown.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const range = useMemo(() => ganttWindow(zoom === "fit" ? "month" : zoom, anchor), [zoom, anchor]);
  const withWork = people.filter((person) => person.work.length > 0);
  const toggle = (key: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const rows: GanttRowSpec[] = [];
  for (const person of withWork) {
    const open = !collapsed.has(person.key);
    rows.push({
      key: `person:${person.key}`, depth: 0, kind: "project", label: person.name, meta: person.meta,
      expandable: true, expanded: open, onToggle: () => toggle(person.key), start: null, finish: null, tone: "slate",
      segments: person.work.map((work) => ({ key: work.key, start: work.start, finish: work.end ?? work.start, tone: work.tone, title: work.title, ...(work.onOpen ? { onOpen: work.onOpen } : {}) })),
      title: `${person.name} · ${person.meta}`,
    });
    if (open) for (const work of person.work)
      rows.push({
        key: `work:${person.key}:${work.key}`, depth: 1, kind: "task", label: work.label, meta: work.meta,
        ...(work.onOpen ? { onOpen: work.onOpen } : {}), start: work.start, finish: work.end ?? work.start, tone: work.tone, title: work.title,
      });
  }

  return <div ref={ref} className={`board-gantt${active ? " is-fullscreen" : ""}${overlay ? " is-overlay" : ""}`}>
    <div className="board-gantt-bar">
      <GanttToolbar zoom={zoom} onZoom={setZoom} onShift={(direction) => setAnchor((value) => shiftGanttAnchor(zoom === "fit" ? "month" : zoom, value, direction))} onToday={() => setAnchor(today)} />
      <div className="gantt-nav">
        <button type="button" className="btn ghost sm" disabled={!collapsed.size} onClick={() => setCollapsed(new Set())}><Icon name="plus" />{t("Workload.expandPeople")}</button>
        <button type="button" className="btn ghost sm" disabled={collapsed.size === withWork.length} onClick={() => setCollapsed(new Set(withWork.map((person) => person.key)))}><Icon name="minus" />{t("Gantt.collapseAll")}</button>
        <button type="button" className="btn ghost sm" aria-pressed={active} title={t(active ? "Gantt.exitFullScreen" : "Gantt.fullScreen")} onClick={() => { void toggleFullscreen(); }}>
          <Icon name={active ? "minimize" : "maximize"} />{t(active ? "Gantt.exitFullScreen" : "Gantt.fullScreen")}
        </button>
      </div>
      <ul className="gantt-legend board-gantt-legend" aria-label={t("Gantt.legend")}>
        {LEGEND.map(([tone, keys]) => <li key={tone}><i className={`board-gantt-key ${tone}`} aria-hidden="true" />{keys.map((key) => t(key)).join(" · ")}</li>)}
      </ul>
      <span className="muted board-gantt-note">{t("TeamBoard.ganttNote")}</span>
    </div>
    {rows.length
      ? <GanttChart rows={rows} range={range} today={today} sideHeader="TeamBoard.person" label="TeamBoard.ganttLabel" />
      : <p className="muted board-gantt-empty">{t("TeamBoard.noWork")}</p>}
  </div>;
}
