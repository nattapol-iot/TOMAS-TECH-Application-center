"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  listProjectContactOptions,
  type BootstrapData,
  type PaymentMilestone,
  type ProjectContactOption,
  type ProjectHealth,
  type ProjectPlanHeading,
  type ScheduleTemplate,
} from "../api-client";
import { useT } from "../i18n";
import { Badge, Icon } from "../ui";
import { SearchMultiPicker } from "./SearchMultiPicker";
import { estimateBusinessDate } from "../../../lib/estimate-ux";
import { PROJECT_TEAMS } from "../../../lib/project-portfolio";
import { DateInput } from "../DateInput";

/*
 * The parts of a project that Create project and Edit project share: its Master Plan headings,
 * the Team Plan under them, the team it belongs to, the customer payments received, the
 * customer contacts it talks to, and how its plan is going.
 */

/*
 * The plan (owner, 2026-11-03): the Master Plan lists the main headings with the dates promised to the
 * customer; the Team Plan breaks each heading into tasks, each with a member, and each task into the
 * functions to build (2 Software development > 2.1 Web App WMS > 2.1.1 Inbound). id names the schedule row a
 * draft edits. A `locked` row has progress or linked work and cannot be removed; a row with `datesLocked`
 * takes its dates from the rows under it.
 */
/** A function's member 0 and blank dates mean its task's. */
export type PlanFunctionDraft = { key: string; id?: number; locked?: boolean; datesLocked?: boolean; name: string; userId: number; start: string; finish: string };
export type PlanTaskDraft = {
  key: string; id?: number; locked?: boolean; datesLocked?: boolean; userId: number; name: string; start: string; finish: string; planManDays: string;
  /** It cannot take its first function: it has progress, linked work or a member's own task. */
  noFunctions?: boolean; percent?: number; actualManDays?: number; functions: PlanFunctionDraft[];
};
export type PlanHeadingDraft = { key: string; id?: number; locked?: boolean; name: string; start: string; finish: string; tasks: PlanTaskDraft[] };

export const planPeriodValid = (row: { start: string; finish: string }) => Boolean(row.start && row.finish && row.finish >= row.start);
const headingPeriodValid = (row: PlanHeadingDraft) => (!row.tasks.length && !row.start && !row.finish) || planPeriodValid(row);
export const planManDaysValid = (value: string) => !value.trim() || /^\d{1,6}(\.\d{1,2})?$/.test(value.trim());
const shiftIsoDate = (iso: string, days: number) => { const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

const blankTask = (heading: PlanHeadingDraft): PlanTaskDraft => ({ key: crypto.randomUUID(), userId: 0, name: "", start: heading.start, finish: heading.finish, planManDays: "", functions: [] });
const blankFunction = (): PlanFunctionDraft => ({ key: crypto.randomUUID(), name: "", userId: 0, start: "", finish: "" });
/** A heading cannot go while anything under it must stay. */
const headingLocked = (heading: PlanHeadingDraft) => Boolean(heading.locked || heading.tasks.some((task) => task.locked || task.functions.some((item) => item.locked)));

/** A master schedule's rows as headings: days count from the chosen start, rows without them keep only their name. */
export const planFromTemplate = (template: ScheduleTemplate, start: string): PlanHeadingDraft[] => template.rows.map(row => {
  const first = row.startOffsetDays === null || !start ? "" : shiftIsoDate(start, row.startOffsetDays);
  return { key: crypto.randomUUID(), name: row.name, start: first, finish: first && row.durationDays ? shiftIsoDate(first, row.durationDays - 1) : "", tasks: [] };
});

/** First start and last finish over dated rows; headings without tasks may stay undated. */
export function planSpanOf(headings: PlanHeadingDraft[]) {
  const required = headings.flatMap((heading): { start: string; finish: string }[] => heading.tasks.length ? [heading, ...heading.tasks] : []);
  if (!required.every(planPeriodValid)) return null;
  const dated = headings.flatMap((heading): { start: string; finish: string }[] => [heading, ...heading.tasks.flatMap((task) => [task, ...task.functions])]).filter(planPeriodValid);
  if (!dated.length) return null;
  return { start: dated.map(row => row.start).sort()[0]!, finish: dated.map(row => row.finish).sort().at(-1)! };
}

const taskInvalid = (row: PlanTaskDraft) => !row.userId || !row.name.trim() || !planPeriodValid(row) || !planManDaysValid(row.planManDays);
const functionInvalid = (row: PlanFunctionDraft) => !row.name.trim() || (Boolean(row.start || row.finish) && !planPeriodValid(row));

/** Counted, not listed: a template fills many rows at once and every row would otherwise be named. */
export function planIssuesOf(t: (key: string) => string, headings: PlanHeadingDraft[]): string[] {
  const missing = headings.filter(row => !row.name.trim() || !headingPeriodValid(row)).length;
  const team = headings.flatMap(heading => heading.tasks).filter(taskInvalid).length
    + headings.flatMap(heading => heading.tasks.flatMap(task => task.functions)).filter(functionInvalid).length;
  return [...(missing ? [`${t("CRM.masterPlanIncomplete")}: ${missing}`] : []), ...(team ? [`${t("CRM.teamPlanIncomplete")}: ${team}`] : [])];
}

/** Headings with no task yet: a warning, not a stop, since the team's plan often comes after the project is created. */
export const headingsNotBrokenDown = (headings: PlanHeadingDraft[]) => headings.filter(heading => !heading.tasks.length).length;

export function NotBrokenDownNote({ headings }: { headings: PlanHeadingDraft[] }) {
  const t = useT();
  const count = headingsNotBrokenDown(headings);
  return count ? <div className="info-strip" role="note" data-guide="project.notBrokenDown"><Icon name="alertTriangle" /><span>{t("CRM.headingsNotBrokenDown")}: {count}</span></div> : null;
}

export function planPayload(headings: PlanHeadingDraft[]): { masterPlan: ProjectPlanHeading[] } {
  const id = (row: { id?: number }) => row.id ? { id: row.id } : {};
  return {
    masterPlan: headings.map(heading => ({ ...id(heading), name: heading.name.trim(), start: heading.start, finish: heading.finish,
      tasks: heading.tasks.map(task => ({ ...id(task), name: task.name.trim(), userId: task.userId, start: task.start, finish: task.finish,
        planManDays: task.planManDays.trim() ? Number(task.planManDays) : 0,
        functions: task.functions.map(item => ({ ...id(item), name: item.name.trim(), ...(item.userId ? { userId: item.userId } : {}),
          ...(item.start || item.finish ? { start: item.start, finish: item.finish } : {}) })) })) })),
  };
}

/** The Master Plan: the plan's main headings and the dates promised to the customer. */
export function MasterPlanSection({ rows, onChange, templates = [] }: { rows: PlanHeadingDraft[]; onChange: (update: (rows: PlanHeadingDraft[]) => PlanHeadingDraft[]) => void; templates?: ScheduleTemplate[] }) {
  const t = useT();
  const [templateId, setTemplateId] = useState(0);
  const [templateStart, setTemplateStart] = useState(() => estimateBusinessDate(new Date(), process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok"));
  const chosen = templates.find(item => item.id === templateId);
  const update = (key: string, change: Partial<PlanHeadingDraft>) => onChange(current => current.map(row => row.key === key ? { ...row, ...change } : row));
  return <section className="project-plan" aria-labelledby="project-master-plan-title" data-guide="project.plan">
    <div className="project-plan-head"><div><h3 id="project-master-plan-title">{t("CRM.masterPlan")}</h3><p className="muted">{t("CRM.masterPlanHint")}</p></div><div className="row-actions">
      <button className="btn sm" type="button" onClick={() => onChange(current => [...current, { key: crypto.randomUUID(), name: "", start: current.at(-1)?.finish ?? "", finish: "", tasks: [] }])}><Icon name="plus" />{t("CRM.addHeading")}</button>
    </div></div>
    {!rows.length && templates.length ? <div className="project-plan-template">
      <select aria-label={t("CRM.pickMasterSchedule")} value={templateId} onChange={(event) => setTemplateId(Number(event.target.value))}><option value={0}>{t("CRM.pickMasterSchedule")}</option>{templates.map(item => <option key={item.id} value={item.id}>{item.name} ({item.rows.length})</option>)}</select>
      {chosen?.rows.some(row => row.startOffsetDays !== null) ? <label className="project-plan-template-start"><span>{t("CRM.masterScheduleStart")}</span><DateInput value={templateStart} onChange={(event) => setTemplateStart(event.target.value)} /></label> : null}
      <button className="btn sm" type="button" disabled={!chosen} onClick={() => { if (chosen) onChange(() => planFromTemplate(chosen, templateStart)); }}>{t("CRM.applyMasterSchedule")}</button>
    </div> : null}
    {rows.length ? <ol className="project-plan-rows">{rows.map((row, index) => <li key={row.key} className="project-plan-row milestone">
      <span className="project-plan-index">{index + 1}.</span>
      <DateInput required={Boolean(row.tasks.length || row.finish)} aria-invalid={!headingPeriodValid(row)} aria-label={`${t("CRM.planStart")} ${index + 1}`} value={row.start} onChange={(event) => update(row.key, { start: event.target.value })} />
      <span className="project-plan-dash" aria-hidden="true">–</span>
      <DateInput required={Boolean(row.tasks.length || row.start)} aria-invalid={!headingPeriodValid(row)} aria-label={`${t("CRM.planFinish")} ${index + 1}`} min={row.start || undefined} value={row.finish} onChange={(event) => update(row.key, { finish: event.target.value })} />
      <input required aria-label={`${t("CRM.headingName")} ${index + 1}`} placeholder={t("CRM.headingName")} maxLength={500} value={row.name} onChange={(event) => update(row.key, { name: event.target.value })} />
      <button className="icon-btn" type="button" disabled={headingLocked(row)} aria-label={`${t("CRM.removeHeading")} ${index + 1}`} title={t(headingLocked(row) ? "CRM.rowInUse" : "CRM.removeHeading")} onClick={() => onChange(current => current.filter(item => item.key !== row.key))}><Icon name="x" /></button>
      {!row.tasks.length && !row.start && !row.finish ? <small className="project-plan-progress muted">{t("CRM.noDatesYet")}</small> : null}
    </li>)}</ol> : <p className="muted">{t("CRM.masterPlanEmpty")}</p>}
  </section>;
}

const memberCollator = new Intl.Collator(["th", "en"], { sensitivity: "base", numeric: true });

/** People grouped by department, departments and names A–Z; people with no department come last. */
export function membersByDepartment<P extends { name: string; department?: string | null }>(people: P[]): { department: string; members: P[] }[] {
  const groups = new Map<string, P[]>();
  for (const person of people) {
    const department = person.department?.trim() ?? "";
    groups.set(department, [...(groups.get(department) ?? []), person]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1) || memberCollator.compare(a, b))
    .map(([department, members]) => ({ department, members: [...members].sort((a, b) => memberCollator.compare(a.name, b.name)) }));
}

/** The <option>s of a person picker, one <optgroup> per department so a long team is easy to scan. */
export function MemberOptions<P extends { id: number; name: string; department?: string | null }>({ people }: { people: P[] }) {
  const t = useT();
  return <>{membersByDepartment(people).map(group => <optgroup key={group.department || "-"} label={group.department || t("CRM.noDepartment")}>
    {group.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
  </optgroup>)}</>;
}

/**
 * The Team Plan: under each Master Plan heading, its tasks -- each with a member -- and each task's functions.
 * A heading with no task yet is marked, but does not stop the save.
 */
export function TeamPlanSection({ rows, onChange, people }: { rows: PlanHeadingDraft[]; onChange: (update: (rows: PlanHeadingDraft[]) => PlanHeadingDraft[]) => void; people: BootstrapData["team"] }) {
  const t = useT();
  const editHeading = (headingKey: string, change: (heading: PlanHeadingDraft) => PlanHeadingDraft) => onChange(current => current.map(heading => heading.key === headingKey ? change(heading) : heading));
  const editTask = (headingKey: string, taskKey: string, change: (task: PlanTaskDraft) => PlanTaskDraft) =>
    editHeading(headingKey, heading => ({ ...heading, tasks: heading.tasks.map(task => task.key === taskKey ? change(task) : task) }));
  const editFunction = (headingKey: string, taskKey: string, key: string, change: Partial<PlanFunctionDraft>) =>
    editTask(headingKey, taskKey, task => ({ ...task, functions: task.functions.map(item => item.key === key ? { ...item, ...change } : item) }));
  const nameOf = (id: number) => people.find(person => person.id === id)?.name ?? "";
  return <section className="project-plan" aria-labelledby="project-team-plan-title" data-guide="project.team">
    <div className="project-plan-head"><div><h3 id="project-team-plan-title">{t("CRM.teamPlan")}</h3><p className="muted">{t("CRM.teamPlanHint")}</p></div></div>
    {rows.length ? rows.map((heading, index) => <div key={heading.key} className="project-plan-group">
      <div className="project-plan-group-head">
        <strong>{index + 1}. {heading.name.trim() || t("CRM.headingUnnamed")}</strong>
        {!heading.tasks.length ? <Badge tone="amber">{t("CRM.notBrokenDown")}</Badge> : null}
        <button className="btn sm" type="button" data-guide="project.teamAdd" onClick={() => editHeading(heading.key, current => ({ ...current, tasks: [...current.tasks, blankTask(current)] }))}><Icon name="plus" />{t("CRM.addTask")}</button>
      </div>
      {heading.tasks.length ? <ol className="project-plan-rows">{heading.tasks.map((task, taskIndex) => {
        const number = `${index + 1}.${taskIndex + 1}`;
        return <Fragment key={task.key}>
          <li className="project-plan-row team">
            <span className="project-plan-index">{number}</span>
            <select required aria-label={`${t("CRM.selectMember")} ${number}`} value={task.userId || ""} onChange={(event) => editTask(heading.key, task.key, current => ({ ...current, userId: Number(event.target.value) }))}><option value="">{t("CRM.selectMember")}</option><MemberOptions people={people} /></select>
            <DateInput required disabled={task.datesLocked} title={task.datesLocked ? t("CRM.datesFromFunctions") : undefined} aria-label={`${t("CRM.planStart")} ${number}`} value={task.start} onChange={(event) => editTask(heading.key, task.key, current => ({ ...current, start: event.target.value }))} />
            <span className="project-plan-dash" aria-hidden="true">–</span>
            <DateInput required disabled={task.datesLocked} title={task.datesLocked ? t("CRM.datesFromFunctions") : undefined} aria-label={`${t("CRM.planFinish")} ${number}`} min={task.start || undefined} value={task.finish} onChange={(event) => editTask(heading.key, task.key, current => ({ ...current, finish: event.target.value }))} />
            <input required className="project-plan-name" aria-label={`${t("CRM.taskName")} ${number}`} placeholder={t("CRM.taskName")} maxLength={500} value={task.name} onChange={(event) => editTask(heading.key, task.key, current => ({ ...current, name: event.target.value }))} />
            <input inputMode="decimal" aria-label={`${t("CRM.planManDays")} ${number}`} placeholder={t("CRM.planManDays")} aria-invalid={!planManDaysValid(task.planManDays)} value={task.planManDays} onChange={(event) => editTask(heading.key, task.key, current => ({ ...current, planManDays: event.target.value }))} />
            <button className="icon-btn add" type="button" data-guide="project.functionAdd" disabled={task.noFunctions && !task.functions.length} aria-label={`${t("CRM.addFunction")} ${number}`} title={t(task.noFunctions && !task.functions.length ? "CRM.noFunctions" : "CRM.addFunction")}
              onClick={() => editTask(heading.key, task.key, current => ({ ...current, functions: [...current.functions, blankFunction()] }))}><Icon name="plus" /></button>
            <button className="icon-btn" type="button" disabled={task.locked || task.functions.some(item => item.locked)} aria-label={`${t("CRM.removeRow")} ${number}`} title={t(task.locked || task.functions.some(item => item.locked) ? "CRM.rowInUse" : "CRM.removeRow")}
              onClick={() => editHeading(heading.key, current => ({ ...current, tasks: current.tasks.filter(item => item.key !== task.key) }))}><Icon name="x" /></button>
            {task.percent || task.actualManDays ? <small className="project-plan-progress muted">{Math.round(task.percent ?? 0)}% · {t("CRM.actualManDays")} {task.actualManDays ?? 0}</small> : null}
          </li>
          {task.functions.map((item, itemIndex) => {
            const itemNumber = `${number}.${itemIndex + 1}`;
            return <li key={item.key} className="project-plan-row team function">
              <span className="project-plan-index">{itemNumber}</span>
              <select aria-label={`${t("CRM.selectMember")} ${itemNumber}`} value={item.userId || ""} onChange={(event) => editFunction(heading.key, task.key, item.key, { userId: Number(event.target.value) })}>
                <option value="">{t("CRM.sameAsTask")}{task.userId ? ` · ${nameOf(task.userId)}` : ""}</option><MemberOptions people={people} /></select>
              <DateInput disabled={item.datesLocked} aria-label={`${t("CRM.planStart")} ${itemNumber}`} value={item.start} onChange={(event) => editFunction(heading.key, task.key, item.key, { start: event.target.value })} />
              <span className="project-plan-dash" aria-hidden="true">–</span>
              <DateInput disabled={item.datesLocked} aria-label={`${t("CRM.planFinish")} ${itemNumber}`} aria-invalid={functionInvalid(item) && Boolean(item.name.trim())} min={item.start || undefined} value={item.finish} onChange={(event) => editFunction(heading.key, task.key, item.key, { finish: event.target.value })} />
              <input required className="project-plan-name" aria-label={`${t("CRM.functionName")} ${itemNumber}`} placeholder={t("CRM.functionName")} maxLength={500} value={item.name} onChange={(event) => editFunction(heading.key, task.key, item.key, { name: event.target.value })} />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <button className="icon-btn" type="button" disabled={item.locked} aria-label={`${t("CRM.removeRow")} ${itemNumber}`} title={t(item.locked ? "CRM.rowInUse" : "CRM.removeRow")}
                onClick={() => editTask(heading.key, task.key, current => ({ ...current, functions: current.functions.filter(row => row.key !== item.key) }))}><Icon name="x" /></button>
            </li>;
          })}
        </Fragment>;
      })}</ol> : null}
    </div>) : <p className="muted">{t("CRM.teamPlanNeedsHeadings")}</p>}
  </section>;
}

/** The three project teams, picked rather than typed, plus a stored team that names none of them so it is not lost. */
export function projectTeamOptions(current?: string | null): string[] {
  const kept = current?.trim() ?? "";
  return [...PROJECT_TEAMS, ...(kept && !(PROJECT_TEAMS as readonly string[]).includes(kept) ? [kept] : [])];
}

export function TeamSelect({ value, onChange, departments }: { value: string; onChange: (value: string) => void; departments: string[] }) {
  const t = useT();
  return <label className="field"><span>{t("CRM.projectTeam")}</span><select value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">{t("CRM.selectProjectTeam")}</option>{departments.map(name => <option key={name} value={name}>{name}</option>)}
  </select></label>;
}

const PAYMENT_STAGES: { code: PaymentMilestone; label: string }[] = [
  { code: "AFTER_PO", label: "CRM.paymentAfterPo" }, { code: "AFTER_DESIGN", label: "CRM.paymentAfterDesign" },
  { code: "AFTER_INSTALL", label: "CRM.paymentAfterInstall" }, { code: "GO_LIVE", label: "CRM.paymentGoLive" },
];

/** Which payment stages the customer has paid. Only the fact of payment is kept, never an amount. */
export function PaymentChecklist({ value, onChange }: { value: PaymentMilestone[]; onChange: (value: PaymentMilestone[]) => void }) {
  const t = useT();
  return <fieldset className="project-payments"><legend>{t("CRM.customerPayments")}</legend>
    {PAYMENT_STAGES.map(stage => <label key={stage.code}><input type="checkbox" checked={value.includes(stage.code)}
      onChange={(event) => onChange(event.target.checked ? [...value, stage.code] : value.filter(code => code !== stage.code))} />{t(stage.label)}</label>)}
  </fieldset>;
}

const contactDetail = (contact: ProjectContactOption) => [contact.position, contact.siteName, contact.phone, contact.email].filter(Boolean).join(" · ");

/** The customer's site contacts, found by typing; phone and LINE are kept on the customer, not copied here. */
export function ContactPicker({ customerId, value, onChange }: { customerId: number; value: number[]; onChange: (value: number[]) => void }) {
  const t = useT();
  const [state, setState] = useState<{ customerId: number; contacts: ProjectContactOption[]; error: string } | null>(null);
  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    void listProjectContactOptions(customerId).then(contacts => { if (!cancelled) setState({ customerId, contacts, error: "" }); })
      .catch(failure => { if (!cancelled) setState({ customerId, contacts: [], error: failure instanceof Error ? failure.message : String(failure) }); });
    return () => { cancelled = true; };
  }, [customerId]);
  const current = state?.customerId === customerId ? state : null;
  const options = useMemo(() => (current?.contacts ?? []).map(contact => ({ id: contact.id, label: contact.name, detail: contactDetail(contact), searchText: contact.department })), [current]);
  return <fieldset className="project-contacts"><legend>{t("CRM.projectContacts")}</legend>
    <p className="muted">{t("CRM.projectContactsHint")}</p>
    {!customerId ? <p className="muted">{t("CRM.projectContactsPickCustomer")}</p>
      : !current ? <p className="muted" role="status">{t("CRM.loading")}</p>
      : current.error ? <p role="alert">{t(current.error)}</p>
      : !options.length ? <p className="muted">{t("CRM.projectContactsNone")}</p>
      : <SearchMultiPicker options={options} value={value} onChange={onChange} label={t("CRM.projectContacts")} placeholder={t("CRM.searchContacts")}
        removeLabel={t("CRM.removeContact")} noMatchText={t("CRM.noContactMatch")} allChosenText={t("CRM.allContactsChosen")} />}
  </fieldset>;
}

const HEALTH_TONE: Record<ProjectHealth, "green" | "amber" | "red" | "slate" | "blue"> = {
  "On Track": "green", "At Risk": "amber", Delayed: "red", "No plan": "slate", "On Hold": "slate", Completed: "blue",
};

/** How the plan is going, worked out from the schedule; see backend-node/src/project-health.ts. */
export function HealthBadge({ health }: { health: ProjectHealth }) {
  const t = useT();
  return <Badge tone={HEALTH_TONE[health]}>{t(`ProjectHealth.${health}`)}</Badge>;
}
