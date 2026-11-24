/*
 * The CEO summary's Excel (task doc 6.4): Summary, By person, By task, Purchase requests and All projects. The figures
 * are the ones the screen read (the cost overview and each project's own cost), so a viewer's access is already applied:
 * a figure they may not see is an empty cell. Sheet names and headers come in the viewer's language.
 */
import { factText, thingsToKnow, type CeoScheduleFacts } from "./ceo-summary";
import { buildSimpleWorkbook, type SimpleSheet } from "./simple-workbook";
import { projectBudgetStates, type ProjectCostDetail, type ProjectCostItem } from "../backend-node/src/project-cost-model";

export type CeoWorkbookInput = {
  /** The projects shown, in the screen's order. */
  shown: readonly ProjectCostItem[];
  /** Every project the overview gave, for the All projects sheet. */
  all: readonly ProjectCostItem[];
  /** Each shown project's own cost, by id; a project whose detail could not be read is left out of the detail sheets. */
  details: ReadonlyMap<number, ProjectCostDetail>;
  schedule: ReadonlyMap<number, CeoScheduleFacts>;
  hoursPerManDay: number;
  today: string;
  t: (key: string) => string;
};

const round = (value: number | null | undefined, places = 2) => (value === null || value === undefined ? null : Math.round(value * 10 ** places) / 10 ** places);

export function ceoWorkbookSheets({ shown, all, details, schedule, hoursPerManDay, today, t }: CeoWorkbookInput): SimpleSheet[] {
  const label = (item: ProjectCostItem) => `${item.number} · ${item.name}`;
  const title = `${t("CEO.title")} · ${today}`;
  return [
    {
      name: t("CEO.sheet.summary"),
      title,
      columns: [
        { header: t("CEO.col.project"), width: 34 },
        { header: t("CEO.col.customer"), width: 22 },
        { header: t("CEO.col.pm"), width: 16 },
        { header: t("CEO.col.state"), width: 12 },
        { header: `${t("Cost.hardware")} · ${t("Cost.requested")}`, width: 14, number: true },
        { header: `${t("Cost.hardware")} · ${t("Cost.budget")}`, width: 14, number: true },
        { header: `${t("Cost.outsource")} · ${t("Cost.requested")}`, width: 14, number: true },
        { header: `${t("Cost.outsource")} · ${t("Cost.budget")}`, width: 14, number: true },
        { header: t("CEO.col.peopleForecast"), width: 14, number: true },
        { header: t("CEO.col.peopleBudget"), width: 14, number: true },
        { header: t("CEO.toKnow"), width: 60 },
        { header: t("CEO.pmNote"), width: 40 },
      ],
      rows: shown.map((item) => [
        label(item),
        item.customerName,
        item.managerName,
        t(`Cost.state.${projectBudgetStates(item).worst}`),
        item.hardware.requested,
        item.hardware.budget,
        item.outsource.requested,
        item.outsource.budget,
        round(Math.max(item.labor.plannedManDays, item.labor.forecastManDays ?? 0), 1),
        round(item.labor.budgetManDays, 1),
        thingsToKnow(item, schedule.get(item.id) ?? {})
          .map((fact) => `• ${factText(fact, t)}`)
          .join("\n"),
        item.ceoNote ? `${item.ceoNote.text} (${item.ceoNote.by})` : "",
      ]),
    },
    {
      name: t("CEO.sheet.people"),
      columns: [
        { header: t("CEO.col.project"), width: 34 },
        { header: t("Cost.person"), width: 22 },
        { header: t("Cost.colDiscipline"), width: 14 },
        { header: t("Cost.hours"), width: 10, number: true },
        { header: t("Cost.manDays"), width: 10, number: true },
        { header: t("Cost.daysConfirmed"), width: 12, number: true },
        { header: t("Cost.lastDay"), width: 12 },
      ],
      rows: shown.flatMap((item) =>
        (details.get(item.id)?.people ?? []).map((person) => [
          label(item),
          person.name,
          t(`Cost.discipline.${person.discipline}`),
          person.hours,
          round(person.hours / hoursPerManDay),
          person.days,
          person.lastDay,
        ]),
      ),
    },
    {
      name: t("CEO.sheet.tasks"),
      columns: [
        { header: t("CEO.col.project"), width: 34 },
        { header: t("Cost.colPlanRow"), width: 34 },
        { header: t("CEO.col.start"), width: 12 },
        { header: t("CEO.col.finish"), width: 12 },
        { header: "%", width: 8, number: true },
        { header: t("Cost.planned"), width: 12, number: true },
        { header: t("Cost.toDate"), width: 12, number: true },
        { header: t("Cost.outsourcedMd"), width: 12, number: true },
      ],
      rows: shown.flatMap((item) =>
        (details.get(item.id)?.plan ?? []).map((row) => [
          label(item),
          row.name,
          row.planStart,
          row.planFinish,
          Math.round(row.percentComplete),
          round(row.plannedManDays),
          round(row.toDateManDays),
          round(row.outsourcedManDays),
        ]),
      ),
    },
    {
      name: t("CEO.sheet.requests"),
      columns: [
        { header: t("CEO.col.project"), width: 34 },
        { header: t("Cost.colRequestNo"), width: 26 },
        { header: t("Cost.colStatus"), width: 16 },
        { header: t("Cost.colUnit"), width: 30 },
        { header: t("Cost.colNeedBy"), width: 12 },
        { header: t("Cost.colAmount"), width: 14, number: true },
        { header: t("Cost.colLines"), width: 8, number: true },
      ],
      rows: shown.flatMap((item) => (details.get(item.id)?.requests ?? []).map((row) => [label(item), row.number, row.status, row.unit, row.requiredDate, row.amount, row.lines])),
    },
    {
      name: t("CEO.sheet.all"),
      columns: [
        { header: t("CEO.col.project"), width: 34 },
        { header: t("CEO.col.status"), width: 14 },
        { header: t("CEO.col.state"), width: 12 },
        ...(["hardware", "outsource"] as const).flatMap((group) =>
          (["budget", "requested", "approved", "ordered"] as const).map((field) => ({ header: `${t(`Cost.${group}`)} · ${t(`Cost.${field}`)}`, width: 13, number: true })),
        ),
        { header: t("CEO.col.peopleBudget"), width: 12, number: true },
        { header: `${t("Cost.planned")} (MD)`, width: 12, number: true },
        { header: `${t("Cost.actual")} (MD)`, width: 12, number: true },
        { header: `${t("Cost.forecast")} (MD)`, width: 12, number: true },
      ],
      rows: all.map((item) => [
        label(item),
        t(item.status),
        t(`Cost.state.${projectBudgetStates(item).worst}`),
        item.hardware.budget,
        item.hardware.requested,
        item.hardware.approved,
        item.hardware.ordered,
        item.outsource.budget,
        item.outsource.requested,
        item.outsource.approved,
        item.outsource.ordered,
        round(item.labor.budgetManDays, 1),
        round(item.labor.plannedManDays, 1),
        round(item.labor.actualManDays, 1),
        round(item.labor.forecastManDays, 1),
      ]),
    },
  ];
}

export const buildCeoWorkbook = (input: CeoWorkbookInput): Uint8Array => buildSimpleWorkbook(ceoWorkbookSheets(input));

/** A file name Windows and macOS both accept: one project's number, or "all-projects", and the day. */
export const ceoWorkbookName = (focus: string | null, today: string) => `CEO-cost-summary_${(focus ?? "all-projects").replace(/[\\/:*?"<>|\s]+/g, "-")}_${today.replace(/-/g, "")}.xlsx`;
