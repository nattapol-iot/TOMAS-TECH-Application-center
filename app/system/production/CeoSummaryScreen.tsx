"use client";
/*
 * The CEO cost summary (task doc 6.3, owner 2026-11-24: the CEO reads it in the app, no email). One page: every open
 * project, most at risk on its budget first, or one project; for each, its bought and people figures against budget,
 * what to know written from those figures (lib/ceo-summary.ts) and the project manager's own note (migration 132).
 * Each project opens its own page. Leaders and above, as the cost overview it reads.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, apiRequest, type BootstrapData } from "../api-client";
import { useT } from "../i18n";
import { listProjectOverview, type ProjectOverviewItem } from "../project-overview-client";
import { EmptyState, Icon, PageHeader } from "../ui";
import { byBudgetRisk, factText, thingsToKnow } from "../../../lib/ceo-summary";
import { projectBudgetStates, shortAmount, type ProjectCostItem, type ProjectCostOverview, type PurchaseCost } from "../../../backend-node/src/project-cost-model";
import { HealthBadge } from "./ProjectPlanFields";
import "./ceo-summary.css";

const DASH = "–";
/** The address of a project's page: its number, or its id while the number is the shared placeholder (CoreScreens projectPageKey). */
const pageKey = (item: { id: number; number: string }) => (/^PJ0+$/i.test(item.number) ? String(item.id) : item.number);

export function CeoSummaryScreen({
  bootstrap,
  notify,
  focus,
  onFocus,
  onOpenProject,
  onBack,
}: {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  /** One project's page key, or null for every project. */
  focus: string | null;
  onFocus: (key: string | null) => void;
  onOpenProject: (key: string) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [cost, setCost] = useState<ProjectCostOverview | null>(null);
  const [schedule, setSchedule] = useState<Map<number, ProjectOverviewItem>>(new Map());
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([apiRequest<ProjectCostOverview>(`/api/v1/projects/cost-overview${focus ? "?includeClosed=1" : ""}`), listProjectOverview().catch(() => ({ items: [] as ProjectOverviewItem[] }))])
      .then(([costs, overview]) => {
        if (cancelled) return;
        setCost(costs);
        setSchedule(new Map(overview.items.map((item) => [item.id, item])));
        setError("");
      })
      .catch((failure) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : t("Could not load"));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, t, focus]);
  // Every open project; a closed one only while it is the one asked for (its Cost tab can open this page).
  const items = useMemo(
    () =>
      byBudgetRisk(
        (cost?.items ?? []).filter((item) => item.status !== "Closed" || (focus !== null && pageKey(item) === focus)),
        (item) => schedule.get(item.id)?.slipDays ?? null,
      ),
    [cost, schedule, focus],
  );
  const shown = focus ? items.filter((item) => pageKey(item) === focus) : items;
  const elevated = (bootstrap.user.roles ?? [bootstrap.user.role]).some((role) => role === "Engineering Manager" || role === "Admin");
  const canWrite = bootstrap.permissions.includes("project.write");
  const setNote = useCallback(
    (id: number, note: ProjectCostItem["ceoNote"]) =>
      setCost((current) => (current ? { ...current, items: current.items.map((item) => (item.id === id ? { ...item, ceoNote: note } : item)) } : current)),
    [],
  );
  return (
    <div className="ceo-summary" data-guide="ceo.summary">
      <button type="button" className="btn ghost sm project-page-back" onClick={onBack}>
        <Icon name="chevronLeft" />
        {t("ProjectPage.back")}
      </button>
      <PageHeader
        title="CEO.title"
        subtitle="CEO.subtitle"
        actions={
          <label className="ceo-focus">
            <span className="muted">{t("CEO.show")}</span>
            <select value={focus ?? ""} onChange={(event) => onFocus(event.target.value || null)} data-guide="ceo.focus">
              <option value="">{t("CEO.allProjects")}</option>
              {items.map((item) => (
                <option key={item.id} value={pageKey(item)}>
                  {item.number} · {item.name}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {error ? (
        <div className="callout danger" role="alert">
          <span>{error}</span>
          <button type="button" className="btn ghost sm" onClick={() => setAttempt((value) => value + 1)}>
            {t("Try again")}
          </button>
        </div>
      ) : null}
      {!cost && !error ? <span className="spinner" /> : null}
      {cost && !shown.length ? <EmptyState icon="folder" title="CEO.none" message="CEO.noneHint" /> : null}
      <div className="ceo-list">
        {shown.map((item) => (
          <CeoProject
            key={item.id}
            item={item}
            schedule={schedule.get(item.id)}
            canEditNote={canWrite && (item.managerId === bootstrap.user.id || elevated)}
            onOpen={() => onOpenProject(pageKey(item))}
            onNote={(note) => setNote(item.id, note)}
            notify={notify}
          />
        ))}
      </div>
    </div>
  );
}

function CeoProject({
  item,
  schedule,
  canEditNote,
  onOpen,
  onNote,
  notify,
}: {
  item: ProjectCostItem;
  schedule: ProjectOverviewItem | undefined;
  canEditNote: boolean;
  onOpen: () => void;
  onNote: (note: ProjectCostItem["ceoNote"]) => void;
  notify: (message: string) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const facts = thingsToKnow(item, schedule ?? {});
  const worst = projectBudgetStates(item).worst;
  const bought = (figures: PurchaseCost) => (figures.requested === null ? DASH : `${shortAmount(figures.requested)}${figures.budget ? ` / ${shortAmount(figures.budget)}` : ""}`);
  const people =
    item.labor.budgetManDays === null
      ? `${Math.round(item.labor.forecastManDays ?? item.labor.plannedManDays)} MD`
      : `${Math.round(item.labor.forecastManDays ?? item.labor.plannedManDays)} / ${Math.round(item.labor.budgetManDays)} MD`;
  const save = async () => {
    setBusy(true);
    try {
      const saved = await apiRequest<{ note: ProjectCostItem["ceoNote"] }>(`/api/v1/projects/${item.id}/ceo-note`, { method: "PUT", body: JSON.stringify({ note: draft }) });
      onNote(saved.note);
      setEditing(false);
      notify(t("CEO.noteSaved"));
    } catch (failure) {
      notify(failure instanceof ApiClientError ? failure.message : t("CEO.noteFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`ceo-item state-${worst}`}>
      <header>
        <button type="button" className="pg-doclink ceo-name" onClick={onOpen} title={t("ProjectPage.open")}>
          <span className="mono">{item.number}</span> {item.name}
        </button>
        {schedule ? <HealthBadge health={schedule.health ?? "No plan"} status={schedule.status} /> : null}
        <span className={`ceo-state ${worst}`}>{t(`Cost.state.${worst}`)}</span>
        <span className="muted ceo-meta">
          {item.customerName} · {item.managerName}
        </span>
      </header>
      <dl className="ceo-figures">
        <div>
          <dt>{t("Cost.hardware")}</dt>
          <dd className="mono">{bought(item.hardware)}</dd>
        </div>
        <div>
          <dt>{t("Cost.outsource")}</dt>
          <dd className="mono">{bought(item.outsource)}</dd>
        </div>
        <div>
          <dt>{t("CEO.people")}</dt>
          <dd className="mono">{people}</dd>
        </div>
      </dl>
      <div className="ceo-body">
        <section>
          <h4>{t("CEO.toKnow")}</h4>
          {facts.length ? (
            <ul className="ceo-facts">
              {facts.map((fact) => (
                <li key={fact.key} className={fact.tone}>
                  {factText(fact, t)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t("CEO.nothing")}</p>
          )}
        </section>
        <section className="ceo-note" data-guide="ceo.note">
          <h4>{t("CEO.pmNote")}</h4>
          {editing ? (
            <>
              <textarea rows={3} maxLength={2000} value={draft} disabled={busy} onChange={(event) => setDraft(event.target.value)} aria-label={t("CEO.pmNote")} />
              <div className="ceo-note-actions">
                <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setEditing(false)}>
                  {t("Cancel")}
                </button>
                <button type="button" className="btn primary sm" disabled={busy} onClick={() => void save()}>
                  {t("Save")}
                </button>
              </div>
            </>
          ) : (
            <>
              {item.ceoNote ? (
                <p>
                  {item.ceoNote.text}
                  <small className="muted">
                    {" "}
                    · {item.ceoNote.by} · {new Date(item.ceoNote.at).toLocaleDateString()}
                  </small>
                </p>
              ) : (
                <p className="muted">{t("CEO.noNote")}</p>
              )}
              {canEditNote ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    setDraft(item.ceoNote?.text ?? "");
                    setEditing(true);
                  }}
                >
                  <Icon name="edit" />
                  {t(item.ceoNote ? "CEO.editNote" : "CEO.addNote")}
                </button>
              ) : null}
            </>
          )}
        </section>
      </div>
    </article>
  );
}
