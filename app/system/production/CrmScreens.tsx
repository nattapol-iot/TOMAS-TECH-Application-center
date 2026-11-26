"use client";

import { idLink, useLinkedState } from "../screen-link";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiClientError, apiRequest, assignmentDeliveryNote, downloadCrmDocument, uploadCrmDocument, type AssignmentNotificationResult, type BootstrapData } from "../api-client";
import { useLanguage, useT } from "../i18n";
import { Badge, EmptyState, FilterChips, Icon, KpiCard, Modal, PageHeader, Pagination, Panel, SearchInput, SegmentBar, SummaryTile, TablePageSize, Tabs, type IconName, type Tone } from "../ui";
import { CustomerModal } from "./AdminAnalyticsScreens";
import { ErpMasterPanel } from "./ErpMasterPanel";
import { estimateBusinessDate } from "../../../lib/estimate-ux";
import "../segment-filters.css";
import "./crm.css";
import { ProjectHandover } from "./ProjectHandover";
import { CRM_COPY } from "./crm-copy";
import { useSalesLook } from "./SalesLook";
import { dealSummaryCells, type DealSummaryCell } from "../../../lib/sales-look";
import {
  crmFailure,
  crmRequest,
  customerOptions,
  formatDay,
  formatMoment,
  teamOptions,
  text,
  useCrmData,
  useCrmPages,
  type CrmOption,
  type CrmPage,
  type CrmRecord,
  type CustomerDetail,
} from "./crm-records";
import type { FieldSpec } from "../tomas-ui/CrmForms";

export type { CrmRecord } from "./crm-records";
export { crmRequest, useCrmData } from "./crm-records";

/* The forms, pickers and the deal's action menu are built on @tomas-tc/ui (tomas-ui/CrmForms.tsx) and load when first
   opened, so the kit stays off the first load (lazy-screens.test.mjs). */
const crmKit = () => import("../tomas-ui/CrmForms");
const OpportunityDialog = lazy(() => crmKit().then((m) => ({ default: m.OpportunityDialog })));
const ActivityDialog = lazy(() => crmKit().then((m) => ({ default: m.ActivityDialog })));
const ContactDialog = lazy(() => crmKit().then((m) => ({ default: m.ContactDialog })));
const CrmFormDialog = lazy(() => crmKit().then((m) => ({ default: m.CrmFormDialog })));
const ConfigurationDialog = lazy(() => crmKit().then((m) => ({ default: m.ConfigurationDialog })));
const RemoveDialog = lazy(() => crmKit().then((m) => ({ default: m.RemoveDialog })));
const PickerIsland = lazy(() => crmKit().then((m) => ({ default: m.PickerIsland })));
const DealActions = lazy(() => crmKit().then((m) => ({ default: m.DealActions })));
const Kit = ({ children }: { children: ReactNode }) => <Suspense fallback={null}>{children}</Suspense>;

type Detail = { opportunity: CrmRecord; activities: CrmRecord[]; followups: CrmRecord[]; history: CrmRecord[]; links: CrmRecord[] };
export type CrmView = "crm-dashboard" | "crm-customers" | "crm-contacts" | "crm-opportunities" | "crm-activities" | "crm-pipeline";
type Props = {
  refreshBootstrap?: () => Promise<void>;
  notify?: (message: string) => void;
  bootstrap: BootstrapData;
  view: CrmView;
  onViewChange?: (view: CrmView) => void;
  preferredOpportunityId?: number | null;
  openInquiry: (id: number) => void;
  openEstimate: (id: number) => void;
  openProject: (id: number) => void;
};
const stages = ["NEW", "QUALIFICATION", "REQUIREMENT", "ESTIMATING", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "ON_HOLD"];
const activityTypes = ["Meeting", "Call", "Email", "SiteVisit", "CustomerUpdate", "InternalDiscussion", "MessageLINE", "Note", "Other"];
const futureDate = (days: number) => estimateBusinessDate(new Date(Date.now() + days * 86_400_000), process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok");
const money = (v: unknown) => (v == null || v === "" ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Number(v)));
const params = (values: Record<string, string>) => new URLSearchParams(Object.entries(values).filter(([, v]) => v !== ""));
/* Stage, follow-up status and attention flag all say "what state is this in",
   so they take the shared badge tones instead of a CRM-only palette. */
const CRM_TONE: Record<string, Tone> = {
  NEW: "slate",
  QUALIFICATION: "slate",
  REQUIREMENT: "blue",
  ESTIMATING: "blue",
  PROPOSAL: "violet",
  NEGOTIATION: "amber",
  WON: "green",
  LOST: "red",
  ON_HOLD: "slate",
  Open: "blue",
  WaitingCustomer: "amber",
  WaitingInternal: "amber",
  WaitingSupplier: "amber",
  Done: "green",
  Cancelled: "slate",
  Overdue: "red",
  DueToday: "amber",
  DueSoon: "amber",
  Scheduled: "slate",
  Waiting: "slate",
  Incomplete: "violet",
  NeedsFollowup: "amber",
  NoNextAction: "violet",
  NoActivity: "violet",
  EstimateDueSoon: "amber",
  Active: "green",
  Inactive: "slate",
  Technical: "blue",
  Buyer: "amber",
};
const toneFor = (value: string): Tone => CRM_TONE[value] ?? "slate";
const METRIC_TONES: Tone[] = ["blue", "amber", "red", "violet", "green"];
const METRIC_ICONS: IconName[] = ["folder", "clock", "alertTriangle", "users", "checkCircle"];

/* Loading, failed or nothing yet: three different things, said differently (CRM-06). */
function Notice({ error, loading }: { error?: boolean; loading?: boolean }) {
  const t = useT();
  return error ? (
    <div role="alert" className="alert danger">
      {t("CRM.loadFailed")}
    </div>
  ) : loading ? (
    <p role="status" className="crm-loading">
      {t("CRM.loading")}
    </p>
  ) : null;
}
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: CrmOption[]; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <label className="select-field">
      <span className="sr-only">{t(label)}</span>
      <select aria-label={t(label)} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" />
    </label>
  );
}
/** A long list as a filter: the kit picker with its own search box (CRM-02), in place of a native select. */
function FilterPicker({ label, value, options, onChange, allLabel, guide }: { label: string; value: string; options: CrmOption[]; onChange: (v: string) => void; allLabel: string; guide?: string }) {
  const t = useT();
  return (
    <Kit>
      <PickerIsland ariaLabel={t(label)} placeholder={t(allLabel)} value={value} options={options} clearable onChange={onChange} guide={guide} />
    </Kit>
  );
}
/* A customer from Pegasus ERP keeps the ERP name, address and open/closed state (migration 099); the server keeps them as well. */
function customerFields(record: CrmRecord, owner: FieldSpec): FieldSpec[] {
  const erp = Boolean(record.erpCustomerCode);
  return [
    { key: "nameTh", disabled: erp },
    { key: "nameEn", disabled: erp },
    { key: "nameJa" },
    { key: "shortName", hint: "CRM.shortNameHint" },
    { key: "industry" },
    { key: "country" },
    { key: "website", type: "url" },
    owner,
    { key: "site", wide: true, disabled: erp },
    { key: "isActive", type: "checkbox", disabled: erp },
  ];
}
const erpIntro = (record: CrmRecord) => (record.erpCustomerCode ? { lines: ["ErpMaster.lockedHint"] } : undefined);
function PageBar({ page, onPage }: { page: CrmPage | null | undefined; onPage?: (v: number) => void }) {
  if (!page || !onPage || !page.total) return null;
  return (
    <Pagination
      page={page.page}
      pageCount={Math.max(1, Math.ceil(page.total / page.pageSize))}
      from={(page.page - 1) * page.pageSize + 1}
      to={Math.min(page.page * page.pageSize, page.total)}
      total={page.total}
      onPage={onPage}
    />
  );
}
type Empty = { title: string; hint: string; action?: ReactNode };
const NO_MATCH: Empty = { title: "CRM.empty", hint: "CRM.emptyHint" };
/* Rows own their own paging furniture, because the application puts the page
   size above the table and the pager below it, both inside the panel. Held
   apart they read as a stray strip under the card. */
function Records({
  rows,
  columns,
  onOpen,
  onEdit,
  onRemove,
  page,
  onPage,
  onPageSize,
  openInquiry,
  empty = NO_MATCH,
  loading,
}: {
  rows: CrmRecord[];
  columns: string[];
  onOpen?: (r: CrmRecord) => void;
  onEdit?: (r: CrmRecord) => void;
  onRemove?: (r: CrmRecord) => void;
  page?: CrmPage | null;
  onPage?: (v: number) => void;
  onPageSize?: (v: number) => void;
  openInquiry?: (id: number) => void;
  empty?: Empty;
  loading?: boolean;
}) {
  const t = useT(),
    { lang } = useLanguage();
  if (!rows.length) return loading ? null : <EmptyState icon="inbox" title={empty.title} message={empty.hint} action={empty.action} />;
  const cell = (r: CrmRecord, c: string, n: number) => {
    const value = text(r[c]);
    if (c === "inquiryNo" && r.inquiryId && openInquiry)
      return (
        <button type="button" className="crm-link" onClick={() => openInquiry(Number(r.inquiryId))}>
          {value}
        </button>
      );
    if (n === 0 && onOpen)
      return (
        <button type="button" className="crm-link" onClick={() => onOpen(r)}>
          {value || "—"}
        </button>
      );
    if (c === "total" || c === "expectedValue") return money(r[c]);
    if (["nextDue", "dueDate", "targetDelivery", "reportDate"].includes(c)) return formatDay(r[c], lang) || "—";
    if (c === "uploadedAt") return formatMoment(r[c], lang) || "—";
    if (["stage", "status", "contactRole"].includes(c) && value)
      return <Badge tone={toneFor(value)}>{CRM_COPY[`CRM.${value}`] ? t(`CRM.${value}`) : t(value === "Approved" ? "CRM.costApproved" : value)}</Badge>;
    return CRM_COPY[`CRM.${value}`] ? t(`CRM.${value}`) : value || "—";
  };
  return (
    <div className={loading ? "table-wrap crm-refreshing" : "table-wrap"} aria-busy={loading || undefined}>
      {onPageSize && page ? <TablePageSize value={page.pageSize} onChange={onPageSize} /> : null}
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{t(c === "name" ? "CRM.recordName" : c === "title" ? "CRM.reportTitle" : c === "stage" ? "CRM.salesStage" : `CRM.${c}`)}</th>
            ))}
            {onEdit || onRemove ? <th>{t("Actions")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={text(r.id) || i}>
              {columns.map((c, n) => (
                <td key={c}>{cell(r, c, n)}</td>
              ))}
              {onEdit || onRemove ? (
                <td>
                  {onEdit ? (
                    <button type="button" className="btn default sm" onClick={() => onEdit(r)}>
                      {t("Edit")}
                    </button>
                  ) : null}
                  {onRemove ? (
                    <button type="button" className="btn danger sm" onClick={() => onRemove(r)} aria-label={`${t("CRM.remove")} ${text(r.name)}`}>
                      {t("CRM.remove")}
                    </button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <PageBar page={page} onPage={onPage} />
    </div>
  );
}
/* The deal list as it is presented (owner request 2026-10-25): the ten fields of a deal in five columns of two lines,
   so the table fits the screen instead of scrolling sideways. The name opens the deal, the inquiry number the inquiry. */
/* In the V2 (Pegasus) look the row action sits on the left as a quiet icon and the stage comes first, the ERP's column order
   (actions, status, document); the cells themselves are the same as V1's. */
function DealTable({
  rows,
  commercial,
  onOpen,
  onEdit,
  page,
  onPage,
  onPageSize,
  openInquiry,
  loading,
  empty,
}: {
  rows: CrmRecord[];
  commercial: boolean;
  onOpen: (r: CrmRecord) => void;
  onEdit?: (r: CrmRecord) => void;
  page?: CrmPage | null;
  onPage: (v: number) => void;
  onPageSize: (v: number) => void;
  openInquiry?: (id: number) => void;
  loading?: boolean;
  empty: Empty;
}) {
  const t = useT(),
    { lang } = useLanguage(),
    v2 = useSalesLook() === "v2";
  if (!rows.length) return loading ? null : <EmptyState icon="inbox" title={empty.title} message={empty.hint} action={empty.action} />;
  const label = (value: string) => (CRM_COPY[`CRM.${value}`] ? t(`CRM.${value}`) : value);
  // Value and close date are two facts: each line says which one it is, and an empty one says "not specified" (CRM-15).
  const closeLine = (r: CrmRecord) => `${t("CRM.closeShort")} ${formatDay(r.expectedClose, lang) || t("CRM.notSpecified")}`;
  return (
    <div className={loading ? "table-wrap crm-refreshing" : "table-wrap"} aria-busy={loading || undefined}>
      {page ? <TablePageSize value={page.pageSize} onChange={onPageSize} /> : null}
      <table className={`crm-deal-table${commercial ? " with-value" : ""}${onEdit ? " with-edit" : ""}`}>
        {v2 ? (
          <colgroup>
            {onEdit ? <col className="crm-col-act" /> : null}
            <col className="crm-col-stage" />
            <col className="crm-col-deal" />
            <col className="crm-col-customer" />
            <col className="crm-col-value" />
            <col className="crm-col-owner" />
          </colgroup>
        ) : (
          <colgroup>
            <col className="crm-col-deal" />
            <col className="crm-col-customer" />
            <col className="crm-col-stage" />
            <col className="crm-col-value" />
            <col className="crm-col-owner" />
            {onEdit ? <col className="crm-col-edit" /> : null}
          </colgroup>
        )}
        <thead>
          {v2 ? (
            <tr>
              {onEdit ? (
                <th className="pg-acts">
                  <span className="sr-only">{t("Actions")}</span>
                </th>
              ) : null}
              <th>{t("CRM.salesStage")}</th>
              <th>{t("CRM.dealColumn")}</th>
              <th>{t("CRM.customerName")}</th>
              <th className="num">{t(commercial ? "CRM.valueCloseColumn" : "CRM.expectedClose")}</th>
              <th>{t("CRM.ownerNextColumn")}</th>
            </tr>
          ) : (
            <tr>
              <th>{t("CRM.dealColumn")}</th>
              <th>{t("CRM.customerName")}</th>
              <th>{t("CRM.salesStage")}</th>
              <th className="num">{t(commercial ? "CRM.valueCloseColumn" : "CRM.expectedClose")}</th>
              <th>{t("CRM.ownerNextColumn")}</th>
              {onEdit ? (
                <th>
                  <span className="sr-only">{t("Actions")}</span>
                </th>
              ) : null}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((r) => {
            const stage = text(r.stage),
              status = text(r.inquiryStatus),
              action = text(r.nextAction),
              flags = ((r.attention as string[]) ?? []).filter((a) => a !== "Scheduled" && a !== "DueSoon");
            const dealCell = (
              <td>
                <button type="button" className="crm-link crm-deal-name" title={text(r.name)} onClick={() => onOpen(r)}>
                  {text(r.name) || "—"}
                </button>
                <small className="crm-deal-sub" title={text(r.opportunityNo)}>
                  {text(r.opportunityNo)}
                </small>
              </td>
            );
            const customerCell = (
              <td>
                <span className="crm-deal-clamp" title={text(r.customerName)}>
                  {text(r.customerName) || "—"}
                </span>
                <small className="crm-deal-sub">{text(r.customerCode)}</small>
              </td>
            );
            const stageCell = (
              <td>
                {stage ? <Badge tone={toneFor(stage)}>{label(stage)}</Badge> : "—"}
                {["PROPOSAL", "NEGOTIATION"].includes(stage) && !r.proposalSentOn ? (
                  <small className="crm-deal-sub">{t("CRM.unverifiedProposal")}</small>
                ) : stage === "WON" && !r.wonOn ? (
                  <small className="crm-deal-sub">{t("CRM.unverifiedWon")}</small>
                ) : null}
                {r.inquiryNo ? (
                  <small className="crm-deal-sub">
                    {r.inquiryId && openInquiry ? (
                      <button type="button" className="crm-link" onClick={() => openInquiry(Number(r.inquiryId))}>
                        {text(r.inquiryNo)}
                      </button>
                    ) : (
                      text(r.inquiryNo)
                    )}
                    {status ? ` · ${t(status === "Approved" ? "CRM.costApproved" : status)}` : ""}
                  </small>
                ) : null}
              </td>
            );
            return (
              <tr key={text(r.id)}>
                {v2 ? (
                  <>
                    {onEdit ? (
                      <td className="pg-acts">
                        <button type="button" className="pg-act" title={t("Edit")} aria-label={`${t("Edit")}: ${text(r.name)}`} onClick={() => onEdit(r)}>
                          <Icon name="edit" />
                        </button>
                      </td>
                    ) : null}
                    {stageCell}
                    {dealCell}
                    {customerCell}
                  </>
                ) : (
                  <>
                    {dealCell}
                    {customerCell}
                    {stageCell}
                  </>
                )}
                <td className="num">
                  {commercial ? (
                    <>
                      <strong className="crm-deal-value">
                        {r.expectedValue != null && r.expectedValue !== "" ? money(r.expectedValue) : <span className="crm-muted">{t("CRM.valueNotSpecified")}</span>}
                      </strong>
                      <small className="crm-deal-sub">{closeLine(r)}</small>
                    </>
                  ) : (
                    <span className={r.expectedClose ? undefined : "crm-muted"}>{formatDay(r.expectedClose, lang) || t("CRM.notSpecified")}</span>
                  )}
                </td>
                <td>
                  <span className="crm-deal-ownerline">
                    <span className="crm-deal-owner">{text(r.salesOwnerName) || "—"}</span>
                    {flags.slice(0, 2).map((a) => (
                      <Badge key={a} tone={toneFor(a)}>
                        {t(`CRM.${a}`)}
                      </Badge>
                    ))}
                  </span>
                  <small className="crm-deal-sub crm-deal-clamp" title={action || undefined}>
                    {action ? `${action}${r.nextDue ? ` · ${formatDay(r.nextDue, lang)}` : ""}` : t("CRM.NoNextAction")}
                  </small>
                </td>
                {onEdit && !v2 ? (
                  <td>
                    <button type="button" className="btn default sm" onClick={() => onEdit(r)}>
                      {t("Edit")}
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      <PageBar page={page} onPage={onPage} />
    </div>
  );
}

/* The V2 deal list's summary bar (Pegasus C.2): every cell counts its stage over the whole book, as the pipeline bar does,
   and sets the filter it names; pressed again it lists every deal. */
function DealSummary({
  cells,
  stage,
  onlyOpen,
  labelOf,
  onPick,
}: {
  cells: DealSummaryCell[];
  stage: string;
  onlyOpen: boolean;
  labelOf: (code: string) => string;
  onPick: (cell: DealSummaryCell | null) => void;
}) {
  const t = useT();
  return (
    <div className="pg-summary crm-deal-summary" role="group" aria-label={t("CRM.salesStage")} data-guide="crm.summary">
      {cells.map((cell) => {
        const pressed = cell.stage === stage && (cell.stage !== "" || onlyOpen);
        return (
          <button key={cell.key} type="button" className="pg-cell" aria-pressed={pressed} onClick={() => onPick(pressed ? null : cell)}>
            <span className="pg-cell-label">{cell.stage ? labelOf(cell.stage) : t("CRM.open")}</span>
            <strong className="pg-cell-value">{cell.count.toLocaleString("en-US")}</strong>
          </button>
        );
      })}
    </div>
  );
}
function LocalRecords({ rows, columns, onOpen, empty }: { rows: CrmRecord[]; columns: string[]; onOpen?: (r: CrmRecord) => void; empty?: Empty }) {
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    pageCount = Math.max(1, Math.ceil(rows.length / pageSize)),
    resolvedPage = Math.min(page, pageCount),
    paged = rows.slice((resolvedPage - 1) * pageSize, resolvedPage * pageSize);
  return (
    <Records
      rows={paged}
      columns={columns}
      onOpen={onOpen}
      empty={empty}
      page={{ items: paged, total: rows.length, page: resolvedPage, pageSize }}
      onPage={setPage}
      onPageSize={(size) => {
        setPageSize(size);
        setPage(1);
      }}
    />
  );
}

/* Open stages in the order a deal travels through them. The bar, the legend
   and the segment colours all index off this list, so a position on screen
   always means the same stage. */
const OPEN_STAGES = stages.filter((code) => !["WON", "LOST", "ON_HOLD"].includes(code));

/* A distribution belongs in one bar, not in one card per stage: the same
   reading in a fraction of the height. Every segment is also the filter it
   describes, so looking and acting are one click. */
/* The pipeline ramp runs cool to warm as a deal commits, so a glance at the bar says how far along the
   book is, not just how it splits: one chart token per open stage, in OPEN_STAGES order. */
const STAGE_RAMP = ["var(--c8)", "var(--c2)", "var(--c1)", "var(--c7)", "var(--c5)", "var(--c4)"];
function PipelineBar({ counts, labelOf, active, onPick }: { counts: Record<string, number>; labelOf: (code: string) => string; active: string; onPick: (code: string) => void }) {
  const t = useT(),
    items = OPEN_STAGES.map((code, index) => ({ key: code, label: labelOf(code), value: Number(counts[code] ?? 0), tone: toneFor(code), color: STAGE_RAMP[index] })),
    total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="crm-distribution">
      <SegmentBar
        label="CRM.pipelineOverview"
        items={items}
        link="stage"
        active={active || null}
        onPick={(code) => onPick(code ?? "")}
        lead={
          <>
            <strong>{total}</strong>
            <span>{t("CRM.open")}</span>
          </>
        }
      />
      {total ? null : <p className="crm-muted">{t("CRM.noOpenDeals")}</p>}
    </div>
  );
}

/* What needs doing now, kept apart from deals that only lack data (CRM UX audit CRM-08): the urgent counts are the red
   and amber chips; waiting and incomplete are quiet chips beside them. Each count is the filter it names. */
const ATTENTION_KEYS = ["Overdue", "DueToday", "NeedsFollowup", "EstimateDueSoon"];
const QUIET_KEYS = ["Waiting", "Incomplete"];
function AttentionChips({ counts, active, onPick }: { counts: CrmRecord | null; active: string; onPick: (key: string) => void }) {
  const t = useT();
  return (
    <div className="crm-attention" data-guide="crm.attention">
      <span className="crm-attention-label">{t("CRM.urgentGroup")}</span>
      <FilterChips
        items={ATTENTION_KEYS.map((key) => ({ key, label: `CRM.${key}`, value: Number(counts?.[key] ?? 0), tone: toneFor(key) }))}
        link="attention"
        active={ATTENTION_KEYS.includes(active) ? active : null}
        onPick={(key) => onPick(key ?? "")}
      />
      <span className="crm-attention-label">{t("CRM.notUrgentGroup")}</span>
      <ul className="filter-chips">
        {QUIET_KEYS.map((key) => (
          <li key={key}>
            <button type="button" aria-pressed={active === key} className={`filter-chip ${toneFor(key)}${active === key ? " active" : ""}`} onClick={() => onPick(active === key ? "" : key)}>
              <span>{t(`CRM.${key}`)}</span>
              <strong>{Number(counts?.[key] ?? 0)}</strong>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* A funnel is only honest against a fixed denominator, so each step is a share
   of the opportunities in scope — never a share of the steps beside it. */
function ConversionFunnel({ total, steps }: { total: number; steps: { label: string; value: number }[] }) {
  const t = useT();
  return (
    <>
      <ul className="crm-funnel">
        {steps.map((step, index) => {
          const share = total ? Math.round((step.value / total) * 100) : 0;
          return (
            <li key={step.label}>
              <span>{t(step.label)}</span>
              <strong>
                {step.value}
                <em>{total ? `${share}%` : "—"}</em>
              </strong>
              <span className="crm-funnel-track">
                <b className={`c${index}`} style={{ width: `${share}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="crm-muted">{t("CRM.funnelBase").replace("{n}", String(total))}</p>
    </>
  );
}

function MetricStrip({ items }: { items: { label: string; value: unknown; tone?: string; hint?: string; icon?: IconName; onClick?: () => void }[] }) {
  return (
    <div className="kpi-grid">
      {items.map((item, index) => (
        <KpiCard
          key={item.label}
          label={item.label}
          value={text(item.value) || "0"}
          note={item.hint}
          icon={item.icon ?? METRIC_ICONS[index % METRIC_ICONS.length]}
          tone={(item.tone as Tone | undefined) ?? METRIC_TONES[index % METRIC_TONES.length]}
          onClick={item.onClick}
        />
      ))}
    </div>
  );
}
/* Label/value facts about one record — not counts — so they use the summary
   strip rather than KPI cards, which size their value for numbers. */
function FactStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="summary-strip four">
      {items.map((item) => (
        <SummaryTile key={item.label} label={item.label} value={item.value || "—"} />
      ))}
    </div>
  );
}
function useOptions(options: CrmRecord[]) {
  const { lang } = useLanguage();
  return (kind: string): CrmOption[] =>
    options.filter((o) => o.kind === kind && o.isActive !== false).map((o) => ({ value: text(o.code), label: text(o[lang === "TH" ? "labelTh" : lang === "JP" ? "labelJa" : "labelEn"]) }));
}

export function CrmScreen(props: Props) {
  const { bootstrap, view, preferredOpportunityId } = props,
    t = useT();
  // The open deal and customer are on the screen's link (screen-link.tsx); the screen remounts for each CRM view.
  const [opportunityId, setOpportunityId] = useLinkedState("opportunity", preferredOpportunityId ?? null, idLink, { remember: false }),
    [customerId, setCustomerId] = useLinkedState("customer", null, idLink, { remember: false }),
    [create, setCreate] = useState(false),
    [config, setConfig] = useState(false);
  const options = useCrmData<CrmRecord[]>("/api/v1/crm/options");
  // A deal opened from elsewhere replaces the one on show; the first pass keeps what the link opened.
  const shownDeal = useRef(preferredOpportunityId);
  useEffect(() => {
    if (shownDeal.current === preferredOpportunityId) return;
    shownDeal.current = preferredOpportunityId;
    const timer = setTimeout(() => {
      setOpportunityId(preferredOpportunityId ?? null);
      setCustomerId(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [preferredOpportunityId, setOpportunityId, setCustomerId]);
  const write = bootstrap.permissions.includes("crm.write");
  if (!bootstrap.permissions.includes("crm.read")) return <p>{t("CRM.permissions")}</p>;
  const title = opportunityId
    ? "CRM Opportunities"
    : customerId
      ? "CRM Customers"
      : {
          "crm-dashboard": "CRM Dashboard",
          "crm-customers": "CRM Customers",
          "crm-contacts": "CRM Contacts",
          "crm-opportunities": "CRM Opportunities",
          "crm-activities": "CRM Activities",
          "crm-pipeline": "CRM Opportunities",
        }[view];
  const descriptions: Record<CrmView, string> = {
    "crm-dashboard": "CRM.introDashboard",
    "crm-customers": "CRM.introCustomers",
    "crm-contacts": "CRM.introContacts",
    "crm-opportunities": "CRM.introOpportunities",
    "crm-activities": "CRM.introActivities",
    "crm-pipeline": "CRM.introPipeline",
  };
  const showNew = !opportunityId && !customerId && ["crm-dashboard", "crm-opportunities", "crm-pipeline"].includes(view);
  return (
    <div className="crm-workspace">
      <PageHeader
        eyebrow="CRM & SALES"
        title={title}
        subtitle={!opportunityId && !customerId ? descriptions[view] : undefined}
        actions={
          <>
            {opportunityId || customerId ? (
              <button
                className="btn default"
                onClick={() => {
                  setOpportunityId(null);
                  setCustomerId(null);
                }}
              >
                <Icon name="arrowLeft" />
                {t("CRM.back")}
              </button>
            ) : null}
            {bootstrap.permissions.includes("crm.configure") && view === "crm-dashboard" && !opportunityId && !customerId ? (
              <button className="btn default" onClick={() => setConfig(true)}>
                <Icon name="settings" />
                {t("CRM.configuration")}
              </button>
            ) : null}
            {write && showNew ? (
              <button className="btn primary" data-guide="crm.new" onClick={() => setCreate(true)}>
                <Icon name="plus" />
                {t("CRM.new")}
              </button>
            ) : null}
          </>
        }
      />
      {!opportunityId && !customerId && props.onViewChange && (view === "crm-opportunities" || view === "crm-pipeline") ? (
        <Tabs<CrmView>
          tabs={[
            { id: "crm-opportunities", label: "CRM.listView" },
            { id: "crm-pipeline", label: "CRM.boardView" },
          ]}
          active={view}
          onChange={props.onViewChange}
        />
      ) : null}
      <Notice error={options.error} />
      {opportunityId ? (
        <OpportunityWorkspace {...props} id={opportunityId} options={options.data ?? []} openCustomer={setCustomerId} onCustomer={() => setOpportunityId(null)} />
      ) : customerId ? (
        <CustomerWorkspace {...props} id={customerId} openOpportunity={setOpportunityId} />
      ) : view === "crm-customers" ? (
        <CustomerList bootstrap={bootstrap} refreshBootstrap={props.refreshBootstrap} open={setCustomerId} />
      ) : view === "crm-contacts" ? (
        <ContactList bootstrap={bootstrap} />
      ) : view === "crm-activities" ? (
        <ActivityList bootstrap={bootstrap} openOpportunity={setOpportunityId} openCustomer={setCustomerId} />
      ) : (
        <OpportunityList openInquiry={props.openInquiry} bootstrap={bootstrap} mode={view} options={options.data ?? []} open={setOpportunityId} onNew={write ? () => setCreate(true) : undefined} />
      )}
      {create ? <OpportunityEditor bootstrap={bootstrap} options={options.data ?? []} onClose={() => setCreate(false)} onSaved={(r) => setOpportunityId(Number(r.id))} /> : null}
      {config ? (
        <Kit>
          <ConfigurationDialog
            options={options.data ?? []}
            onClose={() => setConfig(false)}
            onSave={async (v) => {
              await crmRequest(`/api/v1/crm/options/${v.kind}/${encodeURIComponent(text(v.code))}`, "PUT", v);
              options.refresh();
            }}
          />
        </Kit>
      ) : null}
    </div>
  );
}

const SORTS = [
  { value: "updated", label: "Last updated" },
  { value: "due", label: "CRM.sortDue" },
  { value: "close", label: "CRM.expectedClose" },
];
const ATTENTION_FILTERS = ["Actionable", ...ATTENTION_KEYS, "Waiting", "WaitingCustomer", "Incomplete", "NoNextAction", "NoActivity"];
function OpportunityList({
  bootstrap,
  mode,
  options,
  open,
  openInquiry,
  onNew,
}: {
  bootstrap: BootstrapData;
  mode: CrmView;
  options: CrmRecord[];
  open: (id: number) => void;
  openInquiry: (id: number) => void;
  onNew?: () => void;
}) {
  const t = useT(),
    { lang } = useLanguage(),
    choice = useOptions(options),
    [search, setSearch] = useState(""),
    [stage, setStage] = useState(""),
    [attention, setAttention] = useState(""),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [owner, setOwner] = useState(""),
    [onlyOpen, setOnlyOpen] = useState(mode !== "crm-opportunities"),
    [sort, setSort] = useState("updated"),
    [edit, setEdit] = useState<CrmRecord | null>(null),
    [createStage, setCreateStage] = useState<string | null>(null);
  const write = bootstrap.permissions.includes("crm.write"),
    v2 = useSalesLook() === "v2",
    board = mode === "crm-pipeline",
    me = String(bootstrap.user.id);
  const [drag, setDrag] = useState<{ id: number; from: string } | null>(null),
    [over, setOver] = useState(""),
    [moved, setMoved] = useState<{ id: number; stage: string } | null>(null),
    [moveError, setMoveError] = useState("");
  const filters = { search, stage, attention, open: String(onlyOpen), ownerId: owner, sort };
  const list = useCrmData<CrmPage>(board ? null : `/api/v1/crm/opportunities?${params({ ...filters, page: String(page), pageSize: String(pageSize) })}`);
  // The board reads 100 cards a page and asks for the next 100 on request, so no deal is out of reach (CRM-05).
  const boardBase = board ? `/api/v1/crm/opportunities?${params({ ...filters, pageSize: "100" })}` : null,
    [boardPages, setBoardPages] = useState({ base: "", pages: 1 });
  const boardList = useCrmPages(boardBase, boardPages.base === boardBase ? boardPages.pages : 1);
  const dashboard = useCrmData<CrmRecord>("/api/v1/crm/dashboard");
  const rows = board ? boardList.items : (list.shown?.items ?? []),
    loading = board ? boardList.loading : list.loading,
    failed = board ? boardList.error : list.error;
  const refresh = () => {
    if (board) boardList.refresh();
    else list.refresh();
    dashboard.refresh();
  };
  const label = (s: string) => choice("stage").find((o) => o.value === s)?.label ?? s;
  // The card sits in its new column from the moment it is dropped, and stays
  // there until the refreshed list agrees — so it never snaps back and then
  // forward again while the request is in flight.
  const pending = moved && !rows.some((r) => Number(r.id) === moved.id && text(r.stage) === moved.stage) ? moved : null;
  const boardRows = pending ? rows.map((r) => (Number(r.id) === pending.id ? { ...r, stage: pending.stage } : r)) : rows;
  /* Dropping a card is the same edit the dialog makes, so it takes the same
     PUT with the row version the card was drawn from: a board left open while
     someone else moved that opportunity is refused, never silently overwritten. */
  const moveTo = async (row: CrmRecord, stage: string) => {
    const id = Number(row.id);
    if (!write || text(row.stage) === stage) return;
    if (["PROPOSAL", "NEGOTIATION"].includes(stage) && !row.proposalSentOn) {
      setEdit({ ...row, stage, previousStage: row.stage });
      return;
    }
    setMoveError("");
    setMoved({ id, stage });
    try {
      await crmRequest(`/api/v1/crm/opportunities/${id}`, "PUT", { stage, rowVersion: row.rowVersion });
      refresh();
    } catch (error) {
      setMoved(null);
      setMoveError(error instanceof ApiClientError && error.status === 409 ? "CRM.moveConflict" : "CRM.moveFailed");
    }
  };
  const card = (r: CrmRecord) => (
    <button
      className={`crm-opportunity-card${drag?.id === Number(r.id) ? " dragging" : ""}`}
      key={text(r.id)}
      draggable={write && board}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", text(r.id));
        setDrag({ id: Number(r.id), from: text(r.stage) });
      }}
      onDragEnd={() => {
        setDrag(null);
        setOver("");
      }}
      onClick={() => open(Number(r.id))}
    >
      <strong>{text(r.name)}</strong>
      <span className="crm-card-customer">{text(r.customerName)}</span>
      {bootstrap.permissions.includes("crm.commercial.read") ? <span className="crm-card-value">{money(r.expectedValue)}</span> : null}
      <span className="crm-card-value">{formatDay(r.expectedClose, lang) || t("CRM.notSpecified")}</span>
      <small>
        {text(r.nextAction) || t("CRM.NoNextAction")} {formatDay(r.nextDue, lang)}
      </small>
      <div className="crm-flags">
        {((r.attention as string[]) ?? [])
          .filter((a) => a !== "Scheduled" && a !== "DueSoon")
          .map((a) => (
            <Badge key={a} tone={toneFor(a)}>
              {t(`CRM.${a}`)}
            </Badge>
          ))}
      </div>
    </button>
  );
  const dash = dashboard.data;
  // V2 lists (not the dashboard, whose overview carries the follow-up chips and the funnel) open on the ERP's summary bar.
  const summary = v2 && mode !== "crm-dashboard";
  const pickCell = (cell: DealSummaryCell | null) => {
    setSearch("");
    setOwner("");
    setAttention("");
    setStage(cell?.stage ?? "");
    setOnlyOpen(cell?.open ?? false);
    setPage(1);
  };
  const filtered = Boolean(search || stage || attention || owner);
  const clear = () => {
    setSearch("");
    setStage("");
    setAttention("");
    setOwner("");
    setOnlyOpen(mode !== "crm-opportunities");
    setPage(1);
  };
  const empty: Empty = filtered
    ? {
        title: "CRM.empty",
        hint: "CRM.emptyHint",
        action: (
          <button type="button" className="btn default" onClick={clear}>
            {t("CRM.clearFilters")}
          </button>
        ),
      }
    : {
        title: "CRM.noDeals",
        hint: "CRM.noDealsHint",
        action: onNew ? (
          <button type="button" className="btn primary" onClick={onNew}>
            <Icon name="plus" />
            {t("CRM.new")}
          </button>
        ) : undefined,
      };
  return (
    <>
      <Notice error={dashboard.error || failed} loading={loading} />
      {summary ? (
        <DealSummary
          cells={dealSummaryCells(OPEN_STAGES, (dash?.stages as Record<string, number> | undefined) ?? {}, Number(dash?.open ?? 0))}
          stage={stage}
          onlyOpen={onlyOpen}
          labelOf={label}
          onPick={pickCell}
        />
      ) : null}
      {summary ? null : (
        <Panel title="CRM.pipelineOverview" subtitle="CRM.allScopeHint">
          <div className="crm-overview">
            <ul className="filter-chips">
              {[
                { key: "totalOpportunities", count: dash?.totalOpportunities, open: false, attention: "", owner: "" },
                { key: "open", count: dash?.open, open: true, attention: "", owner: "" },
                { key: "mine", count: dash?.mine, open: true, attention: "", owner: me },
                { key: "Actionable", count: dash?.actionable, open: true, attention: "Actionable", owner: "" },
              ].map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className="filter-chip slate"
                    aria-pressed={item.key === "mine" ? owner === me && !attention : item.key === "Actionable" ? attention === "Actionable" : false}
                    onClick={() => {
                      setSearch("");
                      setOwner(item.owner);
                      setStage("");
                      setOnlyOpen(item.open);
                      setAttention(item.attention);
                      setPage(1);
                    }}
                  >
                    {t(`CRM.${item.key}`)} <strong>{Number(item.count ?? 0)}</strong>
                  </button>
                </li>
              ))}
            </ul>
            <PipelineBar
              counts={(dash?.stages as Record<string, number> | undefined) ?? {}}
              labelOf={label}
              active={stage}
              onPick={(code) => {
                setSearch("");
                setOwner("");
                setOnlyOpen(true);
                setStage(code);
                setAttention("");
                setPage(1);
              }}
            />
            {mode === "crm-dashboard" ? (
              <>
                <AttentionChips
                  counts={dash}
                  active={attention}
                  onPick={(key) => {
                    setSearch("");
                    setOwner("");
                    setOnlyOpen(true);
                    setAttention(key);
                    setStage("");
                    setSort(key ? "due" : "updated");
                    setPage(1);
                  }}
                />
                <ConversionFunnel
                  total={Number(dash?.totalOpportunities ?? 0)}
                  steps={[
                    { label: "CRM.convertedToInquiry", value: Number(dash?.convertedToInquiry ?? 0) },
                    { label: "CRM.convertedToEstimate", value: Number(dash?.convertedToEstimate ?? 0) },
                    { label: "CRM.convertedToProject", value: Number(dash?.convertedToProject ?? 0) },
                  ]}
                />
                <p className="crm-muted">
                  {t("CRM.directInquiries")}: <strong>{Number(dash?.directInquiries ?? 0)}</strong> · {t("CRM.directInquiriesHint")}
                </p>
              </>
            ) : null}
          </div>
        </Panel>
      )}

      <div className="toolbar crm-filters" data-guide="crm.filters">
        <SearchInput
          link="q"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="CRM.search"
        />
        <FilterSelect
          label="CRM.stage"
          value={stage}
          onChange={(v) => {
            setStage(v);
            setPage(1);
          }}
          options={[{ value: "", label: t("CRM.allStages") }, ...choice("stage")]}
        />
        <FilterPicker
          label="CRM.ownerId"
          allLabel="CRM.allOwners"
          value={owner}
          onChange={(v) => {
            setOwner(v);
            setPage(1);
          }}
          options={teamOptions(bootstrap)}
        />
        <FilterSelect label="CRM.sort" value={sort} onChange={setSort} options={SORTS.map((o) => ({ value: o.value, label: t(o.label) }))} />
        <FilterSelect
          label="CRM.Actionable"
          value={attention}
          onChange={(v) => {
            setAttention(v);
            setPage(1);
          }}
          options={[{ value: "", label: t("CRM.allFollowups") }, ...ATTENTION_FILTERS.map((key) => ({ value: key, label: t(`CRM.${key}`) }))]}
        />
        <label>
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => {
              setOnlyOpen(e.target.checked);
              setPage(1);
            }}
          />
          {t("CRM.open")}
        </label>
        {filtered ? (
          <button type="button" className="btn default sm" onClick={clear}>
            {t("CRM.clearFilters")}
          </button>
        ) : null}
        <span className="spacer" />
        <button className="btn default" onClick={refresh}>
          <Icon name="refresh" />
          {t("Refresh")}
        </button>
      </div>

      {board && moveError ? (
        <div role="alert" className="alert danger">
          {t(moveError)}
        </div>
      ) : null}
      {board ? (
        <>
          {boardList.total > rows.length ? (
            <p className="crm-muted crm-board-count" role="status">
              {t("CRM.boardShowing").replace("{shown}", String(rows.length)).replace("{total}", String(boardList.total))}{" "}
              <button
                type="button"
                className="btn default sm"
                disabled={loading}
                onClick={() => setBoardPages({ base: boardBase ?? "", pages: (boardPages.base === boardBase ? boardPages.pages : 1) + 1 })}
              >
                {t("CRM.loadMore")}
              </button>
            </p>
          ) : null}
          <div className="crm-pipeline" data-guide="crm.deals">
            {OPEN_STAGES.map((s) => {
              const stageRows = boardRows.filter((r) => r.stage === s);
              return (
                <section
                  key={s}
                  data-stage={s}
                  className={over === s && drag && drag.from !== s ? "drop-target" : undefined}
                  onDragOver={(event) => {
                    if (!drag || drag.from === s) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setOver(s);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((current) => (current === s ? "" : current));
                  }}
                  onDrop={(event) => {
                    if (!drag) return;
                    event.preventDefault();
                    const row = rows.find((r) => Number(r.id) === drag.id);
                    setOver("");
                    setDrag(null);
                    if (row) void moveTo(row, s);
                  }}
                >
                  <header>
                    <h3>{label(s)}</h3>
                    <strong>
                      {Number((dash?.stages as Record<string, number> | undefined)?.[s] ?? stageRows.length) === stageRows.length || filtered
                        ? stageRows.length
                        : `${stageRows.length}/${Number((dash?.stages as Record<string, number> | undefined)?.[s] ?? 0)}`}
                    </strong>
                  </header>
                  {stageRows.map(card)}
                  {write ? (
                    <button type="button" className="crm-pipeline-add" onClick={() => setCreateStage(s)}>
                      ＋ {t("CRM.new")}
                    </button>
                  ) : null}
                </section>
              );
            })}
          </div>
          {!rows.length && !loading ? (
            <Panel flush>
              <EmptyState icon="folder" title={empty.title} message={empty.hint} action={empty.action} />
            </Panel>
          ) : null}
        </>
      ) : (
        <Panel flush guide="crm.deals" title={`${list.shown?.total ?? 0} ${t("CRM Opportunities")}`} subtitle="CRM.filteredResults">
          <DealTable
            openInquiry={openInquiry}
            rows={rows}
            loading={loading}
            empty={empty}
            commercial={bootstrap.permissions.includes("crm.commercial.read")}
            onOpen={(r) => open(Number(r.id))}
            onEdit={write ? setEdit : undefined}
            page={list.shown}
            onPage={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </Panel>
      )}
      {edit ? <OpportunityEditor bootstrap={bootstrap} options={options} initial={edit} onClose={() => setEdit(null)} onSaved={refresh} onReload={refresh} /> : null}
      {createStage ? (
        <OpportunityEditor
          bootstrap={bootstrap}
          options={options}
          defaultStage={createStage}
          onClose={() => setCreateStage(null)}
          onSaved={(r) => {
            setCreateStage(null);
            open(Number(r.id));
          }}
        />
      ) : null}
    </>
  );
}

/** The deal form (tomas-ui/CrmForms.tsx OpportunityDialog); this side keeps the API call and the body it sends. */
function OpportunityEditor({
  bootstrap,
  options,
  initial,
  defaultStage,
  onClose,
  onSaved,
  onReload,
}: {
  bootstrap: BootstrapData;
  options: CrmRecord[];
  initial?: CrmRecord;
  defaultStage?: string;
  onClose: () => void;
  onSaved: (r: CrmRecord) => void;
  onReload?: () => void;
}) {
  const choice = useOptions(options);
  return (
    <Kit>
      <OpportunityDialog
        bootstrap={bootstrap}
        choice={choice}
        initial={initial}
        defaultStage={defaultStage}
        onClose={onClose}
        onReload={
          onReload
            ? () => {
                onClose();
                onReload();
              }
            : undefined
        }
        onSave={async (v, create) => {
          const { nextActionText, nextActionDue, ...deal } = v,
            action = text(nextActionText).trim();
          // The first next action is saved with the deal, owned by the sales owner.
          const body = create && action ? { ...deal, nextAction: { action, ownerId: deal.salesOwnerId, dueDate: nextActionDue } } : deal;
          const result = await crmRequest<CrmRecord>(`/api/v1/crm/opportunities${initial ? `/${initial.id}` : ""}`, initial ? "PUT" : "POST", body);
          onSaved(result);
        }}
      />
    </Kit>
  );
}

/* The stage rail (CRM-14): the open stages in order, then the outcome, won or lost, as one end, never "lost" as a step
   after "won". A deal on hold says so beside the rail. */
function StageRail({ stage, labelOf }: { stage: string; labelOf: (code: string) => string }) {
  const t = useT(),
    at = OPEN_STAGES.indexOf(stage),
    closed = stage === "WON" || stage === "LOST";
  return (
    <div className="crm-stage-wrap">
      {stage === "ON_HOLD" ? <Badge tone="slate">{labelOf("ON_HOLD")}</Badge> : null}
      <div className="crm-stagebar" data-guide="crm.stagebar" aria-label={t("CRM.stage")}>
        {OPEN_STAGES.map((s, index) => (
          <span key={s} aria-current={index === at ? "step" : undefined} className={index === at ? "active" : closed || (at > -1 && index < at) ? "done" : ""}>
            {labelOf(s)}
          </span>
        ))}
        <span className={`outcome${stage === "WON" ? " won" : stage === "LOST" ? " lost" : ""}`} aria-current={closed ? "step" : undefined}>
          {closed ? labelOf(stage) : `${labelOf("WON")} / ${labelOf("LOST")}`}
        </span>
      </div>
    </div>
  );
}

/** An audit row's before/after as changed fields in words; the raw record stays behind "technical details". */
function HistoryChanges({ before, after }: { before: unknown; after: unknown }) {
  const t = useT(),
    { lang } = useLanguage();
  const parse = (v: unknown): CrmRecord => {
    try {
      return typeof v === "string" && v ? (JSON.parse(v) as CrmRecord) : {};
    } catch {
      return {};
    }
  };
  const was = parse(before),
    now = parse(after),
    skip = ["rowVersion", "updatedAt", "updatedBy", "createdAt", "createdBy", "deletedAt", "deletedBy", "id", "stageChangedAt", "opportunityNo"];
  // Dates and moments read in the reader's language and the business clock, never as raw ISO text (CRM-17).
  const show = (_key: string, v: unknown) =>
    v == null || v === ""
      ? "—"
      : /^\d{4}-\d{2}-\d{2}T/.test(text(v))
        ? formatMoment(v, lang)
        : /^\d{4}-\d{2}-\d{2}$/.test(text(v))
          ? formatDay(v, lang)
          : CRM_COPY[`CRM.${text(v)}`]
            ? t(`CRM.${text(v)}`)
            : text(v);
  const changed = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((key) => !skip.includes(key) && JSON.stringify(was[key] ?? null) !== JSON.stringify(now[key] ?? null));
  if (!changed.length) return null;
  return (
    <ul className="crm-history-changes">
      {changed.slice(0, 12).map((key) => (
        <li key={key}>
          <span>{CRM_COPY[`CRM.${key}`] ? t(`CRM.${key}`) : key}</span>:{" "}
          {Object.keys(was).length ? (
            <>
              <del>{show(key, was[key])}</del> →{" "}
            </>
          ) : null}
          <strong>{show(key, now[key])}</strong>
        </li>
      ))}
    </ul>
  );
}

function OpportunityWorkspace({ id, options, openCustomer, onCustomer, ...props }: Props & { id: number; options: CrmRecord[]; openCustomer: (id: number) => void; onCustomer: () => void }) {
  const t = useT(),
    { lang } = useLanguage(),
    choice = useOptions(options),
    [tab, setTab] = useState("overview"),
    [editor, setEditor] = useState<string | null>(null),
    [action, setAction] = useState<CrmRecord | null>(null);
  const state = useCrmData<Detail>(`/api/v1/crm/opportunities/${id}`),
    o = state.data?.opportunity,
    bootstrap = props.bootstrap,
    write = bootstrap.permissions.includes("crm.write");
  if (!o) return <Notice error={state.error} loading={state.loading} />;
  const stage = text(o.stage),
    openDeal = !["WON", "LOST", "ON_HOLD"].includes(stage),
    labelOf = (s: string) => choice("stage").find((x) => x.value === s)?.label ?? t(`CRM.${s}`);
  const activeInquiry = (state.data?.links ?? []).find((r) => !["Approved", "Cancelled"].includes(text(r.inquiryStatus)));
  const latestInquiry = activeInquiry ?? state.data?.links[0];
  const canConvert = bootstrap.permissions.includes("crm.convert") && openDeal;
  // One primary button, the step this stage calls for; every other action sits under "More" (CRM-09).
  const actions = {
    convert: !activeInquiry && canConvert ? { id: "convert", label: t(latestInquiry ? "CRM.additionalInquiry" : "CRM.convert"), guide: "crm.convert", onSelect: () => setEditor("convert") } : null,
    proposal: write && openDeal ? { id: "proposal", label: t("CRM.recordProposal"), guide: "crm.recordProposal", onSelect: () => setEditor("proposal") } : null,
    won: write && openDeal ? { id: "won", label: t("CRM.recordWon"), guide: "crm.recordWon", onSelect: () => setEditor("won") } : null,
    inquiry: latestInquiry ? { id: "inquiry", label: t(activeInquiry ? "CRM.openInquiry" : "CRM.latestInquiry"), onSelect: () => props.openInquiry(Number(latestInquiry.inquiryId)) } : null,
    edit: write ? { id: "edit", label: t("CRM.editDeal"), guide: "crm.edit", onSelect: () => setEditor("opportunity") } : null,
    customer: {
      id: "customer",
      label: t("CRM.openCustomer360"),
      onSelect: () => {
        openCustomer(Number(o.customerId));
        onCustomer();
      },
    },
  };
  const order = ["NEW", "QUALIFICATION", "REQUIREMENT"].includes(stage)
    ? ["convert", "inquiry", "proposal"]
    : stage === "ESTIMATING"
      ? o.proposalSentOn
        ? ["won", "inquiry"]
        : ["proposal", "inquiry", "convert"]
      : ["PROPOSAL", "NEGOTIATION"].includes(stage)
        ? ["won", "proposal"]
        : ["inquiry"];
  const primaryKey = order.find((key) => actions[key as keyof typeof actions]);
  const primary = primaryKey ? actions[primaryKey as keyof typeof actions] : null;
  const others = Object.values(actions).filter((item): item is NonNullable<typeof item> => Boolean(item) && item !== primary);
  const nextFollowup = (state.data?.followups ?? []).find((f) => !["Done", "Cancelled"].includes(text(f.status)));
  const followupFields: FieldSpec[] = [
    { key: "action", required: true, wide: true, maxLength: 1000 },
    { key: "ownerId", required: true, searchable: true, placeholder: "CRM.searchPerson", options: teamOptions(bootstrap) },
    { key: "dueDate", required: true, type: "date" },
    { key: "priority", options: ["Low", "Normal", "High", "Urgent"].map((s) => ({ value: s, label: t(s) })) },
    { key: "status", options: ["Open", "WaitingCustomer", "WaitingInternal", "WaitingSupplier", "Done", "Cancelled"].map((s) => ({ value: s, label: t(`CRM.${s}`) })) },
  ];
  const owner = (userId: unknown) => bootstrap.team.find((u) => u.id === Number(userId))?.name;
  const reload = () => {
    setEditor(null);
    state.refresh();
  };
  return (
    <>
      <Notice error={state.error} />
      <Panel
        className="crm-hero"
        title={`${text(o.opportunityNo)} · ${text(o.name)}`}
        actions={
          <Kit>
            <DealActions primary={primary} others={others} moreLabel={t("CRM.moreActions")} />
          </Kit>
        }
      >
        <p className="crm-next-step" data-guide="crm.nextStep">
          <span>{t("CRM.nextStep")}</span> <strong>{primary ? primary.label : openDeal ? t("CRM.nextStepNone") : labelOf(stage)}</strong>
          {nextFollowup ? (
            <>
              {" "}
              · {text(nextFollowup.action)} · {formatDay(nextFollowup.dueDate, lang)}
            </>
          ) : openDeal ? (
            <>
              {" "}
              · <span className="crm-muted">{t("CRM.NoNextAction")}</span>
            </>
          ) : null}
        </p>
        <FactStrip
          items={[
            { label: t("CRM.customerId"), value: `${text(o.customerName)}${o.customerCode ? ` (${text(o.customerCode)})` : ""}` },
            { label: `${t("CRM.salesOwnerId")} / ${t("CRM.technicalOwnerId")}`, value: `${owner(o.salesOwnerId) ?? "—"} / ${owner(o.technicalOwnerId) ?? "—"}` },
            ...(bootstrap.permissions.includes("crm.commercial.read") ? [{ label: t("CRM.expectedValue"), value: o.expectedValue != null ? money(o.expectedValue) : t("CRM.notSpecified") }] : []),
            { label: t("CRM.expectedClose"), value: formatDay(o.expectedClose, lang) || t("CRM.notSpecified") },
          ]}
        />
        <StageRail stage={stage} labelOf={labelOf} />
      </Panel>
      {latestInquiry && bootstrap.permissions.includes("inquiry.read") ? (
        <ProjectHandover
          key={`${id}:${text(o.rowVersion)}`}
          inquiryId={Number(latestInquiry.inquiryId)}
          bootstrap={bootstrap}
          refreshBootstrap={props.refreshBootstrap ?? (async () => {})}
          notify={props.notify ?? (() => {})}
          openProject={props.openProject}
        />
      ) : null}
      {["PROPOSAL", "NEGOTIATION"].includes(stage) && !o.proposalSentOn ? <p className="alert warn">{t("CRM.unverifiedProposal")}</p> : null}
      {stage === "WON" && !o.wonOn ? <p className="alert warn">{t("CRM.unverifiedWon")}</p> : null}
      {o.proposalSentOn || o.wonOn ? (
        <FactStrip
          items={[
            { label: t("CRM.proposalSentOn"), value: formatDay(o.proposalSentOn, lang) },
            { label: t("CRM.proposalReference"), value: text(o.proposalReference) },
            { label: t("CRM.wonOn"), value: formatDay(o.wonOn, lang) },
            { label: t("CRM.wonReference"), value: text(o.wonReference) },
          ]}
        />
      ) : null}
      <div className="tabs" role="tablist">
        {["overview", "contacts", "activities", "links", "documents", "history"].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-guide={`crm.tab.${k}`} className={tab === k ? "tab active" : "tab"} onClick={() => setTab(k)}>
            {t(`CRM.${k}`)}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <>
          <Panel
            guide="crm.followups"
            title={t("CRM.followups")}
            actions={
              write ? (
                <button
                  className="btn primary"
                  onClick={() => {
                    setAction(null);
                    setEditor("action");
                  }}
                >
                  {t("CRM.addAction")}
                </button>
              ) : null
            }
          >
            {!(state.data?.followups ?? []).some((f) => !["Done", "Cancelled"].includes(text(f.status))) ? <p className="alert warn">{t("CRM.NoNextAction")}</p> : null}
            {state.data?.followups.map((f) => (
              <div key={text(f.id)} className="crm-action">
                <div>
                  <strong>{text(f.action)}</strong>
                  <p>
                    {text(f.ownerName)} · {formatDay(f.dueDate, lang)} · <Badge tone={toneFor(text(f.status))}>{t(`CRM.${f.status}`)}</Badge>
                  </p>
                </div>
                {write || Number(f.ownerId) === bootstrap.user.id ? (
                  <button
                    className="btn default"
                    onClick={() => {
                      setAction(f);
                      setEditor("action");
                    }}
                  >
                    {t("Edit")}
                  </button>
                ) : null}
              </div>
            ))}
          </Panel>
          <Panel title={t("CRM.overview")}>
            <dl className="crm-details">
              <div>
                <dt>{t("CRM.endUserCustomerId")}</dt>
                <dd>{text(o.endUserName) || t("CRM.notSpecified")}</dd>
              </div>
              <div>
                <dt>{t("CRM.lastActivity")}</dt>
                <dd>{formatMoment(state.data?.activities[0]?.occurredAt, lang) || t("CRM.noActivitiesYet")}</dd>
              </div>
              {["need", "scope", "internalNote"].map((k) => (
                <div key={k}>
                  <dt>{t(`CRM.${k}`)}</dt>
                  <dd>{text(o[k]) || t("CRM.notSpecified")}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </>
      ) : null}
      {tab === "contacts" ? <ContactList bootstrap={bootstrap} customerId={Number(o.customerId)} /> : null}
      {tab === "activities" ? (
        <>
          <div className="toolbar">
            <span className="spacer" />
            {bootstrap.permissions.includes("crm.activity.write") ? (
              <button className="btn primary" data-guide="crm.addActivity" onClick={() => setEditor("activity")}>
                <Icon name="plus" />
                {t("CRM.addActivity")}
              </button>
            ) : null}
          </div>
          <Timeline
            bootstrap={bootstrap}
            rows={state.data?.activities ?? []}
            empty={{ title: "CRM.noActivitiesDeal", hint: bootstrap.permissions.includes("crm.activity.write") ? "CRM.noActivitiesHint" : "CRM.noActivitiesReadOnly" }}
          />
        </>
      ) : null}
      {tab === "links" ? (
        state.data?.links.length ? (
          <div className="crm-card-grid">
            {state.data.links.map((r, i) => (
              <article className="crm-opportunity-card" key={i}>
                <button type="button" className="crm-link" onClick={() => props.openInquiry(Number(r.inquiryId))}>
                  {text(r.inquiryNo)} · {t(text(r.inquiryStatus) === "Approved" ? "CRM.costApproved" : text(r.inquiryStatus))}
                </button>
                {r.estimateId && bootstrap.permissions.includes("estimate.read") ? (
                  <button type="button" className="crm-link" onClick={() => props.openEstimate(Number(r.estimateId))}>
                    {text(r.estimateNo)} · R{text(r.revision)} · {t(text(r.estimateStatus))}
                    {r.total != null ? ` · ${money(r.total)}` : ""}
                  </button>
                ) : null}
                {r.projectId && bootstrap.permissions.includes("project.read") ? (
                  <button type="button" className="crm-link" onClick={() => props.openProject(Number(r.projectId))}>
                    {text(r.projectNo)} · {t(text(r.projectStatus))}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon="link" title="CRM.noLinks" message={canConvert ? "CRM.noLinksHint" : "CRM.noLinksReadOnly"} />
        )
      ) : null}
      {tab === "documents" ? <CrmDocuments bootstrap={bootstrap} customerId={Number(o.customerId)} opportunityId={id} /> : null}
      {tab === "history" ? (
        <div className="crm-timeline">
          {state.data?.history.map((r) => (
            <article key={text(r.id)}>
              <strong>
                {text(r.action)
                  .split(":")
                  .map((k) => (CRM_COPY[`CRM.${k}`] ? t(`CRM.${k}`) : k))
                  .join(" · ")}
              </strong>
              <p>
                {text(r.actorName)} · {formatMoment(r.occurredAt, lang)}
              </p>
              <HistoryChanges before={r.beforeJson} after={r.afterJson} />
              {r.afterJson ? (
                <details>
                  <summary>{t("CRM.technicalDetails")}</summary>
                  <pre>
                    {text(r.beforeJson)}
                    {"\n"}
                    {text(r.afterJson)}
                  </pre>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      {editor === "opportunity" ? <OpportunityEditor bootstrap={bootstrap} options={options} initial={o} onClose={() => setEditor(null)} onSaved={state.refresh} onReload={state.refresh} /> : null}
      {editor === "action" ? (
        <Kit>
          <CrmFormDialog
            title={action ? "CRM.editAction" : "CRM.addAction"}
            description={text(o.name)}
            initial={action ?? { ownerId: bootstrap.user.id, priority: "Normal", status: "Open" }}
            fields={followupFields}
            onClose={() => setEditor(null)}
            onReload={reload}
            onSave={async (v) => {
              await crmRequest(`/api/v1/crm/opportunities/${id}/followups${action ? `/${action.id}` : ""}`, action ? "PUT" : "POST", v);
              state.refresh();
            }}
          />
        </Kit>
      ) : null}
      {editor === "activity" ? <ActivityEditor bootstrap={bootstrap} customerId={Number(o.customerId)} opportunityId={id} onClose={() => setEditor(null)} onSaved={state.refresh} /> : null}
      {editor === "proposal" || editor === "won" ? (
        <Kit>
          <CrmFormDialog
            title={editor === "proposal" ? "CRM.recordProposal" : "CRM.recordWon"}
            description={`${text(o.opportunityNo)} · ${text(o.name)}`}
            initial={{ ...o, stage: editor === "won" ? "WON" : stage === "NEGOTIATION" ? "NEGOTIATION" : "PROPOSAL" }}
            intro={{ lines: ["CRM.evidenceHint"] }}
            guide="crm.evidence"
            fields={(v) => evidenceFieldsFor(v)}
            onClose={() => setEditor(null)}
            onReload={reload}
            onSave={async (v) => {
              await crmRequest(`/api/v1/crm/opportunities/${id}`, "PUT", v);
              state.refresh();
            }}
          />
        </Kit>
      ) : null}
      {editor === "convert" ? (
        <Kit>
          <CrmFormDialog
            title="CRM.convert"
            description={`${text(o.opportunityNo)} · ${text(o.name)}`}
            submitLabel="CRM.convertSubmit"
            initial={{ estimateOwnerId: o.technicalOwnerId ?? bootstrap.user.id, projectType: "IoT", dueDate: futureDate(14) }}
            intro={{ guide: "crm.convert.carry", title: t("CRM.pendingOpportunity"), lines: ["CRM.convertHint", "CRM.autoFilledHint", "CRM.filesInherited"] }}
            fields={[
              { key: "estimateOwnerId", required: true, searchable: true, placeholder: "CRM.searchPerson", options: teamOptions(bootstrap), guide: "crm.convert.owner" },
              { key: "dueDate", required: true, type: "date", guide: "crm.convert.due" },
              {
                key: "projectType",
                required: true,
                guide: "crm.convert.type",
                options: ["IoT", "Automation", "Robot", "Software", "Electrical", "Machine", "IoT / Automation"].map((s) => ({ value: s, label: s })),
              },
            ]}
            onClose={() => setEditor(null)}
            onReload={reload}
            onSave={async (v) => {
              const result = await crmRequest<{ id: number; number: string; notification: AssignmentNotificationResult }>("/api/v1/inquiries", "POST", {
                ...v,
                opportunityId: id,
                opportunityRowVersion: o.rowVersion,
              });
              props.notify?.(`${result.number} created${assignmentDeliveryNote(result.notification)}`);
              state.refresh();
              props.openInquiry(result.id);
            }}
          />
        </Kit>
      ) : null}
    </>
  );
}
/** The proposal and order evidence fields (same rule as CrmForms evidenceFields: asked when the stage needs them). */
function evidenceFieldsFor(value: CrmRecord): FieldSpec[] {
  const fields: FieldSpec[] = [];
  if (["PROPOSAL", "NEGOTIATION"].includes(text(value.stage)) || value.proposalSentOn)
    fields.push({ key: "proposalSentOn", type: "date", required: true }, { key: "proposalReference", required: true });
  if (value.stage === "WON" || value.wonOn) fields.push({ key: "wonOn", type: "date", required: true }, { key: "wonReference", required: true });
  return fields;
}

/* One activity: when, what, who, and (on the activity list) which customer and deal it belongs to, each a link (CRM-13). */
function Timeline({
  rows,
  bootstrap,
  empty,
  openOpportunity,
  openCustomer,
}: {
  rows: CrmRecord[];
  bootstrap: BootstrapData;
  empty: Empty;
  openOpportunity?: (id: number) => void;
  openCustomer?: (id: number) => void;
}) {
  const { lang } = useLanguage(),
    t = useT(),
    [documentActivity, setDocumentActivity] = useState<CrmRecord | null>(null);
  return (
    <>
      <div className="crm-timeline">
        {!rows.length ? (
          <EmptyState icon="calendar" title={empty.title} message={empty.hint} action={empty.action} />
        ) : (
          rows.map((r) => (
            <article key={text(r.id)}>
              <small>
                {formatMoment(r.occurredAt, lang)} · <Badge tone="blue">{t(`CRM.${r.activityType}`)}</Badge> · {text(r.ownerName)}
              </small>
              {openCustomer || openOpportunity ? (
                <p className="crm-activity-context">
                  {openCustomer ? (
                    <button type="button" className="crm-link" onClick={() => openCustomer(Number(r.customerId))}>
                      {text(r.customerName)}
                      {r.customerCode ? ` (${text(r.customerCode)})` : ""}
                    </button>
                  ) : null}
                  {r.opportunityId && openOpportunity ? (
                    <>
                      {" "}
                      ·{" "}
                      <button type="button" className="crm-link" onClick={() => openOpportunity(Number(r.opportunityId))}>
                        {text(r.opportunityNo) || t("CRM.sourceOpportunity")} · {text(r.opportunityName)}
                      </button>
                    </>
                  ) : null}
                </p>
              ) : null}
              <h3>{text(r.summary)}</h3>
              {r.decision ? <p>{text(r.decision)}</p> : null}
              {r.actionItems ? <p>{text(r.actionItems)}</p> : null}
              {r.participants ? (
                <small>
                  {t("CRM.participants")}: {text(r.participants)}
                </small>
              ) : null}
              {r.nextAction ? (
                <p>
                  {t("CRM.action")}: {text(r.nextAction)} · {text(r.nextOwnerName)} · {formatDay(r.nextDue, lang)}
                </p>
              ) : null}
              <button type="button" className="btn default sm" onClick={() => setDocumentActivity(r)}>
                <Icon name="file" />
                {t("CRM.documents")}
              </button>
            </article>
          ))
        )}
      </div>
      {documentActivity ? (
        <Modal title={t("CRM.documents")} subtitle={text(documentActivity.summary)} size="xl" onClose={() => setDocumentActivity(null)}>
          <div className="crm-editor">
            <CrmDocuments
              bootstrap={bootstrap}
              customerId={Number(documentActivity.customerId)}
              opportunityId={documentActivity.opportunityId ? Number(documentActivity.opportunityId) : undefined}
              activityId={Number(documentActivity.id)}
            />
          </div>
        </Modal>
      ) : null}
    </>
  );
}
/** The activity form (tomas-ui/CrmForms.tsx ActivityDialog); this side keeps the API call. */
function ActivityEditor({
  bootstrap,
  customerId,
  opportunityId,
  onClose,
  onSaved,
}: {
  bootstrap: BootstrapData;
  customerId?: number;
  opportunityId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Kit>
      <ActivityDialog
        bootstrap={bootstrap}
        customerId={customerId}
        opportunityId={opportunityId}
        onClose={onClose}
        onSave={async (v) => {
          const next = text(v.action).trim() ? { action: v.action, ownerId: v.nextOwnerId, dueDate: v.dueDate } : undefined;
          await crmRequest("/api/v1/crm/activities", "POST", { ...v, occurredAt: new Date(text(v.occurredAt)).toISOString(), nextAction: next });
          onSaved();
        }}
      />
    </Kit>
  );
}
/* The activity timeline, searched and filtered on the server (CRM-03): words in the summary, the customer or the deal,
   the customer, the owner, the type and a date range, every page reachable. The type counts read the same filters
   (but the type), and each count is the filter it names (CRM-07). */
function ActivityList({
  bootstrap,
  customerId,
  year,
  openOpportunity,
  openCustomer,
}: {
  bootstrap: BootstrapData;
  customerId?: number;
  year?: string;
  openOpportunity?: (id: number) => void;
  openCustomer?: (id: number) => void;
}) {
  const t = useT(),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(30),
    [add, setAdd] = useState(false);
  const [search, setSearch] = useState(""),
    [customer, setCustomer] = useState(""),
    [owner, setOwner] = useState(""),
    [type, setType] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const state = useCrmData<CrmPage & { types?: Record<string, number>; allTypes?: number }>(
    `/api/v1/crm/activities?${params({ page: String(page), pageSize: String(pageSize), customerId: customerId ? String(customerId) : customer, ownerId: owner, activityType: type, search, from, to, year: year ?? "" })}`,
  );
  const shown = state.shown,
    rows = shown?.items ?? [],
    writable = bootstrap.permissions.includes("crm.activity.write");
  const filtered = Boolean(search || customer || owner || type || from || to);
  const clear = () => {
    setSearch("");
    setCustomer("");
    setOwner("");
    setType("");
    setFrom("");
    setTo("");
    setPage(1);
  };
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const empty: Empty = filtered
    ? {
        title: "CRM.empty",
        hint: "CRM.emptyHint",
        action: (
          <button type="button" className="btn default" onClick={clear}>
            {t("CRM.clearFilters")}
          </button>
        ),
      }
    : {
        title: customerId ? "CRM.noActivitiesCustomer" : "CRM.noActivities",
        hint: writable ? "CRM.noActivitiesHint" : "CRM.noActivitiesReadOnly",
        action: writable ? (
          <button type="button" className="btn primary" onClick={() => setAdd(true)}>
            <Icon name="plus" />
            {t("CRM.addActivity")}
          </button>
        ) : undefined,
      };
  return (
    <>
      <Notice error={state.error} loading={state.loading} />
      <div className="crm-type-chips" data-guide="crm.activity.types">
        <FilterChips
          label="CRM.activityType"
          items={activityTypes
            .filter((key) => Number(shown?.types?.[key] ?? 0) > 0 || type === key)
            .map((key) => ({ key, label: `CRM.${key}`, value: Number(shown?.types?.[key] ?? 0), tone: "blue" as Tone }))}
          active={type || null}
          onPick={(key) => reset(setType)(key ?? "")}
        />
        <span className="crm-muted">{t("CRM.activitiesInScope").replace("{n}", String(shown?.allTypes ?? shown?.total ?? 0))}</span>
      </div>
      <div className="toolbar crm-filters" data-guide="crm.activity.filters">
        <SearchInput link="q" value={search} onChange={reset(setSearch)} placeholder="CRM.searchActivities" />
        {customerId ? null : <FilterPicker label="CRM.customerId" allLabel="CRM.allCustomers" value={customer} onChange={reset(setCustomer)} options={customerOptions(bootstrap)} />}
        <FilterPicker label="CRM.ownerId" allLabel="CRM.allOwners" value={owner} onChange={reset(setOwner)} options={teamOptions(bootstrap)} />
        <FilterSelect
          label="CRM.activityType"
          value={type}
          onChange={reset(setType)}
          options={[{ value: "", label: t("CRM.allTypes") }, ...activityTypes.map((s) => ({ value: s, label: t(`CRM.${s}`) }))]}
        />
        <label className="crm-date-filter">
          <span>{t("CRM.from")}</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} />
        </label>
        <label className="crm-date-filter">
          <span>{t("CRM.to")}</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} />
        </label>
        {filtered ? (
          <button type="button" className="btn default sm" onClick={clear}>
            {t("CRM.clearFilters")}
          </button>
        ) : null}
        <span className="spacer" />
        {writable ? (
          <button className="btn primary" data-guide="crm.addActivity" onClick={() => setAdd(true)}>
            <Icon name="plus" />
            {t("CRM.addActivity")}
          </button>
        ) : null}
      </div>
      <Panel flush title={`${shown?.total ?? 0} ${t("CRM.activities")}`} subtitle={filtered ? "CRM.filteredResults" : undefined}>
        <div className={state.loading && rows.length ? "crm-refreshing" : undefined} aria-busy={state.loading || undefined}>
          {state.loading && !rows.length ? null : <Timeline bootstrap={bootstrap} rows={rows} empty={empty} openOpportunity={openOpportunity} openCustomer={customerId ? undefined : openCustomer} />}
        </div>
        {shown && rows.length ? (
          <>
            <TablePageSize
              value={pageSize}
              onChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
            <PageBar page={shown} onPage={setPage} />
          </>
        ) : null}
      </Panel>
      {add ? <ActivityEditor bootstrap={bootstrap} customerId={customerId} onClose={() => setAdd(false)} onSaved={state.refresh} /> : null}
    </>
  );
}

function CustomerList({ bootstrap, open, refreshBootstrap }: { bootstrap: BootstrapData; refreshBootstrap?: () => Promise<void>; open: (id: number) => void }) {
  const t = useT(),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [add, setAdd] = useState(false),
    [edit, setEdit] = useState<CrmRecord | null>(null),
    [remove, setRemove] = useState<CrmRecord | null>(null),
    state = useCrmData<CrmPage>(`/api/v1/crm/customers?${params({ search, page: String(page), pageSize: String(pageSize) })}`),
    writable = bootstrap.permissions.includes("crm.contact.write");
  const shown = state.shown,
    rows = shown?.items ?? [];
  const empty: Empty = search
    ? {
        title: "CRM.empty",
        hint: "CRM.emptyHintSearch",
        action: (
          <button type="button" className="btn default" onClick={() => setSearch("")}>
            {t("CRM.clearFilters")}
          </button>
        ),
      }
    : { title: "CRM.noCustomers", hint: "CRM.noCustomersHint" };
  return (
    <>
      {remove ? (
        <Kit>
          <RemoveDialog
            title="CRM.removeCustomer"
            name={text(remove.name)}
            hint="CRM.removeCustomerHint"
            onClose={() => setRemove(null)}
            onRemove={async () => {
              await apiRequest(`/api/v1/crm/customers/${remove.id}?${new URLSearchParams({ rowVersion: text(remove.rowVersion) })}`, { method: "DELETE" });
              setPage((p) => (rows.length === 1 ? Math.max(1, p - 1) : p));
              state.refresh();
              await refreshBootstrap?.();
            }}
          />
        </Kit>
      ) : null}
      <ErpMasterPanel
        kind="customers"
        onChanged={async () => {
          state.refresh();
          await refreshBootstrap?.();
        }}
      />
      <Notice error={state.error} loading={state.loading} />
      <div className="toolbar crm-filters">
        <SearchInput
          link="q"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="CRM.searchCustomers"
        />
        <span className="spacer" />
        {writable ? (
          <button className="btn primary" onClick={() => setAdd(true)}>
            <Icon name="plus" />
            {t("CRM.newCustomer")}
          </button>
        ) : null}
      </div>
      <Panel flush guide="crm.customer-list" title={`${shown?.total ?? 0} ${t("CRM Customers")}`}>
        <Records
          rows={rows}
          loading={state.loading}
          empty={empty}
          columns={["code", "name", "erpCustomerCode", "industry", "site", "accountOwnerName"]}
          onOpen={(r) => open(Number(r.id))}
          onEdit={writable ? setEdit : undefined}
          onRemove={writable ? setRemove : undefined}
          page={shown}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Panel>
      {add ? (
        <CustomerModal
          customer={null}
          onClose={() => setAdd(false)}
          onSaved={async () => {
            setAdd(false);
            await refreshBootstrap?.();
            state.refresh();
          }}
        />
      ) : null}
      {edit ? (
        <Kit>
          <CrmFormDialog
            title="CRM.editCustomer"
            description={`${text(edit.code)} · ${text(edit.name)}`}
            size="lg"
            initial={{ ...edit, nameEn: edit.nameEn || (!edit.nameTh && !edit.nameJa ? edit.name : "") }}
            intro={erpIntro(edit)}
            fields={customerFields(edit, { key: "accountOwnerId", searchable: true, placeholder: "CRM.searchPerson", options: teamOptions(bootstrap) })}
            onClose={() => setEdit(null)}
            onReload={() => {
              setEdit(null);
              state.refresh();
            }}
            onSave={async (v) => {
              await crmRequest(`/api/v1/crm/customers/${edit.id}`, "PUT", v);
              await refreshBootstrap?.();
              state.refresh();
            }}
          />
        </Kit>
      ) : null}
    </>
  );
}
function CustomerWorkspace({ id, openOpportunity, ...props }: Props & { id: number; openOpportunity: (id: number) => void }) {
  const t = useT(),
    [tab, setTab] = useState("overview"),
    [year, setYear] = useState(""),
    [oppPage, setOppPage] = useState(1),
    [oppSize, setOppSize] = useState(10),
    [editor, setEditor] = useState<string | null>(null),
    [siteEdit, setSiteEdit] = useState<CrmRecord | null>(null);
  const state = useCrmData<CustomerDetail>(`/api/v1/crm/customers/${id}${year ? `?year=${year}` : ""}`);
  // Every deal of the customer, a page at a time (CRM-05), and the open ones with a next action, soonest first.
  const opps = useCrmData<CrmPage>(`/api/v1/crm/opportunities?${params({ customerId: String(id), page: String(oppPage), pageSize: String(oppSize), year })}`);
  const followups = useCrmData<CrmPage>(`/api/v1/crm/opportunities?${params({ customerId: String(id), open: "true", sort: "due", pageSize: "20", year })}`);
  const activities = useCrmData<CrmPage>(`/api/v1/crm/activities?${params({ customerId: String(id), pageSize: "1", year })}`),
    customer = state.data?.customer;
  if (!customer) return <Notice error={state.error} loading={state.loading} />;
  const writable = props.bootstrap.permissions.includes("crm.contact.write");
  const latest = activities.data?.items?.[0];
  return (
    <>
      <Panel
        title={text(customer.name)}
        actions={
          writable ? (
            <button className="btn primary" onClick={() => setEditor("customer")}>
              {t("Edit")}
            </button>
          ) : null
        }
      >
        <div className="crm-customer-identity">
          <span>{text(customer.name).slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>
              {text(customer.code)}
              {customer.erpCustomerCode ? ` · ERP ${text(customer.erpCustomerCode)}` : ""}
            </strong>
            <p>
              {text(customer.accountOwnerName) || t("CRM.noAccountOwner")} · {text(customer.site) || "—"}
            </p>
          </div>
          <label>
            {t("CRM.year")}{" "}
            <input
              type="number"
              min="2000"
              max="2200"
              value={year}
              placeholder={t("CRM.allYears")}
              onChange={(e) => {
                setYear(e.target.value);
                setOppPage(1);
              }}
            />
          </label>
        </div>
        {year ? <p className="crm-muted">{t("CRM.yearScope").replace("{year}", year)}</p> : null}
      </Panel>
      <Notice error={state.error || opps.error} />
      <div className="tabs" role="tablist">
        {["overview", "contacts", "activities", "opportunities", "inquiries", "estimates", "projects", "service", "documents"].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-tab={k} className={tab === k ? "tab active" : "tab"} onClick={() => setTab(k)}>
            {t(`CRM.${k}`)}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <>
          <MetricStrip
            items={["opportunities", "inquiries", "estimates", "projects"].map((k, index) => ({
              label: t(`CRM.${k}`),
              value: k === "opportunities" ? (opps.data?.total ?? 0) : (state.data?.[k as "inquiries" | "estimates" | "projects"].length ?? 0),
              tone: ["blue", "violet", "amber", "green"][index],
              icon: (["folder", "inbox", "file", "layers"] as IconName[])[index],
              onClick: () => setTab(k),
            }))}
          />
          <Panel title={t("CRM.lastActivity")}>
            {latest ? (
              <p>
                {text(latest.summary)} · <LatestMoment value={latest.occurredAt} />
              </p>
            ) : (
              <p className="crm-muted">{t("CRM.noActivitiesYet")}</p>
            )}
          </Panel>
          <Panel title={t("CRM.followups")} subtitle={followups.data && followups.data.total > followups.data.items.length ? "CRM.followupsFirst" : undefined}>
            <LocalRecords
              rows={(followups.data?.items ?? []).filter((o) => o.nextAction)}
              columns={["name", "nextAction", "nextDue"]}
              onOpen={(r) => openOpportunity(Number(r.id))}
              empty={{ title: "CRM.noFollowups", hint: "CRM.noFollowupsHint" }}
            />
          </Panel>
          <Panel
            title={t("CRM.sites")}
            actions={
              writable ? (
                <button
                  className="btn default"
                  onClick={() => {
                    setSiteEdit(null);
                    setEditor("site");
                  }}
                >
                  {t("CRM.newSite")}
                </button>
              ) : null
            }
          >
            <LocalRecords
              rows={state.data?.sites ?? []}
              columns={["name", "address", "province", "country"]}
              onOpen={
                writable
                  ? (r) => {
                      setSiteEdit(r);
                      setEditor("site");
                    }
                  : undefined
              }
              empty={{ title: "CRM.noSites", hint: "CRM.noSitesHint" }}
            />
          </Panel>
        </>
      ) : null}
      {tab === "contacts" ? <ContactList bootstrap={props.bootstrap} customerId={id} /> : null}
      {tab === "activities" ? <ActivityList bootstrap={props.bootstrap} customerId={id} year={year} openOpportunity={openOpportunity} /> : null}
      {tab === "opportunities" ? (
        <Records
          rows={opps.shown?.items ?? []}
          loading={opps.loading}
          columns={["name", "opportunityNo", "stage", "nextAction"]}
          onOpen={(r) => openOpportunity(Number(r.id))}
          page={opps.shown}
          onPage={setOppPage}
          onPageSize={(size) => {
            setOppSize(size);
            setOppPage(1);
          }}
          empty={{ title: "CRM.noDealsCustomer", hint: "CRM.noDealsHint" }}
        />
      ) : null}
      {tab === "inquiries" ? (
        <LocalRecords
          rows={state.data?.inquiries ?? []}
          columns={["inquiryNo", "projectName", "status", "dueDate"]}
          onOpen={(r) => props.openInquiry(Number(r.id))}
          empty={{ title: "CRM.noRecords", hint: "CRM.noRecordsHint" }}
        />
      ) : null}
      {tab === "estimates" ? (
        <LocalRecords
          rows={state.data?.estimates ?? []}
          columns={["estimateNo", "revision", "status", "total"]}
          onOpen={(r) => props.openEstimate(Number(r.id))}
          empty={{ title: "CRM.noRecords", hint: "CRM.noRecordsHint" }}
        />
      ) : null}
      {tab === "projects" ? (
        <LocalRecords
          rows={state.data?.projects ?? []}
          columns={["projectNo", "name", "status", "targetDelivery"]}
          onOpen={(r) => props.openProject(Number(r.id))}
          empty={{ title: "CRM.noRecords", hint: "CRM.noRecordsHint" }}
        />
      ) : null}
      {tab === "service" ? (
        <>
          <p>{t("CRM.serviceHistory")}</p>
          <LocalRecords
            rows={state.data?.service ?? []}
            columns={["reportNo", "title", "revision", "status", "reportDate"]}
            onOpen={(r) => (r.projectId ? props.openProject(Number(r.projectId)) : props.openInquiry(Number(r.inquiryId)))}
            empty={{ title: "CRM.noRecords", hint: "CRM.noRecordsHint" }}
          />
        </>
      ) : null}
      {tab === "documents" ? <CrmDocuments bootstrap={props.bootstrap} customerId={id} year={year} /> : null}
      {editor === "customer" ? (
        <Kit>
          <CrmFormDialog
            title="CRM.editCustomer"
            description={`${text(customer.code)} · ${text(customer.name)}`}
            size="lg"
            initial={{ ...customer, nameEn: customer.nameEn || (!customer.nameTh && !customer.nameJa ? customer.name : "") }}
            intro={erpIntro(customer)}
            fields={customerFields(customer, { key: "accountOwnerId", searchable: true, placeholder: "CRM.searchPerson", options: teamOptions(props.bootstrap) })}
            onClose={() => setEditor(null)}
            onReload={() => {
              setEditor(null);
              state.refresh();
            }}
            onSave={async (v) => {
              await crmRequest(`/api/v1/crm/customers/${id}`, "PUT", v);
              await props.refreshBootstrap?.();
              state.refresh();
            }}
          />
        </Kit>
      ) : null}
      {editor === "site" ? (
        <Kit>
          <CrmFormDialog
            title={siteEdit ? "CRM.editSite" : "CRM.newSite"}
            description={text(customer.name)}
            initial={siteEdit ?? { country: customer.country }}
            fields={[
              { key: "code", required: true, maxLength: 40 },
              { key: "name", label: "CRM.siteName", required: true },
              { key: "address", wide: true },
              { key: "province" },
              { key: "country" },
              { key: "accessNote", type: "textarea", wide: true },
            ]}
            onClose={() => setEditor(null)}
            onReload={() => {
              setEditor(null);
              state.refresh();
            }}
            onSave={async (v) => {
              await crmRequest(`/api/v1/crm/customers/${id}/sites${siteEdit ? `/${siteEdit.id}` : ""}`, siteEdit ? "PUT" : "POST", v);
              state.refresh();
            }}
          />
        </Kit>
      ) : null}
    </>
  );
}
function LatestMoment({ value }: { value: unknown }) {
  const { lang } = useLanguage();
  return <>{formatMoment(value, lang)}</>;
}

function ContactList({ bootstrap, customerId }: { bootstrap: BootstrapData; customerId?: number }) {
  const t = useT(),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [edit, setEdit] = useState<CrmRecord | null>(null),
    [remove, setRemove] = useState<CrmRecord | null>(null);
  const state = useCrmData<CrmPage>(`/api/v1/crm/contacts?${params({ search, page: String(page), pageSize: String(pageSize), customerId: customerId ? String(customerId) : "" })}`),
    writable = bootstrap.permissions.includes("crm.contact.write");
  const shown = state.shown,
    rows = shown?.items ?? [];
  const empty: Empty = search
    ? {
        title: "CRM.empty",
        hint: "CRM.emptyHintSearch",
        action: (
          <button type="button" className="btn default" onClick={() => setSearch("")}>
            {t("CRM.clearFilters")}
          </button>
        ),
      }
    : {
        title: "CRM.noContacts",
        hint: writable ? "CRM.noContactsHint" : "CRM.noRecordsHint",
        action: writable ? (
          <button type="button" className="btn primary" onClick={() => setEdit({ customerId: customerId ?? "" })}>
            <Icon name="plus" />
            {t("CRM.newContact")}
          </button>
        ) : undefined,
      };
  return (
    <>
      {remove ? (
        <Kit>
          <RemoveDialog
            title="CRM.removeContact"
            name={text(remove.name)}
            hint="CRM.removeContactHint"
            blocked={remove.isPrimary === true ? "CRM.primary_contact_protected" : undefined}
            onClose={() => setRemove(null)}
            onRemove={async () => {
              await apiRequest(`/api/v1/sales/customers/${remove.customerId}/contacts/${remove.id}?${new URLSearchParams({ rowVersion: text(remove.rowVersion) })}`, { method: "DELETE" });
              setPage((p) => (rows.length === 1 ? Math.max(1, p - 1) : p));
              state.refresh();
            }}
          />
        </Kit>
      ) : null}
      <div className="toolbar crm-filters">
        <SearchInput
          link="q"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="CRM.searchContacts"
        />
        <span className="spacer" />
        {writable ? (
          <button className="btn primary" onClick={() => setEdit({ customerId: customerId ?? "" })}>
            <Icon name="plus" />
            {t("CRM.newContact")}
          </button>
        ) : null}
      </div>
      <Notice error={state.error} loading={state.loading} />
      <Panel flush title={`${shown?.total ?? 0} ${t("CRM Contacts")}`}>
        <Records
          rows={rows}
          loading={state.loading}
          empty={empty}
          columns={["name", "customerName", "position", "department", "email", "phone", "contactRole"]}
          onOpen={writable ? setEdit : undefined}
          onRemove={writable ? setRemove : undefined}
          page={shown}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Panel>
      {edit ? (
        <Kit>
          <ContactDialog
            bootstrap={bootstrap}
            initial={{ ...edit, nameEn: edit.nameEn || (!edit.nameTh && !edit.nameJa ? edit.name : "") }}
            onClose={() => setEdit(null)}
            onReload={() => {
              setEdit(null);
              state.refresh();
            }}
            onSave={async (v) => {
              await crmRequest(`/api/v1/sales/customers/${v.customerId}/contacts${edit.id ? `/${edit.id}` : ""}`, edit.id ? "PUT" : "POST", { ...v, siteId: v.siteId || undefined });
              state.refresh();
            }}
          />
        </Kit>
      ) : null}
    </>
  );
}

function CrmDocuments({ bootstrap, customerId, opportunityId, activityId, year }: { bootstrap: BootstrapData; customerId: number; opportunityId?: number; activityId?: number; year?: string }) {
  const t = useT(),
    state = useCrmData<CrmRecord[]>(
      `/api/v1/crm/documents?${params({ customerId: String(customerId), opportunityId: opportunityId ? String(opportunityId) : "", activityId: activityId ? String(activityId) : "", year: year ?? "" })}`,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const download = async (r: CrmRecord) => {
    setError("");
    try {
      const blob = await downloadCrmDocument(Number(r.id)),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = text(r.name);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("CRM.downloadFailed");
    }
  };
  const writable = bootstrap.permissions.includes("crm.activity.write");
  return (
    <Panel
      title={t("CRM.documents")}
      actions={
        writable ? (
          <label className="btn default crm-upload" aria-disabled={busy || undefined}>
            <Icon name="upload" />
            {t(busy ? "CRM.uploading" : "CRM.upload")}
            <input
              type="file"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError("");
                void uploadCrmDocument(file, customerId, opportunityId, activityId)
                  .then(state.refresh)
                  .catch((failure: unknown) => setError(crmFailure(failure).key === "CRM.error" ? "CRM.uploadFailed" : crmFailure(failure).key))
                  .finally(() => setBusy(false));
                e.target.value = "";
              }}
            />
          </label>
        ) : null
      }
    >
      {error ? (
        <div role="alert" className="alert danger">
          {t(error)}
        </div>
      ) : null}
      <Notice error={state.error} loading={state.loading} />
      {state.loading && !state.shown ? null : (
        <LocalRecords
          rows={state.shown ?? []}
          columns={["name", "uploadedByName", "uploadedAt", "sizeBytes"]}
          onOpen={(r) => void download(r)}
          empty={{ title: "CRM.noDocuments", hint: writable ? "CRM.noDocumentsHint" : "CRM.noRecordsHint" }}
        />
      )}
    </Panel>
  );
}

export function CrmMyWork({ openOpportunity }: { openOpportunity?: (id: number) => void }) {
  const t = useT(),
    { lang } = useLanguage(),
    state = useCrmData<{ actions: CrmRecord[]; attention: CrmRecord[] }>("/api/v1/crm/my-work"),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <Panel title={t("CRM.followups")}>
      <Notice error={state.error || error} loading={state.loading} />
      {state.data && !state.data.actions.length && !state.data.attention.length ? <EmptyState icon="checkCircle" title="CRM.noFollowups" message="CRM.myWorkClear" /> : null}
      {state.data?.actions.map((r) => (
        <div className="crm-action" key={text(r.id)}>
          <div>
            <button className="crm-link" onClick={() => openOpportunity?.(Number(r.opportunityId))}>
              {text(r.action)}
            </button>
            <p>
              {text(r.opportunityName)} · {formatDay(r.dueDate, lang)} · {t(`CRM.${r.status}`)}
            </p>
          </div>
          <button
            className="btn default"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(false);
              void crmRequest(`/api/v1/crm/opportunities/${r.opportunityId}/followups/${r.id}`, "PUT", { rowVersion: r.rowVersion, status: "Done" })
                .then(state.refresh)
                .catch(() => setError(true))
                .finally(() => setBusy(false));
            }}
          >
            {t("CRM.Done")}
          </button>
        </div>
      ))}
      {state.data?.attention.map((r) => (
        <div className="crm-action" key={`attention-${r.id}`}>
          <button className="crm-link" onClick={() => openOpportunity?.(Number(r.id))}>
            {text(r.name)}
          </button>
          <span>{(r.attention as string[]).map((a) => t(`CRM.${a}`)).join(" · ")}</span>
        </div>
      ))}
    </Panel>
  );
}
