"use client";
import { useT as useStaticCopy } from "../i18n";

import { currentLocale, useLanguage, useT as useUiText } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ProductionSalesIntake } from "./SiteVisitScreens";
import { EndUserCompanyField, EndUserEditModal, canEditEndUser } from "./EndUserCompanyField";
import { InquiryCustomerFields } from "./InquiryCustomerFields";
import { defaultInquiryQueueScope, inquiryNextAction, type InquiryNextAction, type InquiryQueueScope } from "../../../lib/inquiry-queue";
import {
  assignInquiryOwner,
  createEstimate,
  createInquiry,
  createInquiryMeeting,
  downloadInquiryAttachment,
  listInquiries,
  loadInquiry,
  updateInquiryQualification,
  uploadInquiryAttachment,
  type BootstrapData,
  type CreateInquiryInput,
  type CreateInquiryMeetingInput,
  type InquiryAttachment,
  type InquiryDetail,
  type InquirySummary,
  type PagedResult,
} from "../api-client";
import {
  Badge,
  Drawer,
  EmptyState,
  Field,
  GridControls,
  Icon,
  PageHeader,
  Pagination,
  Panel,
  Person,
  Pill,
  ProgressCell,
  Select,
  StatusLegend,
  Tabs,
  Toolbar,
  toneOf,
} from "../ui";

type Props = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  refreshBootstrap: () => Promise<void>;
  openEstimate?: (estimateId: number) => void;
  preferredInquiryId?: number | null;
  startWithCreate?: boolean;
  openVisit?: (visitId: number) => void;
};

type Screen = { name: "list" } | { name: "create" } | { name: "detail"; id: number };
type DetailTab = "overview" | "requirement" | "meeting" | "estimate" | "attachments" | "activity" | "visits";

const EMPTY_PAGE: PagedResult<InquirySummary> = { items: [], page: 1, pageSize: 10, total: 0 };
const PROJECT_TYPES = ["Automation", "Robot", "IoT", "Data Collection", "AMR", "WMS", "Traceability", "Electrical", "Machine", "Software", "IoT / Automation"];
const FILE_CATEGORIES = ["Customer RFQ", "Meeting Record", "Specification", "Drawing", "Layout", "Equipment List", "Customer Standard", "Supplier Document", "Reference Document", "Other"];
const OWNER_ROLES = ["Engineer", "Engineering Manager", "Admin"];
const INTEREST_GRADES = [
  { value: "A", label: "A — Hot / สนใจมาก", description: "Need, budget and timeline are clear" },
  { value: "B", label: "B — Warm / สนใจ", description: "Active interest with some conditions to confirm" },
  { value: "C", label: "C — Nurture / อยู่ช่วงศึกษา", description: "Exploring the solution or collecting requirements" },
  { value: "D", label: "D — Low / สนใจน้อย", description: "Low urgency or no confirmed budget" },
] as const;
const PROBABILITY_RANGES = [
  { label: "All probability", from: undefined, to: undefined },
  { label: "High · 75–100%", from: 75, to: 100 },
  { label: "Medium · 50–74%", from: 50, to: 74 },
  { label: "Early · 25–49%", from: 25, to: 49 },
  { label: "Low · 0–24%", from: 0, to: 24 },
] as const;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";

const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "—";
const formatDateTime = (value?: string | null) => value ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const formatMoney = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
const formatFileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
const businessDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const today = () => businessDate(new Date());
const futureDate = (days: number) => businessDate(new Date(Date.now() + days * 86_400_000));
const priorityTone = (priority: string): "red" | "amber" | "blue" | "slate" => priority === "Urgent" ? "red" : priority === "High" ? "amber" : priority === "Normal" ? "blue" : "slate";
const probabilityTone = (value: number): "green" | "blue" | "amber" | "red" => value >= 75 ? "green" : value >= 50 ? "blue" : value >= 25 ? "amber" : "red";
const interestTone = (grade: string): "green" | "blue" | "amber" | "slate" => grade === "A" ? "green" : grade === "B" ? "blue" : grade === "C" ? "amber" : "slate";
const interestLabel = (grade: string) => INTEREST_GRADES.find((item) => item.value === grade)?.label ?? grade;
const compactJson = (value: string | null) => {
  if (!value) return "—";
  try {
    const text = JSON.stringify(JSON.parse(value));
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  } catch { return value; }
};

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"Could not load"} /></strong>{message}</span><button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button></div>;
}

export function ProductionInquiries(props: Props) {
  const [screen, setScreen] = useState<Screen>(() => props.preferredInquiryId ? {name:"detail",id:props.preferredInquiryId} : { name: props.startWithCreate ? "create" : "list" });
  if (screen.name === "create") return <InquiryCreate {...props} onBack={() => setScreen({ name: "list" })} onCreated={(id) => setScreen({ name: "detail", id })} />;
  if (screen.name === "detail") return <InquiryDetailScreen {...props} id={screen.id} onBack={() => setScreen({ name: "list" })} />;
  return <InquiryList {...props} onCreate={() => setScreen({ name: "create" })} onOpen={(id) => setScreen({ name: "detail", id })} />;
}

function InquiryList({ bootstrap, onCreate, onOpen }: Props & { onCreate: () => void; onOpen: (id: number) => void }) {
  const localizeCopy = useStaticCopy();
  const uiText = useUiText();
  const { lang } = useLanguage();
  const [result, setResult] = useState(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("All customers");
  const [projectType, setProjectType] = useState("All project types");
  const [owner, setOwner] = useState("All owners");
  const [queueScope, setQueueScope] = useState<InquiryQueueScope>(() => defaultInquiryQueueScope(bootstrap.user.role));
  const [status, setStatus] = useState("All status");
  const [priority, setPriority] = useState("All priorities");
  const [interestGrade, setInterestGrade] = useState("All grades");
  const [probabilityRange, setProbabilityRange] = useState("All probability");
  const [inquiryFrom, setInquiryFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const customerId = bootstrap.customers.find((item) => item.code === customer)?.id;
  const selectedOwnerId = bootstrap.team.find((item) => item.name === owner)?.id;
  const ownerId = queueScope === "mine" ? bootstrap.user.id : selectedOwnerId;
  const selectedProbabilityRange = PROBABILITY_RANGES.find((item) => item.label === probabilityRange) ?? PROBABILITY_RANGES[0];
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setResult(await listInquiries({
        page, pageSize, search,
        customerId,
        projectType: projectType === "All project types" ? undefined : projectType,
        ownerId,
        status: status === "All status" ? undefined : status,
        priority: priority === "All priorities" ? undefined : priority,
        interestGrade: interestGrade === "All grades" ? undefined : interestGrade,
        probabilityFrom: selectedProbabilityRange.from,
        probabilityTo: selectedProbabilityRange.to,
        inquiryFrom: inquiryFrom || undefined,
        dueTo: dueTo || undefined,
      }));
    } catch (requestError) { setError(toError(requestError)); }
    finally { setLoading(false); }
  }, [page, pageSize, search, customerId, projectType, ownerId, status, priority, interestGrade, selectedProbabilityRange.from, selectedProbabilityRange.to, inquiryFrom, dueTo]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 220); return () => window.clearTimeout(timer); }, [load]);
  const resetPage = () => setPage(1);
  const pageCount = Math.max(1, Math.ceil(result.total / Math.max(1, result.pageSize)));
  const types = useMemo(() => Array.from(new Set([...PROJECT_TYPES, ...result.items.map((item) => item.projectType)])).sort(), [result.items]);
  const canWrite = bootstrap.permissions.includes("inquiry.write");
  const canManageQueue = ["Admin", "Engineering Manager", "Project Manager", "Sales Manager"].includes(bootstrap.user.role);
  const queueCopy = lang === "TH"
    ? { mine: "งานของฉัน", team: "งานทีม", unassigned: "ยังไม่มอบหมาย", unavailable: "ทุก Inquiry มีผู้รับผิดชอบแล้ว เพราะต้องเลือกผู้รับผิดชอบตอนรับเรื่อง" }
    : lang === "JP"
      ? { mine: "自分の案件", team: "チーム案件", unassigned: "未割当", unavailable: "受付時に担当者を必ず選ぶため、すべての Inquiry に担当者がいます。" }
      : { mine: "My work", team: "Team work", unassigned: "Unassigned", unavailable: "Every inquiry already has an owner because ownership is required at intake." };
  const nextActionCopy: Record<InquiryNextAction, string> = lang === "TH" ? {
    review_inputs: "ตรวจข้อมูลและเริ่ม Estimate",
    complete_costs: "เติมต้นทุนและตรวจความพร้อม",
    follow_supplier: "ติดตามราคาจากผู้ขาย",
    submit_review: "ส่งให้ฝ่ายวิศวกรรมตรวจ",
    engineering_review: "ตรวจและให้ข้อสรุป",
    handover_project: "ส่งต่อเพื่อสร้าง Project",
    closed: "ปิดงานแล้ว",
  } : lang === "JP" ? {
    review_inputs: "内容確認・見積開始",
    complete_costs: "原価入力・検証",
    follow_supplier: "仕入先価格を確認",
    submit_review: "技術レビューへ提出",
    engineering_review: "レビュー・結論",
    handover_project: "プロジェクトへ引継ぎ",
    closed: "終了済み",
  } : {
    review_inputs: "Review inputs and start estimate",
    complete_costs: "Complete costs and validation",
    follow_supplier: "Follow up supplier prices",
    submit_review: "Submit for engineering review",
    engineering_review: "Review and decide",
    handover_project: "Hand over to project",
    closed: "Closed",
  };

  return <>
    <PageHeader eyebrow="SALES TO ENGINEERING" title="Inquiry · รับเรื่องลูกค้า" subtitle="เริ่มเรื่องที่นี่ → ขอเข้าหน้างานเมื่อจำเป็น → ทำ Estimate จากเรื่องเดิม" actions={canWrite ? <button className="btn primary" type="button" onClick={onCreate}><Icon name="plus" /><LocalizedText text={"รับเรื่องใหม่"} /></button> : undefined} />
    <div className="info-strip" role="region" aria-label={queueCopy.team} style={{ marginBottom: 12, flexWrap: "wrap" }}>
      <Icon name="users" />
      <div className="seg-control" role="group" aria-label={queueCopy.team}>
        <button type="button" className={queueScope === "mine" ? "on" : ""} aria-pressed={queueScope === "mine"} onClick={() => { setQueueScope("mine"); resetPage(); }}>{queueCopy.mine}</button>
        <button type="button" className={queueScope === "team" ? "on" : ""} aria-pressed={queueScope === "team"} onClick={() => { setQueueScope("team"); resetPage(); }}>{queueCopy.team}</button>
        {canManageQueue ? <button type="button" disabled title={queueCopy.unavailable} style={{ cursor: "not-allowed", opacity: 0.55 }}>{queueCopy.unassigned}</button> : null}
      </div>
      <span className="muted" style={{ flex: "1 1 320px" }}>{queueScope === "mine" ? `${bootstrap.user.name} · ${result.total}` : `${queueCopy.team} · ${result.total}`}{canManageQueue ? ` · ${queueCopy.unavailable}` : ""}</span>
    </div>
    <Toolbar>
      <div style={{ minWidth: 310, flex: 1 }}><label className="search-field"><Icon name="search" /><input maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder={uiText("Search inquiry, project, customer, end user or RFQ…")} />{search ? <button type="button" onClick={() => setSearch("")} aria-label={uiText("Clear search")}><Icon name="x" /></button> : null}</label></div>
      <Select label="Customer" value={customer} onChange={(value) => { setCustomer(value); resetPage(); }} options={["All customers", ...bootstrap.customers.map((item) => item.code)]} />
      <Select label="Project type" value={projectType} onChange={(value) => { setProjectType(value); resetPage(); }} options={["All project types", ...types]} />
      {queueScope === "team" ? <Select label="Estimate owner" value={owner} onChange={(value) => { setOwner(value); resetPage(); }} options={["All owners", ...bootstrap.team.filter((member) => OWNER_ROLES.includes(member.role)).map((member) => member.name)]} /> : null}
      <Select label="Status" value={status} onChange={(value) => { setStatus(value); resetPage(); }} options={["All status", "New", "Estimating", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Approved", "Cancelled"]} />
      <Select label="Priority" value={priority} onChange={(value) => { setPriority(value); resetPage(); }} options={["All priorities", "Urgent", "High", "Normal", "Low"]} />
      <Select label="Customer interest" value={interestGrade} onChange={(value) => { setInterestGrade(value); resetPage(); }} options={["All grades", ...INTEREST_GRADES.map((item) => item.value)]} />
      <Select label="Project probability" value={probabilityRange} onChange={(value) => { setProbabilityRange(value); resetPage(); }} options={PROBABILITY_RANGES.map((item) => item.label)} />
      <label className="btn ghost"><Icon name="calendar" /><span><LocalizedText text={"Inquiry date"} /></span><input aria-label={localizeCopy("Inquiry from date")} type="date" value={inquiryFrom} onChange={(event) => { setInquiryFrom(event.target.value); resetPage(); }} /></label>
      <label className="btn ghost"><Icon name="calendar" /><span><LocalizedText text={"Due date"} /></span><input aria-label={localizeCopy("Due through date")} type="date" value={dueTo} onChange={(event) => { setDueTo(event.target.value); resetPage(); }} /></label>
    </Toolbar>
    {/* The seven statuses dbo.inquiries allows. Casing matters: the tone lookup
        is exact, so "Engineering review" would silently render as slate. */}
    <StatusLegend items={[
      { label: "New" },
      { label: "Estimating" },
      { label: "Waiting Supplier Price" },
      { label: "Estimate Completed" },
      { label: "Engineering Review" },
      { label: "Approved" },
      { label: "Cancelled" },
    ]} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <Panel title={`${result.total} ${uiText("inquiries")}`} flush>
      <GridControls hideSearch pageSize={pageSize} onPageSize={(size) => { setPageSize(size); setPage(1); }} search={search} onSearch={(value) => { setSearch(value); setPage(1); }} />
      {result.items.length ? <div className="table-wrap"><table>
        <thead><tr><th><LocalizedText text={"Inquiry / งาน"} /></th><th><LocalizedText text={"Customer"} /></th><th><LocalizedText text={"Owner / due"} /></th><th><LocalizedText text={"Next action"} /></th><th><LocalizedText text={"Priority"} /></th><th><LocalizedText text={"Status"} /></th><th aria-label={uiText("Action")} /></tr></thead>
        <tbody>{result.items.map((item) => {
          const customerItem = bootstrap.customers.find((entry) => entry.id === item.customerId);
          const late = item.dueDate < today() && item.status !== "Approved" && item.status !== "Cancelled";
          const rowClass = late ? "row-late" : item.status === "Approved" || item.status === "Estimate Completed" ? "row-ok" : item.status === "Waiting Supplier Price" ? "row-wait" : "";
          return <tr key={item.id} className={`clickable ${rowClass}`} onClick={() => onOpen(item.id)}>
            <td><button className="back-link" type="button" onClick={(event) => { event.stopPropagation(); onOpen(item.id); }}>{item.projectName}</button><div className="muted">{item.number} <LocalizedText text={"·"} /> {item.projectType}</div></td>
            <td><div className="cell-primary"><strong>{customerItem?.code ?? "—"}</strong><span>{item.customerName}</span><small><LocalizedText text={"End user:"} /> {item.endUserName || "ยังไม่ระบุ / Not specified"}</small></div></td>
            <td><div className="cell-primary"><Person initials={initials(item.estimateOwnerName)} name={item.estimateOwnerName} /><small className={late ? "red-text" : undefined}>{late ? "⚠ " : ""}<LocalizedText text={"Due"} /> {formatDate(item.dueDate)}</small><small><LocalizedText text={"Sales"} />: {item.salesOwner || "—"}</small></div></td>
            <td><strong>{nextActionCopy[inquiryNextAction(item.status, Boolean(item.estimateId))]}</strong></td>
            <td><Badge tone={priorityTone(item.priority)}>{item.priority}</Badge></td><td><Badge tone={toneOf(item.status)}>{item.status}</Badge><ProgressCell value={Number(item.progress)} /></td>
            <td><span className="row-action"><Icon name="chevronRight" /></span></td>
          </tr>;
        })}</tbody>
      </table><Pagination page={result.page} pageCount={pageCount} from={(result.page - 1) * result.pageSize + 1} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div>
        : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading from SQL Server…"} /></div> : <EmptyState icon="inbox" title="No inquiry matches the filter" message="Adjust the filters above or register a new customer inquiry." />}
    </Panel>
  </>;
}

type QueuedFile = { file: File; category: string };

function InquiryCreate({ bootstrap, notify, refreshBootstrap, onBack, onCreated }: Props & { onBack: () => void; onCreated: (id: number) => void }) {
  const engineers = bootstrap.team.filter((member) => OWNER_ROLES.includes(member.role));
  const [form, setForm] = useState<CreateInquiryInput>({
    customerId: 0, endUserCustomerId: null, contact: "", projectName: "", projectType: "Automation", rfqNo: "",
    salesOwner: bootstrap.user.name, estimateOwnerId: engineers[0]?.id ?? 0, dueDate: futureDate(14), priority: "Normal",
    projectProbability: 25, customerInterestGrade: "C", qualificationNote: "",
    requirement: "", background: "", scopeSummary: "", technical: "", targetDelivery: "", siteLocation: "", standard: "", special: "", remark: "",
  });
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof CreateInquiryInput>(key: K, value: CreateInquiryInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const addFiles = (selected: FileList | File[]) => setFiles((current) => [...current, ...Array.from(selected).filter((file) => file.size > 0 && file.size <= MAX_FILE_BYTES).map((file) => ({ file, category: "Customer RFQ" }))]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    let createdInquiry: { id: number; number: string; rowVersion: string } | null = null;
    try {
      createdInquiry = await createInquiry({ ...form, targetDelivery: form.targetDelivery || undefined });
      for (const queued of files) await uploadInquiryAttachment(createdInquiry.id, queued);
      await refreshBootstrap();
      notify(`${createdInquiry.number} registered${files.length ? ` · uploaded ${files.length} file(s)` : ""}`);
      onCreated(createdInquiry.id);
    } catch (requestError) {
      if (createdInquiry) {
        await refreshBootstrap().catch(() => undefined);
        notify(`${createdInquiry.number} was registered, but an attachment upload failed`);
        onCreated(createdInquiry.id);
      } else setError(toError(requestError));
    }
    finally { setBusy(false); }
  };

  return <form onSubmit={(event) => { void submit(event); }}>
    <button className="back-link" type="button" onClick={onBack}><Icon name="arrowLeft" /><LocalizedText text={"Inquiry Management"} /></button>
    <PageHeader eyebrow="NEW INQUIRY" title="Register customer inquiry" subtitle="หนึ่งเรื่องลูกค้า ใช้ต่อได้ทั้งการสำรวจหน้างานและการประมาณราคา" actions={<><button className="btn default" type="button" disabled={busy} onClick={onBack}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="submit" disabled={busy || !form.customerId || !form.estimateOwnerId || !form.projectName.trim()}><Icon name="check" />{busy ? "Registering…" : "Register inquiry"}</button></>} />
    {error ? <LoadError message={error} retry={() => undefined} /> : null}
    <Panel title="รับเรื่องลูกค้า" subtitle="บันทึกข้อมูลหลักก่อน แล้วเลือกทำ Estimate หรือขอเข้าหน้างาน"><div className="form-grid">
      <InquiryCustomerFields customers={bootstrap.customers} permissions={bootstrap.permissions} customerId={form.customerId} contact={form.contact} disabled={busy} onChange={(customerId, contact) => setForm((current) => ({ ...current, customerId, contact }))} refreshBootstrap={refreshBootstrap} notify={notify} />
      <EndUserCompanyField bootstrap={bootstrap} customerId={form.customerId} value={form.endUserCustomerId ?? null} disabled={busy} onChange={(endUserCustomerId) => setForm((current) => ({ ...current, endUserCustomerId }))} refreshBootstrap={refreshBootstrap} notify={notify} />
      <Field label="Project Name" span={2}><input required maxLength={300} value={form.projectName} onChange={(event) => set("projectName", event.target.value)} /></Field>
      <Field label="Sales Owner"><select value={form.salesOwner} onChange={(event) => set("salesOwner", event.target.value)}>{bootstrap.team.map((member) => <option key={member.id}>{member.name}</option>)}</select></Field>
      <Field label="กำหนดตอบกลับ / Estimate due"><input required min={today()} type="date" value={form.dueDate} onChange={(event) => set("dueDate", event.target.value)} /></Field>
      <Field label="Customer Requirement" span={2}><textarea maxLength={20000} value={form.requirement} onChange={(event) => set("requirement", event.target.value)} /></Field>
    </div></Panel>
    <details className="panel" style={{ marginTop: 14, padding: 18 }}><summary><LocalizedText text={"รายละเอียดเพิ่มเติม · ผู้ประเมิน ประเภทงาน และข้อมูลทางเทคนิค"} /></summary>
      <p className="muted"><LocalizedText text={"ผู้ประเมินเริ่มต้น:"} /> {engineers.find((member) => member.id === form.estimateOwnerId)?.name ?? "กรุณาเลือกผู้ประเมิน"} <LocalizedText text={"· เปลี่ยนได้ในส่วนนี้"} /></p>
      <div className="form-grid">
      <Field label="Project Type"><select value={form.projectType} onChange={(event) => set("projectType", event.target.value)}>{PROJECT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
      <Field label="Customer RFQ No."><input maxLength={100} value={form.rfqNo} onChange={(event) => set("rfqNo", event.target.value)} /></Field>
      <Field label="Estimate Owner"><select value={form.estimateOwnerId} onChange={(event) => set("estimateOwnerId", Number(event.target.value))}>{engineers.map((member) => <option key={member.id} value={member.id}>{member.name} — {member.department}</option>)}</select></Field>
      <Field label="Priority"><select value={form.priority} onChange={(event) => set("priority", event.target.value)}>{["Low", "Normal", "High", "Urgent"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Project Probability" hint="0% = unlikely, 100% = highly likely"><div className="input-suffix"><input type="number" min="0" max="100" step="5" value={form.projectProbability} onChange={(event) => set("projectProbability", Number(event.target.value))} /><span>%</span></div></Field>
      <Field label="Customer Interest Grade"><select value={form.customerInterestGrade} onChange={(event) => set("customerInterestGrade", event.target.value)}>{INTEREST_GRADES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
      <Field label="Qualification Note" hint="Record the evidence behind the grade and probability" span={2}><textarea maxLength={2000} rows={2} value={form.qualificationNote} onChange={(event) => set("qualificationNote", event.target.value)} /></Field>
      <Field label="Project Background" span={2}><textarea maxLength={20000} value={form.background} onChange={(event) => set("background", event.target.value)} /></Field>
      <Field label="Scope Summary" span={2}><textarea maxLength={20000} value={form.scopeSummary} onChange={(event) => set("scopeSummary", event.target.value)} /></Field>
      <Field label="Technical Requirement" span={2}><textarea maxLength={20000} value={form.technical} onChange={(event) => set("technical", event.target.value)} /></Field>
      <Field label="Target Delivery"><input type="date" min={today()} value={form.targetDelivery} onChange={(event) => set("targetDelivery", event.target.value)} /></Field>
      <Field label="Site Location"><input maxLength={300} value={form.siteLocation} onChange={(event) => set("siteLocation", event.target.value)} /></Field>
      <Field label="Customer Standard"><input value={form.standard} onChange={(event) => set("standard", event.target.value)} /></Field>
      <Field label="Special Requirement"><input value={form.special} onChange={(event) => set("special", event.target.value)} /></Field>
      <Field label="Remark" span={4}><textarea value={form.remark} onChange={(event) => set("remark", event.target.value)} /></Field></div>
    </details>
    <div style={{ height: 14 }} />
    <Panel title="Inquiry Attachments" subtitle="Files are stored in the configured company document storage and linked to the inquiry">
      <input ref={fileRef} type="file" multiple hidden onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
      <button className="attachment-drop" type="button" onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}><Icon name="upload" /><strong><LocalizedText text={"Drag and drop files here or click to browse"} /></strong><span><LocalizedText text={"PDF, Excel, Word, DWG or image — maximum 50 MB per file"} /></span></button>
      {files.length ? <div style={{ marginTop: 12 }}>{files.map((queued, index) => <div className="file-row" key={`${queued.file.name}-${index}`}><span className="file-icon"><Icon name="file" /></span><div style={{ flex: 1 }}><strong>{queued.file.name}</strong><small>{formatFileSize(queued.file.size)} <LocalizedText text={"· queued for upload"} /></small></div><select value={queued.category} onChange={(event) => setFiles((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item))}>{FILE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select><button type="button" className="row-action" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${queued.file.name}`}><Icon name="trash" /></button></div>)}</div> : null}
    </Panel>
  </form>;
}

function InquiryDetailScreen({ id, bootstrap, notify, refreshBootstrap, openEstimate, openVisit, onBack }: Props & { id: number; onBack: () => void }) {
  const { lang } = useLanguage();
  const [requestVisit, setRequestVisit] = useState(0);
  const [detail, setDetail] = useState<InquiryDetail | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [qualificationOpen, setQualificationOpen] = useState(false);
  const [endUserOpen, setEndUserOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setLoading(true); setError(""); try { setDetail(await loadInquiry(id)); } catch (requestError) { setError(toError(requestError)); } finally { setLoading(false); } }, [id]);
  useEffect(() => {
    let cancelled = false;
    void loadInquiry(id)
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((requestError) => { if (!cancelled) setError(toError(requestError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);
  if (loading && !detail) return <div className="empty"><span className="spinner" /><LocalizedText text={"Loading inquiry from SQL Server…"} /></div>;
  if (!detail) return <><button className="back-link" type="button" onClick={onBack}><Icon name="arrowLeft" /><LocalizedText text={"Inquiry Management"} /></button><LoadError message={error || "Inquiry not found"} retry={() => { void load(); }} /></>;
  const canWrite = bootstrap.permissions.includes("inquiry.write");
  const canCreateEstimate = bootstrap.permissions.includes("estimate.write");
  const estimateIsReadOnly = detail.estimate ? ["Approved", "Locked"].includes(detail.estimate.status) : false;
  const flowCopy = lang === "TH"
    ? detail.estimate
      ? estimateIsReadOnly ? {
          title: "ขั้นต่อไป: ตรวจ Estimate ที่อนุมัติแล้ว",
          description: "Revision นี้อ่านได้อย่างเดียว เปิดเพื่อตรวจต้นทุนและประวัติ หากต้องแก้ไขให้สร้าง Revision ใหม่ใน Estimate",
          action: "เปิดดู Estimate",
          ariaLabel: "ขั้นตอน Inquiry ไป Estimate",
        } : {
          title: "ขั้นต่อไป: เติมต้นทุนใน Estimate",
          description: "เปิด Estimate แล้วกรอกค่าวัสดุ ค่าแรงวิศวกรรม และค่าใช้จ่ายอื่น จากนั้นตรวจ Validation ก่อนส่งตรวจ",
          action: "เปิด Estimate",
          ariaLabel: "ขั้นตอน Inquiry ไป Estimate",
        }
      : {
          title: "ขั้นต่อไป: ตรวจข้อมูลแล้วสร้าง Estimate",
          description: "ตรวจ Requirement และไฟล์แนบให้ครบ แล้วสร้าง Estimate จากเรื่องนี้ได้ทันที การเข้าหน้างานทำเฉพาะเมื่อข้อมูลยังไม่พอ",
          action: "สร้าง Estimate",
          ariaLabel: "ขั้นตอน Inquiry ไป Estimate",
        }
    : lang === "JP"
      ? detail.estimate
        ? estimateIsReadOnly ? {
            title: "次のステップ：承認済み見積を確認",
            description: "このリビジョンは読み取り専用です。原価と履歴を確認し、変更が必要な場合は見積画面で新しいリビジョンを作成します。",
            action: "見積を確認",
            ariaLabel: "Inquiry から Estimate への手順",
          } : {
            title: "次のステップ：見積原価を入力",
            description: "見積を開き、材料費・技術工数・その他費用を入力してから、Validation を確認してレビューへ送ります。",
            action: "見積を開く",
            ariaLabel: "Inquiry から Estimate への手順",
          }
        : {
            title: "次のステップ：内容を確認して見積を作成",
            description: "Requirement と添付資料を確認し、この Inquiry から見積を作成します。現地調査は情報が不足する場合のみ実施します。",
            action: "見積を作成",
            ariaLabel: "Inquiry から Estimate への手順",
          }
      : detail.estimate
        ? estimateIsReadOnly ? {
            title: "Next: review the approved estimate",
            description: "This revision is read-only. Open it to review costs and history; create a new revision in the estimate if changes are needed.",
            action: "Review estimate",
            ariaLabel: "Inquiry to estimate steps",
          } : {
            title: "Next: complete the estimate cost",
            description: "Open the estimate, add material, engineering man-hour and other costs, then check Validation before review.",
            action: "Open estimate",
            ariaLabel: "Inquiry to estimate steps",
          }
        : {
            title: "Next: review the inputs and create an estimate",
            description: "Check the requirement and attachments, then create the estimate from this inquiry. Request a site visit only when more information is needed.",
            action: "Create estimate",
            ariaLabel: "Inquiry to estimate steps",
          };

  const createLinkedEstimate = async () => {
    setBusy(true); setError("");
    try {
      const created = await createEstimate({ inquiryId: detail.id, ownerId: detail.estimateOwnerId, dueDate: detail.dueDate, contingencyRate: 0 });
      notify(`${created.number} created from ${detail.number}`); await Promise.all([load(), refreshBootstrap()]); setTab("estimate");
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return <>
    <button className="back-link" type="button" onClick={onBack}><Icon name="arrowLeft" /><LocalizedText text={"Inquiry Management"} /></button>
    <PageHeader eyebrow={detail.number} title={`${detail.customerCode} — ${detail.projectName}`} subtitle={detail.customerName} meta={<><div><span><LocalizedText text={"Inquiry status"} /></span><strong><Badge tone={toneOf(detail.status)}>{detail.status}</Badge></strong></div><div><span><LocalizedText text={"Project probability"} /></span><strong><Badge tone={probabilityTone(detail.projectProbability)}>{`${detail.projectProbability}%`}</Badge></strong></div><div><span><LocalizedText text={"Customer interest"} /></span><strong><Badge tone={interestTone(detail.customerInterestGrade)}>{interestLabel(detail.customerInterestGrade)}</Badge></strong></div><div><span><LocalizedText text={"Estimate due"} /></span><strong>{formatDate(detail.dueDate)}</strong></div><div><span><LocalizedText text={"Estimate owner"} /></span><strong>{detail.estimateOwnerName}</strong></div><div><span><LocalizedText text={"Priority"} /></span><strong><Badge tone={priorityTone(detail.priority)}>{detail.priority}</Badge></strong></div><div><span><LocalizedText text={"Project type"} /></span><strong>{detail.projectType}</strong></div></>} actions={<>
      {bootstrap.permissions.includes("intake.write") && bootstrap.permissions.includes("intake.read") ? <button className="btn default" type="button" onClick={() => { setRequestVisit((value) => value + 1); setTab("visits"); }}><Icon name="truck" /><LocalizedText text={"Request a site visit"} /></button> : null}
      {canWrite ? <button className="btn default" type="button" onClick={() => setAssignOpen(true)}><Icon name="user" /><LocalizedText text={"Assign owner"} /></button> : null}
      {canWrite && canEditEndUser(detail.status) ? <button className="btn default" type="button" onClick={() => setEndUserOpen(true)}><LocalizedText text={"End user / บริษัทผู้ใช้งานปลายทาง"} /></button> : null}
      {canWrite ? <button className="btn default" type="button" onClick={() => setQualificationOpen(true)}><Icon name="trendingUp" /><LocalizedText text={"Update qualification"} /></button> : null}
    </>} />
    {error ? <LoadError message={error} retry={() => { void load(); }} /> : null}
    <div className="info-strip" role="region" aria-label={flowCopy.ariaLabel} style={{ marginBottom: 14, flexWrap: "wrap" }}>
      <Icon name={estimateIsReadOnly ? "lock" : detail.estimate ? "checkCircle" : "arrowRight"} />
      <span style={{ flex: "1 1 360px" }}><strong>{flowCopy.title}</strong>{flowCopy.description}</span>
      {detail.estimate
        ? <button className="btn primary sm" type="button" onClick={() => openEstimate?.(detail.estimate!.id)}>{flowCopy.action}<Icon name="arrowRight" /></button>
        : canCreateEstimate
          ? <button className="btn primary sm" type="button" disabled={busy} onClick={() => { void createLinkedEstimate(); }}><Icon name="plus" />{busy ? "…" : flowCopy.action}</button>
          : null}
    </div>
    <Tabs active={tab} onChange={(value) => { setRequestVisit(0); setTab(value); }} tabs={[{ id: "overview", label: "Overview" }, { id: "requirement", label: "Requirement" }, ...(bootstrap.permissions.includes("intake.read") ? [{ id: "visits" as const, label: "เข้าหน้างาน / ผลสำรวจ" }] : []), { id: "meeting", label: "Meeting Log", count: detail.meetings.length }, { id: "estimate", label: "Estimate Cost", count: detail.estimate ? 1 : 0 }, { id: "attachments", label: "Attachments", count: detail.attachments.length }, { id: "activity", label: "Activity" }]} />
    <div style={{ height: 14 }} />
    {tab === "overview" ? <InquiryOverview detail={detail} openEstimate={openEstimate} /> : null}
    {tab === "visits" ? <ProductionSalesIntake key={`${detail.id}-${requestVisit}`} bootstrap={bootstrap} notify={notify} refreshBootstrap={refreshBootstrap} inquiry={detail} startWithRequest={requestVisit > 0} openVisit={openVisit} /> : null}
    {tab === "requirement" ? <InquiryRequirement detail={detail} /> : null}
    {tab === "meeting" ? <MeetingLog detail={detail} canWrite={canWrite} onAdd={() => setMeetingOpen(true)} /> : null}
    {tab === "estimate" ? <InquiryEstimateTab detail={detail} openEstimate={openEstimate} /> : null}
    {tab === "attachments" ? <InquiryAttachments detail={detail} canWrite={canWrite} onUpload={() => setUploadOpen(true)} notify={notify} /> : null}
    {tab === "activity" ? <InquiryActivityTab detail={detail} /> : null}
    {endUserOpen ? <EndUserEditModal kind="inquiries" record={detail} bootstrap={bootstrap} refreshBootstrap={refreshBootstrap} notify={notify} onClose={() => setEndUserOpen(false)} onSaved={load} reloadRecord={() => loadInquiry(detail.id)} /> : null}
    {meetingOpen ? <MeetingDrawer bootstrap={bootstrap} detail={detail} onClose={() => setMeetingOpen(false)} onSaved={async () => { setMeetingOpen(false); notify("Meeting record added to the inquiry"); await load(); }} /> : null}
    {assignOpen ? <AssignOwnerDrawer bootstrap={bootstrap} detail={detail} onClose={() => setAssignOpen(false)} onSaved={async () => { setAssignOpen(false); notify("Estimate owner re-assigned"); await load(); }} /> : null}
    {qualificationOpen ? <QualificationDrawer detail={detail} onClose={() => setQualificationOpen(false)} onSaved={async () => { setQualificationOpen(false); notify("Project qualification updated"); await load(); }} /> : null}
    {uploadOpen ? <AttachmentDrawer detail={detail} onClose={() => setUploadOpen(false)} onSaved={async () => { setUploadOpen(false); notify("Attachment uploaded"); await load(); }} /> : null}
  </>;
}

function InquiryOverview({ detail, openEstimate }: { detail: InquiryDetail; openEstimate?: (estimateId: number) => void }) {
  const uiText = useUiText();
  return <section className="grid-main"><div className="stack"><Panel title="Inquiry information"><dl className="def-list">
    <div><dt><LocalizedText text={"Inquiry No."} /></dt><dd className="mono">{detail.number}</dd></div><div><dt><LocalizedText text={"Inquiry date"} /></dt><dd>{formatDate(detail.inquiryDate)}</dd></div><div><dt><LocalizedText text={"บริษัทที่รับงานด้วย / Contracting customer"} /></dt><dd>{detail.customerName}</dd></div><div><dt><LocalizedText text={"End user / บริษัทผู้ใช้งานปลายทาง"} /></dt><dd>{detail.endUserName || "ยังไม่ระบุ / Not specified"}</dd></div><div><dt><LocalizedText text={"Customer contact"} /></dt><dd>{detail.contact || "—"}</dd></div><div><dt><LocalizedText text={"Customer RFQ No."} /></dt><dd className="mono">{detail.rfqNo || "—"}</dd></div><div><dt><LocalizedText text={"Project type"} /></dt><dd>{detail.projectType}</dd></div><div><dt><LocalizedText text={"Sales owner"} /></dt><dd>{detail.salesOwner || "—"}</dd></div><div><dt><LocalizedText text={"Estimate owner"} /></dt><dd>{detail.estimateOwnerName}</dd></div><div><dt><LocalizedText text={"Site location"} /></dt><dd>{detail.siteLocation || "—"}</dd></div><div><dt><LocalizedText text={"Target delivery"} /></dt><dd>{formatDate(detail.targetDelivery)}</dd></div>
  </dl></Panel><Panel title="Scope summary"><p style={{ fontSize: "var(--fs-sm)", whiteSpace: "pre-wrap" }}>{detail.scopeSummary || "—"}</p>{detail.remark ? <div className="info-strip amber" style={{ marginTop: 12 }}><Icon name="alertTriangle" />{detail.remark}</div> : null}</Panel></div>
  <div className="stack"><Panel title={uiText("Project qualification")} subtitle="Sales signal and forecast are tracked independently"><dl className="def-list one"><div><dt><LocalizedText text={"Project probability"} /></dt><dd><Badge tone={probabilityTone(detail.projectProbability)}>{`${detail.projectProbability}%`}</Badge></dd></div><div><dt><LocalizedText text={"Customer interest grade"} /></dt><dd><Badge tone={interestTone(detail.customerInterestGrade)}>{interestLabel(detail.customerInterestGrade)}</Badge></dd></div><div><dt><LocalizedText text={"Qualification evidence"} /></dt><dd style={{ whiteSpace: "pre-wrap" }}>{detail.qualificationNote || "No evidence recorded yet"}</dd></div></dl><div className="info-strip" style={{ marginTop: 12 }}><Icon name="trendingUp" /><span><strong><LocalizedText text={"Forecast guide"} /></strong> <LocalizedText text={"75–100% High · 50–74% Medium · 25–49% Early · 0–24% Low"} /></span></div></Panel><Panel title="Estimate progress">{detail.estimate ? <><dl className="def-list one"><div><dt><LocalizedText text={"Estimate No."} /></dt><dd className="mono">{detail.estimate.number} <Pill>{`R${String(detail.estimate.revision).padStart(2, "0")}`}</Pill></dd></div><div><dt><LocalizedText text={"Status"} /></dt><dd><Badge tone={toneOf(detail.estimate.status)}>{detail.estimate.status}</Badge></dd></div><div><dt><LocalizedText text={"Total estimated cost"} /></dt><dd><strong>{formatMoney(detail.estimate.total)}</strong></dd></div><div><dt><LocalizedText text={"Progress"} /></dt><dd><ProgressCell value={detail.estimate.progress} /></dd></div></dl><button className="btn default block" type="button" style={{ marginTop: 12 }} onClick={() => openEstimate?.(detail.estimate!.id)}><LocalizedText text={"Open estimate workspace"} /><Icon name="arrowRight" /></button></> : <EmptyState icon="file" title="No estimate yet" message="Create the estimate cost to start collecting engineering cost for this inquiry." />}</Panel>
  <Panel title="Latest meetings">{detail.meetings.length ? <ul className="check-list">{detail.meetings.slice(0, 3).map((meeting) => <li className="check-item pass" key={meeting.id}><Icon name="checkCircle" /><div><strong>{meeting.meetingType} <LocalizedText text={"·"} /> {formatDate(meeting.meetingDate)}</strong><p>{meeting.decision || "No decision recorded"}</p></div></li>)}</ul> : <p className="muted"><LocalizedText text={"No meeting recorded yet."} /></p>}</Panel></div></section>;
}

function InquiryRequirement({ detail }: { detail: InquiryDetail }) {
  const blocks: [string, string][] = [["Customer Requirement", detail.requirement], ["Project Background", detail.background], ["Scope Summary", detail.scopeSummary], ["Technical Requirement", detail.technical], ["Customer Standard", detail.standard], ["Special Requirement", detail.special], ["Site Location", detail.siteLocation], ["Target Delivery", formatDate(detail.targetDelivery)], ["Remark", detail.remark]];
  return <Panel title="Requirement Information" subtitle="The engineering basis recorded against this inquiry"><dl className="def-list">{blocks.map(([label, value]) => <div key={label} style={label === "Customer Requirement" || label === "Technical Requirement" ? { gridColumn: "span 2" } : undefined}><dt>{label}</dt><dd style={{ whiteSpace: "pre-wrap" }}>{value || "—"}</dd></div>)}</dl></Panel>;
}

function MeetingLog({ detail, canWrite, onAdd }: { detail: InquiryDetail; canWrite: boolean; onAdd: () => void }) {
  return <Panel title="Meeting Log" subtitle="Why the estimate requirement changed, recorded meeting by meeting" actions={canWrite ? <button className="btn primary sm" type="button" onClick={onAdd}><Icon name="plus" /><LocalizedText text={"Add Meeting Record"} /></button> : undefined}>{detail.meetings.length ? <div className="timeline">{detail.meetings.map((meeting, index) => <article className="timeline-item done" key={meeting.id}><div className="timeline-head"><strong>{meeting.meetingType}</strong><time>{formatDate(meeting.meetingDate)}</time><Pill>{`#${detail.meetings.length - index}`}</Pill><span className="spacer" /><span className="muted">{meeting.participants.length} <LocalizedText text={"participants"} /></span></div><div className="timeline-card"><dl className="def-list"><div><dt><LocalizedText text={"Participants"} /></dt><dd>{meeting.participants.join(", ") || "—"}</dd></div><div><dt><LocalizedText text={"Customer requirement"} /></dt><dd>{meeting.requirement || "—"}</dd></div><div><dt><LocalizedText text={"Technical discussion"} /></dt><dd>{meeting.technical || "—"}</dd></div><div><dt><LocalizedText text={"Decision"} /></dt><dd>{meeting.decision || "—"}</dd></div><div><dt><LocalizedText text={"Open point"} /></dt><dd>{meeting.openPoint || "—"}</dd></div><div><dt><LocalizedText text={"Action item"} /></dt><dd>{meeting.actionItem || "—"}</dd></div><div><dt><LocalizedText text={"Owner"} /></dt><dd>{meeting.ownerName || "—"}</dd></div><div><dt><LocalizedText text={"Due date"} /></dt><dd>{formatDate(meeting.dueDate)}</dd></div></dl>{meeting.attachmentName ? <div className="file-row" style={{ marginTop: 10 }}><span className="file-icon"><Icon name="paperclip" /></span><div><strong>{meeting.attachmentName}</strong><small><LocalizedText text={"Meeting Record"} /></small></div></div> : null}</div></article>)}</div> : <EmptyState icon="inbox" title="No meeting recorded yet" message="Add the kickoff meeting so engineers understand where the requirement came from." action={canWrite ? <button className="btn primary" type="button" onClick={onAdd}><Icon name="plus" /><LocalizedText text={"Add Meeting Record"} /></button> : undefined} />}</Panel>;
}

function InquiryEstimateTab({ detail, openEstimate }: { detail: InquiryDetail; openEstimate?: (estimateId: number) => void }) {
  const uiText = useUiText();
  const { lang } = useLanguage();
  if (!detail.estimate) return <Panel><EmptyState icon="file" title="No estimate cost created" message="Create an estimate to divide the engineering scope and start collecting cost." /></Panel>;
  const estimate = detail.estimate;
  const missingOverhead = lang === "TH" ? "ยังไม่ตั้ง" : lang === "JP" ? "未設定" : "Missing";
  return <Panel title="Estimate cost linked to this inquiry" flush><div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Estimate No."} /></th><th><LocalizedText text={"Rev."} /></th><th><LocalizedText text={"Owner"} /></th><th><LocalizedText text={"Created"} /></th><th><LocalizedText text={"Due"} /></th><th className="num"><LocalizedText text={"Material"} /></th><th className="num"><LocalizedText text={"Engineering"} /></th><th className="num"><LocalizedText text={"Outsource"} /></th><th className="num"><LocalizedText text={"Other"} /></th><th className="num"><LocalizedText text={"Overhead"} /></th><th className="num"><LocalizedText text={"Total"} /></th><th><LocalizedText text={"Progress"} /></th><th><LocalizedText text={"Status"} /></th><th aria-label={uiText("Action")} /></tr></thead><tbody><tr className="clickable" onClick={() => openEstimate?.(estimate.id)}><td><strong className="mono">{estimate.number}</strong></td><td><Pill>{`R${String(estimate.revision).padStart(2, "0")}`}</Pill></td><td>{estimate.ownerName}</td><td>{formatDate(estimate.createdDate)}</td><td>{formatDate(estimate.dueDate)}</td><td className="num">{formatMoney(estimate.materialTotal)}</td><td className="num">{formatMoney(estimate.engineeringTotal)}</td><td className="num">{formatMoney(estimate.outsourceTotal)}</td><td className="num">{formatMoney(estimate.otherTotal)}</td><td className="num">{estimate.overheadState === "Missing" || estimate.overheadTotal === null ? <Badge tone="amber">{missingOverhead}</Badge> : formatMoney(estimate.overheadTotal)}</td><td className="num"><strong>{formatMoney(estimate.total)}</strong></td><td style={{ minWidth: 110 }}><ProgressCell value={estimate.progress} /></td><td><Badge tone={toneOf(estimate.status)}>{estimate.status}</Badge></td><td><span className="row-action"><Icon name="chevronRight" /></span></td></tr></tbody></table></div></Panel>;
}

function InquiryAttachments({ detail, canWrite, onUpload, notify }: { detail: InquiryDetail; canWrite: boolean; onUpload: () => void; notify: (message: string) => void }) {
  const uiText = useUiText();
  const { lang } = useLanguage();
  const handoverCopy = lang === "TH"
    ? "ไฟล์ที่แนบจะถูกจัดหมวดและส่งต่อไปยัง Project อัตโนมัติเมื่อสร้าง Project"
    : lang === "JP"
      ? "添付ファイルは分類され、プロジェクト作成時に自動的に引き継がれます"
      : "Attachments are categorized and automatically carried into the Project when it is created";
  const download = async (attachment: InquiryAttachment) => {
    try { const result = await downloadInquiryAttachment(detail.id, attachment.id); const url = URL.createObjectURL(result.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.fileName || attachment.fileName; anchor.click(); URL.revokeObjectURL(url); }
    catch (error) { notify(toError(error)); }
  };
  return <Panel title={uiText("Attachments")} subtitle={handoverCopy} actions={canWrite ? <button className="btn default sm" type="button" onClick={onUpload}><Icon name="upload" /><LocalizedText text={"Upload"} /></button> : undefined}>{canWrite ? <button className="attachment-drop" type="button" onClick={onUpload}><Icon name="upload" /><strong><LocalizedText text={"Upload an inquiry document"} /></strong><span><LocalizedText text={"Each file is tagged with a document category and linked to this inquiry"} /></span></button> : null}<div style={{ marginTop: 12 }}>{detail.attachments.length ? detail.attachments.map((file) => <div className="file-row" key={file.id}><span className="file-icon"><Icon name="file" /></span><div style={{ flex: 1 }}><strong>{file.fileName}</strong><small>{file.category} <LocalizedText text={"·"} /> {formatFileSize(file.sizeBytes)} <LocalizedText text={"·"} /> {file.uploadedByName} <LocalizedText text={"·"} /> {formatDateTime(file.uploadedAt)}</small></div><Badge tone="slate">{file.category}</Badge><button className="row-action" type="button" onClick={() => { void download(file); }} aria-label={`Download ${file.fileName}`}><Icon name="download" /></button></div>) : <EmptyState icon="file" title="No attachment yet" message="Upload the customer RFQ, drawing or specification for this inquiry." />}</div></Panel>;
}

function InquiryActivityTab({ detail }: { detail: InquiryDetail }) {
  const uiText = useUiText();
  return <Panel title={uiText("Activity")} subtitle="Every production change recorded against this inquiry and its estimate" flush>{detail.activity.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Date / Time"} /></th><th><LocalizedText text={"User"} /></th><th><LocalizedText text={"Entity"} /></th><th><LocalizedText text={"Module"} /></th><th><LocalizedText text={"Action"} /></th><th><LocalizedText text={"Previous"} /></th><th><LocalizedText text={"New"} /></th><th><LocalizedText text={"Reason"} /></th></tr></thead><tbody>{detail.activity.map((entry) => <tr key={entry.id}><td className="mono">{formatDateTime(entry.occurredAt)}</td><td><Person initials={initials(entry.actorName)} name={entry.actorName} /></td><td className="mono">{entry.entityNumber}</td><td>{entry.entityType}</td><td><strong>{entry.action}</strong></td><td className="muted" title={entry.beforeJson ?? undefined}>{compactJson(entry.beforeJson)}</td><td className="green-text" title={entry.afterJson ?? undefined}>{compactJson(entry.afterJson)}</td><td className="muted">{entry.reason || "—"}</td></tr>)}</tbody></table></div> : <EmptyState icon="shield" title="No activity yet" message="Changes to this inquiry will appear here." />}</Panel>;
}

function MeetingDrawer({ bootstrap, detail, onClose, onSaved }: { bootstrap: BootstrapData; detail: InquiryDetail; onClose: () => void; onSaved: () => Promise<void> }) {
  const uiText = useUiText();
  const [form, setForm] = useState<CreateInquiryMeetingInput>({ meetingDate: today(), meetingType: "Technical Review", participants: [], requirement: "", technical: "", decision: "", openPoint: "", actionItem: "", ownerId: detail.estimateOwnerId, dueDate: futureDate(7) });
  const [participantText, setParticipantText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof CreateInquiryMeetingInput>(key: K, value: CreateInquiryMeetingInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => { setBusy(true); setError(""); try { await createInquiryMeeting(detail.id, { ...form, participants: participantText.split(",").map((value) => value.trim()).filter(Boolean), dueDate: form.dueDate || undefined }); await onSaved(); } catch (requestError) { setError(toError(requestError)); } finally { setBusy(false); } };
  return <Drawer title={uiText("Add Meeting Record")} subtitle="Capture the decision so the estimate revision has a traceable reason" onClose={onClose} width={560} footer={<><span className="spacer" /><button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !form.meetingDate || !form.meetingType} onClick={() => { void save(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Save meeting record"}</button></>}>
    {error ? <LoadError message={error} retry={() => { void save(); }} /> : null}<div className="form-grid two"><Field label="Meeting Date"><input type="date" value={form.meetingDate} onChange={(event) => set("meetingDate", event.target.value)} /></Field><Field label="Meeting Type"><select value={form.meetingType} onChange={(event) => set("meetingType", event.target.value)}>{["Kickoff Meeting", "Technical Review", "Customer Meeting", "Site Survey", "Internal Review", "Design Review"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Participants" span={2} hint="Separate names with a comma"><input value={participantText} onChange={(event) => setParticipantText(event.target.value)} /></Field><Field label="Customer Requirement" span={2}><textarea value={form.requirement} onChange={(event) => set("requirement", event.target.value)} /></Field><Field label="Technical Discussion" span={2}><textarea value={form.technical} onChange={(event) => set("technical", event.target.value)} /></Field><Field label="Decision" span={2}><textarea value={form.decision} onChange={(event) => set("decision", event.target.value)} /></Field><Field label="Open Point" span={2}><textarea value={form.openPoint} onChange={(event) => set("openPoint", event.target.value)} /></Field><Field label="Action Item" span={2}><input value={form.actionItem} onChange={(event) => set("actionItem", event.target.value)} /></Field><Field label="Owner"><select value={form.ownerId} onChange={(event) => set("ownerId", Number(event.target.value))}>{bootstrap.team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label="Due Date"><input type="date" value={form.dueDate} onChange={(event) => set("dueDate", event.target.value)} /></Field></div>
  </Drawer>;
}

function AssignOwnerDrawer({ bootstrap, detail, onClose, onSaved }: { bootstrap: BootstrapData; detail: InquiryDetail; onClose: () => void; onSaved: () => Promise<void> }) {
  const owners = bootstrap.team.filter((member) => OWNER_ROLES.includes(member.role));
  const [ownerId, setOwnerId] = useState(detail.estimateOwnerId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => { setBusy(true); setError(""); try { await assignInquiryOwner(detail.id, ownerId, detail.rowVersion); await onSaved(); } catch (requestError) { setError(toError(requestError)); } finally { setBusy(false); } };
  return <Drawer title="Assign estimate owner" subtitle={`${detail.number} · ${detail.projectName}`} onClose={onClose} footer={<><span className="spacer" /><button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || ownerId === detail.estimateOwnerId} onClick={() => { void save(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Assign owner"}</button></>}>{error ? <LoadError message={error} retry={() => { void save(); }} /> : null}<Field label="Estimate Owner"><select value={ownerId} onChange={(event) => setOwnerId(Number(event.target.value))}>{owners.map((member) => <option key={member.id} value={member.id}>{member.name} — {member.department}</option>)}</select></Field></Drawer>;
}

function QualificationDrawer({ detail, onClose, onSaved }: { detail: InquiryDetail; onClose: () => void; onSaved: () => Promise<void> }) {
  const uiText = useUiText();
  const [probability, setProbability] = useState(detail.projectProbability);
  const [interestGrade, setInterestGrade] = useState(detail.customerInterestGrade);
  const [note, setNote] = useState(detail.qualificationNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedGrade = INTEREST_GRADES.find((item) => item.value === interestGrade) ?? INTEREST_GRADES[2];
  const changed = probability !== detail.projectProbability || interestGrade !== detail.customerInterestGrade || note.trim() !== detail.qualificationNote.trim();
  const save = async () => {
    setBusy(true); setError("");
    try {
      await updateInquiryQualification(detail.id, {
        projectProbability: probability,
        customerInterestGrade: interestGrade,
        qualificationNote: note.trim() || undefined,
        rowVersion: detail.rowVersion,
      });
      await onSaved();
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Drawer title={uiText("Update project qualification")} subtitle={`${detail.number} · Keep probability evidence-based`} onClose={onClose} width={600} footer={<><span className="spacer" /><button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !changed || probability < 0 || probability > 100} onClick={() => { void save(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Save qualification"}</button></>}>
    {error ? <LoadError message={error} retry={() => { void save(); }} /> : null}
    <div className="form-grid two">
      <Field label="Project Probability" hint="Independent forecast score from 0 to 100"><div className="input-suffix"><input type="number" min="0" max="100" step="5" value={probability} onChange={(event) => setProbability(Number(event.target.value))} /><span>%</span></div></Field>
      <Field label="Customer Interest Grade"><select value={interestGrade} onChange={(event) => setInterestGrade(event.target.value)}>{INTEREST_GRADES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
      <div className="info-strip" style={{ gridColumn: "span 2" }}><Icon name="trendingUp" /><span><strong>{selectedGrade.label}</strong>{selectedGrade.description}</span></div>
      <Field label="Qualification Note" hint="Example: Budget approved; customer requested final technical proposal by Friday" span={2}><textarea maxLength={2000} rows={5} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
    </div>
  </Drawer>;
}

function AttachmentDrawer({ detail, onClose, onSaved }: { detail: InquiryDetail; onClose: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("Customer RFQ");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => { if (!file) return; setBusy(true); setError(""); try { await uploadInquiryAttachment(detail.id, { file, category }); await onSaved(); } catch (requestError) { setError(toError(requestError)); } finally { setBusy(false); } };
  return <Drawer title="Upload inquiry attachment" subtitle={`${detail.number} · Stored with integrity verification`} onClose={onClose} footer={<><span className="spacer" /><button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !file || file.size > MAX_FILE_BYTES} onClick={() => { void save(); }}><Icon name="upload" />{busy ? "Uploading…" : <LocalizedText text={"Upload"} />}</button></>}>{error ? <LoadError message={error} retry={() => { void save(); }} /> : null}<div className="form-grid"><Field label="Document category"><select value={category} onChange={(event) => setCategory(event.target.value)}>{FILE_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="File"><input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field>{file ? <div className="file-row"><span className="file-icon"><Icon name="file" /></span><div><strong>{file.name}</strong><small>{formatFileSize(file.size)}{file.size > MAX_FILE_BYTES ? " · exceeds 50 MB limit" : ""}</small></div></div> : null}</div></Drawer>;
}
