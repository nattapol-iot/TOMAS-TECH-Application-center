"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, downloadReportEvidence, uploadReportEvidence, type BootstrapData, type PagedResult, type ReportEvidenceAttachment } from "../api-client";
import { Badge, EmptyState, Field, Icon, Modal, PageHeader, Pagination, Panel, SearchInput, TablePageSize, Tabs, Toolbar } from "../ui";
import "./report-workspace.css";
import { REPORT_TEMPLATE_FIELDS, REPORT_TEMPLATE_SECTIONS_BY_TYPE } from "../../../backend-node/src/report-template-rules";
import { ReportTemplateEditor, ReportTemplateLibrary, ReportTemplatePicker, REPORT_LIBRARY, type ReportTemplate, type TemplateSeed } from "./ReportTemplateLibrary";
import { useReportUnsavedChanges } from "./useReportUnsavedChanges";
import { reportCopy, reportTimestamp } from "./report-locale";
import { ReportDocumentForm } from "./ReportDocumentForm";
import { generateReportPptx } from "./report-pptx";
import { generateInspectionPptx } from "./inspection-report-pptx";
import { generateInspectionPdf } from "./inspection-report-pdf";
import { InspectionReportBody } from "./InspectionReportBody";
import { isInspectionBody, emptyInspectionBody } from "./inspection-body-types";
import { uploadReportExport } from "../api-client";
import { LOGO_BASE64, LOGO_EXT } from "./report-pptx-template";
import { LocalizedText } from "../LocalizedText";
import { currentLocale } from "../i18n";
import { useReportUiText as useUiText } from "./report-ui-copy";
import { REPORT_TYPES, REPORT_STATUSES, labels, reportSections, type ReportType, type ReportBody, type InputField, type Section, type ReportRecord, type Signer } from "./report-types";

export { REPORT_TYPES, REPORT_STATUSES, labels, reportSections };
export type { ReportType, ReportBody, InputField, Section, ReportRecord };

const reportForms: { type: ReportType; title: string; subtitle: string; reference: string }[] = [
  { type: "SERVICE", title: "Service report", subtitle: "งานบริการ แก้ไขปัญหา และติดตามผล", reference: "Service Report Rev.00" },
  { type: "UAT", title: "UAT report", subtitle: "รายการทดสอบ ผลการตรวจรับ และ Punchlist", reference: "UAT Report Rev.00" },
  { type: "INSTALLATION", title: "Installation report", subtitle: "ติดตั้งอุปกรณ์และส่งมอบงาน", reference: "โครงแบบ Service Report" },
  { type: "INSPECTION", title: "Inspection report", subtitle: "ตรวจสอบหน้างานและบันทึกผล", reference: "แบบตรวจสอบ" },
  { type: "POC", title: "POC report", subtitle: "ทดลองกับลูกค้าก่อนเริ่ม Project", reference: "เชื่อมกับ Inquiry" },
];
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to load reports.";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function ReportBodyEditor({ locale = "th", reportType, body, onChange, readOnly = false, reusableOnly = false, onUploadEvidence, evidenceImageSource }: { locale?: string; reportType: string; body: ReportBody; onChange?: (value: ReportBody) => void; readOnly?: boolean; reusableOnly?: boolean; onUploadEvidence?: (file:File)=>Promise<ReportEvidenceAttachment>; evidenceImageSource?: (attachmentId:number)=>string|Promise<string> }) {
  const sections = reusableOnly ? reportSections(reportType).filter(section => REPORT_TEMPLATE_SECTIONS_BY_TYPE[reportType]?.includes(section.key)).map(section => ({ ...section, fields: section.fields.filter(definition => REPORT_TEMPLATE_FIELDS[section.key]?.fields.includes(definition.key)) })).filter(section => section.fields.length > 0) : reportSections(reportType);
  return <ReportDocumentForm locale={locale} reportType={reportType} body={body} onChange={onChange} readOnly={readOnly} reusableOnly={reusableOnly} sections={sections} onUploadEvidence={onUploadEvidence} evidenceImageSource={evidenceImageSource} />;
}

export function ReportWorkflow({ status, hasReviewer }: { status: string; hasReviewer: boolean }) {
  const t = useUiText();
  const index = status === "COMPLETED" ? 4 : ["APPROVED", "AWAITING_CUSTOMER"].includes(status) ? 3 : status === "REVIEWED" || status === "SUBMITTED" && !hasReviewer ? 2 : status === "SUBMITTED" ? 1 : 0;
  return <ol className="report-workflow" aria-label={t("Report workflow")}>{["Draft", hasReviewer ? "Team review" : "Review optional", "Approval", "Customer signature", "Complete"].map((label, step) => <li key={label} className={status === "VOID" ? "" : step < index ? "done" : step === index ? "current" : ""} aria-current={status !== "VOID" && step === index ? "step" : undefined}><span>{step + 1}</span>{t(label)}</li>)}</ol>;
}

type ReportSource = { id: number; sourceKind: "INQUIRY" | "PROJECT"; reference: string; title: string };
const BASE = "/api/v1/reports/workspace";
const TEAM_CONSENT = "I have reviewed this exact report revision and authorize use of my own signature specimen for this action.";
const allows = (report: ReportRecord, action: string) => report.allowedActions?.includes(action) === true;
const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body) });

function CustomerAcknowledgmentView({ acknowledgment, locale = "th" }: { locale?: string; acknowledgment: ReportRecord["customerAcknowledgment"] }) {
  if (!acknowledgment) return <p>{reportCopy(locale, "ยังไม่ระบุ")}</p>;
  return <div><p>{acknowledgment.name} · {acknowledgment.title} · {acknowledgment.company}</p><p>{acknowledgment.date} · {reportCopy(locale, acknowledgment.mode === "DRAWN_SIGNATURE" ? "Signed" : "Acknowledged")}</p>{acknowledgment.mode === "DRAWN_SIGNATURE" && acknowledgment.signatureDataUrl?.startsWith("data:image/png;base64,") ?
    // The authenticated API returns the captured evidence image, not a public asset.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="report-customer-signature" src={acknowledgment.signatureDataUrl} alt={`Customer signature of ${acknowledgment.name}`} /> : null}</div>;
}

export function ReportScreens({ bootstrap, notify, onOpenAnalytics, onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void; bootstrap: BootstrapData; notify: (message: string) => void; onOpenAnalytics?: () => void }) {
  const t = useUiText();
  const workspaceDirty = useRef(false);
  const reportDirtyChange = useCallback((dirty: boolean) => { workspaceDirty.current = dirty; onDirtyChange?.(dirty); }, [onDirtyChange]);
  const confirmWorkspaceNavigation = () => !workspaceDirty.current || window.confirm(t("Discard unsaved report changes?"));
  const [workspaceTab, setWorkspaceTab] = useState<"reports" | "templates">("reports");
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [newType, setNewType] = useState<ReportType>("SERVICE");
  const [search, setSearch] = useState(""), [reportType, setReportType] = useState(""), [status, setStatus] = useState("");
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(50);
  const [result, setResult] = useState<PagedResult<ReportRecord>>({ items: [], page: 1, pageSize: 50, total: 0 });
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null), [creating, setCreating] = useState(false);
  const requestId = useRef(0);
  const invalidateList = useCallback(() => { requestId.current++; }, []);
  const canRead = bootstrap.permissions.includes("report.read");
  const load = useCallback(async () => {
    const current = ++requestId.current;
    if (!canRead) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const data = await apiRequest<PagedResult<ReportRecord>>(`${BASE}?${new URLSearchParams({ search, reportType, status, page: String(page), pageSize: String(pageSize) })}`);
      if (requestId.current === current) setResult(data);
    } catch (failure) { if (requestId.current === current) setError(errorText(failure)); }
    finally { if (requestId.current === current) setLoading(false); }
  }, [canRead, search, reportType, status, page, pageSize]);
  useEffect(() => { const timer = setTimeout(() => void load(), 200); return () => { clearTimeout(timer); invalidateList(); }; }, [load, invalidateList]);
  if (!canRead) return <EmptyState icon="lock" title={t("Report access required")} message={t("You need report.read to open this workspace.")} />;
  if (selectedId !== null) return <ReportDetail onDirtyChange={reportDirtyChange} key={selectedId} id={selectedId} bootstrap={bootstrap} notify={notify} onBack={() => { if (confirmWorkspaceNavigation()) { setSelectedId(null); void load(); } }} />;
  const begin = (type: ReportType) => { setNewType(type); setSelectedTemplate(null); setCreating(true); };
  return <div className="report-workspace">
    <PageHeader eyebrow={t("CUSTOMER REPORTS")} title={t("รายงานลูกค้า")} subtitle={t("เลือกแบบฟอร์ม กรอกผลการทำงาน แล้วส่งตรวจและให้ลูกค้าเซ็น")} actions={onOpenAnalytics ? <button className="btn ghost" type="button" onClick={onOpenAnalytics}><LocalizedText text={"ดูสถิติรายงาน"} /></button> : undefined} />
    <Tabs tabs={[{ id: "reports", label: t("รายงานทั้งหมด") }, { id: "templates", label: t("Template ของทีม") }]} active={workspaceTab} onChange={next => { if (next === workspaceTab || confirmWorkspaceNavigation()) setWorkspaceTab(next); }} />
    {workspaceTab === "templates" ? <ReportTemplateLibrary onDirtyChange={reportDirtyChange} bootstrap={bootstrap} notify={notify} onUse={template => { setNewType(template.reportType); setSelectedTemplate(template); setCreating(true); }} /> : <>
      {bootstrap.permissions.includes("report.write") ? <section className="report-start" aria-label={t("สร้างรายงานจากแบบฟอร์ม")}>
        <div className="report-start-heading"><h2>{t("สร้างรายงานใหม่")}</h2><span>{t("เลือกแบบฟอร์มที่ตรงกับงาน")}</span></div>
        <div className="report-form-choices">{reportForms.map((form, index) => <button className={`report-form-choice${index < 2 ? " featured" : ""}`} key={form.type} type="button" onClick={() => begin(form.type)}><Icon name="file" /><strong>{t(form.title)}</strong><span>{t(form.subtitle)}</span><small>{t(form.reference)}</small><span className="report-choice-link">{t("ใช้แบบฟอร์มนี้ →")}</span></button>)}</div>
      </section> : null}
      <div className="report-list-heading"><h2>{t("รายงานที่บันทึกไว้")} <span>{result.total}</span></h2><p>{t("เปิดรายงานเพื่อกรอกต่อ ตรวจผล หรือส่งให้ลูกค้าเซ็น")}</p></div>
      <Toolbar><SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder={t("ค้นหาเลขที่รายงานหรือชื่อเรื่อง…")} /><select aria-label={t("ประเภทรายงาน")} value={reportType} onChange={event => { setReportType(event.target.value); setPage(1); }}><option value="">{t("ทุกประเภท")}</option>{REPORT_TYPES.map(type => <option key={type} value={type}>{t(labels[type])}</option>)}</select><select aria-label={t("สถานะรายงาน")} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">{t("ทุกสถานะ")}</option>{REPORT_STATUSES.map(value => <option key={value} value={value}>{t(labels[value])}</option>)}</select><button className="btn ghost" type="button" disabled={loading} onClick={() => void load()}><Icon name="refresh" />{t("รีเฟรช")}</button></Toolbar>
      {error ? <div className="callout danger" role="alert">{t(error)}</div> : null}
      <Panel flush>{loading ? <div className="empty" role="status">{t("กำลังโหลดรายงาน…")}</div> : result.items.length ? <div className="table-wrap"><table><thead><tr>{["รายงาน", "ประเภท", "ลูกค้า / งานอ้างอิง", "วันที่", "สถานะ"].map(value => <th key={value}>{t(value)}</th>)}<th /></tr></thead><tbody>{result.items.map(report => <tr key={report.id}><td><button type="button" className="report-open-title" onClick={() => setSelectedId(report.id)}>{report.title}</button><small className="report-meta">{report.number}  · R{report.revision}</small></td><td>{t(labels[report.reportType])}</td><td>{report.customer}<small className="report-meta">{report.sourceReference}</small></td><td>{report.reportDate}</td><td><Badge tone={report.status === "COMPLETED" ? "green" : report.status === "CHANGES_REQUESTED" ? "red" : "blue"}>{t(labels[report.status] ?? report.status)}</Badge></td><td><button className="btn default sm" type="button" onClick={() => setSelectedId(report.id)}>{t(report.status === "DRAFT" ? "กรอกต่อ" : "เปิดรายงาน")}</button></td></tr>)}</tbody></table></div> : !error ? <EmptyState icon="file" title={t("ยังไม่มีรายงานในรายการนี้")} message={t("เลือกแบบฟอร์มด้านบนเพื่อเริ่มรายงาน หรือปรับตัวกรองเพื่อค้นหารายงานเดิม")} /> : null}<div className="report-table-footer"><TablePageSize value={pageSize} onChange={value => { setPageSize(value); setPage(1); }} /><Pagination page={result.page} pageCount={Math.max(1, Math.ceil(result.total / result.pageSize))} from={result.total ? (result.page - 1) * result.pageSize + 1 : 0} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></div></Panel>
    </>}
    {creating ? <NewReportModal onDirtyChange={reportDirtyChange} bootstrap={bootstrap} initialType={newType} initialTemplate={selectedTemplate} onClose={() => { setCreating(false); setSelectedTemplate(null); }} onCreated={report => { setCreating(false); setSelectedTemplate(null); setWorkspaceTab("reports"); setSelectedId(report.id); notify(`${report.number} created`); }} /> : null}
  </div>;
}

function useReportSigners(sourceKind: string, sourceId: number) {
  const sourceKey = `${sourceKind}:${sourceId}`;
  const [state, setState] = useState<{ key: string; reviewers: Signer[]; approvers: Signer[]; error: string }>({ key: "", reviewers: [], approvers: [], error: "" });
  useEffect(() => {
    let cancelled = false;
    if (!sourceId) return;
    void apiRequest<{ items: (Signer & { canReview: boolean; canApprove: boolean })[] }>(`${BASE}/people?${new URLSearchParams({ sourceKind, sourceId: String(sourceId) })}`).then(data => { if (!cancelled) setState({ key: sourceKey, reviewers: data.items.filter(person => person.canReview), approvers: data.items.filter(person => person.canApprove), error: "" }); }).catch(failure => { if (!cancelled) setState({ key: sourceKey, reviewers: [], approvers: [], error: errorText(failure) }); });
    return () => { cancelled = true; };
  }, [sourceKind, sourceId, sourceKey]);
  return state.key === sourceKey ? state : { reviewers: [], approvers: [], error: "" };
}

function ParticipantFields({ reviewerId, approverId, onReviewer, onApprover, reviewers, approvers, authorId }: { reviewerId: number | null; approverId: number; onReviewer: (id: number | null) => void; onApprover: (id: number) => void; reviewers: Signer[]; approvers: Signer[]; authorId: number }) {
  const t = useUiText();
  return <><Field label={t("Reviewer (optional)")}><select aria-label={t("Reviewer (optional)")} value={reviewerId ?? ""} onChange={event => onReviewer(event.target.value ? Number(event.target.value) : null)}><option value="">{t("No review step")}</option>{reviewers.filter(person => person.id !== authorId && person.id !== approverId).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label={t("Approver")}><select required aria-label={t("Approver")} value={approverId || ""} onChange={event => onApprover(Number(event.target.value))}><option value="">{t("Select approver")}</option>{approvers.filter(person => person.id !== authorId && person.id !== reviewerId).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select><small>{t("Select an approver with report approval and signing authority.")}</small></Field></>;
}

function NewReportModal({ bootstrap, initialType = "SERVICE", initialTemplate = null, onClose, onCreated, onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void; bootstrap: BootstrapData; initialType?: ReportType; initialTemplate?: ReportTemplate | null; onClose: () => void; onCreated: (report: ReportRecord) => void }) {
  const t = useUiText();
  const [step, setStep] = useState(initialTemplate ? 2 : 1);
  const [reportType, setReportType] = useState<ReportType>(initialTemplate?.reportType ?? initialType), [source, setSource] = useState("");
  const [template, setTemplate] = useState<ReportTemplate | null>(initialTemplate);
  const [templateReady, setTemplateReady] = useState(!initialTemplate);
  const [search, setSearch] = useState(""), [sources, setSources] = useState<ReportSource[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false), [sourceError, setSourceError] = useState("");
  const [title, setTitle] = useState(""), [reportDate, setReportDate] = useState(today), [locale, setLocale] = useState(initialTemplate?.locale ?? "th");
  const [reviewerId, setReviewerId] = useState<number | null>(null), [approverId, setApproverId] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [sourceKind = "", rawId = ""] = source.split(":");
  const hasChanges = !!source || !!title.trim() || reviewerId !== null || approverId !== 0 || reportDate !== today() || locale !== (initialTemplate?.locale ?? "th");
  useReportUnsavedChanges(hasChanges, onDirtyChange);
  const close = () => { if (!busy && (!hasChanges || window.confirm(t("Discard unsaved report changes?")))) onClose(); };
  const signers = useReportSigners(sourceKind, Number(rawId));
  useEffect(() => {
    let cancelled = false;
    if (step !== 2) return;
    const timer = setTimeout(() => {
      setSourceLoading(true); setSourceError("");
      void (async () => {
        const all: ReportSource[] = []; let next = 1; let total = 1;
        while (all.length < total && !cancelled) { const response = await apiRequest<PagedResult<ReportSource>>(`${BASE}/sources?${new URLSearchParams({ page: String(next++), pageSize: "100", search })}`); total = response.total; all.push(...response.items); if (!response.items.length) break; }
        if (!cancelled) setSources(all);
      })().catch(failure => { if (!cancelled) setSourceError(errorText(failure)); }).finally(() => { if (!cancelled) setSourceLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, step]);
  const permitted = (kind: string) => reportType === "POC" ? kind === "INQUIRY" : reportType === "INSPECTION" || kind === "PROJECT";
  const resetSource = (value: string) => {
    setSource(value); setReviewerId(null); setApproverId(0);
    const chosen = sources.find(item => `${item.sourceKind}:${item.id}` === value);
    if (chosen && !title.trim()) setTitle(`${labels[reportType]} report — ${chosen.title}`.slice(0, 500));
  };
  const selectedForm = reportForms.find(form => form.type === reportType)!;
  return <Modal title={t("สร้างรายงานใหม่")} size="lg" onClose={close}>
    <ol className="report-entry-steps"><li className={step === 1 ? "active" : ""}>{t("1 เลือกแบบฟอร์ม")}</li><li className={step === 2 ? "active" : ""}>{t("2 เลือกงานและผู้อนุมัติ")}</li><li>{t("3 กรอกในแบบฟอร์ม")}</li></ol>
    <form noValidate={step === 1} onSubmit={event => {
      event.preventDefault(); if (step !== 2 || busy) return;
      setBusy(true); setError("");
      void apiRequest<ReportRecord>(BASE, json({ reportType, sourceKind, sourceId: Number(rawId), title, reportDate, locale, reviewerId, approverId, body: {}, ...(template ? { templateId: template.id, templateVersion: template.version } : {}) })).then(onCreated).catch(failure => setError(errorText(failure))).finally(() => setBusy(false));
    }}>
      <fieldset disabled={busy} className="report-entry-fieldset">
        <div hidden={step !== 1}>
          <div className="report-fields"><Field label={t("แบบฟอร์มรายงาน")}><select aria-label={t("Report type")} value={reportType} onChange={event => { setReportType(event.target.value as ReportType); setTemplate(null); setTemplateReady(false); resetSource(""); setTitle(""); }}>{reportForms.map(form => <option key={form.type} value={form.type}>{t(form.title)}</option>)}</select></Field><div className="report-entry-reference"><strong>{t(selectedForm.reference)}</strong><p>{t(selectedForm.subtitle)}</p></div></div>
          <ReportTemplatePicker key={reportType} reportType={reportType} selected={template} disabled={busy} onReady={setTemplateReady} onChange={value => { setTemplate(value); if (value) setLocale(value.locale); }} />
        </div>
        <div hidden={step !== 2}>
          <div className="report-selected-form"><Icon name="file" /><div><strong>{t(selectedForm.title)}</strong><small>{template ? `${template.name} · V${template.version}` : t(selectedForm.reference)}</small></div><button className="btn ghost sm" type="button" onClick={() => setStep(1)}>{t("เปลี่ยนแบบฟอร์ม")}</button></div>
          <h3 className="report-entry-heading">{t("รายงานนี้เป็นของงานใด")}</h3>
          <p className="muted">{reportType === "POC" ? t("เลือก Inquiry ที่ใช้ทดลองกับลูกค้า ยังไม่ต้องมี Project") : reportType === "INSPECTION" ? t("เลือก Inquiry หรือ Project ที่ต้องการตรวจสอบ") : t("เลือก Project ระบบจะแสดงชื่อลูกค้าและเลขที่งานบนรายงานให้")}</p>
          <div className="report-fields"><Field label={t("ค้นหางาน")}><input aria-label={t("Find source")} value={search} onChange={event => { setSearch(event.target.value); setSourceLoading(true); resetSource(""); }} placeholder={t("เลข Inquiry / Project หรือชื่อโครงการ")} /></Field><Field label={t("Inquiry / Project *")}><select required={step === 2} disabled={sourceLoading} aria-label={t("Inquiry / Project")} value={source} onChange={event => resetSource(event.target.value)}><option value="">{sourceLoading ? t("กำลังโหลดงาน…") : t("เลือกงานอ้างอิง")}</option>{sources.filter(item => permitted(item.sourceKind)).map(item => <option key={`${item.sourceKind}:${item.id}`} value={`${item.sourceKind}:${item.id}`}>{item.reference} · {item.title}</option>)}</select></Field><Field label={t("ชื่อรายงาน *")}><input required={step === 2} maxLength={500} aria-label={t("Report title")} value={title} onChange={event => setTitle(event.target.value)} /></Field><Field label={t("วันที่รายงาน *")}><input type="date" required={step === 2} aria-label={t("Report date")} value={reportDate} onChange={event => setReportDate(event.target.value)} /></Field></div>
          {sourceError ? <div className="callout danger" role="alert">{sourceError}<button className="btn ghost" type="button" onClick={() => { setStep(1); }}>{t("กลับไปเลือกแบบฟอร์มและลองใหม่")}</button></div> : null}
          <h3 className="report-entry-heading">{t("ทีมตรวจและอนุมัติ")}</h3><p className="muted">{t("คุณเป็นผู้จัดทำรายงาน เลือกผู้อนุมัติ แล้วเพิ่มผู้ตรวจได้หากงานนี้ต้องตรวจอีกขั้น")}</p>
          <div className="report-fields"><ParticipantFields reviewerId={reviewerId} approverId={approverId} onReviewer={setReviewerId} onApprover={setApproverId} reviewers={signers.reviewers} approvers={signers.approvers} authorId={bootstrap.user.id} /></div>
          <details className="report-entry-options"><summary>{t("ตัวเลือกเพิ่มเติม")}</summary><Field label={t("ภาษารายงาน")}><select aria-label={t("Report language")} value={locale} onChange={event => setLocale(event.target.value)}><option value="th">{t("ไทย")}</option><option value="en">{t("English")}</option><option value="ja">日本語</option></select></Field></details>
        </div>
      </fieldset>
      {error || signers.error ? <div className="callout danger" role="alert">{error || signers.error}</div> : null}
      <div className="report-actions"><button className="btn ghost" type="button" disabled={busy} onClick={close}>{t("ยกเลิก")}</button>{step === 1 ? <button className="btn primary" type="button" disabled={!!template && !templateReady} onClick={() => { setStep(2); setSourceLoading(true); }}>{t("ถัดไป: เลือกงาน →")}</button> : <button className="btn primary" type="submit" disabled={busy || !source || sourceLoading || !title.trim() || !approverId || !!signers.error || !!template && !templateReady}>{busy ? t("กำลังสร้าง…") : t("เปิดแบบฟอร์มเพื่อกรอก")}</button>}</div>
    </form>
  </Modal>;
}

// Print-only branded cover page — matches the TOMAS TECH reference document
// (white background, red-bordered Version/Confidential boxes, right-aligned
// title block, logo, address footer) and mirrors coverSlide() in report-pptx.ts.
function ReportCoverPage({ report }: { report: ReportRecord }) {
  const t = (value: string) => reportCopy(report.locale, value);
  const typeLabel = t(labels[report.reportType] ?? report.reportType);
  return <div className="report-cover-page" lang={report.locale} translate="no">
    <div className="report-cover-topbar">
      <span className="report-cover-badge">{t("Rev.")} {report.revision} · {report.reportDate}</span>
      <span className="report-cover-badge">{t("Confidential")}</span>
    </div>
    <div className="report-cover-body">
      <hr className="report-cover-rule" />
      <h1>{report.title}</h1>
      <h2>{typeLabel} {t("Report")}</h2>
      <p>{t("Made for")} : {report.customer}</p>
      <p>{t("By")} : Tomas Tech Co., Ltd.</p>
    </div>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="report-cover-logo" src={`data:image/${LOGO_EXT};base64,${LOGO_BASE64}`} alt="TOMAS TECH" />
    <div className="report-cover-address">
      <p>No.1 MD Tower16 Fl., Unit C1, Soi Bangna-Trad 25, Debaratna Rd, Khwaeng Bang Na Nuea, Khet Bang Na, Bangkok 10260 Thailand.</p>
      <p>Tel : +66-98-271-9741     E-mail : info@tomastc.com</p>
    </div>
  </div>;
}

// Print-only info page — mirrors infoSlide() in report-pptx.ts (plain header
// text, bordered box, generic report metadata). Replaces the on-screen
// masthead+meta-grid for print so the exported document matches the original.
function ReportPrintInfoPage({ report }: { report: ReportRecord }) {
  const t = (value: string) => reportCopy(report.locale, value);
  const headerTitle = `${t(labels[report.reportType] ?? report.reportType).toUpperCase()} REPORT`;
  return <div className="report-print-info-page" lang={report.locale} translate="no">
    <div className="report-print-page-header"><span>{headerTitle}</span></div>
    <div className="report-print-info-box">
      <p>{t("Customer")} : {report.customer}</p>
      <p>{t("Project / Reference")} : {report.sourceReference}</p>
      <p>{t("Project / Site")} : {report.sourceTitle}</p>
      <p>{t("Report No.")} : {report.number} · Rev.{report.revision}</p>
      <p>{t("Report Date")} : {report.reportDate}</p>
      <p>{t("Status")} : {t(labels[report.status] ?? report.status)}</p>
      {report.template ? <p>{t("Template")} : {report.template.name} · V{report.template.version}</p> : null}
    </div>
  </div>;
}

// Print-only sign-off page — mirrors signOffSlide() in report-pptx.ts,
// pulling the same real signature/customer-acknowledgment data as
// ReportSignatureSummary but styled to match the original document.
function ReportSignOffPage({ report }: { report: ReportRecord }) {
  const t = (value: string) => reportCopy(report.locale, value);
  const stageInfo = (stage: string, person: { id: number; name: string } | null) => {
    const signature = report.signatures.find(item => item.stage === stage);
    return { name: signature?.actorName ?? person?.name ?? "", date: signature ? reportTimestamp(report.locale, signature.occurredAt) : "" };
  };
  const prepared = stageInfo("PREPARE", report.preparedBy);
  const approved = stageInfo("APPROVE", report.approver);
  const ack = report.customerAcknowledgment;
  return <div className="report-signoff-page" lang={report.locale} translate="no">
    <h2 className="report-signoff-title">{t("Sign Off")}</h2>
    <p className="report-signoff-intro">{t("With all these documents, this is part of the report and it is all the information of the project.")}</p>
    <div className="report-signoff-grid">
      <div className="report-signoff-block">
        <strong>{t("Customer")} : {report.customer}</strong>
        <p>{t("Sign")} :  ___________________________</p>
        <p>{t("Name")} :  {ack?.name ?? ""}</p>
        <p>{t("Title")} :  {ack?.title ?? ""}</p>
        <p>{t("Date")} : {ack?.date ?? ""}</p>
      </div>
      <div className="report-signoff-block">
        <strong>TOMAS TECH CO., LTD.</strong>
        <p>{t("Prepared by")}</p>
        <p>{t("Sign")} :  ___________________________</p>
        <p>{t("Name")} : {prepared.name}</p>
        <p>{t("Date")} : {prepared.date}</p>
      </div>
      <div className="report-signoff-block">
        <strong>{t("Approved")}</strong>
        <p>{t("Sign")} :  ___________________________</p>
        <p>{t("Name")} : {approved.name}</p>
        <p>{t("Date")} : {approved.date}</p>
      </div>
    </div>
    <p className="report-signoff-end">## END OF BLUEPRINT ##</p>
  </div>;
}

function ReportDocumentHeader({ report, title, reportDate, onTitle, onDate }: { report: ReportRecord; title: string; reportDate: string; onTitle?: (value: string) => void; onDate?: (value: string) => void }) {
  const t = (value: string) => reportCopy(report.locale, value);
  return <header className="report-paper-header" lang={report.locale} translate="no">
    <div className="report-paper-masthead">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="report-paper-logo" src={`data:image/${LOGO_EXT};base64,${LOGO_BASE64}`} alt="TOMAS TECH" /><div><h2>{t(`${labels[report.reportType].toUpperCase()} REPORT`)}</h2><span>{t(report.reportType === "UAT" ? "ใบรายงานการทดสอบและตรวจรับงาน" : report.reportType === "SERVICE" ? "ใบรายงานการให้บริการ" : report.reportType === "INSPECTION" ? "ใบรายงานผลการตรวจสอบ" : "ใบรายงานผลการดำเนินงาน")}</span></div><small>{t(report.reportType === "UAT" ? "อ้างอิง TT-FRM-UAT-001 · Rev.00" : ["SERVICE", "INSTALLATION"].includes(report.reportType) ? "อ้างอิง TT-FRM-SRV-001 · Rev.00" : "แบบรายงานมาตรฐานทีม")}</small></div>
    <div className="report-paper-meta"><div><span>{t("REPORT NO. / เลขที่")}</span><strong>{report.number}  · R{report.revision}</strong></div><div><span>{t("REPORT DATE / วันที่")}</span>{onDate ? <input aria-label={t("Report date")} type="date" required value={reportDate} onChange={event => onDate(event.target.value)} /> : <strong>{reportDate}</strong>}</div><div><span>{t("STATUS / สถานะ")}</span><strong>{t(labels[report.status] ?? report.status)}</strong></div><div className="wide"><span>{t("CUSTOMER / บริษัทผู้ว่าจ้าง")}</span><strong>{report.customer}</strong></div><div><span>{t("PROJECT / INQUIRY NO.")}</span><strong>{report.sourceReference}</strong></div>{report.endUserName ? <div className="full"><span>{t("END USER / บริษัทผู้ใช้งานปลายทาง")}</span><strong>{report.endUserName}</strong></div> : null}<div className="full"><span>{t("PROJECT / SITE / โครงการ")}</span><strong>{report.sourceTitle}</strong></div><div className="full"><span>{t("REPORT TITLE / เรื่อง")}</span>{onTitle ? <input aria-label={t("Report title")} required maxLength={500} value={title} onChange={event => onTitle(event.target.value)} /> : <strong>{title}</strong>}</div></div>
  </header>;
}

function ReportSignatureSummary({ report }: { report: ReportRecord }) {
  const t = (value: string) => reportCopy(report.locale, value);
  const people = [{ stage: "PREPARE", label: "ผู้จัดทำ / Prepared by", person: report.preparedBy }, ...(report.reviewerId ? [{ stage: "REVIEW", label: "ผู้ตรวจ / Reviewed by", person: report.reviewer }] : []), { stage: "APPROVE", label: "ผู้อนุมัติ / Approved by", person: report.approver }];
  return <section className="report-paper-signoff" lang={report.locale} translate="no"><h3>{t("ACKNOWLEDGEMENT / การลงนามและรับทราบ")}</h3><div className="report-paper-signatures">{people.map(person => { const signature = report.signatures.find(item => item.stage === person.stage); return <div key={person.stage}><h4>{t(person.label)}</h4><strong>{signature?.actorName ?? person.person?.name ?? t("ยังไม่ระบุ")}</strong><p>{t(signature ? "ลงนามในระบบแล้ว" : person.stage === "REVIEW" && ["REVIEWED", "APPROVED", "AWAITING_CUSTOMER", "COMPLETED"].includes(report.status) ? "ตรวจแล้ว (ไม่ได้ลงนาม)" : "ยังไม่ได้ลงนาม")}</p><small>{signature ? reportTimestamp(report.locale, signature.occurredAt) : t("วันที่: —")}</small></div>; })}<div><h4>{t("ตัวแทนลูกค้า / Customer")}</h4>{report.customerAcknowledgment ? <CustomerAcknowledgmentView locale={report.locale} acknowledgment={report.customerAcknowledgment} /> : <><strong>{t("รอลูกค้ารับทราบ")}</strong><p>{t("ส่งลิงก์ให้ลูกค้าหลังอนุมัติรายงาน")}</p><small>{t("วันที่: —")}</small></>}</div></div><p className="report-signoff-note">{t("ลายเซ็นและการรับทราบในส่วนนี้มาจากขั้นตอนลงนามของรายงานฉบับนี้")}</p></section>;
}

function ReportDetail({ id, bootstrap, notify, onBack, onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void; id: number; bootstrap: BootstrapData; notify: (message: string) => void; onBack: () => void }) {
  const t = useUiText();
  const [templateSeed, setTemplateSeed] = useState<TemplateSeed | null>(null);
  const [preview, setPreview] = useState(false);
  const [report, setReport] = useState<ReportRecord | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [pptxBusy, setPptxBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [tab, setTab] = useState<"content" | "team" | "customer" | "history">("content");
  const [draft, setDraft] = useState<{ title: string; reportDate: string; locale: string; reviewerId: number | null; approverId: number; body: ReportBody } | null>(null);
  const [dirty, setDirty] = useState(false), [consent, setConsent] = useState(false), [reviewSign, setReviewSign] = useState(bootstrap.permissions.includes("signing.sign"));
  useReportUnsavedChanges(dirty, onDirtyChange);
  const [action, setAction] = useState(""), [note, setNote] = useState("");
  const [issuedLink, setLink] = useState<{ url: string; expiresAt: string; revision: number } | null>(null), [expiresHours, setExpiresHours] = useState(72);
  const sequence = useRef(0);
  const invalidateDetail = useCallback(() => { sequence.current++; }, []);
  const hydrate = useCallback((value: ReportRecord) => { setReport(value); setDraft({ title: value.title, reportDate: value.reportDate, locale: value.locale, reviewerId: value.reviewerId, approverId: value.approverId, body: value.body }); setDirty(false); setConsent(false); setNote(""); }, []);
  const load = useCallback(async (revision?: number) => {
    const request = ++sequence.current;
    setLoading(true); setError("");
    try { const value = await apiRequest<ReportRecord>(`${BASE}/${id}${revision === undefined ? "" : `?revision=${revision}`}`); if (request === sequence.current) hydrate(value); }
    catch (failure) { if (request === sequence.current) setError(errorText(failure)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [id, hydrate]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); invalidateDetail(); }; }, [load, invalidateDetail]);
  const signers = useReportSigners(report?.sourceKind ?? "", report?.sourceId ?? 0);
  const patch = (value: Partial<NonNullable<typeof draft>>) => { setDraft(current => current ? { ...current, ...value } : current); setDirty(true); setConsent(false); };
  const uploadEvidence = useCallback((file:File)=>uploadReportEvidence(id,file),[id]);
  const evidenceImageSource = useCallback(async(attachmentId:number)=>URL.createObjectURL(await downloadReportEvidence(id,attachmentId)),[id]);
  const downloadBytes = (bytes: Uint8Array, mime: string, fileName: string) => {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };
  const exportPptx = async () => {
    if (!report || pptxBusy) return;
    setPptxBusy(true); setError("");
    try {
      const bytes = report.reportType === "INSPECTION"
        ? await generateInspectionPptx(report, isInspectionBody(report.body) ? report.body : emptyInspectionBody())
        : await generateReportPptx(report, reportSections(report.reportType));
      downloadBytes(bytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation", `${report.number}.pptx`);
      await uploadReportExport(report.id, "pptx", bytes, `${report.number}.pptx`).catch(() => {});
    } catch (failure) { setError(errorText(failure)); }
    finally { setPptxBusy(false); }
  };
  const exportInspectionPdf = async () => {
    if (!report || pdfBusy) return;
    setPdfBusy(true); setError("");
    try {
      const bytes = await generateInspectionPdf(report, isInspectionBody(report.body) ? report.body : emptyInspectionBody());
      downloadBytes(bytes, "application/pdf", `${report.number}.pdf`);
      await uploadReportExport(report.id, "pdf", bytes, `${report.number}.pdf`).catch(() => {});
    } catch (failure) { setError(errorText(failure)); }
    finally { setPdfBusy(false); }
  };
  const changeAction = async (next: string) => {
    if (!report || busy) return;
    setBusy(true); setError("");
    try {
      if (next === "save") {
        const value = await apiRequest<ReportRecord>(`${BASE}/${id}`, json({ ...draft, rowVersion: report.rowVersion }, "PUT")); hydrate(value); notify(t("Report draft saved"));
      } else {
        const value = await apiRequest<ReportRecord | { report: ReportRecord; token: string; expiresAt: string }>(`${BASE}/${id}/${next}`, json({ rowVersion: report.rowVersion, note, consent, sign: reviewSign, expiresInHours: expiresHours }));
        if ("report" in value) { hydrate(value.report); setLink({ url: `${window.location.origin}/report-sign/${encodeURIComponent(value.token)}`, expiresAt: value.expiresAt, revision: value.report.revision }); }
        else { hydrate(value); if (["revoke-customer-link", "revise", "void"].includes(next)) setLink(null); }
        setAction(""); notify(next === "customer-link" ? t("Customer link created. Copy it to share with the customer.") : t("Report updated"));
      }
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const saveAsTemplate = async () => {
    if (!report || dirty || busy) return;
    setBusy(true); setError("");
    try { const preview = await apiRequest<{ reportType: ReportType; locale: string; body: ReportBody }>(`${REPORT_LIBRARY}/preview`, json({ sourceReportId: report.id, sourceRevision: report.revision })); setTemplateSeed({ ...preview, name: `${labels[preview.reportType]} template`, description: "" }); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  if (loading && !report) return <div className="empty" role="status">{t("Loading report…")}</div>;
  if (!report || !draft) return <div className="report-workspace"><button className="btn ghost" onClick={onBack}>{t("Back to reports")}</button><div className="callout danger" role="alert">{t(error)}</div><button className="btn default" onClick={() => void load()}>{t("Retry")}</button></div>;
  const editable = report.status === "DRAFT" && report.revision === report.currentRevision && allows(report, "edit");
  const link = issuedLink?.revision === report.revision && report.status === "AWAITING_CUSTOMER" ? issuedLink : null;
  const personName = (personId: number) => [report.preparedBy, report.reviewer, report.approver].find(person => person?.id === personId)?.name ?? bootstrap.team.find(person => person.id === personId)?.name ?? `User ${personId}`;
  const participantRows = [{ stage: "PREPARE", label: "Prepared by", id: report.preparedById }, ...(report.reviewerId ? [{ stage: "REVIEW", label: "Reviewed by", id: report.reviewerId }] : []), { stage: "APPROVE", label: "Approved by", id: report.approverId }];
  const signingAction = ["submit", "review", "approve"].includes(action);
  const needsConsent = signingAction && (action !== "review" || reviewSign);
  return <div className="report-workspace">
    <button className="btn ghost" type="button" onClick={onBack}>{t("← Back to reports")}</button>
    <PageHeader eyebrow={`${report.number} · R${report.revision} · ${t(labels[report.reportType])}`} title={report.title} subtitle={`${report.sourceReference} · ${report.customer} · ${report.reportDate}`} meta={<Badge>{t(labels[report.status] ?? report.status)}</Badge>} actions={<><button className="btn default" type="button" disabled={busy || pdfBusy || dirty} onClick={() => report.reportType === "INSPECTION" ? void exportInspectionPdf() : window.print()}><Icon name="file" />{pdfBusy ? t("Preparing…") : t("Print / Save as PDF")}</button><button className="btn default" type="button" disabled={busy || pptxBusy || dirty} onClick={() => void exportPptx()}><Icon name="file" />{pptxBusy ? t("Preparing…") : t("Export PPT")}</button><button className="btn ghost" type="button" disabled={busy || loading || dirty} onClick={() => void load()}>{t("Refresh")}</button></>} />
    <ReportWorkflow status={report.status} hasReviewer={report.reviewerId !== null} />{report.template ? <p className="report-template-provenance">{t("From template:")}{report.template.name}  · V{report.template.version}</p> : null}
    {report.decisionNote ? <div className="callout warning">{report.decisionNote}</div> : null}{error ? <div className="callout danger" role="alert">{t(error)}</div> : null}
    {dirty ? <div className="callout info">{t("Unsaved changes. Save the draft before submitting or printing.")}</div> : null}
    {report.revision !== report.currentRevision ? <div className="callout info">{t("Viewing an earlier revision.")}<button className="btn ghost" onClick={() => void load()}>{t("Open current revision")}</button></div> : null}
    <Tabs tabs={[{ id: "content", label: t("Content") }, { id: "team", label: t("Team & approvals") }, { id: "customer", label: t("Customer signing") }, { id: "history", label: t("History") }]} active={tab} onChange={setTab} />
    <div className="report-tab-content">
      {tab === "content" ? <><div className="report-document-tools">{editable ? <Field label={t("Report language")}><select aria-label={t("Report language")} disabled={busy} value={draft.locale} onChange={event => patch({ locale: event.target.value })}><option value="th">{t("ไทย")}</option><option value="en">{t("English")}</option><option value="ja">日本語</option></select></Field> : null}<div><strong>{preview || !editable ? t("มุมมองเอกสาร") : t("กรอกในแบบฟอร์ม")}</strong><span>{editable ? t("ช่อง * ต้องกรอกก่อนส่งอนุมัติ · บันทึกฉบับร่างไว้ก่อนได้") : t("รายงานฉบับนี้อ่านได้อย่างเดียว")}</span></div><div>{editable ? <button className="btn default" type="button" onClick={() => setPreview(value => !value)}>{preview ? t("กลับไปกรอก") : t("ดูตัวอย่างเอกสาร")}</button> : null}{editable ? <button className="btn primary" type="button" disabled={busy || !dirty || !draft.title.trim() || !draft.reportDate || !draft.approverId} onClick={() => void changeAction("save")}>{busy ? t("กำลังบันทึก…") : t("บันทึกฉบับร่าง")}</button> : null}</div></div><div className="report-paper"><ReportDocumentHeader report={{ ...report, locale: draft.locale }} title={draft.title} reportDate={draft.reportDate} onTitle={editable && !preview && !busy ? title => patch({ title }) : undefined} onDate={editable && !preview && !busy ? reportDate => patch({ reportDate }) : undefined} /><fieldset className="report-body-fieldset" disabled={busy}>{report.reportType === "INSPECTION" ? <InspectionReportBody reportId={report.id} body={isInspectionBody(draft.body) ? draft.body : emptyInspectionBody()} onChange={body => { if (!busy) patch({ body: body as unknown as ReportBody }); }} readOnly={!editable || preview} /> : <ReportBodyEditor locale={draft.locale} reportType={report.reportType} body={draft.body} readOnly={!editable || preview} onUploadEvidence={editable&&!preview?uploadEvidence:undefined} evidenceImageSource={evidenceImageSource} onChange={body => { if (!busy) patch({ body }); }} />}</fieldset><ReportSignatureSummary report={{ ...report, locale: draft.locale }} /></div></> : null}
      {tab === "team" ? <Panel title={t("Team signatures & approval")}><p>{t("Preparation and approval use each person's own signature specimen. Review is optional; when assigned, it must finish before approval.")}</p>{participantRows.map(person => { const signature = report.signatures.find(item => item.stage === person.stage); return <div className="report-team-row" key={person.stage}><div><strong>{t(person.label)}</strong><small className="report-meta">{signature ? signature.actorName : personName(person.id)}</small></div><Badge tone={signature ? "green" : "slate"}>{signature ? `${t("Signed")} · ${new Date(signature.occurredAt).toLocaleString(currentLocale())}` : person.stage === "REVIEW" && ["REVIEWED", "APPROVED", "AWAITING_CUSTOMER", "COMPLETED"].includes(report.status) ? t("Reviewed without signature") : t("Pending")}</Badge></div>; })}{editable ? <><div className="report-fields"><ParticipantFields reviewerId={draft.reviewerId} approverId={draft.approverId} onReviewer={reviewerId => patch({ reviewerId })} onApprover={approverId => patch({ approverId })} reviewers={signers.reviewers} approvers={signers.approvers} authorId={report.preparedById} /></div>{signers.error ? <div className="callout danger">{t(signers.error)}</div> : null}</> : null}</Panel> : null}
      {tab === "customer" ? <Panel title={t("Customer handoff")}><p>{t("The customer opens the exact approved revision and chooses acknowledgment or a drawn signature.")}</p>{report.customerAcknowledgment ? <><Badge tone="green">{t("Customer acknowledgment recorded")}</Badge><CustomerAcknowledgmentView locale={report.locale} acknowledgment={report.customerAcknowledgment} /></> : <p>{t("Status:")}{t(labels[report.status] ?? report.status)}</p>}{link ? <div><p className="report-handoff-url"><a href={link.url} target="_blank" rel="noreferrer">{t("Open customer signing page")}</a></p><input readOnly aria-label={t("Customer signing link")} className="report-link-input" value={link.url} onFocus={event => event.target.select()} /><small>{t("Expires")}{new Date(link.expiresAt).toLocaleString(currentLocale())}</small><div className="report-actions"><button className="btn default" type="button" onClick={() => { void navigator.clipboard.writeText(link.url).then(() => notify(t("Customer link copied"))).catch(() => setError(t("Copy failed. Select the link above and copy it manually."))); }}>{t("Copy link")}</button></div></div> : report.status === "AWAITING_CUSTOMER" ? <p className="muted">{t("A customer link has been issued. Refresh to check its status. To issue a replacement, revoke the current link first.")}</p> : null}{allows(report, "customer-link") ? <><Field label={t("Link valid for (hours)")}><input aria-label={t("Link valid for (hours)")} type="number" min={1} max={168} value={expiresHours} onChange={event => setExpiresHours(Number(event.target.value))} /></Field><button className="btn primary" type="button" disabled={busy || expiresHours < 1 || expiresHours > 168 || !Number.isInteger(expiresHours)} onClick={() => void changeAction("customer-link")}>{t("Create customer link")}</button></> : null}{allows(report, "revoke-customer-link") ? <button className="btn default" type="button" disabled={busy} onClick={() => setAction("revoke-customer-link")}>{t("Revoke customer link")}</button> : null}</Panel> : null}
      {tab === "history" ? <Panel title={t("Revision history")}><div className="table-wrap"><table><thead><tr><th>{t("Revision")}</th><th>{t("Title")}</th><th>{t("Status")}</th><th>{t("Created")}</th><th /></tr></thead><tbody>{report.revisions.map(revision => <tr key={revision.revision}><td>R{revision.revision}</td><td>{revision.title}</td><td>{t(labels[revision.status] ?? revision.status)}</td><td>{new Date(revision.createdAt).toLocaleString(currentLocale())}</td><td><button className="btn ghost" disabled={dirty || busy} onClick={() => void load(revision.revision)}>{t("View")}</button></td></tr>)}</tbody></table></div></Panel> : null}
    </div>
    {templateSeed ? <ReportTemplateEditor onDirtyChange={onDirtyChange} seed={templateSeed} onClose={() => setTemplateSeed(null)} onSaved={() => { setTemplateSeed(null); notify(t("Reusable report template saved")); }} /> : null}<div className="report-actions">{bootstrap.permissions.includes("report.write") && report.revision === report.currentRevision ? <button className="btn default" type="button" disabled={busy || dirty} onClick={() => void saveAsTemplate()}>{t("Save as template")}</button> : null}{editable ? <button className="btn primary" type="button" disabled={busy || !dirty || !draft.title.trim() || !draft.reportDate || !draft.approverId} onClick={() => void changeAction("save")}>{t("Save draft")}</button> : null}{[["submit", "Sign & submit"], ["review", "Review report"], ["approve", "Sign & approve"], ["return", "Request changes"], ["revise", "Create revision"], ["void", "Void report"]].filter(([key]) => allows(report, key!)).map(([key, label]) => <button key={key} type="button" className="btn default" disabled={busy || dirty} onClick={() => { setAction(key!); setNote(""); setConsent(false); }}>{t(label!)}</button>)}</div>
    {action ? <Modal title={t({ submit: "Sign & submit report", review: "Review report", approve: "Sign & approve report", return: "Request changes", revise: "Create a new revision", void: "Void report", "revoke-customer-link": "Revoke customer link" }[action] ?? action)} onClose={() => { if (!busy) setAction(""); }}><p>{report.number}  · R{report.revision} · {report.title}</p>{action === "review" ? <label className="report-consent"><input type="checkbox" checked={reviewSign} disabled={busy || !bootstrap.permissions.includes("signing.sign")} onChange={event => { setReviewSign(event.target.checked); setConsent(false); }} />{t("Apply my signature to the review")}</label> : null}{needsConsent ? <label className="report-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />{t(TEAM_CONSENT)}</label> : null}{!signingAction || action === "review" ? <Field label={t("Reason / note")}><textarea aria-label={t("Reason / note")} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></Field> : null}{error ? <div className="callout danger" role="alert">{t(error)}</div> : null}<div className="report-actions"><button className="btn ghost" disabled={busy} onClick={() => setAction("")}>{t("Cancel")}</button><button className="btn primary" disabled={busy || needsConsent && !consent || ["return", "revise", "void"].includes(action) && !note.trim()} onClick={() => void changeAction(action)}>{busy ? t("Saving…") : t("Confirm")}</button></div></Modal> : null}
    <article className="report-print"><ReportCoverPage report={report} /><ReportPrintInfoPage report={report} /><ReportBodyEditor locale={report.locale} reportType={report.reportType} body={report.body} readOnly evidenceImageSource={evidenceImageSource} /><ReportSignOffPage report={report} /></article>
  </div>;
}
