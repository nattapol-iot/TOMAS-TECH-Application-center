"use client";
/* Projects > Plan: the man-hour budget line (owner request 2026-11-16). Estimated against planned man-days,
   so the plan owner sees what is left to hand out while planning. The estimated figure is the internal labor
   of the project's Estimate cost; a project without one takes a budget typed by a manager. Hours are man-days
   times hoursPerManDay; money is never shown here. The API side is backend-node/src/manhour-budget.ts. */

import { useState } from "react";
import { ApiClientError, apiRequest } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { Icon, Modal } from "../ui";
import { plannedShare, remainingManDays } from "../../../lib/manhour-budget";

export type PlanManHoursData = {
  source: "estimate" | "manual" | "none";
  estimateNo: string | null;
  budgetManDays: number | null;
  disciplines: { discipline: string; manDays: number }[];
  plannedManDays: number;
  /** Man-days on rows marked as outsourced manpower in the People table; they stay out of the comparison with the budget. */
  outsourcedManDays?: number;
  unplannedRows: number;
  hoursPerManDay: number;
  canSetBudget: boolean;
  /** Man-days people confirmed for the project in My Work (migration 121), and how many people confirmed them. */
  actualManDays?: number;
  actualPeople?: number;
};

const figure = (value: number, digits = 2) => new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: digits }).format(value);

export function PlanManHours({ projectId, data, onChanged }: { projectId: number; data: PlanManHoursData; onChanged: () => Promise<void> | void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const hours = (manDays: number) => figure(manDays * data.hoursPerManDay, 0);
  const amount = (manDays: number) => <><strong>{hours(manDays)}</strong> {t("Plan.mhHours")} <em>({figure(manDays)} {t("MD")})</em></>;
  const budget = data.budgetManDays, left = remainingManDays(data), over = left !== null && left < 0;
  const share = plannedShare(data);
  return <section className="plan-manhours" data-guide="plan.manhours" aria-label={t("Plan.mhTitle")}>
    <span className="plan-manhours-title"><Icon name="clock" />{t("Plan.mhTitle")}</span>
    {budget === null ? <span className="plan-manhours-none">{t("Plan.mhNoBudget")}</span> : <>
      <span className={`plan-manhours-bar${over ? " over" : ""}`} role="img" aria-label={`${t("Plan.mhPlanned")} ${Math.round(budget > 0 ? (data.plannedManDays / budget) * 100 : 0)}%`}><i style={{ width: `${share}%` }} /></span>
      <span><small>{t("Plan.mhEstimated")}</small>{amount(budget)}</span>
    </>}
    <span><small>{t("Plan.mhPlanned")}</small>{amount(data.plannedManDays)}</span>
    {data.outsourcedManDays ? <span className="plan-manhours-outsourced"><small>{t("Plan.mhOutsourced")}</small>{amount(data.outsourcedManDays)}</span> : null}
    {data.actualManDays ? <span className="plan-manhours-actual" title={t("Plan.mhActualHint")}><small>{t("Plan.mhActual")}</small>{amount(data.actualManDays)} <em>{figure(data.actualPeople ?? 0, 0)} {t("Plan.mhActualPeople")}</em></span> : null}
    {left !== null ? <span className={over ? "over" : undefined}><small>{t(over ? "Plan.mhOver" : "Plan.mhLeft")}</small>{amount(Math.abs(left))}</span> : null}
    {data.unplannedRows > 0 ? <span className="plan-manhours-warn" title={t("Plan.mhUnplannedHint")}><Icon name="alertTriangle" />{figure(data.unplannedRows, 0)} {t("Plan.mhUnplanned")}</span> : null}
    {data.disciplines.length > 1 ? <span className="plan-manhours-split">{data.disciplines.map((row) => <span key={row.discipline}>{t(`Plan.mhDiscipline.${row.discipline}`)} <strong>{figure(row.manDays)}</strong></span>)}<em>{t("MD")}</em></span> : null}
    <span className="plan-manhours-source">
      {data.source === "estimate" ? <em>{t("Plan.mhFromEstimate")}{data.estimateNo ? ` ${data.estimateNo}` : ""}</em> : data.source === "manual" ? <em>{t("Plan.mhManual")}</em> : null}
      {data.canSetBudget ? <button className="btn default sm" type="button" data-guide="plan.manhoursSet" onClick={() => setEditing(true)}><Icon name="edit" />{t(budget === null ? "Plan.mhSet" : "Plan.mhChange")}</button> : null}
    </span>
    {editing ? <ManHourBudgetModal projectId={projectId} data={data} onClose={() => setEditing(false)} onSaved={onChanged} /> : null}
  </section>;
}

function ManHourBudgetModal({ projectId, data, onClose, onSaved }: { projectId: number; data: PlanManHoursData; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const t = useT();
  const [value, setValue] = useState(data.source === "manual" && data.budgetManDays !== null ? String(data.budgetManDays) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const typed = value.trim() === "" ? null : Number(value);
  const valid = typed === null || (Number.isFinite(typed) && typed > 0 && typed <= 100000);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/projects/${projectId}/manhour-budget`, { method: "PUT", body: JSON.stringify({ manDays: typed }) });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiClientError && failure.code === "manhour_budget_from_estimate" ? "Plan.mhFromEstimateError" : failure instanceof Error ? failure.message : "Plan.mhSaveFailed");
      setBusy(false);
    }
  };
  return <Modal title="Plan.mhSetTitle" subtitle="Plan.mhSetHint" size="sm" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" disabled={busy} onClick={onClose}>{t("Cancel")}</button>
    <button className="btn primary" type="button" data-guide="plan.manhoursSave" disabled={busy || !valid} onClick={() => { void submit(); }}>{t(busy ? "Saving…" : "Save")}</button>
  </>}>
    {error ? <div className="info-strip red" role="alert">{t(error)}</div> : null}
    <label className="field"><span>{t("Plan.mhBudgetField")}</span>
      <input type="number" min="0.25" max="100000" step="0.25" value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} />
    </label>
    <p className="muted">{typed !== null && valid ? `${figure(typed * data.hoursPerManDay, 0)} ${t("Plan.mhHours")}` : t("Plan.mhClearHint")}</p>
  </Modal>;
}
