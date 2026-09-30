"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listProjectContactOptions,
  type BootstrapData,
  type PaymentMilestone,
  type ProjectContactOption,
  type ProjectHealth,
  type ProjectMasterPlanRow,
  type ProjectTeamPlanRow,
  type ScheduleTemplate,
} from "../api-client";
import { useT } from "../i18n";
import { Badge, Icon } from "../ui";

/*
 * The parts of a project that Create project and Edit project share: its Master Plan, who
 * does what and when, the team it belongs to, the customer payments received, the
 * customer contacts it talks to, and how its plan is going.
 */

/** id names the schedule row a draft edits; `locked` rows have progress or linked work and cannot be removed. */
export type MasterPlanDraft = { key: string; id?: number; locked?: boolean; name: string; start: string; finish: string };
export type TeamPlanDraft = { key: string; id?: number; locked?: boolean; userId: number; task: string; start: string; finish: string; planManDays: string; percent?: number; actualManDays?: number };

export const planPeriodValid = (row: { start: string; finish: string }) => Boolean(row.start && row.finish && row.finish >= row.start);
export const planManDaysValid = (value: string) => !value.trim() || /^\d{1,6}(\.\d{1,2})?$/.test(value.trim());
const shiftIsoDate = (iso: string, days: number) => { const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

/** A master schedule's rows as dated plan rows: days count from the chosen start, rows without them keep only their name. */
export const planFromTemplate = (template: ScheduleTemplate, start: string): MasterPlanDraft[] => template.rows.map(row => {
  const first = row.startOffsetDays === null || !start ? "" : shiftIsoDate(start, row.startOffsetDays);
  return { key: crypto.randomUUID(), name: row.name, start: first, finish: first && row.durationDays ? shiftIsoDate(first, row.durationDays - 1) : "" };
});

/** First start and last finish over every row, or null while any row is undated. */
export function planSpanOf(masterPlan: MasterPlanDraft[], teamPlan: TeamPlanDraft[]) {
  const rows = [...masterPlan, ...teamPlan];
  return rows.length && rows.every(planPeriodValid) ? { start: rows.map(row => row.start).sort()[0]!, finish: rows.map(row => row.finish).sort().at(-1)! } : null;
}

/** Counted, not listed: a template fills many rows at once and every row would otherwise be named. */
export function planIssuesOf(t: (key: string) => string, masterPlan: MasterPlanDraft[], teamPlan: TeamPlanDraft[]): string[] {
  const milestones = masterPlan.filter(row => !row.name.trim() || !planPeriodValid(row)).length;
  const team = teamPlan.filter(row => !row.userId || !row.task.trim() || !planPeriodValid(row) || !planManDaysValid(row.planManDays)).length;
  return [...(milestones ? [`${t("CRM.masterPlanIncomplete")}: ${milestones}`] : []), ...(team ? [`${t("CRM.teamPlanIncomplete")}: ${team}`] : [])];
}

export function planPayload(masterPlan: MasterPlanDraft[], teamPlan: TeamPlanDraft[]): { masterPlan: ProjectMasterPlanRow[]; team: ProjectTeamPlanRow[] } {
  return {
    masterPlan: masterPlan.map(({ id, name, start, finish }) => ({ ...(id ? { id } : {}), name: name.trim(), start, finish })),
    team: teamPlan.map(({ id, userId, task, start, finish, planManDays }) => ({ ...(id ? { id } : {}), userId, task: task.trim(), start, finish, planManDays: planManDays.trim() ? Number(planManDays) : 0 })),
  };
}

export function MasterPlanSection({ rows, onChange, templates = [] }: { rows: MasterPlanDraft[]; onChange: (update: (rows: MasterPlanDraft[]) => MasterPlanDraft[]) => void; templates?: ScheduleTemplate[] }) {
  const t = useT();
  const [templateId, setTemplateId] = useState(0);
  const [templateStart, setTemplateStart] = useState(() => new Date().toISOString().slice(0, 10));
  const chosen = templates.find(item => item.id === templateId);
  const update = (key: string, change: Partial<MasterPlanDraft>) => onChange(current => current.map(row => row.key === key ? { ...row, ...change } : row));
  return <section className="project-plan" aria-labelledby="project-master-plan-title">
    <div className="project-plan-head"><h3 id="project-master-plan-title">{t("CRM.masterPlan")}</h3><div className="row-actions">
      <button className="btn sm" type="button" onClick={() => onChange(current => [...current, { key: crypto.randomUUID(), name: "", start: current.at(-1)?.finish ?? "", finish: "" }])}><Icon name="plus" />{t("CRM.addMilestone")}</button>
    </div></div>
    {!rows.length && templates.length ? <div className="project-plan-template">
      <select aria-label={t("CRM.pickMasterSchedule")} value={templateId} onChange={(event) => setTemplateId(Number(event.target.value))}><option value={0}>{t("CRM.pickMasterSchedule")}</option>{templates.map(item => <option key={item.id} value={item.id}>{item.name} ({item.rows.length})</option>)}</select>
      {chosen?.rows.some(row => row.startOffsetDays !== null) ? <label className="project-plan-template-start"><span>{t("CRM.masterScheduleStart")}</span><input type="date" value={templateStart} onChange={(event) => setTemplateStart(event.target.value)} /></label> : null}
      <button className="btn sm" type="button" disabled={!chosen} onClick={() => { if (chosen) onChange(() => planFromTemplate(chosen, templateStart)); }}>{t("CRM.applyMasterSchedule")}</button>
    </div> : null}
    {rows.length ? <ol className="project-plan-rows">{rows.map((row, index) => <li key={row.key} className="project-plan-row milestone">
      <span className="project-plan-index">{index + 1}.</span>
      <input type="date" required aria-label={`${t("CRM.planStart")} ${index + 1}`} value={row.start} onChange={(event) => update(row.key, { start: event.target.value })} />
      <span className="project-plan-dash" aria-hidden="true">–</span>
      <input type="date" required aria-label={`${t("CRM.planFinish")} ${index + 1}`} min={row.start || undefined} value={row.finish} onChange={(event) => update(row.key, { finish: event.target.value })} />
      <input required aria-label={`${t("CRM.milestoneName")} ${index + 1}`} placeholder={t("CRM.milestoneName")} maxLength={500} value={row.name} onChange={(event) => update(row.key, { name: event.target.value })} />
      <button className="icon-btn" type="button" disabled={row.locked} aria-label={`${t("CRM.removeRow")} ${index + 1}`} title={t(row.locked ? "CRM.rowInUse" : "CRM.removeRow")} onClick={() => onChange(current => current.filter(item => item.key !== row.key))}><Icon name="x" /></button>
    </li>)}</ol> : <p className="muted">{t("CRM.masterPlanEmpty")}</p>}
  </section>;
}

export function TeamPlanSection({ rows, onChange, people }: { rows: TeamPlanDraft[]; onChange: (update: (rows: TeamPlanDraft[]) => TeamPlanDraft[]) => void; people: BootstrapData["team"] }) {
  const t = useT();
  const update = (key: string, change: Partial<TeamPlanDraft>) => onChange(current => current.map(row => row.key === key ? { ...row, ...change } : row));
  return <section className="project-plan" aria-labelledby="project-team-plan-title">
    <div className="project-plan-head"><div><h3 id="project-team-plan-title">{t("CRM.teamPlan")}</h3><p className="muted">{t("CRM.teamPlanHint")}</p></div><div className="row-actions">
      <button className="btn sm" type="button" onClick={() => onChange(current => [...current, { key: crypto.randomUUID(), userId: 0, task: "", start: "", finish: "", planManDays: "" }])}><Icon name="plus" />{t("CRM.addMember")}</button>
    </div></div>
    {rows.length ? <ol className="project-plan-rows">{rows.map((row, index) => <li key={row.key} className="project-plan-row team">
      <span className="project-plan-index">{index + 1}.</span>
      <select required aria-label={`${t("CRM.selectMember")} ${index + 1}`} value={row.userId || ""} onChange={(event) => update(row.key, { userId: Number(event.target.value) })}><option value="">{t("CRM.selectMember")}</option>{people.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
      <input type="date" required aria-label={`${t("CRM.planStart")} ${index + 1}`} value={row.start} onChange={(event) => update(row.key, { start: event.target.value })} />
      <span className="project-plan-dash" aria-hidden="true">–</span>
      <input type="date" required aria-label={`${t("CRM.planFinish")} ${index + 1}`} min={row.start || undefined} value={row.finish} onChange={(event) => update(row.key, { finish: event.target.value })} />
      <input required aria-label={`${t("CRM.memberTask")} ${index + 1}`} placeholder={t("CRM.memberTask")} maxLength={500} value={row.task} onChange={(event) => update(row.key, { task: event.target.value })} />
      <input inputMode="decimal" aria-label={`${t("CRM.planManDays")} ${index + 1}`} placeholder={t("CRM.planManDays")} aria-invalid={!planManDaysValid(row.planManDays)} value={row.planManDays} onChange={(event) => update(row.key, { planManDays: event.target.value })} />
      <button className="icon-btn" type="button" disabled={row.locked} aria-label={`${t("CRM.removeRow")} ${index + 1}`} title={t(row.locked ? "CRM.rowInUse" : "CRM.removeRow")} onClick={() => onChange(current => current.filter(item => item.key !== row.key))}><Icon name="x" /></button>
      {row.percent || row.actualManDays ? <small className="project-plan-progress muted">{Math.round(row.percent ?? 0)}% · {t("CRM.actualManDays")} {row.actualManDays ?? 0}</small> : null}
    </li>)}</ol> : <p className="muted">{t("CRM.teamPlanEmpty")}</p>}
  </section>;
}

/** Departments as the employee directory spells them, so a team is picked, not typed. */
export function useDepartments(bootstrap: BootstrapData, current?: string | null): string[] {
  return useMemo(() => [...new Set([...bootstrap.team.map(member => member.department.trim()), current?.trim() ?? ""].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [bootstrap.team, current]);
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

/** The customer's site contacts; phone and LINE are kept on the customer, not copied here. */
export function ContactChecklist({ customerId, value, onChange }: { customerId: number; value: number[]; onChange: (value: number[]) => void }) {
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
  return <fieldset className="project-contacts"><legend>{t("CRM.projectContacts")}</legend>
    <p className="muted">{t("CRM.projectContactsHint")}</p>
    {!customerId ? <p className="muted">{t("CRM.projectContactsPickCustomer")}</p>
      : !current ? <p className="muted" role="status">{t("CRM.loading")}</p>
      : current.error ? <p role="alert">{t(current.error)}</p>
      : !current.contacts.length ? <p className="muted">{t("CRM.projectContactsNone")}</p>
      : <ul>{current.contacts.map(contact => <li key={contact.id}><label>
        <input type="checkbox" checked={value.includes(contact.id)} onChange={(event) => onChange(event.target.checked ? [...value, contact.id] : value.filter(id => id !== contact.id))} />
        <span><strong>{contact.name}</strong>{[contact.position, contact.siteName, contact.phone, contact.email].filter(Boolean).length ? <small className="muted"> · {[contact.position, contact.siteName, contact.phone, contact.email].filter(Boolean).join(" · ")}</small> : null}</span>
      </label></li>)}</ul>}
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
