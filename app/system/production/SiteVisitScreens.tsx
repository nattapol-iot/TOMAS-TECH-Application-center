"use client";
import { useT as useStaticCopy } from "../i18n";

/* ==========================================================================
   Sales Intake & Engineer Site Visit — production screens.

   Everything here talks to the API. The rule tables in lib/site-visit-rules.ts
   decide which buttons appear; the API decides whether the action happens. A
   button this file fails to hide is refused server-side, so the worst outcome
   of a UI mistake is a clear error, never an unauthorised write.
   ========================================================================== */

import { LocalizedText } from "../LocalizedText";
import { currentLocale, useT as useUiText } from "../i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  acknowledgeVisitReport,
  assignVisitEngineer,
  changeIntakeStatus,
  changeVisitStatus,
  checkInSiteVisit,
  checkOutSiteVisit,
  closeSiteVisit,
  createEstimateFromVisit,
  createInquiryFromVisit,
  createSalesIntake,
  createSiteVisit,
  deleteEngineerAvailability,
  deleteEngineerSkill,
  deleteIntakeAttachment,
  downloadIntakeAttachment,
  downloadVisitAttachment,
  listSalesIntakes,
  listInquiries,
  listSiteVisits,
  loadEngineerCandidates,
  loadEngineeringVisitDashboard,
  loadManagementVisitDashboard,
  loadMyAssignments,
  loadPreVisitBrief,
  loadSalesIntake,
  loadSalesVisitDashboard,
  loadSiteVisit,
  loadTechnicalReviewQueue,
  loadVisitCalendar,
  loadVisitMasterData,
  rescheduleSiteVisit,
  respondToAssignment,
  reviewVisitReport,
  recordVisitConfirmation,
  saveChecklistTemplate,
  saveEngineerAvailability,
  saveEngineerSkill,
  saveSalesIntake,
  saveSlaPolicy,
  saveVisitActionItem,
  saveVisitChecklist,
  saveVisitFinding,
  saveVisitReport,
  saveVisitSkill,
  saveVisitType,
  submitTechnicalReview,
  submitVisitReport,
  uploadIntakeAttachment,
  uploadVisitAttachment,
  withdrawAssignment,
  type BootstrapData,
  type InquiryDetail,
  type InquirySummary,
  type CalendarResult,
  type EngineerCandidateRecord,
  type EngineeringVisitDashboard,
  type ManagementVisitDashboard,
  type MyAssignmentRecord,
  type PagedResult,
  type PreVisitBriefRecord,
  type SalesIntakeDetail,
  type SalesIntakeSummary,
  type SalesVisitDashboard,
  type SaveChecklistResponseInput,
  type SaveSalesIntakeInput,
  type SiteVisitDetail,
  type SiteVisitSummary,
  type VisitMasterData,
} from "../api-client";
import {
  Badge,
  Drawer,
  EmptyState,
  Field,
  GridControls,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  Person,
  Pill,
  Progress,
  Select,
  StatusLegend,
  SummaryTile,
  Tabs,
  Toolbar,
  toneOf,
  type Tone,
} from "../ui";
import { useT } from "../i18n";
import { seedVisitRequest, visitNextAction } from "../../../lib/inquiry-visit-flow";
import { canRecordSurvey, surveyAnswerComplete, reportEvidence, fillReportEvidence } from "../../../lib/site-visit-workspace";
import "./site-visit-workspace.css";

type Props = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap?: () => Promise<void>;
  inquiry?: InquiryDetail;
  openInquiry?: (id: number) => void;
  startInquiry?: () => void;
};

/* --------------------------------------------------------------------------
   Small shared helpers. Formatting matches the Inquiry screens so a date
   reads the same way wherever it appears.
   -------------------------------------------------------------------------- */

const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";
const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(new Date(value.length <= 10 ? `${value}T00:00:00` : value)) : "—";
const formatDateTime = (value?: string | null) =>
  value ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const formatTime = (value?: string | null) =>
  value ? new Intl.DateTimeFormat(currentLocale(), { timeStyle: "short" }).format(new Date(value)) : "—";
const formatFileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
const businessDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const today = () => businessDate(new Date());
const futureDate = (days: number) => businessDate(new Date(Date.now() + days * 86_400_000));
/** `datetime-local` needs local wall-clock text, not an ISO instant. */
const toLocalInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fromLocalInput = (value: string) => value ? new Date(value).toISOString() : "";
const priorityTone = (priority: string): Tone =>
  priority === "Urgent" ? "red" : priority === "High" ? "amber" : priority === "Normal" ? "blue" : "slate";
const readinessTone = (score: number, blockers: number): Tone =>
  blockers > 0 ? "red" : score >= 90 ? "green" : score >= 70 ? "blue" : "amber";
const slaTone = (state: string): Tone =>
  state === "overdue" || state === "missed" ? "red" : state === "due_soon" ? "amber"
    : state === "met" ? "green" : state === "on_track" ? "blue" : "slate";
const slaLabel = (state: string) => ({
  not_applicable: "—", on_track: "On track", due_soon: "Due soon", overdue: "Overdue", met: "Met", missed: "Missed",
}[state] ?? state);
const matchTone = (percent: number): Tone => percent >= 100 ? "green" : percent >= 60 ? "blue" : percent >= 30 ? "amber" : "red";

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  const t = useT();
  return <div className="callout danger" role="alert">
    <Icon name="alertTriangle" />
    <span><strong>{t("Could not load")}</strong>{message}</span>
    <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" />{t("Try again")}</button>
  </div>;
}

function Loading() {
  const t = useT();
  return <div className="empty"><span className="spinner" />{t("Loading from SQL Server…")}</div>;
}

function NoPermission({ what }: { what: string }) {
  const t = useT();
  return <EmptyState icon="lock" title={t("No permission")} message={`${t("Your role does not include")} ${what}.`} />;
}

/** The workflow band shown above every intake and visit detail. */
function WorkflowTimeline({ steps, current }: { steps: string[]; current: string }) {
  const t = useT();
  const index = steps.indexOf(current);
  return <div className="workflow-steps" role="list">
    {steps.map((step, position) => <span
      key={step}
      role="listitem"
      className={`workflow-step${position === index ? " active" : position < index && index >= 0 ? " done" : ""}`}
    >{t(step)}</span>)}
  </div>;
}

const INTAKE_FLOW = ["Draft", "Pending Technical Review", "Ready to Schedule", "Scheduled", "Completed", "Closed"];

const INTAKE_STATUSES = ["Draft", "Pending Technical Review", "More Information Required", "Ready to Schedule",
  "Scheduled", "Completed", "On Hold", "Cancelled", "Closed"];
const VISIT_STATUSES = ["Tentative", "Pending Engineer Confirmation", "Pending Customer Confirmation", "Confirmed",
  "In Progress", "Report Pending", "Report Under Review", "Completed", "On Hold", "Reschedule Requested",
  "Cancelled", "Customer No-show", "Closed"];

const INTAKE_SOURCES = ["Email", "Phone", "Meeting", "Existing Customer", "Referral", "Website", "Other"];
const CHANNELS = ["Email", "Phone", "LINE", "Meeting", "Customer Portal", "Other"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const INTAKE_FILE_CATEGORIES = ["Photo", "Video", "Drawing", "Layout", "Specification", "Customer Requirement",
  "Email / Meeting Note", "Other"];
const SITE_FILE_CATEGORIES = ["Photo", "Video", "Measurement", "Drawing", "Other"];
const FINDING_KINDS = ["Finding", "Measurement", "Risk", "Customer Request", "Proposed Solution", "Follow-up",
  "Existing Condition", "Safety Concern"];
const SEVERITIES = ["Info", "Low", "Medium", "High", "Critical"];
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Master data is small, changes rarely, and every screen needs it. */
function useMasterData(enabled: boolean) {
  const [data, setData] = useState<VisitMasterData | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!enabled) return;
    try { setData(await loadVisitMasterData()); } catch (requestError) { setError(toError(requestError)); }
  }, [enabled]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  return { data, error, reload: load };
}

/* ==========================================================================
   1 — Sales Intake workspace
   ========================================================================== */

type IntakeScreen =
  | { name: "list" }
  | { name: "create" }
  | { name: "edit"; id: number }
  | { name: "detail"; id: number };

export function ProductionSalesIntake(props: Props & { openVisit?: (visitId: number) => void; startWithRequest?: boolean }) {
  const t = useT();
  const [tab, setTab] = useState<"intakes" | "review" | "dashboard">("intakes");
  const [screen, setScreen] = useState<IntakeScreen>(props.startWithRequest && props.inquiry ? { name: "create" } : { name: "list" });
  const canRead = props.bootstrap.permissions.includes("intake.read");
  const canReview = props.bootstrap.permissions.includes("intake.review");

  if (!canRead) return <NoPermission what="'intake.read'" />;
  if (screen.name === "create" || screen.name === "edit")
    return <IntakeEditor
      {...props}
      id={screen.name === "edit" ? screen.id : undefined}
      onBack={() => setScreen({ name: "list" })}
      onSaved={(id) => setScreen({ name: "detail", id })}
    />;
  if (screen.name === "detail")
    return <IntakeDetailScreen
      {...props}
      id={screen.id}
      onBack={() => setScreen({ name: "list" })}
      onEdit={(id) => setScreen({ name: "edit", id })}
    />;

  return <>
    {!props.inquiry && <Tabs
      tabs={[
        { id: "intakes", label: "คำขอเข้าหน้างาน / Visit preparation" },
        ...(canReview ? [{ id: "review" as const, label: t("Technical Review Queue") }] : []),
        { id: "dashboard", label: t("Sales Dashboard") },
      ]}
      active={tab}
      onChange={setTab}
    />}
    <div style={{ marginTop: 14 }}>
      {tab === "intakes" ? <IntakeList
        {...props}
        onCreate={() => props.inquiry ? setScreen({ name: "create" }) : props.startInquiry?.()}
        onOpen={(id) => setScreen({ name: "detail", id })}
      /> : null}
      {tab === "review" ? <ReviewQueue {...props} onOpen={(id) => setScreen({ name: "detail", id })} /> : null}
      {tab === "dashboard" ? <SalesDashboard {...props} onOpen={(id) => setScreen({ name: "detail", id })} /> : null}
    </div>
  </>;
}

const EMPTY_INTAKE_PAGE: PagedResult<SalesIntakeSummary> = { items: [], page: 1, pageSize: 10, total: 0 };

function IntakeList({ bootstrap, inquiry, onCreate, onOpen }: Props & { onCreate: () => void; onOpen: (id: number) => void }) {
  const uiText = useUiText();
  const t = useT();
  const [result, setResult] = useState(EMPTY_INTAKE_PAGE);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [customer, setCustomer] = useState("All customers");
  const [priority, setPriority] = useState("All priorities");
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canWrite = bootstrap.permissions.includes("intake.write");
  const customerId = bootstrap.customers.find((item) => item.code === customer)?.id;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setResult(await listSalesIntakes({
        page, pageSize, search,
        relatedInquiryId: inquiry?.id,
        includeArchived: inquiry ? true : undefined,
        status: status === "All status" ? undefined : status,
        customerId,
        priority: priority === "All priorities" ? undefined : priority,
        mine: mine || undefined,
      }));
    } catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [page, pageSize, search, status, customerId, priority, mine, inquiry]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 220); return () => window.clearTimeout(timer); }, [load]);
  const pageCount = Math.max(1, Math.ceil(result.total / Math.max(1, result.pageSize)));
  const resetPage = () => setPage(1);

  return <>
    <PageHeader
      eyebrow="SALES TO ENGINEERING"
      title={uiText("Site Visit Requests")}
      subtitle={inquiry ? `${inquiry.number} · ข้อมูลสำรวจและรายงานอยู่ภายใต้เรื่องนี้` : "ตรวจข้อมูลและเตรียมทีมก่อนนัดหมาย — รับเรื่องใหม่ที่ Inquiry"}
      actions={canWrite && (inquiry || bootstrap.permissions.includes("inquiry.write")) ? <button className="btn primary" type="button" onClick={onCreate}><Icon name="plus" />{inquiry ? <LocalizedText text={"Request a site visit"} /> : "รับเรื่องใหม่ที่ Inquiry"}</button> : undefined}
    />
    <Toolbar>
      <div style={{ minWidth: 300, flex: 1 }}>
        <label className="search-field">
          <Icon name="search" />
          <input maxLength={200} value={search} placeholder={t("Search intake no., subject, customer or site…")}
            onChange={(event) => { setSearch(event.target.value); resetPage(); }} />
          {search ? <button type="button" onClick={() => setSearch("")} aria-label={t("Clear search")}><Icon name="x" /></button> : null}
        </label>
      </div>
      <Select label={t("Status")} value={status} onChange={(value) => { setStatus(value); resetPage(); }}
        options={["All status", ...INTAKE_STATUSES]} />
      <Select label={t("Customer")} value={customer} onChange={(value) => { setCustomer(value); resetPage(); }}
        options={["All customers", ...bootstrap.customers.map((item) => item.code)]} />
      <Select label={t("Priority")} value={priority} onChange={(value) => { setPriority(value); resetPage(); }}
        options={["All priorities", ...PRIORITIES]} />
      <button className={mine ? "btn primary" : "btn ghost"} type="button" onClick={() => { setMine((value) => !value); resetPage(); }}>
        <Icon name="user" />{t("Mine only")}
      </button>
    </Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${result.total} คำขอเข้าหน้างาน`} flush>
      <GridControls hideSearch pageSize={pageSize} onPageSize={(size) => { setPageSize(size); setPage(1); }}
        search={search} onSearch={(value) => { setSearch(value); setPage(1); }} />
      {result.items.length ? <div className="table-wrap"><table>
        <thead><tr><th><LocalizedText text={"คำขอ / ลูกค้า"} /></th><th><LocalizedText text={"Responsibility"} /></th><th><LocalizedText text={"Response Due"} /></th><th><LocalizedText text={"Next step"} /></th><th><LocalizedText text={"นัดเข้าหน้างาน"} /></th><th aria-label={uiText("Action")} /></tr></thead>
        <tbody>{result.items.map((item) => <tr key={item.id}>
          <td><button className="back-link" type="button" onClick={() => onOpen(item.id)}>{item.subject}</button><div className="muted">{item.number} <LocalizedText text={"·"} /> {item.customerName}</div><small>{item.siteName}</small></td>
          <td><Person initials={initials(item.salesOwnerName)} name={item.salesOwnerName} /></td>
          <td>{formatDate(item.requiredResponseDate)}<br /><Badge tone={priorityTone(item.priority)}>{item.priority}</Badge></td>
          <td>{visitNextAction(item)}<div className="muted"><LocalizedText text={"คำขอ:"} /> {t(item.status)}</div></td>
          <td>{item.visitNumber ? <><strong className="mono">{item.visitNumber}</strong><br /><Badge tone={toneOf(item.visitStatus ?? "")}>{item.visitStatus}</Badge></> : "ยังไม่ได้นัด"}</td>
          <td><button className="btn default" type="button" onClick={() => onOpen(item.id)}><LocalizedText text={"เปิด"} /></button></td>
        </tr>)}</tbody>
      </table>
        <Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1}
          to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} />
      </div>
        : loading ? <Loading />
          : <EmptyState icon="inbox" title={t("No intake matches the filter")}
            message={t("Adjust the filters above, or record a new customer request.")} />}
    </Panel>
  </>;
}

function ReviewQueue({ onOpen }: Props & { onOpen: (id: number) => void }) {
  const uiText = useUiText();
  const t = useT();
  const [rows, setRows] = useState<SalesIntakeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await loadTechnicalReviewQueue()); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const waiting = rows.filter((row) => row.status === "Pending Technical Review");
  const returned = rows.filter((row) => row.status === "More Information Required");
  const ready = rows.filter((row) => row.status === "Ready to Schedule");

  return <>
    <PageHeader eyebrow="ENGINEERING COORDINATOR" title={t("Technical Review Queue")}
      subtitle={t("Check the information is complete before an engineer is committed to a date.")} />
    <div className="kpi-grid">
      <KpiCard label={t("Waiting for review")} value={String(waiting.length)} icon="clock" tone={waiting.length ? "amber" : "slate"} />
      <KpiCard label={t("Returned to sales")} value={String(returned.length)} icon="arrowLeft" tone={returned.length ? "red" : "slate"} />
      <KpiCard label={t("Ready to schedule")} value={String(ready.length)} icon="checkCircle" tone={ready.length ? "green" : "slate"} />
    </div>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={t("Review queue")} subtitle={t("Ordered by status, then priority, then the response date the customer was promised")} flush>
      {rows.length ? <div className="table-wrap"><table>
        <thead><tr>
          <th>{t("Intake No.")}</th><th>{t("Subject")}</th><th>{t("Customer")}</th><th>{t("Sales Owner")}</th>
          <th>{t("Readiness")}</th><th>{t("Missing")}</th><th>{t("Priority")}</th><th>{t("Response Due")}</th>
          <th>{t("Status")}</th><th aria-label={uiText("Action")} />
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className="clickable" onClick={() => onOpen(row.id)}>
          <td><strong className="mono">{row.number}</strong></td>
          <td><strong>{row.subject}</strong></td>
          <td>{row.customerName}</td>
          <td><Person initials={initials(row.salesOwnerName)} name={row.salesOwnerName} /></td>
          <td style={{ minWidth: 140 }}><Progress value={row.readinessScore} tone={readinessTone(row.readinessScore, row.blockerCount)} /></td>
          <td>{row.blockerCount > 0 ? <Badge tone="red">{`${row.blockerCount} ${t("blocker")}`}</Badge> : null}
            {row.warningCount > 0 ? <Badge tone="amber">{`${row.warningCount} ${t("warning")}`}</Badge> : null}
            {row.blockerCount === 0 && row.warningCount === 0 ? <Badge tone="green">{t("Complete")}</Badge> : null}</td>
          <td><Badge tone={priorityTone(row.priority)}>{row.priority}</Badge></td>
          <td>{formatDate(row.requiredResponseDate)}</td>
          <td><Badge tone={toneOf(row.status)}>{row.status}</Badge></td>
          <td><span className="row-action"><Icon name="chevronRight" /></span></td>
        </tr>)}</tbody>
      </table></div>
        : loading ? <Loading />
          : <EmptyState icon="checkCircle" title={t("Nothing waiting")} message={t("Every submitted intake has been reviewed.")} />}
    </Panel>
  </>;
}

function SalesDashboard({ onOpen }: Props & { onOpen: (id: number) => void }) {
  const t = useT();
  const [data, setData] = useState<SalesVisitDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await loadSalesVisitDashboard()); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  if (error) return <LoadError message={error} retry={() => { void load(); }} />;
  if (loading || !data) return <Loading />;

  return <>
    <PageHeader eyebrow="SALES" title={t("Sales Dashboard")} subtitle={t("Where each of your customer requests has got to.")} />
    <div className="kpi-grid">
      <KpiCard label={t("My intakes")} value={String(data.intakesCreated)} icon="inbox" />
      <KpiCard label={t("Pending technical review")} value={String(data.pendingTechnicalReview)} icon="clock" tone="amber" />
      <KpiCard label={t("Returned for information")} value={String(data.moreInformationRequired)} icon="alertTriangle" tone="red" />
      <KpiCard label={t("Waiting for the customer")} value={String(data.waitingCustomerConfirmation)} icon="user" tone="amber" />
      <KpiCard label={t("Upcoming visits")} value={String(data.upcomingVisits)} icon="calendar" tone="blue" />
      <KpiCard label={t("Completed visits")} value={String(data.completedVisits)} icon="checkCircle" tone="green" />
      <KpiCard label={t("Waiting for a report")} value={String(data.waitingReport)} icon="file" tone="amber" />
      <KpiCard label={t("Converted to inquiry")} value={String(data.convertedToInquiry)} icon="arrowRight" tone="green" />
    </div>
    <div className="grid-2" style={{ marginTop: 14 }}>
      <Panel title={t("Intake by status")}>
        {data.byStatus.length ? <div className="hbar-list">
          {data.byStatus.map((row) => <div className="hbar-top" key={row.label}>
            <span>{t(row.label)}</span>
            <span className="hbar-track"><i style={{ width: `${Math.min(100, (row.value / Math.max(1, Math.max(...data.byStatus.map((item) => item.value)))) * 100)}%` }} /></span>
            <strong>{row.value}</strong>
          </div>)}
        </div> : <EmptyState icon="chart" title={t("No data yet")} message={t("Register the first intake to populate this chart.")} />}
      </Panel>
      <Panel title={t("Needs your attention")} subtitle={t("Drafts, returned intakes, and anything past its promised response date")} flush>
        {data.attention.length ? <div className="table-wrap"><table>
          <thead><tr><th>{t("Intake No.")}</th><th>{t("Subject")}</th><th>{t("Readiness")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>{data.attention.map((row) => <tr key={row.id} className="clickable" onClick={() => onOpen(row.id)}>
            <td><strong className="mono">{row.number}</strong></td>
            <td>{row.subject}</td>
            <td><Badge tone={readinessTone(row.readinessScore, row.blockerCount)}>{`${row.readinessScore}%`}</Badge></td>
            <td><Badge tone={toneOf(row.status)}>{row.status}</Badge></td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon="checkCircle" title={t("Nothing waiting on you")} message={t("Every intake you own is moving.")} />}
      </Panel>
    </div>
  </>;
}

/* --------------------------------------------------------------------------
   Create / edit intake

   Sections mirror the paper form sales already use: who, what they asked for,
   what the machine is, when they are free, and what we have on file. Save
   Draft works from the first keystroke; Submit is what the readiness gate
   guards.
   -------------------------------------------------------------------------- */

type QueuedFile = { file: File; category: string; description: string };

const EMPTY_REQUIREMENT = {
  problemStatement: "", desiredCapability: "", expectedResult: "", expectedScope: "", outOfScope: "",
  existingProcess: "", currentPainPoint: "", targetCycleTime: "", productInformation: "", qualityRequirement: "",
  specialRequirement: "", budgetRange: "", expectedTimeline: "", competitorInformation: "", additionalNotes: "",
};

const EMPTY_MACHINE = {
  machineName: "", machineModel: "", machineSerialNo: "", manufacturer: "", existingSystem: "", controllerBrand: "",
  availableDrawing: "", utilityInformation: "", installationArea: "", spaceLimitation: "", workingEnvironment: "",
  safetyRequirement: "", productionSchedule: "", shutdownWindow: "", ppeRequirement: "", siteAccessRequirement: "",
  photographyRestricted: false, ndaRequired: false,
};

function ReadinessMeter({ readiness, compact }: {
  readiness: { score: number; blockerCount: number; warningCount: number; canSubmit: boolean; checks: { key: string; label: string; severity: string; hint: string; passed: boolean }[] };
  compact?: boolean;
}) {
  const t = useT();
  const tone = readinessTone(readiness.score, readiness.blockerCount);
  return <div className="readiness">
    <div className="readiness-head">
      <div>
        <strong>{t("Readiness")}</strong>
        <span className={`readiness-score ${tone}`}>{readiness.score}%</span>
      </div>
      <div className="readiness-tags">
        {readiness.blockerCount > 0 ? <Badge tone="red">{`${readiness.blockerCount} ${t("blocker")}`}</Badge> : null}
        {readiness.warningCount > 0 ? <Badge tone="amber">{`${readiness.warningCount} ${t("warning")}`}</Badge> : null}
        {readiness.canSubmit ? <Badge tone="green">{t("Can submit")}</Badge> : <Badge tone="red">{t("Cannot submit")}</Badge>}
      </div>
    </div>
    <Progress value={readiness.score} tone={tone} />
    {compact ? null : <ul className="readiness-list">
      {readiness.checks.map((check) => <li key={check.key} className={check.passed ? "ok" : check.severity === "blocker" ? "blocker" : "warn"}>
        <Icon name={check.passed ? "checkCircle" : check.severity === "blocker" ? "alertTriangle" : "alertCircle"} />
        <span><strong>{t(check.label)}</strong>{check.passed ? null : <small>{t(check.hint)}</small>}</span>
      </li>)}
    </ul>}
  </div>;
}

function IntakeEditor({ bootstrap, notify, inquiry, id, onBack, onSaved }: Props & {
  id?: number; onBack: () => void; onSaved: (id: number) => void;
}) {
  const uiText = useUiText();
  const t = useT();
  const master = useMasterData(true);
  const [form, setForm] = useState<SaveSalesIntakeInput>(() => {
    const base: SaveSalesIntakeInput = {
    customerId: bootstrap.customers[0]?.id ?? 0,
    subject: "", customerReferenceNo: "", requestDate: today(),
    salesOwnerId: bootstrap.user.id, priority: "Normal",
    requiredResponseDate: futureDate(5), customerExpectedCompletion: null, source: "Email",
    relatedInquiryId: null, relatedProjectId: null,
    contact: {
      siteId: null, siteContactId: null, customerBranch: "", siteName: "", siteAddress: "",
      contactName: "", contactDepartment: "", contactPosition: "", contactPhone: "", contactEmail: "",
      contactChannel: "Email",
    },
    requirement: { ...EMPTY_REQUIREMENT },
    machine: { ...EMPTY_MACHINE },
    visitTypeIds: [], skillIds: [], windows: [],
    };
    return inquiry ? seedVisitRequest(base, inquiry, bootstrap.team.find((member) => member.name === inquiry.salesOwner)?.id ?? bootstrap.user.id) : base;
  });
  const [existing, setExisting] = useState<SalesIntakeDetail | null>(null);
  const [inquirySearch, setInquirySearch] = useState("");
  const [inquiryOptions, setInquiryOptions] = useState<InquirySummary[]>([]);
  const [inquirySearchError, setInquirySearchError] = useState("");
  useEffect(() => {
    if (inquiry || !bootstrap.permissions.includes("inquiry.read") || !inquirySearch.trim()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void listInquiries({ customerId: form.customerId, search: inquirySearch, page: 1, pageSize: 10 })
        .then((page) => { if (!cancelled) { setInquiryOptions(page.items); setInquirySearchError(""); } })
        .catch((error: unknown) => { if (!cancelled) { setInquiryOptions([]); setInquirySearchError(toError(error)); } });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [inquiry, inquirySearch, form.customerId, bootstrap.permissions]);
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void loadSalesIntake(id)
      .then((detail) => {
        if (cancelled) return;
        setExisting(detail);
        setForm({
          customerId: detail.customerId, subject: detail.subject, customerReferenceNo: detail.customerReferenceNo,
          requestDate: detail.requestDate.slice(0, 10), salesOwnerId: detail.salesOwnerId, priority: detail.priority,
          requiredResponseDate: detail.requiredResponseDate?.slice(0, 10) ?? null,
          customerExpectedCompletion: detail.customerExpectedCompletion?.slice(0, 10) ?? null,
          source: detail.source, relatedInquiryId: detail.relatedInquiryId, relatedProjectId: detail.relatedProjectId,
          contact: detail.contact, requirement: detail.requirement, machine: detail.machine,
          visitTypeIds: detail.purposes.map((purpose) => purpose.visitTypeId),
          skillIds: detail.skills.filter((skill) => skill.source === "Sales").map((skill) => skill.skillId),
          windows: detail.windows.map((window) => ({
            startsAt: window.startsAt, endsAt: window.endsAt, preference: window.preference, note: window.note,
          })),
          rowVersion: detail.rowVersion,
        });
      })
      .catch((requestError) => { if (!cancelled) setError(toError(requestError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const set = <K extends keyof SaveSalesIntakeInput>(key: K, value: SaveSalesIntakeInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setContact = <K extends keyof SaveSalesIntakeInput["contact"]>(key: K, value: SaveSalesIntakeInput["contact"][K]) =>
    setForm((current) => ({ ...current, contact: { ...current.contact, [key]: value } }));
  const setRequirement = <K extends keyof SaveSalesIntakeInput["requirement"]>(key: K, value: SaveSalesIntakeInput["requirement"][K]) =>
    setForm((current) => ({ ...current, requirement: { ...current.requirement, [key]: value } }));
  const setMachine = <K extends keyof SaveSalesIntakeInput["machine"]>(key: K, value: SaveSalesIntakeInput["machine"][K]) =>
    setForm((current) => ({ ...current, machine: { ...current.machine, [key]: value } }));

  const togglePurpose = (visitTypeId: number) => setForm((current) => ({
    ...current,
    visitTypeIds: current.visitTypeIds.includes(visitTypeId)
      ? current.visitTypeIds.filter((value) => value !== visitTypeId)
      : [...current.visitTypeIds, visitTypeId],
  }));
  const toggleSkill = (skillId: number) => setForm((current) => ({
    ...current,
    skillIds: current.skillIds.includes(skillId)
      ? current.skillIds.filter((value) => value !== skillId)
      : [...current.skillIds, skillId],
  }));

  const addFiles = (selected: FileList | File[]) => setFiles((current) => [
    ...current,
    ...Array.from(selected)
      .filter((file) => file.size > 0 && file.size <= MAX_FILE_BYTES)
      .map((file) => ({ file, category: "Photo", description: "" })),
  ]);

  // The live score is advisory. The API recomputes it from the database on
  // every save, and it is that number the submit gate uses.
  const liveReadiness = useMemo(() => {
    const filled = (value: string | null | undefined, minimum = 1) => (value ?? "").trim().length >= minimum;
    const checks = [
      { key: "customer_site", label: "Customer and site are identified", severity: "blocker", hint: "Choose the customer and name the site the engineer must reach.", passed: form.customerId > 0 && filled(form.contact.siteName) && filled(form.contact.siteAddress, 5) },
      { key: "contact", label: "Site contact person is reachable", severity: "blocker", hint: "A name plus at least one of phone or email.", passed: filled(form.contact.contactName) && (filled(form.contact.contactPhone, 6) || filled(form.contact.contactEmail, 5)) },
      { key: "problem", label: "Current problem is described", severity: "blocker", hint: "What is happening today that made the customer call.", passed: filled(form.requirement.problemStatement, 20) },
      { key: "expected_result", label: "Expected result is stated", severity: "blocker", hint: "What the customer wants to be true afterwards.", passed: filled(form.requirement.expectedResult, 20) },
      { key: "purpose", label: "Visit purpose is selected", severity: "blocker", hint: "At least one purpose.", passed: form.visitTypeIds.length > 0 },
      { key: "machine", label: "Machine or system information is sufficient", severity: "warning", hint: "Machine name plus a model, or a description of the existing system.", passed: filled(form.machine.machineName) && (filled(form.machine.machineModel) || filled(form.machine.existingSystem, 10)) },
      { key: "attachment", label: "A photo, drawing or document is attached", severity: "warning", hint: "One picture of the real machine saves an hour of guessing.", passed: (existing?.attachments.length ?? 0) + files.length > 0 },
      { key: "window", label: "Customer availability window is proposed", severity: "warning", hint: "At least one date range the customer said would suit them.", passed: form.windows.length > 0 },
      { key: "safety", label: "Safety and site access are recorded", severity: "warning", hint: "PPE, permits, escorts, photography rules.", passed: filled(form.machine.safetyRequirement, 3) || filled(form.machine.siteAccessRequirement, 3) },
      { key: "skill", label: "Expected engineering skills are indicated", severity: "warning", hint: "Your best guess is enough.", passed: form.skillIds.length > 0 },
    ];
    const weights: Record<string, number> = {
      customer_site: 12, contact: 12, problem: 14, expected_result: 14, purpose: 10,
      machine: 10, attachment: 8, window: 8, safety: 6, skill: 6,
    };
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    const earned = checks.filter((check) => check.passed).reduce((sum, check) => sum + weights[check.key], 0);
    const blockerCount = checks.filter((check) => !check.passed && check.severity === "blocker").length;
    return {
      score: Math.round((earned / total) * 100),
      blockerCount,
      warningCount: checks.filter((check) => !check.passed && check.severity === "warning").length,
      canSubmit: blockerCount === 0,
      checks,
    };
  }, [form, files.length, existing?.attachments.length]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const saved = id
        ? await saveSalesIntake(id, form)
        : await createSalesIntake(form);
      const intakeId = id ?? (saved as { id: number }).id;
      for (const queued of files) {
        await uploadIntakeAttachment(intakeId, {
          file: queued.file, category: queued.category, description: queued.description,
        });
      }
      notify(`${saved.number} ${t("saved")}${files.length ? ` · ${files.length} ${t("file(s) uploaded")}` : ""}`);
      onSaved(intakeId);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  const visitTypes = master.data?.visitTypes.filter((type) => type.isActive) ?? [];
  const skills = master.data?.skills.filter((skill) => skill.isActive) ?? [];

  return <form onSubmit={(event) => { void submit(event); }}>
    <button className="back-link" type="button" onClick={onBack}><Icon name="arrowLeft" />{t("Sales Intake")}</button>
    <PageHeader
      eyebrow={id ? "EDIT INTAKE" : "NEW INTAKE"}
      title={id ? `${t("Edit")} ${existing?.number ?? ""}` : "ขอเข้าหน้างาน"}
      subtitle={t("Save a draft at any time. Submitting for technical review needs the mandatory information below.")}
      actions={<>
        <button className="btn default" type="button" disabled={busy} onClick={onBack}>{t("Cancel")}</button>
        <button className="btn primary" type="submit" disabled={busy || !form.customerId || !form.subject.trim()}>
          <Icon name="check" />{busy ? t("Saving…") : t("Save draft")}
        </button>
      </>}
    />
    {error ? <LoadError message={error} retry={() => undefined} /> : null}
    {master.error ? <LoadError message={master.error} retry={() => { void master.reload(); }} /> : null}
    {inquiry ? <div className="callout"><Icon name="inbox" /><span><strong>{inquiry.number} <LocalizedText text={"·"} /> {inquiry.projectName}</strong><LocalizedText text={"ดึงข้อมูลจาก Inquiry แล้ว — เติมรายละเอียดสำหรับการเข้าหน้างาน ผลสำรวจจะอยู่ในเรื่องเดิม"} /></span></div> : null}
    {!inquiry && bootstrap.permissions.includes("inquiry.read") ? <Panel title="Inquiry ที่เกี่ยวข้อง" subtitle="เชื่อมรายการเดิมกับเรื่องของลูกค้ารายนี้ โดยเก็บข้อมูลคำขอเดิมไว้">
      <Field label="ค้นหาเลข Inquiry หรือชื่องาน"><input value={inquirySearch} maxLength={200} onChange={(event) => { setInquirySearch(event.target.value); setInquiryOptions([]); }} /></Field>
      {inquirySearchError ? <p role="alert">{inquirySearchError}</p> : null}
      <Field label="เรื่องหลัก"><select value={form.relatedInquiryId ?? ""} onChange={(event) => set("relatedInquiryId", event.target.value ? Number(event.target.value) : null)}>
        <option value=""><LocalizedText text={"ยังไม่ได้เชื่อม Inquiry"} /></option>
        {form.relatedInquiryId && !inquiryOptions.some((item) => item.id === form.relatedInquiryId) ? <option value={form.relatedInquiryId}>{existing?.relatedInquiryNumber ?? `Inquiry #${form.relatedInquiryId}`}</option> : null}
        {inquiryOptions.map((item) => <option key={item.id} value={item.id}>{item.number} <LocalizedText text={"·"} /> {item.projectName}</option>)}
      </select></Field>
    </Panel> : null}

    <div className="intake-layout">
      <div className="intake-main">
        <Panel title={t("Customer and site")} subtitle={t("Where the engineer is going and who will meet them")}>
          <div className="form-grid">
            <Field label={t("Customer")}>
              <select disabled={Boolean(inquiry || form.relatedInquiryId)} value={form.customerId} onChange={(event) => set("customerId", Number(event.target.value))}>
                {bootstrap.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}
              </select>
            </Field>
            <Field label={t("Customer branch")}><input maxLength={200} value={form.contact.customerBranch} onChange={(event) => setContact("customerBranch", event.target.value)} /></Field>
            <Field label={t("Site / factory")} span={2}><input maxLength={300} value={form.contact.siteName} onChange={(event) => setContact("siteName", event.target.value)} /></Field>
            <Field label={t("Site address")} span={4} hint={t("Enough for a driver to find the gate")}>
              <textarea maxLength={1000} rows={2} value={form.contact.siteAddress} onChange={(event) => setContact("siteAddress", event.target.value)} />
            </Field>
            <Field label={t("Contact person")}><input maxLength={200} value={form.contact.contactName} onChange={(event) => setContact("contactName", event.target.value)} /></Field>
            <Field label={t("Department")}><input maxLength={200} value={form.contact.contactDepartment} onChange={(event) => setContact("contactDepartment", event.target.value)} /></Field>
            <Field label={t("Position")}><input maxLength={200} value={form.contact.contactPosition} onChange={(event) => setContact("contactPosition", event.target.value)} /></Field>
            <Field label={t("Phone")}><input maxLength={100} value={form.contact.contactPhone} onChange={(event) => setContact("contactPhone", event.target.value)} /></Field>
            <Field label={t("Email")}><input type="email" maxLength={256} value={form.contact.contactEmail} onChange={(event) => setContact("contactEmail", event.target.value)} /></Field>
            <Field label={t("Preferred channel")}>
              <select value={form.contact.contactChannel} onChange={(event) => setContact("contactChannel", event.target.value)}>
                {CHANNELS.map((channel) => <option key={channel}>{channel}</option>)}
              </select>
            </Field>
          </div>
        </Panel>

        <div style={{ height: 14 }} />
        <Panel title={t("Request")} subtitle={t("Reference numbers, ownership and how urgent this is")}>
          <div className="form-grid">
            <Field label={t("Intake No.")} hint={t("Allocated on save — read only")}><input value={existing?.number ?? t("Generated on save")} readOnly /></Field>
            <Field label={t("Customer reference no.")} hint={t("May repeat; the system warns rather than merging")}>
              <input maxLength={100} value={form.customerReferenceNo ?? ""} onChange={(event) => set("customerReferenceNo", event.target.value)} />
            </Field>
            <Field label={t("Subject")} span={2}><input required maxLength={300} value={form.subject} onChange={(event) => set("subject", event.target.value)} /></Field>
            <Field label={t("Request date")}><input type="date" value={form.requestDate ?? today()} onChange={(event) => set("requestDate", event.target.value)} /></Field>
            <Field label={t("Sales owner")}>
              <select value={form.salesOwnerId} onChange={(event) => set("salesOwnerId", Number(event.target.value))}>
                {bootstrap.team.map((member) => <option key={member.id} value={member.id}>{member.name} — {t(member.role)}</option>)}
              </select>
            </Field>
            <Field label={t("Priority")}>
              <select value={form.priority} onChange={(event) => set("priority", event.target.value)}>
                {PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
              </select>
            </Field>
            <Field label={t("Source")}>
              <select value={form.source} onChange={(event) => set("source", event.target.value)}>
                {INTAKE_SOURCES.map((source) => <option key={source}>{source}</option>)}
              </select>
            </Field>
            <Field label={t("Required response date")}><input type="date" value={form.requiredResponseDate ?? ""} onChange={(event) => set("requiredResponseDate", event.target.value || null)} /></Field>
            <Field label={t("Customer expected completion")}><input type="date" value={form.customerExpectedCompletion ?? ""} onChange={(event) => set("customerExpectedCompletion", event.target.value || null)} /></Field>
          </div>
          {existing && existing.duplicateReferences.length > 0 ? <div className="callout warning" role="status">
            <Icon name="alertTriangle" />
            <span>
              <strong>{t("This customer reference already appears on another intake")}</strong>
              {existing.duplicateReferences.map((duplicate) => `${duplicate.number} · ${duplicate.subject} (${duplicate.status})`).join(" · ")}
              <small>{t("Nothing has been merged. Check whether this is a genuine second request.")}</small>
            </span>
          </div> : null}
        </Panel>

        <div style={{ height: 14 }} />
        <Panel title={t("What the customer wants")} subtitle={t("In their words. Engineering adds its own assessment separately and never edits this.")}>
          <div className="form-grid">
            <Field label={t("Current problem or situation")} span={4} hint={t("At least a couple of sentences — this is the mandatory one")}>
              <textarea rows={3} maxLength={20000} value={form.requirement.problemStatement} onChange={(event) => setRequirement("problemStatement", event.target.value)} />
            </Field>
            <Field label={t("What the system or machine should do")} span={2}><textarea rows={2} maxLength={20000} value={form.requirement.desiredCapability} onChange={(event) => setRequirement("desiredCapability", event.target.value)} /></Field>
            <Field label={t("Expected result")} span={2} hint={t("What is true after the work is done")}>
              <textarea rows={2} maxLength={20000} value={form.requirement.expectedResult} onChange={(event) => setRequirement("expectedResult", event.target.value)} />
            </Field>
            <Field label={t("Expected scope")} span={2}><textarea rows={2} maxLength={20000} value={form.requirement.expectedScope} onChange={(event) => setRequirement("expectedScope", event.target.value)} /></Field>
            <Field label={t("Known out of scope")} span={2}><textarea rows={2} maxLength={20000} value={form.requirement.outOfScope} onChange={(event) => setRequirement("outOfScope", event.target.value)} /></Field>
            <Field label={t("Existing process")} span={2}><textarea rows={2} maxLength={20000} value={form.requirement.existingProcess} onChange={(event) => setRequirement("existingProcess", event.target.value)} /></Field>
            <Field label={t("Current pain point")} span={2}><textarea rows={2} maxLength={20000} value={form.requirement.currentPainPoint} onChange={(event) => setRequirement("currentPainPoint", event.target.value)} /></Field>
            <Field label={t("Target cycle time or capacity")}><input maxLength={300} value={form.requirement.targetCycleTime} onChange={(event) => setRequirement("targetCycleTime", event.target.value)} /></Field>
            <Field label={t("Budget range")} hint={t("Only if the customer said so")}><input maxLength={200} value={form.requirement.budgetRange} onChange={(event) => setRequirement("budgetRange", event.target.value)} /></Field>
            <Field label={t("Expected timeline")}><input maxLength={300} value={form.requirement.expectedTimeline} onChange={(event) => setRequirement("expectedTimeline", event.target.value)} /></Field>
            <Field label={t("Competitor information")}><input maxLength={2000} value={form.requirement.competitorInformation} onChange={(event) => setRequirement("competitorInformation", event.target.value)} /></Field>
            <Field label={t("Product / workpiece information")} span={2}><textarea rows={2} maxLength={20000} value={form.requirement.productInformation} onChange={(event) => setRequirement("productInformation", event.target.value)} /></Field>
            <Field label={t("Quality requirement")} span={2}><textarea rows={2} maxLength={20000} value={form.requirement.qualityRequirement} onChange={(event) => setRequirement("qualityRequirement", event.target.value)} /></Field>
            <Field label={t("Special requirement")} span={2}><textarea rows={2} maxLength={20000} value={form.requirement.specialRequirement} onChange={(event) => setRequirement("specialRequirement", event.target.value)} /></Field>
            <Field label={t("Additional notes")} span={2}><textarea rows={2} maxLength={20000} value={form.requirement.additionalNotes} onChange={(event) => setRequirement("additionalNotes", event.target.value)} /></Field>
          </div>
        </Panel>

        <div style={{ height: 14 }} />
        <details><summary><LocalizedText text={"รายละเอียดเครื่องจักรและความปลอดภัยหน้างาน"} /></summary>
        <Panel title={t("Machine and site conditions")} subtitle={t("Everything that decides whether an engineer can actually do the work on the day")}>
          <div className="form-grid">
            <Field label={t("Machine name")}><input maxLength={300} value={form.machine.machineName} onChange={(event) => setMachine("machineName", event.target.value)} /></Field>
            <Field label={t("Machine model")}><input maxLength={200} value={form.machine.machineModel} onChange={(event) => setMachine("machineModel", event.target.value)} /></Field>
            <Field label={t("Serial number")}><input maxLength={200} value={form.machine.machineSerialNo} onChange={(event) => setMachine("machineSerialNo", event.target.value)} /></Field>
            <Field label={t("Manufacturer")}><input maxLength={200} value={form.machine.manufacturer} onChange={(event) => setMachine("manufacturer", event.target.value)} /></Field>
            <Field label={t("Existing system")} span={2}><textarea rows={2} maxLength={20000} value={form.machine.existingSystem} onChange={(event) => setMachine("existingSystem", event.target.value)} /></Field>
            <Field label={t("PLC / robot / controller brand")} span={2}><input maxLength={300} value={form.machine.controllerBrand} onChange={(event) => setMachine("controllerBrand", event.target.value)} /></Field>
            <Field label={t("Available drawing")} span={2}><input maxLength={500} value={form.machine.availableDrawing} onChange={(event) => setMachine("availableDrawing", event.target.value)} /></Field>
            <Field label={t("Utility information")} span={2}><textarea rows={2} maxLength={20000} value={form.machine.utilityInformation} onChange={(event) => setMachine("utilityInformation", event.target.value)} /></Field>
            <Field label={t("Installation area")}><input maxLength={300} value={form.machine.installationArea} onChange={(event) => setMachine("installationArea", event.target.value)} /></Field>
            <Field label={t("Production schedule")}><input maxLength={500} value={form.machine.productionSchedule} onChange={(event) => setMachine("productionSchedule", event.target.value)} /></Field>
            <Field label={t("Shutdown window")}><input maxLength={500} value={form.machine.shutdownWindow} onChange={(event) => setMachine("shutdownWindow", event.target.value)} /></Field>
            <Field label={t("PPE requirement")}><input maxLength={500} value={form.machine.ppeRequirement} onChange={(event) => setMachine("ppeRequirement", event.target.value)} /></Field>
            <Field label={t("Space limitation")} span={2}><textarea rows={2} maxLength={20000} value={form.machine.spaceLimitation} onChange={(event) => setMachine("spaceLimitation", event.target.value)} /></Field>
            <Field label={t("Working environment")} span={2}><textarea rows={2} maxLength={20000} value={form.machine.workingEnvironment} onChange={(event) => setMachine("workingEnvironment", event.target.value)} /></Field>
            <Field label={t("Safety requirement")} span={2}><textarea rows={2} maxLength={20000} value={form.machine.safetyRequirement} onChange={(event) => setMachine("safetyRequirement", event.target.value)} /></Field>
            <Field label={t("Site access requirement")} span={2} hint={t("Permits, escorts, induction — anything that stops an engineer at the gate")}>
              <textarea rows={2} maxLength={20000} value={form.machine.siteAccessRequirement} onChange={(event) => setMachine("siteAccessRequirement", event.target.value)} />
            </Field>
            <Field label={t("Restrictions")} span={2}>
              <div className="check-inline">
                <label><input type="checkbox" checked={form.machine.photographyRestricted} onChange={(event) => setMachine("photographyRestricted", event.target.checked)} />{t("Photography restricted")}</label>
                <label><input type="checkbox" checked={form.machine.ndaRequired} onChange={(event) => setMachine("ndaRequired", event.target.checked)} />{t("NDA required")}</label>
              </div>
            </Field>
          </div>
        </Panel>
        </details>

        <div style={{ height: 14 }} />
        <Panel title={t("Visit purpose and expected skills")} subtitle={t("Sales' best guess. The coordinator may correct the skills, and both are kept.")}>
          <div className="form-section-title">{t("Visit purpose")}</div>
          <div className="check-grid">
            {/* The label text sits as a direct child so it is reachable at the
                depth jsx-a11y checks, and htmlFor ties it to the box as well. */}
            {visitTypes.map((type) => <label key={type.id} htmlFor={`purpose-${type.id}`}
              className={form.visitTypeIds.includes(type.id) ? "check-item purpose-item on" : "check-item purpose-item"}>
              <input id={`purpose-${type.id}`} type="checkbox" checked={form.visitTypeIds.includes(type.id)}
                onChange={() => togglePurpose(type.id)} />
              <strong>{type.nameEn}</strong>
              <small>{type.description}</small>
            </label>)}
            {visitTypes.length === 0 ? <p className="muted">{t("No visit purpose is configured yet. An administrator can add them in Visit Master Data.")}</p> : null}
          </div>
          <div className="form-section-title" style={{ marginTop: 14 }}>{t("Expected engineering skills")}</div>
          <div className="chip-select">
            {skills.map((skill) => <button
              key={skill.id}
              type="button"
              className={form.skillIds.includes(skill.id) ? "chip on" : "chip"}
              aria-pressed={form.skillIds.includes(skill.id)}
              onClick={() => toggleSkill(skill.id)}
            >{skill.nameEn}</button>)}
          </div>
        </Panel>

        <div style={{ height: 14 }} />
        <Panel
          title={t("When the customer is available")}
          subtitle={t("Ranges the customer offered, most preferred first")}
          actions={<button className="btn ghost" type="button" onClick={() => setForm((current) => ({
            ...current,
            windows: [...current.windows, {
              startsAt: new Date(`${futureDate(7)}T09:00:00`).toISOString(),
              endsAt: new Date(`${futureDate(7)}T17:00:00`).toISOString(),
              preference: current.windows.length + 1, note: "",
            }],
          }))}><Icon name="plus" />{t("Add window")}</button>}
        >
          {form.windows.length ? <div className="table-wrap"><table>
            <thead><tr><th>{t("Preference")}</th><th>{t("From")}</th><th>{t("To")}</th><th>{t("Note")}</th><th aria-label={uiText("Action")} /></tr></thead>
            <tbody>{form.windows.map((window, index) => <tr key={`${window.startsAt}-${index}`}>
              <td style={{ width: 110 }}><input type="number" min={1} max={9} value={window.preference}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  windows: current.windows.map((item, position) => position === index ? { ...item, preference: Number(event.target.value) } : item),
                }))} /></td>
              <td><input type="datetime-local" value={toLocalInput(window.startsAt)}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  windows: current.windows.map((item, position) => position === index ? { ...item, startsAt: fromLocalInput(event.target.value) } : item),
                }))} /></td>
              <td><input type="datetime-local" value={toLocalInput(window.endsAt)}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  windows: current.windows.map((item, position) => position === index ? { ...item, endsAt: fromLocalInput(event.target.value) } : item),
                }))} /></td>
              <td><input maxLength={500} value={window.note ?? ""}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  windows: current.windows.map((item, position) => position === index ? { ...item, note: event.target.value } : item),
                }))} /></td>
              <td><button className="row-action" type="button" aria-label={t("Remove window")}
                onClick={() => setForm((current) => ({ ...current, windows: current.windows.filter((_, position) => position !== index) }))}>
                <Icon name="trash" /></button></td>
            </tr>)}</tbody>
          </table></div> : <EmptyState icon="calendar" title={t("No availability recorded")}
            message={t("Ask the customer for one or two ranges. It is the difference between one phone call and five.")} />}
        </Panel>

        <div style={{ height: 14 }} />
        <Panel title={t("Attachments")} subtitle={t("Photos, drawings, specifications and the email the request arrived in")}>
          <input ref={fileRef} type="file" multiple hidden
            onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
          <button className="attachment-drop" type="button" onClick={() => fileRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
            <Icon name="upload" />
            <strong>{t("Drag and drop files here or click to browse")}</strong>
            <span>{t("Image, video, PDF, Office or drawing — maximum 50 MB per file")}</span>
          </button>
          {files.length ? <div style={{ marginTop: 12 }}>{files.map((queued, index) => <div className="file-row" key={`${queued.file.name}-${index}`}>
            <span className="file-icon"><Icon name="file" /></span>
            <div style={{ flex: 1 }}><strong>{queued.file.name}</strong><small>{formatFileSize(queued.file.size)} <LocalizedText text={"·"} /> {t("queued")}</small></div>
            <input placeholder={t("Description")} maxLength={1000} value={queued.description}
              onChange={(event) => setFiles((current) => current.map((item, position) => position === index ? { ...item, description: event.target.value } : item))} />
            <select value={queued.category}
              onChange={(event) => setFiles((current) => current.map((item, position) => position === index ? { ...item, category: event.target.value } : item))}>
              {INTAKE_FILE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
            <button type="button" className="row-action" aria-label={`${t("Remove")} ${queued.file.name}`}
              onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}><Icon name="trash" /></button>
          </div>)}</div> : null}
          {existing && existing.attachments.length > 0 ? <div style={{ marginTop: 12 }}>
            <div className="form-section-title">{t("Already attached")}</div>
            {existing.attachments.map((attachment) => <div className="file-row" key={attachment.id}>
              <span className="file-icon"><Icon name="paperclip" /></span>
              <div style={{ flex: 1 }}><strong>{attachment.name}</strong><small>{attachment.category} <LocalizedText text={"· v"} />{attachment.version} <LocalizedText text={"·"} /> {formatFileSize(attachment.sizeBytes)}</small></div>
            </div>)}
          </div> : null}
        </Panel>
      </div>

      <aside className="intake-side">
        <Panel title={t("Readiness")} subtitle={t("What is still needed before this can go to technical review")}>
          <ReadinessMeter readiness={liveReadiness} />
        </Panel>
      </aside>
    </div>
  </form>;
}

/* --------------------------------------------------------------------------
   Intake detail — the record, its review, and the visit it produced
   -------------------------------------------------------------------------- */

function DefinitionList({ rows }: { rows: [string, React.ReactNode][] }) {
  const t = useT();
  const filled = rows.filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== "—");
  if (filled.length === 0) return <p className="muted">{t("Nothing recorded in this section.")}</p>;
  return <dl className="def-list">
    {filled.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function IntakeDetailScreen({ bootstrap, notify, id, onBack, onEdit, openVisit, openInquiry }: Props & {
  id: number; onBack: () => void; onEdit: (id: number) => void; openVisit?: (visitId: number) => void;
}) {
  const uiText = useUiText();
  const t = useT();
  const master = useMasterData(true);
  const [detail, setDetail] = useState<SalesIntakeDetail | null>(null);
  const [tab, setTab] = useState<"overview" | "requirement" | "machine" | "review" | "visits" | "attachments" | "activity">("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const permissions = bootstrap.permissions;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setDetail(await loadSalesIntake(id)); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const applyStatus = async () => {
    if (!detail || !statusTarget) return;
    setBusy(true);
    try {
      await changeIntakeStatus(detail.id, { status: statusTarget, reason: statusReason || undefined, rowVersion: detail.rowVersion });
      notify(`${detail.number} → ${t(statusTarget)}`);
      setStatusTarget(null); setStatusReason("");
      await load();
    } catch (requestError) { notify(toError(requestError)); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  if (error) return <LoadError message={error} retry={() => { void load(); }} />;
  if (!detail) return <EmptyState icon="inbox" title={t("Not found")} message={t("This intake no longer exists.")} />;

  const canEdit = permissions.includes("intake.write") && (detail.status === "Draft" || detail.status === "More Information Required");
  const canReview = permissions.includes("intake.review") && detail.status === "Pending Technical Review";
  const canSchedule = permissions.includes("visit.schedule") && detail.status === "Ready to Schedule";

  return <>
    <button className="back-link" type="button" onClick={onBack}><Icon name="arrowLeft" />{t("Sales Intake")}</button>
    <PageHeader
      eyebrow={detail.customerName}
      title={`${detail.number} · ${detail.subject}`}
      subtitle={`${detail.contact.siteName || t("Site not named")} · ${t("Sales owner")}: ${detail.salesOwnerName}`}
      meta={<>
        <Badge tone={toneOf(detail.status)}>{detail.status}</Badge>
        <Badge tone={priorityTone(detail.priority)}>{detail.priority}</Badge>
        <Badge tone={readinessTone(detail.readinessScore, detail.blockerCount)}>{`${t("Readiness")} ${detail.readinessScore}%`}</Badge>
        {detail.isArchived ? <Badge tone="slate">{t("Archived")}</Badge> : null}
      </>}
      actions={<>
        {detail.relatedInquiryId && openInquiry && permissions.includes("inquiry.read") ? <button className="btn default" type="button" onClick={() => openInquiry(detail.relatedInquiryId!)}><Icon name="inbox" />{detail.relatedInquiryNumber} <LocalizedText text={"· เปิดเรื่องหลัก"} /></button> : null}
        {canEdit ? <button className="btn default" type="button" onClick={() => onEdit(detail.id)}><Icon name="edit" />{t("Edit")}</button> : null}
        {canReview ? <button className="btn default" type="button" onClick={() => setReviewOpen(true)}><Icon name="shield" />{t("Technical review")}</button> : null}
        {canSchedule ? <button className="btn primary" type="button" onClick={() => setScheduleOpen(true)}><Icon name="calendar" />{t("Request site visit")}</button> : null}
        {detail.allowedTransitions.map((target) => <button key={target} className="btn ghost" type="button"
          onClick={() => { setStatusTarget(target); setStatusReason(""); }}>{t(target)}</button>)}
      </>}
    />
    <WorkflowTimeline steps={INTAKE_FLOW} current={detail.status} />

    <Tabs
      tabs={[
        { id: "overview", label: t("Overview") },
        { id: "requirement", label: t("Customer Requirement") },
        { id: "machine", label: t("Machine & Site") },
        { id: "review", label: `${t("Technical Review")}${detail.reviews.length ? ` (${detail.reviews.length})` : ""}` },
        { id: "visits", label: `${t("Site Visits")}${detail.visits.length ? ` (${detail.visits.length})` : ""}` },
        { id: "attachments", label: `${t("Attachments")}${detail.attachments.length ? ` (${detail.attachments.length})` : ""}` },
        { id: "activity", label: t("Activity") },
      ]}
      active={tab}
      onChange={setTab}
    />

    <div style={{ marginTop: 14 }}>
      {tab === "overview" ? <div className="grid-2">
        <div>
          <Panel title={t("Request")}>
            <DefinitionList rows={[
              ["Intake No.", <span className="mono" key="n">{detail.number}</span>],
              ["Customer", `${detail.customerCode} — ${detail.customerName}`],
              ["Customer branch", detail.contact.customerBranch],
              ["Site / factory", detail.contact.siteName],
              ["Site address", detail.contact.siteAddress],
              ["Customer reference no.", detail.customerReferenceNo],
              ["Request date", formatDate(detail.requestDate)],
              ["Source", detail.source],
              ["Required response date", formatDate(detail.requiredResponseDate)],
              ["Customer expected completion", formatDate(detail.customerExpectedCompletion)],
              ["Related inquiry", detail.relatedInquiryNumber],
              ["Related project", detail.relatedProjectNumber],
              ["Submitted", detail.submittedAt ? `${formatDateTime(detail.submittedAt)} · ${detail.submittedByName}` : "—"],
              ["Created", `${formatDateTime(detail.createdAt)} · ${detail.createdByName}`],
              ["Last updated", `${formatDateTime(detail.updatedAt)} · ${detail.updatedByName}`],
            ]} />
          </Panel>
          <div style={{ height: 14 }} />
          <Panel title={t("Contact")}>
            <DefinitionList rows={[
              ["Contact person", detail.contact.contactName],
              ["Department", detail.contact.contactDepartment],
              ["Position", detail.contact.contactPosition],
              ["Phone", detail.contact.contactPhone],
              ["Email", detail.contact.contactEmail],
              ["Preferred channel", detail.contact.contactChannel],
            ]} />
          </Panel>
        </div>
        <div>
          <Panel title={t("Readiness")} subtitle={t("Recomputed by the API from what is actually stored")}>
            <ReadinessMeter readiness={detail.readiness} />
          </Panel>
          <div style={{ height: 14 }} />
          <Panel title={t("Visit purpose and skills")}>
            <div className="form-section-title">{t("Purpose")}</div>
            <div className="chip-select">
              {detail.purposes.length ? detail.purposes.map((purpose) => <span className="chip on" key={purpose.visitTypeId}>{purpose.name}</span>)
                : <span className="muted">{t("Not selected")}</span>}
            </div>
            <div className="form-section-title" style={{ marginTop: 12 }}>{t("Skills requested by sales")}</div>
            <div className="chip-select">
              {detail.skills.filter((skill) => skill.source === "Sales").map((skill) => <span className="chip" key={`s-${skill.skillId}`}>{skill.name}</span>)}
              {detail.skills.every((skill) => skill.source !== "Sales") ? <span className="muted">{t("Not selected")}</span> : null}
            </div>
            {detail.skills.some((skill) => skill.source === "Coordinator") ? <>
              <div className="form-section-title" style={{ marginTop: 12 }}>{t("Skills confirmed by the coordinator")}</div>
              <div className="chip-select">
                {detail.skills.filter((skill) => skill.source === "Coordinator").map((skill) => <span className="chip on" key={`c-${skill.skillId}`}>{skill.name}</span>)}
              </div>
              <p className="muted" style={{ marginTop: 6 }}>{t("The coordinator's list is the one used for assignment. Sales' original selection is kept above.")}</p>
            </> : null}
          </Panel>
          <div style={{ height: 14 }} />
          <Panel title={t("Customer availability")}>
            {detail.windows.length ? <ul className="link-list">
              {detail.windows.map((window) => <li key={window.id}>
                <Pill>{`#${window.preference}`}</Pill>
                <span>{formatDateTime(window.startsAt)} → {formatDateTime(window.endsAt)}</span>
                {window.note ? <small className="muted">{window.note}</small> : null}
              </li>)}
            </ul> : <p className="muted">{t("No window was proposed.")}</p>}
          </Panel>
          {detail.links.length ? <>
            <div style={{ height: 14 }} />
            <Panel title={t("Traceability")} subtitle={t("Where this request ended up")}>
              <ul className="link-list">
                {detail.links.map((link) => <li key={link.id}>
                  <Pill>{link.targetType}</Pill><strong className="mono">{link.targetNumber}</strong>
                  <small className="muted">{link.relation} <LocalizedText text={"·"} /> {formatDate(link.createdAt)}</small>
                </li>)}
              </ul>
            </Panel>
          </> : null}
        </div>
      </div> : null}

      {tab === "requirement" ? <Panel title={t("Customer requirement")} subtitle={t("Recorded by sales. Engineering conclusions live on the Technical Review tab.")}>
        <DefinitionList rows={[
          ["Current problem or situation", detail.requirement.problemStatement],
          ["What the system should do", detail.requirement.desiredCapability],
          ["Expected result", detail.requirement.expectedResult],
          ["Expected scope", detail.requirement.expectedScope],
          ["Known out of scope", detail.requirement.outOfScope],
          ["Existing process", detail.requirement.existingProcess],
          ["Current pain point", detail.requirement.currentPainPoint],
          ["Target cycle time or capacity", detail.requirement.targetCycleTime],
          ["Product / workpiece information", detail.requirement.productInformation],
          ["Quality requirement", detail.requirement.qualityRequirement],
          ["Special requirement", detail.requirement.specialRequirement],
          ["Budget range", detail.requirement.budgetRange],
          ["Expected timeline", detail.requirement.expectedTimeline],
          ["Competitor information", detail.requirement.competitorInformation],
          ["Additional notes", detail.requirement.additionalNotes],
        ]} />
      </Panel> : null}

      {tab === "machine" ? <Panel title={t("Machine and site conditions")}>
        <DefinitionList rows={[
          ["Machine name", detail.machine.machineName],
          ["Machine model", detail.machine.machineModel],
          ["Serial number", detail.machine.machineSerialNo],
          ["Manufacturer", detail.machine.manufacturer],
          ["Existing system", detail.machine.existingSystem],
          ["PLC / robot / controller brand", detail.machine.controllerBrand],
          ["Available drawing", detail.machine.availableDrawing],
          ["Utility information", detail.machine.utilityInformation],
          ["Installation area", detail.machine.installationArea],
          ["Space limitation", detail.machine.spaceLimitation],
          ["Working environment", detail.machine.workingEnvironment],
          ["Safety requirement", detail.machine.safetyRequirement],
          ["Production schedule", detail.machine.productionSchedule],
          ["Shutdown window", detail.machine.shutdownWindow],
          ["PPE requirement", detail.machine.ppeRequirement],
          ["Site access requirement", detail.machine.siteAccessRequirement],
          ["Photography restricted", detail.machine.photographyRestricted ? t("Yes") : t("No")],
          ["NDA required", detail.machine.ndaRequired ? t("Yes") : t("No")],
        ]} />
      </Panel> : null}

      {tab === "review" ? <Panel title={t("Technical review")}
        subtitle={t("Engineering's assessment. It sits beside the sales record and never replaces it.")}>
        {detail.reviews.length ? <div className="timeline">{detail.reviews.map((review) => <div className="timeline-item" key={review.id}>
          <div className="timeline-head">
            <strong>{review.reviewerName}</strong>
            <Badge tone={toneOf(review.decision)}>{review.decision}</Badge>
            <span className="muted">{formatDateTime(review.createdAt)}</span>
          </div>
          <div className="timeline-card">
            <DefinitionList rows={[
              ["Comment", review.comment],
              ["Visit scope", review.visitScope],
              ["Engineers required", String(review.engineerCount)],
              ["Estimated duration", `${Math.round(review.estimatedDurationMinutes / 60 * 10) / 10} ${t("hours")}`],
              ["Required equipment", review.requiredEquipment],
              ["Risk assessment", review.riskAssessment],
              ["Safety concern", review.safetyConcern],
              ["Manager approval required", review.requiresManagerApproval ? t("Yes") : t("No")],
              ["Manager approved", review.managerApprovedByName ? `${review.managerApprovedByName} · ${formatDateTime(review.managerApprovedAt)}` : "—"],
              ["Missing at review", review.missingInformation],
              ["Readiness at review", `${review.readinessScoreAtReview}%`],
            ]} />
          </div>
        </div>)}</div>
          : <EmptyState icon="shield" title={t("Not reviewed yet")}
            message={t("Once sales submits, a coordinator records their assessment here.")} />}
      </Panel> : null}

      {tab === "visits" ? <Panel title={t("Site visits raised from this intake")} flush>
        {detail.visits.length ? <div className="table-wrap"><table>
          <thead><tr>
            <th>{t("Visit No.")}</th><th>{t("Purpose")}</th><th>{t("Scheduled")}</th><th>{t("Engineers")}</th>
            <th>{t("Confirmed")}</th><th>{t("Report")}</th><th>{t("Status")}</th><th aria-label={uiText("Action")} />
          </tr></thead>
          <tbody>{detail.visits.map((visit) => <tr key={visit.id} className={openVisit ? "clickable" : ""}
            onClick={() => openVisit?.(visit.id)}>
            <td><strong className="mono">{visit.number}</strong></td>
            <td>{visit.visitTypeName}</td>
            <td>{visit.scheduledStart ? `${formatDateTime(visit.scheduledStart)} → ${formatTime(visit.scheduledEnd)}` : "—"}</td>
            <td>{visit.engineerNames || "—"}</td>
            <td>
              <Badge tone={visit.engineerConfirmed ? "green" : "slate"}>{t("Engineer")}</Badge>
              <Badge tone={visit.customerConfirmed ? "green" : "slate"}>{t("Customer")}</Badge>
            </td>
            <td>{visit.reportStatus ? <><Badge tone={toneOf(visit.reportStatus)}>{visit.reportStatus}</Badge>
              <Badge tone={slaTone(visit.reportSlaState)}>{t(slaLabel(visit.reportSlaState))}</Badge></> : "—"}</td>
            <td><Badge tone={toneOf(visit.status)}>{visit.status}</Badge></td>
            <td><span className="row-action"><Icon name="chevronRight" /></span></td>
          </tr>)}</tbody>
        </table></div>
          : <EmptyState icon="calendar" title={t("No site visit yet")}
            message={t("A site visit can be requested once technical review is complete.")} />}
      </Panel> : null}

      {tab === "attachments" ? <Panel title={t("Attachments")} subtitle={t("Version, uploader and time are recorded for every file")} flush>
        {detail.attachments.length ? <div className="table-wrap"><table>
          <thead><tr>
            <th>{t("File")}</th><th>{t("Category")}</th><th>{t("Description")}</th><th>{t("Version")}</th>
            <th>{t("Size")}</th><th>{t("Scan")}</th><th>{t("Uploaded by")}</th><th>{t("Uploaded at")}</th><th aria-label={uiText("Action")} />
          </tr></thead>
          <tbody>{detail.attachments.map((attachment) => <tr key={attachment.id}>
            <td><strong>{attachment.name}</strong></td>
            <td><Pill>{attachment.category}</Pill></td>
            <td className="muted">{attachment.description || "—"}</td>
            <td><LocalizedText text={"v"} />{attachment.version}</td>
            <td>{formatFileSize(attachment.sizeBytes)}</td>
            <td><Badge tone={attachment.scanStatus === "Clean" ? "green" : attachment.scanStatus === "Infected" ? "red" : "slate"}>{attachment.scanStatus}</Badge></td>
            <td>{attachment.uploadedByName}</td>
            <td className="muted">{formatDateTime(attachment.uploadedAt)}</td>
            <td><div className="row-actions">
              <button className="row-action" type="button" aria-label={t("Download")} disabled={busy} onClick={() => {
                setBusy(true);
                void downloadIntakeAttachment(detail.id, attachment.id)
                  .then(({ blob, fileName }) => {
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url; anchor.download = fileName ?? attachment.name;
                    anchor.click(); URL.revokeObjectURL(url);
                  })
                  .catch((requestError) => notify(toError(requestError)))
                  .finally(() => setBusy(false));
              }}><Icon name="download" /></button>
              {permissions.includes("intake.write") ? <button className="row-action" type="button" aria-label={t("Archive")} disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void deleteIntakeAttachment(detail.id, attachment.id)
                    .then(() => { notify(t("Attachment archived")); return load(); })
                    .catch((requestError) => notify(toError(requestError)))
                    .finally(() => setBusy(false));
                }}><Icon name="trash" /></button> : null}
            </div></td>
          </tr>)}</tbody>
        </table></div>
          : <EmptyState icon="paperclip" title={t("No attachment")} message={t("A photo of the real machine is the single most useful thing to add.")} />}
      </Panel> : null}

      {tab === "activity" ? <Panel title={t("Status history")} subtitle={t("Append-only. Every move records who, when and why.")}>
        {detail.statusHistory.length ? <div className="timeline">
          {detail.statusHistory.map((entry) => <div className="timeline-item" key={entry.id}>
            <div className="timeline-head">
              <strong>{entry.previousStatus ? `${t(entry.previousStatus)} → ${t(entry.newStatus)}` : t(entry.newStatus)}</strong>
              <span className="muted">{entry.changedByName} <LocalizedText text={"·"} /> {formatDateTime(entry.changedAt)}</span>
            </div>
            {entry.reason ? <div className="timeline-card">{entry.reason}</div> : null}
          </div>)}
        </div> : <EmptyState icon="clock" title={t("No history yet")} message={t("Status changes appear here.")} />}
      </Panel> : null}
    </div>

    {statusTarget ? <Modal
      title={`${t("Change status to")} ${t(statusTarget)}`}
      subtitle={detail.number}
      onClose={() => setStatusTarget(null)}
      footer={<>
        <button className="btn default" type="button" onClick={() => setStatusTarget(null)}>{t("Cancel")}</button>
        <button className="btn primary" type="button" disabled={busy} onClick={() => { void applyStatus(); }}>
          <Icon name="check" />{busy ? t("Working…") : t("Confirm")}
        </button>
      </>}
    >
      <p>{t("This is recorded in the append-only status history with your name and the time.")}</p>
      {statusTarget === "Pending Technical Review" && !detail.readiness.canSubmit ? <div className="callout error" role="alert">
        <Icon name="alertTriangle" />
        <span><strong>{t("Mandatory information is still missing")}</strong>
          {detail.readiness.checks.filter((check) => !check.passed && check.severity === "blocker").map((check) => t(check.label)).join(" · ")}</span>
      </div> : null}
      <Field label={t("Reason / comment")} hint={t("Required when returning, holding or cancelling")}>
        <textarea rows={3} maxLength={4000} value={statusReason} onChange={(event) => setStatusReason(event.target.value)} />
      </Field>
    </Modal> : null}

    {reviewOpen ? <TechnicalReviewDrawer
      detail={detail}
      master={master.data}
      onClose={() => setReviewOpen(false)}
      onDone={async (message) => { notify(message); setReviewOpen(false); await load(); }}
    /> : null}

    {scheduleOpen ? <RequestVisitDrawer
      detail={detail}
      master={master.data}
      onClose={() => setScheduleOpen(false)}
      onDone={async (message, visitId) => { notify(message); setScheduleOpen(false); await load(); openVisit?.(visitId); }}
    /> : null}
  </>;
}

function TechnicalReviewDrawer({ detail, master, onClose, onDone }: {
  detail: SalesIntakeDetail;
  master: VisitMasterData | null;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [decision, setDecision] = useState("Ready to Schedule");
  const [comment, setComment] = useState("");
  const [visitScope, setVisitScope] = useState("");
  const [engineerCount, setEngineerCount] = useState(1);
  const [durationHours, setDurationHours] = useState(4);
  const [equipment, setEquipment] = useState("");
  const [risk, setRisk] = useState("");
  const [safety, setSafety] = useState(detail.machine.safetyRequirement);
  const [managerApproval, setManagerApproval] = useState(false);
  const [skillIds, setSkillIds] = useState<number[]>(
    detail.skills.filter((skill) => skill.source === "Coordinator").length > 0
      ? detail.skills.filter((skill) => skill.source === "Coordinator").map((skill) => skill.skillId)
      : detail.skills.filter((skill) => skill.source === "Sales").map((skill) => skill.skillId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await submitTechnicalReview(detail.id, {
        decision, comment: comment || undefined, visitScope: visitScope || undefined,
        engineerCount, estimatedDurationMinutes: Math.round(durationHours * 60),
        requiredEquipment: equipment || undefined, riskAssessment: risk || undefined,
        safetyConcern: safety || undefined, requiresManagerApproval: managerApproval,
        skillIds, rowVersion: detail.rowVersion,
      });
      await onDone(`${detail.number} · ${t(decision)}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Drawer
    title={t("Technical review")}
    subtitle={`${detail.number} · ${detail.subject}`}
    width={620}
    onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? t("Saving…") : t("Record review")}
      </button>
    </>}
  >
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="callout" role="note">
      <Icon name="alertCircle" />
      <span><strong>{t("Readiness")} {detail.readinessScore}%</strong>
        {detail.readiness.checks.filter((check) => !check.passed).map((check) => t(check.label)).join(" · ") || t("Everything is present.")}</span>
    </div>
    <Field label={t("Decision")}>
      <select value={decision} onChange={(event) => setDecision(event.target.value)}>
        {["Ready to Schedule", "More Information Required", "On Hold", "Cancelled", "Comment"].map((value) => <option key={value} value={value}>{t(value)}</option>)}
      </select>
    </Field>
    <Field label={t("Comment")} hint={t("Required when returning, holding or cancelling — say exactly what is missing")}>
      <textarea rows={3} maxLength={20000} value={comment} onChange={(event) => setComment(event.target.value)} />
    </Field>
    <Field label={t("Visit scope")}><textarea rows={3} maxLength={20000} value={visitScope} onChange={(event) => setVisitScope(event.target.value)} /></Field>
    <div className="form-grid">
      <Field label={t("Engineers required")}><input type="number" min={1} max={20} value={engineerCount} onChange={(event) => setEngineerCount(Number(event.target.value))} /></Field>
      <Field label={t("Estimated duration (hours)")}><input type="number" min={0.5} max={168} step={0.5} value={durationHours} onChange={(event) => setDurationHours(Number(event.target.value))} /></Field>
    </div>
    <Field label={t("Required equipment")}><textarea rows={2} maxLength={20000} value={equipment} onChange={(event) => setEquipment(event.target.value)} /></Field>
    <Field label={t("Risk assessment")}><textarea rows={2} maxLength={20000} value={risk} onChange={(event) => setRisk(event.target.value)} /></Field>
    <Field label={t("Safety concern")}><textarea rows={2} maxLength={20000} value={safety} onChange={(event) => setSafety(event.target.value)} /></Field>
    <Field label={t("Skill requirement")} hint={t("Correcting this does not erase what sales asked for")}>
      <div className="chip-select">
        {(master?.skills ?? []).filter((skill) => skill.isActive).map((skill) => <button
          key={skill.id} type="button" aria-pressed={skillIds.includes(skill.id)}
          className={skillIds.includes(skill.id) ? "chip on" : "chip"}
          onClick={() => setSkillIds((current) => current.includes(skill.id)
            ? current.filter((value) => value !== skill.id) : [...current, skill.id])}
        >{skill.nameEn}</button>)}
      </div>
    </Field>
    <label className="checkbox-row">
      <input type="checkbox" checked={managerApproval} onChange={(event) => setManagerApproval(event.target.checked)} />
      <span>{t("This visit needs manager approval before it is scheduled")}</span>
    </label>
  </Drawer>;
}

function RequestVisitDrawer({ detail, master, onClose, onDone }: {
  detail: SalesIntakeDetail;
  master: VisitMasterData | null;
  onClose: () => void;
  onDone: (message: string, visitId: number) => Promise<void>;
}) {
  const t = useT();
  const latestReview = detail.reviews[0];
  const preferredWindow = detail.windows[0];
  const [visitTypeId, setVisitTypeId] = useState(detail.purposes[0]?.visitTypeId ?? master?.visitTypes[0]?.id ?? 0);
  const [start, setStart] = useState(toLocalInput(preferredWindow?.startsAt ?? new Date(`${futureDate(7)}T09:00:00`).toISOString()));
  const [durationHours, setDurationHours] = useState((latestReview?.estimatedDurationMinutes ?? 240) / 60);
  const [travelBefore, setTravelBefore] = useState(60);
  const [travelAfter, setTravelAfter] = useState(60);
  const [engineerCount, setEngineerCount] = useState(latestReview?.engineerCount ?? 1);
  const [meetingPoint, setMeetingPoint] = useState(detail.contact.siteAddress);
  const [equipment, setEquipment] = useState(latestReview?.requiredEquipment ?? "");
  const [internalNote, setInternalNote] = useState(latestReview?.visitScope ?? "");
  const [customerNote, setCustomerNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const startsAt = fromLocalInput(start);
      const endsAt = new Date(new Date(startsAt).getTime() + durationHours * 3_600_000).toISOString();
      const created = await createSiteVisit({
        intakeId: detail.id, visitTypeId,
        proposedWindowId: preferredWindow?.id ?? null,
        scheduledStart: startsAt, scheduledEnd: endsAt,
        travelMinutesBefore: travelBefore, travelMinutesAfter: travelAfter,
        meetingPoint, requiredEquipment: equipment, internalNote, customerNote,
        requiredEngineerCount: engineerCount,
      });
      await onDone(`${created.number} ${t("created")}`, created.id);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Drawer
    title={t("Request a site visit")}
    subtitle={`${detail.number} · ${detail.contact.siteName || detail.customerName}`}
    width={560}
    onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy || !visitTypeId} onClick={() => { void submit(); }}>
        <Icon name="calendar" />{busy ? t("Creating…") : t("Create site visit")}
      </button>
    </>}
  >
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <Field label={t("Visit purpose")}>
      <select value={visitTypeId} onChange={(event) => setVisitTypeId(Number(event.target.value))}>
        {(master?.visitTypes ?? []).filter((type) => type.isActive).map((type) => <option key={type.id} value={type.id}>{type.nameEn}</option>)}
      </select>
    </Field>
    {preferredWindow ? <div className="callout" role="note">
      <Icon name="calendar" />
      <span><strong>{t("Customer's preferred window")}</strong>{formatDateTime(preferredWindow.startsAt)} → {formatDateTime(preferredWindow.endsAt)}</span>
    </div> : null}
    <div className="form-grid">
      <Field label={t("Start")}><input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
      <Field label={t("Duration (hours)")}><input type="number" min={0.5} max={72} step={0.5} value={durationHours} onChange={(event) => setDurationHours(Number(event.target.value))} /></Field>
      <Field label={t("Travel before (min)")}><input type="number" min={0} max={1440} value={travelBefore} onChange={(event) => setTravelBefore(Number(event.target.value))} /></Field>
      <Field label={t("Travel after (min)")}><input type="number" min={0} max={1440} value={travelAfter} onChange={(event) => setTravelAfter(Number(event.target.value))} /></Field>
      <Field label={t("Engineers required")}><input type="number" min={1} max={20} value={engineerCount} onChange={(event) => setEngineerCount(Number(event.target.value))} /></Field>
    </div>
    <Field label={t("Meeting point")}><textarea rows={2} maxLength={500} value={meetingPoint} onChange={(event) => setMeetingPoint(event.target.value)} /></Field>
    <Field label={t("Required equipment")}><textarea rows={2} maxLength={20000} value={equipment} onChange={(event) => setEquipment(event.target.value)} /></Field>
    <Field label={t("Internal note")} hint={t("Never shown to the customer")}><textarea rows={2} maxLength={20000} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /></Field>
    <Field label={t("Customer-facing note")}><textarea rows={2} maxLength={20000} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} /></Field>
  </Drawer>;
}

/* ==========================================================================
   2 — Site Visit workspace
   ========================================================================== */

const EMPTY_VISIT_PAGE: PagedResult<SiteVisitSummary> = { items: [], page: 1, pageSize: 10, total: 0 };

export function ProductionSiteVisits(props: Props & { initialVisitId?: number | null }) {
  const t = useT();
  const [tab, setTab] = useState<"requests" | "calendar" | "dashboard" | "preparation">("requests");
  const [openId, setOpenId] = useState<number | null>(props.initialVisitId ?? null);
  const canRead = props.bootstrap.permissions.includes("visit.read");

  if (!canRead) return <NoPermission what="'visit.read'" />;
  if (openId) return <SiteVisitDetailScreen {...props} id={openId} onBack={() => setOpenId(null)} />;

  return <>
    <Tabs
      tabs={[
        { id: "requests", label: t("Site Visit Requests") },
        ...(props.bootstrap.permissions.includes("intake.read") ? [{ id: "preparation" as const, label: "คำขอ / ตรวจข้อมูล" }] : []),
        { id: "calendar", label: t("Engineer Availability Calendar") },
        { id: "dashboard", label: t("Engineering Dashboard") },
      ]}
      active={tab}
      onChange={setTab}
    />
    <div style={{ marginTop: 14 }}>
      {tab === "requests" ? <VisitList {...props} onOpen={setOpenId} /> : null}
      {tab === "preparation" ? <ProductionSalesIntake {...props} openVisit={setOpenId} /> : null}
      {tab === "calendar" ? <VisitCalendar {...props} onOpen={setOpenId} /> : null}
      {tab === "dashboard" ? <EngineeringDashboard {...props} onOpen={setOpenId} /> : null}
    </div>
  </>;
}

function VisitList({ bootstrap, onOpen }: Props & { onOpen: (id: number) => void }) {
  const uiText = useUiText();
  const t = useT();
  const master = useMasterData(true);
  const [result, setResult] = useState(EMPTY_VISIT_PAGE);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [customer, setCustomer] = useState("All customers");
  const [engineer, setEngineer] = useState("All engineers");
  const [unassigned, setUnassigned] = useState(false);
  const [reportOverdue, setReportOverdue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const customerId = bootstrap.customers.find((item) => item.code === customer)?.id;
  const engineerId = bootstrap.team.find((item) => item.name === engineer)?.id;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setResult(await listSiteVisits({
        page, pageSize, search,
        status: status === "All status" ? undefined : status,
        customerId, engineerId,
        unassigned: unassigned || undefined,
        reportOverdue: reportOverdue || undefined,
      }));
    } catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [page, pageSize, search, status, customerId, engineerId, unassigned, reportOverdue]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 220); return () => window.clearTimeout(timer); }, [load]);
  const pageCount = Math.max(1, Math.ceil(result.total / Math.max(1, result.pageSize)));
  const resetPage = () => setPage(1);

  return <>
    <PageHeader eyebrow="ENGINEERING" title={t("Site Visit Requests")}
      subtitle={t("Every requested, scheduled and completed visit, with who is going and whether the report has landed.")} />
    <Toolbar>
      <div style={{ minWidth: 300, flex: 1 }}>
        <label className="search-field">
          <Icon name="search" />
          <input maxLength={200} value={search} placeholder={t("Search visit no., intake no., subject or customer…")}
            onChange={(event) => { setSearch(event.target.value); resetPage(); }} />
          {search ? <button type="button" onClick={() => setSearch("")} aria-label={t("Clear search")}><Icon name="x" /></button> : null}
        </label>
      </div>
      <Select label={t("Status")} value={status} onChange={(value) => { setStatus(value); resetPage(); }} options={["All status", ...VISIT_STATUSES]} />
      <Select label={t("Customer")} value={customer} onChange={(value) => { setCustomer(value); resetPage(); }}
        options={["All customers", ...bootstrap.customers.map((item) => item.code)]} />
      <Select label={t("Engineer")} value={engineer} onChange={(value) => { setEngineer(value); resetPage(); }}
        options={["All engineers", ...bootstrap.team.map((item) => item.name)]} />
      <button className={unassigned ? "btn primary" : "btn ghost"} type="button" onClick={() => { setUnassigned((value) => !value); resetPage(); }}>
        <Icon name="users" />{t("Unassigned")}
      </button>
      <button className={reportOverdue ? "btn primary" : "btn ghost"} type="button" onClick={() => { setReportOverdue((value) => !value); resetPage(); }}>
        <Icon name="alertTriangle" />{t("Report overdue")}
      </button>
    </Toolbar>
    <StatusLegend items={VISIT_STATUSES.map((label) => ({ label }))} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    {master.error ? <LoadError message={master.error} retry={() => { void master.reload(); }} /> : null}
    <Panel title={`${result.total} ${t("site visits")}`} flush>
      <GridControls hideSearch pageSize={pageSize} onPageSize={(size) => { setPageSize(size); setPage(1); }}
        search={search} onSearch={(value) => { setSearch(value); setPage(1); }} />
      {result.items.length ? <div className="table-wrap"><table>
        <thead><tr>
          <th>{t("Visit No.")}</th><th>{t("Intake")}</th><th>{t("Customer / Site")}</th><th>{t("Purpose")}</th>
          <th>{t("Scheduled")}</th><th>{t("Team")}</th><th>{t("Skill match")}</th><th>{t("Confirmed")}</th>
          <th>{t("Report SLA")}</th><th>{t("Status")}</th><th aria-label={uiText("Action")} />
        </tr></thead>
        <tbody>{result.items.map((visit) => <tr key={visit.id} className="clickable" onClick={() => onOpen(visit.id)}>
          <td><strong className="mono">{visit.number}</strong></td>
          <td className="mono muted">{visit.intakeNumber}</td>
          <td><div className="cell-primary"><strong>{visit.customerName}</strong><span>{visit.siteName || visit.subject}</span></div></td>
          <td>{visit.visitTypeName}</td>
          <td>{visit.scheduledStart ? <>{formatDate(visit.scheduledStart)}<br /><small className="muted">{formatTime(visit.scheduledStart)} – {formatTime(visit.scheduledEnd)}</small></> : <span className="muted">{t("Not scheduled")}</span>}</td>
          <td>{visit.engineerNames || <Badge tone="red">{t("Unassigned")}</Badge>}
            <small className="muted"> {visit.acceptedCount}<LocalizedText text={"of"} />{visit.assignedCount} {t("accepted")}</small></td>
          <td><Badge tone={matchTone(visit.skillMatchPercent)}>{`${visit.skillMatchPercent}%`}</Badge></td>
          <td>
            <Badge tone={visit.engineerConfirmed ? "green" : "slate"}><LocalizedText text={"E"} /></Badge>
            <Badge tone={visit.customerConfirmed ? "green" : "slate"}><LocalizedText text={"C"} /></Badge>
          </td>
          <td><Badge tone={slaTone(visit.reportSlaState)}>{t(slaLabel(visit.reportSlaState))}</Badge></td>
          <td><Badge tone={toneOf(visit.status)}>{visit.status}</Badge></td>
          <td><span className="row-action"><Icon name="chevronRight" /></span></td>
        </tr>)}</tbody>
      </table>
        <Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1}
          to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} />
      </div>
        : loading ? <Loading />
          : <EmptyState icon="calendar" title={t("No site visit matches the filter")}
            message={t("A visit is created from an intake once technical review is complete.")} />}
    </Panel>
  </>;
}

/* --------------------------------------------------------------------------
   Calendar. Month, week and day are the same data grouped differently; the
   engineer view is the week grouped by person, which is what a coordinator
   actually stares at when placing a job.
   -------------------------------------------------------------------------- */

function VisitCalendar({ bootstrap, onOpen }: Props & { onOpen: (id: number) => void }) {
  const t = useT();
  const [view, setView] = useState<"month" | "week" | "day" | "engineer">("month");
  const [anchor, setAnchor] = useState(() => today());
  const [engineer, setEngineer] = useState("All engineers");
  const [data, setData] = useState<CalendarResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const engineerId = bootstrap.team.find((item) => item.name === engineer)?.id;

  const range = useMemo(() => {
    const base = new Date(`${anchor}T00:00:00`);
    if (view === "day") return { from: anchor, to: anchor, days: 1 };
    if (view === "week" || view === "engineer") {
      const start = new Date(base);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { from: businessDate(start), to: businessDate(end), days: 7 };
    }
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { from: businessDate(start), to: businessDate(end), days: end.getDate() };
  }, [anchor, view]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await loadVisitCalendar({ from: range.from, to: range.to, engineerId })); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [range.from, range.to, engineerId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const shift = (direction: number) => {
    const base = new Date(`${anchor}T00:00:00`);
    if (view === "day") base.setDate(base.getDate() + direction);
    else if (view === "week" || view === "engineer") base.setDate(base.getDate() + direction * 7);
    else base.setMonth(base.getMonth() + direction);
    setAnchor(businessDate(base));
  };

  const days = useMemo(() => {
    const list: string[] = [];
    const start = new Date(`${range.from}T00:00:00`);
    const end = new Date(`${range.to}T00:00:00`);
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) list.push(businessDate(cursor));
    return list;
  }, [range.from, range.to]);

  const visitsByDay = useMemo(() => {
    const map = new Map<string, typeof data extends null ? never : NonNullable<typeof data>["visits"]>();
    for (const visit of data?.visits ?? []) {
      const key = businessDate(new Date(visit.startsAt));
      const list = map.get(key) ?? [];
      list.push(visit);
      map.set(key, list);
    }
    return map;
  }, [data]);

  const engineersInView = useMemo(() => {
    const ids = new Set<number>();
    for (const visit of data?.visits ?? []) visit.engineerIds.forEach((value) => ids.add(value));
    for (const block of data?.unavailable ?? []) ids.add(block.userId);
    return bootstrap.team.filter((member) => ids.has(member.id));
  }, [data, bootstrap.team]);

  return <>
    <PageHeader eyebrow="SCHEDULING" title={t("Engineer Availability Calendar")}
      subtitle={t("Colour follows the visit status, so an unconfirmed appointment never looks like a firm one.")} />
    <Toolbar>
      <div className="seg-control" role="group" aria-label={t("Calendar view")}>
        {(["month", "week", "day", "engineer"] as const).map((value) => <button key={value} type="button"
          className={view === value ? "active" : ""} aria-pressed={view === value} onClick={() => setView(value)}>
          {t(value === "month" ? "Month" : value === "week" ? "Week" : value === "day" ? "Day" : "By engineer")}
        </button>)}
      </div>
      <button className="btn ghost" type="button" onClick={() => shift(-1)} aria-label={t("Previous")}><Icon name="chevronLeft" /></button>
      <label className="btn ghost"><Icon name="calendar" /><input aria-label={t("Anchor date")} type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} /></label>
      <button className="btn ghost" type="button" onClick={() => shift(1)} aria-label={t("Next")}><Icon name="chevronRight" /></button>
      <button className="btn ghost" type="button" onClick={() => setAnchor(today())}>{t("Today")}</button>
      <Select label={t("Engineer")} value={engineer} onChange={setEngineer} options={["All engineers", ...bootstrap.team.map((item) => item.name)]} />
    </Toolbar>
    <StatusLegend items={[
      { label: "Tentative" }, { label: "Pending Engineer Confirmation" }, { label: "Pending Customer Confirmation" },
      { label: "Confirmed" }, { label: "In Progress" }, { label: "Cancelled" },
    ]} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${formatDate(range.from)} — ${formatDate(range.to)}`}
      subtitle={`${data?.visits.length ?? 0} ${t("visits")} · ${data?.unavailable.length ?? 0} ${t("unavailable periods")}`}>
      {loading ? <Loading /> : view === "engineer" ? <div className="table-wrap"><table className="visit-grid">
        <thead><tr><th>{t("Engineer")}</th>{days.map((day) => <th key={day}>{formatDate(day)}</th>)}</tr></thead>
        <tbody>{engineersInView.length ? engineersInView.map((member) => <tr key={member.id}>
          <th scope="row">{member.name}<small className="muted">{member.department}</small></th>
          {days.map((day) => {
            const cellVisits = (visitsByDay.get(day) ?? []).filter((visit) => visit.engineerIds.includes(member.id));
            const blocks = (data?.unavailable ?? []).filter((block) => block.userId === member.id
              && businessDate(new Date(block.startsAt)) <= day && businessDate(new Date(block.endsAt)) >= day);
            return <td key={day}>
              {blocks.map((block) => <span className="cal-block" key={block.id} title={block.reason}>{t(block.kind)}</span>)}
              {cellVisits.map((visit) => <button key={visit.visitId} type="button"
                className={`cal-chip ${toneOf(visit.status)}`} onClick={() => onOpen(visit.visitId)}
                title={`${visit.visitNumber} · ${visit.customerName} · ${visit.status}`}>
                {formatTime(visit.startsAt)} {visit.visitNumber}
              </button>)}
            </td>;
          })}
        </tr>) : <tr><td colSpan={days.length + 1}><p className="muted">{t("Nobody is booked in this range.")}</p></td></tr>}</tbody>
      </table></div> : <div className={`cal-grid ${view}`}>
        {days.map((day) => {
          const cellVisits = visitsByDay.get(day) ?? [];
          const blocks = (data?.unavailable ?? []).filter((block) =>
            businessDate(new Date(block.startsAt)) <= day && businessDate(new Date(block.endsAt)) >= day);
          return <div className={`cal-day${day === today() ? " today" : ""}`} key={day}>
            <div className="cal-day-head"><strong>{new Date(`${day}T00:00:00`).getDate()}</strong>
              <span className="muted">{new Intl.DateTimeFormat(currentLocale(), { weekday: "short" }).format(new Date(`${day}T00:00:00`))}</span></div>
            {blocks.map((block) => <span className="cal-block" key={block.id} title={`${block.userName} · ${block.reason}`}>
              {block.userName} <LocalizedText text={"·"} /> {t(block.kind)}
            </span>)}
            {cellVisits.map((visit) => <button key={visit.visitId} type="button"
              className={`cal-chip ${toneOf(visit.status)}`} onClick={() => onOpen(visit.visitId)}
              title={`${visit.visitNumber} · ${visit.customerName} · ${visit.engineerNames}`}>
              <strong>{formatTime(visit.startsAt)}</strong> {visit.visitNumber}
              <small>{visit.customerName}</small>
            </button>)}
          </div>;
        })}
      </div>}
    </Panel>
  </>;
}

function EngineeringDashboard({ onOpen }: Props & { onOpen: (id: number) => void }) {
  const t = useT();
  const [data, setData] = useState<EngineeringVisitDashboard | null>(null);
  const [management, setManagement] = useState<ManagementVisitDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setData(await loadEngineeringVisitDashboard());
      // Management figures need report.read as well; a coordinator without it
      // still gets the engineering half rather than an error page.
      try { setManagement(await loadManagementVisitDashboard()); } catch { setManagement(null); }
    } catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  if (error) return <LoadError message={error} retry={() => { void load(); }} />;
  if (loading || !data) return <Loading />;
  const maxWorkload = Math.max(1, ...data.workloadByEngineer.map((row) => row.value));
  const maxDemand = Math.max(1, ...data.skillDemand.map((row) => row.value));

  return <>
    <PageHeader eyebrow="ENGINEERING" title={t("Engineering Dashboard")}
      subtitle={t("What is unassigned, what is unconfirmed, and which report is late.")} />
    <div className="kpi-grid">
      <KpiCard label={t("Waiting for assignment")} value={String(data.awaitingAssignment)} icon="users" tone={data.awaitingAssignment ? "red" : "slate"} />
      <KpiCard label={t("Waiting for confirmation")} value={String(data.awaitingConfirmation)} icon="clock" tone={data.awaitingConfirmation ? "amber" : "slate"} />
      <KpiCard label={t("Visits today")} value={String(data.visitsToday)} icon="calendar" tone="blue" />
      <KpiCard label={t("Visits this week")} value={String(data.visitsThisWeek)} icon="calendar" />
      <KpiCard label={t("Conflict overrides")} value={String(data.scheduleConflicts)} icon="alertTriangle" tone={data.scheduleConflicts ? "amber" : "slate"} />
      <KpiCard label={t("Reports overdue")} value={String(data.reportsOverdue)} icon="file" tone={data.reportsOverdue ? "red" : "green"} />
    </div>
    <div className="grid-2" style={{ marginTop: 14 }}>
      <Panel title={t("Workload by engineer")} subtitle={t("Active assignments, excluding cancelled and closed visits")}>
        {data.workloadByEngineer.length ? <div className="hbar-list">
          {data.workloadByEngineer.map((row) => <div className="hbar-top" key={row.label}>
            <span>{row.label}</span>
            <span className="hbar-track"><i style={{ width: `${(row.value / maxWorkload) * 100}%` }} /></span>
            <strong>{row.value}</strong>
          </div>)}
        </div> : <EmptyState icon="users" title={t("Nobody assigned yet")} message={t("Assignments appear here as soon as engineers are placed.")} />}
      </Panel>
      <Panel title={t("Skill demand")} subtitle={t("What open intakes are asking for")}>
        {data.skillDemand.length ? <div className="hbar-list">
          {data.skillDemand.map((row) => <div className="hbar-top" key={row.label}>
            <span>{row.label}</span>
            <span className="hbar-track"><i style={{ width: `${(row.value / maxDemand) * 100}%` }} /></span>
            <strong>{row.value}</strong>
          </div>)}
        </div> : <EmptyState icon="cpu" title={t("No skill requested yet")} message={t("Skills appear once intakes name them.")} />}
      </Panel>
    </div>
    <div style={{ height: 14 }} />
    <Panel title={t("Needs attention")} subtitle={t("Unassigned, awaiting confirmation, or with an overdue report")} flush>
      {data.attention.length ? <div className="table-wrap"><table>
        <thead><tr><th>{t("Visit No.")}</th><th>{t("Customer")}</th><th>{t("Scheduled")}</th><th>{t("Team")}</th><th>{t("Report SLA")}</th><th>{t("Status")}</th></tr></thead>
        <tbody>{data.attention.map((visit) => <tr key={visit.id} className="clickable" onClick={() => onOpen(visit.id)}>
          <td><strong className="mono">{visit.number}</strong></td>
          <td>{visit.customerName}</td>
          <td>{visit.scheduledStart ? formatDateTime(visit.scheduledStart) : "—"}</td>
          <td>{visit.engineerNames || <Badge tone="red">{t("Unassigned")}</Badge>}</td>
          <td><Badge tone={slaTone(visit.reportSlaState)}>{t(slaLabel(visit.reportSlaState))}</Badge></td>
          <td><Badge tone={toneOf(visit.status)}>{visit.status}</Badge></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon="checkCircle" title={t("Nothing outstanding")} message={t("Every visit is assigned, confirmed and reported.")} />}
    </Panel>
    {management ? <>
      <div style={{ height: 14 }} />
      <Panel title={t("Management view")} subtitle={t("Conversion and service level across the whole book")}>
        <div className="summary-strip">
          <SummaryTile label={t("Intakes")} value={String(management.totalIntakes)} />
          <SummaryTile label={t("Site visits")} value={String(management.totalVisits)} />
          <SummaryTile label={t("Lead time to confirmed")} value={`${management.averageLeadTimeDays.toFixed(1)} ${t("days")}`} />
          <SummaryTile label={t("Completion rate")} value={`${management.completionRatePercent.toFixed(0)}%`} tone="green" />
          <SummaryTile label={t("Report SLA compliance")} value={`${management.reportSlaCompliancePercent.toFixed(0)}%`}
            tone={management.reportSlaCompliancePercent >= 90 ? "green" : management.reportSlaCompliancePercent >= 70 ? "amber" : "red"} />
          <SummaryTile label={t("Visit → estimate")} value={`${management.visitToEstimateConversionPercent.toFixed(0)}%`} tone="blue" />
          <SummaryTile label={t("Visit → project")} value={`${management.visitToProjectConversionPercent.toFixed(0)}%`} tone="blue" />
          <SummaryTile label={t("Cancelled")} value={`${management.cancelledRatePercent.toFixed(0)}%`} tone={management.cancelledRatePercent > 10 ? "red" : "slate"} />
          <SummaryTile label={t("Rescheduled")} value={`${management.rescheduledRatePercent.toFixed(0)}%`} tone={management.rescheduledRatePercent > 25 ? "amber" : "slate"} />
          <SummaryTile label={t("Customer no-show")} value={`${management.noShowRatePercent.toFixed(0)}%`} tone={management.noShowRatePercent > 5 ? "red" : "slate"} />
        </div>
        <div className="grid-3" style={{ marginTop: 14 }}>
          {([
            [t("By customer"), management.byCustomer],
            [t("By sales owner"), management.bySalesOwner],
            [t("By engineer"), management.byEngineer],
            [t("By department"), management.byDepartment],
            [t("By visit type"), management.byVisitType],
          ] as [string, { label: string; value: number }[]][]).map(([title, rows]) => <div key={title}>
            <div className="form-section-title">{title}</div>
            {rows.length ? <ul className="link-list">{rows.slice(0, 8).map((row) => <li key={row.label}>
              <span>{row.label}</span><strong>{row.value}</strong>
            </li>)}</ul> : <p className="muted">{t("No data")}</p>}
          </div>)}
        </div>
      </Panel>
    </> : null}
  </>;
}

/* --------------------------------------------------------------------------
   Site visit detail
   -------------------------------------------------------------------------- */

type VisitTab = "overview" | "assignment" | "schedule" | "brief" | "execution" | "report" | "links" | "activity";

function SiteVisitDetailScreen({ bootstrap, notify, id, onBack, openInquiry }: Props & { id: number; onBack: () => void }) {
  const [parentIntake, setParentIntake] = useState<SalesIntakeDetail | null>(null);
  const t = useT();
  const [visit, setVisit] = useState<SiteVisitDetail | null>(null);
  const [tab, setTab] = useState<VisitTab>("overview");
  const initialStageSet = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const permissions = bootstrap.permissions;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const loaded = await loadSiteVisit(id);
      setVisit(loaded);
      if (!initialStageSet.current) {
        setTab(loaded.report ? "report" : loaded.status === "In Progress" ? "execution" : "overview");
        initialStageSet.current = true;
      }
      if (bootstrap.permissions.includes("intake.read")) setParentIntake(await loadSalesIntake(loaded.intakeId));
    }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [id, bootstrap.permissions]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const applyStatus = async () => {
    if (!visit || !statusTarget) return;
    setBusy(true);
    try {
      await changeVisitStatus(visit.id, { status: statusTarget, reason: statusReason || undefined, rowVersion: visit.rowVersion });
      notify(`${visit.number} → ${t(statusTarget)}`);
      setStatusTarget(null); setStatusReason("");
      await load();
    } catch (requestError) { notify(toError(requestError)); }
    finally { setBusy(false); }
  };

  const createEstimate = async () => {
    if (!visit) return;
    setBusy(true);
    try {
      const result = await createEstimateFromVisit(visit.id);
      notify(result.message ?? `${result.number} ${result.created ? t("created") : t("linked")}`);
      await load();
    } catch (requestError) { notify(toError(requestError)); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  if (error) return <LoadError message={error} retry={() => { void load(); }} />;
  if (!visit) return <EmptyState icon="calendar" title={t("Not found")} message={t("This site visit no longer exists.")} />;

  const canSchedule = permissions.includes("visit.schedule");
  const canLink = permissions.includes("visit.link");
  const hasApprovedReport = visit.report?.status === "Approved" || visit.report?.status === "Acknowledged";
  const inquiryId = parentIntake?.relatedInquiryId ?? visit.links.find((link) => link.targetType === "Inquiry")?.targetId;
  const preparing = ["overview", "assignment", "schedule", "brief"].includes(tab);
  const canPrepare = canSchedule && !["Completed", "Closed", "Cancelled", "In Progress", "Report Pending", "Report Under Review"].includes(visit.status);
  const reportWaiting = visit.report && ["Submitted", "Under Review"].includes(visit.report.status);

  return <>
    <button className="back-link" type="button" onClick={onBack}><Icon name="arrowLeft" />{t("Site Visit Requests")}</button>
    <PageHeader
      eyebrow={`${visit.customerName} · ${visit.intakeNumber}`}
      title={`${visit.number} · ${visit.visitTypeName}`}
      subtitle={`${visit.siteName || t("Site not named")} · ${visit.intakeSubject}`}
      meta={<>
        <Badge tone={toneOf(visit.status)}>{visit.status}</Badge>
        <Badge tone={matchTone(visit.teamSkillMatchPercent)}>{`${t("Skill match")} ${visit.teamSkillMatchPercent}%`}</Badge>
        <Badge tone={visit.engineerConfirmedAt ? "green" : "slate"}>{t("Engineer confirmed")}</Badge>
        <Badge tone={visit.customerConfirmedAt ? "green" : "slate"}>{t("Customer confirmed")}</Badge>
        {visit.reportDueAt ? <Badge tone={slaTone(visit.reportSlaState)}>{`${t("Report")} ${t(slaLabel(visit.reportSlaState))}`}</Badge> : null}
      </>}
      actions={<>
        {canPrepare && preparing ? <button className="btn default" type="button" onClick={() => setAssignOpen(true)}><Icon name="users" />{t("Assign engineer")}</button> : null}
        {canPrepare && preparing ? <button className="btn default" type="button" onClick={() => setRescheduleOpen(true)}><Icon name="calendar" />{t("Reschedule")}</button> : null}
        {canPrepare && preparing ? <button className="btn default" type="button" onClick={() => setConfirmOpen(true)}><Icon name="checkCircle" />{t("Record confirmation")}</button> : null}
        {inquiryId && openInquiry && permissions.includes("inquiry.read") ? <button className="btn primary" type="button" onClick={() => openInquiry(inquiryId)}><Icon name="inbox" /><LocalizedText text={"กลับ Inquiry · ทำ Estimate ต่อ"} /></button> : null}
        {canLink && permissions.includes("inquiry.write") && !inquiryId && hasApprovedReport ? <button className="btn primary" type="button" onClick={() => setInquiryOpen(true)}><Icon name="arrowRight" /><LocalizedText text={"สร้าง Inquiry สำหรับรายการเดิม"} /></button> : null}
        {canLink && permissions.includes("estimate.write") && visit.links.some((link) => link.targetType === "Inquiry") && !openInquiry ? <button className="btn primary" type="button" disabled={busy} onClick={() => { void createEstimate(); }}><Icon name="file" />{t("Create estimate")}</button> : null}
        {canSchedule && visit.allowedTransitions.includes("Closed") ? <button className="btn ghost" type="button" onClick={() => setCloseOpen(true)}><Icon name="lock" />{t("Close visit")}</button> : null}
        {visit.allowedTransitions.some((target) => target !== "Closed") ? <details className="visit-action-menu"><summary><LocalizedText text={"จัดการสถานะ"} /></summary>{visit.allowedTransitions.filter((target) => target !== "Closed").map((target) => <button key={target} className="btn ghost" type="button"
          onClick={() => { setStatusTarget(target); setStatusReason(""); }}>{t(target)}</button>)}</details> : null}
      </>}
    />
    <div className="visit-stage-guide" role="status">
      <Icon name={hasApprovedReport ? "checkCircle" : "arrowRight"} />
      <div><strong>{visit.status === "Cancelled" ? "ยกเลิกการเข้าหน้างานแล้ว" : hasApprovedReport ? "รายงานอนุมัติแล้ว" : reportWaiting ? "รอผู้ตรวจพิจารณารายงาน" : visit.report ? "ขั้นตอนถัดไป: สรุปผลและส่งตรวจ" : visit.checkedInAt ? "ขั้นตอนถัดไป: เก็บข้อมูลให้ครบ แล้วเช็กเอาต์" : "ขั้นตอนถัดไป: ตรวจนัดหมายและทีมก่อนเข้าหน้างาน"}</strong>
      <span>{visit.status === "Cancelled" ? "เปิดอ่านรายละเอียดและประวัติได้" : hasApprovedReport ? "เปิดขั้นที่ 3 เพื่ออ่านผลสำรวจ แล้วกลับ Inquiry เพื่อทำ Estimate ต่อ" : reportWaiting ? "รายงานส่งตรวจแล้ว ผู้มีสิทธิ์ตรวจสามารถเปิดขั้นที่ 3 เพื่อพิจารณา" : visit.report ? "ตรวจข้อมูลจากหน้างาน เติมข้อสรุปและข้อเสนอ แล้วส่งให้ผู้ตรวจ" : "บันทึกครั้งเดียว — Checklist รูป และสิ่งที่พบใช้ประกอบรายงานได้"}</span></div>
    </div>

    <Tabs active={preparing ? "prepare" : tab} onChange={(value) => setTab(value === "prepare" ? "overview" : value)} tabs={[
      { id: "prepare", label: "1 · เตรียมเข้าหน้างาน" },
      { id: "execution", label: "2 · บันทึกสำรวจ" },
      { id: "report", label: "3 · สรุปและส่งตรวจ" },
    ]} />

    {preparing ? <Tabs
      tabs={[
        { id: "overview", label: t("Overview") },
        { id: "assignment", label: `${t("Assignment")} (${visit.assignments.filter((assignment) => assignment.isActive).length})` },
        { id: "schedule", label: t("Schedule & Confirmation") },
        { id: "brief", label: t("Pre-visit Brief") },
      ]}
      active={tab}
      onChange={setTab}
    /> : null}
    <details className="visit-extra"><summary><LocalizedText text={"เอกสารเชื่อมโยงและประวัติ"} /></summary><div className="visit-inline-actions">
      <button className="btn default" type="button" onClick={() => setTab("links")}>{t("Inquiry & Estimate")}</button>
      <button className="btn default" type="button" onClick={() => setTab("activity")}>{t("Activity")}</button>
    </div></details>

    <div style={{ marginTop: 14 }}>
      {tab === "overview" ? <div className="grid-2">
        <Panel title={t("Visit")}>
          <DefinitionList rows={[
            ["Visit No.", <span className="mono" key="v">{visit.number}</span>],
            ["Intake", <span className="mono" key="i">{visit.intakeNumber}</span>],
            ["Customer", `${visit.customerCode} — ${visit.customerName}`],
            ["Site", visit.siteName],
            ["Site address", visit.siteAddress],
            ["Contact", `${visit.contactName} ${visit.contactPhone}`.trim()],
            ["Purpose", visit.visitTypeName],
            ["Checklist", visit.checklistTemplateName],
            ["SLA policy", visit.slaPolicyName ? `${visit.slaPolicyName} · ${t("report due")} ${visit.reportDueDays} ${t("days")}` : "—"],
            ["Scheduled", visit.scheduledStart ? `${formatDateTime(visit.scheduledStart)} → ${formatTime(visit.scheduledEnd)} (${visit.timeZoneId})` : "—"],
            ["Travel allowance", `${visit.travelMinutesBefore} / ${visit.travelMinutesAfter} ${t("minutes")}`],
            ["Meeting point", visit.meetingPoint],
            ["Engineers required", String(visit.requiredEngineerCount)],
            ["Required equipment", visit.requiredEquipment],
            ["Internal note", visit.internalNote],
            ["Customer-facing note", visit.customerNote],
            ["Created", `${formatDateTime(visit.createdAt)} · ${visit.createdByName}`],
          ]} />
        </Panel>
        <div>
          <Panel title={t("Skill coverage")} subtitle={t("Required skills come from the coordinator's list when there is one")}>
            <div className="chip-select">
              {visit.requiredSkills.length ? visit.requiredSkills.map((skill) => <span key={skill}
                className={visit.missingSkills.includes(skill) ? "chip missing" : "chip on"}>{skill}</span>)
                : <span className="muted">{t("No skill requirement recorded")}</span>}
            </div>
            {visit.missingSkills.length ? <div className="callout warning" role="status" style={{ marginTop: 12 }}>
              <Icon name="alertTriangle" />
              <span><strong>{t("The assigned team does not cover every required skill")}</strong>{visit.missingSkills.join(", ")}</span>
            </div> : null}
          </Panel>
          <div style={{ height: 14 }} />
          <Panel title={t("Team")}>
            {visit.assignments.filter((assignment) => assignment.isActive).length ? <ul className="link-list">
              {visit.assignments.filter((assignment) => assignment.isActive).map((assignment) => <li key={assignment.id}>
                <Person initials={initials(assignment.engineerName)} name={assignment.engineerName} />
                <Pill>{t(assignment.assignmentRole)}</Pill>
                <Badge tone={toneOf(assignment.status === "Accepted" ? "Approved" : assignment.status)}>{assignment.status}</Badge>
                <Badge tone={matchTone(assignment.skillMatchPercent)}>{`${assignment.skillMatchPercent}%`}</Badge>
                {assignment.conflictOverride ? <Badge tone="amber">{t("Conflict override")}</Badge> : null}
              </li>)}
            </ul> : <EmptyState icon="users" title={t("Nobody assigned")} message={t("Assign a lead engineer to move this forward.")} />}
          </Panel>
        </div>
      </div> : null}

      {tab === "assignment" ? <AssignmentTab visit={visit} bootstrap={bootstrap} notify={notify} reload={load}
        onOpenAssign={() => setAssignOpen(true)} /> : null}

      {tab === "schedule" ? <div className="grid-2">
        <Panel title={t("Reschedule history")} subtitle={t("Append-only: old time, new time, reason and who did it")}>
          {visit.scheduleHistory.length ? <div className="timeline">
            {visit.scheduleHistory.map((entry) => <div className="timeline-item" key={entry.id}>
              <div className="timeline-head">
                <strong>{entry.previousStart ? `${formatDateTime(entry.previousStart)} → ${formatDateTime(entry.newStart)}` : `${t("Scheduled")} ${formatDateTime(entry.newStart)}`}</strong>
                <span className="muted">{entry.changedByName} <LocalizedText text={"·"} /> {formatDateTime(entry.changedAt)}</span>
              </div>
              <div className="timeline-card">{entry.reason}</div>
            </div>)}
          </div> : <EmptyState icon="clock" title={t("Never rescheduled")} message={t("The original time still stands.")} />}
        </Panel>
        <Panel title={t("Confirmations")} subtitle={t("Both the engineer's answer and the customer's, with the channel it came through")}>
          {visit.confirmations.length ? <div className="timeline">
            {visit.confirmations.map((confirmation) => <div className="timeline-item" key={confirmation.id}>
              <div className="timeline-head">
                <Pill>{confirmation.party}</Pill>
                <Badge tone={confirmation.outcome === "Confirmed" ? "green" : confirmation.outcome === "Declined" ? "red" : "amber"}>{confirmation.outcome}</Badge>
                <strong>{confirmation.confirmedByName}</strong>
                <span className="muted">{confirmation.channel} <LocalizedText text={"·"} /> {formatDateTime(confirmation.confirmedAt)}</span>
              </div>
              {confirmation.comment ? <div className="timeline-card">{confirmation.comment}</div> : null}
              <small className="muted">{t("Recorded by")} {confirmation.recordedByName} <LocalizedText text={"·"} /> {formatDateTime(confirmation.recordedAt)}</small>
            </div>)}
          </div> : <EmptyState icon="checkCircle" title={t("Nothing confirmed yet")}
            message={t("Record the engineer's acceptance and the customer's answer here.")} />}
        </Panel>
      </div> : null}

      {tab === "brief" ? <PreVisitBrief visitId={visit.id} /> : null}

      <div hidden={tab !== "execution"}><ExecutionTab visit={visit} notify={notify} reload={load} /></div>

      <div hidden={tab !== "report"}><ReportTab visit={visit} bootstrap={bootstrap} notify={notify} reload={load} /></div>

      {tab === "links" ? <Panel title={t("Inquiry, estimate and project")}
        subtitle={t("Site visit findings feed these records. They are never overwritten by a later visit.")}>
        {inquiryId ? <div className="callout"><Icon name="inbox" /><span><strong>{parentIntake?.relatedInquiryNumber ?? "Inquiry"}</strong><LocalizedText text={"รายงานของการเข้าหน้างานครั้งนี้อยู่ภายใต้เรื่องเดิม เปิดแท็บ Report เพื่อดูผล แล้วกลับ Inquiry เพื่อทำ Estimate ต่อ"} /></span></div> : null}
        {!inquiryId && !hasApprovedReport ? <div className="callout warning" role="status">
          <Icon name="alertTriangle" />
          <span><strong>{t("The report is not approved yet")}</strong>{t("An inquiry is created from a confirmed site visit, so approve the report first.")}</span>
        </div> : null}
        {visit.links.length ? <div className="table-wrap"><table>
          <thead><tr><th>{t("Type")}</th><th>{t("Number")}</th><th>{t("Relation")}</th><th>{t("Note")}</th><th>{t("Created by")}</th><th>{t("Created")}</th></tr></thead>
          <tbody>{visit.links.map((link) => <tr key={link.id}>
            <td><Pill>{link.targetType}</Pill></td>
            <td><strong className="mono">{link.targetNumber}</strong></td>
            <td>{link.relation}</td>
            <td className="muted">{link.note || "—"}</td>
            <td>{link.createdByName}</td>
            <td className="muted">{formatDateTime(link.createdAt)}</td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon="gitBranch" title={inquiryId ? "ใช้ Inquiry เดิม" : t("Not linked yet")}
          message={inquiryId ? "ผลสำรวจเชื่อมผ่านคำขอเข้าหน้างานกับ Inquiry เดิมแล้ว" : t("Create an inquiry from the approved report, then an estimate from the inquiry.")} />}
        <div className="trace-chain" style={{ marginTop: 14 }}>
          {[
            [t("Inquiry"), parentIntake?.relatedInquiryNumber ?? visit.links.find((link) => link.targetType === "Inquiry")?.targetNumber ?? "—", Boolean(inquiryId)],
            ["คำขอเข้าหน้างาน", visit.intakeNumber, true],
            [t("Site Visit"), visit.number, true],
            [t("Report"), visit.report?.number ?? "—", Boolean(visit.report)],
            [t("Estimate"), visit.links.find((link) => link.targetType === "Estimate")?.targetNumber ?? "—", visit.links.some((link) => link.targetType === "Estimate")],
            [t("Project"), visit.links.find((link) => link.targetType === "Project")?.targetNumber ?? "—", visit.links.some((link) => link.targetType === "Project")],
          ].map(([label, value, done]) => <span key={String(label)} className={done ? "trace-step done" : "trace-step"}>
            <small>{label}</small><strong className="mono">{value}</strong>
          </span>)}
        </div>
      </Panel> : null}

      {tab === "activity" ? <Panel title={t("Status history")} subtitle={t("Append-only. A trigger refuses any change.")}>
        {visit.statusHistory.length ? <div className="timeline">
          {visit.statusHistory.map((entry) => <div className="timeline-item" key={entry.id}>
            <div className="timeline-head">
              <strong>{entry.previousStatus ? `${t(entry.previousStatus)} → ${t(entry.newStatus)}` : t(entry.newStatus)}</strong>
              <span className="muted">{entry.changedByName} <LocalizedText text={"·"} /> {formatDateTime(entry.changedAt)}</span>
            </div>
            {entry.reason ? <div className="timeline-card">{entry.reason}</div> : null}
          </div>)}
        </div> : <EmptyState icon="clock" title={t("No history yet")} message={t("Status changes appear here.")} />}
      </Panel> : null}
    </div>

    {statusTarget ? <Modal
      title={`${t("Change status to")} ${t(statusTarget)}`} subtitle={visit.number}
      onClose={() => setStatusTarget(null)}
      footer={<>
        <button className="btn default" type="button" onClick={() => setStatusTarget(null)}>{t("Cancel")}</button>
        <button className="btn primary" type="button" disabled={busy} onClick={() => { void applyStatus(); }}>
          <Icon name="check" />{busy ? t("Working…") : t("Confirm")}
        </button>
      </>}
    >
      <p>{t("Recorded in the append-only status history with your name and the time.")}</p>
      <Field label={t("Reason / comment")} hint={t("Required for reschedule, hold, cancel and no-show")}>
        <textarea rows={3} maxLength={4000} value={statusReason} onChange={(event) => setStatusReason(event.target.value)} />
      </Field>
    </Modal> : null}

    {assignOpen ? <AssignDrawer visit={visit} onClose={() => setAssignOpen(false)}
      onDone={async (message) => { notify(message); setAssignOpen(false); await load(); }} /> : null}
    {confirmOpen ? <ConfirmationDrawer visit={visit} onClose={() => setConfirmOpen(false)}
      onDone={async (message) => { notify(message); setConfirmOpen(false); await load(); }} /> : null}
    {rescheduleOpen ? <RescheduleDrawer visit={visit} onClose={() => setRescheduleOpen(false)}
      onDone={async (message) => { notify(message); setRescheduleOpen(false); await load(); }} /> : null}
    {closeOpen ? <CloseVisitModal visit={visit} onClose={() => setCloseOpen(false)}
      onDone={async (message) => { notify(message); setCloseOpen(false); await load(); }} /> : null}
    {inquiryOpen ? <CreateInquiryDrawer visit={visit} bootstrap={bootstrap} onClose={() => setInquiryOpen(false)}
      onDone={async (message) => { notify(message); setInquiryOpen(false); await load(); }} /> : null}
  </>;
}

function AssignmentTab({ visit, bootstrap, notify, reload, onOpenAssign }: {
  visit: SiteVisitDetail; bootstrap: BootstrapData; notify: (message: string) => void;
  reload: () => Promise<void>; onOpenAssign: () => void;
}) {
  const uiText = useUiText();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [respondTo, setRespondTo] = useState<number | null>(null);
  const canSchedule = bootstrap.permissions.includes("visit.schedule");
  const active = visit.assignments.filter((assignment) => assignment.isActive);
  const history = visit.assignments.filter((assignment) => !assignment.isActive);

  return <>
    <Panel
      title={t("Assigned engineers")}
      subtitle={`${active.length} / ${visit.requiredEngineerCount} ${t("required")} · ${active.filter((a) => a.status === "Accepted").length} ${t("accepted")}`}
      actions={canSchedule ? <button className="btn primary" type="button" onClick={onOpenAssign}><Icon name="plus" />{t("Assign engineer")}</button> : undefined}
      flush
    >
      {active.length ? <div className="table-wrap"><table>
        <thead><tr>
          <th>{t("Engineer")}</th><th>{t("Department")}</th><th>{t("Role")}</th><th>{t("Skills")}</th>
          <th>{t("Match")}</th><th>{t("Response")}</th><th>{t("Assigned by")}</th><th aria-label={uiText("Action")} />
        </tr></thead>
        <tbody>{active.map((assignment) => <tr key={assignment.id}>
          <td><Person initials={initials(assignment.engineerName)} name={assignment.engineerName} /></td>
          <td>{assignment.department}</td>
          <td><Pill>{t(assignment.assignmentRole)}</Pill></td>
          <td><div className="chip-select">{assignment.skills.map((skill) => <span key={skill}
            className={assignment.missingSkills.includes(skill) ? "chip" : "chip on"}>{skill}</span>)}</div>
            {assignment.missingSkills.length ? <small className="red-text">{t("Missing")}: {assignment.missingSkills.join(", ")}</small> : null}</td>
          <td><Badge tone={matchTone(assignment.skillMatchPercent)}>{`${assignment.skillMatchPercent}%`}</Badge></td>
          <td>
            <Badge tone={assignment.status === "Accepted" ? "green" : assignment.status === "Declined" ? "red" : "amber"}>{assignment.status}</Badge>
            {assignment.responseNote ? <small className="muted">{assignment.responseNote}</small> : null}
            {assignment.proposedStart ? <small className="muted">{t("Proposed")}: {formatDateTime(assignment.proposedStart)}</small> : null}
          </td>
          <td>{assignment.assignedByName}<small className="muted">{formatDateTime(assignment.assignedAt)}</small>
            {assignment.conflictOverride ? <><br /><Badge tone="amber">{t("Override")}</Badge>
              <small className="muted">{assignment.overrideByName}: {assignment.overrideReason}</small></> : null}</td>
          <td><div className="row-actions">
            {assignment.engineerId === bootstrap.user.id || canSchedule
              ? <button className="row-action" type="button" aria-label={t("Respond")} onClick={() => setRespondTo(assignment.id)}><Icon name="send" /></button>
              : null}
            {canSchedule ? <button className="row-action" type="button" aria-label={t("Withdraw")} disabled={busy} onClick={() => {
              setBusy(true);
              void withdrawAssignment(visit.id, assignment.id)
                .then(() => { notify(t("Assignment withdrawn")); return reload(); })
                .catch((requestError) => notify(toError(requestError)))
                .finally(() => setBusy(false));
            }}><Icon name="trash" /></button> : null}
          </div></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon="users" title={t("No engineer assigned")}
        message={t("Assign a lead engineer. The candidate list shows skill match, workload and any schedule conflict.")} />}
    </Panel>
    {history.length ? <>
      <div style={{ height: 14 }} />
      <Panel title={t("Assignment history")} subtitle={t("Withdrawn, declined and replaced assignments are kept, never deleted")} flush>
        <div className="table-wrap"><table>
          <thead><tr><th>{t("Engineer")}</th><th>{t("Role")}</th><th>{t("Outcome")}</th><th>{t("Note")}</th><th>{t("Assigned by")}</th><th>{t("Assigned at")}</th></tr></thead>
          <tbody>{history.map((assignment) => <tr key={assignment.id}>
            <td>{assignment.engineerName}</td>
            <td>{t(assignment.assignmentRole)}</td>
            <td><Badge tone={assignment.status === "Declined" ? "red" : "slate"}>{assignment.status}</Badge></td>
            <td className="muted">{assignment.responseNote || "—"}</td>
            <td>{assignment.assignedByName}</td>
            <td className="muted">{formatDateTime(assignment.assignedAt)}</td>
          </tr>)}</tbody>
        </table></div>
      </Panel>
    </> : null}
    {respondTo ? <RespondDrawer
      visit={visit}
      assignment={visit.assignments.find((assignment) => assignment.id === respondTo)!}
      onClose={() => setRespondTo(null)}
      onDone={async (message) => { notify(message); setRespondTo(null); await reload(); }}
    /> : null}
  </>;
}

function AssignDrawer({ visit, onClose, onDone }: {
  visit: SiteVisitDetail; onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [candidates, setCandidates] = useState<EngineerCandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<EngineerCandidateRecord | null>(null);
  const [role, setRole] = useState("Lead Engineer");
  const [overrideReason, setOverrideReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadEngineerCandidates(visit.id)
      .then((rows) => { if (!cancelled) setCandidates(rows); })
      .catch((requestError) => { if (!cancelled) setError(toError(requestError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visit.id]);

  const assign = async (conflictOverride: boolean) => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const result = await assignVisitEngineer(visit.id, {
        engineerId: selected.id, assignmentRole: role, conflictOverride,
        overrideReason: conflictOverride ? overrideReason : undefined,
        rowVersion: visit.rowVersion,
      });
      await onDone(`${selected.name} ${t("assigned")} · ${t("skill match")} ${result.matchPercent}%`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Drawer
    title={t("Assign engineer")}
    subtitle={`${visit.number} · ${visit.scheduledStart ? formatDateTime(visit.scheduledStart) : t("not scheduled")}`}
    width={720}
    onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      {selected && selected.conflictCount > 0
        ? <button className="btn danger" type="button" disabled={busy || overrideReason.trim().length < 10} onClick={() => { void assign(true); }}>
          <Icon name="alertTriangle" />{t("Override conflict and assign")}
        </button>
        : <button className="btn primary" type="button" disabled={busy || !selected} onClick={() => { void assign(false); }}>
          <Icon name="check" />{busy ? t("Assigning…") : t("Assign")}
        </button>}
    </>}
  >
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="callout" role="note">
      <Icon name="cpu" />
      <span><strong>{t("Required skills")}</strong>{visit.requiredSkills.join(", ") || t("none recorded")}</span>
    </div>
    <Field label={t("Assignment role")}>
      <select value={role} onChange={(event) => setRole(event.target.value)}>
        {["Lead Engineer", "Supporting Engineer"].map((value) => <option key={value} value={value}>{t(value)}</option>)}
      </select>
    </Field>
    {loading ? <Loading /> : <div className="table-wrap"><table>
      <thead><tr>
        <th aria-label={t("Select")} /><th>{t("Engineer")}</th><th>{t("Skills")}</th><th>{t("Match")}</th>
        <th>{t("Open jobs")}</th><th>{t("Booked (h)")}</th><th>{t("Travel")}</th><th>{t("Conflict")}</th>
      </tr></thead>
      <tbody>{candidates.map((candidate) => <tr key={candidate.id}
        className={selected?.id === candidate.id ? "clickable row-ok" : "clickable"}
        onClick={() => setSelected(candidate)}>
        <td><input type="radio" name="candidate" aria-label={candidate.name}
          checked={selected?.id === candidate.id} onChange={() => setSelected(candidate)} /></td>
        <td><div className="cell-primary"><strong>{candidate.name}</strong><span>{candidate.department} <LocalizedText text={"·"} /> {t(candidate.role)}</span></div>
          {candidate.isAssigned ? <Badge tone="blue">{t("Already assigned")}</Badge> : null}</td>
        <td><div className="chip-select">{candidate.skills.map((skill) => <span key={skill} className="chip on">{skill}</span>)}</div></td>
        <td><Badge tone={matchTone(candidate.skillMatchPercent)}>{`${candidate.skillMatchPercent}%`}</Badge>
          {candidate.missingSkills.length ? <small className="red-text">{candidate.missingSkills.join(", ")}</small> : null}</td>
        <td>{candidate.openAssignments}</td>
        <td>{Math.round(candidate.scheduledMinutesInWindow / 60)}</td>
        <td>{candidate.travelMinutes} {t("min")}</td>
        <td>{candidate.conflictCount > 0
          ? <><Badge tone="red">{candidate.conflictCount}</Badge><small className="muted">{candidate.conflictDetail}</small></>
          : <Badge tone="green">{t("Free")}</Badge>}</td>
      </tr>)}</tbody>
    </table></div>}
    {selected && selected.skillMatchPercent < 100 ? <div className="callout warning" role="status">
      <Icon name="alertTriangle" />
      <span><strong>{t("Skill gap")}</strong>{selected.name} {t("does not hold")} {selected.missingSkills.join(", ")}. {t("Add a supporting engineer who does.")}</span>
    </div> : null}
    {selected && selected.conflictCount > 0 ? <>
      <div className="callout error" role="alert">
        <Icon name="alertTriangle" />
        <span><strong>{t("Schedule conflict")}</strong>{selected.conflictDetail}</span>
      </div>
      <Field label={t("Override reason")} hint={t("At least ten characters. Recorded against the assignment and the audit log.")}>
        <textarea rows={3} maxLength={1000} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />
      </Field>
      <p className="muted">{t("Only an engineering manager may override. Without the permission the API refuses regardless of this form.")}</p>
    </> : null}
  </Drawer>;
}

function RespondDrawer({ visit, assignment, onClose, onDone }: {
  visit: SiteVisitDetail;
  assignment: SiteVisitDetail["assignments"][number];
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [response, setResponse] = useState("Accepted");
  const [note, setNote] = useState("");
  const [proposedStart, setProposedStart] = useState(toLocalInput(visit.scheduledStart));
  const [proposedEnd, setProposedEnd] = useState(toLocalInput(visit.scheduledEnd));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await respondToAssignment(visit.id, assignment.id, {
        response, note: note || undefined,
        proposedStart: response === "New Time Proposed" ? fromLocalInput(proposedStart) : null,
        proposedEnd: response === "New Time Proposed" ? fromLocalInput(proposedEnd) : null,
        rowVersion: assignment.rowVersion,
      });
      await onDone(`${assignment.engineerName}: ${t(response)}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Drawer title={t("Assignment response")} subtitle={`${visit.number} · ${assignment.engineerName}`} width={520}
    onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? t("Saving…") : t("Record response")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <Field label={t("Response")}>
      <select value={response} onChange={(event) => setResponse(event.target.value)}>
        {["Accepted", "Declined", "Information Requested", "New Time Proposed"].map((value) => <option key={value} value={value}>{t(value)}</option>)}
      </select>
    </Field>
    <Field label={t("Note")} hint={t("Required when declining or asking for information")}>
      <textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
    </Field>
    {response === "New Time Proposed" ? <div className="form-grid">
      <Field label={t("Proposed start")}><input type="datetime-local" value={proposedStart} onChange={(event) => setProposedStart(event.target.value)} /></Field>
      <Field label={t("Proposed end")}><input type="datetime-local" value={proposedEnd} onChange={(event) => setProposedEnd(event.target.value)} /></Field>
    </div> : null}
  </Drawer>;
}

function ConfirmationDrawer({ visit, onClose, onDone }: {
  visit: SiteVisitDetail; onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [party, setParty] = useState("Customer");
  const [outcome, setOutcome] = useState("Confirmed");
  const [channel, setChannel] = useState("Phone");
  const [name, setName] = useState(visit.contactName);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await recordVisitConfirmation(visit.id, {
        party, outcome, channel, confirmedByName: name, comment: comment || undefined, rowVersion: visit.rowVersion,
      });
      await onDone(`${t(party)} ${t(outcome).toLowerCase()}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Drawer title={t("Record confirmation")} subtitle={visit.number} width={520} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? t("Saving…") : t("Record")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="form-grid">
      <Field label={t("Party")}><select value={party} onChange={(event) => setParty(event.target.value)}>
        {["Customer", "Engineer"].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></Field>
      <Field label={t("Outcome")}><select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
        {["Confirmed", "Declined", "Rescheduled", "Information Requested", "No Response"].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></Field>
      <Field label={t("Channel")}><select value={channel} onChange={(event) => setChannel(event.target.value)}>
        {CHANNELS.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label={t("Confirmed by")} hint={t("The person's name, as they gave it")}>
        <input maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></Field>
    </div>
    <Field label={t("Customer comment")}><textarea rows={3} maxLength={20000} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
    <p className="muted">{t("Attach the evidence — an email or a chat screenshot — on the Execution tab, then reference it here.")}</p>
  </Drawer>;
}

function RescheduleDrawer({ visit, onClose, onDone }: {
  visit: SiteVisitDetail; onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [start, setStart] = useState(() => toLocalInput(visit.scheduledStart ?? new Date().toISOString()));
  const [end, setEnd] = useState(() => toLocalInput(visit.scheduledEnd ?? new Date(Date.now() + 4 * 3_600_000).toISOString()));
  const [travelBefore, setTravelBefore] = useState(visit.travelMinutesBefore);
  const [travelAfter, setTravelAfter] = useState(visit.travelMinutesAfter);
  const [meetingPoint, setMeetingPoint] = useState(visit.meetingPoint);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await rescheduleSiteVisit(visit.id, {
        scheduledStart: fromLocalInput(start), scheduledEnd: fromLocalInput(end),
        travelMinutesBefore: travelBefore, travelMinutesAfter: travelAfter,
        meetingPoint, reason, rowVersion: visit.rowVersion,
      });
      await onDone(`${visit.number} ${t("rescheduled")}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Drawer title={t("Reschedule")} subtitle={visit.number} width={520} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy || reason.trim().length === 0} onClick={() => { void submit(); }}>
        <Icon name="calendar" />{busy ? t("Saving…") : t("Reschedule")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="callout" role="note">
      <Icon name="alertCircle" />
      <span>{t("Every assigned engineer is re-checked against the new time, and both confirmations are cleared — the parties agreed to a time, not to a visit.")}</span>
    </div>
    <div className="form-grid">
      <Field label={t("New start")}><input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
      <Field label={t("New end")}><input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
      <Field label={t("Travel before (min)")}><input type="number" min={0} max={1440} value={travelBefore} onChange={(event) => setTravelBefore(Number(event.target.value))} /></Field>
      <Field label={t("Travel after (min)")}><input type="number" min={0} max={1440} value={travelAfter} onChange={(event) => setTravelAfter(Number(event.target.value))} /></Field>
    </div>
    <Field label={t("Meeting point")}><textarea rows={2} maxLength={500} value={meetingPoint} onChange={(event) => setMeetingPoint(event.target.value)} /></Field>
    <Field label={t("Reason")} hint={t("Mandatory. Stored in the append-only reschedule history.")}>
      <textarea rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
    </Field>
  </Drawer>;
}

function CloseVisitModal({ visit, onClose, onDone }: {
  visit: SiteVisitDetail; onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasApprovedReport = visit.report?.status === "Approved" || visit.report?.status === "Acknowledged";

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await closeSiteVisit(visit.id, { reason, rowVersion: visit.rowVersion });
      await onDone(`${visit.number} ${t("closed")}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Modal title={t("Close site visit")} subtitle={visit.number} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy || reason.trim().length === 0} onClick={() => { void submit(); }}>
        <Icon name="lock" />{busy ? t("Closing…") : t("Close visit")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    {hasApprovedReport
      ? <div className="callout" role="note"><Icon name="checkCircle" /><span>{t("This visit has an approved report.")}</span></div>
      : <div className="callout warning" role="status">
        <Icon name="alertTriangle" />
        <span><strong>{t("No approved report")}</strong>{t("Closing without one needs a written explanation of at least twenty characters.")}</span>
      </div>}
    <Field label={t("Reason")}><textarea rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
  </Modal>;
}

function CreateInquiryDrawer({ visit, bootstrap, onClose, onDone }: {
  visit: SiteVisitDetail; bootstrap: BootstrapData; onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const engineers = bootstrap.team.filter((member) => ["Engineer", "Engineering Manager", "Admin"].includes(member.role));
  const [projectName, setProjectName] = useState(visit.intakeSubject);
  const [projectType, setProjectType] = useState("Automation");
  const [ownerId, setOwnerId] = useState(engineers[0]?.id ?? bootstrap.user.id);
  const [dueDate, setDueDate] = useState(futureDate(14));
  const [priority, setPriority] = useState("Normal");
  const [probability, setProbability] = useState(50);
  const [grade, setGrade] = useState("B");
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const created = await createInquiryFromVisit(visit.id, {
        projectName, projectType, estimateOwnerId: ownerId, dueDate, priority,
        projectProbability: probability, customerInterestGrade: grade, remark: remark || undefined,
      });
      await onDone(`${created.number} ${t("created from")} ${visit.number}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Drawer title={t("Create inquiry from this visit")} subtitle={visit.number} width={560} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy || !projectName.trim()} onClick={() => { void submit(); }}>
        <Icon name="arrowRight" />{busy ? t("Creating…") : t("Create inquiry")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="callout" role="note">
      <Icon name="copy" />
      <span><strong>{t("Carried over automatically")}</strong>
        {t("Customer, site, contact, the customer's requirement, the site findings, the proposed scope, the assumptions, the exclusions and the risks — from the approved report.")}</span>
    </div>
    <div className="form-grid">
      <Field label={t("Project name")} span={2}><input maxLength={300} value={projectName} onChange={(event) => setProjectName(event.target.value)} /></Field>
      <Field label={t("Project type")}><input maxLength={100} value={projectType} onChange={(event) => setProjectType(event.target.value)} /></Field>
      <Field label={t("Estimate owner")}>
        <select value={ownerId} onChange={(event) => setOwnerId(Number(event.target.value))}>
          {engineers.map((member) => <option key={member.id} value={member.id}>{member.name} — {member.department}</option>)}
        </select>
      </Field>
      <Field label={t("Estimate due date")}><input type="date" min={today()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
      <Field label={t("Priority")}><select value={priority} onChange={(event) => setPriority(event.target.value)}>
        {PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label={t("Project probability")}><div className="input-suffix">
        <input type="number" min={0} max={100} step={5} value={probability} onChange={(event) => setProbability(Number(event.target.value))} /><span>%</span>
      </div></Field>
      <Field label={t("Customer interest grade")}><select value={grade} onChange={(event) => setGrade(event.target.value)}>
        {["A", "B", "C", "D"].map((value) => <option key={value}>{value}</option>)}</select></Field>
    </div>
    <Field label={t("Remark")}><textarea rows={3} maxLength={20000} value={remark} onChange={(event) => setRemark(event.target.value)} /></Field>
  </Drawer>;
}

function PreVisitBrief({ visitId }: { visitId: number }) {
  const t = useT();
  const [brief, setBrief] = useState<PreVisitBriefRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadPreVisitBrief(visitId)
      .then((data) => { if (!cancelled) setBrief(data); })
      .catch((requestError) => { if (!cancelled) setError(toError(requestError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visitId]);

  if (loading) return <Loading />;
  if (error) return <LoadError message={error} retry={() => undefined} />;
  if (!brief) return null;
  const visit = brief.visit;

  return <Panel
    title={t("Pre-visit brief")}
    subtitle={t("Everything the engineer needs on one page. Print this before leaving.")}
    actions={<button className="btn ghost" type="button" onClick={() => window.print()}><Icon name="file" />{t("Print")}</button>}
  >
    <div className="brief">
      <section>
        <h3>{t("Where and when")}</h3>
        <DefinitionList rows={[
          ["Customer", visit.customerName],
          ["Site", visit.siteName],
          ["Site address", visit.siteAddress],
          ["Meeting point", visit.meetingPoint],
          ["Scheduled", visit.scheduledStart ? `${formatDateTime(visit.scheduledStart)} → ${formatTime(visit.scheduledEnd)}` : "—"],
          ["Travel allowance", `${visit.travelMinutesBefore} / ${visit.travelMinutesAfter} ${t("minutes")}`],
          ["Contact", `${visit.contactName} · ${visit.contactPhone} · ${visit.contactEmail}`],
          ["Emergency contact", brief.emergencyContact],
        ]} />
      </section>
      <section>
        <h3>{t("Why we are going")}</h3>
        <div className="chip-select">{brief.purposes.map((purpose) => <span className="chip on" key={purpose.visitTypeId}>{purpose.name}</span>)}</div>
        <DefinitionList rows={[
          ["Current problem", brief.requirement.problemStatement],
          ["Expected result", brief.requirement.expectedResult],
          ["Expected scope", brief.requirement.expectedScope],
          ["Visit scope", visit.internalNote],
        ]} />
      </section>
      <section>
        <h3>{t("The machine")}</h3>
        <DefinitionList rows={[
          ["Machine", `${brief.machine.machineName} ${brief.machine.machineModel}`.trim()],
          ["Manufacturer", brief.machine.manufacturer],
          ["Serial number", brief.machine.machineSerialNo],
          ["Existing system", brief.machine.existingSystem],
          ["Controller brand", brief.machine.controllerBrand],
          ["Available drawing", brief.machine.availableDrawing],
          ["Utility information", brief.machine.utilityInformation],
        ]} />
      </section>
      <section>
        <h3>{t("Safety and access")}</h3>
        <DefinitionList rows={[
          ["PPE requirement", brief.machine.ppeRequirement],
          ["Safety requirement", brief.machine.safetyRequirement],
          ["Site access requirement", brief.machine.siteAccessRequirement],
          ["Shutdown window", brief.machine.shutdownWindow],
          ["Production schedule", brief.machine.productionSchedule],
          ["Photography", brief.machine.photographyRestricted ? t("Restricted — ask before taking any picture") : t("Allowed")],
          ["NDA", brief.machine.ndaRequired ? t("Required") : t("Not required")],
        ]} />
      </section>
      <section>
        <h3>{t("Team and tools")}</h3>
        <ul className="link-list">
          {visit.assignments.filter((assignment) => assignment.isActive).map((assignment) => <li key={assignment.id}>
            <Person initials={initials(assignment.engineerName)} name={assignment.engineerName} />
            <Pill>{t(assignment.assignmentRole)}</Pill><Badge tone={assignment.status === "Accepted" ? "green" : "amber"}>{assignment.status}</Badge>
          </li>)}
        </ul>
        <DefinitionList rows={[["Required equipment", visit.requiredEquipment]]} />
      </section>
      <section>
        <h3>{t("Open questions")}</h3>
        {brief.openQuestions.length ? <ul className="check-list">
          {brief.openQuestions.map((question, index) => <li key={`${question}-${index}`}><Icon name="alertCircle" />{t(question)}</li>)}
        </ul> : <p className="muted">{t("Nothing outstanding — the intake was complete.")}</p>}
      </section>
      <section>
        <h3>{t("Attachments")}</h3>
        {brief.intakeAttachments.length ? <ul className="link-list">
          {brief.intakeAttachments.map((attachment) => <li key={attachment.id}>
            <Icon name="paperclip" /><span>{attachment.name}</span><small className="muted">{attachment.category} <LocalizedText text={"·"} /> {formatFileSize(attachment.sizeBytes)}</small>
          </li>)}
        </ul> : <p className="muted">{t("No file was attached to the intake.")}</p>}
      </section>
      <section>
        <h3>{t("Previous visits to this customer")}</h3>
        {brief.previousVisits.length ? <div className="table-wrap"><table>
          <thead><tr><th>{t("Visit No.")}</th><th>{t("Purpose")}</th><th>{t("When")}</th><th>{t("Engineers")}</th><th>{t("Report")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>{brief.previousVisits.map((previous) => <tr key={previous.id}>
            <td className="mono">{previous.number}</td><td>{previous.visitTypeName}</td>
            <td>{formatDate(previous.scheduledStart)}</td><td>{previous.engineerNames || "—"}</td>
            <td>{previous.reportStatus ?? "—"}</td><td><Badge tone={toneOf(previous.status)}>{previous.status}</Badge></td>
          </tr>)}</tbody>
        </table></div> : <p className="muted">{t("First visit to this customer.")}</p>}
      </section>
    </div>
  </Panel>;
}

/* --------------------------------------------------------------------------
   Execution — checklist, findings, photos, check-in and check-out

   The same component serves the desktop tab and the mobile screen. `handheld`
   switches to the one-handed layout: big targets, one question at a time, the
   camera one tap away.
   -------------------------------------------------------------------------- */

function ExecutionTab({ visit, notify, reload, handheld }: {
  visit: SiteVisitDetail; notify: (message: string) => void; reload: () => Promise<void>; handheld?: boolean;
}) {
  const t = useT();
  const editable = canRecordSurvey(visit);
  const [openSection, setOpenSection] = useState(visit.checklist.find((item) => item.isRequired && !item.isNotApplicable && !item.responseValue?.trim() && item.numericValue == null)?.section ?? visit.checklist[0]?.section ?? "");
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [noteFields, setNoteFields] = useState<Record<number, boolean>>({});
  const [answers, setAnswers] = useState<Record<number, { value: string; numeric: string; na: boolean; note: string }>>(() => {
    const seed: Record<number, { value: string; numeric: string; na: boolean; note: string }> = {};
    for (const item of visit.checklist) {
      seed[item.itemId] = {
        value: item.responseValue ?? "",
        numeric: item.numericValue === null || item.numericValue === undefined ? "" : String(item.numericValue),
        na: item.isNotApplicable,
        note: item.note ?? "",
      };
    }
    return seed;
  });
  const [dirty, setDirty] = useState(false);
  const latestAnswers = useRef(answers);
  useEffect(() => { latestAnswers.current = answers; }, [answers]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [findingOpen, setFindingOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("Photo");
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setAnswer = (itemId: number, patch: Partial<{ value: string; numeric: string; na: boolean; note: string }>) => {
    setAnswers((current) => ({ ...current, [itemId]: { ...current[itemId], ...patch } }));
    setSaving((state) => state === "saving" ? state : "idle");
    setDirty(true);
  };

  const persist = useCallback(async () => {
    if (!dirty || !editable) return;
    setSaving("saving");
    try {
      const payload: SaveChecklistResponseInput[] = Object.entries(answers).map(([itemId, answer]) => ({
        checklistItemId: Number(itemId),
        responseValue: answer.value || null,
        numericValue: answer.numeric === "" ? null : Number(answer.numeric),
        unit: visit.checklist.find((item) => item.itemId === Number(itemId))?.itemUnit ?? "",
        isNotApplicable: answer.na,
        note: answer.note || null,
      }));
      await saveVisitChecklist(visit.id, payload);
      if (answers === latestAnswers.current) setDirty(false);
      setSaving("saved");
    } catch (requestError) {
      setSaving("error");
      notify(toError(requestError));
      throw requestError;
    }
  }, [answers, dirty, editable, visit.id, visit.checklist, notify]);

  // Continuous autosave. On a phone the engineer is holding a torch in one
  // hand; asking them to remember a Save button is asking to lose the data.
  useEffect(() => {
    if (!dirty || saving === "saving" || saving === "error") return;
    const timer = window.setTimeout(() => { void persist().catch(() => undefined); }, 1_200);
    return () => window.clearTimeout(timer);
  }, [dirty, persist, saving]);

  const uploadPhotos = async (selected: FileList | File[]) => {
    setBusy(true);
    try {
      for (const file of Array.from(selected).filter((item) => item.size > 0 && item.size <= MAX_FILE_BYTES)) {
        // The category defaults from the file type; the engineer can change it
        // afterwards without re-uploading.
        const guessed = file.type.startsWith("video") ? "Video" : file.type.startsWith("image") ? "Photo" : "Other";
        await uploadVisitAttachment(visit.id, {
          file,
          category: SITE_FILE_CATEGORIES.includes(uploadCategory) ? uploadCategory : guessed,
        });
      }
      notify(t("Uploaded"));
      await reload();
    } catch (requestError) { notify(toError(requestError)); }
    finally { setBusy(false); }
  };

  const checklist = visit.checklist;
  const sections = useMemo(() => {
    const map = new Map<string, typeof checklist>();
    for (const item of checklist) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    return [...map.entries()];
  }, [checklist]);

  const requiredOutstanding = visit.checklist.filter((item) => {
    const answer = answers[item.itemId];
    return item.isRequired && !surveyAnswerComplete(answer);
  });

  return <div className={handheld ? "site-exec handheld" : "site-exec"}>
    <div className="exec-bar">
      <div>
        <strong>{visit.number}</strong>
        <span className="muted">{visit.customerName} <LocalizedText text={"·"} /> {visit.siteName}</span>
      </div>
      <div className="exec-bar-actions">
        {editable && <span className={`autosave ${saving}`}>
          {saving === "saving" ? t("Saving…") : saving === "error" ? "บันทึกไม่สำเร็จ · กดบันทึกอีกครั้ง" : dirty ? t("Unsaved changes") : saving === "saved" ? t("Saved") : t("All changes saved")}
        </span>}
        {editable && dirty ? <button type="button" className="btn default" disabled={saving === "saving"} onClick={() => { void persist().catch(() => undefined); }}><LocalizedText text={"บันทึกตอนนี้"} /></button> : null}
        {editable && !visit.checkedInAt ? <button className="btn primary big" type="button" onClick={() => setCheckInOpen(true)}>
          <Icon name="play" />{t("Check in")}
        </button> : null}
        {editable && visit.checkedInAt && !visit.checkedOutAt ? <button className="btn primary big" type="button" disabled={dirty || saving === "saving"} onClick={() => setCheckOutOpen(true)}>
          <Icon name="checkCircle" />{t("Check out")}
        </button> : null}
      </div>
    </div>

    {!editable ? <div className="callout" role="status">
      <Icon name="lock" />
      <span><LocalizedText text={"ข้อมูลการสำรวจ · อ่านอย่างเดียว"} />{visit.checkedOutAt ? " — เข้าหน้างานเสร็จแล้ว" : " — การบันทึกต้องเป็นวิศวกรที่ตอบรับงานและอยู่ในสถานะที่เปิดให้บันทึก"}</span>
    </div> : null}

    <div className="visit-survey-layout">
      <div>
        <Panel title={t("Checklist")} subtitle={visit.checklistTemplateName ?? t("No template selected")}>
          <div className="visit-check-progress"><strong>{visit.checklist.length - visit.checklist.filter((item) => !surveyAnswerComplete(answers[item.itemId])).length} <LocalizedText text={"of"} /> {visit.checklist.length} <LocalizedText text={"ข้อบันทึกแล้ว"} /></strong>
            <button className={onlyOutstanding ? "btn primary" : "btn default"} type="button" aria-pressed={onlyOutstanding} onClick={() => { setOnlyOutstanding(!onlyOutstanding); if (!onlyOutstanding && requiredOutstanding[0]) setOpenSection(requiredOutstanding[0].section); }}><LocalizedText text={"เฉพาะข้อบังคับที่ยังไม่ครบ ("} />{requiredOutstanding.length}<LocalizedText text={")"} /></button>
          </div>
          {editable && requiredOutstanding.length ? <div className="callout warning" role="status">
            <Icon name="alertTriangle" />
            <span><strong>{requiredOutstanding.length} {t("required item(s) still unanswered")}</strong>
              {t("Check-out is refused until they are answered or marked not applicable.")}</span>
          </div> : null}
          {sections.length ? sections.map(([section, items]) => <div key={section} className="check-section">
            <button className="visit-check-heading" type="button" aria-expanded={openSection === section} onClick={() => setOpenSection(openSection === section ? "" : section)}><strong>{section}</strong><span>{items.filter((item) => surveyAnswerComplete(answers[item.itemId])).length}<LocalizedText text={"of"} />{items.length} <LocalizedText text={"ข้อ · เหลือข้อบังคับ"} /> {items.filter((item) => item.isRequired && !surveyAnswerComplete(answers[item.itemId])).length}</span><Icon name={openSection === section ? "chevronDown" : "chevronRight"} /></button>
            {openSection === section && items.filter((item) => !onlyOutstanding || (item.isRequired && !surveyAnswerComplete(answers[item.itemId]))).map((item) => {
              const answer = answers[item.itemId] ?? { value: "", numeric: "", na: false, note: "" };
              return <div className={`check-row${item.isRequired && !surveyAnswerComplete(answer) ? " needs-input" : ""}`} key={item.itemId}>
                <div className="check-prompt">
                  <strong>{item.prompt}{item.isRequired ? <em className="red-text"> *</em> : null}</strong>
                  {item.guidance ? <small className="muted">{item.guidance}</small> : null}
                  {item.answeredByName ? <small className="muted">{item.answeredByName} <LocalizedText text={"·"} /> {formatDateTime(item.answeredAt)}</small> : null}
                </div>
                <div className="check-input">
                  {!editable ? <div className="visit-answer"><strong>{answer.na ? t("Not applicable") : answer.numeric !== "" ? answer.numeric + " " + (item.itemUnit || "") : answer.value || "ยังไม่ได้บันทึก"}</strong>{answer.note ? <p>{answer.note}</p> : null}</div> : <>
                  {item.responseType === "YesNo" ? <div className="seg-control" role="group" aria-label={item.prompt}>
                    {["Yes", "No"].map((option) => <button key={option} type="button" disabled={!editable || answer.na}
                      className={answer.value === option ? "active" : ""} aria-pressed={answer.value === option}
                      onClick={() => setAnswer(item.itemId, { value: option })}>{t(option)}</button>)}
                  </div> : null}
                  {item.responseType === "Number" || item.responseType === "Measurement" ? <div className="input-suffix">
                    <input aria-label={item.prompt} type="number" step="any" inputMode="decimal" disabled={!editable || answer.na}
                      value={answer.numeric} onChange={(event) => setAnswer(item.itemId, { numeric: event.target.value })} />
                    <span>{item.itemUnit || ""}</span>
                  </div> : null}
                  {item.responseType === "Text" || item.responseType === "Choice" ? <textarea aria-label={item.prompt} rows={handheld ? 3 : 2} maxLength={20000}
                    disabled={!editable || answer.na} value={answer.value}
                    onChange={(event) => setAnswer(item.itemId, { value: event.target.value })} /> : null}
                  {item.responseType === "Photo" ? <>
                    <button className="btn default big" type="button" disabled={!editable || busy}
                      onClick={() => fileRef.current?.click()}><Icon name="upload" />{t("Add photo")}</button>
                    <input maxLength={500} placeholder={t("Reference")} disabled={!editable || answer.na}
                      value={answer.value} onChange={(event) => setAnswer(item.itemId, { value: event.target.value })} />
                  </> : null}
                  <label className="check-inline">
                    <input type="checkbox" disabled={!editable} checked={answer.na}
                      onChange={(event) => setAnswer(item.itemId, { na: event.target.checked })} />
                    {t("Not applicable")}
                  </label>
                  {!answer.note && !noteFields[item.itemId] ? <button type="button" className="link-btn" onClick={() => setNoteFields((state) => ({ ...state, [item.itemId]: true }))}><LocalizedText text={"เพิ่มหมายเหตุ"} /></button> : <input aria-label={"หมายเหตุ: " + item.prompt} className="check-note" maxLength={2000} placeholder={t("Note")} disabled={!editable}
                    value={answer.note} onChange={(event) => setAnswer(item.itemId, { note: event.target.value })} />}
                  </>}
                </div>
              </div>;
            })}
          </div>) : <EmptyState icon="checkCircle" title={t("No checklist")}
            message={t("This visit type has no checklist template. An administrator can add one.")} />}
        </Panel>
      </div>
      <div>
        <Panel title={t("Photos, videos and documents")}
          actions={editable ? <>
            <Select label={t("Category")} value={uploadCategory} onChange={setUploadCategory} options={[...SITE_FILE_CATEGORIES]} />
            <button className="btn primary" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" />{t("Add file")}
            </button>
          </> : undefined}>
          <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf,.dwg,.xlsx,.docx" hidden
            onChange={(event) => { if (event.target.files) void uploadPhotos(event.target.files); event.target.value = ""; }} />
          {visit.attachments.length ? <div className="visit-file-list">
            {visit.attachments.map((attachment) => <div className="doc-card" key={attachment.id}>

              <div className="doc-card-body">
                <strong>{attachment.name}</strong>
                <span className="doc-card-meta">{attachment.category} <LocalizedText text={"· v"} />{attachment.version} <LocalizedText text={"·"} /> {formatFileSize(attachment.sizeBytes)}</span>
                <span className="doc-card-owner">{attachment.uploadedByName} <LocalizedText text={"·"} /> {formatDateTime(attachment.uploadedAt)}</span>
              </div>
              <div className="doc-card-foot">
                <button className="link-btn" type="button" onClick={() => {
                  void downloadVisitAttachment(visit.id, attachment.id)
                    .then(({ blob, fileName }) => {
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url; anchor.download = fileName ?? attachment.name;
                      anchor.click(); URL.revokeObjectURL(url);
                    })
                    .catch((requestError) => notify(toError(requestError)));
                }}><Icon name="download" />{t("Download")}</button>
              </div>
            </div>)}
          </div> : <EmptyState icon="upload" title={t("No file yet")}
            message={t("A photograph of what you are describing is worth more than the description.")} />}
        </Panel>
        <div style={{ height: 14 }} />
        <Panel title={t("Findings, measurements and risks")}
          subtitle={t("Recorded separately from the sales requirement and carried into the report")}
          actions={editable ? <button className="btn primary" type="button" onClick={() => setFindingOpen(true)}>
            <Icon name="plus" />{t("Add finding")}
          </button> : undefined}>
          {visit.findings.length ? <div className="timeline">
            {visit.findings.map((finding) => <div className="timeline-item" key={finding.id}>
              <div className="timeline-head">
                <Pill>{finding.kind}</Pill>
                <strong>{finding.title}</strong>
                <Badge tone={finding.severity === "Critical" || finding.severity === "High" ? "red"
                  : finding.severity === "Medium" ? "amber" : "slate"}>{finding.severity}</Badge>
                {finding.measurementValue !== null ? <span className="mono">{finding.measurementValue} {finding.measurementUnit}</span> : null}
              </div>
              {finding.detail ? <div className="timeline-card">{finding.detail}</div> : null}
              <small className="muted">{finding.createdByName} <LocalizedText text={"·"} /> {formatDateTime(finding.createdAt)}</small>
            </div>)}
          </div> : <EmptyState icon="edit" title={t("Nothing recorded")}
            message={t("Record what you saw, what you measured and what worries you.")} />}
        </Panel>
        <div style={{ height: 14 }} />
        <Panel title={t("Visit record")}>
          <DefinitionList rows={[
            ["Checked in", visit.checkedInAt ? `${formatDateTime(visit.checkedInAt)} · ${visit.checkedInByName}` : "—"],
            ["Location recorded", visit.locationConsentGiven && visit.checkInLatitude !== null
              ? `${visit.checkInLatitude}, ${visit.checkInLongitude}` : t("Not shared")],
            ["Checked out", visit.checkedOutAt ? `${formatDateTime(visit.checkedOutAt)} · ${visit.checkedOutByName}` : "—"],
            ["Our attendees", visit.actualAttendees],
            ["Customer attendees", visit.customerAttendees],
            ["Execution note", visit.executionNote],
            ["Report due", visit.reportDueAt ? formatDateTime(visit.reportDueAt) : "—"],
          ]} />
        </Panel>
      </div>
    </div>

    {findingOpen ? <FindingDrawer visit={visit} onClose={() => setFindingOpen(false)}
      onDone={async (message) => { notify(message); setFindingOpen(false); await reload(); }} /> : null}
    {checkInOpen ? <CheckInModal visit={visit} onClose={() => setCheckInOpen(false)}
      onDone={async (message) => { notify(message); setCheckInOpen(false); await reload(); }} /> : null}
    {checkOutOpen ? <CheckOutModal visit={visit} outstanding={requiredOutstanding.length}
      onBeforeClose={persist} onClose={() => setCheckOutOpen(false)}
      onDone={async (message) => { notify(message); setCheckOutOpen(false); await reload(); }} /> : null}
  </div>;
}

function FindingDrawer({ visit, onClose, onDone }: {
  visit: SiteVisitDetail; onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [kind, setKind] = useState("Finding");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [severity, setSeverity] = useState("Info");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await saveVisitFinding(visit.id, {
        kind, title, detail: detail || undefined,
        measurementValue: value === "" ? null : Number(value),
        measurementUnit: unit || undefined, severity,
        sortOrder: visit.findings.filter((finding) => finding.kind === kind).length + 1,
      });
      await onDone(`${t(kind)} ${t("recorded")}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Drawer title={t("Add finding")} subtitle={visit.number} width={520} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy || !title.trim()} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? t("Saving…") : t("Record")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <Field label={t("Kind")}><select value={kind} onChange={(event) => setKind(event.target.value)}>
      {FINDING_KINDS.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></Field>
    <Field label={t("Title")}><input maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
    <Field label={t("Detail")}><textarea rows={4} maxLength={20000} value={detail} onChange={(event) => setDetail(event.target.value)} /></Field>
    <div className="form-grid">
      <Field label={t("Measurement")}><input type="number" step="any" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} /></Field>
      <Field label={t("Unit")}><input maxLength={40} value={unit} onChange={(event) => setUnit(event.target.value)} /></Field>
      <Field label={t("Severity")}><select value={severity} onChange={(event) => setSeverity(event.target.value)}>
        {SEVERITIES.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></Field>
    </div>
    <p className="muted">{t("A finding is added and archived, never silently edited — the report quotes it.")}</p>
  </Drawer>;
}

function CheckInModal({ visit, onClose, onDone }: {
  visit: SiteVisitDetail; onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [attendees, setAttendees] = useState(visit.assignments.filter((a) => a.isActive).map((a) => a.engineerName).join(", "));
  const [customerAttendees, setCustomerAttendees] = useState(visit.contactName);
  const [consent, setConsent] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const capture = () => {
    if (!navigator.geolocation) { setError(t("This device cannot report a location.")); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => setCoords({ latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)) }),
      () => setError(t("The location could not be read. Check-in works without it.")),
      { enableHighAccuracy: false, timeout: 8_000 });
  };

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await checkInSiteVisit(visit.id, {
        actualAttendees: attendees, customerAttendees,
        locationConsentGiven: consent,
        latitude: consent ? coords?.latitude ?? null : null,
        longitude: consent ? coords?.longitude ?? null : null,
        rowVersion: visit.rowVersion,
      });
      await onDone(`${visit.number} · ${t("checked in")}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Modal title={t("Check in")} subtitle={`${visit.number} · ${visit.siteName}`} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary big" type="button" disabled={busy} onClick={() => { void submit(); }}>
        <Icon name="play" />{busy ? t("Checking in…") : t("Check in now")}
      </button>
    </>}>
    {error ? <div className="callout warning" role="status"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <Field label={t("Our attendees")}><textarea rows={2} maxLength={4000} value={attendees} onChange={(event) => setAttendees(event.target.value)} /></Field>
    <Field label={t("Customer attendees")}><textarea rows={2} maxLength={4000} value={customerAttendees} onChange={(event) => setCustomerAttendees(event.target.value)} /></Field>
    <label className="checkbox-row">
      <input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); if (event.target.checked) capture(); }} />
      <span>{t("Record my location with this check-in")}<small className="muted">{t("Optional. Nothing is stored unless you tick this.")}</small></span>
    </label>
    {consent && coords ? <p className="muted mono">{coords.latitude}, {coords.longitude}</p> : null}
  </Modal>;
}

function CheckOutModal({ visit, outstanding, onBeforeClose, onClose, onDone }: {
  visit: SiteVisitDetail; outstanding: number; onBeforeClose: () => Promise<void>;
  onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [note, setNote] = useState(visit.executionNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await onBeforeClose();
      const result = await checkOutSiteVisit(visit.id, { executionNote: note, rowVersion: visit.rowVersion });
      await onDone(`${visit.number} · ${t("checked out")} · ${t("report due")} ${formatDateTime(result.reportDueAt)}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Modal title={t("Check out")} subtitle={visit.number} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary big" type="button" disabled={busy} onClick={() => { void submit(); }}>
        <Icon name="checkCircle" />{busy ? t("Checking out…") : t("Check out")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    {outstanding > 0 ? <div className="callout warning" role="status">
      <Icon name="alertTriangle" />
      <span><strong>{outstanding} {t("required checklist item(s) unanswered")}</strong>
        {t("The API will refuse the check-out and name them. Answer them or mark them not applicable first.")}</span>
    </div> : null}
    <p>{t("Checking out starts the report clock. The report draft is created for you, pre-filled from the intake and your findings.")}</p>
    <Field label={t("Closing note")}><textarea rows={3} maxLength={20000} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
  </Modal>;
}

/* --------------------------------------------------------------------------
   Report editor and review
   -------------------------------------------------------------------------- */

const REPORT_FIELDS: [keyof NonNullable<SiteVisitDetail["report"]>["revisions"][number], string, string][] = [
  ["visitSummary", "Visit summary", "What happened, in a paragraph a salesperson can read"],
  ["customerRequirement", "Customer requirement", "Carried from the intake; correct it only if the customer changed it on the day"],
  ["existingCondition", "Existing condition", "What the site actually looked like"],
  ["findingsSummary", "Findings", ""],
  ["measurementSummary", "Measurements", ""],
  ["rootCause", "Root cause / technical observation", "Say 'not yet identified' rather than guessing"],
  ["recommendedSolution", "Recommended solution", ""],
  ["proposedScope", "Proposed scope", "This becomes the inquiry scope"],
  ["assumption", "Assumption", "Everything the price depends on"],
  ["exclusion", "Exclusion", "What we are not doing"],
  ["risk", "Risk", ""],
  ["safetyConcern", "Safety concern", ""],
  ["customerAdditionalRequest", "Customer additional request", ""],
  ["engineerConclusion", "Engineer conclusion", "Required before the report can be submitted"],
  ["salesFollowUp", "Sales follow-up", ""],
  ["nextStep", "Next step", "Who does what, by when"],
];

function ReportTab({ visit, bootstrap, notify, reload }: {
  visit: SiteVisitDetail; bootstrap: BootstrapData; notify: (message: string) => void; reload: () => Promise<void>;
}) {
  const localizeCopy = useStaticCopy();
  const t = useT();
  const report = visit.report;
  const current = report?.current;
  const canWrite = bootstrap.permissions.includes("visit.report");
  const canApprove = bootstrap.permissions.includes("visit.report_approve");
  const editable = canWrite && report !== null && (report.status === "Draft" || report.status === "Revision Requested");
  const evidence = reportEvidence(visit);
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const [key] of REPORT_FIELDS) seed[key as string] = (current?.[key] as string) ?? "";
    return editable ? fillReportEvidence(seed, evidence) : seed;
  });
  const [changeSummary, setChangeSummary] = useState(current?.changeSummary ?? "");
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const missingSummary = (draft.visitSummary ?? "").trim().length < 20;
  const missingConclusion = (draft.engineerConclusion ?? "").trim().length < 20;

  if (!report) return <EmptyState icon="file" title={t("No report yet")}
    message={t("The report is created automatically when the engineer checks out.")} />;

  const save = async () => {
    setBusy(true);
    try {
      await saveVisitReport(visit.id, { ...draft, changeSummary, rowVersion: report.rowVersion } as never);
      notify(t("Report saved"));
      await reload();
    } catch (requestError) { notify(toError(requestError)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await saveVisitReport(visit.id, { ...draft, changeSummary, rowVersion: report.rowVersion } as never);
      const refreshed = await loadSiteVisit(visit.id);
      await submitVisitReport(visit.id, refreshed.report!.rowVersion);
      notify(`${report.number} ${t("submitted for review")}`);
      await reload();
    } catch (requestError) { notify(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <>
    <div className="visit-stage-guide" role="status"><Icon name={editable ? "edit" : "file"} /><div>
      <strong>{editable ? "ตรวจข้อมูลเดิม แล้วเติมข้อสรุป" : "รายงานผลการเข้าหน้างาน"}</strong>
      <span>{editable ? "บันทึกหน้างานและไฟล์อยู่ด้านล่าง เติมข้อสรุปวิศวกรก่อนส่งตรวจ ไม่ต้องคัดลอก Checklist ใหม่" : "แสดงรายงานสำหรับอ่าน — การแก้ไขใช้ขั้นตอนขอแก้ไขและตรวจอนุมัติเดิม"}</span>
    </div></div>
    <Panel
      title={`${t("Site visit report")} ${report.number}`}
      subtitle={`${t("Revision")} R${String(report.currentRevision).padStart(2, "0")} · ${report.authorName} · ${t("due")} ${formatDateTime(report.dueAt)}`}
      actions={<>
        <Badge tone={toneOf(report.status)}>{report.status}</Badge>
        <Badge tone={slaTone(report.slaState)}>{t(slaLabel(report.slaState))}</Badge>
        {editable ? <button className="btn default" type="button" disabled={busy} onClick={() => { void save(); }}>
          <Icon name="check" />{t("Save draft")}</button> : null}
        {editable ? <button className="btn primary" type="button" disabled={busy || missingSummary || missingConclusion} onClick={() => { void submit(); }}>
          <Icon name="send" />{t("Submit for review")}</button> : null}
        {canApprove && (report.status === "Submitted" || report.status === "Under Review")
          ? <button className="btn primary" type="button" onClick={() => setReviewOpen(true)}><Icon name="shield" />{t("Review")}</button> : null}
        {canWrite && report.status === "Approved"
          ? <button className="btn default" type="button" onClick={() => setAckOpen(true)}><Icon name="user" />{t("Customer acknowledgement")}</button> : null}
      </>}
    >
      {report.status === "Revision Requested" || report.reviewComment ? <div className={report.status === "Revision Requested" ? "callout warning" : "callout"} role="status">
        <Icon name="alertCircle" />
        <span><strong>{t("Reviewer comment")}</strong>{report.reviewComment || "—"}
          <small>{report.reviewedByName} <LocalizedText text={"·"} /> {formatDateTime(report.reviewedAt)}</small></span>
      </div> : null}
      {report.customerAcknowledgedAt ? <div className="callout" role="note">
        <Icon name="checkCircle" />
        <span><strong>{t("Customer acknowledged")}</strong>{report.customerAcknowledgedBy} <LocalizedText text={"·"} /> {formatDateTime(report.customerAcknowledgedAt)}</span>
      </div> : null}
      {editable ? <>
        <div className="form-grid">
          {REPORT_FIELDS.filter(([key]) => ["visitSummary", "engineerConclusion", "recommendedSolution", "nextStep"].includes(key)).map(([key, label, hint]) => <Field key={key} label={t(label)} hint={hint ? t(hint) : undefined} span={2}>
            <textarea aria-label={t(label)} rows={4} maxLength={20000} value={draft[key] ?? ""} onChange={(event) => setDraft((state) => ({ ...state, [key]: event.target.value }))} />
          </Field>)}
        </div>
        {missingSummary || missingConclusion ? <p className="muted"><LocalizedText text={"ก่อนส่งตรวจ: เติม"} />{[missingSummary ? "สรุปการเข้าหน้างาน" : "", missingConclusion ? "ข้อสรุปวิศวกร" : ""].filter(Boolean).join(" และ ")} <LocalizedText text={"อย่างน้อยช่องละ 20 ตัวอักษร"} /></p> : null}
        <details className="visit-report-details"><summary><LocalizedText text={"ตรวจรายละเอียดประกอบ · ความต้องการ ขอบเขต เงื่อนไข และความเสี่ยง"} /></summary>
          <p className="muted"><LocalizedText text={"ข้อมูลที่มีอยู่ถูกเก็บไว้แล้ว แก้เฉพาะส่วนที่ต้องเพิ่มหรือเปลี่ยน"} /></p>
          <div className="form-grid">
            {REPORT_FIELDS.filter(([key]) => !["visitSummary", "engineerConclusion", "recommendedSolution", "nextStep"].includes(key)).map(([key, label, hint]) => <Field key={key} label={t(label)} hint={hint ? t(hint) : undefined} span={2}>
              <textarea aria-label={t(label)} rows={3} maxLength={20000} value={draft[key] ?? ""} onChange={(event) => setDraft((state) => ({ ...state, [key]: event.target.value }))} />
            </Field>)}
            <Field label={t("Change summary")} span={4}><input maxLength={1000} value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} /></Field>
          </div>
        </details>
      </> : <article className="visit-report-reading" aria-label={localizeCopy("รายงานผลการเข้าหน้างาน")}>
        <div className="visit-report-meta"><strong>{visit.customerName}</strong><span>{visit.siteName} <LocalizedText text={"·"} /> {formatDateTime(visit.checkedInAt)}</span></div>
        {["visitSummary", "engineerConclusion", "recommendedSolution", "nextStep"].map((key) => <section key={key}><h3>{t(REPORT_FIELDS.find(([field]) => field === key)![1])}</h3><p>{draft[key]?.trim() || "ไม่ได้ระบุ"}</p></section>)}
        <details className="visit-report-details"><summary><LocalizedText text={"รายละเอียดรายงานทั้งหมด"} /></summary>
          {REPORT_FIELDS.filter(([key]) => !["visitSummary", "engineerConclusion", "recommendedSolution", "nextStep"].includes(key)).map(([key, label]) => draft[key]?.trim() ? <section key={key}><h3>{t(label)}</h3><p>{draft[key]}</p></section> : null)}
          {changeSummary ? <section><h3>{t("Change summary")}</h3><p>{changeSummary}</p></section> : null}
        </details>
      </article>}
    </Panel>

    <details className="visit-report-details visit-evidence" open={editable}><summary><LocalizedText text={"บันทึกหน้างานและไฟล์ประกอบ ·"} /> {visit.findings.length} <LocalizedText text={"บันทึก /"} /> {visit.attachments.length} <LocalizedText text={"File"} /></summary>
      <div className="visit-report-reading">
        {evidence.findingsSummary ? <section><h3><LocalizedText text={"สิ่งที่บันทึกระหว่างสำรวจ"} /></h3><p>{evidence.findingsSummary}</p></section> : <p className="muted"><LocalizedText text={"ยังไม่มีบันทึกเพิ่มเติมจากหน้างาน"} /></p>}
        {evidence.measurementSummary ? <section><h3><LocalizedText text={"ค่าที่วัดไว้"} /></h3><p>{evidence.measurementSummary}</p></section> : null}
        <div className="visit-inline-actions">{visit.attachments.map((file) => <button key={file.id} className="btn default" type="button" onClick={() => {
          void downloadVisitAttachment(visit.id, file.id).then(({ blob, fileName }) => {
            const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName ?? file.name; anchor.click(); URL.revokeObjectURL(url);
          }).catch((error: unknown) => notify(toError(error)));
        }}><Icon name="download" />{file.name}</button>)}</div>
      </div>
    </details>

    <div style={{ height: 14 }} />
    <Panel title={t("Action items")}
      actions={canWrite ? <button className="btn primary" type="button" onClick={() => setActionOpen(true)}>
        <Icon name="plus" />{t("Add action item")}</button> : undefined} flush>
      {visit.actionItems.length ? <div className="table-wrap"><table>
        <thead><tr><th>{t("Action")}</th><th>{t("Owner")}</th><th>{t("Due")}</th><th>{t("Status")}</th><th>{t("Created by")}</th></tr></thead>
        <tbody>{visit.actionItems.map((item) => <tr key={item.id}>
          <td><strong>{item.title}</strong>{item.detail ? <small className="muted">{item.detail}</small> : null}</td>
          <td>{item.ownerName || "—"}</td>
          <td className={item.dueDate && item.dueDate < today() && item.status !== "Done" ? "red-text" : undefined}>{formatDate(item.dueDate)}</td>
          <td><Badge tone={toneOf(item.status)}>{item.status}</Badge></td>
          <td className="muted">{item.createdByName}</td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon="check" title={t("No action item")}
        message={t("Anything the visit left open belongs here, with an owner and a date.")} />}
    </Panel>

    <div style={{ height: 14 }} />
    <Panel title={t("Revision history")} subtitle={t("An approved revision is frozen by a database trigger; a revision request opens the next one")}>
      {report.revisions.length ? <div className="timeline">
        {report.revisions.map((revision) => <div className="timeline-item" key={revision.id}>
          <div className="timeline-head">
            <strong>R{String(revision.revision).padStart(2, "0")}</strong>
            <Badge tone={toneOf(revision.status)}>{revision.status}</Badge>
            <span className="muted">{revision.createdByName} <LocalizedText text={"·"} /> {formatDateTime(revision.createdAt)}</span>
            {revision.approvedByName ? <span className="muted">{t("approved by")} {revision.approvedByName} <LocalizedText text={"·"} /> {formatDateTime(revision.approvedAt)}</span> : null}
          </div>
          {revision.changeSummary ? <div className="timeline-card">{revision.changeSummary}</div> : null}
        </div>)}
      </div> : null}
    </Panel>

    {reviewOpen ? <ReviewReportModal visit={visit} report={report} onClose={() => setReviewOpen(false)}
      onDone={async (message) => { notify(message); setReviewOpen(false); await reload(); }} /> : null}
    {ackOpen ? <AcknowledgeModal visit={visit} report={report} onClose={() => setAckOpen(false)}
      onDone={async (message) => { notify(message); setAckOpen(false); await reload(); }} /> : null}
    {actionOpen ? <ActionItemDrawer visit={visit} bootstrap={bootstrap} onClose={() => setActionOpen(false)}
      onDone={async (message) => { notify(message); setActionOpen(false); await reload(); }} /> : null}
  </>;
}

function ReviewReportModal({ visit, report, onClose, onDone }: {
  visit: SiteVisitDetail;
  report: NonNullable<SiteVisitDetail["report"]>;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [decision, setDecision] = useState("Approved");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await reviewVisitReport(visit.id, { decision, comment: comment || undefined, rowVersion: report.rowVersion });
      await onDone(`${report.number} ${t(decision).toLowerCase()}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Modal title={t("Review site visit report")} subtitle={`${report.number} · R${String(report.currentRevision).padStart(2, "0")}`}
    onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? t("Saving…") : t("Record decision")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="callout" role="note">
      <Icon name="shield" />
      <span>{t("The author cannot approve their own report. Requesting a revision opens the next revision and keeps this one intact.")}</span>
    </div>
    <Field label={t("Decision")}>
      <select value={decision} onChange={(event) => setDecision(event.target.value)}>
        {["Approved", "Revision Requested"].map((value) => <option key={value} value={value}>{t(value)}</option>)}
      </select>
    </Field>
    <Field label={t("Comment")} hint={t("Required when requesting a revision")}>
      <textarea rows={4} maxLength={20000} value={comment} onChange={(event) => setComment(event.target.value)} />
    </Field>
  </Modal>;
}

function AcknowledgeModal({ visit, report, onClose, onDone }: {
  visit: SiteVisitDetail;
  report: NonNullable<SiteVisitDetail["report"]>;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState(visit.contactName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await acknowledgeVisitReport(visit.id, { acknowledgedBy: name, rowVersion: report.rowVersion });
      await onDone(`${report.number} ${t("acknowledged")}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Modal title={t("Customer acknowledgement")} subtitle={report.number} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy || !name.trim()} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? t("Saving…") : t("Record acknowledgement")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <Field label={t("Acknowledged by")} hint={t("The customer representative's name, as they gave it")}>
      <input maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
    </Field>
    <p className="muted">{t("A digital customer signature is planned for a later phase; the name and time are recorded now.")}</p>
  </Modal>;
}

function ActionItemDrawer({ visit, bootstrap, onClose, onDone }: {
  visit: SiteVisitDetail; bootstrap: BootstrapData; onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [ownerId, setOwnerId] = useState<number | "">(bootstrap.user.id);
  const [dueDate, setDueDate] = useState(futureDate(7));
  const [status, setStatus] = useState("Open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await saveVisitActionItem(visit.id, {
        title, detail: detail || undefined,
        ownerId: ownerId === "" ? null : Number(ownerId),
        ownerName: bootstrap.team.find((member) => member.id === ownerId)?.name ?? "",
        dueDate: dueDate || null, status,
      });
      await onDone(t("Action item recorded"));
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Drawer title={t("Add action item")} subtitle={visit.number} width={480} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy || !title.trim()} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? t("Saving…") : t("Add")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <Field label={t("Action")}><input maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
    <Field label={t("Detail")}><textarea rows={3} maxLength={20000} value={detail} onChange={(event) => setDetail(event.target.value)} /></Field>
    <div className="form-grid">
      <Field label={t("Owner")}>
        <select value={ownerId} onChange={(event) => setOwnerId(event.target.value === "" ? "" : Number(event.target.value))}>
          <option value="">{t("Unassigned")}</option>
          {bootstrap.team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </Field>
      <Field label={t("Due date")}><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
      <Field label={t("Status")}><select value={status} onChange={(event) => setStatus(event.target.value)}>
        {["Open", "In Progress", "Done", "Cancelled"].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></Field>
    </div>
  </Drawer>;
}

/* ==========================================================================
   3 — My Assignments (the engineer's own screen, built for a phone)
   ========================================================================== */

export function ProductionMyAssignments(props: Props) {
  const t = useT();
  const [rows, setRows] = useState<MyAssignmentRecord[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [visit, setVisit] = useState<SiteVisitDetail | null>(null);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [respondTo, setRespondTo] = useState<MyAssignmentRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await loadMyAssignments({ includeClosed })); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [includeClosed]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const openVisit = useCallback(async (visitId: number) => {
    setOpenId(visitId);
    setVisit(null);
    try { setVisit(await loadSiteVisit(visitId)); }
    catch (requestError) { setError(toError(requestError)); }
  }, []);

  if (!props.bootstrap.permissions.includes("visit.read")) return <NoPermission what="'visit.read'" />;

  if (openId) return <>
    <button className="back-link" type="button" onClick={() => { setOpenId(null); setVisit(null); }}>
      <Icon name="arrowLeft" />{t("My Assignments")}
    </button>
    {visit ? <>
      <PageHeader
        eyebrow={visit.customerName}
        title={`${visit.number} · ${visit.visitTypeName}`}
        subtitle={visit.siteAddress || visit.siteName}
        meta={<>
          <Badge tone={toneOf(visit.status)}>{visit.status}</Badge>
          {visit.scheduledStart ? <Badge tone="blue">{formatDateTime(visit.scheduledStart)}</Badge> : null}
          {visit.reportDueAt ? <Badge tone={slaTone(visit.reportSlaState)}>{`${t("Report")} ${t(slaLabel(visit.reportSlaState))}`}</Badge> : null}
        </>}
        actions={visit.contactPhone
          ? <a className="btn primary big" href={`tel:${visit.contactPhone}`}><Icon name="user" />{t("Call")} {visit.contactName}</a>
          : undefined}
      />
      <Tabs tabs={[{ id: "work", label: t("On site") }, { id: "brief", label: t("Brief") }, { id: "report", label: t("Report") }]}
        active="work" onChange={() => undefined} />
      <div style={{ marginTop: 14 }}>
        <ExecutionTab visit={visit} notify={props.notify} handheld reload={async () => { await openVisit(visit.id); await load(); }} />
        <div style={{ height: 14 }} />
        <PreVisitBrief visitId={visit.id} />
        <div style={{ height: 14 }} />
        <ReportTab visit={visit} bootstrap={props.bootstrap} notify={props.notify}
          reload={async () => { await openVisit(visit.id); await load(); }} />
      </div>
    </> : <Loading />}
  </>;

  const groups: [string, MyAssignmentRecord[]][] = [
    [t("Waiting for your answer"), rows.filter((row) => row.assignmentStatus === "Proposed")],
    [t("Today"), rows.filter((row) => row.assignmentStatus === "Accepted" && row.scheduledStart && businessDate(new Date(row.scheduledStart)) === today())],
    [t("Upcoming"), rows.filter((row) => row.assignmentStatus === "Accepted" && row.scheduledStart && businessDate(new Date(row.scheduledStart)) > today())],
    [t("Report outstanding"), rows.filter((row) => row.reportSlaState === "overdue" || row.reportSlaState === "due_soon" || row.reportSlaState === "on_track")],
    [t("Everything else"), rows.filter((row) => row.assignmentStatus !== "Proposed"
      && !(row.assignmentStatus === "Accepted" && row.scheduledStart && businessDate(new Date(row.scheduledStart)) >= today())
      && row.reportSlaState === "not_applicable")],
  ];

  return <>
    <PageHeader eyebrow="ENGINEER" title={t("My Assignments")}
      subtitle={t("Accept the job, check in when you arrive, and write the report before the clock runs out.")}
      actions={<button className={includeClosed ? "btn primary" : "btn ghost"} type="button"
        onClick={() => setIncludeClosed((value) => !value)}><Icon name="eye" />{t("Include closed")}</button>} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    {loading ? <Loading /> : rows.length === 0
      ? <EmptyState icon="calendar" title={t("Nothing assigned to you")} message={t("Assignments appear here as soon as a coordinator places you on a visit.")} />
      : groups.filter(([, list]) => list.length > 0).map(([label, list]) => <div key={label}>
        <Panel title={`${label} (${list.length})`} flush>
          <div className="assignment-list">
            {list.map((row) => <div className="assignment-card" key={row.assignmentId}>
              <div className="assignment-card-head">
                <div>
                  <strong className="mono">{row.visitNumber}</strong>
                  <Badge tone={toneOf(row.visitStatus)}>{row.visitStatus}</Badge>
                  <Badge tone={row.assignmentStatus === "Accepted" ? "green" : row.assignmentStatus === "Declined" ? "red" : "amber"}>{row.assignmentStatus}</Badge>
                  <Pill>{t(row.assignmentRole)}</Pill>
                </div>
                <Badge tone={matchTone(row.skillMatchPercent)}>{`${row.skillMatchPercent}%`}</Badge>
              </div>
              <div className="assignment-card-body">
                <strong>{row.customerName}</strong>
                <span>{row.subject}</span>
                <span className="muted">{row.siteName} <LocalizedText text={"·"} /> {row.siteAddress}</span>
                <span className="muted"><Icon name="calendar" />
                  {row.scheduledStart ? `${formatDateTime(row.scheduledStart)} → ${formatTime(row.scheduledEnd)}` : t("Not scheduled")}</span>
                <span className="muted"><Icon name="user" />{row.contactName} <LocalizedText text={"·"} /> {row.contactPhone}</span>
                {row.reportDueAt ? <span className={row.reportSlaState === "overdue" ? "red-text" : "muted"}>
                  <Icon name="file" />{t("Report due")} {formatDateTime(row.reportDueAt)} <LocalizedText text={"·"} /> {t(slaLabel(row.reportSlaState))}
                </span> : null}
              </div>
              <div className="assignment-card-foot">
                {row.assignmentStatus === "Proposed"
                  ? <button className="btn primary big" type="button" onClick={() => setRespondTo(row)}>
                    <Icon name="check" />{t("Accept or decline")}</button>
                  : null}
                {row.contactPhone ? <a className="btn default big" href={`tel:${row.contactPhone}`}><Icon name="user" />{t("Call site")}</a> : null}
                <button className="btn primary big" type="button" onClick={() => { void openVisit(row.visitId); }}>
                  <Icon name="arrowRight" />{row.checkedInAt && !row.checkedOutAt ? t("Continue on site") : t("Open")}
                </button>
              </div>
            </div>)}
          </div>
        </Panel>
        <div style={{ height: 14 }} />
      </div>)}
    {respondTo ? <MyResponseModal row={respondTo} onClose={() => setRespondTo(null)}
      onDone={async (message) => { props.notify(message); setRespondTo(null); await load(); }} /> : null}
  </>;
}

function MyResponseModal({ row, onClose, onDone }: {
  row: MyAssignmentRecord; onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [response, setResponse] = useState("Accepted");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await respondToAssignment(row.visitId, row.assignmentId, {
        response, note: note || undefined, rowVersion: row.assignmentRowVersion,
      });
      await onDone(`${row.visitNumber}: ${t(response)}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Modal title={t("Respond to assignment")} subtitle={`${row.visitNumber} · ${row.customerName}`} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary big" type="button" disabled={busy} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? t("Saving…") : t("Send")}
      </button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <p>{row.scheduledStart ? `${formatDateTime(row.scheduledStart)} → ${formatTime(row.scheduledEnd)}` : t("This visit has no time yet.")}</p>
    <div className="seg-control" role="group" aria-label={t("Response")}>
      {["Accepted", "Declined", "Information Requested", "New Time Proposed"].map((value) => <button key={value} type="button"
        className={response === value ? "active" : ""} aria-pressed={response === value} onClick={() => setResponse(value)}>{t(value)}</button>)}
    </div>
    <Field label={t("Note")} hint={t("Required when declining or asking for information")}>
      <textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
    </Field>
  </Modal>;
}

/* ==========================================================================
   4 — Visit master data (administration)
   ========================================================================== */

export function ProductionVisitMasterData(props: Props) {
  const t = useT();
  const master = useMasterData(true);
  const [tab, setTab] = useState<"types" | "skills" | "checklists" | "sla" | "profiles" | "availability">("types");
  const canAdmin = props.bootstrap.permissions.includes("visit.admin");

  if (!props.bootstrap.permissions.includes("visit.read")) return <NoPermission what="'visit.read'" />;

  return <>
    <PageHeader eyebrow="ADMINISTRATION" title={t("Visit Master Data")}
      subtitle={t("Visit purposes, skills, checklists, service levels, engineer profiles and unavailability.")}
      meta={canAdmin ? <Badge tone="green">{t("You may edit")}</Badge> : <Badge tone="slate">{t("Read only")}</Badge>} />
    {master.error ? <LoadError message={master.error} retry={() => { void master.reload(); }} /> : null}
    <Tabs
      tabs={[
        { id: "types", label: t("Visit Types") },
        { id: "skills", label: t("Skills") },
        { id: "checklists", label: t("Checklist Templates") },
        { id: "sla", label: t("SLA") },
        { id: "profiles", label: t("Engineer Skills") },
        { id: "availability", label: t("Availability") },
      ]}
      active={tab}
      onChange={setTab}
    />
    <div style={{ marginTop: 14 }}>
      {!master.data ? <Loading /> : <>
        {tab === "types" ? <VisitTypeAdmin data={master.data} canAdmin={canAdmin} notify={props.notify} reload={master.reload} /> : null}
        {tab === "skills" ? <SkillAdmin data={master.data} canAdmin={canAdmin} notify={props.notify} reload={master.reload} /> : null}
        {tab === "checklists" ? <ChecklistAdmin data={master.data} canAdmin={canAdmin} notify={props.notify} reload={master.reload} /> : null}
        {tab === "sla" ? <SlaAdmin data={master.data} canAdmin={canAdmin} notify={props.notify} reload={master.reload} /> : null}
        {tab === "profiles" ? <EngineerSkillAdmin data={master.data} bootstrap={props.bootstrap} canAdmin={canAdmin} notify={props.notify} reload={master.reload} /> : null}
        {tab === "availability" ? <AvailabilityAdmin data={master.data} bootstrap={props.bootstrap} canAdmin={canAdmin} notify={props.notify} reload={master.reload} /> : null}
      </>}
    </div>
  </>;
}

type AdminProps = {
  data: VisitMasterData; canAdmin: boolean; notify: (message: string) => void; reload: () => Promise<void>;
};

function VisitTypeAdmin({ data, canAdmin, notify, reload }: AdminProps) {
  const uiText = useUiText();
  const t = useT();
  const [editing, setEditing] = useState<VisitMasterData["visitTypes"][number] | null>(null);
  const [creating, setCreating] = useState(false);
  const row = editing ?? (creating ? {
    id: 0, code: "", nameEn: "", nameTh: "", nameJa: "", description: "",
    defaultDurationMinutes: 240, defaultEngineerCount: 1, requiresManagerApproval: false,
    sortOrder: (data.visitTypes.at(-1)?.sortOrder ?? 0) + 10, isActive: true,
    checklistTemplateId: null, rowVersion: "",
  } : null);

  return <>
    <Panel title={`${data.visitTypes.length} ${t("visit purposes")}`}
      subtitle={t("A purpose carries the default duration, crew size and checklist a coordinator starts from")}
      actions={canAdmin ? <button className="btn primary" type="button" onClick={() => { setCreating(true); setEditing(null); }}>
        <Icon name="plus" />{t("New visit type")}</button> : undefined} flush>
      <div className="table-wrap"><table>
        <thead><tr>
          <th>{t("Code")}</th><th>{t("English")}</th><th>{t("Thai")}</th><th>{t("Japanese")}</th>
          <th>{t("Duration")}</th><th>{t("Engineers")}</th><th>{t("Manager approval")}</th>
          <th>{t("Checklist")}</th><th>{t("Active")}</th><th aria-label={uiText("Action")} />
        </tr></thead>
        <tbody>{data.visitTypes.map((type) => <tr key={type.id}>
          <td><strong className="mono">{type.code}</strong></td>
          <td>{type.nameEn}</td><td>{type.nameTh || "—"}</td><td>{type.nameJa || "—"}</td>
          <td>{Math.round(type.defaultDurationMinutes / 60 * 10) / 10} {t("h")}</td>
          <td>{type.defaultEngineerCount}</td>
          <td>{type.requiresManagerApproval ? <Badge tone="amber">{t("Required")}</Badge> : "—"}</td>
          <td>{data.checklistTemplates.find((template) => template.id === type.checklistTemplateId)?.code ?? <span className="muted">CL_GENERAL</span>}</td>
          <td><Badge tone={type.isActive ? "green" : "slate"}>{type.isActive ? t("Active") : t("Inactive")}</Badge></td>
          <td>{canAdmin ? <button className="row-action" type="button" aria-label={t("Edit")}
            onClick={() => { setEditing(type); setCreating(false); }}><Icon name="edit" /></button> : null}</td>
        </tr>)}</tbody>
      </table></div>
    </Panel>
    {row ? <VisitTypeDrawer row={row} onClose={() => { setEditing(null); setCreating(false); }}
      onDone={async (message) => { notify(message); setEditing(null); setCreating(false); await reload(); }} /> : null}
  </>;
}

function VisitTypeDrawer({ row, onClose, onDone }: {
  row: VisitMasterData["visitTypes"][number]; onClose: () => void; onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [form, setForm] = useState(row);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await saveVisitType({
        code: form.code, nameEn: form.nameEn, nameTh: form.nameTh, nameJa: form.nameJa,
        description: form.description, defaultDurationMinutes: form.defaultDurationMinutes,
        defaultEngineerCount: form.defaultEngineerCount, requiresManagerApproval: form.requiresManagerApproval,
        sortOrder: form.sortOrder, isActive: form.isActive,
      });
      await onDone(`${form.code} ${t("saved")}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Drawer title={row.id ? t("Edit visit type") : t("New visit type")} subtitle={row.code || undefined} width={520} onClose={onClose}
    footer={<>
      <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy || !form.code.trim() || !form.nameEn.trim()} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? t("Saving…") : t("Save")}</button>
    </>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="form-grid">
      <Field label={t("Code")} hint={t("Letters, digits, underscore. Cannot be changed once used.")}>
        <input maxLength={40} value={form.code} readOnly={Boolean(row.id)} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field>
      <Field label={t("Sort order")}><input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></Field>
      <Field label={t("English name")} span={2}><input maxLength={200} value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></Field>
      <Field label={t("Thai name")}><input maxLength={200} value={form.nameTh} onChange={(event) => setForm({ ...form, nameTh: event.target.value })} /></Field>
      <Field label={t("Japanese name")}><input maxLength={200} value={form.nameJa} onChange={(event) => setForm({ ...form, nameJa: event.target.value })} /></Field>
      <Field label={t("Default duration (minutes)")}><input type="number" min={15} max={10080} value={form.defaultDurationMinutes}
        onChange={(event) => setForm({ ...form, defaultDurationMinutes: Number(event.target.value) })} /></Field>
      <Field label={t("Default engineers")}><input type="number" min={1} max={20} value={form.defaultEngineerCount}
        onChange={(event) => setForm({ ...form, defaultEngineerCount: Number(event.target.value) })} /></Field>
      <Field label={t("Description")} span={2}><textarea rows={2} maxLength={1000} value={form.description}
        onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
    </div>
    <label className="checkbox-row"><input type="checkbox" checked={form.requiresManagerApproval}
      onChange={(event) => setForm({ ...form, requiresManagerApproval: event.target.checked })} />
      <span>{t("Requires manager approval before scheduling")}</span></label>
    <label className="checkbox-row"><input type="checkbox" checked={form.isActive}
      onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>{t("Active")}</span></label>
  </Drawer>;
}

function SkillAdmin({ data, canAdmin, notify, reload }: AdminProps) {
  const uiText = useUiText();
  const t = useT();
  const [editing, setEditing] = useState<VisitMasterData["skills"][number] | null>(null);
  const [creating, setCreating] = useState(false);
  const row = editing ?? (creating ? {
    id: 0, code: "", nameEn: "", nameTh: "", nameJa: "", discipline: "General",
    sortOrder: (data.skills.at(-1)?.sortOrder ?? 0) + 10, isActive: true, engineerCount: 0, rowVersion: "",
  } : null);
  const [form, setForm] = useState(row);
  const rowKey = `${row?.id ?? 0}:${row?.code ?? ""}`;
  useEffect(() => {
    const timer = window.setTimeout(() => setForm(row), 0);
    return () => window.clearTimeout(timer);
  }, [rowKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);

  return <>
    <Panel title={`${data.skills.length} ${t("skills")}`} subtitle={t("The vocabulary used for skill matching and for engineer profiles")}
      actions={canAdmin ? <button className="btn primary" type="button" onClick={() => { setCreating(true); setEditing(null); }}>
        <Icon name="plus" />{t("New skill")}</button> : undefined} flush>
      <div className="table-wrap"><table>
        <thead><tr><th>{t("Code")}</th><th>{t("English")}</th><th>{t("Thai")}</th><th>{t("Japanese")}</th>
          <th>{t("Discipline")}</th><th>{t("Engineers holding it")}</th><th>{t("Active")}</th><th aria-label={uiText("Action")} /></tr></thead>
        <tbody>{data.skills.map((skill) => <tr key={skill.id}>
          <td><strong className="mono">{skill.code}</strong></td>
          <td>{skill.nameEn}</td><td>{skill.nameTh || "—"}</td><td>{skill.nameJa || "—"}</td>
          <td>{skill.discipline}</td>
          <td>{skill.engineerCount === 0 ? <Badge tone="red">0</Badge> : skill.engineerCount}</td>
          <td><Badge tone={skill.isActive ? "green" : "slate"}>{skill.isActive ? t("Active") : t("Inactive")}</Badge></td>
          <td>{canAdmin ? <button className="row-action" type="button" aria-label={t("Edit")}
            onClick={() => { setEditing(skill); setCreating(false); }}><Icon name="edit" /></button> : null}</td>
        </tr>)}</tbody>
      </table></div>
    </Panel>
    {form ? <Drawer title={form.id ? t("Edit skill") : t("New skill")} width={480}
      onClose={() => { setEditing(null); setCreating(false); }}
      footer={<>
        <button className="btn default" type="button" onClick={() => { setEditing(null); setCreating(false); }}>{t("Cancel")}</button>
        <button className="btn primary" type="button" disabled={busy || !form.code.trim() || !form.nameEn.trim()} onClick={() => {
          setBusy(true);
          void saveVisitSkill({
            code: form.code, nameEn: form.nameEn, nameTh: form.nameTh, nameJa: form.nameJa,
            discipline: form.discipline, sortOrder: form.sortOrder, isActive: form.isActive,
          }).then(async () => { notify(`${form.code} ${t("saved")}`); setEditing(null); setCreating(false); await reload(); })
            .catch((requestError) => notify(toError(requestError)))
            .finally(() => setBusy(false));
        }}><Icon name="check" />{busy ? t("Saving…") : t("Save")}</button>
      </>}>
      <div className="form-grid">
        <Field label={t("Code")}><input maxLength={40} value={form.code} readOnly={Boolean(form.id)}
          onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field>
        <Field label={t("Sort order")}><input type="number" value={form.sortOrder}
          onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></Field>
        <Field label={t("English name")} span={2}><input maxLength={200} value={form.nameEn}
          onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></Field>
        <Field label={t("Thai name")}><input maxLength={200} value={form.nameTh}
          onChange={(event) => setForm({ ...form, nameTh: event.target.value })} /></Field>
        <Field label={t("Japanese name")}><input maxLength={200} value={form.nameJa}
          onChange={(event) => setForm({ ...form, nameJa: event.target.value })} /></Field>
        <Field label={t("Discipline")}><input maxLength={100} value={form.discipline}
          onChange={(event) => setForm({ ...form, discipline: event.target.value })} /></Field>
      </div>
      <label className="checkbox-row"><input type="checkbox" checked={form.isActive}
        onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>{t("Active")}</span></label>
    </Drawer> : null}
  </>;
}

function ChecklistAdmin({ data, canAdmin, notify, reload }: AdminProps) {
  const uiText = useUiText();
  const t = useT();
  const [selected, setSelected] = useState(data.checklistTemplates[0]?.id ?? 0);
  const template = data.checklistTemplates.find((item) => item.id === selected);
  const [items, setItems] = useState(template?.items ?? []);
  const [busy, setBusy] = useState(false);
  const templateItems = template?.items;
  useEffect(() => {
    const timer = window.setTimeout(() => setItems(templateItems ?? []), 0);
    return () => window.clearTimeout(timer);
  }, [templateItems]);

  const save = async () => {
    if (!template) return;
    setBusy(true);
    try {
      await saveChecklistTemplate({
        code: template.code, name: template.name, visitTypeId: template.visitTypeId,
        description: template.description, isActive: template.isActive,
        items: items.map((item, index) => ({
          sortOrder: (index + 1) * 10, section: item.section, prompt: item.prompt,
          responseType: item.responseType, unit: item.unit, isRequired: item.isRequired, guidance: item.guidance,
        })),
      });
      notify(`${template.code} ${t("saved")}`);
      await reload();
    } catch (requestError) { notify(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <Panel
    title={t("Checklist templates")}
    subtitle={t("Answered items are deactivated rather than deleted, so a finished visit keeps the question it answered")}
    actions={<>
      <Select label={t("Template")} value={String(selected)} onChange={(value) => setSelected(Number(value))}
        options={data.checklistTemplates.map((item) => String(item.id))} />
      {canAdmin && template ? <button className="btn primary" type="button" disabled={busy} onClick={() => { void save(); }}>
        <Icon name="check" />{busy ? t("Saving…") : t("Save template")}</button> : null}
    </>}
  >
    {template ? <>
      <DefinitionList rows={[
        ["Code", template.code], ["Name", template.name],
        ["Visit type", template.visitTypeName ?? t("Any (fallback)")],
        ["Version", String(template.version)],
        ["Active", template.isActive ? t("Yes") : t("No")],
      ]} />
      <div className="table-wrap"><table>
        <thead><tr><th>#</th><th>{t("Section")}</th><th>{t("Prompt")}</th><th>{t("Type")}</th><th>{t("Unit")}</th>
          <th>{t("Required")}</th><th>{t("Guidance")}</th><th aria-label={uiText("Action")} /></tr></thead>
        <tbody>{items.map((item, index) => <tr key={`${item.id}-${index}`}>
          <td>{index + 1}</td>
          <td><input maxLength={200} disabled={!canAdmin} value={item.section}
            onChange={(event) => setItems((list) => list.map((row, position) => position === index ? { ...row, section: event.target.value } : row))} /></td>
          <td><input maxLength={500} disabled={!canAdmin} value={item.prompt}
            onChange={(event) => setItems((list) => list.map((row, position) => position === index ? { ...row, prompt: event.target.value } : row))} /></td>
          <td><select disabled={!canAdmin} value={item.responseType}
            onChange={(event) => setItems((list) => list.map((row, position) => position === index ? { ...row, responseType: event.target.value } : row))}>
            {["YesNo", "Text", "Number", "Measurement", "Photo", "Choice"].map((value) => <option key={value}>{value}</option>)}</select></td>
          <td><input maxLength={40} disabled={!canAdmin} value={item.unit}
            onChange={(event) => setItems((list) => list.map((row, position) => position === index ? { ...row, unit: event.target.value } : row))} /></td>
          <td><input type="checkbox" disabled={!canAdmin} checked={item.isRequired} aria-label={t("Required")}
            onChange={(event) => setItems((list) => list.map((row, position) => position === index ? { ...row, isRequired: event.target.checked } : row))} /></td>
          <td><input maxLength={1000} disabled={!canAdmin} value={item.guidance}
            onChange={(event) => setItems((list) => list.map((row, position) => position === index ? { ...row, guidance: event.target.value } : row))} /></td>
          <td>{canAdmin ? <button className="row-action" type="button" aria-label={t("Remove")}
            onClick={() => setItems((list) => list.filter((_, position) => position !== index))}><Icon name="trash" /></button> : null}</td>
        </tr>)}</tbody>
      </table></div>
      {canAdmin ? <button className="btn ghost" type="button" onClick={() => setItems((list) => [...list, {
        id: 0, sortOrder: (list.length + 1) * 10, section: "General", prompt: "", responseType: "Text",
        unit: "", isRequired: false, guidance: "", isActive: true,
      }])}><Icon name="plus" />{t("Add item")}</button> : null}
    </> : <EmptyState icon="checkCircle" title={t("No template")} message={t("Run the master seed, or create a template.")} />}
  </Panel>;
}

function SlaAdmin({ data, canAdmin, notify, reload }: AdminProps) {
  const uiText = useUiText();
  const t = useT();
  const [rows, setRows] = useState(data.slaPolicies);
  const [busy, setBusy] = useState(false);
  const policies = data.slaPolicies;
  useEffect(() => {
    const timer = window.setTimeout(() => setRows(policies), 0);
    return () => window.clearTimeout(timer);
  }, [policies]);

  return <Panel title={t("Service levels")}
    subtitle={t("Report due days drive the check-out clock, the 'due soon' warning and the SLA compliance figure")} flush>
    <div className="table-wrap"><table>
      <thead><tr><th>{t("Code")}</th><th>{t("Name")}</th><th>{t("Visit type")}</th><th>{t("Review (days)")}</th>
        <th>{t("Lead (days)")}</th><th>{t("Report due (days)")}</th><th>{t("Warn (hours)")}</th>
        <th>{t("Default")}</th><th>{t("Active")}</th><th aria-label={uiText("Action")} /></tr></thead>
      <tbody>{rows.map((policy, index) => <tr key={policy.id}>
        <td><strong className="mono">{policy.code}</strong></td>
        <td><input maxLength={200} disabled={!canAdmin} value={policy.name}
          onChange={(event) => setRows((list) => list.map((row, position) => position === index ? { ...row, name: event.target.value } : row))} /></td>
        <td>{policy.visitTypeName ?? <span className="muted">{t("All")}</span>}</td>
        {(["reviewResponseDays", "scheduleLeadDays", "reportDueDays", "reportWarningHours"] as const).map((key) => <td key={key}>
          <input type="number" min={0} disabled={!canAdmin} value={policy[key]}
            onChange={(event) => setRows((list) => list.map((row, position) => position === index ? { ...row, [key]: Number(event.target.value) } : row))} />
        </td>)}
        <td><input type="checkbox" disabled={!canAdmin} checked={policy.isDefault} aria-label={t("Default")}
          onChange={(event) => setRows((list) => list.map((row, position) => ({ ...row, isDefault: position === index ? event.target.checked : false })))} /></td>
        <td><input type="checkbox" disabled={!canAdmin} checked={policy.isActive} aria-label={t("Active")}
          onChange={(event) => setRows((list) => list.map((row, position) => position === index ? { ...row, isActive: event.target.checked } : row))} /></td>
        <td>{canAdmin ? <button className="row-action" type="button" aria-label={t("Save")} disabled={busy} onClick={() => {
          setBusy(true);
          void saveSlaPolicy({
            code: policy.code, name: policy.name, visitTypeId: policy.visitTypeId,
            reviewResponseDays: policy.reviewResponseDays, scheduleLeadDays: policy.scheduleLeadDays,
            reportDueDays: policy.reportDueDays, reportWarningHours: policy.reportWarningHours,
            isDefault: policy.isDefault, isActive: policy.isActive,
          }).then(async () => { notify(`${policy.code} ${t("saved")}`); await reload(); })
            .catch((requestError) => notify(toError(requestError)))
            .finally(() => setBusy(false));
        }}><Icon name="check" /></button> : null}</td>
      </tr>)}</tbody>
    </table></div>
  </Panel>;
}

function EngineerSkillAdmin({ data, bootstrap, canAdmin, notify, reload }: AdminProps & { bootstrap: BootstrapData }) {
  const t = useT();
  const [userId, setUserId] = useState(bootstrap.team[0]?.id ?? 0);
  const [skillId, setSkillId] = useState(data.skills[0]?.id ?? 0);
  const [proficiency, setProficiency] = useState("Working");
  const [busy, setBusy] = useState(false);
  const byUser = useMemo(() => {
    const map = new Map<number, VisitMasterData["engineerSkills"]>();
    for (const row of data.engineerSkills) {
      const list = map.get(row.userId) ?? [];
      list.push(row);
      map.set(row.userId, list);
    }
    return map;
  }, [data.engineerSkills]);

  return <>
    {canAdmin ? <Panel title={t("Grant a skill")} subtitle={t("Skill match on the assignment screen reads directly from this table")}>
      <div className="form-grid">
        <Field label={t("Engineer")}><select value={userId} onChange={(event) => setUserId(Number(event.target.value))}>
          {bootstrap.team.map((member) => <option key={member.id} value={member.id}>{member.name} — {member.department}</option>)}</select></Field>
        <Field label={t("Skill")}><select value={skillId} onChange={(event) => setSkillId(Number(event.target.value))}>
          {data.skills.filter((skill) => skill.isActive).map((skill) => <option key={skill.id} value={skill.id}>{skill.nameEn}</option>)}</select></Field>
        <Field label={t("Proficiency")}><select value={proficiency} onChange={(event) => setProficiency(event.target.value)}>
          {["Learning", "Working", "Advanced", "Expert"].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></Field>
        <Field label="&nbsp;"><button className="btn primary" type="button" disabled={busy || !userId || !skillId} onClick={() => {
          setBusy(true);
          void saveEngineerSkill({ userId, skillId, proficiency })
            .then(async () => { notify(t("Skill granted")); await reload(); })
            .catch((requestError) => notify(toError(requestError)))
            .finally(() => setBusy(false));
        }}><Icon name="plus" />{t("Grant")}</button></Field>
      </div>
    </Panel> : null}
    <div style={{ height: 14 }} />
    <Panel title={t("Engineer skill profiles")} flush>
      {byUser.size ? <div className="table-wrap"><table>
        <thead><tr><th>{t("Engineer")}</th><th>{t("Department")}</th><th>{t("Skills")}</th></tr></thead>
        <tbody>{[...byUser.entries()].map(([id, skills]) => <tr key={id}>
          <td><strong>{skills[0].userName}</strong></td>
          <td>{skills[0].department}</td>
          <td><div className="chip-select">{skills.map((skill) => <span className="chip on" key={skill.id}>
            {skill.skillName} <LocalizedText text={"·"} /> {t(skill.proficiency)}
            {canAdmin ? <button type="button" className="chip-x" aria-label={`${t("Remove")} ${skill.skillName}`} onClick={() => {
              void deleteEngineerSkill(skill.id)
                .then(async () => { notify(t("Skill removed")); await reload(); })
                .catch((requestError) => notify(toError(requestError)));
            }}>×</button> : null}
          </span>)}</div></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon="users" title={t("No skill profile yet")}
        message={t("Until engineers have skills, every skill match reads 0%.")} />}
    </Panel>
  </>;
}

function AvailabilityAdmin({ data, bootstrap, notify, reload }: AdminProps & { bootstrap: BootstrapData }) {
  const uiText = useUiText();
  const t = useT();
  const [userId, setUserId] = useState(bootstrap.user.id);
  const [kind, setKind] = useState("Leave");
  const [reason, setReason] = useState("");
  const [startsAt, setStartsAt] = useState(toLocalInput(new Date(`${futureDate(1)}T09:00:00`).toISOString()));
  const [endsAt, setEndsAt] = useState(toLocalInput(new Date(`${futureDate(1)}T18:00:00`).toISOString()));
  const [busy, setBusy] = useState(false);

  return <>
    <Panel title={t("Record unavailability")}
      subtitle={t("Leave, training or a holiday. The assignment check refuses a booking that overlaps one of these.")}>
      <div className="form-grid">
        <Field label={t("Engineer")}><select value={userId} onChange={(event) => setUserId(Number(event.target.value))}>
          {bootstrap.team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
        <Field label={t("Kind")}><select value={kind} onChange={(event) => setKind(event.target.value)}>
          {["Leave", "Training", "Public Holiday", "Company Holiday", "Other Assignment", "Unavailable"].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></Field>
        <Field label={t("From")}><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></Field>
        <Field label={t("To")}><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></Field>
        <Field label={t("Reason")} span={2}><input maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      </div>
      <button className="btn primary" type="button" disabled={busy} onClick={() => {
        setBusy(true);
        void saveEngineerAvailability({ userId, kind, reason, startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt) })
          .then(async (result) => {
            notify(result.conflictingVisits.length
              ? `${t("Recorded, but these visits overlap")}: ${result.conflictingVisits.join(", ")}`
              : t("Unavailability recorded"));
            await reload();
          })
          .catch((requestError) => notify(toError(requestError)))
          .finally(() => setBusy(false));
      }}><Icon name="plus" />{t("Record")}</button>
    </Panel>
    <div style={{ height: 14 }} />
    <Panel title={t("Recorded unavailability")} subtitle={t("From 30 days ago onwards")} flush>
      {data.availability.length ? <div className="table-wrap"><table>
        <thead><tr><th>{t("Engineer")}</th><th>{t("Kind")}</th><th>{t("Reason")}</th><th>{t("From")}</th><th>{t("To")}</th><th aria-label={uiText("Action")} /></tr></thead>
        <tbody>{data.availability.map((row) => <tr key={row.id}>
          <td>{row.userName}</td><td><Pill>{t(row.kind)}</Pill></td><td className="muted">{row.reason || "—"}</td>
          <td>{formatDateTime(row.startsAt)}</td><td>{formatDateTime(row.endsAt)}</td>
          <td><button className="row-action" type="button" aria-label={t("Remove")} onClick={() => {
            void deleteEngineerAvailability(row.id)
              .then(async () => { notify(t("Removed")); await reload(); })
              .catch((requestError) => notify(toError(requestError)));
          }}><Icon name="trash" /></button></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon="calendar" title={t("Nobody has recorded time off")}
        message={t("Recording leave here is what stops a booking landing on it.")} />}
    </Panel>
  </>;
}
