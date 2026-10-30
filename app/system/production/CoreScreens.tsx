"use client";
import { useT as useStaticCopy } from "../i18n";

import { currentLocale, useLanguage, useT as useUiText } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  addProjectMember,
  createEmployee,
  dismissSignInRequest,
  assignmentDeliveryNote,
  createInventoryItem,
  createProject,
  createSupplier,
  deleteSupplier,
  updateSupplier,
  downloadProjectDocument,
  listEmployees,
  listSignInRequests,
  listUnlinkedAccounts,
  listAccessRoles,
  listInventory,
  listProjectDocuments,
  withdrawProjectDocument,
  listProjectMembers,
  listProjects,
  removeProjectMember,
  updateEmployee,
  updateUserRole,
  listUserRoles,
  grantUserRole,
  revokeUserRole,
  type UserAdditionalRole,
  uploadProjectDocument,
  apiRequest,
  loadSignInbox,
  type BootstrapData,
  type AccessRole,
  type CreateInventoryItemInput,
  type CreateProjectInput,
  type CreateSupplierInput,
  type EmployeeInput,
  type EmployeeRecord,
  type SignInRequest,
  type UnlinkedAccount,
  type ItemBalance,
  type ProjectDocument,
  type ProjectMember,
  type ProjectSummary,
  type ProjectDeletionCheck,
  type ScheduleTemplate,
  type SignInbox,
  checkProjectDeletion,
  deleteProject,
  listScheduleTemplates,
  updateProject,
  ApiClientError,
  type ProjectHealth,
} from "../api-client";
import { listPendingDayRequests, listProjectOverview, type PendingDayRequest, type ProjectOverviewItem } from "../project-overview-client";
import { ProjectPortfolioGantt } from "./ProjectPortfolioGantt";
import { useActivitySubView } from "../use-activity-presence";
import { choiceLink, flagLink, idLink, numberLink, optionalChoiceLink, optionalTextLink, textLink, useLinkedState } from "../screen-link";
import { DEFAULT_PORTFOLIO_SORT, PORTFOLIO_CHIPS, PORTFOLIO_HEALTH_ORDER, PORTFOLIO_SORT_KEYS, effectiveOption, effectiveStatusFilter, formatSlip, nextPortfolioSort, parsePortfolioSort, portfolioSortStorageKey, portfolioView, rowMenuPlacement, sortPortfolio,
  projectTeamOf, shownProjectTeam, type PortfolioChip, type PortfolioFilters, type PortfolioSort, type PortfolioSortKey } from "../../../lib/project-portfolio";
import { allowedProjectTransitions, type ProjectStatus } from "../../../backend-node/src/project-lifecycle";
import { EndUserCompanyField, EndUserEditModal, canEditEndUser } from "./EndUserCompanyField";
import { ContactPicker, HealthBadge, MasterPlanSection, PaymentChecklist, TeamPlanSection, TeamSelect, planIssuesOf, planPayload, planSpanOf, projectTeamOptions,
  type MasterPlanDraft, type TeamPlanDraft } from "./ProjectPlanFields";
import { ProductionCustomers, ProductionEngineeringRates } from "./AdminAnalyticsScreens";
import { SearchSelect } from "./SearchSelect";
import { canViewEngineeringRates } from "../../../backend-node/src/engineering-rate-access";
import { BusinessCardScanner } from "./BusinessCardScanner";
import type { BusinessCardExtraction } from "../../../lib/business-card";
import { supplierCodeFromName } from "../../../lib/supplier-code";
import "./master-data.css";
// SegmentBar and FilterChips are shared (ui.tsx), but ui.tsx stays free of stylesheet imports; this
// eager screen module loads their styles on the first page.
import "../segment-filters.css";
import "./project-portfolio.css";
import {
  Badge,
  EmptyState,
  FilterChips,
  Field,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  SegmentBar,
  Select,
  TablePageSize,
  Tabs,
  Toolbar,
  type IconName,
  type Tone,
} from "../ui";

type CommonProps = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap: () => Promise<void>;
};

const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const formText = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const optionalFormText = (data: FormData, name: string) => formText(data, name) || undefined;
const formNumber = (data: FormData, name: string) => Number(formText(data, name));
const formatDate = (value: string) => new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
const formatDateTime = (value: string) => new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const formatMoney = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(value);
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";
const businessDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const futureDate = (days: number) => businessDate(new Date(Date.now() + days * 86_400_000));
const today = () => businessDate(new Date());
const MAX_PROJECT_DOCUMENT_BYTES = 50 * 1024 * 1024;
const PROJECT_DOCUMENT_FOLDERS = [
  ["00", "To do list"],
  ["01", "Concept Design and Proposal"],
  ["02", "Drawing"],
  ["03", "Estimate cost"],
  ["04", "Quote"],
  ["05", "PO"],
  ["06", "Specifications and Documentation"],
  ["07", "Development"],
  ["08", "Schedule"],
  ["09", "Installation"],
  ["10", "Report"],
  ["11", "Manual and Document"],
  ["12", "DATA & EXAMPLE"],
  ["13", "Pic and Video"],
  ["14", "Ref"],
] as const;
const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toLocaleString(currentLocale(), { maximumFractionDigits: value >= 10 ? 1 : 2 })} ${unit}`;
};

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="callout danger" role="alert">
      <Icon name="alertTriangle" />
      <span><strong><LocalizedText text={"Could not load"} /></strong>{message}</span>
      <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>
    </div>
  );
}

export type DashboardDestination =
  | "my-work" | "inquiries" | "estimates" | "projects" | "signing"
  | "approvals" | "purchase" | "pos" | "receiving";

type DashboardWorkItem = {
  projectId: number;
  projectNo: string;
  projectName: string;
  taskId: number;
  wbs: string;
  name: string;
  canUpdate: boolean;
  planStart: string | null;
  planFinish: string | null;
  forecastFinish: string | null;
  actualFinish: string | null;
  percentComplete: number;
  status: string;
  updatedAt: string;
};

type DashboardPurchaseRequisition = { id: number; status: string };
type DashboardPurchaseOrder = {
  id: number;
  status: string;
  expectedDate: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
};
type DashboardGoodsReceipt = { id: number; status: string };

const dashboardDateKey = (value: string | null) => value?.slice(0, 10) ?? null;
const dashboardDayDistance = (value: string | null, todayKey: string) => {
  const key = dashboardDateKey(value);
  if (!key) return null;
  return Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000);
};
// Open work is due on its current plan finish; a later forecast does not move it (lib/my-work.ts late rule).
const dashboardDueDate = (item: DashboardWorkItem) => item.planFinish;
const dashboardClampedDate = (year: number, month: number, day: number) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
};
const dashboardTenure = (startKey: string | null | undefined, todayKey: string) => {
  if (!startKey) return null;
  const [startYear, startMonth, startDay] = startKey.slice(0, 10).split("-").map(Number);
  const [endYear, endMonth, endDay] = todayKey.split("-").map(Number);
  if (![startYear, startMonth, startDay, endYear, endMonth, endDay].every(Number.isFinite)) return null;
  const start = dashboardClampedDate(startYear, startMonth - 1, startDay);
  const end = dashboardClampedDate(endYear, endMonth - 1, endDay);
  if (start > end) return null;

  let years = endYear - startYear;
  let cursor = dashboardClampedDate(startYear + years, startMonth - 1, startDay);
  if (cursor > end) {
    years -= 1;
    cursor = dashboardClampedDate(startYear + years, startMonth - 1, startDay);
  }
  let months = (end.getUTCFullYear() - cursor.getUTCFullYear()) * 12 + end.getUTCMonth() - cursor.getUTCMonth();
  let monthCursor = dashboardClampedDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + months, cursor.getUTCDate());
  if (monthCursor > end) {
    months -= 1;
    monthCursor = dashboardClampedDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + months, cursor.getUTCDate());
  }
  const days = Math.floor((end.getTime() - monthCursor.getTime()) / 86_400_000);
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  return { years, months, days, totalDays };
};
const dashboardTaskTone = (item: DashboardWorkItem): Tone => {
  if (item.status === "Done") return "green";
  if (item.status === "Blocked") return "red";
  const due = dashboardDayDistance(dashboardDueDate(item), businessDate(new Date()));
  if (due !== null && due < 0) return "red";
  return item.status === "In Progress" ? "blue" : "slate";
};

export function ProductionDashboard({
  bootstrap,
  refreshBootstrap,
  teamTestMode,
  onNavigate,
}: Pick<CommonProps, "bootstrap" | "refreshBootstrap"> & { teamTestMode: boolean; onNavigate: (view: DashboardDestination) => void }) {
  const t = useUiText();
  const { lang } = useLanguage();
  const canReadInquiries = bootstrap.permissions.includes("inquiry.read");
  const canReadEstimates = bootstrap.permissions.includes("estimate.read");
  const canReadProjects = bootstrap.permissions.includes("project.read");
  const canApproveEstimates = bootstrap.permissions.includes("estimate.approve");
  const canReadSchedule = bootstrap.permissions.includes("schedule.read") && bootstrap.permissions.includes("schedule.progress");
  const canReadSigning = bootstrap.permissions.includes("signing.read");
  const canReadProcurement = bootstrap.permissions.includes("procurement.read");
  const canApproveProcurement = bootstrap.permissions.includes("procurement.approve");
  const canReadInventory = bootstrap.permissions.includes("inventory.read");
  const [taskTab, setTaskTab] = useState<"today" | "week" | "done">("today");
  const [workItems, setWorkItems] = useState<DashboardWorkItem[]>([]);
  const [signInbox, setSignInbox] = useState<SignInbox | null>(null);
  const [purchaseRequisitions, setPurchaseRequisitions] = useState<DashboardPurchaseRequisition[]>([]);
  const [approvalRequisitions, setApprovalRequisitions] = useState<DashboardPurchaseRequisition[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<DashboardPurchaseOrder[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<DashboardGoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [partialError, setPartialError] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setPartialError(false);
    const requests: Promise<void>[] = [];
    const capture = <T,>(promise: Promise<T>, apply: (value: T) => void) => {
      requests.push(promise.then(apply).catch(() => { setPartialError(true); }));
    };
    if (canReadSchedule) capture(apiRequest<DashboardWorkItem[]>("/api/v1/me/work"), setWorkItems);
    if (canReadSigning) capture(loadSignInbox(), setSignInbox);
    if (canReadProcurement) {
      capture(apiRequest<DashboardPurchaseRequisition[]>("/api/v1/purchase-requisitions/"), setPurchaseRequisitions);
      capture(apiRequest<DashboardPurchaseOrder[]>("/api/v1/purchase-orders/"), setPurchaseOrders);
    }
    if (canApproveProcurement) {
      capture(apiRequest<DashboardPurchaseRequisition[]>("/api/v1/purchase-requisitions/?waitingForMe=true"), setApprovalRequisitions);
    }
    if (canReadInventory) capture(apiRequest<DashboardGoodsReceipt[]>("/api/v1/goods-receipts/"), setGoodsReceipts);
    await Promise.all(requests);
    setLoading(false);
  }, [canApproveProcurement, canReadInventory, canReadProcurement, canReadSchedule, canReadSigning]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDashboard(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const todayKey = businessDate(new Date());
  const currentEmployee = bootstrap.team.find((member) => member.id === bootstrap.user.id)
    ?? bootstrap.team.find((member) => member.email.toLocaleLowerCase() === bootstrap.user.email.toLocaleLowerCase());
  const employment = bootstrap.employment ?? (currentEmployee ? {
    employeeId: currentEmployee.employeeId,
    employeeNo: currentEmployee.employeeNo,
    nickname: currentEmployee.nickname,
    level: currentEmployee.level,
    startWorkDate: currentEmployee.startWorkDate ?? "",
  } : null);
  const startWorkDate = employment?.startWorkDate;
  const tenure = dashboardTenure(startWorkDate, todayKey);
  const startWorkDateLabel = startWorkDate
    ? new Intl.DateTimeFormat(lang === "TH" ? "th-TH" : lang === "JP" ? "ja-JP" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${startWorkDate}T00:00:00`))
    : "—";
  const openWork = workItems.filter((item) => item.status !== "Done" && item.canUpdate);
  const todayWork = openWork.filter((item) => {
    const start = dashboardDayDistance(item.planStart, todayKey);
    const finish = dashboardDayDistance(dashboardDueDate(item), todayKey);
    return item.status === "In Progress" || item.status === "Blocked" || finish === 0
      || (start !== null && start <= 0 && (finish === null || finish >= 0));
  });
  const weekWork = openWork.filter((item) => {
    const distance = dashboardDayDistance(dashboardDueDate(item), todayKey);
    return distance !== null && distance >= 0 && distance <= 7;
  });
  const doneWork = workItems.filter((item) => item.status === "Done")
    .sort((a, b) => Date.parse(b.actualFinish ?? b.updatedAt) - Date.parse(a.actualFinish ?? a.updatedAt));
  const doneThisWeek = doneWork.filter((item) => {
    const distance = dashboardDayDistance(item.actualFinish ?? item.updatedAt, todayKey);
    return distance !== null && distance >= -7 && distance <= 0;
  });
  const lateWork = openWork.filter((item) => {
    const distance = dashboardDayDistance(dashboardDueDate(item), todayKey);
    return distance !== null && distance < 0;
  });
  const displayedWork = (taskTab === "today" ? todayWork : taskTab === "week" ? weekWork : doneWork).slice(0, 6);
  const openPr = purchaseRequisitions.filter((item) => !["Converted to PO", "Rejected", "Cancelled"].includes(item.status));
  const openPo = purchaseOrders.filter((item) => ["Ordered", "Partially Received"].includes(item.status)
    && Number(item.orderedQuantity) > Number(item.receivedQuantity));
  const duePo = openPo.filter((item) => {
    const distance = dashboardDayDistance(item.expectedDate, todayKey);
    return distance !== null && distance <= 7;
  });
  const draftReceipts = goodsReceipts.filter((item) => item.status === "Draft");
  const signCount = signInbox?.waitingMe.length ?? 0;
  const approvalCount = bootstrap.counts.approvals + approvalRequisitions.length;
  const attentionCount = lateWork.length + signCount + approvalCount + draftReceipts.length;
  const locale = lang === "TH" ? "th-TH" : lang === "JP" ? "ja-JP" : "en-GB";
  const fullDate = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  const workflow: Array<{
    label: string;
    detail: string;
    count: number;
    icon: IconName;
    tone: Tone;
    view: DashboardDestination;
    visible: boolean;
  }> = [
    { label: "Inquiry", detail: "คำขอจากลูกค้า", count: bootstrap.counts.inquiries, icon: "inbox", tone: "blue", view: "inquiries", visible: canReadInquiries },
    { label: "Estimate Cost", detail: "งานประเมินราคา", count: bootstrap.counts.estimates, icon: "file", tone: "violet", view: "estimates", visible: canReadEstimates },
    { label: "Project", detail: "โครงการที่ดำเนินการ", count: bootstrap.counts.activeProjects, icon: "folder", tone: "green", view: "projects", visible: canReadProjects },
    { label: "Sign", detail: "รอลายเซ็นของฉัน", count: signCount, icon: "edit", tone: signCount ? "amber" : "slate", view: "signing", visible: canReadSigning },
    { label: "Approval", detail: canApproveEstimates && canApproveProcurement ? "Estimate และ PR" : canApproveEstimates ? "อนุมัติ Estimate" : "อนุมัติ PR", count: approvalCount, icon: "checkCircle", tone: approvalCount ? "amber" : "slate", view: approvalRequisitions.length || !canApproveEstimates ? "approvals" : "estimates", visible: canApproveEstimates || canApproveProcurement },
    { label: "PR", detail: "ใบขอซื้อที่เปิดอยู่", count: openPr.length, icon: "package", tone: "blue", view: "purchase", visible: canReadProcurement },
    { label: "PO", detail: "คำสั่งซื้อที่ยังเปิด", count: openPo.length, icon: "truck", tone: duePo.length ? "amber" : "violet", view: "pos", visible: canReadProcurement },
    { label: "รับของ", detail: "เอกสารรอยืนยัน", count: draftReceipts.length, icon: "download", tone: draftReceipts.length ? "amber" : "green", view: "receiving", visible: canReadInventory },
  ];
  const visibleWorkflow = workflow.filter((item) => item.visible);

  return (
    <div className="team-dashboard">
      <PageHeader
        eyebrow="MY OPERATIONS DASHBOARD"
        title={`${t("สวัสดี")} ${bootstrap.user.name}`}
        subtitle={`${fullDate} · ${t("ดูงานที่ต้องทำและติดตามเอกสารทุกขั้นตอนจากที่เดียว")}`}
        meta={<><Badge tone="blue">{bootstrap.user.department}</Badge><Badge tone="slate">{bootstrap.user.role}</Badge>{teamTestMode ? <Badge tone="amber"><LocalizedText text={"Team Test"} /></Badge> : <Badge tone="green"><LocalizedText text={"ข้อมูลล่าสุด"} /></Badge>}</>}
        actions={<><button className="btn default" type="button" disabled={loading} onClick={() => { void Promise.all([loadDashboard(), refreshBootstrap()]); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>{canReadSchedule ? <button className="btn primary" type="button" onClick={() => onNavigate("my-work")}><Icon name="user" /><LocalizedText text={"Open My Work"} /></button> : null}</>}
      />

      <section className="dashboard-tenure" aria-label={t("ข้อมูลอายุงาน")}>
        <span className="dashboard-tenure-symbol"><Icon name="user" /></span>
        <div className="dashboard-tenure-intro">
          <small>{t("เส้นทางของคุณกับ TOMAS TECH")}</small>
          <strong>{tenure ? `${t("ร่วมทีมมาแล้ว")} ${tenure.years} ${t("ปี")} ${tenure.months} ${t("เดือน")} ${tenure.days} ${t("วัน")}` : t("ยังไม่ระบุวันเริ่มงาน")}</strong>
          <span>{employment ? `${t("พนักงานเลขที่")} ${employment.employeeNo} · ${employment.level}` : t("ไม่พบบัญชีผู้ใช้นี้ใน Employee Master")}</span>
        </div>
        <div className="dashboard-tenure-stat">
          <small>{t("เริ่มงาน")}</small>
          <strong>{startWorkDateLabel}</strong>
        </div>
        <div className="dashboard-tenure-stat">
          <small>{t("อายุงาน")}</small>
          <strong>{tenure ? `${tenure.years} ${t("ปี")} ${tenure.months} ${t("เดือน")}` : "—"}</strong>
        </div>
        <div className="dashboard-tenure-stat total">
          <small>{t("รวมทั้งหมด")}</small>
          <strong>{tenure ? `${tenure.totalDays.toLocaleString(locale)} ${t("วัน")}` : "—"}</strong>
        </div>
      </section>

      <section className="dashboard-summary" aria-label={t("สรุปงานของฉัน")}>
        <button type="button" className="dashboard-summary-card primary" onClick={() => setTaskTab("today")}>
          <span className="dashboard-summary-icon"><Icon name="calendar" /></span><span><small>{t("งานวันนี้")}</small><strong>{todayWork.length}</strong><em>{lateWork.length ? `${lateWork.length} ${t("งานเลยกำหนด")}` : t("อยู่ในแผน")}</em></span>
        </button>
        <button type="button" className="dashboard-summary-card" onClick={() => setTaskTab("week")}>
          <span className="dashboard-summary-icon blue"><Icon name="clock" /></span><span><small>{t("ครบกำหนดใน 7 วัน")}</small><strong>{weekWork.length}</strong><em>{t("เตรียมงานล่วงหน้า")}</em></span>
        </button>
        <button type="button" className="dashboard-summary-card" onClick={() => setTaskTab("done")}>
          <span className="dashboard-summary-icon green"><Icon name="checkCircle" /></span><span><small>{t("เสร็จใน 7 วันที่ผ่านมา")}</small><strong>{doneThisWeek.length}</strong><em>{t("จาก Project Schedule")}</em></span>
        </button>
        <div className={`dashboard-summary-card ${attentionCount ? "attention" : ""}`}>
          <span className="dashboard-summary-icon amber"><Icon name="bell" /></span><span><small>{t("ต้องจัดการต่อ")}</small><strong>{attentionCount}</strong><em>{t("งาน เอกสาร และการอนุมัติ")}</em></span>
        </div>
      </section>

      {partialError ? <div className="dashboard-data-note" role="status"><Icon name="alertCircle" />{t("ข้อมูลบางโมดูลยังโหลดไม่สำเร็จ สามารถกดรีเฟรชได้โดยไม่กระทบข้อมูลส่วนอื่น")}</div> : null}

      <section className="dashboard-main-grid">
        <Panel
          title="งานของฉัน"
          subtitle="เรียงจากงานที่ต้องสนใจก่อน"
          actions={canReadSchedule ? <button className="link-btn" type="button" onClick={() => onNavigate("my-work")}><LocalizedText text={"ดูงานทั้งหมด"} /><Icon name="arrowRight" /></button> : undefined}
          flush
          className="dashboard-task-panel"
        >
          <Tabs
            active={taskTab}
            onChange={setTaskTab}
            tabs={[
              { id: "today", label: "วันนี้", count: todayWork.length },
              { id: "week", label: "สัปดาห์นี้", count: weekWork.length },
              { id: "done", label: "เสร็จแล้ว", count: doneWork.length },
            ]}
          />
          <div className="dashboard-task-list" role="tabpanel">
            {loading && !workItems.length ? <div className="dashboard-loading"><span className="spinner" />{t("กำลังโหลดงานของคุณ…")}</div> : null}
            {!loading && !canReadSchedule ? <EmptyState icon="lock" title="ไม่มีสิทธิ์ดู Project Schedule" message="ทางลัดโมดูลอื่นที่คุณใช้งานได้ยังแสดงอยู่ด้านล่าง" /> : null}
            {!loading && canReadSchedule && !displayedWork.length ? <EmptyState icon="checkCircle" title={taskTab === "done" ? "ยังไม่มีงานที่ปิดแล้ว" : "ไม่มีงานในช่วงนี้"} message={taskTab === "done" ? "งานที่ทำเสร็จจะกลับมาแสดงที่นี่" : "คุณไม่มีงานที่ต้องทำในช่วงเวลานี้"} /> : null}
            {displayedWork.map((item) => {
              const distance = dashboardDayDistance(dashboardDueDate(item), todayKey);
              const dateLabel = item.status === "Done"
                ? `${t("เสร็จ")} ${formatDate(dashboardDateKey(item.actualFinish ?? item.updatedAt) ?? todayKey)}`
                : distance !== null && distance < 0 ? `${t("เลยกำหนด")} ${Math.abs(distance)} ${t("วัน")}`
                  : distance === 0 ? t("ครบกำหนดวันนี้")
                    : distance !== null ? `${t("เหลือ")} ${distance} ${t("วัน")}` : t("ยังไม่ระบุวันส่ง");
              return <button className="dashboard-task-row" type="button" key={item.taskId} onClick={() => onNavigate("my-work")}>
                <span className={`dashboard-task-marker ${dashboardTaskTone(item)}`}><Icon name={item.status === "Done" ? "check" : item.status === "Blocked" ? "alertTriangle" : "calendar"} /></span>
                <span className="dashboard-task-copy"><span><strong>{item.name}</strong><Badge tone={dashboardTaskTone(item)}>{item.status}</Badge></span><small>{item.projectNo} <LocalizedText text={"·"} /> {item.projectName}</small></span>
                <span className="dashboard-task-progress"><strong>{Number(item.percentComplete)}%</strong><span className="progress"><b className={dashboardTaskTone(item)} style={{ width: `${Math.max(0, Math.min(100, Number(item.percentComplete)))}%` }} /></span></span>
                <span className={distance !== null && distance < 0 ? "dashboard-task-due late" : "dashboard-task-due"}>{dateLabel}<Icon name="chevronRight" /></span>
              </button>;
            })}
          </div>
        </Panel>

        <Panel title="ต้องจัดการต่อ" subtitle="รายการที่กำลังรอคุณ" className="dashboard-attention-panel">
          <div className="dashboard-attention-list">
            {lateWork.length ? <button type="button" onClick={() => onNavigate("my-work")}><span className="attention-icon red"><Icon name="alertTriangle" /></span><span><strong>{t("งานเลยกำหนด")}</strong><small>{t("อัปเดตสถานะหรือ Forecast")}</small></span><b>{lateWork.length}</b><Icon name="chevronRight" /></button> : null}
            {signCount ? <button type="button" onClick={() => onNavigate("signing")}><span className="attention-icon amber"><Icon name="edit" /></span><span><strong>{t("เอกสารรอลายเซ็น")}</strong><small>{t("ตรวจและลงนาม")}</small></span><b>{signCount}</b><Icon name="chevronRight" /></button> : null}
            {bootstrap.counts.approvals ? <button type="button" onClick={() => onNavigate("estimates")}><span className="attention-icon amber"><Icon name="checkCircle" /></span><span><strong>{t("Estimate รออนุมัติ")}</strong><small>{t("ตรวจต้นทุนและตัดสินใจ")}</small></span><b>{bootstrap.counts.approvals}</b><Icon name="chevronRight" /></button> : null}
            {approvalRequisitions.length ? <button type="button" onClick={() => onNavigate("approvals")}><span className="attention-icon amber"><Icon name="checkCircle" /></span><span><strong>{t("PR รออนุมัติ")}</strong><small>{t("ตรวจวงเงินและความจำเป็น")}</small></span><b>{approvalRequisitions.length}</b><Icon name="chevronRight" /></button> : null}
            {duePo.length ? <button type="button" onClick={() => onNavigate("pos")}><span className="attention-icon blue"><Icon name="truck" /></span><span><strong>{t("PO ถึงกำหนดรับ")}</strong><small>{t("ภายใน 7 วันหรือเลยกำหนด")}</small></span><b>{duePo.length}</b><Icon name="chevronRight" /></button> : null}
            {draftReceipts.length ? <button type="button" onClick={() => onNavigate("receiving")}><span className="attention-icon violet"><Icon name="download" /></span><span><strong>{t("รับของรอยืนยัน")}</strong><small>{t("ตรวจจำนวนและ QC")}</small></span><b>{draftReceipts.length}</b><Icon name="chevronRight" /></button> : null}
            {!loading && !attentionCount && !duePo.length ? <div className="dashboard-all-clear"><Icon name="checkCircle" /><span><strong>{t("เคลียร์ครบแล้ว")}</strong><small>{t("ยังไม่มีรายการที่ต้องเร่งดำเนินการ")}</small></span></div> : null}
            {loading ? <div className="dashboard-loading"><span className="spinner" />{t("กำลังตรวจรายการ…")}</div> : null}
          </div>
        </Panel>
      </section>

      <Panel title="ภาพรวมกระบวนการทำงาน" subtitle="กดที่แต่ละขั้นตอนเพื่อเปิดรายการที่เกี่ยวข้อง" className="dashboard-workflow-panel">
        <div className="dashboard-workflow">
          {visibleWorkflow.map((item, index) => <button type="button" key={item.label} className={`dashboard-flow-card ${item.tone}`} onClick={() => onNavigate(item.view)}>
            <span className="flow-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="flow-icon"><Icon name={item.icon} /></span>
            <span className="flow-copy"><strong>{t(item.label)}</strong><small>{t(item.detail)}</small></span>
            <span className="flow-count">{loading && ["Sign", "PR", "PO", "รับของ"].includes(item.label) ? "…" : item.count}</span>
            <Icon name="chevronRight" className="flow-arrow" />
          </button>)}
        </div>
      </Panel>
    </div>
  );
}

const PORTFOLIO_HEALTH_TONE: Record<ProjectHealth, Tone> = { Delayed: "red", "At Risk": "amber", "No plan": "slate", "On Track": "green", "On Hold": "slate", Completed: "blue" };
const PORTFOLIO_CHIP_COPY: Record<PortfolioChip, { label: string; tone: Tone }> = {
  overdue: { label: "Portfolio.chipOverdue", tone: "red" }, blocked: { label: "Portfolio.chipBlocked", tone: "red" },
  waiting: { label: "Portfolio.chipWaiting", tone: "amber" }, stale: { label: "Portfolio.chipStale", tone: "slate" },
  pastTarget: { label: "Portfolio.chipPastTarget", tone: "amber" },
};
const PROJECT_STAGE_FILTERS = ["All status", "Planning", "Design", "Development", "Installation", "Commissioning", "Handover", "On Hold", "Closed"];
const formatDay = (value: string) => new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(new Date(value));

function PortfolioSortHeader({ column, label, sort, onSort, className }: { column: PortfolioSortKey; label: string; sort: PortfolioSort; onSort: (key: PortfolioSortKey) => void; className?: string }) {
  const t = useUiText();
  const active = sort.key === column;
  return <th className={className} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
    <button type="button" className={`th-sort${active ? " active" : ""}`} onClick={() => onSort(column)}>{t(label)}<Icon name="chevronDown" className={active ? sort.direction : "idle"} /></button>
  </th>;
}

// Actual against where the plan says the project should be today; the tick is the plan.
function PortfolioProgress({ item }: { item: ProjectOverviewItem }) {
  const t = useUiText();
  const actual = Math.round(Number(item.progress) || 0);
  const planned = item.plannedProgress === null || item.plannedProgress === undefined ? null : Math.round(item.plannedProgress);
  const tone: Tone = actual >= 100 ? "green" : planned !== null && actual < planned ? "amber" : "blue";
  const label = planned === null ? `${actual}%` : `${actual}% · ${t("Portfolio.plannedToday")} ${planned}%`;
  return <div className="portfolio-progress" title={planned === null ? undefined : t("Portfolio.actualVsPlanned")}>
    <span className="portfolio-progress-track"><span className="progress" role="img" aria-label={label}><b className={tone} style={{ width: `${Math.max(0, Math.min(100, actual))}%` }} /></span>
      {planned !== null ? <i className="portfolio-progress-tick" aria-hidden="true" style={{ left: `${Math.max(0, Math.min(100, planned))}%` }} /> : null}</span>
    <span className="portfolio-progress-text">{planned === null ? `${actual}%` : `${actual} / ${planned}`}</span>
    {item.progressSource === "manual" ? <small className="portfolio-manual" title={t("Portfolio.manualHint")}>{t("Portfolio.manual")}</small> : null}
  </div>;
}

type PortfolioAction = { key: string; label: string; icon?: IconName; danger?: boolean; onSelect: () => void };
// A row's choices (the overflow actions, the next stages) open as a disclosure: a button with
// aria-expanded and a group of plain buttons that Tab walks through, so arrow keys never commit
// anything. The group is position: fixed from the trigger's box, which keeps the table's scroll
// area and the panel from clipping it; it flips above the trigger when the room below is short and
// closes on scroll or resize instead of drifting away from its row.
function RowDisclosure({ label, trigger, triggerClassName, disabled = false, actions }: { label: string; trigger: ReactNode; triggerClassName: string; disabled?: boolean; actions: PortfolioAction[] }) {
  const t = useUiText();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // Measured before paint, written straight to the element: the menu's real height decides the side.
  useLayoutEffect(() => {
    const anchor = button.current, menu = panel.current;
    if (!open || !anchor || !menu) return;
    // The layout viewport, which a position:fixed box is measured against; innerWidth would include the page scrollbar.
    const viewport = document.documentElement;
    const place = rowMenuPlacement(anchor.getBoundingClientRect(), { width: viewport.clientWidth, height: viewport.clientHeight }, menu.offsetHeight);
    const px = (value: number | null) => value === null ? "auto" : `${value}px`;
    menu.style.top = px(place.top);
    menu.style.bottom = px(place.bottom);
    menu.style.right = `${place.right}px`;
    menu.style.maxHeight = place.maxHeight === null ? "" : `${place.maxHeight}px`;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    const onMouseDown = (event: MouseEvent) => { if (!wrap.current?.contains(event.target as Node)) dismiss(); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { dismiss(); button.current?.focus(); } };
    // Any scroll outside the menu moves the row under a fixed menu, so the menu goes.
    const onScroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) dismiss(); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);
  if (!actions.length) return null;
  return <div className="menu-wrap" ref={wrap} onBlur={(event) => {
    // Tab moved focus past the group. A null target (focus left the window, or a browser that does
    // not focus a clicked button) is left to the mousedown handler, so a click on an item still lands.
    const next = event.relatedTarget;
    if (open && next instanceof Node && !event.currentTarget.contains(next)) setOpen(false);
  }}>
    <button ref={button} type="button" className={triggerClassName} disabled={disabled} aria-expanded={open} aria-controls={open ? panelId : undefined} aria-label={label} title={label} onClick={() => setOpen((value) => !value)}>{trigger}</button>
    {open ? <div ref={panel} id={panelId} className="menu portfolio-menu" role="group" aria-label={label}>{actions.map((action) => <button key={action.key} type="button" className={action.danger ? "danger" : undefined} onClick={() => { setOpen(false); button.current?.focus(); action.onSelect(); }}>{action.icon ? <Icon name={action.icon} /> : null}{t(action.label)}</button>)}</div> : null}
  </div>;
}

// Closing needs the date the customer took delivery; the API refuses a close without it. Unfinished
// tasks warn rather than block: closing locks the plan, so the person closing should know what is left.
function CloseProjectModal({ project, busy, onClose, onConfirm }: { project: ProjectOverviewItem; busy: boolean; onClose: () => void; onConfirm: (actualDelivery: string) => void }) {
  const t = useUiText();
  const [date, setDate] = useState(() => project.actualDelivery ?? today());
  const tooEarly = Boolean(project.startDate && date && date < project.startDate);
  const unfinished = project.taskCount - project.doneCount;
  return <Modal title="Portfolio.closeTitle" subtitle={`${project.number} · ${project.name}`} size="sm" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
    <button className="btn primary" type="button" disabled={busy || !date || tooEarly} onClick={() => onConfirm(date)}><Icon name="check" />{busy ? t("Saving…") : t("Portfolio.closeConfirm")}</button>
  </>}>
    <p>{t("Portfolio.closeHint")}</p>
    {unfinished > 0 ? <div className="info-strip" role="note"><Icon name="alertTriangle" /><span>{t("Portfolio.closeUnfinished").replace("{open}", String(unfinished)).replace("{total}", String(project.taskCount))}</span></div> : null}
    <label className="field"><span><LocalizedText text={"Actual delivery"} /></span><input type="date" required min={project.startDate || undefined} value={date} onChange={(event) => setDate(event.target.value)} /></label>
  </Modal>;
}

type PortfolioMode = "list" | "timeline";
const PORTFOLIO_SORT_LABEL: Record<PortfolioSortKey, string> = {
  health: "Portfolio.colHealth", number: "Portfolio.colNumber", name: "Portfolio.colProject", pm: "Portfolio.colPm",
  target: "Portfolio.colTarget", slip: "Portfolio.colSlip", progress: "Portfolio.colProgress", lastUpdate: "Portfolio.colLastUpdate",
};
// The overview's filters are on its link and remembered for each person (screen-link.tsx); codecs are made once.
const PORTFOLIO_MODE_LINK = choiceLink(["list", "timeline"] as const);
const PORTFOLIO_HEALTH_LINK = optionalChoiceLink(PORTFOLIO_HEALTH_ORDER);
const PORTFOLIO_CHIP_LINK = optionalChoiceLink(PORTFOLIO_CHIPS);
const PORTFOLIO_STATUS_LINK = choiceLink(PROJECT_STAGE_FILTERS);

export function ProductionProjects({ bootstrap, notify, refreshBootstrap, teamTestMode, openProjectSchedule, initialMode }: CommonProps & {
  teamTestMode: boolean;
  openProjectSchedule?: (id: number, taskId?: number) => void;
  /** The old Project Timeline menu opens the portfolio straight in Timeline mode. */
  initialMode?: PortfolioMode;
}) {
  const uiText = useUiText();
  const [mode, changeMode] = useLinkedState<PortfolioMode>("view", initialMode ?? "list", PORTFOLIO_MODE_LINK);
  const timelineMode = mode === "timeline";
  useActivitySubView(timelineMode ? "projects-timeline" : "projects-portfolio");
  const [overview, setOverview] = useState<{ items: ProjectOverviewItem[]; loadedAt: number } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useLinkedState("rows", 10, numberLink);
  // The search is on the link but not remembered: a forgotten word would hide projects next time.
  const [search, setSearch] = useLinkedState("q", "", textLink, { remember: false });
  const [status, setStatus] = useLinkedState("status", "All status", PORTFOLIO_STATUS_LINK);
  const [managerId, setManagerId] = useLinkedState("pm", null, idLink);
  const [team, setTeam] = useLinkedState("team", null, optionalTextLink);
  const [mine, setMine] = useLinkedState("mine", false, flagLink);
  const [includeClosed, setIncludeClosed] = useLinkedState("closed", false, flagLink);
  const [health, setHealth] = useLinkedState<ProjectHealth | null>("health", null, PORTFOLIO_HEALTH_LINK);
  const [chip, setChip] = useLinkedState<PortfolioChip | null>("attention", null, PORTFOLIO_CHIP_LINK);
  const sortStorageKey = portfolioSortStorageKey(bootstrap.user.id);
  const [sort, setSort] = useState<PortfolioSort>(() => { try { return parsePortfolioSort(window.localStorage.getItem(sortStorageKey)); } catch { return DEFAULT_PORTFOLIO_SORT; } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [stageBusy, setStageBusy] = useState<number | null>(null);
  const [closingProject, setClosingProject] = useState<ProjectOverviewItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [documentsProject, setDocumentsProject] = useState<ProjectSummary | null>(null);
  const [endUserProject, setEndUserProject] = useState<ProjectSummary | null>(null);
  const [membersProject, setMembersProject] = useState<ProjectSummary | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);
  // Only the newest request may land: toggling "Show closed" twice must not show the older answer.
  const latestRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setLoading(true); setError("");
    try { const data = await listProjectOverview({ includeClosed }); if (request === latestRequest.current) setOverview({ items: data.items, loadedAt: Date.now() }); }
    catch (requestError) { if (request === latestRequest.current) setError(toError(requestError)); }
    finally { if (request === latestRequest.current) setLoading(false); }
  }, [includeClosed]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  // Day requests waiting for this user's answer across projects; answered from the plan, opened on the task.
  const canAnswer = bootstrap.permissions.includes("schedule.plan") && bootstrap.permissions.includes("schedule.read");
  const [pendingRequests, setPendingRequests] = useState<PendingDayRequest[]>([]);
  useEffect(() => {
    // Once per portfolio load (loadedAt is unset until the first one lands), not once before and once after.
    if (!canAnswer || !overview?.loadedAt) return;
    let cancelled = false;
    void listPendingDayRequests().then((rows) => { if (!cancelled) setPendingRequests(rows); }).catch(() => { if (!cancelled) setPendingRequests([]); });
    return () => { cancelled = true; };
  }, [canAnswer, overview?.loadedAt]);
  const canWrite = bootstrap.permissions.includes("project.write");
  // The API has the final say (work recorded, role); this only hides a button that could never work.
  const canDelete = (project: ProjectSummary) => canWrite && (project.managerId === bootstrap.user.id || bootstrap.user.roles.some(role => role === "Engineering Manager" || role === "Admin"));
  const items = useMemo(() => overview?.items ?? [], [overview]);
  const managers = useMemo(() => [...new Map(items.map((item) => [item.managerId, item.managerName] as const)).entries()].sort((a, b) => a[1].localeCompare(b[1])), [items]);
  const teams = useMemo(() => [...new Set(items.map((item) => shownProjectTeam(item.team)).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items]);
  // The PM and team lists come from the loaded rows, so a reload can drop the chosen value; Closed
  // means nothing while closed projects are not loaded. The filter and the controls use these.
  const managerIds = useMemo(() => managers.map(([id]) => id), [managers]);
  const activeManagerId = effectiveOption(managerId, managerIds);
  const activeTeam = effectiveOption(team, teams);
  const activeStatus = effectiveStatusFilter(status, includeClosed);
  const filters = useMemo<PortfolioFilters>(() => ({ search, managerId: activeManagerId, team: activeTeam, mineUserId: mine ? bootstrap.user.id : null, status: activeStatus, health, chip }),
    [search, activeManagerId, activeTeam, mine, bootstrap.user.id, activeStatus, health, chip]);
  const view = useMemo(() => portfolioView(items, filters, overview?.loadedAt ?? 0), [items, filters, overview?.loadedAt]);
  const sorted = useMemo(() => sortPortfolio(view.rows, sort), [view.rows, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filtered = filters.search !== "" || filters.managerId !== null || filters.team !== null || mine || filters.status !== null || health !== null || chip !== null;
  const clearFilters = () => { setSearch(""); setManagerId(null); setTeam(null); setMine(false); setStatus("All status"); setHealth(null); setChip(null); setPage(1); };
  const changeSort = (key: PortfolioSortKey) => {
    const next = nextPortfolioSort(sort, key);
    setSort(next); setPage(1);
    try { window.localStorage.setItem(sortStorageKey, JSON.stringify(next)); } catch { /* The sort is a convenience when storage is blocked. */ }
  };
  const healthItems = PORTFOLIO_HEALTH_ORDER.filter((value) => (value !== "On Hold" && value !== "Completed") || view.healthCounts[value] > 0 || health === value)
    .map((value) => ({ key: value, label: `ProjectHealth.${value}`, value: view.healthCounts[value], tone: PORTFOLIO_HEALTH_TONE[value] }));
  const chipItems = PORTFOLIO_CHIPS.map((key) => ({ key, ...PORTFOLIO_CHIP_COPY[key], value: view.chipCounts[key] }));
  // One step along the lifecycle, saved with the row's version so a stale row is refused, not overwritten.
  const saveStage = async (item: ProjectOverviewItem, next: string, actualDelivery?: string) => {
    setStageBusy(item.id); setActionError("");
    try {
      await updateProject(item.id, { rowVersion: item.rowVersion, status: next, ...(actualDelivery ? { actualDelivery } : {}) });
      setClosingProject(null);
      notify(`${item.number} · ${uiText(next)}`);
      await load();
    } catch (failure) {
      setClosingProject(null);
      if (failure instanceof ApiClientError && failure.status === 409) {
        notify(`${item.number} · ${failure.code === "concurrency_conflict" ? uiText("Portfolio.stageConflict") : uiText(failure.message)}`);
        await load();
      } else setActionError(`${item.number} · ${uiText(toError(failure))}`);
    } finally { setStageBusy(null); }
  };
  const changeStage = (item: ProjectOverviewItem, next: string) => {
    if (next === item.status) return;
    if (next === "Closed") setClosingProject(item); else void saveStage(item, next);
  };
  const rowActions = (item: ProjectOverviewItem): PortfolioAction[] => [
    ...(canWrite ? [{ key: "edit", label: "Edit project", icon: "edit" as const, onSelect: () => setEditingProject({ ...item, progress: item.typedProgress }) }] : []),
    ...(item.canChangeStatus && item.allowedStatuses.includes("Closed") ? [{ key: "close", label: "Portfolio.closeTitle", icon: "checkCircle" as const, onSelect: () => setClosingProject(item) }] : []),
    ...(canWrite && canEditEndUser(item.status) ? [{ key: "end-user", label: "Portfolio.editEndUser", icon: "user" as const, onSelect: () => setEndUserProject(item) }] : []),
    { key: "members", label: "Portfolio.members", icon: "users", onSelect: () => setMembersProject(item) },
    { key: "documents", label: "Documents", icon: "paperclip", onSelect: () => setDocumentsProject(item) },
    ...(canDelete(item) ? [{ key: "delete", label: "CRM.deleteProject", icon: "trash" as const, danger: true, onSelect: () => setDeletingProject(item) }] : []),
  ];
  return <>
    <PageHeader eyebrow="APPROVED WORK" title={uiText("Projects")} subtitle="Portfolio.subtitle" actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"Create project"} /></button> : undefined} />
    <section className="portfolio-overview" aria-label={uiText("Portfolio.overview")}>
      <SegmentBar label="Portfolio.healthBar" items={healthItems} active={health} onPick={(key) => { setHealth(key as ProjectHealth | null); setPage(1); }}
        lead={<><strong>{view.barTotal}</strong><span>{uiText(includeClosed ? "Portfolio.inView" : "Portfolio.open")}</span></>} />
      <FilterChips label="Portfolio.attention" items={chipItems} active={chip} onPick={(key) => { setChip(key as PortfolioChip | null); setPage(1); }} />
    </section>
    <Toolbar>
      <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Portfolio.search" />
      <label className="select-field"><span className="sr-only">{uiText("Portfolio.pm")}</span><select value={activeManagerId ?? ""} aria-label={uiText("Portfolio.pm")} onChange={(event) => { setManagerId(event.target.value ? Number(event.target.value) : null); setPage(1); }}><option value="">{uiText("Portfolio.allPms")}</option>{managers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><Icon name="chevronDown" /></label>
      <label className="select-field"><span className="sr-only">{uiText("Portfolio.team")}</span><select value={activeTeam ?? ""} aria-label={uiText("Portfolio.team")} onChange={(event) => { setTeam(event.target.value || null); setPage(1); }}><option value="">{uiText("Portfolio.allTeams")}</option>{teams.map((value) => <option key={value} value={value}>{value}</option>)}</select><Icon name="chevronDown" /></label>
      <Select label="Status" value={activeStatus ?? "All status"} onChange={(value) => { setStatus(value); setPage(1); if (value === "Closed") setIncludeClosed(true); }} options={PROJECT_STAGE_FILTERS} />
      <label className="checkbox-row"><input type="checkbox" checked={mine} onChange={(event) => { setMine(event.target.checked); setPage(1); }} /><span>{uiText("Portfolio.mine")}</span></label>
      <label className="checkbox-row"><input type="checkbox" checked={includeClosed} onChange={(event) => { setIncludeClosed(event.target.checked); if (!event.target.checked && status === "Closed") setStatus("All status"); setPage(1); }} /><span>{uiText("Portfolio.showClosed")}</span></label>
      <div className="chip-select" role="group" aria-label={uiText("Portfolio.view")}>
        {(["list", "timeline"] as const).map((value) => <button key={value} type="button" className={mode === value ? "chip on" : "chip"} aria-pressed={mode === value} onClick={() => changeMode(value)}><Icon name={value === "list" ? "table" : "chart"} />{uiText(value === "list" ? "Portfolio.viewList" : "Portfolio.viewTimeline")}</button>)}
      </div>
      <button className="btn ghost" type="button" disabled={loading} onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
    </Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    {actionError ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{actionError}</span></div> : null}
    {pendingRequests.length ? <details className="portfolio-waiting" open>
      <summary><Icon name="clock" />{uiText("Portfolio.waitingForYou")} <strong>{pendingRequests.length}</strong></summary>
      <ul>{pendingRequests.map((request) => <li key={request.id}>
        <span className="mono">{request.projectNo}</span>
        <span className="portfolio-waiting-task">{request.wbs ? `${request.wbs} ` : ""}{request.taskName}<small className="muted">{request.requestedBy} · {formatDay(request.occurredAt)}{request.comment ? ` · “${request.comment}”` : ""}</small></span>
        <Badge tone="amber">+{request.requestDays} {uiText("days")}</Badge>
        {openProjectSchedule ? <button className="btn sm primary" type="button" onClick={() => openProjectSchedule(request.projectId, request.taskId)}><Icon name="checkCircle" />{uiText("Portfolio.reviewRequest")}</button> : null}
      </li>)}</ul>
    </details> : null}
    <Panel flush className="portfolio-panel">
      {sorted.length && mode === "timeline" ? <>
        {/* Keyed on the load, so a reload also refetches the tasks of expanded projects. */}
        <ProjectPortfolioGantt key={overview?.loadedAt ?? 0} rows={sorted} today={today()} canReadSchedule={bootstrap.permissions.includes("schedule.read")} includeClosed={includeClosed} {...(openProjectSchedule ? { openProjectSchedule } : {})}
          controls={/* The sort sits inside the timeline so it stays at hand in full screen. */
          <div className="portfolio-gantt-sort">
            <label className="select-field"><span className="sr-only">{uiText("Portfolio.sortBy")}</span><select value={sort.key} aria-label={uiText("Portfolio.sortBy")} onChange={(event) => changeSort(event.target.value as PortfolioSortKey)}>{PORTFOLIO_SORT_KEYS.map((key) => <option key={key} value={key}>{uiText(PORTFOLIO_SORT_LABEL[key])}</option>)}</select><Icon name="chevronDown" /></label>
            <button type="button" className="btn ghost sm" onClick={() => changeSort(sort.key)} aria-label={uiText(sort.direction === "asc" ? "Portfolio.sortAscending" : "Portfolio.sortDescending")} title={uiText(sort.direction === "asc" ? "Portfolio.sortAscending" : "Portfolio.sortDescending")}><Icon name="chevronDown" className={sort.direction} />{uiText(sort.direction === "asc" ? "Portfolio.sortAscending" : "Portfolio.sortDescending")}</button>
          </div>} />
      </>
        : sorted.length ? <div className="table-wrap"><TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} /><table className="portfolio-table"><thead><tr>
        <PortfolioSortHeader column="health" label="Portfolio.colHealth" sort={sort} onSort={changeSort} />
        <PortfolioSortHeader column="number" label="Portfolio.colNumber" sort={sort} onSort={changeSort} />
        <PortfolioSortHeader column="name" label="Portfolio.colProject" sort={sort} onSort={changeSort} className="portfolio-col-project" />
        <PortfolioSortHeader column="pm" label="Portfolio.colPm" sort={sort} onSort={changeSort} className="portfolio-col-pm" />
        <PortfolioSortHeader column="target" label="Portfolio.colTarget" sort={sort} onSort={changeSort} />
        <PortfolioSortHeader column="slip" label="Portfolio.colSlip" sort={sort} onSort={changeSort} className="portfolio-col-slip" />
        <PortfolioSortHeader column="progress" label="Portfolio.colProgress" sort={sort} onSort={changeSort} />
        <PortfolioSortHeader column="lastUpdate" label="Portfolio.colLastUpdate" sort={sort} onSort={changeSort} />
        <th>{uiText("Portfolio.colStage")}</th><th><span className="sr-only">{uiText("Actions")}</span></th>
      </tr></thead><tbody>{paged.map((item) => {
        const slip = formatSlip(item.slipDays);
        const customerLine = [item.customerName, item.endUserName].filter(Boolean).join(" / ");
        return <tr key={item.id}>
          <td><HealthBadge health={item.health ?? "No plan"} />{item.scheduleError ? <small className="portfolio-schedule-error" title={uiText("Portfolio.scheduleErrorHint")}>{uiText("Portfolio.scheduleError")}</small> : null}</td>
          <td><strong className="mono">{item.number}</strong></td>
          <td className="portfolio-col-project"><div className="portfolio-project">
            {openProjectSchedule ? <button type="button" className="portfolio-project-link" onClick={() => openProjectSchedule(item.id)}><strong>{item.name}</strong></button> : <strong>{item.name}</strong>}
            <small className="muted">{customerLine}{item.team ? ` · ${shownProjectTeam(item.team)}` : ""}</small>
          </div></td>
          <td className="portfolio-col-pm">{item.managerName}</td>
          <td>{item.targetDelivery ? formatDate(item.targetDelivery) : "—"}</td>
          <td className={`portfolio-col-slip portfolio-slip${(item.slipDays ?? 0) > 0 ? " late" : ""}`}>{slip === null ? "–" : uiText("Portfolio.slipDays").replace("{n}", slip)}</td>
          <td><PortfolioProgress item={item} /></td>
          <td className="muted">{item.lastProgressAt ? formatDay(item.lastProgressAt) : "—"}</td>
          <td>{item.canChangeStatus && item.allowedStatuses.length
            ? <RowDisclosure label={`${uiText("Portfolio.changeStage")} ${item.number} · ${uiText(item.status)}`} triggerClassName="portfolio-stage-trigger" disabled={stageBusy !== null}
              trigger={<><span>{uiText(item.status)}</span><Icon name="chevronDown" /></>} actions={item.allowedStatuses.map((value) => ({ key: value, label: value, onSelect: () => changeStage(item, value) }))} />
            : <Badge>{item.status}</Badge>}</td>
          <td><RowDisclosure label={`${uiText("Portfolio.more")} ${item.number}`} triggerClassName="row-action" trigger={<Icon name="more" />} actions={rowActions(item)} /></td>
        </tr>;
      })}</tbody></table><Pagination page={currentPage} pageCount={pageCount} from={(currentPage - 1) * pageSize + 1} to={Math.min(currentPage * pageSize, sorted.length)} total={sorted.length} onPage={setPage} /></div>
        : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Portfolio.loading"} /></div>
        : items.length && filtered ? <EmptyState icon="filter" title="Portfolio.noMatch" message="Portfolio.noMatchHint" action={<button className="btn ghost sm" type="button" onClick={clearFilters}><Icon name="x" />{uiText("Portfolio.clearFilters")}</button>} />
        : <EmptyState icon="folder" title="No project found" message="สร้าง Project จาก Estimate ที่อนุมัติแล้ว" />}
    </Panel>
    {closingProject ? <CloseProjectModal project={closingProject} busy={stageBusy !== null} onClose={() => setClosingProject(null)} onConfirm={(actualDelivery) => { void saveStage(closingProject, "Closed", actualDelivery); }} /> : null}
    {createOpen ? <CreateProjectModal bootstrap={bootstrap} refreshBootstrap={refreshBootstrap} notify={notify} onClose={() => setCreateOpen(false)} onCreated={async (number, deliveryNote) => { setCreateOpen(false); notify(`${number} · ${uiText("Portfolio.created")}${deliveryNote}`); await Promise.all([load(), refreshBootstrap()]); }} /> : null}
    {endUserProject ? <EndUserEditModal kind="projects" record={endUserProject} bootstrap={bootstrap} refreshBootstrap={refreshBootstrap} notify={notify} onClose={() => setEndUserProject(null)} onSaved={load} reloadRecord={async () => { const page = await listProjects({ search: endUserProject.number, pageSize: 100 }); const latest = page.items.find((item) => item.id === endUserProject.id); if (!latest) throw new Error("ไม่พบ Project หรือไม่มีสิทธิ์เข้าถึง / Project unavailable"); return latest; }} /> : null}
    {documentsProject ? <ProjectDocumentsModal project={documentsProject} canWrite={canWrite} teamTestMode={teamTestMode} notify={notify} onClose={() => setDocumentsProject(null)} /> : null}
    {membersProject ? <ProjectMembersModal project={membersProject} bootstrap={bootstrap} canWrite={canWrite} notify={notify} onClose={() => setMembersProject(null)} /> : null}
    {deletingProject ? <DeleteProjectModal project={deletingProject} onClose={() => setDeletingProject(null)} onDeleted={async (number) => { setDeletingProject(null); notify(`${number} · ${uiText("CRM.projectDeleted")}`); await Promise.all([load(), refreshBootstrap()]); }} /> : null}
    {editingProject ? <EditProjectModal bootstrap={bootstrap} project={editingProject} onClose={() => setEditingProject(null)} onSaved={async (number) => { setEditingProject(null); notify(`${number} updated`); await Promise.all([load(), refreshBootstrap()]); }} /> : null}
  </>;
}

// Deleting is offered only after the API has confirmed nothing has been worked against the
// project; otherwise the dialog names the work that keeps it.
function DeleteProjectModal({ project, onClose, onDeleted }: { project: ProjectSummary; onClose: () => void; onDeleted: (number: string) => Promise<void> }) {
  const t = useUiText();
  const [check, setCheck] = useState<ProjectDeletionCheck | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let cancelled = false; void checkProjectDeletion(project.id).then(value => { if (!cancelled) setCheck(value); }).catch(failure => { if (!cancelled) setError(toError(failure)); }); return () => { cancelled = true; }; }, [project.id]);
  const submit = async () => { setBusy(true); setError(""); try { const deleted = await deleteProject(project.id); await onDeleted(deleted.number); } catch (failure) { setError(toError(failure)); } finally { setBusy(false); } };
  return <Modal title="CRM.deleteProject" subtitle={`${project.number} · ${project.name}`} size="sm" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
    <button className="btn danger" type="button" disabled={busy || !check?.canDelete} onClick={() => { void submit(); }}><Icon name="trash" />{busy ? t("CRM.deletingProject") : t("CRM.deleteProject")}</button>
  </>}>
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{t(error)}</span></div> : null}
    {!check && !error ? <p role="status">{t("CRM.loading")}</p> : null}
    {check?.canDelete ? <p>{t("CRM.deleteProjectConfirm")}</p> : null}
    {check && !check.canDelete ? <>
      <p>{t("CRM.deleteProjectBlocked")}</p>
      <ul className="project-delete-blockers">{check.blockers.map(blocker => <li key={blocker.source}><span>{t(`ProjectWork.${blocker.source}`)}</span><strong>{blocker.count}</strong></li>)}</ul>
    </> : null}
  </Modal>;
}

function ProjectMembersModal({ project, bootstrap, canWrite, notify, onClose }: { project: ProjectSummary; bootstrap: BootstrapData; canWrite: boolean; notify: (message: string) => void; onClose: () => void }) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [addUserId, setAddUserId] = useState(0);
  const [addRole, setAddRole] = useState("");
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setMembers(await listProjectMembers(project.id));
    } catch (requestError) {
      setLoadError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const availableToAdd = bootstrap.team.filter((employee) => !members.some((member) => member.userId === employee.id));

  const add = async () => {
    if (!addUserId) return;
    setActionError("");
    setAdding(true);
    try {
      await addProjectMember(project.id, { userId: addUserId, roleOnProject: addRole.trim() || undefined });
      notify(`${bootstrap.team.find((employee) => employee.id === addUserId)?.name ?? "Member"} added to ${project.number}`);
      setAddUserId(0);
      setAddRole("");
      await load();
    } catch (requestError) {
      setActionError(toError(requestError));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (member: ProjectMember) => {
    setActionError("");
    setBusyUserId(member.userId);
    try {
      await removeProjectMember(project.id, member.userId);
      notify(`${member.name} removed from ${project.number}`);
      await load();
    } catch (requestError) {
      setActionError(toError(requestError));
    } finally {
      setBusyUserId(null);
    }
  };

  return <Modal
    title={`${project.number} · Team`}
    subtitle={`${project.name} · ทุกคนในรายการนี้จะมองเห็นโปรเจกต์นี้ได้`}
    size="lg"
    onClose={onClose}
    footer={<button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>}
  >
    {canWrite ? <div className="form-grid two">
      <label className="field"><span><LocalizedText text={"Add member *"} /></span><select value={addUserId} disabled={adding} onChange={(event) => setAddUserId(Number(event.target.value))}><option value={0}><LocalizedText text={"Select a person"} /></option>{availableToAdd.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.department}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Role on the project"} /></span><input maxLength={100} value={addRole} disabled={adding} placeholder="e.g. Support Engineer" onChange={(event) => setAddRole(event.target.value)} /></label>
      <div className="span-2"><button className="btn primary" type="button" disabled={adding || !addUserId} onClick={() => { void add(); }}><Icon name="plus" />{adding ? <LocalizedText text={"Adding…"} /> : <LocalizedText text={"Add to project"} />}</button></div>
    </div> : <div className="info-strip" role="status"><Icon name="shield" /><span><LocalizedText text={"บัญชีนี้ดูทีมงานได้ แต่ไม่มีสิทธิ์เพิ่ม/ลบสมาชิกโปรเจกต์"} /></span></div>}

    {actionError ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"ดำเนินการไม่สำเร็จ"} /></strong>{actionError}</span></div> : null}
    {loadError ? <LoadError message={loadError} retry={() => { void load(); }} /> : null}

    <Panel title={`${members.length} people`} subtitle={loading ? "Loading team…" : "Everyone who can see this project"} flush>
      {members.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Name"} /></th><th><LocalizedText text={"Role on project"} /></th><th><LocalizedText text={"Department"} /></th><th><LocalizedText text={"System role"} /></th><th><span className="sr-only"><LocalizedText text={"Actions"} /></span></th></tr></thead><tbody>{members.map((member) => <tr key={member.userId}><td><strong>{member.name}</strong><small className="muted">{member.email}</small></td><td>{member.roleOnProject}{member.isManager ? <Badge tone="blue"><LocalizedText text={"Manager"} /></Badge> : null}{member.isLeadEngineer ? <Badge tone="blue"><LocalizedText text={"Lead Engineer"} /></Badge> : null}</td><td>{member.department}</td><td className="muted">{member.systemRole}</td><td>{canWrite && !member.isManager && !member.isLeadEngineer ? <button className="btn ghost sm" type="button" disabled={busyUserId !== null} aria-label={`Remove ${member.name}`} onClick={() => { void remove(member); }}><Icon name="trash" />{busyUserId === member.userId ? <LocalizedText text={"Removing…"} /> : <LocalizedText text={"Remove"} />}</button> : null}</td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : !loadError ? <EmptyState icon="users" title="No team members yet" message="เพิ่มคนแรกที่ด้านบนเพื่อให้พวกเขามองเห็นโปรเจกต์นี้" /> : null}
    </Panel>
  </Modal>;
}

// The part of GET /projects/:id/schedule the edit dialog reads: the two phases a project is
// created with. Other schedule rows stay in Project Schedule.
type PlanNode = { id: number; kind: string; name: string; planStart: string | null; planFinish: string | null; planManDays: number; actualManDays: number;
  percentComplete: number; status: string; startMode: string; pics: { id: number }[]; children: PlanNode[] };
type PlanSnapshot = { scheduleVersion: string | null; canPlan: boolean; tasks: PlanNode[] };
const planRowLocked = (node: PlanNode) => node.status !== "Not Started" || node.percentComplete > 0 || node.actualManDays > 0 || node.children.length > 0 || node.startMode !== "manual";

// A project is edited in place rather than through a wizard: the lifecycle rules decide which
// statuses the dropdown may offer, so the screen can never ask for a move the API would refuse.
function EditProjectModal({ bootstrap, project, onClose, onSaved }: {
  bootstrap: BootstrapData;
  project: ProjectSummary;
  onClose: () => void;
  onSaved: (number: string) => Promise<void>;
}) {
  const t = useUiText();
  // Additional roles count, as they do in the API. The person already on the project stays listed even
  // when no role qualifies them any more, so the dialog shows who is assigned instead of the first name.
  const eligible = useCallback((roles: string[], keepId: number | null | undefined) => bootstrap.team.filter((member) =>
    member.id === keepId || (member.roles ?? [member.role]).some((role) => roles.includes(role))), [bootstrap.team]);
  const managers = useMemo(() => eligible(["Project Manager", "Engineering Manager", "Admin"], project.managerId), [eligible, project.managerId]);
  const engineers = useMemo(() => eligible(["Engineer", "Engineering Manager", "Admin"], project.leadEngineerId), [eligible, project.leadEngineerId]);
  const elevated = (bootstrap.user.roles ?? [bootstrap.user.role]).some((role) => ["Admin", "Engineering Manager", "Project Manager"].includes(role));
  const current = project.status as ProjectStatus;
  const statusChoices = useMemo(() => [current, ...allowedProjectTransitions(current, elevated)], [current, elevated]);
  // Seeded defensively: an older API build that omits one of these fields must leave the dialog
  // usable rather than throwing while it renders.
  const [form, setForm] = useState({
    name: project.name ?? "",
    projectType: project.projectType ?? "",
    status: project.status,
    progress: Number(project.progress ?? 0),
    managerId: project.managerId ?? 0,
    leadEngineerId: project.leadEngineerId ?? 0,
    purchaseOrderNumber: project.purchaseOrderNumber ?? "",
    purchaseOrderDate: project.purchaseOrderDate ?? "",
    startDate: project.startDate ?? "",
    targetDelivery: project.targetDelivery ?? "",
    actualDelivery: project.actualDelivery ?? "",
    site: project.site ?? "",
    remark: project.remark ?? "",
    department: shownProjectTeam(project.team),
    paymentsReceived: project.paymentsReceived ?? [],
    contactIds: project.contactIds ?? [],
  });
  const departments = projectTeamOptions(form.department);
  const [plan, setPlan] = useState<{ snapshot: PlanSnapshot; initial: string } | null>(null);
  const [planError, setPlanError] = useState("");
  const [masterPlan, setMasterPlan] = useState<MasterPlanDraft[]>([]);
  const [teamPlan, setTeamPlan] = useState<TeamPlanDraft[]>([]);
  useEffect(() => {
    let cancelled = false;
    void apiRequest<PlanSnapshot>(`/api/v1/projects/${project.id}/schedule`).then(snapshot => {
      if (cancelled) return;
      const phase = (name: string) => snapshot.tasks.find(node => node.kind === "phase" && node.name === name)?.children ?? [];
      const milestones: MasterPlanDraft[] = phase("Master Plan").map(node => ({ key: `task-${node.id}`, id: node.id, locked: planRowLocked(node), name: node.name, start: node.planStart ?? "", finish: node.planFinish ?? "" }));
      const team: TeamPlanDraft[] = phase("Team plan").map(node => ({ key: `task-${node.id}`, id: node.id, locked: planRowLocked(node), userId: node.pics[0]?.id ?? 0, task: node.name,
        start: node.planStart ?? "", finish: node.planFinish ?? "", planManDays: node.planManDays ? String(node.planManDays) : "",
        percent: node.percentComplete, actualManDays: node.actualManDays }));
      setMasterPlan(milestones); setTeamPlan(team);
      setPlan({ snapshot, initial: JSON.stringify(planPayload(milestones, team)) });
    }).catch(failure => { if (!cancelled) setPlanError(toError(failure)); });
    return () => { cancelled = true; };
  }, [project.id]);
  const planChanged = plan !== null && plan.snapshot.canPlan && JSON.stringify(planPayload(masterPlan, teamPlan)) !== plan.initial;
  const planIssues = planChanged ? planIssuesOf(t, masterPlan, teamPlan) : [];
  const span = planSpanOf(masterPlan, teamPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((state) => ({ ...state, [key]: value }));
  const closing = form.status === "Closed";
  const needsActualDelivery = closing && !form.actualDelivery;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await updateProject(project.id, {
        rowVersion: project.rowVersion,
        name: form.name.trim(),
        projectType: form.projectType.trim(),
        status: form.status,
        progress: form.progress,
        managerId: form.managerId,
        leadEngineerId: form.leadEngineerId,
        purchaseOrderNumber: form.purchaseOrderNumber.trim(),
        purchaseOrderDate: form.purchaseOrderDate,
        startDate: form.startDate,
        targetDelivery: form.targetDelivery,
        actualDelivery: form.actualDelivery || null,
        site: form.site.trim(),
        remark: form.remark,
        department: form.department.trim() || null,
        paymentsReceived: form.paymentsReceived,
        contactIds: form.contactIds,
        // The plan goes only when it changed, so an untouched plan never collides with Project Schedule.
        ...(planChanged ? { ...planPayload(masterPlan, teamPlan), scheduleVersion: plan!.snapshot.scheduleVersion } : {}),
      });
      await onSaved(saved.number);
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return <Modal
    title={`Edit ${project.number}`}
    subtitle="เลื่อนสถานะ อัปเดตความคืบหน้า และแก้ข้อมูลโครงการ พร้อมบันทึก Audit trail"
    size="xl"
    onClose={onClose}
    footer={<>
      <button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" disabled={busy || needsActualDelivery || !form.name.trim() || !form.site.trim() || !form.purchaseOrderNumber.trim() || planIssues.length > 0} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : <LocalizedText text={"Save project"} />}
      </button>
    </>}
  ><div className="project-create">
    {error ? <LoadError message={t(error)} retry={() => { void submit(); }} /> : null}
    {needsActualDelivery ? <div className="info-strip" role="note"><Icon name="alertTriangle" /><span><LocalizedText text={"ระบุวันส่งมอบจริงก่อนปิดโครงการ / Record the actual delivery date before closing"} /></span></div> : null}
    {closing ? <div className="info-strip" role="note"><Icon name="check" /><span><LocalizedText text={"ปิดโครงการแล้วความคืบหน้าจะถูกตั้งเป็น 100% / Closing sets progress to 100%"} /></span></div> : null}
    {planIssues.length ? <p role="status">{t("CRM.missingProjectFields")}: {planIssues.join(", ")}</p> : null}
    <div className="form-grid">
      <label className="field span-2"><span><LocalizedText text={"Project name *"} /></span><input required maxLength={300} value={form.name} onChange={(event) => set("name", event.target.value)} /></label>
      <TeamSelect value={form.department} departments={departments} onChange={(department) => set("department", department)} />
      <div className="field"><span>{t("CRM.planHealth")}</span><div className="project-health-cell">{project.health ? <HealthBadge health={project.health} /> : "—"}</div></div>
      <label className="field"><span><LocalizedText text={"Status"} /></span><select value={form.status} onChange={(event) => set("status", event.target.value)}>{statusChoices.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Portfolio.typedProgress"} /></span><input type="number" min={0} max={100} step={1} disabled={closing} value={closing ? 100 : form.progress} onChange={(event) => set("progress", Number(event.target.value))} /></label>
      <label className="field"><span><LocalizedText text={"Project manager"} /></span><select value={form.managerId} onChange={(event) => set("managerId", Number(event.target.value))}>{managers.some((member) => member.id === project.managerId) ? null : <option value={project.managerId}>{project.managerName}</option>}{managers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Lead engineer"} /></span><select value={form.leadEngineerId} onChange={(event) => set("leadEngineerId", Number(event.target.value))}>{engineers.some((member) => member.id === project.leadEngineerId) ? null : <option value={project.leadEngineerId}>{project.leadEngineerName}</option>}{engineers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Project type"} /></span><input maxLength={100} value={form.projectType} onChange={(event) => set("projectType", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Customer PO number *"} /></span><input required maxLength={100} value={form.purchaseOrderNumber} onChange={(event) => set("purchaseOrderNumber", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"PO date"} /></span><input type="date" value={form.purchaseOrderDate} onChange={(event) => set("purchaseOrderDate", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Actual delivery"} /></span><input type="date" min={form.startDate} value={form.actualDelivery} onChange={(event) => set("actualDelivery", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Start date"} /></span><input type="date" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Target delivery"} /></span><input type="date" min={form.startDate} value={form.targetDelivery} onChange={(event) => set("targetDelivery", event.target.value)} /></label>
      <div className="field span-2"><span aria-hidden="true">&nbsp;</span>{span && (span.start !== form.startDate || span.finish !== form.targetDelivery)
        ? <button className="btn ghost sm" type="button" onClick={() => setForm(state => ({ ...state, startDate: span.start, targetDelivery: span.finish }))}><Icon name="calendar" />{t("CRM.usePlanDates")}: {formatDate(span.start)} – {formatDate(span.finish)}</button> : null}</div>
      <label className="field span-4"><span><LocalizedText text={"Site *"} /></span><input required maxLength={300} value={form.site} onChange={(event) => set("site", event.target.value)} /></label>
    </div>
    <ContactPicker customerId={project.customerId ?? 0} value={form.contactIds} onChange={(contactIds) => set("contactIds", contactIds)} />
    {planError ? <p className="muted" role="status">{t("CRM.planUnavailable")}</p>
      : !plan ? <p className="muted" role="status">{t("CRM.loading")}</p>
      : plan.snapshot.canPlan ? <>
        <MasterPlanSection rows={masterPlan} onChange={setMasterPlan} />
        <TeamPlanSection rows={teamPlan} onChange={setTeamPlan} people={bootstrap.team} />
        <p className="muted">{t("CRM.editPlanHint")}</p>
      </> : <p className="muted">{t("CRM.planReadOnly")}</p>}
    <PaymentChecklist value={form.paymentsReceived} onChange={(paymentsReceived) => set("paymentsReceived", paymentsReceived)} />
    <label className="field"><span><LocalizedText text={"Remark"} /></span><textarea rows={3} maxLength={20000} value={form.remark} onChange={(event) => set("remark", event.target.value)} /></label>
  </div></Modal>;
}
function ProjectDocumentsModal({ project, canWrite, teamTestMode, notify, onClose }: { project: ProjectSummary; canWrite: boolean; teamTestMode: boolean; notify: (message: string) => void; onClose: () => void }) {
  const localizeCopy = useStaticCopy();
  const { lang } = useLanguage();
  const sourceRemarkLabel = lang === "TH" ? "แหล่งที่มา / หมายเหตุ" : lang === "JP" ? "引継ぎ元・備考" : "Source / remark";
  const registerCopy = lang === "TH"
    ? "รวมเอกสารที่ส่งต่ออัตโนมัติจาก Inquiry และ Site Visit พร้อมหมวดและเลขเอกสารต้นทาง"
    : lang === "JP"
      ? "Inquiry・Site Visitから自動引継ぎされた文書を、分類・元文書番号とともに表示します"
      : "Includes documents automatically carried from the Inquiry and Site Visit, with their category and source number";
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [folderCode, setFolderCode] = useState<string>(PROJECT_DOCUMENT_FOLDERS[0][0]);
  const [documentType, setDocumentType] = useState("");
  const [remark, setRemark] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [withdrawing, setWithdrawing] = useState<ProjectDocument | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setDocuments(await listProjectDocuments(project.id));
    } catch (requestError) {
      setLoadError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError("");
    if (!file) {
      setActionError("กรุณาเลือกไฟล์ที่ต้องการอัปโหลด");
      return;
    }
    if (file.size === 0) {
      setActionError("ไม่สามารถอัปโหลดไฟล์เปล่าได้");
      return;
    }
    if (file.size > MAX_PROJECT_DOCUMENT_BYTES) {
      setActionError(`ไฟล์ต้องมีขนาดไม่เกิน ${formatFileSize(MAX_PROJECT_DOCUMENT_BYTES)}`);
      return;
    }
    if (!documentType.trim()) {
      setActionError("กรุณาระบุประเภทเอกสาร");
      return;
    }
    setUploading(true);
    try {
      const created = await uploadProjectDocument(project.id, { file, folderCode, documentType: documentType.trim(), remark: remark.trim() || undefined });
      // The uploader may withdraw a fresh upload; nothing in signing uses it yet.
      setDocuments((current) => [{ ...created, canWithdraw: canWrite }, ...current]);
      setDocumentType("");
      setRemark("");
      setFile(null);
      setFileInputKey((current) => current + 1);
      notify(`${created.fileName} uploaded to ${teamTestMode ? "temporary local storage" : "NAS"}`);
    } catch (requestError) {
      setActionError(toError(requestError));
    } finally {
      setUploading(false);
    }
  };

  const startWithdraw = (document: ProjectDocument) => { setWithdrawing(document); setWithdrawReason(""); setWithdrawError(""); };
  const withdraw = async () => {
    const target = withdrawing;
    if (!target || !withdrawReason.trim()) return;
    setWithdrawBusy(true);
    setWithdrawError("");
    try {
      await withdrawProjectDocument(project.id, target.id, { rowVersion: target.rowVersion, reason: withdrawReason.trim() });
      setDocuments((current) => current.filter((item) => item.id !== target.id));
      setWithdrawing(null);
      notify(`${target.fileName} · ${localizeCopy("ProjectDocs.withdrawn")}`);
    } catch (requestError) {
      setWithdrawError(toError(requestError));
    } finally {
      setWithdrawBusy(false);
    }
  };

  const download = async (document: ProjectDocument) => {
    setDownloadingId(document.id);
    setActionError("");
    try {
      const result = await downloadProjectDocument(project.id, document.id);
      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = (result.fileName || document.fileName).replace(/[\\/:*?"<>|]/g, "_");
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (requestError) {
      setActionError(toError(requestError));
    } finally {
      setDownloadingId(null);
    }
  };

  return <Modal
    title={`${project.number} · Documents`}
    subtitle={teamTestMode
      ? `${project.name} · ไฟล์จัดเก็บชั่วคราวในเครื่องทดสอบและ metadata จัดเก็บใน SQL Server`
      : `${project.name} · ไฟล์จัดเก็บบน NAS บริษัทและ metadata จัดเก็บใน SQL Server`}
    size="xl"
    onClose={onClose}
    footer={<button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>}
  >
    {canWrite ? <form className="production-document-form" onSubmit={(event) => { void submit(event); }}>
      <div className="form-grid two">
        <label className="field"><span><LocalizedText text={"Project folder *"} /></span><select value={folderCode} disabled={uploading} onChange={(event) => setFolderCode(event.target.value)}>{PROJECT_DOCUMENT_FOLDERS.map(([code, name]) => <option key={code} value={code}>{code} <LocalizedText text={"·"} /> {name}</option>)}</select></label>
        <label className="field"><span><LocalizedText text={"Document type *"} /></span><input required maxLength={100} value={documentType} disabled={uploading} placeholder={localizeCopy("เช่น Drawing, Manual, Report")} onChange={(event) => setDocumentType(event.target.value)} /></label>
        <label className="field span-2"><span><LocalizedText text={"File * · Maximum 50 MiB"} /></span><input key={fileInputKey} required type="file" disabled={uploading} onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); setActionError(selected && selected.size > MAX_PROJECT_DOCUMENT_BYTES ? `ไฟล์ต้องมีขนาดไม่เกิน ${formatFileSize(MAX_PROJECT_DOCUMENT_BYTES)}` : ""); }} />{file ? <small>{file.name} <LocalizedText text={"·"} /> {formatFileSize(file.size)}</small> : null}</label>
        <label className="field span-2"><span><LocalizedText text={"Remark"} /></span><textarea maxLength={2000} rows={2} value={remark} disabled={uploading} onChange={(event) => setRemark(event.target.value)} /></label>
      </div>
      <div className="production-document-submit"><small>{teamTestMode ? "API ตรวจนามสกุลและขนาดไฟล์ก่อนบันทึกลงพื้นที่ทดสอบชั่วคราว; ยังไม่เชื่อมต่อ NAS" : "API ตรวจนามสกุลและขนาดไฟล์ก่อนบันทึก; Production ต้องเปิดใช้การสแกนมัลแวร์ขององค์กรก่อนเปิดรับไฟล์จริง"}</small><button className="btn primary" type="submit" disabled={uploading || !file || !documentType.trim() || file.size === 0 || file.size > MAX_PROJECT_DOCUMENT_BYTES}><Icon name="paperclip" />{uploading ? "Uploading…" : "Upload document"}</button></div>
    </form> : <div className="info-strip" role="status"><Icon name="shield" /><span><LocalizedText text={"บัญชีนี้อ่านและดาวน์โหลดเอกสารได้ แต่ไม่มีสิทธิ์อัปโหลดเอกสารโครงการ"} /></span></div>}

    {actionError ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"ดำเนินการไม่สำเร็จ"} /></strong>{actionError}</span></div> : null}
    {loadError ? <LoadError message={loadError} retry={() => { void load(); }} /> : null}

    <Panel title={`${documents.length} documents`} subtitle={loading ? "Loading document metadata…" : registerCopy} flush>
      {documents.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"File"} /></th><th><LocalizedText text={"Folder"} /></th><th><LocalizedText text={"Type"} /></th><th><LocalizedText text={"Size"} /></th><th>{sourceRemarkLabel}</th><th><LocalizedText text={"Uploaded by"} /></th><th><LocalizedText text={"Uploaded"} /></th><th><span className="sr-only"><LocalizedText text={"Actions"} /></span></th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><strong>{document.fileName}</strong><small className="document-content-type" title={document.sha256 ? `SHA-256 ${document.sha256}` : undefined}>{document.contentType}{document.sha256 ? ` · SHA-256 ${document.sha256.slice(0, 12)}…` : ""}</small></td><td><Badge>{document.folderCode}</Badge><small className="document-folder-name">{document.folderName}</small></td><td>{document.documentType}</td><td className="num">{formatFileSize(Number(document.sizeBytes))}</td><td>{document.remark || "—"}</td><td>{document.uploadedByName}</td><td className="muted">{formatDateTime(document.uploadedAt)}</td><td><button className="btn ghost sm" type="button" disabled={downloadingId !== null} aria-label={`Download ${document.fileName}`} onClick={() => { void download(document); }}><Icon name="download" />{downloadingId === document.id ? "Downloading…" : <LocalizedText text={"Download"} />}</button>{document.canWithdraw ? <button className="btn ghost sm" type="button" aria-label={`${localizeCopy("ProjectDocs.withdraw")} ${document.fileName}`} onClick={() => startWithdraw(document)}><Icon name="trash" /><LocalizedText text={"ProjectDocs.withdraw"} /></button> : null}</td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : !loadError ? <EmptyState icon="file" title="No document uploaded" message={canWrite ? (teamTestMode ? "เลือกโฟลเดอร์ ประเภทเอกสาร และไฟล์ด้านบนเพื่ออัปโหลดไปยังพื้นที่ทดสอบชั่วคราว" : "เลือกโฟลเดอร์ ประเภทเอกสาร และไฟล์ด้านบนเพื่ออัปโหลดไปยัง NAS") : "ยังไม่มีเอกสารในโครงการนี้"} /> : null}
    </Panel>
    {withdrawing ? <Modal title="ProjectDocs.withdrawTitle" subtitle={withdrawing.fileName} size="sm" onClose={() => { if (!withdrawBusy) setWithdrawing(null); }}
      footer={<><button className="btn ghost" type="button" disabled={withdrawBusy} onClick={() => setWithdrawing(null)}><LocalizedText text={"Cancel"} /></button><button className="btn danger" type="button" disabled={withdrawBusy || !withdrawReason.trim()} onClick={() => { void withdraw(); }}><Icon name="trash" /><LocalizedText text={withdrawBusy ? "Saving…" : "ProjectDocs.withdraw"} /></button></>}>
      <p className="muted"><LocalizedText text={"ProjectDocs.withdrawHint"} /></p>
      {withdrawError ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{withdrawError}</span></div> : null}
      <label className="field"><span><LocalizedText text={"ProjectDocs.withdrawReason"} /></span><textarea required maxLength={500} rows={3} value={withdrawReason} disabled={withdrawBusy} onChange={(event) => setWithdrawReason(event.target.value)} /></label>
    </Modal> : null}
  </Modal>;
}

// Only estimates whose CRM opportunity is WON; the order evidence arrives as the suggested PO.
type ProjectEstimateOption = {id:number;number:string;projectName:string;customerId:number;ownerId:number;siteLocation:string;targetDelivery:string;opportunityNo:string;purchaseOrderNumber:string;purchaseOrderDate:string};
type ProjectCreationOptions = { estimates: ProjectEstimateOption[]; people: {id:number;name:string;canManage:boolean;canLead:boolean}[]; canCreateWithoutEstimate?: boolean };
// The same list the estimate screens offer, so a project without an estimate reads like one with.
const PROJECT_TYPES = ["Automation", "IoT", "PLC", "Software", "Electrical", "Mechanical", "Robot", "AMR", "Auto Warehouse", "WMS", "WCS", "Traceability", "Vision", "Data Collection", "Other"];

/*
 * A project starts from an approved estimate on a WON order, or -- for the Application team, PMs and
 * Admins -- without one, naming its customer, name and type here. A failed save keeps everything typed:
 * its error sits beside the buttons, and the options load only fills fields nobody has filled yet.
 */
export function CreateProjectModal({ bootstrap, refreshBootstrap, notify, onClose, onCreated, initialEstimateId }: { initialEstimateId?: number; bootstrap: BootstrapData; refreshBootstrap: () => Promise<void>; notify: (message: string) => void; onClose: () => void; onCreated: (number: string, deliveryNote: string) => Promise<void> }) {
  const [options, setOptions] = useState<ProjectCreationOptions>({estimates:[],people:[]});
  const managers = options.people.filter(member=>member.canManage);
  const engineers = options.people.filter(member=>member.canLead);
  const estimates = initialEstimateId ? options.estimates.filter(item=>item.id===initialEstimateId) : options.estimates;
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsRevision, setOptionsRevision] = useState(0);
  const t = useUiText();
  const [form, setForm] = useState<CreateProjectInput>({ projectNumber: "", estimateId: 0, purchaseOrderNumber: "", purchaseOrderDate: today(), managerId: 0, leadEngineerId: 0, startDate: today(), targetDelivery: futureDate(60), site: "", remark: "", department: "", paymentsReceived: [], contactIds: [], customerId: 0, projectName: "", projectType: "" });
  const [withoutEstimate, setWithoutEstimate] = useState(false);
  const [masterPlan, setMasterPlan] = useState<MasterPlanDraft[]>([]);
  const [teamPlan, setTeamPlan] = useState<TeamPlanDraft[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  useEffect(() => { let cancelled = false; void listScheduleTemplates().then(items => { if (!cancelled) setTemplates(items); }).catch(() => undefined); return () => { cancelled = true; }; }, []);
  const departments = projectTeamOptions(form.department);
  // The team defaults to the lead engineer's team (from their department) until someone picks one.
  const departmentOf = (userId: number) => projectTeamOf(bootstrap.team.find(member => member.id === userId)?.department);
  const [inheritEndUser, setInheritEndUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  // Defaults land once. The options load again on "Try again" and when the bootstrap refreshes (a new
  // end user company), and must never clear an estimate, lead engineer or site someone already chose.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    let cancelled=false;
    void apiRequest<ProjectCreationOptions>("/api/v1/projects/creation-options").then(data=>{
      if(cancelled)return;
      setOptions(data); setLoadError("");
      if(defaultsApplied.current)return;
      defaultsApplied.current=true;
      const first=initialEstimateId ? data.estimates.find(item=>item.id===initialEstimateId) : undefined;
      const lead=data.people.find(member=>member.canLead&&member.id===first?.ownerId)?.id??0;
      setForm(current=>({...current,estimateId:current.estimateId||first?.id||0,
        managerId:current.managerId||data.people.find(member=>member.canManage&&member.id===bootstrap.user.id)?.id||0,
        leadEngineerId:current.leadEngineerId||lead,department:current.department||(lead?projectTeamOf(bootstrap.team.find(member=>member.id===lead)?.department):""),
        site:current.site||first?.siteLocation||"",targetDelivery:first?.targetDelivery||current.targetDelivery,
        purchaseOrderNumber:current.purchaseOrderNumber||first?.purchaseOrderNumber||"",purchaseOrderDate:first?.purchaseOrderDate||current.purchaseOrderDate}));
      // Nothing approved to start from: someone allowed to go without an estimate starts there.
      if(!initialEstimateId&&!data.estimates.length&&data.canCreateWithoutEstimate)setWithoutEstimate(true);
    }).catch(error=>{if(!cancelled)setLoadError(toError(error));}).finally(()=>{if(!cancelled)setLoadingOptions(false);});
    return()=>{cancelled=true;};
  }, [initialEstimateId, bootstrap.user.id, bootstrap.team, optionsRevision]);
  const standalone = withoutEstimate && !initialEstimateId;
  const selectedEstimate = standalone ? undefined : estimates.find(item=>item.id===form.estimateId);
  const customerId = standalone ? form.customerId ?? 0 : selectedEstimate?.customerId ?? 0;
  const customer = bootstrap.customers.find(item=>item.id===customerId);
  const canChooseSource = !initialEstimateId && Boolean(options.canCreateWithoutEstimate);
  // With plan rows the project runs from the first row to the last, so its dates are not typed twice.
  const planned = masterPlan.length + teamPlan.length > 0;
  const span = planSpanOf(masterPlan, teamPlan);
  const planIssues = planIssuesOf(t, masterPlan, teamPlan);
  const missingFields = [
    ...(standalone ? [!form.customerId ? "Customer *" : "", !form.projectName?.trim() ? "Project name *" : "", !form.projectType ? "Project type *" : ""]
      : [!form.estimateId ? "Approved estimate *" : ""]),
    !form.projectNumber.trim() ? "CRM.projectNoFromErp" : "", !form.purchaseOrderNumber.trim() ? "Customer PO number *" : "",
    !form.purchaseOrderDate ? "PO date *" : "", !form.managerId ? "Project manager *" : "", !form.leadEngineerId ? "Lead engineer *" : "",
    !planned && !form.startDate ? "Start date *" : "", !planned && !form.targetDelivery ? "Target delivery *" : "", !form.site.trim() ? "Site *" : "",
  ].filter(Boolean);
  const datesInvalid = planned ? !span : !form.startDate || !form.targetDelivery || form.targetDelivery < form.startDate;
  const update = (patch: Partial<CreateProjectInput>) => { setSaveError(""); setForm(current => ({ ...current, ...patch })); };
  const submit = async () => { setBusy(true); setSaveError(""); try {
    const { customerId: chosenCustomer, projectName, projectType, estimateId, ...shared } = form;
    const input: CreateProjectInput = { ...shared, projectNumber: form.projectNumber.trim(), startDate: span?.start ?? form.startDate, targetDelivery: span?.finish ?? form.targetDelivery,
      department: form.department?.trim() || null, ...planPayload(masterPlan, teamPlan),
      ...(standalone ? { withoutEstimate: true, customerId: chosenCustomer, projectName: projectName?.trim(), projectType } : { estimateId }) };
    if (standalone) input.endUserCustomerId = form.endUserCustomerId ?? null;
    else if (inheritEndUser) delete input.endUserCustomerId; else input.endUserCustomerId = form.endUserCustomerId ?? null;
    const created = await createProject(input); await onCreated(created.number, assignmentDeliveryNote(created.notification)); } catch (requestError) { setSaveError(toError(requestError)); } finally { setBusy(false); } };
  return <Modal title="Create project" subtitle={standalone ? "CRM.projectGateWithoutEstimate" : "CRM.projectGate"} size="xl" onClose={onClose} footer={<>
    {saveError ? <span className="project-create-error" role="alert"><Icon name="alertTriangle" /><span>{t(saveError)}</span></span> : <span className="spacer" />}
    <button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || loadingOptions || missingFields.length > 0 || planIssues.length > 0 || datesInvalid} onClick={() => { void submit(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : <LocalizedText text={"Create project"} />}</button></>}><div className="project-create">
    {loadError ? <LoadError message={t(loadError)} retry={() => { setLoadError("");setLoadingOptions(true);setOptionsRevision(value=>value+1); }} /> : null}
    {canChooseSource ? <div className="seg-control" role="group" aria-label={t("CRM.projectSource")}>
      <button type="button" className={standalone ? "" : "on"} aria-pressed={!standalone} disabled={busy} onClick={() => { setSaveError(""); setWithoutEstimate(false); }}>{t("CRM.projectFromEstimate")}</button>
      <button type="button" className={standalone ? "on" : ""} aria-pressed={standalone} disabled={busy} onClick={() => { setSaveError(""); setWithoutEstimate(true); }}>{t("CRM.projectWithoutEstimate")}</button>
    </div> : null}
    {loadingOptions?<p role="status">{t("CRM.loading")}</p>:standalone?null:!estimates.length?<p className="alert warn">{t("CRM.noEligibleEstimate")}</p>:initialEstimateId&&!estimates.some(e=>e.id===initialEstimateId)?<p className="alert warn">{t("CRM.sourceUnavailable")}</p>:null}
    {!loadingOptions&&(missingFields.length||planIssues.length)?<p role="status">{t("CRM.missingProjectFields")}: {[...missingFields.map(field=>t(field)), ...planIssues].join(", ")}</p>:null}
    <div className="form-grid">
      {standalone ? <>
        {/* Typed search, not a long select: the customer list runs to hundreds of names. */}
        <div className="field span-2"><span><LocalizedText text={"Customer *"} /></span><SearchSelect value={form.customerId ? String(form.customerId) : ""} required disabled={busy}
          options={bootstrap.customers.map((item) => ({ value: String(item.id), label: `${item.code} — ${item.name}`,
            detail: [item.nameTh, item.nameEn, item.nameJa].filter((name) => name && name !== item.name).join(" / ") }))}
          onChange={(value) => update({ customerId: Number(value) || 0, contactIds: [], endUserCustomerId: null })}
          label={t("Customer *")} placeholder={t("CRM.searchCustomer")} noMatchText={t("CRM.noMatch")} clearLabel={t("CRM.clearChoice")}
          showLabel={t("CRM.showOptions")} moreText={t("CRM.listCut")} /></div>
        <label className="field span-2"><span><LocalizedText text={"Project name *"} /></span><input required maxLength={300} value={form.projectName ?? ""} onChange={(event) => update({ projectName: event.target.value })} /></label>
        <label className="field"><span><LocalizedText text={"Project type *"} /></span><select disabled={busy} value={form.projectType ?? ""} onChange={(event) => update({ projectType: event.target.value })}><option value="">{t("CRM.selectProjectType")}</option>{PROJECT_TYPES.map((type) => <option key={type} value={type}>{t(type)}</option>)}</select></label>
      </> : <>
        <label className="field span-2"><span><LocalizedText text={"Approved estimate *"} /></span><select disabled={busy || loadingOptions || Boolean(initialEstimateId)} value={form.estimateId} onChange={(event) => {const estimate=estimates.find(item=>item.id===Number(event.target.value));const lead=engineers.some(member=>member.id===estimate?.ownerId)?Number(estimate?.ownerId):0;update({ estimateId:Number(event.target.value),leadEngineerId:lead,department:form.department||departmentOf(lead),site:estimate?.siteLocation??"",targetDelivery:estimate?.targetDelivery||form.targetDelivery,purchaseOrderNumber:estimate?.purchaseOrderNumber??"",purchaseOrderDate:estimate?.purchaseOrderDate||today(),contactIds:[] });}}><option value={0}><LocalizedText text={"Select approved estimate"} /></option>{estimates.map((item) => <option key={item.id} value={item.id}>{item.opportunityNo} · {item.number} — {item.projectName}</option>)}</select></label>
        <div className="field span-2"><span><LocalizedText text={"Customer"} /></span><div className="info-strip">{customer?.name||"—"}</div></div>
      </>}
      <label className="field"><span>{t("CRM.projectNoFromErp")}</span><input required maxLength={30} autoComplete="off" placeholder={t("CRM.projectNoPlaceholder")} value={form.projectNumber} onChange={(event) => update({ projectNumber: event.target.value })} /></label>
      {standalone ? null : <div className="field span-2"><span>{t("CRM.projectName")}</span><div className="info-strip">{selectedEstimate?.projectName||"—"}</div></div>}
      <TeamSelect value={form.department ?? ""} departments={departments} onChange={(department) => update({ department })} />
      <label className="field"><span><LocalizedText text={"Project manager *"} /></span><select value={form.managerId} onChange={(event) => update({ managerId: Number(event.target.value) })}><option value={0}>{t("CRM.selectProjectManager")}</option>{managers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Lead engineer *"} /></span><select value={form.leadEngineerId} onChange={(event) => { const lead = Number(event.target.value); update({ leadEngineerId: lead, department: form.department || departmentOf(lead) }); }}><option value={0}>{t("CRM.selectLeadEngineer")}</option>{engineers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Customer PO number *"} /></span><input required maxLength={100} value={form.purchaseOrderNumber} onChange={(event) => update({ purchaseOrderNumber: event.target.value })} /></label>
      <label className="field"><span><LocalizedText text={"PO date *"} /></span><input type="date" value={form.purchaseOrderDate} onChange={(event) => update({ purchaseOrderDate: event.target.value })} /></label>
      <label className="field span-4"><span><LocalizedText text={"Site *"} /></span><input required maxLength={300} value={form.site} onChange={(event) => update({ site: event.target.value })} /></label>
      {standalone ? <EndUserCompanyField bootstrap={bootstrap} customerId={customerId} value={form.endUserCustomerId ?? null} disabled={busy || !customerId} onChange={(endUserCustomerId) => update({ endUserCustomerId })} refreshBootstrap={refreshBootstrap} notify={notify} /> : null}
    </div>
    <ContactPicker customerId={customerId} value={form.contactIds ?? []} onChange={(contactIds) => update({ contactIds })} />
    <MasterPlanSection rows={masterPlan} onChange={(change) => { setSaveError(""); setMasterPlan(change); }} templates={templates} />
    <TeamPlanSection rows={teamPlan} onChange={(change) => { setSaveError(""); setTeamPlan(change); }} people={bootstrap.team} />
    {planned ? <div className="info-strip" role="note"><Icon name="calendar" /><span>{t("CRM.projectSpanFromPlan")}{span ? `: ${formatDate(span.start)} – ${formatDate(span.finish)}` : ""}</span></div> : <div className="form-grid two">
      <label className="field"><span><LocalizedText text={"Start date *"} /></span><input type="date" value={form.startDate} onChange={(event) => update({ startDate: event.target.value })} /></label>
      <label className="field"><span><LocalizedText text={"Target delivery *"} /></span><input type="date" min={form.startDate} value={form.targetDelivery} onChange={(event) => update({ targetDelivery: event.target.value })} /></label>
    </div>}
    <PaymentChecklist value={form.paymentsReceived ?? []} onChange={(paymentsReceived) => update({ paymentsReceived })} />
    <details><summary>{t("CRM.projectOptionalDetails")}</summary><div className="form-grid two">
      {standalone ? null : <div className="span-2"><label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={inheritEndUser} disabled={busy} onChange={(event) => setInheritEndUser(event.target.checked)} /><LocalizedText text={"ใช้ End user จาก Inquiry ต้นทาง / Inherit from Inquiry"} /></label></div>}
      {!standalone && !inheritEndUser ? <EndUserCompanyField bootstrap={bootstrap} customerId={customerId} value={form.endUserCustomerId ?? null} disabled={busy} onChange={(endUserCustomerId) => update({ endUserCustomerId })} refreshBootstrap={refreshBootstrap} notify={notify} /> : null}
      <label className="field span-2"><span><LocalizedText text={"Remark"} /></span><textarea rows={3} maxLength={20000} value={form.remark||""} onChange={(event)=>update({remark:event.target.value})}/></label>
    </div></details>
    <p className="muted">{t("CRM.projectPlanLater")}</p>
  </div></Modal>;
}

export function ProductionInventory({ bootstrap }: Pick<CommonProps, "bootstrap">) {
  const uiText = useUiText();
  const [items, setItems] = useState<ItemBalance[]>([]);
  const [search, setSearch] = useState("");
  const [reorderOnly, setReorderOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems(await listInventory({ search, reorderOnly })); } catch (requestError) { setError(toError(requestError)); } finally { setLoading(false); } }, [search, reorderOnly]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);
  const totals = useMemo(() => ({ available: items.reduce((sum, item) => sum + Number(item.available), 0), value: items.reduce((sum, item) => sum + Number(item.usable) * Number(item.averageUnitCost), 0), reorder: items.filter((item) => Number(item.available) <= Number(item.reorderLevel)).length }), [items]);
  return <>
    <PageHeader eyebrow="MATERIAL CONTROL" title={uiText("Inventory")} subtitle={`สิทธิ์ปัจจุบัน: ${bootstrap.user.role} · ยอดคงเหลือคำนวณจาก immutable stock ledger`} />
    <div className="kpi-grid three"><KpiCard label="Items" value={items.length} icon="package" tone="blue" /><KpiCard label="Available units" value={totals.available.toLocaleString(currentLocale())} icon="database" tone="green" /><KpiCard label="Reorder alerts" value={totals.reorder} note={formatMoney(totals.value)} icon="alertTriangle" tone={totals.reorder ? "amber" : "slate"} /></div>
    <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search item, part no., description or brand…" /><label className="checkbox-row"><input type="checkbox" checked={reorderOnly} onChange={(event) => setReorderOnly(event.target.checked)} /><span><LocalizedText text={"Reorder only"} /></span></label><button className="btn ghost" type="button" onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button></Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${items.length} inventory items`} subtitle={loading ? "Loading from production API…" : "Live stock ledger balance"} flush>{items.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Item code"} /></th><th><LocalizedText text={"Part no."} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Brand"} /></th><th><LocalizedText text={"Location"} /></th><th><LocalizedText text={"Usable"} /></th><th><LocalizedText text={"Quarantine"} /></th><th><LocalizedText text={"Reserved"} /></th><th><LocalizedText text={"Available"} /></th><th><LocalizedText text={"On order"} /></th><th><LocalizedText text={"Avg. cost"} /></th><th><LocalizedText text={"Reorder"} /></th></tr></thead><tbody>{items.map((item) => { const reorder = Number(item.available) <= Number(item.reorderLevel); return <tr key={item.itemId} className={reorder ? "row-wait" : undefined}><td><strong className="mono">{item.itemCode}</strong></td><td className="mono">{item.partNumber}</td><td>{item.description}</td><td>{item.brand}</td><td>{item.location}</td><td className="num">{Number(item.usable).toLocaleString(currentLocale())}</td><td className="num">{Number(item.quarantine).toLocaleString(currentLocale())}</td><td className="num">{Number(item.reserved).toLocaleString(currentLocale())}</td><td className="num"><strong>{Number(item.available).toLocaleString(currentLocale())}</strong> {item.unit}</td><td className="num">{Number(item.onOrder).toLocaleString(currentLocale())}</td><td className="num">{formatMoney(Number(item.averageUnitCost))}</td><td>{reorder ? <Badge tone="amber"><LocalizedText text={"Reorder"} /></Badge> : <Badge tone="green"><LocalizedText text={"OK"} /></Badge>}</td></tr>; })}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : <EmptyState icon="database" title="No inventory item found" message="เพิ่ม Material master และรับสินค้าเข้าระบบก่อน" />}</Panel>
  </>;
}

type MasterTab = "customers" | "suppliers" | "employees" | "inventory" | "rates" | "team";

export function ProductionMasterData({ bootstrap, notify, refreshBootstrap, onOpenInquiries, destination }: CommonProps & { onOpenInquiries?: () => void; destination?: MasterTab }) {
  const uiText = useUiText();
  const [localTab, setTab] = useState<MasterTab>("customers");
  const tab = destination ?? localTab;
  const canWrite = bootstrap.permissions.includes("master.write");
  const canViewRates = bootstrap.user.roles.some(canViewEngineeringRates);
  const tabs: { id: MasterTab; label: string; count?: number }[] = [
    { id: "customers", label: "Customers", count: bootstrap.customers.length },
    { id: "suppliers", label: "Suppliers", count: bootstrap.suppliers.length },
    { id: "employees", label: "Employees" },
    { id: "inventory", label: "Inventory items" },
    ...(canViewRates ? [{ id: "rates" as const, label: "Engineering rates" }] : []),
    { id: "team", label: "User accounts", count: bootstrap.team.length },
  ];

  return <>
    <PageHeader
      eyebrow="CONTROLLED MASTER RECORDS"
      title={uiText(destination ? destination === "team" ? "User Accounts & Permissions" : tabs.find(item => item.id === destination)?.label ?? "Master Data" : "Master Data")}
      subtitle="ค้นหาและจัดการข้อมูลกลางสำหรับลูกค้า ผู้ขาย บุคลากร สินค้า และอัตราค่าแรง"
      meta={<Badge tone={canWrite ? "green" : "slate"}>{canWrite ? "Create access" : "Read only"}</Badge>}
    />
    {!destination ? <Tabs tabs={tabs} active={tab} onChange={setTab} /> : null}
    <div className="master-data-content">
      {tab === "customers" ? <ProductionCustomers embedded bootstrap={bootstrap} notify={notify} refreshBootstrap={refreshBootstrap} onOpenInquiries={onOpenInquiries} /> : null}
      {tab === "suppliers" ? <SupplierMasterTab bootstrap={bootstrap} canWrite={canWrite} canCreate={canWrite || bootstrap.permissions.includes("estimate.write")} notify={notify} refreshBootstrap={refreshBootstrap} /> : null}
      {tab === "employees" ? <EmployeeMasterTab canWrite={canWrite} notify={notify} /> : null}
      {tab === "inventory" ? <InventoryItemMasterTab bootstrap={bootstrap} canWrite={canWrite} notify={notify} refreshBootstrap={refreshBootstrap} /> : null}
      {tab === "rates" && canViewRates ? <ProductionEngineeringRates embedded bootstrap={bootstrap} notify={notify} refreshBootstrap={refreshBootstrap} /> : null}
      {tab === "team" ? <TeamReferenceTab bootstrap={bootstrap} canManageRoles={bootstrap.permissions.includes("admin.manage_roles")} notify={notify} refreshBootstrap={refreshBootstrap} /> : null}
    </div>
  </>;
}

type MasterTabProps = CommonProps & { canWrite: boolean };

function useMasterForm(refreshBootstrap: () => Promise<void>, notify: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (
    form: HTMLFormElement,
    action: () => Promise<unknown>,
    successMessage: string,
    afterReset?: () => void,
  ) => {
    setBusy(true);
    setError("");
    try {
      await action();
      form.reset();
      afterReset?.();
      try {
        await refreshBootstrap();
        notify(successMessage);
      } catch (refreshError) {
        setError(`บันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ: ${toError(refreshError)}`);
      }
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, submit };
}

function MasterFormError({ message }: { message: string }) {
  if (!message) return null;
  return <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"โปรดตรวจสอบรายการนี้"} /></strong>{message}</span></div>;
}

function SupplierMasterTab({ bootstrap, canWrite, canCreate, notify, refreshBootstrap }: MasterTabProps & { canCreate: boolean }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<{ id: number; code: string; name: string; category: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const suppliers = bootstrap.suppliers.filter((supplier) =>
    [supplier.code, supplier.name, supplier.category].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const pageCount = Math.max(1, Math.ceil(suppliers.length / pageSize));
  const resolvedPage = Math.min(page, pageCount);
  const from = suppliers.length ? (resolvedPage - 1) * pageSize + 1 : 0;
  const to = Math.min(resolvedPage * pageSize, suppliers.length);
  const deleteSupplierRow = async (supplier: { id: number; code: string; name: string }) => {
    if (!window.confirm(`ลบ Supplier "${supplier.name}" (${supplier.code}) ใช่หรือไม่?`)) return;
    setDeletingId(supplier.id);
    try {
      await deleteSupplier(supplier.id);
      await refreshBootstrap();
      notify(`ลบ Supplier ${supplier.code} แล้ว`);
    } catch (e) {
      notify("ลบไม่สำเร็จ: " + toError(e));
    } finally {
      setDeletingId(null);
    }
  };
  return <>
    <Toolbar><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search supplier code, name or category…" />
      {canCreate ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"Add supplier"} /></button> : null}
    </Toolbar>
    <Panel title={suppliers.length + " suppliers"} subtitle="ข้อมูลผู้ขายชุดเดียวกันสำหรับ Cost item และ Preferred supplier" flush>
      {suppliers.length ? <div className="table-wrap"><TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} /><table>
        <thead><tr><th><LocalizedText text={"Code"} /></th><th><LocalizedText text={"Supplier name"} /></th><th><LocalizedText text={"Category"} /></th>{canWrite ? <th></th> : null}</tr></thead>
        <tbody>{suppliers.slice(from - 1, to).map((supplier) => (
          <tr key={supplier.id}>
            <td><strong className="mono">{supplier.code}</strong></td>
            <td><strong>{supplier.name}</strong></td>
            <td><Badge>{supplier.category}</Badge></td>
            {canWrite ? (
              <td>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn ghost sm" type="button" onClick={() => setEditingSupplier(supplier)}><Icon name="edit" />Edit</button>
                  <button className="btn ghost sm" type="button" disabled={deletingId === supplier.id}
                    onClick={() => { void deleteSupplierRow(supplier); }} style={{ color: "#dc2626" }}>
                    <Icon name="trash" />{deletingId === supplier.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </td>
            ) : null}
          </tr>
        ))}</tbody>
      </table><Pagination page={resolvedPage} pageCount={pageCount} from={from} to={to} total={suppliers.length} onPage={setPage} /></div> : <EmptyState icon="truck" title="No supplier found" message="ลองเปลี่ยนคำค้นหา หรือกด Add supplier เพื่อเพิ่มผู้ขาย" />}
    </Panel>
    {createOpen ? <Modal title="Add supplier" size="lg" onClose={() => setCreateOpen(false)}><SupplierCreateForm notify={(message) => { setCreateOpen(false); notify(message); }} refreshBootstrap={refreshBootstrap} /></Modal> : null}
    {editingSupplier ? (
      <SupplierEditModal
        supplier={editingSupplier}
        notify={notify}
        refreshBootstrap={refreshBootstrap}
        onClose={() => setEditingSupplier(null)}
      />
    ) : null}
  </>;
}

function SupplierEditModal({
  supplier,
  notify,
  refreshBootstrap,
  onClose,
}: {
  supplier: { id: number; code: string; name: string; category: string };
  notify: (msg: string) => void;
  refreshBootstrap: () => Promise<void>;
  onClose: () => void;
}) {
  const { busy, error, submit } = useMasterForm(refreshBootstrap, (msg) => { onClose(); notify(msg); });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const brands = (data.get("brands") as string ?? "").split(",").map((b) => b.trim()).filter(Boolean);
    void submit(form, async () => {
      await updateSupplier(supplier.id, {
        name: data.get("name") as string,
        category: data.get("category") as string,
        contact: (data.get("contact") as string) || undefined,
        email: (data.get("email") as string) || undefined,
        phone: (data.get("phone") as string) || undefined,
        brands,
      });
    }, `Supplier ${supplier.code} updated`);
  };
  return (
    <Modal title={`Edit ${supplier.code}`} size="lg" onClose={onClose}>
      <MasterFormError message={error} />
      <form onSubmit={onSubmit}>
        <div className="form-grid two">
          <label className="field"><span>Code (read-only)</span><input value={supplier.code} readOnly /></label>
          <label className="field"><span>Name *</span><input name="name" defaultValue={supplier.name} required maxLength={300} /></label>
          <label className="field"><span>Category *</span><input name="category" defaultValue={supplier.category} required maxLength={100} /></label>
          <label className="field"><span>Contact</span><input name="contact" maxLength={200} /></label>
          <label className="field"><span>Email</span><input name="email" type="email" maxLength={200} /></label>
          <label className="field"><span>Phone</span><input name="phone" maxLength={50} /></label>
          <label className="field" style={{ gridColumn: "span 2" }}><span>Brands (comma-separated)</span><input name="brands" maxLength={2000} /></label>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn default" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

const BLANK_SUPPLIER = { code: "", name: "", category: "", contact: "", email: "", phone: "", brands: "" };

function SupplierCreateForm({ notify, refreshBootstrap }: Pick<CommonProps, "notify" | "refreshBootstrap">) {
  const localizeCopy = useStaticCopy();
  const { busy, error, submit } = useMasterForm(refreshBootstrap, notify);
  // Controlled so a scanned card can fill the blanks the person has not typed yet.
  const [form, setForm] = useState({ ...BLANK_SUPPLIER });
  const update = <K extends keyof typeof BLANK_SUPPLIER>(key: K, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  // A card never carries a supplier code or a category, so the code is suggested from
  // the company name and the category is left for the person to choose.
  const applyBusinessCard = (result: BusinessCardExtraction) => {
    const fields: { key: keyof typeof BLANK_SUPPLIER; value: string; label: string }[] = [
      { key: "name", value: result.companyName, label: "ชื่อผู้ขาย" },
      { key: "code", value: supplierCodeFromName(result.companyName), label: "รหัสผู้ขาย" },
      { key: "contact", value: result.contactName, label: "ผู้ติดต่อ" },
      { key: "email", value: result.email, label: "อีเมล" },
      { key: "phone", value: result.phone, label: "โทรศัพท์" },
    ];
    const fillable = fields.filter((field) => field.value && !form[field.key].trim());
    if (fillable.length) setForm((current) => {
      const next = { ...current };
      for (const field of fillable) if (!next[field.key].trim()) next[field.key] = field.value;
      return next;
    });
    return fillable.map((field) => field.label);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const brands = form.brands.split(",").map((brand) => brand.trim()).filter(Boolean);
    const input: CreateSupplierInput = {
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      contact: form.contact.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      brands,
    };
    void submit(element, async () => {
      if (brands.length > 100) throw new Error("Brands ใส่ได้ไม่เกิน 100 รายการ");
      if (brands.some((brand) => brand.length > 100)) throw new Error("Brand แต่ละรายการต้องยาวไม่เกิน 100 ตัวอักษร");
      await createSupplier(input);
    }, `Supplier ${input.code.toUpperCase()} created`, () => setForm({ ...BLANK_SUPPLIER }));
  };

  return <Panel title="Add supplier" subtitle="ใช้ใน Cost item และ Preferred supplier">
    <form onSubmit={onSubmit}>
      <MasterFormError message={error} />
      <BusinessCardScanner disabled={busy} onApply={applyBusinessCard} />
      <div className="form-grid two">
        <label className="field"><span><LocalizedText text={"Supplier code *"} /></span><input name="code" required maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9._/-]*" autoCapitalize="characters" autoComplete="off" placeholder="SUP-001" value={form.code} onChange={(event) => update("code", event.target.value)} /></label>
        <label className="field"><span><LocalizedText text={"Supplier name *"} /></span><input name="name" required maxLength={300} autoComplete="organization" value={form.name} onChange={(event) => update("name", event.target.value)} /></label>
        <label className="field"><span><LocalizedText text={"Category *"} /></span><input name="category" required maxLength={100} placeholder={localizeCopy("Automation equipment")} value={form.category} onChange={(event) => update("category", event.target.value)} /></label>
        <label className="field"><span><LocalizedText text={"Contact person"} /></span><input name="contact" maxLength={200} autoComplete="name" value={form.contact} onChange={(event) => update("contact", event.target.value)} /></label>
        <label className="field"><span><LocalizedText text={"Email"} /></span><input name="email" type="email" maxLength={256} autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label>
        <label className="field"><span><LocalizedText text={"Phone"} /></span><input name="phone" type="tel" maxLength={100} autoComplete="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label>
        <label className="field span-2"><span><LocalizedText text={"Brands"} /></span><input name="brands" maxLength={10099} placeholder="Siemens, Omron, SMC" value={form.brands} onChange={(event) => update("brands", event.target.value)} /><small><LocalizedText text={"คั่นแต่ละ Brand ด้วย comma; สูงสุด 100 รายการ และรายการละ 100 ตัวอักษร"} /></small></label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}><button className="btn primary" type="submit" disabled={busy}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Create supplier"}</button></div>
    </form>
  </Panel>;
}

function InventoryItemMasterTab({ bootstrap, canWrite, notify, refreshBootstrap }: MasterTabProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  return <>
    <Toolbar><span className="muted"><LocalizedText text={"ทะเบียนสินค้าใช้ร่วมกับ Inventory · การเพิ่มสินค้าไม่เพิ่มยอด Stock"} /></span>{canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"Add inventory item"} /></button> : null}</Toolbar>
    {bootstrap.permissions.includes("inventory.read") ? <InventoryMasterList key={revision} /> :
    <Panel title="Inventory item rules" subtitle="ข้อมูลตั้งต้นสำหรับ Stock ledger">
      <div className="settings-list">
        <div><span className="setting-icon blue"><Icon name="package" /></span><span><strong><LocalizedText text={"Stable item code"} /></strong><small><LocalizedText text={"รหัส Item ต้องไม่ซ้ำ และรองรับตัวอักษร ตัวเลข . _ / -"} /></small></span></div>
        <div><span className="setting-icon green"><Icon name="database" /></span><span><strong><LocalizedText text={"Opening balance is separate"} /></strong><small><LocalizedText text={"การสร้าง Master ไม่เพิ่มยอด Stock; ยอดคงเหลือมาจาก Stock ledger เท่านั้น"} /></small></span></div>
        <div><span className="setting-icon amber"><Icon name="truck" /></span><span><strong>{bootstrap.suppliers.length} <LocalizedText text={"active suppliers"} /></strong><small><LocalizedText text={"Preferred supplier เป็นตัวเลือก ไม่บังคับสำหรับการสร้าง Item"} /></small></span></div>
      </div>
    </Panel>}
    {createOpen ? <Modal title="Add inventory item" size="lg" onClose={() => setCreateOpen(false)}><InventoryItemCreateForm bootstrap={bootstrap} notify={(message) => { setCreateOpen(false); setRevision((value) => value + 1); notify(message); }} refreshBootstrap={refreshBootstrap} /></Modal> : null}
  </>;
}

function InventoryMasterList() {
  const [items, setItems] = useState<ItemBalance[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void listInventory({}).then((result) => { if (!cancelled) { setItems(result); setError(""); } })
      .catch((reason) => { if (!cancelled) setError(toError(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);
  const filtered = items.filter((item) => [item.itemCode, item.partNumber, item.description, item.brand, item.location].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const resolvedPage = Math.min(page, pageCount);
  const from = filtered.length ? (resolvedPage - 1) * pageSize + 1 : 0;
  const to = Math.min(resolvedPage * pageSize, filtered.length);
  return <>
    <Toolbar><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search item code, part number, description or brand…" /></Toolbar>
    {error ? <LoadError message={error} retry={() => { setLoading(true); setRetry((value) => value + 1); }} /> : null}
    <Panel title={`${filtered.length} inventory items`} subtitle="ข้อมูลสินค้าอ้างอิง · ดูยอดคงเหลือและการเคลื่อนไหวที่เมนู Inventory" flush>
      {loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : filtered.length ? <div className="table-wrap"><TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} /><table><thead><tr><th><LocalizedText text={"Item code"} /></th><th><LocalizedText text={"Part no."} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Brand"} /></th><th><LocalizedText text={"Unit"} /></th><th><LocalizedText text={"Location"} /></th></tr></thead><tbody>{filtered.slice(from - 1, to).map((item) => <tr key={item.itemId}><td><strong className="mono">{item.itemCode}</strong></td><td>{item.partNumber || "—"}</td><td>{item.description}</td><td>{item.brand || "—"}</td><td>{item.unit}</td><td>{item.location || "—"}</td></tr>)}</tbody></table><Pagination page={resolvedPage} pageCount={pageCount} from={from} to={to} total={filtered.length} onPage={setPage} /></div> : !error ? <EmptyState icon="package" title="No inventory item found" message="ลองเปลี่ยนคำค้นหา หรือเพิ่มข้อมูลสินค้า" /> : null}
    </Panel>
  </>;
}

function InventoryItemCreateForm({ bootstrap, notify, refreshBootstrap }: Pick<CommonProps, "bootstrap" | "notify" | "refreshBootstrap">) {
  const { busy, error, submit } = useMasterForm(refreshBootstrap, notify);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const preferredSupplier = formText(data, "preferredSupplierId");
    const input: CreateInventoryItemInput = {
      itemCode: formText(data, "itemCode"),
      partNumber: optionalFormText(data, "partNumber"),
      description: formText(data, "description"),
      brand: optionalFormText(data, "brand"),
      unit: formText(data, "unit"),
      location: optionalFormText(data, "location"),
      reorderLevel: formNumber(data, "reorderLevel"),
      averageUnitCost: formNumber(data, "averageUnitCost"),
      leadTimeDays: formNumber(data, "leadTimeDays"),
      preferredSupplierId: preferredSupplier ? Number(preferredSupplier) : undefined,
    };
    void submit(form, () => createInventoryItem(input), `Inventory item ${input.itemCode.toUpperCase()} created`);
  };

  return <Panel title="Add inventory item" subtitle="สร้าง Material master โดยไม่สร้างยอด Stock เริ่มต้น">
    <form onSubmit={onSubmit}>
      <MasterFormError message={error} />
      <div className="form-grid two">
        <label className="field"><span><LocalizedText text={"Item code *"} /></span><input name="itemCode" required maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9._/-]*" autoCapitalize="characters" autoComplete="off" placeholder="MAT-001" /></label>
        <label className="field"><span><LocalizedText text={"Part number"} /></span><input name="partNumber" maxLength={200} autoComplete="off" /></label>
        <label className="field span-2"><span><LocalizedText text={"Description *"} /></span><textarea name="description" required maxLength={500} /></label>
        <label className="field"><span><LocalizedText text={"Brand"} /></span><input name="brand" maxLength={100} /></label>
        <label className="field"><span><LocalizedText text={"Unit *"} /></span><input name="unit" required maxLength={50} defaultValue="pcs" /></label>
        <label className="field"><span><LocalizedText text={"Location"} /></span><input name="location" maxLength={100} /></label>
        <label className="field"><span><LocalizedText text={"Preferred supplier"} /></span><select name="preferredSupplierId" defaultValue=""><option value=""><LocalizedText text={"No preferred supplier"} /></option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}</select></label>
        <label className="field"><span><LocalizedText text={"Reorder level *"} /></span><input name="reorderLevel" type="number" required min="0" max="999999999999999.9999" step="0.0001" defaultValue="0" /></label>
        <label className="field"><span><LocalizedText text={"Average unit cost (THB) *"} /></span><input name="averageUnitCost" type="number" required min="0" max="999999999999999.9999" step="0.0001" defaultValue="0" /></label>
        <label className="field"><span><LocalizedText text={"Lead time (days) *"} /></span><input name="leadTimeDays" type="number" required min="0" max="2147483647" step="1" defaultValue="0" /></label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}><button className="btn primary" type="submit" disabled={busy}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Create inventory item"}</button></div>
    </form>
  </Panel>;
}

const SIGN_IN_STATUS_LABEL: Record<SignInRequest["status"], string> = {
  new: "SignIn.statusNew", registered: "SignIn.statusRegistered", linkedElsewhere: "SignIn.statusLinkedElsewhere",
};
/** The engineering departments, spelled exactly as team scoping compares them, and the engineer levels. */
const EMPLOYEE_DEPARTMENTS = ["IoT Engineer Dept.", "Application Engineer Dept.", "Mechanical Engineer Dept.", "Electrical Engineer Dept.", "System Architect & System Engineer Dept."];
const EMPLOYEE_LEVELS = ["Junior Engineer", "Middle Engineer", "Senior Engineer", "Lead Engineer", "Technical Architect"];
const OTHER_CHOICE = "__other__";

/** A real dropdown: the standard values first, then any others already in use, and "Other" to type one that is new. */
function ChoiceSelect({ value, standard, inUse, placeholder, onChange }: {
  value: string; standard: string[]; inUse: string[]; placeholder: string; onChange: (value: string) => void;
}) {
  const { t } = useLanguage();
  const [typing, setTyping] = useState(false);
  const others = [...new Set([...inUse, value].filter((item) => item && !standard.includes(item)))].sort((a, b) => a.localeCompare(b));
  if (typing) return <>
    <input required maxLength={100} value={value} onChange={(event) => onChange(event.target.value)} />
    <button type="button" className="btn ghost sm" onClick={() => setTyping(false)}>{t("Employee.backToList")}</button>
  </>;
  return <select required value={value} onChange={(event) => {
    if (event.target.value === OTHER_CHOICE) { setTyping(true); onChange(""); } else onChange(event.target.value);
  }}>
    {!value ? <option value="">{t(placeholder)}</option> : null}
    {standard.map((item) => <option key={item} value={item}>{item}</option>)}
    {others.map((item) => <option key={item} value={item}>{item}</option>)}
    <option value={OTHER_CHOICE}>{t("Employee.otherValue")}</option>
  </select>;
}

// Department and job title start empty, so a new person is never filed under the IoT team by default.
const EMPTY_EMPLOYEE: EmployeeInput = {
  employeeNo: 0, nameEn: "", nameTh: "", department: "", jobTitle: "",
  mobile: "", email: "", nickname: "", birthDate: "", uniformSize: "", shoeSize: "",
  startWorkDate: businessDate(new Date()), endWorkDate: "", position: "Middle Engineer", isActive: true,
};

function employeeDuration(start: string, end: string | null, lang: "TH" | "EN" | "JP") {
  const from = new Date(`${start}T00:00:00`);
  const to = end ? new Date(`${end}T00:00:00`) : new Date();
  let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  if (to.getDate() < from.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (lang === "TH") return `${years} ปี ${remainder} เดือน`;
  if (lang === "JP") return `${years}年 ${remainder}か月`;
  return `${years}y ${remainder}m`;
}

function EmployeeMasterTab({ canWrite, notify }: { canWrite: boolean; notify: (message: string) => void }) {
  const { lang, t } = useLanguage();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EmployeeRecord | "new" | null>(null);
  // Filled in from a sign-in request, so the employee is added with exactly the email that was tried.
  const [prefill, setPrefill] = useState<Partial<EmployeeInput> | null>(null);
  const [signInRequests, setSignInRequests] = useState<SignInRequest[]>([]);
  // Accounts the old first sign-in created (Admin, no department) that no employee record points at.
  const [unlinked, setUnlinked] = useState<UnlinkedAccount[]>([]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [list, requests, accounts] = await Promise.all([
        listEmployees({ search, activeOnly }), canWrite ? listSignInRequests() : Promise.resolve([]), canWrite ? listUnlinkedAccounts() : Promise.resolve([]),
      ]);
      setEmployees(list); setSignInRequests(requests); setUnlinked(accounts);
    }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [search, activeOnly, canWrite]);
  const dismiss = async (request: SignInRequest) => {
    if (!window.confirm(t("SignIn.dismissConfirm").replace("{name}", request.name))) return;
    try { await dismissSignInRequest(request.subject); notify(t("SignIn.dismissed")); await load(); }
    catch (requestError) { setError(toError(requestError)); }
  };
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);

  const linkedAccounts = employees.filter((employee) => employee.accountActive !== null).length;
  const when = (value: string) => new Date(value).toLocaleString(lang === "TH" ? "th-TH" : lang === "JP" ? "ja-JP" : "en-GB");
  // An employee already has this email but does not point at the account: saving it links the account.
  const openEmployee = (account: UnlinkedAccount) => {
    const match = employees.find((employee) => employee.id === account.employeeId);
    if (match) setEditing(match); else { setSearch(String(account.employeeNo)); setPage(1); }
  };
  const departments = new Set(employees.map((employee) => employee.department)).size;
  const pageCount = Math.max(1, Math.ceil(employees.length / pageSize));
  const resolvedPage = Math.min(page, pageCount);
  const from = employees.length ? (resolvedPage - 1) * pageSize + 1 : 0;
  const to = Math.min(resolvedPage * pageSize, employees.length);
  const visibleEmployees = employees.slice(from ? from - 1 : 0, to);
  return <>
    <Toolbar>
      <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("Search employee, nickname, email, department or position…")} />
      <label className="checkbox-row"><input type="checkbox" checked={activeOnly} onChange={(event) => { setActiveOnly(event.target.checked); setPage(1); }} /><span>{t("Active employees only")}</span></label>
      <button className="btn ghost" type="button" onClick={() => { void load(); }}><Icon name="refresh" />{t("Refresh")}</button>
      {canWrite ? <button className="btn primary" type="button" onClick={() => { setPrefill(null); setEditing("new"); }}><Icon name="plus" />{t("New employee")}</button> : null}
    </Toolbar>
    <div className="kpi-grid three">
      <KpiCard label={t("Employees")} value={employees.length} icon="users" tone="blue" />
      <KpiCard label={t("Departments")} value={departments} icon="folder" tone="slate" />
      <KpiCard label={t("Linked login accounts")} value={linkedAccounts} note={t("SignIn.linkedNote")} icon="shield" tone="green" />
    </div>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    {canWrite && signInRequests.length ? <Panel title={`${t("SignIn.requestsTitle")} (${signInRequests.length})`} subtitle={t("SignIn.requestsSubtitle")} flush>
      <div className="table-wrap"><table><thead><tr>
        <th>{t("Employee")}</th><th>{t("SignIn.signInEmail")}</th><th>{t("Status")}</th><th>{t("SignIn.lastAttempt")}</th><th><span className="sr-only">{t("Actions")}</span></th>
      </tr></thead><tbody>{signInRequests.map((request) => <tr key={request.subject}>
        <td><div className="cell-primary"><strong>{request.name}</strong><span>{request.username}</span></div></td>
        <td><strong className="mono">{request.email}</strong></td>
        <td className="wrap"><Badge tone={request.status === "new" ? "amber" : request.status === "registered" ? "green" : "red"}>{t(SIGN_IN_STATUS_LABEL[request.status])}</Badge>
          {request.status === "linkedElsewhere" ? <div className="muted">{t("SignIn.linkedElsewhereHint")}</div> : null}</td>
        <td><div className="cell-primary"><strong>{new Date(request.lastAttemptAt).toLocaleString(lang === "TH" ? "th-TH" : lang === "JP" ? "ja-JP" : "en-GB")}</strong><span>{t("SignIn.attempts").replace("{n}", String(request.attempts))}</span></div></td>
        <td><div className="row-actions">
          {request.status === "new" ? <button className="btn primary sm" type="button" onClick={() => { setPrefill({ nameEn: request.name, email: request.email }); setEditing("new"); }}><Icon name="plus" />{t("SignIn.addEmployee")}</button> : null}
          <button className="btn ghost sm" type="button" onClick={() => { void dismiss(request); }}><Icon name="x" />{t("SignIn.dismiss")}</button>
        </div></td>
      </tr>)}</tbody></table></div>
    </Panel> : null}
    {canWrite && unlinked.length ? <Panel title={`${t("Employee.unlinkedTitle")} (${unlinked.length})`} subtitle={t("Employee.unlinkedSubtitle")} flush>
      <div className="table-wrap"><table><thead><tr>
        <th>{t("Employee")}</th><th>{t("Role")}</th><th>{t("Department")}</th><th>{t("Employee.lastUsed")}</th><th><span className="sr-only">{t("Actions")}</span></th>
      </tr></thead><tbody>{unlinked.map((account) => <tr key={account.userId}>
        <td><div className="cell-primary"><strong>{account.name}</strong><span className="mono">{account.email}</span></div></td>
        <td className="wrap"><Badge tone={account.role === "Admin" ? "red" : "slate"}>{account.role}</Badge>
          {account.role === "Admin" ? <div className="muted">{t("Employee.unlinkedAdminHint")}</div> : null}</td>
        <td>{account.department || t("Employee.noDepartment")}</td>
        <td>{account.lastUsedAt ? when(account.lastUsedAt) : "—"}</td>
        <td><div className="row-actions">{account.employeeId !== null
          ? <button className="btn ghost sm" type="button" onClick={() => openEmployee(account)}><Icon name="edit" />{t("Employee.openToLink").replace("{no}", String(account.employeeNo))}</button>
          : <button className="btn primary sm" type="button" onClick={() => { setPrefill({ nameEn: account.name, email: account.email, department: account.department }); setEditing("new"); }}><Icon name="plus" />{t("SignIn.addEmployee")}</button>}
        </div></td>
      </tr>)}</tbody></table></div>
    </Panel> : null}
    <Panel title={`${employees.length} ${t("employees")}`} subtitle={t("Employee Master is stored in SQL Server; age and tenure are calculated from dates")} flush>
      {employees.length ? <div className="table-wrap"><TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} /><table><thead><tr>
        <th>{t("Employee")}</th><th>{t("Email / mobile")}</th><th>{t("Department")}</th><th>{t("Level")}</th><th>{t("Job title")}</th><th>{t("Role")}</th><th>{t("Working time")}</th><th className="num">{t("Daily rate")}</th><th>{t("Status")}</th><th><span className="sr-only">{t("Actions")}</span></th>
      </tr></thead><tbody>{visibleEmployees.map((employee) => <tr key={employee.id}>
        <td><div className="cell-primary"><strong>{employee.nameEn}</strong><span>#{employee.employeeNo} <LocalizedText text={"·"} /> {employee.nickname || "—"}{employee.nameTh ? ` · ${employee.nameTh}` : ""}</span></div></td>
        <td><div className="cell-primary"><strong>{employee.email}</strong><span>{employee.mobile || "—"}</span></div></td>
        <td>{employee.department}</td><td><Badge>{employee.position}</Badge></td><td>{employee.jobTitle}</td>
        <td>{employee.applicationRole ? <Badge tone={employee.accountActive ? "blue" : "red"}>{employee.applicationRole}</Badge> : <span className="muted">{t("Not provisioned")}</span>}</td>
        <td>{employeeDuration(employee.startWorkDate, employee.endWorkDate, lang)}</td>
        <td className="num">{employee.dailyRate === null ? "—" : formatMoney(employee.dailyRate)}</td>
        <td><Badge tone={employee.isActive ? "green" : "slate"}>{t(employee.isActive ? "Active" : "Inactive")}</Badge></td>
        <td>{canWrite ? <button className="icon-btn" type="button" aria-label={`${t("Edit")} ${employee.nameEn}`} onClick={() => setEditing(employee)}><Icon name="edit" /></button> : null}</td>
      </tr>)}</tbody></table><Pagination page={resolvedPage} pageCount={pageCount} from={from} to={to} total={employees.length} onPage={setPage} /></div> : loading ? <div className="empty"><span className="spinner" />{t("Loading…")}</div> : !error ? <EmptyState icon="users" title={t("No employee found")} message={t("Add an employee or change the search filters")} /> : null}
    </Panel>
    {editing ? <EmployeeModal employee={editing === "new" ? null : editing} prefill={editing === "new" ? prefill : null} departments={employees.map((employee) => employee.department)} positions={employees.map((employee) => employee.position)} onClose={() => setEditing(null)} onSaved={async (message) => { setEditing(null); setPrefill(null); await load(); notify(message); }} /> : null}
  </>;
}

function EmployeeModal({ employee, prefill = null, departments = [], positions = [], onClose, onSaved }: {
  employee: EmployeeRecord | null; prefill?: Partial<EmployeeInput> | null;
  /** Departments and positions other employees already use, offered after the standard ones. */
  departments?: string[]; positions?: string[];
  onClose: () => void; onSaved: (message: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<EmployeeInput>(() => employee ? {
    employeeNo: employee.employeeNo, nameEn: employee.nameEn, nameTh: employee.nameTh,
    department: employee.department, jobTitle: employee.jobTitle, mobile: employee.mobile,
    email: employee.email, nickname: employee.nickname, birthDate: employee.birthDate ?? "",
    uniformSize: employee.uniformSize, shoeSize: employee.shoeSize, startWorkDate: employee.startWorkDate,
    endWorkDate: employee.endWorkDate ?? "", position: employee.position, isActive: employee.isActive,
  } : { ...EMPTY_EMPLOYEE, ...prefill });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const input: EmployeeInput = { ...form, nameTh: form.nameTh || undefined, mobile: form.mobile || undefined,
        nickname: form.nickname || undefined, birthDate: form.birthDate || undefined,
        uniformSize: form.uniformSize || undefined, shoeSize: form.shoeSize || undefined,
        endWorkDate: form.endWorkDate || undefined };
      if (employee) await updateEmployee(employee.id, { ...input, rowVersion: employee.rowVersion });
      else await createEmployee(input);
      await onSaved(employee ? `${form.nameEn} updated` : `${form.nameEn} created`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  const valid = form.employeeNo > 0 && !!form.nameEn.trim() && !!form.email.trim() && !!form.department.trim()
    && !!form.jobTitle.trim() && !!form.startWorkDate && !!form.position.trim()
    && (!form.birthDate || form.birthDate < form.startWorkDate)
    && (!form.endWorkDate || form.endWorkDate >= form.startWorkDate);
  return <Modal title={employee ? "Edit employee" : "New employee"} subtitle="Employee profile is separate from application login access" size="lg" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" onClick={onClose}>{t("Cancel")}</button>
    <button className="btn primary" type="submit" form="employee-master-form" disabled={busy || !valid}><Icon name="check" />{busy ? t("Saving…") : t("Save")}</button>
  </>}>
    <form id="employee-master-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <MasterFormError message={error} />
      <div className="form-grid two">
        <label className="field"><span>{t("Employee No.")} *</span><input type="number" min="1" max="2147483647" required value={form.employeeNo || ""} onChange={(event) => update("employeeNo", Number(event.target.value))} /></label>
        <label className="field"><span>{t("Nickname")}</span><input maxLength={100} value={form.nickname ?? ""} onChange={(event) => update("nickname", event.target.value)} /></label>
        <label className="field"><span>{t("English name")} *</span><input required maxLength={200} autoComplete="name" value={form.nameEn} onChange={(event) => update("nameEn", event.target.value)} /></label>
        <label className="field"><span>{t("Thai name")}</span><input maxLength={200} value={form.nameTh ?? ""} onChange={(event) => update("nameTh", event.target.value)} /></label>
        <label className="field"><span>{t("Email")} *</span><input required type="email" maxLength={256} autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label>
        <label className="field"><span>{t("Mobile")}</span><input type="tel" maxLength={50} autoComplete="tel" value={form.mobile ?? ""} onChange={(event) => update("mobile", event.target.value)} /></label>
        <label className="field"><span>{t("Department")} *</span><ChoiceSelect value={form.department} standard={EMPLOYEE_DEPARTMENTS} inUse={departments} placeholder="Employee.chooseDepartment" onChange={(value) => update("department", value)} /></label>
        <label className="field"><span>{t("Level / position")} *</span><ChoiceSelect value={form.position} standard={EMPLOYEE_LEVELS} inUse={positions} placeholder="Employee.chooseLevel" onChange={(value) => update("position", value)} /></label>
        <label className="field span-2"><span>{t("Job title")} *</span><input required maxLength={500} value={form.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} /></label>
        <label className="field"><span>{t("Birthday")}</span><input type="date" max={form.startWorkDate} value={form.birthDate ?? ""} onChange={(event) => update("birthDate", event.target.value)} /></label>
        <label className="field"><span>{t("Start work")} *</span><input required type="date" min={form.birthDate || undefined} value={form.startWorkDate} onChange={(event) => update("startWorkDate", event.target.value)} /></label>
        <label className="field"><span>{t("End work")}</span><input type="date" min={form.startWorkDate} value={form.endWorkDate ?? ""} onChange={(event) => update("endWorkDate", event.target.value)} /></label>
        <label className="field"><span>{t("Uniform size")}</span><input maxLength={50} value={form.uniformSize ?? ""} onChange={(event) => update("uniformSize", event.target.value)} /></label>
        <label className="field"><span>{t("Shoe size")}</span><input maxLength={50} value={form.shoeSize ?? ""} onChange={(event) => update("shoeSize", event.target.value)} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => update("isActive", event.target.checked)} /><span>{t("Active employee")}</span></label>
      </div>
      <div className="info-strip" role="note"><Icon name="shield" /><span>{t("SignIn.employeeAccessNote")}</span></div>
    </form>
  </Modal>;
}

type TeamMember = BootstrapData["team"][number];

function TeamReferenceTab({ bootstrap, canManageRoles, notify, refreshBootstrap }: Pick<CommonProps, "bootstrap" | "notify" | "refreshBootstrap"> & { canManageRoles: boolean }) {
  const t = useUiText();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  return <>
    <Panel title={`${bootstrap.team.length} ${t("active user accounts")}`} subtitle={t("System accounts and permission roles, separate from the employee register in Employees")} flush>
      {bootstrap.team.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Name"} /></th><th><LocalizedText text={"Email"} /></th><th><LocalizedText text={"Role"} /></th><th><LocalizedText text={"Department"} /></th><th><LocalizedText text={"Level"} /></th>{canManageRoles ? <th><span className="sr-only">{t("Actions")}</span></th> : null}</tr></thead><tbody>{bootstrap.team.map((member) => <tr key={member.id}><td><div className="user-account-cell"><strong>{member.name}</strong>{member.id === bootstrap.user.id ? <small>{t("Current account")}</small> : null}</div></td><td>{member.email}</td><td><Badge tone={member.role === "Admin" ? "violet" : "blue"}>{member.role}</Badge></td><td>{member.department}</td><td>{member.level || "—"}</td>{canManageRoles ? <td className="master-row-action"><button className="btn ghost sm" type="button" aria-label={`${t("Edit role")} ${member.name}`} onClick={() => setEditing(member)}><Icon name="edit" />{t("Edit role")}</button></td> : null}</tr>)}</tbody></table></div> : <EmptyState icon="users" title="No active team member" message="Provision users before creating rate references" />}
    </Panel>
    {editing ? <UserRoleModal member={editing} isCurrentAccount={editing.id === bootstrap.user.id} onClose={() => setEditing(null)} onRolesChanged={async (message) => {
      await refreshBootstrap();
      notify(message);
    }} onSaved={async (role) => {
      await refreshBootstrap();
      notify(t("Application role updated to {role}").replace("{role}", role));
      setEditing(null);
    }} /> : null}
  </>;
}

function UserRoleModal({ member, isCurrentAccount, onClose, onSaved, onRolesChanged }: { member: TeamMember; isCurrentAccount: boolean; onClose: () => void; onSaved: (role: string) => Promise<void>; onRolesChanged: (message: string) => Promise<void> }) {
  const t = useUiText();
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [roleCode, setRoleCode] = useState(member.role);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [additional, setAdditional] = useState<UserAdditionalRole[]>([]);
  const [extraCode, setExtraCode] = useState("");
  const [extraReason, setExtraReason] = useState("");
  const [extraError, setExtraError] = useState("");
  const [extraBusy, setExtraBusy] = useState("");

  const loadAdditional = useCallback(async () => {
    const result = await listUserRoles(member.id);
    setAdditional(result.additional);
  }, [member.id]);

  useEffect(() => {
    let active = true;
    void Promise.all([listAccessRoles(), listUserRoles(member.id)])
      .then(([roleList, assignment]) => { if (active) { setRoles(roleList.items); setAdditional(assignment.additional); setError(""); } })
      .catch((requestError) => { if (active) setError(toError(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [member.id]);
  const selectedRole = roles.find((role) => role.code === roleCode);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const result = await updateUserRole(member.id, { roleCode, rowVersion: member.rowVersion });
      setSaved(true);
      await onSaved(result.role);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  // An additional role carries its whole permission set, so every grant records why.
  const grantExtra = async () => {
    if (!extraCode || !extraReason.trim()) return;
    setExtraBusy(extraCode); setExtraError("");
    try {
      await grantUserRole(member.id, { roleCode: extraCode, reason: extraReason.trim() });
      const granted = extraCode;
      setExtraCode(""); setExtraReason("");
      await loadAdditional();
      await onRolesChanged(`${member.name}: + ${granted}`);
    } catch (requestError) { setExtraError(toError(requestError)); }
    finally { setExtraBusy(""); }
  };

  const revokeExtra = async (code: string) => {
    setExtraBusy(code); setExtraError("");
    try {
      await revokeUserRole(member.id, code);
      await loadAdditional();
      await onRolesChanged(`${member.name}: − ${code}`);
    } catch (requestError) { setExtraError(toError(requestError)); }
    finally { setExtraBusy(""); }
  };

  const grantable = roles.filter((role) => role.code !== member.role && !additional.some((held) => held.code === role.code));
  return <Modal title={t("Edit application role")} subtitle={t("Role changes update system permissions, not employee profile data")} size="md" onClose={() => { if (!busy) onClose(); }} footer={<>
    <button className="btn ghost" type="button" disabled={busy} onClick={onClose}>{t("Cancel")}</button>
    <button className="btn primary" type="button" disabled={loading || busy || saved || roleCode === member.role || !selectedRole} onClick={() => { void submit(); }}><Icon name="shield" />{busy ? t("Saving…") : t("Save role")}</button>
  </>}>
    <div className="role-account-summary">
      <div className="user-account-cell"><strong>{member.name}</strong><small>{member.email}</small></div>
      <Badge tone={member.role === "Admin" ? "violet" : "blue"}>{member.role}</Badge>
    </div>
    <Field label={t("New application role")}>
      <select disabled={loading || busy || saved} value={roleCode} onChange={(event) => setRoleCode(event.target.value)}>
        {loading ? <option value={member.role}>{t("Loading roles…")}</option> : roles.map((role) => <option key={role.id} value={role.code}>{role.name}{role.name !== role.code ? ` (${role.code})` : ""}</option>)}
      </select>
      {selectedRole ? <small className="role-option-description">{selectedRole.description || selectedRole.code}</small> : null}
    </Field>
    <Panel title={t("Additional roles")} subtitle={t("Each additional role grants that role's full permissions on top of the primary role")} flush>
      {additional.length ? <ul className="role-grant-list">{additional.map((role) => <li key={role.code}>
        <div><Badge tone={role.code === "Admin" ? "violet" : "blue"}>{role.code}</Badge><small className="muted">{role.reason}</small></div>
        <button className="btn ghost sm" type="button" disabled={busy || saved || extraBusy !== ""} onClick={() => { void revokeExtra(role.code); }}><Icon name="trash" />{extraBusy === role.code ? t("Removing…") : t("Remove role")}</button>
      </li>)}</ul> : <p className="muted">{t("This account holds its primary role only.")}</p>}
      <div className="form-grid two">
        <Field label={t("Add another role")}>
          <select disabled={loading || busy || saved || extraBusy !== ""} value={extraCode} onChange={(event) => setExtraCode(event.target.value)}>
            <option value="">{t("Select a role")}</option>
            {grantable.map((role) => <option key={role.id} value={role.code}>{role.name}{role.name !== role.code ? ` (${role.code})` : ""}</option>)}
          </select>
        </Field>
        <Field label={t("Reason")}>
          <input maxLength={1000} value={extraReason} disabled={loading || busy || saved || extraBusy !== ""} onChange={(event) => setExtraReason(event.target.value)} />
        </Field>
      </div>
      <button className="btn default" type="button" disabled={loading || busy || saved || !extraCode || !extraReason.trim() || extraBusy !== ""} onClick={() => { void grantExtra(); }}><Icon name="plus" />{extraBusy && extraBusy === extraCode ? t("Saving…") : t("Grant role")}</button>
      {extraError ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{extraError}</span></div> : null}
    </Panel>
    <div className="info-strip amber" role="note"><Icon name="alertTriangle" /><span>{isCurrentAccount ? t("Changing your own role refreshes your navigation and permissions immediately after saving.") : t("The employee will receive the new permissions on their next request.")}</span></div>
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
  </Modal>;
}
