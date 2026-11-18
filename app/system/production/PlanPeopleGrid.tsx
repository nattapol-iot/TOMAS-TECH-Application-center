"use client";
/* Projects > Plan, the People table (owner request 2026-11-18): the plan rows against the days, with the number of
   people on each day typed like a spreadsheet, and each row marked as our own staff or outsourced manpower.
   Click a day and type; drag over several days and type once; Delete clears; a block copied from Excel pastes in.
   A row's man-days are the people typed on it. A figure is labor for the day and may be a share: one person on two
   tasks a day is 0.5 on each; a day where the same PIC adds up to more than one man-day gets an amber edge. Edits save by themselves a moment after typing stops, every touched
   row in one call (PUT /projects/:id/schedule/people). The rules for a row's span are in lib/plan-people.ts. */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { Icon } from "../ui";
import { addDays, applyPeople, figureText, fillPeople, isWorkDay, mondayOf, overbookedDays, parsePastedBlock, peopleManDays, peopleOn, sameSpan, tenth, usualPeople, weekDay, type PeopleSpan } from "../../../lib/plan-people";

export type PeopleTask = {
  id: number; wbs: string; depth: number; kind: string; name: string; isMilestone: boolean;
  planStart: string | null; planDays: number; planManDays: number;
  laborSource?: string; laborSupplier?: string; peopleByDay?: number[]; managedByResourcePlan?: boolean;
  pics?: { id: number; name: string }[];
  children: PeopleTask[];
};

type Draft = { span?: PeopleSpan | null; laborSource?: string; laborSupplier?: string };
type RowModel = {
  task: PeopleTask; type: "heading" | "rollup" | "work"; editIndex: number; outsourced: boolean; supplier: string;
  /** People per shown day: null outside the row's dates, 0 inside them with nobody set. */
  cells: (number | null)[]; manDays: number; usual: number | null;
  /** Days where one of the row's PICs is on several rows for more than one man-day in all (lib/plan-people.ts overbookedDays). */
  clash: ReadonlyMap<number, { name: string; total: number }> | null;
};
type Selection = { ar: number; ac: number; fr: number; fc: number };

const WEEKS = 12, DAYS = WEEKS * 7, SAVE_DELAY_MS = 700;
const savedSpan = (task: PeopleTask): PeopleSpan | null => (task.planStart ? { start: task.planStart, days: task.planDays, people: task.peopleByDay ?? [] } : null);
const isConflict = (error: unknown) => error instanceof ApiClientError && error.status === 409 && error.code === "concurrency_conflict";
const figure = (value: number) => new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 2 }).format(value);
/** A day's figure as the cell shows it: nothing for nobody, one decimal place at most. */
const shown = (value: number | null) => (value ? String(tenth(value)) : "");

export function PlanPeopleGrid({ projectId, scheduleVersion, tasks, holidays, canEdit, lockedIds, today, notify, onReload, onOpenTask }: {
  projectId: number; scheduleVersion: string | null; tasks: PeopleTask[]; holidays: string[]; canEdit: boolean;
  /** Rows that wait on a day request: the server refuses date changes on them. */
  lockedIds: ReadonlySet<number | null>; today: string; notify: (message: string) => void; onReload: () => Promise<void>; onOpenTask: (taskId: number) => void;
}) {
  const t = useT();
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const [drafts, setDrafts] = useState<ReadonlyMap<number, Draft>>(new Map());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<{ drafts: ReadonlyMap<number, Draft>; message: string } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const planStart = useMemo(() => {
    let first: string | null = null;
    const visit = (task: PeopleTask) => { if (task.planStart && (first === null || task.planStart < first)) first = task.planStart; task.children.forEach(visit); };
    tasks.forEach(visit);
    return first as string | null;
  }, [tasks]);
  // Opens on last week when the plan is already running, on the plan's first week when it lies ahead.
  const [anchor, setAnchor] = useState(() => mondayOf(planStart && planStart > today ? planStart : addDays(today, -7)));
  const days = useMemo(() => Array.from({ length: DAYS }, (_, index) => addDays(anchor, index)), [anchor]);
  const dayClass = useMemo(() => days.map((day) => `${weekDay(day) === 0 || weekDay(day) === 6 ? " we" : ""}${holidaySet.has(day) ? " hol" : ""}${day === today ? " today" : ""}${weekDay(day) === 0 ? " sun" : ""}`), [days, holidaySet, today]);

  const model = useMemo(() => {
    const rows: RowModel[] = [], total = Array<number>(DAYS).fill(0), own = Array<number>(DAYS).fill(0), out = Array<number>(DAYS).fill(0);
    let ownManDays = 0, outManDays = 0, editIndex = 0;
    const visit = (task: PeopleTask): { cells: (number | null)[]; manDays: number } => {
      const draft = drafts.get(task.id), outsourced = (draft?.laborSource ?? task.laborSource ?? "Own") === "Outsourced";
      const supplier = outsourced ? draft?.laborSupplier ?? task.laborSupplier ?? "" : "";
      if (task.kind === "phase" || task.children.length) {
        const row: RowModel = { task, type: task.kind === "phase" ? "heading" : "rollup", editIndex: -1, outsourced, supplier, cells: Array<number | null>(DAYS).fill(null), manDays: 0, usual: null, clash: null };
        rows.push(row);
        for (const child of task.children) {
          const below = visit(child);
          row.manDays += below.manDays;
          below.cells.forEach((value, index) => { if (value !== null) row.cells[index] = (row.cells[index] ?? 0) + value; });
        }
        return row;
      }
      const span = draft && draft.span !== undefined ? draft.span : savedSpan(task);
      const typed = peopleManDays(span?.people ?? []);
      // A row with people has its man-days from them; one never typed keeps the figure typed on it.
      const manDays = typed > 0 ? typed : task.peopleByDay?.length ? 0 : Number(task.planManDays) || 0;
      const editable = canEdit && !task.isMilestone && !task.managedByResourcePlan && !lockedIds.has(task.id);
      const cells = days.map((day) => (task.isMilestone ? null : peopleOn(span, day)));
      const mine = outsourced ? out : own;
      cells.forEach((value, index) => { if (value) { total[index] = (total[index] ?? 0) + value; mine[index] = (mine[index] ?? 0) + value; } });
      if (outsourced) outManDays += manDays; else ownManDays += manDays;
      const row: RowModel = { task, type: "work", editIndex: editable ? editIndex++ : -1, outsourced, supplier, cells, manDays, usual: usualPeople(span?.people ?? []), clash: null };
      rows.push(row);
      return row;
    };
    tasks.forEach(visit);
    // Our own rows only: the people of an outsourced row are the supplier's, not its PIC.
    const clashes = overbookedDays(rows.map((row) => ({ people: row.type === "work" && !row.outsourced ? row.task.pics ?? [] : [], cells: row.cells })));
    for (const [index, days] of clashes) rows[index]!.clash = days;
    return { rows, total, own, out, ownManDays, outManDays, editRows: rows.filter((row) => row.editIndex >= 0) };
  }, [tasks, drafts, days, canEdit, lockedIds]);

  // Every handler below reads the latest state through this, so the row components keep stable props.
  const live = useRef({ model, drafts, selection, days, scheduleVersion, notify, onReload, t });
  useLayoutEffect(() => { live.current = { model, drafts, selection, days, scheduleVersion, notify, onReload, t }; });
  const input = useRef<HTMLInputElement | null>(null), focused = useRef<HTMLInputElement | null>(null), dirty = useRef(false), scroller = useRef<HTMLDivElement | null>(null);
  // The box of the active cell takes the keyboard when it appears; one that is already there is left alone, so a
  // click elsewhere on the page keeps the focus it took.
  useEffect(() => {
    const field = input.current;
    if (field && field !== focused.current) { field.focus({ preventScroll: true }); field.select(); }
    focused.current = field;
  });
  const prefs = useRef(new Map<number, number>());

  const change = useCallback((taskId: number, patch: (draft: Draft, task: PeopleTask) => Draft | null) => {
    const task = live.current.model.rows.find((row) => row.task.id === taskId)?.task;
    if (!task) return;
    setFailed(null);
    setDrafts((current) => {
      const next = patch(current.get(taskId) ?? {}, task);
      if (!next) return current;
      const map = new Map(current); map.set(taskId, next); return map;
    });
  }, []);
  /** Figures typed on days, by editable row: each row's span follows them (lib/plan-people.ts applyPeople). */
  const typeCells = useCallback((edits: ReadonlyMap<number, ReadonlyMap<string, number>>) => {
    setFailed(null);
    setDrafts((current) => {
      const map = new Map(current);
      for (const [index, byDay] of edits) {
        const task = live.current.model.editRows[index]?.task;
        if (!task) continue;
        const draft = map.get(task.id) ?? {}, base = draft.span !== undefined ? draft.span : savedSpan(task), span = applyPeople(base, byDay);
        if (!sameSpan(span, base)) map.set(task.id, { ...draft, span });
      }
      return map;
    });
  }, []);

  // Saving: a moment after the last edit, every touched row in one call; then the plan is read again and the rows
  // that were sent leave the drafts unless they were edited meanwhile.
  useEffect(() => {
    if (!drafts.size || saving || failed?.drafts === drafts) return;
    const timer = window.setTimeout(() => {
      const sent = drafts;
      const rows = [...sent].map(([taskId, draft]) => ({ taskId, ...(draft.laborSource !== undefined ? { laborSource: draft.laborSource } : {}), ...(draft.laborSupplier !== undefined ? { laborSupplier: draft.laborSupplier } : {}),
        ...(draft.span ? { planStart: draft.span.start, planDays: draft.span.days, people: draft.span.people } : {}) })).filter((row) => Object.keys(row).length > 1);
      if (!rows.length) { setDrafts(new Map()); return; }
      setSaving(true);
      void (async () => {
        try {
          await apiRequest(`/api/v1/projects/${projectId}/schedule/people`, { method: "PUT", body: JSON.stringify({ scheduleVersion: live.current.scheduleVersion, rows }) });
          await live.current.onReload();
          setDrafts((current) => { const map = new Map(current); for (const [taskId, draft] of sent) if (map.get(taskId) === draft) map.delete(taskId); return map; });
        } catch (failure) {
          if (isConflict(failure)) { live.current.notify(live.current.t("People.conflict")); setDrafts(new Map()); await live.current.onReload().catch(() => undefined); }
          else setFailed({ drafts: sent, message: failure instanceof Error ? failure.message : "The request could not be completed." });
        } finally { setSaving(false); }
      })();
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [drafts, saving, failed, projectId]);

  const box = (target: Selection) => ({ r0: Math.min(target.ar, target.fr), r1: Math.max(target.ar, target.fr), c0: Math.min(target.ac, target.fc), c1: Math.max(target.ac, target.fc) });
  const setRange = useCallback((count: number) => {
    const { selection: target, days: shown } = live.current;
    if (!target) return;
    const area = box(target), edits = new Map<number, Map<string, number>>();
    for (let row = area.r0; row <= area.r1; row++) { const byDay = new Map<string, number>(); for (let column = area.c0; column <= area.c1; column++) byDay.set(shown[column]!, count); edits.set(row, byDay); }
    typeCells(edits);
  }, [typeCells]);
  const commit = useCallback(() => {
    if (!dirty.current || !live.current.selection) return;
    dirty.current = false;
    const text = input.current?.value.trim() ?? "";
    setRange(text === "" ? 0 : Math.min(999, Number.parseFloat(text) || 0));
  }, [setRange]);
  /** Enter on untouched cells: the empty days of the selection take each row's People/day. */
  const fillUsual = useCallback(() => {
    const { selection: target, days: shown, model: current } = live.current;
    if (!target) return;
    const area = box(target), edits = new Map<number, Map<string, number>>();
    for (let index = area.r0; index <= area.r1; index++) {
      const row = current.editRows[index], usual = row ? row.usual ?? prefs.current.get(row.task.id) ?? null : null;
      if (!row || !usual) continue;
      const byDay = new Map<string, number>();
      for (let column = area.c0; column <= area.c1; column++) if (!row.cells[column]) byDay.set(shown[column]!, usual);
      if (byDay.size) edits.set(index, byDay);
    }
    if (edits.size) typeCells(edits);
  }, [typeCells]);
  const move = useCallback((rows: number, columns: number, extend: boolean) => {
    setSelection((current) => {
      if (!current) return current;
      const last = live.current.model.editRows.length - 1, clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
      if (extend) return { ...current, fr: clamp(current.fr + rows, last), fc: clamp(current.fc + columns, DAYS - 1) };
      const row = clamp(current.ar + rows, last), column = clamp(current.ac + columns, DAYS - 1);
      return { ar: row, ac: column, fr: row, fc: column };
    });
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const field = event.currentTarget, arrow = arrows[event.key];
    if (arrow) { event.preventDefault(); commit(); move(arrow[0], arrow[1], event.shiftKey); }
    else if (event.key === "Enter") { event.preventDefault(); if (dirty.current) commit(); else fillUsual(); move(event.shiftKey ? -1 : 1, 0, false); }
    else if (event.key === "Escape") { field.value = field.defaultValue; dirty.current = false; field.select(); }
    else if (event.key === "Delete" || (event.key === "Backspace" && field.selectionStart === 0 && field.selectionEnd === field.value.length)) {
      event.preventDefault(); field.value = ""; dirty.current = false; setRange(0);
    }
  }, [commit, fillUsual, move, setRange]);
  const onInput = useCallback((event: React.FormEvent<HTMLInputElement>) => { event.currentTarget.value = figureText(event.currentTarget.value); dirty.current = true; }, []);
  const onPaste = useCallback((event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text"), target = live.current.selection;
    if (!target || !/[\t\n]/.test(text.trim())) return;
    event.preventDefault();
    const block = parsePastedBlock(text), area = box(target), edits = new Map<number, Map<string, number>>();
    let width = 1;
    block.forEach((line, down) => {
      const row = area.r0 + down;
      if (row >= live.current.model.editRows.length) return;
      width = Math.max(width, line.length);
      const byDay = new Map<string, number>();
      line.forEach((value, across) => { const day = live.current.days[area.c0 + across]; if (day && value !== null) byDay.set(day, value); });
      if (byDay.size) edits.set(row, byDay);
    });
    dirty.current = false;
    const first = block[0]?.[0];
    if (target.ar === area.r0 && target.ac === area.c0 && first !== null && first !== undefined) event.currentTarget.value = first ? String(first) : "";
    typeCells(edits);
    setSelection({ ar: area.r0, ac: area.c0, fr: Math.min(live.current.model.editRows.length - 1, area.r0 + block.length - 1), fc: Math.min(DAYS - 1, area.c0 + width - 1) });
  }, [typeCells]);
  const onBlur = useCallback(() => {
    commit();
    // Focus that left the day cells (not an arrow key moving the box to the next one) puts the selection away.
    window.setTimeout(() => { if (!(document.activeElement instanceof HTMLElement) || !document.activeElement.classList.contains("people-cell")) setSelection(null); }, 0);
  }, [commit]);
  // Picking cells with the mouse: press on one, drag to another; Shift and a click runs the selection to that cell.
  useEffect(() => {
    const frame = scroller.current;
    if (!frame) return;
    let dragging = false;
    const cellOf = (target: EventTarget | null): { row: number; column: number } | null => {
      const cell = target instanceof Element ? target.closest<HTMLElement>("td[data-row]") : null;
      return cell ? { row: Number(cell.dataset.row), column: Number(cell.dataset.column) } : null;
    };
    const down = (event: MouseEvent) => {
      const cell = event.button === 0 ? cellOf(event.target) : null;
      if (!cell) return;
      event.preventDefault(); commit(); dragging = true;
      setSelection((current) => (event.shiftKey && current ? { ...current, fr: cell.row, fc: cell.column } : { ar: cell.row, ac: cell.column, fr: cell.row, fc: cell.column }));
    };
    const over = (event: MouseEvent) => {
      const cell = dragging ? cellOf(event.target) : null;
      if (cell) setSelection((current) => (current && (current.fr !== cell.row || current.fc !== cell.column) ? { ...current, fr: cell.row, fc: cell.column } : current));
    };
    const up = () => { dragging = false; };
    frame.addEventListener("mousedown", down); frame.addEventListener("mouseover", over); window.addEventListener("mouseup", up);
    return () => { frame.removeEventListener("mousedown", down); frame.removeEventListener("mouseover", over); window.removeEventListener("mouseup", up); };
  }, [commit]);
  // Keeps the cell the selection runs to clear of the frozen columns and the frame's edge.
  useEffect(() => {
    const frame = scroller.current, cell = selection && frame ? frame.querySelector<HTMLElement>(`td[data-row="${selection.fr}"][data-column="${selection.fc}"]`) : null;
    if (!frame || !cell) return;
    const frozen = cell.parentElement?.querySelector<HTMLElement>(".people-md"), edge = frozen && getComputedStyle(frozen).position === "sticky" ? frozen.getBoundingClientRect().right : frame.getBoundingClientRect().left;
    const area = cell.getBoundingClientRect(), bounds = frame.getBoundingClientRect();
    if (area.left < edge) frame.scrollLeft -= edge - area.left + 4; else if (area.right > bounds.right) frame.scrollLeft += area.right - bounds.right + 4;
  }, [selection]);

  const setSource = useCallback((taskId: number, laborSource: string) => change(taskId, (draft, task) => ((draft.laborSource ?? task.laborSource ?? "Own") === laborSource ? null : { ...draft, laborSource })), [change]);
  const setSupplier = useCallback((taskId: number, laborSupplier: string) => change(taskId, (draft, task) => ((draft.laborSupplier ?? task.laborSupplier ?? "") === laborSupplier ? null : { ...draft, laborSupplier })), [change]);
  const setPeople = useCallback((taskId: number, count: number) => {
    prefs.current.set(taskId, count);
    change(taskId, (draft, task) => {
      const base = draft.span !== undefined ? draft.span : savedSpan(task);
      if (!base) return null;
      const span = fillPeople(base, count, holidaySet);
      return sameSpan(span, base) ? null : { ...draft, span };
    });
  }, [change, holidaySet]);

  const dayLabel = useMemo(() => new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "short", timeZone: "UTC" }), []);
  const weekdayLabel = useMemo(() => new Intl.DateTimeFormat(currentLocale(), { weekday: "narrow", timeZone: "UTC" }), []);
  const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
  const area = selection ? box(selection) : null;
  const peak = model.total.reduce((best, value, index) => (value > model.total[best]! ? index : best), 0);
  const allManDays = model.ownManDays + model.outManDays;
  const totals: { key: string; label: string; cells: number[]; manDays: number }[] = [
    { key: "all", label: "People.total", cells: model.total, manDays: allManDays },
    { key: "own", label: "People.own", cells: model.own, manDays: model.ownManDays },
    { key: "out", label: "People.out", cells: model.out, manDays: model.outManDays },
  ];

  return <div className="people-grid" data-guide="plan.people">
    <div className="people-bar">
      <span className="people-sum"><small>{t("People.own")}</small><strong className="own">{figure(model.ownManDays)}</strong><em>{t("MD")}</em></span>
      <span className="people-sum"><small>{t("People.out")}</small><strong className="out">{figure(model.outManDays)}</strong><em>{t("MD")}</em></span>
      {model.total[peak] ? <span className="people-sum"><small>{t("People.peak")}</small><strong>{figure(model.total[peak]!)}</strong><em>{dayLabel.format(asDate(days[peak]!))}</em></span> : null}
      <span className="people-state" role="status">
        {failed ? <><Icon name="alertTriangle" /><span className="people-error">{t(failed.message)}</span>
          <button className="btn ghost sm" type="button" onClick={() => setFailed(null)}>{t("People.retry")}</button>
          <button className="btn ghost sm" type="button" onClick={() => { setDrafts(new Map()); setFailed(null); }}>{t("People.discard")}</button></>
          : saving || drafts.size ? <><span className="spinner" />{t("People.saving")}</> : canEdit ? <em>{t("People.saved")}</em> : null}
      </span>
      <span className="gantt-nav">
        <button className="btn ghost sm" type="button" onClick={() => setAnchor((value) => addDays(value, -28))}><Icon name="chevronLeft" />{t("People.earlier")}</button>
        <button className="btn ghost sm" type="button" onClick={() => setAnchor(mondayOf(addDays(today, -7)))}>{t("Today")}</button>
        {planStart ? <button className="btn ghost sm" type="button" onClick={() => setAnchor(mondayOf(planStart))}>{t("People.planStart")}</button> : null}
        <button className="btn ghost sm" type="button" onClick={() => setAnchor((value) => addDays(value, 28))}>{t("People.later")}<Icon name="chevronRight" /></button>
      </span>
    </div>
    <div className="people-legend">
      <span><i className="people-key own" />{t("People.own")}</span><span><i className="people-key out" />{t("People.out")}</span>
      <span><i className="people-key unset" />{t("People.unset")}</span><span><i className="people-key we" />{t("People.weekend")}</span>
      <span><i className="people-key hol" />{t("People.holiday")}</span><span><i className="people-key clash" />{t("People.clash")}</span>
      {canEdit ? <span className="people-tips">{t("People.tipType")} · {t("People.tipRange")} · {t("People.tipHalf")} · {t("People.tipFill")} · {t("People.tipKeys")} · {t("People.tipPaste")}</span> : null}
    </div>
    <div className="people-scroll" ref={scroller}>
      <table className="people-table" aria-label={t("People.view")}>
        <thead>
          <tr>
            <th className="people-wbs" rowSpan={3} scope="col">WBS</th><th className="people-name" rowSpan={3} scope="col">{t("Task")}</th>
            <th className="people-src" rowSpan={3} scope="col">{t("People.whose")}</th><th className="people-ppl" rowSpan={3} scope="col">{t("People.perDay")}</th><th className="people-md" rowSpan={3} scope="col">{t("MD")}</th>
            {Array.from({ length: WEEKS }, (_, week) => <th key={week} className="people-week" colSpan={7}>{dayLabel.format(asDate(days[week * 7]!))}</th>)}
          </tr>
          <tr>{days.map((day, index) => <th key={day} className={`people-day${dayClass[index]}`}>{Number(day.slice(8))}</th>)}</tr>
          <tr>{days.map((day, index) => <th key={day} className={`people-day${dayClass[index]}`}>{weekdayLabel.format(asDate(day))}</th>)}</tr>
        </thead>
        <tbody>
          {totals.map((row) => <tr key={row.key} className={`people-total ${row.key}`}>
            <td className="people-wbs" /><td className="people-name">{t(row.label)}</td><td className="people-src" /><td className="people-ppl" /><td className="people-md">{figure(row.manDays)}</td>
            {row.cells.map((value, index) => <td key={index} className={`people-day${dayClass[index]}${shown(value).length > 3 ? " long" : ""}`}>{shown(value)}</td>)}
          </tr>)}
          {model.rows.map((row) => {
            const inside = area && row.editIndex >= area.r0 && row.editIndex <= area.r1;
            return <PeopleRow key={row.task.id} row={row} dayClass={dayClass} days={days} holidays={holidaySet} canEdit={canEdit}
              from={inside ? area.c0 : -1} to={inside ? area.c1 : -1} active={selection && selection.ar === row.editIndex ? selection.ac : -1}
              input={input} onKeyDown={onKeyDown} onInput={onInput} onPaste={onPaste} onBlur={onBlur}
              onSource={setSource} onSupplier={setSupplier} onPeople={setPeople} onOpenTask={onOpenTask} />;
          })}
        </tbody>
      </table>
    </div>
  </div>;
}

const PeopleRow = memo(function PeopleRow({ row, dayClass, days, holidays, canEdit, from, to, active, input, onKeyDown, onInput, onPaste, onBlur, onSource, onSupplier, onPeople, onOpenTask }: {
  row: RowModel; dayClass: string[]; days: string[]; holidays: ReadonlySet<string>; canEdit: boolean; from: number; to: number; active: number;
  input: React.MutableRefObject<HTMLInputElement | null>;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void; onInput: (event: React.FormEvent<HTMLInputElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => void; onBlur: () => void;
  onSource: (taskId: number, laborSource: string) => void; onSupplier: (taskId: number, laborSupplier: string) => void;
  onPeople: (taskId: number, count: number) => void; onOpenTask: (taskId: number) => void;
}) {
  const t = useT();
  const { task } = row, work = row.type === "work", editable = row.editIndex >= 0;
  const sourceEditable = canEdit && work && !task.isMilestone;
  return <tr className={`people-row ${row.type}${row.outsourced ? " outsourced" : ""}`}>
    <td className="people-wbs">{task.wbs}</td>
    <td className="people-name">
      <button type="button" className="people-task" style={{ paddingLeft: Math.max(0, task.depth - 1) * 12 }} onClick={() => onOpenTask(task.id)}>{task.name}</button>
      {work && row.outsourced ? sourceEditable
        ? <input key={row.supplier} className="people-supplier" maxLength={200} defaultValue={row.supplier} placeholder={t("People.supplier")} aria-label={`${t("People.supplier")} ${task.wbs}`}
            onBlur={(event) => onSupplier(task.id, event.currentTarget.value.trim())} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        : row.supplier ? <small className="people-supplier-text">{row.supplier}</small> : null : null}
    </td>
    <td className="people-src">{work && !task.isMilestone ? sourceEditable
      ? <span className="people-seg" role="group" aria-label={`${t("People.whose")} ${task.wbs}`}>
          <button type="button" className={row.outsourced ? "" : "on own"} aria-pressed={!row.outsourced} onClick={() => onSource(task.id, "Own")}>{t("People.ownShort")}</button>
          <button type="button" className={row.outsourced ? "on out" : ""} aria-pressed={row.outsourced} onClick={() => onSource(task.id, "Outsourced")}>{t("People.outShort")}</button>
        </span>
      : <span className={`people-mark ${row.outsourced ? "out" : "own"}`}>{t(row.outsourced ? "People.outShort" : "People.ownShort")}</span> : null}</td>
    <td className="people-ppl">{editable
      ? <input key={row.usual ?? "none"} className="people-usual" inputMode="decimal" maxLength={5} defaultValue={row.usual ?? ""} aria-label={`${t("People.perDay")} ${task.wbs}`}
          onInput={(event) => { event.currentTarget.value = figureText(event.currentTarget.value); }}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          onBlur={(event) => { const count = tenth(Number.parseFloat(event.currentTarget.value)); if (count > 0 && count !== row.usual) onPeople(task.id, count); }} />
      : work && row.usual ? row.usual : null}</td>
    <td className="people-md">{row.manDays ? figure(row.manDays) : ""}</td>
    {row.cells.map((value, index) => {
      const selected = index >= from && index <= to, unset = work && value === 0 && isWorkDay(days[index]!, holidays);
      const state = !work ? (value !== null ? " span" : "") : task.isMilestone ? "" : value ? (row.outsourced ? " out" : " own") : unset ? " unset" : "";
      const over = row.clash?.get(index), text = shown(value);
      return <td key={index} className={`people-day${dayClass[index]}${state}${selected ? " sel" : ""}${editable ? " edit" : ""}${over ? " clash" : ""}${text.length > 3 ? " long" : ""}`}
        title={over ? t("People.clashHint").replace("{name}", over.name).replace("{total}", String(over.total)) : undefined} {...(editable ? { "data-row": row.editIndex, "data-column": index } : {})}>
        {active === index
          ? <input ref={input} className="people-cell" inputMode="decimal" maxLength={5} autoComplete="off" defaultValue={text} aria-label={`${task.wbs} ${days[index]}`}
              onFocus={(event) => event.currentTarget.select()} onKeyDown={onKeyDown} onInput={onInput} onPaste={onPaste} onBlur={onBlur} />
          : text}
      </td>;
    })}
  </tr>;
});
