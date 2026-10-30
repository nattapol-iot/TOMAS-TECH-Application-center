"use client";
/* Who can take a plan row: everyone's load over the row's dates, read from the team board, so the plan owner sees
   whether a PIC has room before saving (Team overview shows the same numbers). The row's own saved effort is left
   out of "now", so changing a row does not count it twice. */

import { useEffect, useMemo, useState } from "react";
import type { BootstrapData } from "../api-client";
import { useT } from "../i18n";
import { loadTeamBoard, type TeamBoardData } from "../resource-workload-client";
import { dateFromDay, dayNumber, weeklyCapacity, workingDays, type Commitment } from "../../../lib/resource-planning";
import { covers, loadBand, outlookLoad, spanLoad } from "../../../lib/team-board";

/** The team board reads at most this many days at once (backend-node/src/routes/team-board.ts MAX_WINDOW_DAYS). */
const MAX_DAYS = 400;

export type PersonSpanLoad = { manDays: number; available: number; utilisation: number | null; awayDays: number };
export type PicLoads = {
  /** off: no team.board permission; waiting: the row has no dates yet. */
  state: "off" | "waiting" | "loading" | "ready" | "failed";
  from: string | null;
  to: string | null;
  byUser: Map<number, PersonSpanLoad>;
};

const pct = (value: number | null) => (value === null ? "—" : Number.isFinite(value) ? `${Math.round(value)}%` : "∞");
const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);

/** Everyone's load from `from` to `to` (a plan row's dates), without the row `taskId` itself. */
export function usePicLoads(bootstrap: BootstrapData, from: string | null, to: string | null, taskId: number | null): PicLoads {
  const allowed = bootstrap.permissions.includes("team.board");
  const end = from && to && to >= from ? dateFromDay(Math.min(dayNumber(to), dayNumber(from) + MAX_DAYS - 1)) : null;
  const key = allowed && from && end ? `${from}|${end}` : "";
  const [read, setRead] = useState<{ key: string; data: TeamBoardData | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let current = true;
    const [start = "", finish = ""] = key.split("|");
    // A date typed into the form changes on every keystroke; read once it settles.
    const timer = setTimeout(() => {
      loadTeamBoard(start, finish).then(
        (data) => { if (current) setRead({ key, data }); },
        () => { if (current) setRead({ key, data: null }); },
      );
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [key]);
  const data = read?.key === key ? read.data : null;
  const byUser = useMemo(() => {
    const loads = new Map<number, PersonSpanLoad>();
    if (!data || !from || !end) return loads;
    const own = taskId === null ? "" : `Project-${taskId}`;
    const items = new Map<number, Commitment[]>();
    for (const item of data.items) if (item.ownerId !== null && item.workKey !== own) {
      const list = items.get(item.ownerId);
      if (list) list.push(item); else items.set(item.ownerId, [item]);
    }
    const capacities = new Map(data.capacities.map((entry) => [entry.userId, entry.daysPerWeek]));
    const outlook = outlookLoad(data.outlook ?? []);
    const away = new Map<number, { start: string | null; end: string | null }[]>();
    const addAway = (userId: number, start: string | null, finish: string | null) => away.set(userId, [...(away.get(userId) ?? []), { start, end: finish }]);
    for (const entry of data.away) addAway(entry.userId, entry.start, entry.end);
    for (const task of data.tasks) if (task.kind === "Away" && task.status !== "Cancelled") for (const userId of task.assigneeIds) addAway(userId, task.startDate, task.endDate);
    const working = workingDays(from, end, data.holidays);
    for (const user of bootstrap.team) {
      const load = spanLoad(items.get(user.id) ?? [], from, end, weeklyCapacity(capacities.get(user.id)), data.holidays, (date) => outlook.get(`${user.id}|${date}`) ?? 0);
      const spans = away.get(user.id) ?? [];
      loads.set(user.id, { ...load, awayDays: spans.length ? working.filter((date) => spans.some((span) => covers(span.start, span.end, date))).length : 0 });
    }
    return loads;
  }, [data, bootstrap.team, from, end, taskId]);
  const state = !allowed ? "off" : !key ? "waiting" : read?.key !== key ? "loading" : read.data ? "ready" : "failed";
  return { state, from, to: end, byUser };
}

/** A person's load as the PIC list shows it beside their department. */
export function useLoadNote() {
  const t = useT();
  return (load: PersonSpanLoad | undefined) => !load ? "" : [
    fill(t("Plan.picLoadShort"), { pct: pct(load.utilisation ?? 0) }),
    load.awayDays ? fill(t("Plan.picLoadAway"), { n: load.awayDays }) : "",
  ].filter(Boolean).join(" · ");
}

/** The chosen PICs' load over the row's dates, now and with their share of its effort, and freer people to swap in. */
export function PicLoadPanel({ loads, chosen, manDays, team, onSwap, dateLabel }: {
  loads: PicLoads;
  chosen: number[];
  /** The row's planned effort, split across its PICs as the workload splits it. */
  manDays: number;
  team: BootstrapData["team"];
  onSwap: (from: number, to: number) => void;
  dateLabel: (date: string) => string;
}) {
  const t = useT();
  if (loads.state === "off") return null;
  if (loads.state !== "ready" || !chosen.length) {
    const note = loads.state === "waiting" ? "Plan.picLoadNeedsDates" : loads.state === "loading" ? "Plan.picLoadReading" : loads.state === "failed" ? "Plan.picLoadFailed" : "Plan.picLoadPick";
    return <p className="muted small plan-pic-note span-2">{loads.state === "loading" ? <span className="spinner" /> : null}{t(note)}</p>;
  }
  const nameOf = (id: number) => team.find((user) => user.id === id)?.name ?? `#${id}`;
  const departmentOf = (id: number) => team.find((user) => user.id === id)?.department ?? "";
  const share = manDays / chosen.length;
  const rows = chosen.map((id) => {
    const load = loads.byUser.get(id);
    const after = !load ? null : load.available > 0 ? ((load.manDays + share) / load.available) * 100 : load.manDays + share > 0 ? Infinity : null;
    return { id, load, after };
  });
  const highest = Math.max(0, ...rows.map((row) => row.after ?? 0));
  const worst = rows.filter((row) => row.after !== null && row.after > 100).sort((a, b) => (b.after ?? 0) - (a.after ?? 0))[0];
  // Their own team first; someone from another team only if they carry planned work at all (not, say, a salesperson).
  const freer = worst ? [...loads.byUser]
    .filter(([id, load]) => !chosen.includes(id) && load.available > 0 && (load.utilisation ?? 0) < 85 && !load.awayDays
      && (departmentOf(id) === departmentOf(worst.id) || load.manDays > 0))
    .sort(([a, left], [b, right]) => Number(departmentOf(b) === departmentOf(worst.id)) - Number(departmentOf(a) === departmentOf(worst.id))
      || (left.utilisation ?? 0) - (right.utilisation ?? 0))
    .slice(0, 3) : [];
  const tone = highest > 100 ? "danger" : highest >= 85 ? "warning" : "info";
  return <div className={`callout plan-pic-load ${tone} span-2`} role="status">
    <span>
      <strong>{fill(t("Plan.picLoadTitle"), { from: dateLabel(loads.from ?? ""), to: dateLabel(loads.to ?? "") })}</strong>
      <ul className="plan-pic-loads">{rows.map(({ id, load, after }) => <li key={id} className={loadBand(after)}>
        <b>{nameOf(id)}</b> {load ? `${pct(load.utilisation ?? 0)} → ${pct(after)}` : "—"}
        {load?.awayDays ? ` · ${fill(t("Plan.picLoadAway"), { n: load.awayDays })}` : ""}
      </li>)}</ul>
      {worst && freer.length ? <span className="plan-pic-freer">{fill(t("Plan.picLoadSwap"), { name: nameOf(worst.id) })}
        {freer.map(([id, load]) => <button key={id} type="button" className="btn default sm" onClick={() => onSwap(worst.id, id)}>{nameOf(id)} {pct(load.utilisation ?? 0)}</button>)}
      </span> : null}
      <small>{t("Plan.picLoadMethod")}</small>
    </span>
  </div>;
}
