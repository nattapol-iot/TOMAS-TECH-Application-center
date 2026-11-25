"use client";
/*
 * The CEO cost summary (task doc 6.3, owner 2026-11-24: the CEO reads it in the app, no email). One page: every open
 * project, most at risk on its budget first, or one project; for each, its bought and people figures against budget,
 * what to know written from those figures (lib/ceo-summary.ts) and the project manager's own note (migration 132).
 * Each project opens its own page. Leaders and above, as the cost overview it reads.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, apiRequest, type BootstrapData, type ProjectHealth } from "../api-client";
import { useT } from "../i18n";
import { listProjectOverview, type ProjectOverviewItem } from "../project-overview-client";
import { byBudgetRisk, factText, thingsToKnow } from "../../../lib/ceo-summary";
import { buildCeoWorkbook, ceoWorkbookName } from "../../../lib/ceo-workbook";
import { downloadErpEstimateWorkbookBytes } from "../../../lib/erp-estimate-workbook";
import {
  projectBudgetStates,
  shortAmount,
  type BudgetState,
  type ProjectCostDetail,
  type ProjectCostItem,
  type ProjectCostOverview,
  type PurchaseCost,
} from "../../../backend-node/src/project-cost-model";
import { PROJECT_HEALTH_TONE } from "./ProjectPlanFields";
import { CeoSummary, type CeoCard } from "../tomas-ui/CeoSummary";
import type { KitTone } from "../tomas-ui/tones";
import "./ceo-summary.css";

const DASH = "–";
/** A budget's standing as a colour: the card's edge and its badge. */
const BUDGET_TONE: Record<BudgetState, KitTone> = { over: "red", near: "amber", within: "green", none: "slate" };
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
  // Task doc 6.4 (owner decision 6: made in the browser). PDF: the page as it is on screen, on A4 landscape, through the
  // browser's own print to PDF (ceo-summary.css @media print). Excel: five sheets from the same figures (lib/ceo-workbook.ts).
  const [exporting, setExporting] = useState(false);
  const printPdf = () => {
    document.documentElement.classList.add("print-ceo");
    const done = () => {
      document.documentElement.classList.remove("print-ceo");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    // print() returns once the dialog closes in most browsers; where afterprint never comes, the class still goes.
    window.setTimeout(done, 1000);
  };
  const downloadExcel = async () => {
    if (!cost || exporting) return;
    setExporting(true);
    try {
      const details = new Map<number, ProjectCostDetail>();
      // Each project's own cost, four at a time; one that cannot be read is left out of the detail sheets, and said so.
      for (let start = 0; start < shown.length; start += 4)
        await Promise.all(
          shown.slice(start, start + 4).map((item) =>
            apiRequest<ProjectCostDetail>(`/api/v1/projects/${item.id}/cost`)
              .then((detail) => details.set(item.id, detail))
              .catch(() => undefined),
          ),
        );
      downloadErpEstimateWorkbookBytes(buildCeoWorkbook({ shown, all: cost.items, details, schedule, hoursPerManDay: cost.hoursPerManDay, today: cost.today, t }), ceoWorkbookName(focus, cost.today));
      const missing = shown.filter((item) => !details.has(item.id));
      if (missing.length) notify(t("CEO.exportMissing").replace("{projects}", missing.map((item) => item.number).join(", ")));
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : t("CEO.exportFailed"));
    } finally {
      setExporting(false);
    }
  };
  const setNote = useCallback(
    (id: number, note: ProjectCostItem["ceoNote"]) =>
      setCost((current) => (current ? { ...current, items: current.items.map((item) => (item.id === id ? { ...item, ceoNote: note } : item)) } : current)),
    [],
  );
  const saveNote = async (id: number, text: string) => {
    try {
      const saved = await apiRequest<{ note: ProjectCostItem["ceoNote"] }>(`/api/v1/projects/${id}/ceo-note`, { method: "PUT", body: JSON.stringify({ note: text }) });
      setNote(id, saved.note);
      notify(t("CEO.noteSaved"));
      return true;
    } catch (failure) {
      notify(failure instanceof ApiClientError ? failure.message : t("CEO.noteFailed"));
      return false;
    }
  };
  const bought = (figures: PurchaseCost) => (figures.requested === null ? DASH : `${shortAmount(figures.requested)}${figures.budget ? ` / ${shortAmount(figures.budget)}` : ""}`);
  const cards: CeoCard[] = shown.map((item) => {
    const plan = schedule.get(item.id);
    const worst = projectBudgetStates(item).worst;
    // The plan or the forecast, whichever is more: the figure the things to know weigh (lib/ceo-summary.ts). The forecast
    // alone reads 0 on a plan whose dates have passed with no hours confirmed, beside a line that says it is over budget.
    const used = Math.round(Math.max(item.labor.plannedManDays, item.labor.forecastManDays ?? 0));
    const health: ProjectHealth | null = plan ? (plan.status === "Closed" ? "Completed" : (plan.health ?? "No plan")) : null;
    return {
      id: item.id,
      key: pageKey(item),
      number: item.number,
      name: item.name,
      meta: `${item.customerName} · ${item.managerName}`,
      health: health ? { label: t(`ProjectHealth.${health}`), tone: PROJECT_HEALTH_TONE[health] } : null,
      state: { label: t(`Cost.state.${worst}`), tone: BUDGET_TONE[worst] },
      figures: [
        { label: t("Cost.hardware"), value: bought(item.hardware) },
        { label: t("Cost.outsource"), value: bought(item.outsource) },
        { label: t("CEO.people"), value: item.labor.budgetManDays === null ? `${used} MD` : `${used} / ${Math.round(item.labor.budgetManDays)} MD` },
      ],
      facts: thingsToKnow(item, plan ?? {}).map((fact) => ({ key: fact.key, text: factText(fact, t), tone: fact.tone })),
      note: item.ceoNote ? { text: item.ceoNote.text, by: item.ceoNote.by, at: new Date(item.ceoNote.at).toLocaleDateString() } : null,
      canEditNote: canWrite && (item.managerId === bootstrap.user.id || elevated),
    };
  });
  return (
    <CeoSummary
      labels={{
        back: t("ProjectPage.back"),
        title: t("CEO.title"),
        subtitle: t("CEO.subtitle"),
        pdf: t("CEO.pdf"),
        excel: t("CEO.excel"),
        exporting: t("CEO.exporting"),
        show: t("CEO.show"),
        allProjects: t("CEO.allProjects"),
        toKnow: t("CEO.toKnow"),
        nothing: t("CEO.nothing"),
        pmNote: t("CEO.pmNote"),
        noNote: t("CEO.noNote"),
        addNote: t("CEO.addNote"),
        editNote: t("CEO.editNote"),
        open: t("ProjectPage.open"),
        cancel: t("Cancel"),
        save: t("Save"),
        retry: t("Try again"),
        none: t("CEO.none"),
        noneHint: t("CEO.noneHint"),
      }}
      loading={!cost && !error}
      error={error}
      onRetry={() => setAttempt((value) => value + 1)}
      onBack={onBack}
      exporting={exporting}
      canExport={Boolean(cost) && shown.length > 0}
      onPdf={printPdf}
      onExcel={() => void downloadExcel()}
      focus={focus}
      choices={items.map((item) => ({ key: pageKey(item), label: `${item.number} · ${item.name}` }))}
      onFocus={onFocus}
      cards={cost ? cards : []}
      onOpen={onOpenProject}
      onSaveNote={saveNote}
    />
  );
}
