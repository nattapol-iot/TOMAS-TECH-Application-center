"use client";
import { useT as useStaticCopy } from "../i18n";

import { currentLocale, useLanguage, useT as useUiText } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addProjectMember,
  createEmployee,
  createEstimate,
  createCostItem,
  createInquiry,
  createInventoryItem,
  createProject,
  createSupplier,
  deleteSupplier,
  updateSupplier,
  downloadProjectDocument,
  estimateWorkflow,
  listEstimates,
  listEmployees,
  listAccessRoles,
  listInquiries,
  listInventory,
  listProjectDocuments,
  listProjectMembers,
  listProjects,
  loadEstimateCostWorkspace,
  removeCostItem,
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
  type CreateEstimateInput,
  type CreateInquiryInput,
  type CreateInventoryItemInput,
  type CreateProjectInput,
  type CreateSupplierInput,
  type CostItemInput,
  type EstimateCostWorkspace,
  type EstimateSummary,
  type EmployeeInput,
  type EmployeeRecord,
  type InquirySummary,
  type ItemBalance,
  type PagedResult,
  type ProjectDocument,
  type ProjectMember,
  type ProjectSummary,
  type SignInbox,
  updateProject,
} from "../api-client";
import { allowedProjectTransitions, type ProjectStatus } from "../../../backend-node/src/project-lifecycle";
import { EndUserCompanyField, EndUserEditModal, canEditEndUser } from "./EndUserCompanyField";
import { ProductionCustomers, ProductionEngineeringRates } from "./AdminAnalyticsScreens";
import { canViewEngineeringRates } from "../../../backend-node/src/engineering-rate-access";
import { BusinessCardScanner } from "./BusinessCardScanner";
import type { BusinessCardExtraction } from "../../../lib/business-card";
import { supplierCodeFromName } from "../../../lib/supplier-code";
import "./master-data.css";
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  ProgressCell,
  SearchInput,
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

const EMPTY_PAGE = <T,>(): PagedResult<T> => ({ items: [], page: 1, pageSize: 25, total: 0 });
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
const COST_CATEGORIES = [
  ["01", "Hardware"], ["02", "Software"], ["03", "Electrical"], ["04", "Mechanical"], ["05", "Robot"],
  ["06", "Other Material"], ["07", "Outsource"], ["08", "Transportation"], ["09", "Accommodation"], ["10", "Other"],
] as const;
const ESTIMATE_OWNER_ROLES = ["Engineer", "Engineering Manager", "Admin"] as const;
const canOwnEstimate = (role: string) => ESTIMATE_OWNER_ROLES.some((allowedRole) => allowedRole === role);
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
const dashboardEffectiveFinish = (item: DashboardWorkItem) => item.actualFinish ?? item.forecastFinish ?? item.planFinish;
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
  const due = dashboardDayDistance(dashboardEffectiveFinish(item), businessDate(new Date()));
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
    const finish = dashboardDayDistance(dashboardEffectiveFinish(item), todayKey);
    return item.status === "In Progress" || item.status === "Blocked" || finish === 0
      || (start !== null && start <= 0 && (finish === null || finish >= 0));
  });
  const weekWork = openWork.filter((item) => {
    const distance = dashboardDayDistance(dashboardEffectiveFinish(item), todayKey);
    return distance !== null && distance >= 0 && distance <= 7;
  });
  const doneWork = workItems.filter((item) => item.status === "Done")
    .sort((a, b) => Date.parse(b.actualFinish ?? b.updatedAt) - Date.parse(a.actualFinish ?? a.updatedAt));
  const doneThisWeek = doneWork.filter((item) => {
    const distance = dashboardDayDistance(item.actualFinish ?? item.updatedAt, todayKey);
    return distance !== null && distance >= -7 && distance <= 0;
  });
  const lateWork = openWork.filter((item) => {
    const distance = dashboardDayDistance(dashboardEffectiveFinish(item), todayKey);
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
              const distance = dashboardDayDistance(dashboardEffectiveFinish(item), todayKey);
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

export function ProductionInquiries({ bootstrap, notify, refreshBootstrap }: CommonProps) {
  const uiText = useUiText();
  const [result, setResult] = useState<PagedResult<InquirySummary>>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await listInquiries({ page, pageSize: 25, search, status: status === "All status" ? undefined : status }));
    } catch (requestError) {
      setError(toError(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const canWrite = bootstrap.permissions.includes("inquiry.write");
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <>
      <PageHeader
        eyebrow="SALES TO ENGINEERING"
        title={uiText("Inquiry Management")}
        subtitle="รายการนี้มาจาก SQL Server และเลข Inquiry ถูกออกแบบ transaction-safe"
        actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"New Inquiry"} /></button> : undefined}
      />
      <Toolbar>
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search inquiry, project or customer…" />
        <Select label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={["All status", "New", "Estimating", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Approved", "Cancelled"]} />
        <button className="btn ghost" type="button" onClick={() => { void load(); }} disabled={loading}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
      </Toolbar>
      {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
      <Panel title={`${result.total} inquiries`} subtitle={loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {result.items.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th><LocalizedText text={"Inquiry No."} /></th><th><LocalizedText text={"Date"} /></th><th><LocalizedText text={"Customer"} /></th><th><LocalizedText text={"Project"} /></th><th><LocalizedText text={"Owner"} /></th><th><LocalizedText text={"Due"} /></th><th><LocalizedText text={"Progress"} /></th><th><LocalizedText text={"Priority"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Updated"} /></th></tr></thead>
              <tbody>{result.items.map((item) => (
                <tr key={item.id}>
                  <td><strong className="mono">{item.number}</strong></td>
                  <td>{formatDate(item.inquiryDate)}</td>
                  <td><div className="cell-primary"><strong>{item.customerName}</strong><span>{item.projectType}</span></div></td>
                  <td><strong>{item.projectName}</strong></td>
                  <td>{item.estimateOwnerName}</td>
                  <td>{formatDate(item.dueDate)}</td>
                  <td style={{ minWidth: 110 }}><ProgressCell value={Number(item.progress)} /></td>
                  <td><Badge tone={item.priority === "Urgent" ? "red" : item.priority === "High" ? "amber" : "slate"}>{item.priority}</Badge></td>
                  <td><Badge>{item.status}</Badge></td>
                  <td className="muted">{formatDateTime(item.updatedAt)}</td>
                </tr>
              ))}</tbody>
            </table>
            <Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} />
          </div>
        ) : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : <EmptyState icon="inbox" title="No inquiry found" message="ปรับตัวกรองหรือสร้าง Inquiry รายการแรก" />}
      </Panel>
      {createOpen ? <CreateInquiryModal bootstrap={bootstrap} onClose={() => setCreateOpen(false)} onCreated={async (number) => {
        setCreateOpen(false); notify(`${number} created`); await Promise.all([load(), refreshBootstrap()]);
      }} /> : null}
    </>
  );
}

function CreateInquiryModal({ bootstrap, onClose, onCreated }: { bootstrap: BootstrapData; onClose: () => void; onCreated: (number: string) => Promise<void> }) {
  const engineers = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const [form, setForm] = useState<CreateInquiryInput>({
    customerId: bootstrap.customers[0]?.id ?? 0,
    contact: "",
    projectName: "",
    projectType: "IoT / Automation",
    estimateOwnerId: engineers[0]?.id ?? 0,
    dueDate: futureDate(7),
    priority: "Normal",
    projectProbability: 25,
    customerInterestGrade: "C",
    requirement: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof CreateInquiryInput>(key: K, value: CreateInquiryInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setError("");
    try { const created = await createInquiry(form); await onCreated(created.number); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="New production inquiry" subtitle="เลขเอกสารจะสร้างโดย SQL Server เมื่อบันทึกสำเร็จ" size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !form.customerId || !form.estimateOwnerId || !form.projectName.trim()} onClick={() => { void submit(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : <LocalizedText text={"Create inquiry"} />}</button></>}>
      {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
      <div className="form-grid two">
        <label className="field"><span><LocalizedText text={"Customer *"} /></span><select value={form.customerId} onChange={(event) => update("customerId", Number(event.target.value))}>{bootstrap.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}</select></label>
        <label className="field"><span><LocalizedText text={"Contact"} /></span><input maxLength={200} value={form.contact} onChange={(event) => update("contact", event.target.value)} /></label>
        <label className="field span-2"><span><LocalizedText text={"Project name *"} /></span><input required maxLength={300} value={form.projectName} onChange={(event) => update("projectName", event.target.value)} /></label>
        <label className="field"><span><LocalizedText text={"Project type *"} /></span><input required maxLength={100} value={form.projectType} onChange={(event) => update("projectType", event.target.value)} /></label>
        <label className="field"><span><LocalizedText text={"Estimate owner *"} /></span><select value={form.estimateOwnerId} onChange={(event) => update("estimateOwnerId", Number(event.target.value))}>{engineers.map((member) => <option key={member.id} value={member.id}>{member.name} <LocalizedText text={"·"} /> {member.department}</option>)}</select></label>
        <label className="field"><span><LocalizedText text={"Due date *"} /></span><input type="date" min={today()} value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></label>
        <label className="field"><span><LocalizedText text={"Priority *"} /></span><select value={form.priority} onChange={(event) => update("priority", event.target.value)}><option value={"Low"}><LocalizedText text={"Low"} /></option><option value={"Normal"}><LocalizedText text={"Normal"} /></option><option value={"High"}><LocalizedText text={"High"} /></option><option value={"Urgent"}><LocalizedText text={"Urgent"} /></option></select></label>
        <label className="field"><span><LocalizedText text={"Project probability *"} /></span><input type="number" min="0" max="100" step="5" value={form.projectProbability} onChange={(event) => update("projectProbability", Number(event.target.value))} /></label>
        <label className="field"><span><LocalizedText text={"Customer interest *"} /></span><select value={form.customerInterestGrade} onChange={(event) => update("customerInterestGrade", event.target.value)}><option value="A"><LocalizedText text={"A — Hot"} /></option><option value="B"><LocalizedText text={"B — Warm"} /></option><option value="C"><LocalizedText text={"C — Nurture"} /></option><option value="D"><LocalizedText text={"D — Low"} /></option></select></label>
        <label className="field span-2"><span><LocalizedText text={"Requirement"} /></span><textarea maxLength={20000} value={form.requirement} onChange={(event) => update("requirement", event.target.value)} /></label>
      </div>
    </Modal>
  );
}

export function ProductionEstimates({ bootstrap, notify, refreshBootstrap }: CommonProps) {
  const uiText = useUiText();
  const [result, setResult] = useState<PagedResult<EstimateSummary>>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceEstimate, setWorkspaceEstimate] = useState<EstimateSummary | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setResult(await listEstimates({ page, pageSize: 25, search, status: status === "All status" ? undefined : status })); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [page, search, status]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);

  const act = async (item: EstimateSummary, action: "submit" | "approve" | "request-revision") => {
    const comment = action === "request-revision" ? window.prompt("Revision reason")?.trim() ?? "" : "";
    if (action === "request-revision" && !comment) return;
    setWorkingId(item.id); setError("");
    try { await estimateWorkflow(item.id, action, item.rowVersion, comment); notify(`${item.number} updated`); await Promise.all([load(), refreshBootstrap()]); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setWorkingId(null); }
  };
  const canWrite = bootstrap.permissions.includes("estimate.write");
  const canApprove = bootstrap.permissions.includes("estimate.approve");
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <>
      <PageHeader eyebrow="ENGINEERING COST" title={uiText("Estimate Cost")} subtitle="ต้นทุน Material, Engineering และ Total คำนวณจากข้อมูลจริงในฐานข้อมูล" actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"Create from inquiry"} /></button> : undefined} />
      <Toolbar>
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search estimate, inquiry, project or customer…" />
        <Select label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={["All status", "Draft", "Engineering Input", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Revision Required", "Approved", "Locked"]} />
        <button className="btn ghost" type="button" onClick={() => { void load(); }} disabled={loading}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>
      </Toolbar>
      {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
      <Panel title={`${result.total} estimates`} subtitle={loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {result.items.length ? <div className="table-wrap"><table>
          <thead><tr><th><LocalizedText text={"Estimate No."} /></th><th><LocalizedText text={"Inquiry"} /></th><th><LocalizedText text={"Customer / Project"} /></th><th><LocalizedText text={"Owner"} /></th><th><LocalizedText text={"Due"} /></th><th><LocalizedText text={"Progress"} /></th><th><LocalizedText text={"Material"} /></th><th><LocalizedText text={"Engineering"} /></th><th><LocalizedText text={"Total"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Workflow"} /></th></tr></thead>
          <tbody>{result.items.map((item) => <tr key={item.id}>
            <td><strong className="mono">{item.number}</strong><small className="muted">R{String(item.revision).padStart(2, "0")}</small></td>
            <td className="mono">{item.inquiryNumber}</td>
            <td><div className="cell-primary"><strong>{item.projectName}</strong><span>{item.customerName} <LocalizedText text={"·"} /> {item.projectType}</span></div></td>
            <td>{item.ownerName}</td><td>{formatDate(item.dueDate)}</td><td style={{ minWidth: 110 }}><ProgressCell value={Number(item.progress)} /></td>
            <td className="num">{formatMoney(Number(item.materialTotal))}</td><td className="num">{formatMoney(Number(item.engineeringTotal))}</td><td className="num"><strong>{formatMoney(Number(item.total))}</strong></td>
            <td><Badge>{item.status}</Badge></td>
            <td><div className="row-actions">
              <button className="btn sm default" type="button" onClick={() => setWorkspaceEstimate(item)}><Icon name="table" /><LocalizedText text={"Costs"} /></button>
              {canWrite && ["Draft", "Engineering Input", "Revision Required"].includes(item.status) ? <button className="btn sm ghost" type="button" disabled={workingId === item.id} onClick={() => { void act(item, "submit"); }}><LocalizedText text={"Submit"} /></button> : null}
              {canApprove && item.status === "Engineering Review" ? <><button className="btn sm primary" type="button" disabled={workingId === item.id} onClick={() => { void act(item, "approve"); }}><LocalizedText text={"Approve"} /></button><button className="btn sm danger" type="button" disabled={workingId === item.id} onClick={() => { void act(item, "request-revision"); }}><LocalizedText text={"Revise"} /></button></> : null}
            </div></td>
          </tr>)}</tbody>
        </table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : <EmptyState icon="file" title="No estimate found" message="สร้าง Estimate จาก Inquiry ที่ลงทะเบียนแล้ว" />}
      </Panel>
      {createOpen ? <CreateEstimateModal bootstrap={bootstrap} onClose={() => setCreateOpen(false)} onCreated={async (number) => { setCreateOpen(false); notify(`${number} created`); await Promise.all([load(), refreshBootstrap()]); }} /> : null}
      {workspaceEstimate ? <EstimateCostModal estimate={workspaceEstimate} bootstrap={bootstrap} notify={notify} onClose={() => setWorkspaceEstimate(null)} onChanged={async () => { await load(); }} /> : null}
    </>
  );
}

function EstimateCostModal({ estimate, bootstrap, notify, onClose, onChanged }: {
  estimate: EstimateSummary;
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const localizeCopy = useStaticCopy();
  const [workspace, setWorkspace] = useState<EstimateCostWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const costOwners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const defaultOwner = costOwners.find((member) => member.id === estimate.ownerId)?.id
    ?? costOwners.find((member) => member.id === bootstrap.user.id)?.id
    ?? costOwners[0]?.id
    ?? 0;
  const [form, setForm] = useState<Omit<CostItemInput, "estimateRowVersion">>({
    categoryCode: "01", category: "Hardware", subcategory: "", module: "Core", itemCode: "", description: "",
    brand: "", model: "", supplierId: undefined, quantity: 1, unit: "Set", unitCost: 0,
    priceSource: "Supplier Quotation", referenceNumber: "", priceDate: today(), ownerId: defaultOwner,
  });
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setWorkspace(await loadEstimateCostWorkspace(estimate.id)); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [estimate.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const editable = Boolean(workspace && bootstrap.permissions.includes("estimate.write") && ["Draft", "Engineering Input", "Revision Required"].includes(workspace.header.status));
  const submit = async () => {
    if (!workspace) return;
    setBusy(true); setError("");
    try {
      await createCostItem(estimate.id, { ...form, estimateRowVersion: workspace.header.rowVersion });
      setAdding(false);
      setForm((current) => ({ ...current, itemCode: "", description: "", brand: "", model: "", unitCost: 0, referenceNumber: "" }));
      notify("Cost item saved");
      await Promise.all([load(), onChanged()]);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  const remove = async (lineId: number, lineVersion: string) => {
    if (!workspace || !window.confirm("Remove this cost item from the current revision?")) return;
    setBusy(true); setError("");
    try { await removeCostItem(estimate.id, lineId, workspace.header.rowVersion, lineVersion, "Removed from cost workspace"); notify("Cost item removed"); await Promise.all([load(), onChanged()]); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={`${estimate.number} · Cost workspace`} subtitle={`${estimate.projectName} · ${workspace?.header.status ?? estimate.status}`} size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>{editable && !adding ? <button className="btn primary" type="button" onClick={() => setAdding(true)}><Icon name="plus" /><LocalizedText text={"Add cost item"} /></button> : null}</>}>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    {workspace ? <>
      <div className="summary-strip four"><div className="summary-tile"><span><LocalizedText text={"Material"} /></span><strong>{formatMoney(Number(workspace.header.totals.material))}</strong></div><div className="summary-tile"><span><LocalizedText text={"Engineering"} /></span><strong>{formatMoney(Number(workspace.header.totals.engineering))}</strong></div><div className="summary-tile"><span><LocalizedText text={"Contingency"} /></span><strong>{formatMoney(Number(workspace.header.totals.contingency))}</strong></div><div className="summary-tile strong"><span><LocalizedText text={"Total"} /></span><strong>{formatMoney(Number(workspace.header.totals.total))}</strong></div></div>
      {adding ? <div className="form-section production-cost-form"><div className="form-section-title"><Icon name="plus" /><strong><LocalizedText text={"New cost item"} /></strong></div><div className="form-grid">
        <label className="field span-2"><span><LocalizedText text={"Category *"} /></span><select value={form.categoryCode} onChange={(event) => { const selected = COST_CATEGORIES.find(([code]) => code === event.target.value); setForm((current) => ({ ...current, categoryCode: event.target.value, category: selected?.[1] ?? current.category })); }}>{COST_CATEGORIES.map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}</select></label>
        <label className="field"><span><LocalizedText text={"Module *"} /></span><input required maxLength={200} value={form.module} onChange={(event) => setForm((current) => ({ ...current, module: event.target.value }))} /></label>
        <label className="field"><span><LocalizedText text={"Item code *"} /></span><input required maxLength={100} value={form.itemCode} onChange={(event) => setForm((current) => ({ ...current, itemCode: event.target.value }))} /></label>
        <label className="field span-2"><span><LocalizedText text={"Description *"} /></span><input required maxLength={500} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
        <label className="field"><span><LocalizedText text={"Brand"} /></span><input maxLength={100} value={form.brand} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} /></label>
        <label className="field"><span><LocalizedText text={"Model"} /></span><input maxLength={200} value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} /></label>
        <label className="field"><span><LocalizedText text={"Supplier"} /></span><select value={form.supplierId ?? ""} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value ? Number(event.target.value) : undefined }))}><option value=""><LocalizedText text={"No supplier"} /></option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}</select></label>
        <label className="field"><span><LocalizedText text={"Quantity *"} /></span><input required type="number" min="0.0001" max="1000000000" step="0.0001" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} /></label>
        <label className="field"><span><LocalizedText text={"Unit *"} /></span><input required maxLength={50} value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} /></label>
        <label className="field"><span><LocalizedText text={"Unit cost (THB) *"} /></span><input required type="number" min="0" max="1000000000" step="0.0001" value={form.unitCost} onChange={(event) => setForm((current) => ({ ...current, unitCost: Number(event.target.value) }))} /></label>
        <label className="field"><span><LocalizedText text={"Price source *"} /></span><select value={form.priceSource} onChange={(event) => setForm((current) => ({ ...current, priceSource: event.target.value }))}><option value={"Supplier Quotation"}><LocalizedText text={"Supplier Quotation"} /></option><option value={"Price Library"}><LocalizedText text={"Price Library"} /></option><option value={"Previous Project"}><LocalizedText text={"Previous Project"} /></option><option value={"Budgetary"}><LocalizedText text={"Budgetary"} /></option></select></label>
        <label className="field"><span><LocalizedText text={"Reference no."} /></span><input maxLength={200} value={form.referenceNumber} onChange={(event) => setForm((current) => ({ ...current, referenceNumber: event.target.value }))} /></label>
        <label className="field"><span><LocalizedText text={"Price date"} /></span><input type="date" value={form.priceDate} onChange={(event) => setForm((current) => ({ ...current, priceDate: event.target.value }))} /></label>
        <label className="field"><span><LocalizedText text={"Owner *"} /></span><select value={form.ownerId} disabled={costOwners.length === 0} onChange={(event) => setForm((current) => ({ ...current, ownerId: Number(event.target.value) }))}>{costOwners.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      </div><div className="row"><button className="btn ghost" type="button" onClick={() => setAdding(false)}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !form.ownerId || form.categoryCode.length !== 2 || !form.itemCode.trim() || !form.description.trim() || form.quantity <= 0 || form.unitCost < 0} onClick={() => { void submit(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Save item"}</button></div></div> : null}
      {workspace.costItems.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Code"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Module"} /></th><th><LocalizedText text={"Supplier"} /></th><th><LocalizedText text={"Qty"} /></th><th><LocalizedText text={"Unit cost"} /></th><th><LocalizedText text={"Line total"} /></th><th><LocalizedText text={"Source"} /></th><th><LocalizedText text={"Owner"} /></th><th /></tr></thead><tbody>{workspace.costItems.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.categoryCode} <LocalizedText text={"·"} /> {line.category}</small></td><td><div className="cell-primary"><strong>{line.description}</strong><span>{[line.brand, line.model].filter(Boolean).join(" · ")}</span></div></td><td>{line.module}</td><td>{line.supplierName ?? "—"}</td><td className="num">{Number(line.quantity).toLocaleString(currentLocale())} {line.unit}</td><td className="num">{formatMoney(Number(line.unitCost))}</td><td className="num"><strong>{formatMoney(Number(line.lineTotal))}</strong></td><td>{line.priceSource}</td><td>{line.ownerName}</td><td>{editable ? <button className="icon-btn danger" type="button" disabled={busy} aria-label={localizeCopy("Remove item")} onClick={() => { void remove(line.id, line.rowVersion); }}><Icon name="trash" /></button> : null}</td></tr>)}</tbody></table></div> : !adding ? <EmptyState icon="package" title="No cost item in this revision" message={editable ? "เพิ่มรายการต้นทุนอย่างน้อยหนึ่งรายการก่อนส่งตรวจ" : "Estimate นี้ไม่มีรายการต้นทุนใน revision ปัจจุบัน"} /> : null}
    </> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading cost workspace…"} /></div> : null}
  </Modal>;
}

function CreateEstimateModal({ bootstrap, onClose, onCreated }: { bootstrap: BootstrapData; onClose: () => void; onCreated: (number: string) => Promise<void> }) {
  const [inquiries, setInquiries] = useState<InquirySummary[]>([]);
  const [form, setForm] = useState<CreateEstimateInput>({ inquiryId: 0, ownerId: bootstrap.user.id, dueDate: futureDate(7), contingencyRate: 5 });
  const [busy, setBusy] = useState(false);
  const [loadingInquiries, setLoadingInquiries] = useState(true);
  const [inquiryError, setInquiryError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [error, setError] = useState("");
  const canManageEstimates = ["Engineering Manager", "Admin"].includes(bootstrap.user.role);
  const ownerOptions = bootstrap.team.filter((member) =>
    canOwnEstimate(member.role)
    && (canManageEstimates || member.id === bootstrap.user.id));
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingInquiries(true);
      setInquiryError("");
      void listInquiries({ pageSize: 100, status: "New" }).then((page) => {
        if (cancelled) return;
        const eligible = page.items.filter((item) =>
          item.status === "New"
          && item.estimateId === null
          && (canManageEstimates || item.estimateOwnerId === bootstrap.user.id));
        setInquiries(eligible);
        setForm((current) => ({ ...current, inquiryId: eligible[0]?.id ?? 0 }));
      }).catch((requestError) => {
        if (!cancelled) setInquiryError(toError(requestError));
      }).finally(() => {
        if (!cancelled) setLoadingInquiries(false);
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [bootstrap.user.id, canManageEstimates, loadVersion]);
  const submit = async () => { setBusy(true); setError(""); try { const created = await createEstimate(form); await onCreated(created.number); } catch (requestError) { setError(toError(requestError)); } finally { setBusy(false); } };
  return <Modal title="Create estimate from inquiry" subtitle="ข้อมูลลูกค้าและโครงการจะคัดลอกจาก Inquiry" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !form.inquiryId || !form.ownerId} onClick={() => { void submit(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : <LocalizedText text={"Create estimate"} />}</button></>}>
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    {inquiryError ? <LoadError message={inquiryError} retry={() => setLoadVersion((version) => version + 1)} /> : null}
    {!loadingInquiries && !inquiryError && inquiries.length === 0 ? <div className="info-strip amber" role="status"><Icon name="alertTriangle" /><span><LocalizedText text={"ไม่มี Inquiry สถานะ New ที่ยังไม่สร้าง Estimate และอยู่ในสิทธิ์ของคุณ"} /></span></div> : null}
    <div className="form-grid two">
      <label className="field span-2"><span><LocalizedText text={"Inquiry *"} /></span><select value={form.inquiryId} disabled={loadingInquiries || inquiries.length === 0} onChange={(event) => setForm((current) => ({ ...current, inquiryId: Number(event.target.value) }))}><option value={0}>{loadingInquiries ? "Loading eligible inquiries…" : "Select inquiry"}</option>{inquiries.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.projectName}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Owner *"} /></span><select value={form.ownerId} disabled={!canManageEstimates} onChange={(event) => setForm((current) => ({ ...current, ownerId: Number(event.target.value) }))}>{ownerOptions.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Due date *"} /></span><input type="date" min={today()} value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>
      <label className="field"><span><LocalizedText text={"Contingency (%)"} /></span><input type="number" min="0" max="100" step="0.01" value={form.contingencyRate} onChange={(event) => setForm((current) => ({ ...current, contingencyRate: Number(event.target.value) }))} /></label>
    </div>
  </Modal>;
}

export function ProductionProjects({ bootstrap, notify, refreshBootstrap, teamTestMode }: CommonProps & { teamTestMode: boolean }) {
  const uiText = useUiText();
  const [result, setResult] = useState<PagedResult<ProjectSummary>>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [documentsProject, setDocumentsProject] = useState<ProjectSummary | null>(null);
  const [endUserProject, setEndUserProject] = useState<ProjectSummary | null>(null);
  const [membersProject, setMembersProject] = useState<ProjectSummary | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { setResult(await listProjects({ page, pageSize, search, status: status === "All status" ? undefined : status })); } catch (requestError) { setError(toError(requestError)); } finally { setLoading(false); } }, [page, pageSize, search, status]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);
  const canWrite = bootstrap.permissions.includes("project.write");
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <>
    <PageHeader eyebrow="APPROVED WORK" title={uiText("Projects")} subtitle={teamTestMode ? "สร้างได้จาก Estimate ที่อนุมัติแล้ว และเก็บเอกสารชั่วคราวในเครื่องทดสอบ (ยังไม่เชื่อม NAS)" : "สร้างได้จาก Estimate ที่อนุมัติแล้ว พร้อมเอกสารโครงการบน NAS ตามโฟลเดอร์มาตรฐาน 15 รายการ"} actions={canWrite ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"Create project"} /></button> : undefined} />
    <Toolbar><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search project, customer or end user…" /><Select label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={["All status", "Planning", "Design", "Development", "Installation", "Commissioning", "Handover", "On Hold", "Closed"]} /><button className="btn ghost" type="button" onClick={() => { void load(); }}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button></Toolbar>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${result.total} projects`} subtitle={loading ? "Loading from production API…" : "Live SQL Server data"} flush>
      {result.items.length ? <div className="table-wrap"><TablePageSize value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} /><table><thead><tr><th><LocalizedText text={"Project No."} /></th><th><LocalizedText text={"Project"} /></th><th><LocalizedText text={"บริษัทที่รับงานด้วย / Contracting customer"} /></th><th><LocalizedText text={"End user / ผู้ใช้งานปลายทาง"} /></th><th><LocalizedText text={"Type"} /></th><th><LocalizedText text={"Manager"} /></th><th><LocalizedText text={"Start"} /></th><th><LocalizedText text={"Target delivery"} /></th><th><LocalizedText text={"Progress"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Updated"} /></th><th><span className="sr-only"><LocalizedText text={"Actions"} /></span></th></tr></thead><tbody>{result.items.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td><strong>{item.name}</strong></td><td>{item.customerName}</td><td>{item.endUserName || <span className="muted"><LocalizedText text={"ยังไม่ระบุ / Not specified"} /></span>}</td><td>{item.projectType}</td><td>{item.managerName}</td><td>{formatDate(item.startDate)}</td><td>{formatDate(item.targetDelivery)}</td><td style={{ minWidth: 110 }}><ProgressCell value={Number(item.progress)} /></td><td><Badge>{item.status}</Badge></td><td className="muted">{formatDateTime(item.updatedAt)}</td><td>{canWrite ? <button className="btn ghost sm" type="button" onClick={() => setEditingProject(item)}><Icon name="edit" /><LocalizedText text={"Edit project"} /></button> : null}{canWrite && canEditEndUser(item.status) ? <button className="btn ghost sm" type="button" onClick={() => setEndUserProject(item)}><LocalizedText text={"แก้ไข End user / Edit"} /></button> : null}<button className="btn ghost sm" type="button" aria-label={`Documents for ${item.number}`} onClick={() => setDocumentsProject(item)}><Icon name="paperclip" /><LocalizedText text={"Documents"} /></button><button className="btn ghost sm" type="button" aria-label={`Team for ${item.number}`} onClick={() => setMembersProject(item)}><Icon name="users" /><LocalizedText text={"Team"} /></button></td></tr>)}</tbody></table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : <EmptyState icon="folder" title="No project found" message="สร้าง Project จาก Estimate ที่อนุมัติแล้ว" />}
    </Panel>
    {createOpen ? <CreateProjectModal bootstrap={bootstrap} refreshBootstrap={refreshBootstrap} notify={notify} onClose={() => setCreateOpen(false)} onCreated={async (number) => { setCreateOpen(false); notify(`${number} created with folder metadata`); await Promise.all([load(), refreshBootstrap()]); }} /> : null}
    {endUserProject ? <EndUserEditModal kind="projects" record={endUserProject} bootstrap={bootstrap} refreshBootstrap={refreshBootstrap} notify={notify} onClose={() => setEndUserProject(null)} onSaved={load} reloadRecord={async () => { const page = await listProjects({ search: endUserProject.number, pageSize: 100 }); const latest = page.items.find((item) => item.id === endUserProject.id); if (!latest) throw new Error("ไม่พบ Project หรือไม่มีสิทธิ์เข้าถึง / Project unavailable"); return latest; }} /> : null}
    {documentsProject ? <ProjectDocumentsModal project={documentsProject} canWrite={canWrite} teamTestMode={teamTestMode} notify={notify} onClose={() => setDocumentsProject(null)} /> : null}
    {membersProject ? <ProjectMembersModal project={membersProject} bootstrap={bootstrap} canWrite={canWrite} notify={notify} onClose={() => setMembersProject(null)} /> : null}
    {editingProject ? <EditProjectModal bootstrap={bootstrap} project={editingProject} onClose={() => setEditingProject(null)} onSaved={async (number) => { setEditingProject(null); notify(`${number} updated`); await Promise.all([load(), refreshBootstrap()]); }} /> : null}
  </>;
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

// A project is edited in place rather than through a wizard: the lifecycle rules decide which
// statuses the dropdown may offer, so the screen can never ask for a move the API would refuse.
function EditProjectModal({ bootstrap, project, onClose, onSaved }: {
  bootstrap: BootstrapData;
  project: ProjectSummary;
  onClose: () => void;
  onSaved: (number: string) => Promise<void>;
}) {
  const managers = bootstrap.team.filter((member) => ["Project Manager", "Engineering Manager", "Admin"].includes(member.role));
  const engineers = bootstrap.team.filter((member) => ["Engineer", "Engineering Manager", "Admin"].includes(member.role));
  const elevated = ["Admin", "Engineering Manager", "Project Manager"].includes(bootstrap.user.role);
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
  });
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
    size="lg"
    onClose={onClose}
    footer={<>
      <button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" disabled={busy || needsActualDelivery || !form.name.trim() || !form.site.trim() || !form.purchaseOrderNumber.trim()} onClick={() => { void submit(); }}>
        <Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : <LocalizedText text={"Save project"} />}
      </button>
    </>}
  >
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    {needsActualDelivery ? <div className="info-strip" role="note"><Icon name="alertTriangle" /><span><LocalizedText text={"ระบุวันส่งมอบจริงก่อนปิดโครงการ / Record the actual delivery date before closing"} /></span></div> : null}
    {closing ? <div className="info-strip" role="note"><Icon name="check" /><span><LocalizedText text={"ปิดโครงการแล้วความคืบหน้าจะถูกตั้งเป็น 100% / Closing sets progress to 100%"} /></span></div> : null}
    <div className="form-grid two">
      <label className="field span-2"><span><LocalizedText text={"Project name *"} /></span><input required maxLength={300} value={form.name} onChange={(event) => set("name", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Status"} /></span><select value={form.status} onChange={(event) => set("status", event.target.value)}>{statusChoices.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Progress %"} /></span><input type="number" min={0} max={100} step={1} disabled={closing} value={closing ? 100 : form.progress} onChange={(event) => set("progress", Number(event.target.value))} /></label>
      <label className="field"><span><LocalizedText text={"Project manager"} /></span><select value={form.managerId} onChange={(event) => set("managerId", Number(event.target.value))}>{managers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Lead engineer"} /></span><select value={form.leadEngineerId} onChange={(event) => set("leadEngineerId", Number(event.target.value))}>{engineers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Project type"} /></span><input maxLength={100} value={form.projectType} onChange={(event) => set("projectType", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Customer PO number *"} /></span><input required maxLength={100} value={form.purchaseOrderNumber} onChange={(event) => set("purchaseOrderNumber", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"PO date"} /></span><input type="date" value={form.purchaseOrderDate} onChange={(event) => set("purchaseOrderDate", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Start date"} /></span><input type="date" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Target delivery"} /></span><input type="date" min={form.startDate} value={form.targetDelivery} onChange={(event) => set("targetDelivery", event.target.value)} /></label>
      <label className="field"><span><LocalizedText text={"Actual delivery"} /></span><input type="date" min={form.startDate} value={form.actualDelivery} onChange={(event) => set("actualDelivery", event.target.value)} /></label>
      <label className="field span-2"><span><LocalizedText text={"Site *"} /></span><input required maxLength={300} value={form.site} onChange={(event) => set("site", event.target.value)} /></label>
      <label className="field span-2"><span><LocalizedText text={"Remark"} /></span><textarea rows={3} maxLength={20000} value={form.remark} onChange={(event) => set("remark", event.target.value)} /></label>
    </div>
  </Modal>;
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
      setDocuments((current) => [created, ...current]);
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
      {documents.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"File"} /></th><th><LocalizedText text={"Folder"} /></th><th><LocalizedText text={"Type"} /></th><th><LocalizedText text={"Size"} /></th><th>{sourceRemarkLabel}</th><th><LocalizedText text={"Uploaded by"} /></th><th><LocalizedText text={"Uploaded"} /></th><th><span className="sr-only"><LocalizedText text={"Actions"} /></span></th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><strong>{document.fileName}</strong><small className="document-content-type" title={document.sha256 ? `SHA-256 ${document.sha256}` : undefined}>{document.contentType}{document.sha256 ? ` · SHA-256 ${document.sha256.slice(0, 12)}…` : ""}</small></td><td><Badge>{document.folderCode}</Badge><small className="document-folder-name">{document.folderName}</small></td><td>{document.documentType}</td><td className="num">{formatFileSize(Number(document.sizeBytes))}</td><td>{document.remark || "—"}</td><td>{document.uploadedByName}</td><td className="muted">{formatDateTime(document.uploadedAt)}</td><td><button className="btn ghost sm" type="button" disabled={downloadingId !== null} aria-label={`Download ${document.fileName}`} onClick={() => { void download(document); }}><Icon name="download" />{downloadingId === document.id ? "Downloading…" : <LocalizedText text={"Download"} />}</button></td></tr>)}</tbody></table></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div> : !loadError ? <EmptyState icon="file" title="No document uploaded" message={canWrite ? (teamTestMode ? "เลือกโฟลเดอร์ ประเภทเอกสาร และไฟล์ด้านบนเพื่ออัปโหลดไปยังพื้นที่ทดสอบชั่วคราว" : "เลือกโฟลเดอร์ ประเภทเอกสาร และไฟล์ด้านบนเพื่ออัปโหลดไปยัง NAS") : "ยังไม่มีเอกสารในโครงการนี้"} /> : null}
    </Panel>
  </Modal>;
}

function CreateProjectModal({ bootstrap, refreshBootstrap, notify, onClose, onCreated }: { bootstrap: BootstrapData; refreshBootstrap: () => Promise<void>; notify: (message: string) => void; onClose: () => void; onCreated: (number: string) => Promise<void> }) {
  const { lang } = useLanguage();
  const handoverCopy = lang === "TH"
    ? "เมื่อสร้าง Project ระบบจะสร้างโฟลเดอร์มาตรฐานและจัดเอกสารจาก Inquiry กับ Site Visit ที่เชื่อมโยงเข้าโฟลเดอร์ให้อัตโนมัติ โดยยังเก็บไฟล์ต้นฉบับไว้"
    : lang === "JP"
      ? "プロジェクト作成時に標準フォルダーを作成し、関連するInquiry・Site Visit文書を自動分類します。元ファイルは保持されます。"
      : "Creating the Project builds the standard folders and automatically categorizes documents from the linked Inquiry and Site Visit. Source files are retained.";
  const managers = bootstrap.team.filter((member) => ["Project Manager", "Engineering Manager", "Admin"].includes(member.role));
  const engineers = bootstrap.team.filter((member) => ["Engineer", "Engineering Manager", "Admin"].includes(member.role));
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [form, setForm] = useState<CreateProjectInput>({ estimateId: 0, purchaseOrderNumber: "", purchaseOrderDate: today(), managerId: managers[0]?.id ?? 0, leadEngineerId: engineers[0]?.id ?? 0, startDate: today(), targetDelivery: futureDate(60), site: "", remark: "" });
  const [inheritEndUser, setInheritEndUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void listEstimates({ pageSize: 100, status: "Approved" }).then((page) => { setEstimates(page.items); setForm((current) => ({ ...current, estimateId: page.items[0]?.id ?? 0 })); }).catch((requestError) => setError(toError(requestError))); }, []);
  const submit = async () => { setBusy(true); setError(""); try { const input = { ...form }; if (inheritEndUser) delete input.endUserCustomerId; else input.endUserCustomerId = form.endUserCustomerId ?? null; const created = await createProject(input); await onCreated(created.number); } catch (requestError) { setError(toError(requestError)); } finally { setBusy(false); } };
  return <Modal title="Create production project" subtitle="ใช้ได้เฉพาะ Estimate สถานะ Approved" size="lg" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !form.estimateId || !form.managerId || !form.leadEngineerId || !form.purchaseOrderNumber.trim() || !form.site.trim()} onClick={() => { void submit(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : <LocalizedText text={"Create project"} />}</button></>}>
    {error ? <LoadError message={error} retry={() => { void submit(); }} /> : null}
    <div className="info-strip" role="note"><Icon name="folder" /><span>{handoverCopy}</span></div>
    <div className="form-grid two">
      <label className="field span-2"><span><LocalizedText text={"Approved estimate *"} /></span><select value={form.estimateId} onChange={(event) => setForm((current) => ({ ...current, estimateId: Number(event.target.value) }))}><option value={0}><LocalizedText text={"Select approved estimate"} /></option>{estimates.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.projectName}</option>)}</select></label>
      <div className="span-2"><label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={inheritEndUser} disabled={busy} onChange={(event) => setInheritEndUser(event.target.checked)} /><LocalizedText text={"ใช้ End user จาก Inquiry ต้นทาง / Inherit from Inquiry"} /></label><small><LocalizedText text={"เอาเครื่องหมายออกเพื่อระบุ End user สำหรับ Project นี้เอง หรือเว้นว่างเมื่อยังไม่ทราบ / Uncheck to choose a company or leave unspecified."} /></small></div>
      {!inheritEndUser ? <EndUserCompanyField bootstrap={bootstrap} customerId={estimates.find((item) => item.id === form.estimateId)?.customerId ?? 0} value={form.endUserCustomerId ?? null} disabled={busy} onChange={(endUserCustomerId) => setForm((current) => ({ ...current, endUserCustomerId }))} refreshBootstrap={refreshBootstrap} notify={notify} /> : null}
      <label className="field"><span><LocalizedText text={"Customer PO number *"} /></span><input required maxLength={100} value={form.purchaseOrderNumber} onChange={(event) => setForm((current) => ({ ...current, purchaseOrderNumber: event.target.value }))} /></label>
      <label className="field"><span><LocalizedText text={"PO date *"} /></span><input type="date" value={form.purchaseOrderDate} onChange={(event) => setForm((current) => ({ ...current, purchaseOrderDate: event.target.value }))} /></label>
      <label className="field"><span><LocalizedText text={"Project manager *"} /></span><select value={form.managerId} onChange={(event) => setForm((current) => ({ ...current, managerId: Number(event.target.value) }))}>{managers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Lead engineer *"} /></span><select value={form.leadEngineerId} onChange={(event) => setForm((current) => ({ ...current, leadEngineerId: Number(event.target.value) }))}>{engineers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="field"><span><LocalizedText text={"Start date *"} /></span><input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></label>
      <label className="field"><span><LocalizedText text={"Target delivery *"} /></span><input type="date" min={form.startDate} value={form.targetDelivery} onChange={(event) => setForm((current) => ({ ...current, targetDelivery: event.target.value }))} /></label>
      <label className="field span-2"><span><LocalizedText text={"Site *"} /></span><input required maxLength={300} value={form.site} onChange={(event) => setForm((current) => ({ ...current, site: event.target.value }))} /></label>
    </div>
  </Modal>;
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

const EMPTY_EMPLOYEE: EmployeeInput = {
  employeeNo: 0, nameEn: "", nameTh: "", department: "IoT Engineer Dept.", jobTitle: "IoT Engineer",
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
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setEmployees(await listEmployees({ search, activeOnly })); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [search, activeOnly]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 200); return () => window.clearTimeout(timer); }, [load]);

  const linkedAccounts = employees.filter((employee) => employee.accountActive !== null).length;
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
      {canWrite ? <button className="btn primary" type="button" onClick={() => setEditing("new")}><Icon name="plus" />{t("New employee")}</button> : null}
    </Toolbar>
    <div className="kpi-grid three">
      <KpiCard label={t("Employees")} value={employees.length} icon="users" tone="blue" />
      <KpiCard label={t("Departments")} value={departments} icon="folder" tone="slate" />
      <KpiCard label={t("Linked login accounts")} value={linkedAccounts} note={t("Employee records do not grant login access")} icon="shield" tone="green" />
    </div>
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
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
    {editing ? <EmployeeModal employee={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async (message) => { setEditing(null); await load(); notify(message); }} /> : null}
  </>;
}

function EmployeeModal({ employee, onClose, onSaved }: { employee: EmployeeRecord | null; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const { t } = useLanguage();
  const [form, setForm] = useState<EmployeeInput>(() => employee ? {
    employeeNo: employee.employeeNo, nameEn: employee.nameEn, nameTh: employee.nameTh,
    department: employee.department, jobTitle: employee.jobTitle, mobile: employee.mobile,
    email: employee.email, nickname: employee.nickname, birthDate: employee.birthDate ?? "",
    uniformSize: employee.uniformSize, shoeSize: employee.shoeSize, startWorkDate: employee.startWorkDate,
    endWorkDate: employee.endWorkDate ?? "", position: employee.position, isActive: employee.isActive,
  } : { ...EMPTY_EMPLOYEE });
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
        <label className="field"><span>{t("Department")} *</span><input required maxLength={100} list="employee-departments" value={form.department} onChange={(event) => update("department", event.target.value)} /><datalist id="employee-departments"><option value="IoT Engineer Dept." /><option value="Mechanical Engineer Dept." /></datalist></label>
        <label className="field"><span>{t("Level / position")} *</span><input required maxLength={100} list="employee-positions" value={form.position} onChange={(event) => update("position", event.target.value)} /><datalist id="employee-positions"><option value="Junior Engineer" /><option value="Middle Engineer" /><option value="Senior Engineer" /><option value="Lead Engineer" /><option value="Technical Architect" /></datalist></label>
        <label className="field span-2"><span>{t("Job title")} *</span><input required maxLength={500} value={form.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} /></label>
        <label className="field"><span>{t("Birthday")}</span><input type="date" max={form.startWorkDate} value={form.birthDate ?? ""} onChange={(event) => update("birthDate", event.target.value)} /></label>
        <label className="field"><span>{t("Start work")} *</span><input required type="date" min={form.birthDate || undefined} value={form.startWorkDate} onChange={(event) => update("startWorkDate", event.target.value)} /></label>
        <label className="field"><span>{t("End work")}</span><input type="date" min={form.startWorkDate} value={form.endWorkDate ?? ""} onChange={(event) => update("endWorkDate", event.target.value)} /></label>
        <label className="field"><span>{t("Uniform size")}</span><input maxLength={50} value={form.uniformSize ?? ""} onChange={(event) => update("uniformSize", event.target.value)} /></label>
        <label className="field"><span>{t("Shoe size")}</span><input maxLength={50} value={form.shoeSize ?? ""} onChange={(event) => update("shoeSize", event.target.value)} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => update("isActive", event.target.checked)} /><span>{t("Active employee")}</span></label>
      </div>
      <div className="info-strip" role="note"><Icon name="shield" /><span>{t("Creating an employee does not create a login account. Login access remains controlled by Microsoft Entra or Team Test provisioning.")}</span></div>
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

export function ProductionTeam({ bootstrap, teamTestMode }: Pick<CommonProps, "bootstrap"> & { teamTestMode: boolean }) {
  return <><PageHeader eyebrow="ACCESS CONTROL" title="Team & permissions" subtitle={teamTestMode ? "ผู้ใช้และบทบาทถูกอ่านจากฐานข้อมูล ส่วนการยืนยันตัวตนใช้รหัสทดสอบชั่วคราวสำหรับ UAT" : "ผู้ใช้และบทบาทถูกอ่านจากฐานข้อมูล ส่วนการยืนยันตัวตนมาจาก Microsoft Entra ID"} /><Panel title={`${bootstrap.team.length} active users`} subtitle={`${bootstrap.permissions.length} permissions for your role`} flush><div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Name"} /></th><th><LocalizedText text={"Email"} /></th><th><LocalizedText text={"Role"} /></th><th><LocalizedText text={"Department"} /></th><th><LocalizedText text={"Level"} /></th></tr></thead><tbody>{bootstrap.team.map((member) => <tr key={member.id}><td><strong>{member.name}</strong></td><td>{member.email}</td><td><Badge tone={member.role === "Admin" ? "violet" : "blue"}>{member.role}</Badge></td><td>{member.department}</td><td>{member.level || "—"}</td></tr>)}</tbody></table></div></Panel></>;
}
