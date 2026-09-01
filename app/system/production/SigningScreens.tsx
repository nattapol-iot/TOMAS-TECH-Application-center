"use client";
import { useT as useStaticCopy } from "../i18n";

import { currentLocale, useT as useUiText } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SigningPreview, SignedFilePreview } from "./SigningPreview";
import "./signing-stamp-form.css";
import { signPositionedStep, type PlacementConfirmation } from "./signing-preview-client";
import {
  attachPaperSignature,
  createCompanyStamp,
  createSignableDocument,
  delegateStep,
  downloadSignedOutput,
  freezeDocumentRevision,
  grantStampAuthority,
  listCompanyStamps,
  listProjectDocuments,
  listDrawingTasks,
  uploadProjectDocument,
  listProjects,
  listSignableDocuments,
  listSignatureFlows,
  loadMySignature,
  loadMySignatureImage,
  loadSignableDocument,
  loadSignInbox,
  openSignatureRequest,
  prepareSigningSession,
  rejectStep,
  replaceMySignature,
  returnStep,
  revokeStampAuthority,
  signStep,
  verifySignedDocument,
  type BootstrapData,
  type CompanyStampSummary,
  type ProjectDocument,
  type ProjectSummary,
  type SignableDocumentSummary,
  type SignableDocumentWorkspace,
  type SignatureSpecimenView,
  type SignDocumentClass,
  type SignFlowTemplateSummary,
  type SignInbox,
  type SignStepDetail,
  type SignTask,
  type SignVerification,
} from "../api-client";
import {
  Badge,
  Drawer,
  EmptyState,
  Field,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  Toolbar,
  type Tone,
} from "../ui";

export type SigningScreenProps = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
};

// ---------------------------------------------------------------------------
// Local conventions, matching the other production screen modules
// ---------------------------------------------------------------------------

const EMPTY: never[] = [];
const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const money = (value: number | null) => value === null
  ? "—"
  : new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(value));
const date = (value: string | null) => value
  ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
  : "—";
const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "—";
const isoToday = () => new Date().toISOString().slice(0, 10);
const hasPermission = (bootstrap: BootstrapData, permission: string) => bootstrap.permissions.includes(permission);
const shortHash = (value: string | null) => value ? `${value.slice(0, 6)}…${value.slice(-2)}` : "—";

const DOCUMENT_CLASSES: { value: SignDocumentClass; label: string }[] = [
  { value: "DRAWING", label: "Drawing" },
  { value: "SPEC", label: "Specification" },
  { value: "MANUAL", label: "Manual document" },
  { value: "MAT_APPROVE", label: "Material approve" },
  { value: "QUOTATION", label: "Quotation" },
  { value: "PR_PO", label: "Purchase requisition / order" },
  { value: "UAT_ACCEPT", label: "UAT acceptance" },
  { value: "SERVICE_RPT", label: "Service report" },
];

const BLOCK_LABELS: Record<string, string> = {
  DRAWN_BY: "Drawn by",
  CHECKED_BY: "Checked by",
  APPROVED_BY: "Approved by",
  PREPARED_BY: "Prepared by",
  REQUESTED_BY: "Requested by",
  TESTED_BY: "Tested by",
  ENGINEER: "Engineer",
  CUSTOMER_APPROVED: "Customer approved",
};

const MARK_LABELS: Record<string, string> = {
  SIGNATURE: "Signature",
  SIGNATURE_STAMP: "Signature + company stamp",
  INITIAL: "Initials + date",
  PAPER: "Signed on paper, scanned back",
};

const classLabel = (value: string) => DOCUMENT_CLASSES.find((item) => item.value === value)?.label ?? value;
const blockLabel = (value: string) => BLOCK_LABELS[value] ?? value;
const markLabel = (value: string) => MARK_LABELS[value] ?? value;

const STATE_TONE: Record<string, Tone> = {
  DRAFT: "slate",
  PENDING_SIGN: "amber",
  PARTIALLY_SIGNED: "amber",
  SIGNED: "green",
  REJECTED: "red",
  VOIDED: "slate",
  SUPERSEDED: "slate",
  NOT_REQUIRED: "slate",
};

/**
 * Loads once per `load` identity. Callers must pass a stable function — a module
 * constant or a useCallback — because a changed identity re-runs the request,
 * which is also how a filter change triggers a reload.
 */
function useEndpoint<T>(load: (() => Promise<T>) | null, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(Boolean(load));
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const requestRef = useRef(0);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const requestId = ++requestRef.current;
    const run = async () => {
      await Promise.resolve();
      if (requestRef.current !== requestId) return;
      if (!load) { setLoading(false); setError(""); return; }
      setLoading(true); setError("");
      try {
        const result = await load();
        if (requestRef.current === requestId) setData(result);
      } catch (requestError) {
        if (requestRef.current === requestId) setError(toError(requestError));
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    };
    void run();
    return () => { if (requestRef.current === requestId) requestRef.current += 1; };
  }, [load, revision]);

  return { data, loading, error, reload };
}

function Loading() {
  return <div className="empty"><span className="spinner" /><LocalizedText text={"Loading from production API…"} /></div>;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  const displayMessage = message === "Failed to fetch"
    ? "เชื่อมต่อ API ไม่สำเร็จ กรุณารอให้ระบบพร้อมแล้วกด ลองใหม่"
    : message;
  return (
    <div className="callout danger" role="alert">
      <Icon name="alertTriangle" />
      <span><strong><LocalizedText text={"Could not load"} /></strong>{displayMessage}</span>
      <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>
    </div>
  );
}

function ActionError({ message }: { message: string }) {
  return message
    ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"ดำเนินการไม่สำเร็จ"} /></strong>{message}</span></div>
    : null;
}

function RefreshButton({ loading, reload }: { loading: boolean; reload: () => void }) {
  return <button className="btn ghost" type="button" disabled={loading} onClick={reload}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>;
}

function ReasonPrompt({
  title,
  description,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const localizeCopy = useStaticCopy();
  const [reason, setReason] = useState("");
  return (
    <Modal title={title} subtitle={description} size="sm" onClose={onClose} footer={<>
      <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
        <Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : confirmLabel}
      </button>
    </>}>
      <Field label="Reason (required)" hint="เหตุผลจะถูกเก็บถาวรใน signature event chain และแสดงบนหน้าเอกสาร">
        <textarea rows={4} maxLength={4_000} value={reason} onChange={(event) => setReason(event.target.value)}
          placeholder={localizeCopy("ระบุสิ่งที่ต้องแก้ไข เพื่อให้เจ้าของเอกสารทำต่อได้ทันที")} />
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// SG-01 · Sign inbox — every signable class in one list
// ---------------------------------------------------------------------------

export function ProductionSignInbox({ bootstrap, notify }: SigningScreenProps) {
  const canRead = hasPermission(bootstrap, "signing.read");
  const canSign = hasPermission(bootstrap, "signing.sign");
  const inbox = useEndpoint<SignInbox | null>(canRead ? loadSignInbox : null, null);
  const [openDocumentId, setOpenDocumentId] = useState<number | null>(null);
  const [openStepId, setOpenStepId] = useState<number | null>(null);
  const [specimenOpen, setSpecimenOpen] = useState(false);

  const data = inbox.data;
  const waiting = data?.waitingMe ?? EMPTY;

  if (!canRead) {
    return <EmptyState icon="lock" title="No signing access"
      message="บทบาทของคุณยังไม่มีสิทธิ์ signing.read กรุณาติดต่อผู้ดูแลระบบ" />;
  }

  return (
    <>
      <PageHeader
        eyebrow="DOCUMENTS"
        title="Sign Inbox"
        subtitle="ทุกคลาสเอกสารอยู่ในรายการเดียว เพราะหน้านี้อ่านจาก signature step ไม่ได้ผูกกับโมดูลใดโมดูลหนึ่ง"
        actions={<RefreshButton loading={inbox.loading} reload={inbox.reload} />} />

      <div className="kpi-grid four">
        <KpiCard label="Waiting me" value={waiting.length} icon="edit" tone={waiting.length ? "amber" : "green"} />
        <KpiCard label="I initiated" value={data?.initiatedByMe.length ?? 0} icon="send" tone="blue" />
        <KpiCard label="Returned to me" value={data?.returnedToMe.length ?? 0} icon="refresh"
          tone={data?.returnedToMe.length ? "red" : "slate"} />
        <KpiCard label="Signed · 30 days" value={data?.signedLast30Days ?? 0} icon="checkCircle" tone="green" />
      </div>

      {inbox.error ? <LoadError message={inbox.error} retry={inbox.reload} /> : null}

      {data && !data.hasSpecimen ? (
        <div className="callout warning" role="status">
          <Icon name="alertTriangle" />
          <span>
            <strong><LocalizedText text={"ยังไม่มีลายเซ็นของคุณ"} /></strong><LocalizedText text={"ต้องสร้างลายเซ็นก่อนจึงจะลงนามได้ ลายเซ็นนี้ใช้เฉพาะเวลาคุณเซ็นเท่านั้น ไม่ถูกส่งให้ผู้ใช้อื่นและดาวน์โหลดไม่ได้"} /> </span>
          <button className="btn primary" type="button" onClick={() => setSpecimenOpen(true)}>
            <Icon name="edit" /><LocalizedText text={"สร้างลายเซ็น"} /> </button>
        </div>
      ) : null}

      <Panel
        title={`Waiting my signature · ${waiting.length}`}
        subtitle="เรียงตามกำหนดส่ง เก่าที่สุดขึ้นก่อน · แต่ละแถวบอก block และ mark ที่ต้องใช้ก่อนเปิดไฟล์"
        flush>
        {waiting.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th><LocalizedText text={"Document"} /></th><th><LocalizedText text={"Title"} /></th><th><LocalizedText text={"Block"} /></th><th><LocalizedText text={"Mark"} /></th>
                <th><LocalizedText text={"Step"} /></th><th><LocalizedText text={"From"} /></th><th><LocalizedText text={"Due"} /></th><th><LocalizedText text={"Actions"} /></th>
              </tr></thead>
              <tbody>
                {waiting.map((task) => <SignTaskRow key={task.stepId} task={task} canSign={canSign}
                  onOpen={() => { setOpenDocumentId(task.documentId); setOpenStepId(task.stepId); }} />)}
              </tbody>
            </table>
          </div>
        ) : inbox.loading ? <Loading /> : (
          <EmptyState icon="checkCircle" title="No signature waiting for you"
            message="ไม่มีเอกสารที่รอลายเซ็นของคุณอยู่ในขณะนี้" />
        )}
      </Panel>

      <Panel title={`Returned to me · ${data?.returnedToMe.length ?? 0}`}
        subtitle="คุณเป็นเจ้าของเอกสาร · แก้ไขต้นฉบับ แล้ว freeze revision ใหม่หรือเปิดคำขอลงนามอีกครั้ง" flush>
        {data?.returnedToMe.length ? (
          <DocumentTable rows={data.returnedToMe} onOpen={(id) => { setOpenDocumentId(id); setOpenStepId(null); }} />
        ) : <EmptyState icon="inbox" title="Nothing returned" message="ไม่มีเอกสารที่ถูกส่งกลับมาให้คุณแก้ไข" />}
      </Panel>

      <Panel title={`I initiated — waiting other people · ${data?.initiatedByMe.length ?? 0}`}
        subtitle="รายการตามงาน เหมือนที่ Team Attention ทำกับ work item แต่ทำกับเอกสาร" flush>
        {data?.initiatedByMe.length ? (
          <DocumentTable rows={data.initiatedByMe} onOpen={(id) => { setOpenDocumentId(id); setOpenStepId(null); }} />
        ) : <EmptyState icon="send" title="Nothing pending" message="ไม่มีคำขอลงนามที่คุณเปิดไว้และยังค้างอยู่" />}
      </Panel>

      {openDocumentId ? (
        <SignDocumentDrawer
          bootstrap={bootstrap}
          documentId={openDocumentId}
          focusStepId={openStepId}
          notify={notify}
          onClose={() => { setOpenDocumentId(null); setOpenStepId(null); }}
          onChanged={() => inbox.reload()} />
      ) : null}

      {specimenOpen ? (
        <MySignatureModal onClose={() => setSpecimenOpen(false)}
          onSaved={(message) => { setSpecimenOpen(false); notify(message); inbox.reload(); }} />
      ) : null}
    </>
  );
}

function SignTaskRow({ task, canSign, onOpen }: { task: SignTask; canSign: boolean; onOpen: () => void }) {
  const overdue = Boolean(task.dueDate && new Date(`${task.dueDate.slice(0, 10)}T00:00:00`) < new Date(new Date().toDateString()));
  const stampBlocked = task.requiredMark === "SIGNATURE_STAMP" && !task.holdsStampAuthority;
  return (
    <tr>
      <td>
        <strong className="mono">{task.documentNo}</strong>
        <small className="muted">{classLabel(task.documentClass)} <LocalizedText text={"·"} /> {task.revisionLabel}</small>
      </td>
      <td>
        {task.title}
        <small className="muted">
          {task.projectNumber ? `${task.projectNumber} · ${task.projectName}` : "ไม่ผูกกับโครงการ"}
          {task.amount !== null ? ` · ${money(task.amount)}` : ""}
        </small>
      </td>
      <td>
        {blockLabel(task.blockCode)}
        {task.assignedByRole ? <small className="muted"><LocalizedText text={"by role · first to act wins"} /></small> : null}
      </td>
      <td>
        {markLabel(task.requiredMark)}
        {task.stampCode ? (
          stampBlocked
            ? <small className="muted"><Badge tone="red">{task.stampCode} <LocalizedText text={"· no authority"} /></Badge></small>
            : <small className="muted"><Badge tone="green">{task.stampCode}</Badge>{task.stampAuthorityValidTo ? ` ถึง ${date(task.stampAuthorityValidTo)}` : ""}</small>
        ) : null}
      </td>
      <td className="num">{task.stepNo} <LocalizedText text={"of"} /> {task.totalSteps}</td>
      <td>{task.initiatorName}<small className="muted">{dateTime(task.requestedAt)}</small></td>
      <td>{overdue ? <Badge tone="red">{date(task.dueDate)}</Badge> : date(task.dueDate)}</td>
      <td>
        <div className="table-actions">
          <button className="btn primary sm" type="button" disabled={!canSign} onClick={onOpen}>
            <Icon name="edit" /><LocalizedText text={"Open & sign"} /> </button>
        </div>
      </td>
    </tr>
  );
}

function DocumentTable({ rows, onOpen }: { rows: SignableDocumentSummary[]; onOpen: (id: number) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>
          <th><LocalizedText text={"Document"} /></th><th><LocalizedText text={"Title"} /></th><th><LocalizedText text={"Owner"} /></th><th><LocalizedText text={"Revision"} /></th>
          <th><LocalizedText text={"Progress"} /></th><th><LocalizedText text={"State"} /></th><th><LocalizedText text={"Updated"} /></th><th><LocalizedText text={"Action"} /></th>
        </tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><strong className="mono">{row.documentNo}</strong><small className="muted">{classLabel(row.documentClass)}</small></td>
              <td>{row.title}<small className="muted">{row.projectNumber ? `${row.projectNumber} · ${row.projectName}` : "—"}</small></td>
              <td>{row.ownerName}</td>
              <td className="mono">{row.currentRevisionLabel ?? "—"}<small className="muted">{shortHash(row.currentSha256)}</small></td>
              <td className="num">{row.signedStepCount} <LocalizedText text={"of"} /> {row.totalStepCount}</td>
              <td><Badge tone={STATE_TONE[row.signingState] ?? "slate"}>{row.signingState}</Badge></td>
              <td>{dateTime(row.updatedAt)}</td>
              <td>
                <button className="btn ghost sm" type="button" onClick={() => onOpen(row.id)}>
                  <Icon name="eye" /><LocalizedText text={"Open"} /> </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SG-02 / SG-06 · The document: what is being signed, by whom, on which file
// ---------------------------------------------------------------------------

function SignDocumentDrawer({
  bootstrap,
  documentId,
  focusStepId,
  notify,
  onClose,
  onChanged,
}: {
  bootstrap: BootstrapData;
  documentId: number;
  focusStepId: number | null;
  notify: (message: string) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const workspace = useEndpoint<SignableDocumentWorkspace | null>(
    useCallback(() => loadSignableDocument(documentId), [documentId]), null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<{ kind: "return" | "reject" | "delegate"; step: SignStepDetail } | null>(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [companyStampId, setCompanyStampId] = useState(0);
  const [sourcePreview,setSourcePreview]=useState(false);
  const [signedPreview,setSignedPreview]=useState<number|null>(null);
  const stamps = useEndpoint(useCallback(() => listCompanyStamps(), []), EMPTY as CompanyStampSummary[]);

  const data = workspace.data;
  const document = data?.document;
  const canSign = hasPermission(bootstrap, "signing.sign");
  const canReject = hasPermission(bootstrap, "signing.reject");
  const canRequest = hasPermission(bootstrap, "signing.request");
  const isOwner = document?.ownerId === bootstrap.user.id;

  const myStep = useMemo(() => {
    const steps = data?.liveRequest?.steps ?? [];
    const pending = steps.filter((step) => step.state === "PENDING");
    return pending.find((step) => step.id === focusStepId)
      ?? pending.find((step) => step.assigneeUserId === bootstrap.user.id)
      ?? pending.find((step) => step.assigneeUserId === null && step.assigneeRole === bootstrap.user.role)
      ?? null;
  }, [data, focusStepId, bootstrap.user.id, bootstrap.user.role]);

  // A customer block. Nobody signs it in the system: the internal signer prints,
  // the customer signs the paper, and someone attaches the scan here so the
  // document can reach SIGNED honestly instead of parking forever.
  const paperStep = (data?.liveRequest?.steps ?? []).find(
    (step) => step.state === "PENDING" && step.requiredMark === "PAPER") ?? null;

  const currentRevision = data?.revisions.find((item) => item.id === data.liveRequest?.documentFileId)
    ?? data?.revisions[0]
    ?? null;

  const reloadAll = () => { workspace.reload(); onChanged(); };

  const decide = async (kind: "return" | "reject" | "delegate", step: SignStepDetail, reason: string, toUserId?: number) => {
    setBusy(true); setError("");
    try {
      if (kind === "return") await returnStep(step.id, reason, step.rowVersion);
      else if (kind === "reject") await rejectStep(step.id, reason, step.rowVersion);
      else await delegateStep(step.id, toUserId ?? 0, reason, step.rowVersion);
      notify(`${document?.documentNo}: ${kind}`);
      setPrompt(null);
      reloadAll();
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  const openRequest = async () => {
    if (!document) return;
    setBusy(true); setError("");
    try {
      const result = await openSignatureRequest(document.id, { rowVersion: document.rowVersion, companyStampId: companyStampId || undefined });
      notify(`${document.documentNo}: signature requested · ${result.steps} steps`);
      reloadAll();
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <Drawer
      title={document ? `${document.documentNo} · ${document.currentRevisionLabel ?? ""}` : "Document"}
      subtitle={document ? `${classLabel(document.documentClass)} · ${document.title}` : undefined}
      width={900}
      onClose={onClose}>
      {workspace.error ? <LoadError message={workspace.error} retry={workspace.reload} /> : null}
      <ActionError message={error} />
      {!data ? (workspace.loading ? <Loading /> : null) : (
        <>
          <div className="detail-grid">
            <div><span><LocalizedText text={"State"} /></span><strong><Badge tone={STATE_TONE[data.document.signingState] ?? "slate"}>{data.document.signingState}</Badge></strong></div>
            <div><span><LocalizedText text={"Owner"} /></span><strong>{data.document.ownerName}</strong></div>
            <div><span><LocalizedText text={"Project"} /></span><strong>{data.document.projectNumber ? `${data.document.projectNumber} · ${data.document.projectName}` : "—"}</strong></div>
            <div><span><LocalizedText text={"Locale"} /></span><strong>{data.document.documentLocale}</strong></div>
            {data.document.amount !== null ? <div><span><LocalizedText text={"Amount"} /></span><strong>{money(data.document.amount)}</strong></div> : null}
            <div><span><LocalizedText text={"Chain"} /></span><strong>{data.events.length
              ? <Badge tone={data.chainVerified ? "green" : "red"}>{data.chainVerified ? "verified" : "broken"}</Badge>
              : "—"}</strong></div>
          </div>

          {currentRevision ? (
            <Panel title="The file being signed" subtitle="ไฟล์นี้เปลี่ยนไม่ได้ · การแก้ไขต้นฉบับคือ revision ใหม่ และจะยกเลิกทุก step ที่ยังไม่ได้เซ็น">
              <div className="detail-grid">
                <div><span><LocalizedText text={"File"} /></span><strong>{currentRevision.fileName}</strong></div>
                <div><span><LocalizedText text={"Revision"} /></span><strong className="mono">{currentRevision.revisionLabel}</strong></div>
                <div><span><LocalizedText text={"Size"} /></span><strong>{(currentRevision.sizeBytes / 1024).toFixed(0)} KB</strong></div>
                <div><span>SHA-256</span><strong className="mono">{shortHash(currentRevision.sha256)}</strong></div>
                <div><span><LocalizedText text={"Frozen"} /></span><strong>{dateTime(currentRevision.frozenAt)}</strong></div>
                <div><span><LocalizedText text={"Frozen by"} /></span><strong>{currentRevision.frozenByName}</strong></div>
              </div>
              {currentRevision.projectDocumentId && currentRevision.projectId ? (
                <button className="btn ghost" type="button" onClick={() => {
                  void (async () => {
                    try {
                      const { downloadProjectDocument } = await import("../api-client");
                      const result = await downloadProjectDocument(currentRevision.projectId!, currentRevision.projectDocumentId!);
                      const url = URL.createObjectURL(result.blob);
                      window.open(url, "_blank", "noopener,noreferrer");
                      setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    } catch (requestError) { setError(toError(requestError)); }
                  })();
                }}><Icon name="eye" /><LocalizedText text={"เปิดไฟล์ที่กำลังจะเซ็น"} /></button>
              ) : null}
              <button className="btn primary" type="button" onClick={()=>setSourcePreview(true)}><Icon name="eye"/><LocalizedText text={"Preview file & signatures"} /></button>
            </Panel>
          ) : null}

          {myStep && canSign ? (
            <SignPanel
              key={`${myStep.id}-${myStep.rowVersion}`}
              documentId={data.document.id}
              fileId={currentRevision?.id ?? 0}
              contentType={currentRevision?.contentType ?? ""}
              step={myStep}
              documentNo={data.document.documentNo}
              userName={bootstrap.user.name}
              userRole={bootstrap.user.role}
              onSigned={(message) => { notify(message); reloadAll(); }}
              onReturn={() => setPrompt({ kind: "return", step: myStep })}
              onDelegate={() => setPrompt({ kind: "delegate", step: myStep })}
              onReject={canReject ? () => setPrompt({ kind: "reject", step: myStep }) : undefined} />
          ) : null}

          {paperStep && canSign && data.document.projectId ? (
            <PaperStepPanel
              step={paperStep}
              projectId={data.document.projectId}
              documentNo={data.document.documentNo}
              onAttached={(message) => { notify(message); reloadAll(); }} />
          ) : null}

          {data.liveRequest ? (
            <Panel title={`Signature flow · template v${data.liveRequest.templateVersion}`}
              subtitle={`${data.liveRequest.state} · opened by ${data.liveRequest.initiatorName} ${dateTime(data.liveRequest.createdAt)}`} flush>
              <StepTable steps={data.liveRequest.steps} />
            </Panel>
          ) : (
            <Panel title="No signature request is running" subtitle="Freeze a revision then request signatures">
              {data.document.documentClass === "DRAWING" && isOwner ? <Field label="Company stamp at Manager approval" hint="Manager must hold current stamp authority. No stamp is applied before approval.">
                <select value={companyStampId} onChange={event => setCompanyStampId(Number(event.target.value))}>
                  <option value={0}><LocalizedText text={"Signature only (no company stamp)"} /></option>
                  {stamps.data.map(stamp => <option key={stamp.id} value={stamp.id}>{stamp.code}</option>)}
                </select>
              </Field> : null}
              <div className="table-actions">
                {canRequest && isOwner ? <button className="btn primary" type="button" disabled={busy} onClick={() => { void openRequest(); }}>
                  <Icon name="send" /><LocalizedText text={"Request signatures"} /> </button> : null}
                {canRequest && isOwner ? <button className="btn ghost" type="button" onClick={() => setRevisionOpen(true)}>
                  <Icon name="upload" /><LocalizedText text={"Freeze new revision"} /> </button> : null}
              </div>
            </Panel>
          )}

          {data.output ? (
            <Panel title="Signed output" subtitle="ไฟล์นี้คือสิ่งที่ส่งออกจริง · มี certificate page และรหัสตรวจสอบ">
              <div className="detail-grid">
                <div><span><LocalizedText text={"Verify code"} /></span><strong className="mono">{data.output.verifyCode}</strong></div>
                <div><span><LocalizedText text={"Output SHA-256"} /></span><strong className="mono">{shortHash(data.output.sha256)}</strong></div>
                <div><span><LocalizedText text={"Produced"} /></span><strong>{dateTime(data.output.producedAt)}</strong></div>
              </div>
              <button className="btn primary" type="button" onClick={()=>setSignedPreview(data.liveRequest?.id ?? data.closedRequests[0]?.id ?? null)}><Icon name="eye"/><LocalizedText text={"View signed file / ดูไฟล์ที่เซ็นแล้ว"} /></button>
              <button className="btn primary" type="button" onClick={() => {
                void (async () => {
                  try {
                    const result = await downloadSignedOutput(data.liveRequest?.id ?? data.closedRequests[0]?.id ?? 0);
                    const url = URL.createObjectURL(result.blob);
                    window.open(url, "_blank", "noopener,noreferrer");
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  } catch (requestError) { setError(toError(requestError)); }
                })();
              }}><Icon name="download" /><LocalizedText text={"Open signed output in new tab"} /></button>
            </Panel>
          ) : null}

          {sourcePreview && currentRevision?<SigningPreview documentId={data.document.id} fileId={currentRevision.id} onClose={()=>setSourcePreview(false)}/>:null}
          {signedPreview?<SignedFilePreview requestId={signedPreview} onClose={()=>setSignedPreview(null)}/>:null}

          <Panel title={`Event chain · ${data.events.length} events`}
            subtitle="Append-only และผูกกันด้วย hash · hash = SHA256(prev_hash + '|' + payload_hash)" flush>
            {data.events.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th className="mono">#</th><th><LocalizedText text={"When"} /></th><th><LocalizedText text={"Action"} /></th><th><LocalizedText text={"Actor"} /></th><th><LocalizedText text={"Evidence"} /></th><th><LocalizedText text={"Hash"} /></th></tr></thead>
                  <tbody>
                    {data.events.map((event) => (
                      <tr key={event.seq}>
                        <td className="mono">{event.seq}</td>
                        <td className="mono">{dateTime(event.occurredAt)}</td>
                        <td>{event.action}{event.stepNo ? <small className="muted"><LocalizedText text={"step"} /> {event.stepNo}</small> : null}</td>
                        <td>{event.actorName ?? "—"}<small className="muted">{event.ip ?? ""}</small></td>
                        <td><small className="muted">{event.authEvidence ?? "—"}</small></td>
                        <td className="mono">{shortHash(event.hash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState icon="shield" title="No events yet" message="ยังไม่มีการเปิดคำขอลงนามบนเอกสารนี้" />}
          </Panel>

          <Panel title={`Revisions · ${data.revisions.length}`}
            subtitle="Revision ใหม่จะยกเลิก step ที่ยังไม่ได้เซ็น และเก็บ step ที่เซ็นแล้วไว้กับไฟล์เดิมเท่านั้น" flush>
            <div className="table-wrap">
              <table>
                <thead><tr><th><LocalizedText text={"Revision"} /></th><th><LocalizedText text={"File"} /></th><th>SHA-256</th><th><LocalizedText text={"Frozen"} /></th><th><LocalizedText text={"Request"} /></th></tr></thead>
                <tbody>
                  {data.revisions.map((revision) => (
                    <tr key={revision.id}>
                      <td className="mono"><strong>{revision.revisionLabel}</strong></td>
                      <td>{revision.fileName}<small className="muted">{revision.source}</small></td>
                      <td className="mono">{shortHash(revision.sha256)}</td>
                      <td>{dateTime(revision.frozenAt)}<small className="muted">{revision.frozenByName}</small></td>
                      <td>{revision.requestState ? <Badge tone={STATE_TONE[revision.requestState] ?? "slate"}>{revision.requestState}</Badge> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {data.closedRequests.length ? (
            <Panel title={`Closed rounds · ${data.closedRequests.length}`} subtitle="ประวัติคำขอที่ปิดแล้ว" flush>
              <div className="table-wrap">
                <table>
                  <thead><tr><th><LocalizedText text={"Revision"} /></th><th><LocalizedText text={"State"} /></th><th><LocalizedText text={"Opened"} /></th><th><LocalizedText text={"Closed"} /></th><th><LocalizedText text={"Signed"} /></th><th><LocalizedText text={"Reason"} /></th><th><LocalizedText text={"File"} /></th></tr></thead>
                  <tbody>
                    {data.closedRequests.map((request) => (
                      <tr key={request.id}>
                        <td className="mono">{request.revisionLabel}</td>
                        <td><Badge tone={STATE_TONE[request.state] ?? "slate"}>{request.state}</Badge></td>
                        <td>{dateTime(request.createdAt)}</td>
                        <td>{dateTime(request.closedAt)}</td>
                        <td className="num">{request.steps.filter((step) => step.state === "SIGNED").length} <LocalizedText text={"of"} /> {request.steps.length}</td>
                        <td>{request.closeReason ?? "—"}</td>
                        <td>{request.state==="SIGNED"?<button className="btn ghost sm" onClick={()=>setSignedPreview(request.id)}><LocalizedText text={"View signed file"} /></button>:"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}
        </>
      )}

      {prompt?.kind === "return" ? (
        <ReasonPrompt title={`Return ${document?.documentNo} to its owner`}
          description="Return จะปิดรอบนี้และส่งเอกสารกลับไปที่เจ้าของ ไม่ใช่ผู้เซ็นก่อนหน้า เพราะเจ้าของคือคนที่แก้ไฟล์ได้จริง"
          confirmLabel="Return to owner" busy={busy} onClose={() => setPrompt(null)}
          onConfirm={(reason) => { void decide("return", prompt.step, reason); }} />
      ) : null}
      {prompt?.kind === "reject" ? (
        <ReasonPrompt title={`Reject ${document?.documentNo}`}
          description="Reject ปิดคำขอทั้งหมด ไม่ใช่การส่งกลับแก้ไข"
          confirmLabel="Reject request" busy={busy} onClose={() => setPrompt(null)}
          onConfirm={(reason) => { void decide("reject", prompt.step, reason); }} />
      ) : null}
      {prompt?.kind === "delegate" ? (
        <DelegatePrompt bootstrap={bootstrap} busy={busy} onClose={() => setPrompt(null)}
          onConfirm={(toUserId, reason) => { void decide("delegate", prompt.step, reason, toUserId); }} />
      ) : null}
      {revisionOpen && document ? (
        <FreezeRevisionModal document={document} onClose={() => setRevisionOpen(false)}
          onDone={(message) => { setRevisionOpen(false); notify(message); reloadAll(); }} />
      ) : null}
    </Drawer>
  );
}

function PaperStepPanel({
  step,
  projectId,
  documentNo,
  onAttached,
}: {
  step: SignStepDetail;
  projectId: number;
  documentNo: string;
  onAttached: (message: string) => void;
}) {
  const localizeCopy = useStaticCopy();
  const attachments = useEndpoint<ProjectDocument[]>(
    useCallback(() => listProjectDocuments(projectId), [projectId]), EMPTY);
  const [scanId, setScanId] = useState(0);
  const effectiveScanId = scanId || attachments.data[0]?.id || 0;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const attach = async () => {
    setBusy(true); setError("");
    try {
      const result = await attachPaperSignature(step.id, {
        scanProjectDocumentId: effectiveScanId,
        note: note.trim() || undefined,
        rowVersion: step.rowVersion,
      });
      onAttached(result.requestComplete
        ? `${documentNo}: paper signature attached — every block complete`
        : `${documentNo}: paper signature attached`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <Panel title={`${blockLabel(step.blockCode)} · signed on paper`}
      subtitle="อัปโหลดสำเนาที่ลูกค้าเซ็นไว้ในหน้า Project Documents ก่อน แล้วเลือกไฟล์นั้นที่นี่ — ระบบบันทึกว่าใครเป็นผู้แนบ">
      <ActionError message={error} />
      <Field label="Scanned copy">
        <select value={effectiveScanId} onChange={(event) => setScanId(Number(event.target.value))}>
          {attachments.data.map((item) => <option key={item.id} value={item.id}>{item.fileName}</option>)}
        </select>
      </Field>
      <Field label="Note (optional)">
        <input value={note} maxLength={4_000} onChange={(event) => setNote(event.target.value)}
          placeholder={localizeCopy("เช่น ลูกค้าเซ็นหน้างาน 1 ก.ย.")} />
      </Field>
      <button className="btn primary" type="button" disabled={busy || !effectiveScanId} onClick={() => { void attach(); }}>
        <Icon name="paperclip" />{busy ? "Attaching…" : "Attach signed scan"}
      </button>
      {step.isOptional
        ? <p className="muted"><LocalizedText text={"ช่องนี้เป็นตัวเลือก เอกสารสามารถถึงสถานะ SIGNED ได้โดยไม่มีลายเซ็นลูกค้า"} /></p>
        : <p className="muted"><LocalizedText text={"ช่องนี้จำเป็น — การตรวจรับที่ไม่มีลายเซ็นลูกค้าไม่ใช่การตรวจรับ"} /></p>}
    </Panel>
  );
}

function StepTable({ steps }: { steps: SignStepDetail[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>
          <th className="mono">#</th><th><LocalizedText text={"Block"} /></th><th><LocalizedText text={"Mark"} /></th><th><LocalizedText text={"Assignee"} /></th>
          <th><LocalizedText text={"State"} /></th><th><LocalizedText text={"Decided"} /></th><th><LocalizedText text={"Marks"} /></th>
        </tr></thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.id}>
              <td className="mono">{step.stepNo}</td>
              <td>{blockLabel(step.blockCode)}<small className="muted">{step.anchorCode}</small></td>
              <td>
                {markLabel(step.requiredMark)}
                {step.stampCode ? <small className="muted"><LocalizedText text={"stamp"} /> {step.stampCode}</small> : null}
                {step.isOptional ? <small className="muted"><LocalizedText text={"optional"} /></small> : null}
              </td>
              <td>
                {step.assigneeName ?? (step.assigneeRole ? `role ${step.assigneeRole}` : "external")}
                {step.delegatedFromName ? <small className="muted"><LocalizedText text={"delegated by"} /> {step.delegatedFromName}</small> : null}
              </td>
              <td><Badge tone={step.state === "SIGNED" ? "green" : step.state === "PENDING" ? "amber" : step.state === "REJECTED" ? "red" : "slate"}>{step.state}</Badge></td>
              <td>
                {step.decidedByName ?? "—"}
                <small className="muted">{dateTime(step.decidedAt)}</small>
                {step.reason ? <small className="muted">&ldquo;{step.reason}&rdquo;</small> : null}
              </td>
              <td>
                {step.marks.length
                  ? step.marks.map((mark) => <Badge key={mark.id} tone={mark.kind === "STAMP" ? "violet" : "slate"}>
                    {mark.kind}{mark.stampCode ? ` ${mark.stampCode}` : ""}
                  </Badge>)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The one screen that must be right. The mark is what the reader sees; the
 * assurance is the fresh sign-in plus the frozen file hash plus the append-only
 * chain. Both are surfaced here, and Sign / Return / Delegate are peers because
 * a signer who cannot easily decline will sign carelessly.
 */
function SignPanel({
  documentId,fileId,contentType,
  step,
  documentNo,
  userName,
  userRole,
  onSigned,
  onReturn,
  onDelegate,
  onReject,
}: {
  documentId:number;fileId:number;contentType:string;
  step: SignStepDetail;
  documentNo: string;
  userName: string;
  userRole: string;
  onSigned: (message: string) => void;
  onReturn: () => void;
  onDelegate: () => void;
  onReject?: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"idle" | "reauth" | "signing">("idle");
  const [positioning,setPositioning]=useState(false);
  const [positions,setPositions]=useState<PlacementConfirmation|null>(null);
  const canPosition=/^(application\/pdf|image\/(png|jpeg))/.test(contentType);
  const [specimenUrl, setSpecimenUrl] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void loadMySignatureImage()
      .then((value) => { if (cancelled) { URL.revokeObjectURL(value); return; } url = value; setSpecimenUrl(value); })
      .catch(() => { /* the inbox already tells the user when no specimen exists */ });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, []);

  const sign = async () => {
    setBusy(true); setError("");
    try {
      setStage("reauth");
      const evidence = await prepareSigningSession();
      setStage("signing");
      if(canPosition && !positions) throw new Error("Preview and confirm the signature position first.");
      const input={note:note.trim() || undefined,rowVersion:step.rowVersion};
      const result = positions ? await signPositionedStep(step.id,{...input,...positions}) : await signStep(step.id,input);
      onSigned(result.requestComplete
        ? `${documentNo}: signed — every block complete (${evidence})`
        : `${documentNo}: ${blockLabel(step.blockCode)} signed (${evidence})`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); setStage("idle"); }
  };

  return (
    <Panel title={`Sign this document · step ${step.stepNo}`}
      subtitle={`${blockLabel(step.blockCode)} · ${markLabel(step.requiredMark)}`}>
      <ActionError message={error} />
      {canPosition?<div className="callout"><button className="btn primary" disabled={busy || !fileId} onClick={()=>setPositioning(true)}><Icon name="eye"/><LocalizedText text={"Preview, move & resize signature"} /></button><span>{positions?`Position confirmed: page ${positions.placement.page}`:"เลือกตำแหน่งและขนาดก่อนลงนาม"}</span></div>:<p className="muted"><LocalizedText text={"This file format uses the signature certificate; convert to PDF for positioned signing."} /></p>}
      {positioning?<SigningPreview documentId={documentId} fileId={fileId} stepId={step.id} stepNo={step.stepNo} onClose={()=>setPositioning(false)} onConfirm={value=>{setPositions(value);setPositioning(false);}}/>:null}
      <div className="detail-grid">
        <div><span><LocalizedText text={"You"} /></span><strong>{userName} <LocalizedText text={"·"} /> {userRole}</strong></div>
        <div><span><LocalizedText text={"Block"} /></span><strong>{blockLabel(step.blockCode)}</strong></div>
        <div><span><LocalizedText text={"Required"} /></span><strong>{markLabel(step.requiredMark)}</strong></div>
        {step.stampCode ? <div><span><LocalizedText text={"Company stamp"} /></span><strong>{step.stampCode}</strong></div> : null}
      </div>

      <Field label="ลายเซ็นของคุณ" hint="แสดงเฉพาะกับคุณ · ไม่มี route ที่ส่งลายเซ็นของผู้ใช้อื่น">
        {specimenUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={specimenUrl} alt="ลายเซ็นของคุณ" style={{ maxHeight: 72, background: "transparent" }} />
          : <span className="muted"><LocalizedText text={"ยังไม่มีลายเซ็น — สร้างก่อนลงนาม"} /></span>}
      </Field>

      {step.stampCode ? (
        <div className="callout warning" role="status">
          <Icon name="shield" />
          <span>
            <strong><LocalizedText text={"Company Stamps"} /> {step.stampCode}</strong><LocalizedText text={"ชื่อของคุณจะถูกพิมพ์ใต้ตราประทับ และระบบบันทึกว่า"} />{userName}<LocalizedText text={"เป็นผู้ประทับพร้อมสิทธิ์ที่ใช้ — ระบบนี้ไม่สามารถผลิตประโยคว่า &ldquo;บริษัทประทับตรา&rdquo; ได้"} /> </span>
        </div>
      ) : null}

      <Field label="Note (optional)" hint="เก็บไว้ใน event chain">
        <textarea rows={3} maxLength={4_000} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      <div className="callout" role="status">
        <Icon name="lock" />
        <span>
          <strong><LocalizedText text={"ยืนยันตัวตนของคุณ"} /></strong><LocalizedText text={"ระบบนี้ไม่เก็บรหัสผ่าน การลงนามจึงต้องผ่านการเข้าสู่ระบบ Microsoft ใหม่ทันทีก่อนเซ็น และเวลาที่ยืนยันจะถูกบันทึกลงใน chain"} /> </span>
      </div>

      <div className="table-actions">
        <button className="btn primary" type="button" disabled={busy || !specimenUrl || (canPosition && !positions)} onClick={() => { void sign(); }}>
          <Icon name="edit" />
          {stage === "reauth" ? "ยืนยันตัวตน…" : stage === "signing" ? "กำลังลงนาม…" : "SIGN DOCUMENT"}
        </button>
        <button className="btn ghost" type="button" disabled={busy} onClick={onReturn}>
          <Icon name="refresh" /><LocalizedText text={"Return to owner"} /> </button>
        <button className="btn ghost" type="button" disabled={busy} onClick={onDelegate}>
          <Icon name="user" /><LocalizedText text={"Delegate"} /> </button>
        {onReject ? <button className="btn danger" type="button" disabled={busy} onClick={onReject}>
          <Icon name="x" /><LocalizedText text={"Reject"} /> </button> : null}
      </div>
    </Panel>
  );
}

function DelegatePrompt({
  bootstrap,
  busy,
  onClose,
  onConfirm,
}: {
  bootstrap: BootstrapData;
  busy: boolean;
  onClose: () => void;
  onConfirm: (toUserId: number, reason: string) => void;
}) {
  const candidates = bootstrap.team.filter((member) => member.id !== bootstrap.user.id);
  const [toUserId, setToUserId] = useState(candidates[0]?.id ?? 0);
  const [reason, setReason] = useState("");
  return (
    <Modal title="Delegate this signature step" size="sm" onClose={onClose}
      subtitle="การมอบหมายคือการย้าย step ไม่ใช่การเซ็นแทน — ชื่อและลายเซ็นของผู้รับมอบจะปรากฏบนเอกสาร"
      footer={<>
        <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={busy || !toUserId || !reason.trim()}
          onClick={() => onConfirm(toUserId, reason.trim())}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Delegate"}</button>
      </>}>
      <Field label="Delegate to">
        <select value={toUserId} onChange={(event) => setToUserId(Number(event.target.value))}>
          {candidates.map((member) => <option key={member.id} value={member.id}>{member.name} <LocalizedText text={"·"} /> {member.role}</option>)}
        </select>
      </Field>
      <Field label="Reason (required)">
        <textarea rows={3} maxLength={4_000} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// SG-06 · Signed documents, plus the entry points and SG-07 verification
// ---------------------------------------------------------------------------

export function ProductionSignedDocuments({
  bootstrap,
  notify,
  initialVerifyCode,
}: SigningScreenProps & { initialVerifyCode?: string }) {
  const localizeCopy = useStaticCopy();
  const uiText = useUiText();
  const canRead = hasPermission(bootstrap, "signing.read");
  const canRequest = hasPermission(bootstrap, "signing.request");
  const [state, setState] = useState("");
  const [docClass, setDocClass] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // A visitor who followed the link or QR on a certificate arrives with the
  // code in hand; opening the panel closed would make them type it again.
  const [verifyOpen, setVerifyOpen] = useState(Boolean(initialVerifyCode));

  const documents = useEndpoint(
    useCallback(() => canRead
      ? listSignableDocuments({ state: state || undefined, docClass: docClass || undefined, search: search || undefined, pageSize: 100 })
      : Promise.resolve({ items: [] as SignableDocumentSummary[], page: 1, pageSize: 100, total: 0 }),
    [canRead, state, docClass, search]),
    { items: [] as SignableDocumentSummary[], page: 1, pageSize: 100, total: 0 });

  if (!canRead) {
    return <EmptyState icon="lock" title="No signing access"
      message="บทบาทของคุณยังไม่มีสิทธิ์ signing.read กรุณาติดต่อผู้ดูแลระบบ" />;
  }

  const rows = documents.data.items;
  return (
    <>
      <PageHeader eyebrow="DOCUMENTS" title="Signed Documents"
        subtitle="เอกสารที่ลงนามหรือกำลังรอลงนาม พร้อม hash ของไฟล์ ลำดับเหตุการณ์ และรหัสตรวจสอบ"
        actions={<>
          <button className="btn ghost" type="button" onClick={() => setVerifyOpen(true)}><Icon name="shield" /><LocalizedText text={"Verify a code"} /></button>
          {canRequest ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"New signable document"} /></button> : null}
          <RefreshButton loading={documents.loading} reload={documents.reload} />
        </>} />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาเลขเอกสารหรือชื่อเรื่อง" />
        <label className="select-field">
          <span className="sr-only"><LocalizedText text={"State"} /></span>
          <select value={state} aria-label={uiText("State")} onChange={(event) => setState(event.target.value)}>
            <option value=""><LocalizedText text={"ทุกสถานะ"} /></option>
            {["DRAFT", "PENDING_SIGN", "PARTIALLY_SIGNED", "SIGNED", "REJECTED", "SUPERSEDED", "VOIDED"]
              .map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <Icon name="chevronDown" />
        </label>
        <label className="select-field">
          <span className="sr-only"><LocalizedText text={"Document class"} /></span>
          <select value={docClass} aria-label={localizeCopy("Document class")} onChange={(event) => setDocClass(event.target.value)}>
            <option value=""><LocalizedText text={"ทุกคลาส"} /></option>
            {DOCUMENT_CLASSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <Icon name="chevronDown" />
        </label>
      </Toolbar>

      {documents.error ? <LoadError message={documents.error} retry={documents.reload} /> : null}

      <Panel title={`${documents.data.total} documents`} subtitle="Signing เป็น shared service — คลาสเอกสารต่างกันแค่ที่ flow template" flush>
        {rows.length
          ? <DocumentTable rows={rows} onOpen={setOpenId} />
          : documents.loading ? <Loading /> : <EmptyState icon="file" title="No signable document"
            message="ยังไม่มีเอกสารที่ถูก freeze เข้าสู่กระบวนการลงนาม" />}
      </Panel>

      {openId ? (
        <SignDocumentDrawer bootstrap={bootstrap} documentId={openId} focusStepId={null} notify={notify}
          onClose={() => setOpenId(null)} onChanged={() => documents.reload()} />
      ) : null}
      {createOpen ? (
        <CreateSignableDocumentModal onClose={() => setCreateOpen(false)}
          onCreated={(message) => { setCreateOpen(false); notify(message); documents.reload(); }} />
      ) : null}
      {verifyOpen ? <VerifyModal initialCode={initialVerifyCode} onClose={() => setVerifyOpen(false)} /> : null}
    </>
  );
}

export function CreateSignableDocumentModal({ onClose, onCreated, initialProjectId = 0, initialTaskId = 0 }: { onClose: () => void; onCreated: (message: string) => void; initialProjectId?: number; initialTaskId?: number }) {
  const projects = useEndpoint(useCallback(() => listProjects({ pageSize: 200 }), []),
    { items: [] as ProjectSummary[], page: 1, pageSize: 200, total: 0 });
  const [projectId, setProjectId] = useState(initialProjectId);
  const effectiveProjectId = projectId || projects.data.items[0]?.id || 0;
  const attachments = useEndpoint<ProjectDocument[]>(
    useCallback(() => effectiveProjectId ? listProjectDocuments(effectiveProjectId) : Promise.resolve(EMPTY as ProjectDocument[]),
      [effectiveProjectId]), EMPTY);
  const [projectDocumentId, setProjectDocumentId] = useState(0);
  const effectiveDocumentId = projectDocumentId || attachments.data[0]?.id || 0;
  const selected = attachments.data.find((item) => item.id === effectiveDocumentId);
  const [documentClass, setDocumentClass] = useState<SignDocumentClass>(initialTaskId ? "DRAWING" : "QUOTATION");
  const [taskId, setTaskId] = useState(initialTaskId);
  const [file, setFile] = useState<File | null>(null);
  const tasks = useEndpoint(useCallback(() => effectiveProjectId && documentClass === "DRAWING" ? listDrawingTasks(effectiveProjectId) : Promise.resolve([]), [effectiveProjectId, documentClass]), []);
  const [title, setTitle] = useState("");
  const [locale, setLocale] = useState("en");
  const [amount, setAmount] = useState("");
  const [revisionLabel, setRevisionLabel] = useState("R00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      let storedId = effectiveDocumentId;
      if (file && documentClass === "DRAWING") {
        const uploaded = await uploadProjectDocument(effectiveProjectId, { file, folderCode: "02", documentType: "Drawing", taskId });
        storedId = uploaded.id;
        setProjectDocumentId(storedId); setFile(null); attachments.reload();
      }
      const result = await createSignableDocument({
        documentClass,
        title: title.trim() || file?.name || selected?.fileName || "Untitled",
        projectId: effectiveProjectId,
        documentLocale: locale,
        amount: amount ? Number(amount) : undefined,
        projectDocumentId: storedId,
        taskId: documentClass === "DRAWING" ? taskId : undefined,
        revisionLabel,
      });
      onCreated(`${result.documentNo} ${result.revisionLabel} frozen`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Freeze a document for signature"
      subtitle="ระบบจะไม่เซ็นไฟล์ที่ตัวเองไม่ได้ freeze — เลือกไฟล์ที่อัปโหลดไว้แล้ว ระบบจะบันทึก SHA-256 ของไฟล์นั้นไว้ถาวร"
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={busy || (!effectiveDocumentId && !file) || (documentClass === "DRAWING" && !taskId)} onClick={() => { void submit(); }}>
          <Icon name="lock" />{busy ? "Freezing…" : "Freeze document"}
        </button>
      </>}>
      <ActionError message={error} />
      {projects.error ? <LoadError message={projects.error} retry={projects.reload} /> : null}
      {effectiveProjectId && attachments.error ? <LoadError message={attachments.error} retry={attachments.reload} /> : null}
      {effectiveProjectId && documentClass === "DRAWING" && tasks.error ? <LoadError message={tasks.error} retry={tasks.reload} /> : null}
      <div className="form-grid two">
        <Field label="Project">
          <select value={effectiveProjectId} disabled={projects.loading || Boolean(projects.error)} onChange={(event) => { setProjectId(Number(event.target.value)); setProjectDocumentId(0); setTaskId(0); setFile(null); }}>
            {!projects.data.items.length ? <option value={0}>{projects.loading ? "Loading projects…" : projects.error ? "Projects unavailable" : "No accessible project"}</option> : null}
            {projects.data.items.map((project) => (
              <option key={project.id} value={project.id}>{project.number} <LocalizedText text={"·"} /> {project.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Stored file" hint={selected ? `${(selected.sizeBytes / 1024).toFixed(0)} KB · ${selected.documentType}` : "อัปโหลดไฟล์ในหน้า Project Documents ก่อน"}>
          <select value={effectiveDocumentId} disabled={!effectiveProjectId || attachments.loading || Boolean(attachments.error)} onChange={(event) => setProjectDocumentId(Number(event.target.value))}>
            {!attachments.data.length ? <option value={0}>{attachments.loading ? "Loading stored files…" : attachments.error ? "Stored files unavailable" : "No stored file — import below"}</option> : null}
            {attachments.data.map((item) => <option key={item.id} value={item.id}>{item.fileName}</option>)}
          </select>
        </Field>
        <Field label="Document class">
          <select value={documentClass} onChange={(event) => setDocumentClass(event.target.value as SignDocumentClass)}>
            {DOCUMENT_CLASSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        {documentClass === "DRAWING" ? <>
          <Field label="My Design task" hint="เฉพาะงานย่อยที่คุณได้รับมอบหมาย · Member เป็นผู้จัดทำ">
            <select value={taskId} disabled={!effectiveProjectId || tasks.loading || Boolean(tasks.error)} onChange={event => setTaskId(Number(event.target.value))}>
              <option value={0}>{tasks.loading ? "Loading assigned tasks…" : tasks.error ? "Assigned tasks unavailable" : "Select assigned task"}</option>
              {tasks.data.map(task => <option key={task.id} value={task.id}>{task.name} <LocalizedText text={"· Leader:"} /> {task.leaderName ?? "Not assigned"} <LocalizedText text={"· Manager:"} /> {task.managerName ?? "Not assigned"}</option>)}
            </select>
          </Field>
          <Field label="Import Drawing" hint="เลือกไฟล์ใหม่ หรือใช้ Stored file ด้านบน · ต้นฉบับและ SHA-256 จะถูกเก็บก่อนส่งอนุมัติ">
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={event => setFile(event.target.files?.[0] ?? null)} />
          </Field>
        </> : null}
        <Field label="Revision" hint="R ตามด้วยตัวเลข">
          <input value={revisionLabel} maxLength={10} onChange={(event) => setRevisionLabel(event.target.value.toUpperCase())} />
        </Field>
        <Field label="Title" span={2}>
          <input value={title} maxLength={500} placeholder={selected?.fileName ?? ""} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Document locale" hint="ภาษาของเอกสาร ไม่ใช่ภาษาหน้าจอของผู้เซ็น">
          <select value={locale} onChange={(event) => setLocale(event.target.value)}>
            <option value="th"><LocalizedText text={"ไทย"} /></option><option value="en"><LocalizedText text={"English"} /></option><option value="ja"><LocalizedText text={"日本語"} /></option>
          </select>
        </Field>
        <Field label="Amount (THB)" hint="ใช้เลือก value band ของ flow เท่านั้น เช่น PR/PO">
          <input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function FreezeRevisionModal({
  document,
  onClose,
  onDone,
}: {
  document: SignableDocumentSummary;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const attachments = useEndpoint<ProjectDocument[]>(
    useCallback(() => document.projectId ? listProjectDocuments(document.projectId) : Promise.resolve(EMPTY as ProjectDocument[]),
      [document.projectId]), EMPTY);
  const [projectDocumentId, setProjectDocumentId] = useState(0);
  const effectiveDocumentId = projectDocumentId || attachments.data[0]?.id || 0;
  const nextLabel = `R${String(Number((document.currentRevisionLabel ?? "R00").slice(1)) + 1).padStart(2, "0")}`;
  const [file, setFile] = useState<File | null>(null);
  const [revisionLabel, setRevisionLabel] = useState(nextLabel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      let replacementId = effectiveDocumentId;
      if (file && document.projectId && document.scheduleTaskId) {
        const uploaded = await uploadProjectDocument(document.projectId, {file,folderCode:"02",documentType:"Drawing",taskId:document.scheduleTaskId});
        replacementId=uploaded.id;setProjectDocumentId(uploaded.id);setFile(null);attachments.reload();
      }
      const result = await freezeDocumentRevision(document.id, {
        projectDocumentId: replacementId,
        revisionLabel,
        rowVersion: document.rowVersion,
      });
      onDone(result.supersededRequestId
        ? `${document.documentNo} ${result.revisionLabel} frozen — previous round superseded, unsigned steps voided`
        : `${document.documentNo} ${result.revisionLabel} frozen`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`New revision of ${document.documentNo}`} size="sm" onClose={onClose}
      subtitle="Revision ใหม่จะยกเลิกทุก step ที่ยังไม่ได้เซ็น และไม่ยกลายเซ็นเดิมมาใช้ต่อ — นี่คือกฎที่กันไม่ให้ลายเซ็นอยู่รอดไฟล์ที่มันเซ็น"
      footer={<>
        <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={busy || !effectiveDocumentId} onClick={() => { void submit(); }}>
          <Icon name="lock" />{busy ? "Freezing…" : "Freeze revision"}
        </button>
      </>}>
      <ActionError message={error} />
      <Field label="Replacement file">
        <select value={effectiveDocumentId} onChange={(event) => setProjectDocumentId(Number(event.target.value))}>
          {attachments.data.map((item) => <option key={item.id} value={item.id}>{item.fileName}</option>)}
        </select>
      </Field>
      {document.scheduleTaskId ? <Field label="Import revised Drawing"><input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={event => setFile(event.target.files?.[0] ?? null)} /></Field> : null}
      <Field label="Revision label">
        <input value={revisionLabel} maxLength={10} onChange={(event) => setRevisionLabel(event.target.value.toUpperCase())} />
      </Field>
    </Modal>
  );
}

/** SG-07 · honest about what it proves. */
function VerifyModal({ initialCode, onClose }: { initialCode?: string; onClose: () => void }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [result, setResult] = useState<SignVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = async (value: string) => {
    setBusy(true); setError(""); setResult(null);
    try { setResult(await verifySignedDocument(value.trim().toUpperCase())); }
    catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  // A code that arrived on the certificate's link or QR is checked without a
  // second click. The request starts on a microtask so nothing is set during
  // the effect itself.
  useEffect(() => {
    if (!initialCode || initialCode.length < 17) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setBusy(true); setError(""); setResult(null);
      try {
        const verification = await verifySignedDocument(initialCode.trim().toUpperCase());
        if (!cancelled) setResult(verification);
      } catch (requestError) {
        if (!cancelled) setError(toError(requestError));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialCode]);

  return (
    <Modal title="Verify a signed document" onClose={onClose}
      subtitle="ใส่รหัสจาก certificate page หรือ QR บนเอกสารที่พิมพ์ออกมา"
      footer={<button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>}>
      <ActionError message={error} />
      <Field label="Verification code" hint="รูปแบบ TC-XXXX-XXXX-XXXX">
        <div className="table-actions">
          <input value={code} maxLength={24} placeholder="TC-5K3P-9QW2-7XR1"
            onChange={(event) => setCode(event.target.value.toUpperCase())} />
          <button className="btn primary" type="button" disabled={busy || code.trim().length < 17} onClick={() => { void check(code); }}>
            <Icon name="search" />{busy ? "Checking…" : "Verify"}
          </button>
        </div>
      </Field>

      {result ? (
        <>
          <div className={result.chainVerified ? "callout success" : "callout danger"} role="status">
            <Icon name={result.chainVerified ? "checkCircle" : "alertTriangle"} />
            <span><strong>{result.chainVerified ? "VALID" : "CHAIN BROKEN"}</strong>
              {result.chainVerified
                ? "เอกสารนี้ไม่ถูกแก้ไขหลังการลงนาม"
                : "ลำดับเหตุการณ์ไม่สอดคล้องกับ hash ที่บันทึกไว้ — ต้องตรวจสอบ"}</span>
          </div>
          <div className="detail-grid">
            <div><span><LocalizedText text={"Document"} /></span><strong className="mono">{result.documentNo} <LocalizedText text={"·"} /> {result.revisionLabel}</strong></div>
            <div><span><LocalizedText text={"Class"} /></span><strong>{classLabel(result.documentClass)}</strong></div>
            <div><span><LocalizedText text={"Title"} /></span><strong>{result.title}</strong></div>
            <div><span><LocalizedText text={"Project"} /></span><strong>{result.projectName ?? "—"}</strong></div>
            <div><span><LocalizedText text={"Issued by"} /></span><strong>{result.legalEntity}</strong></div>
            <div><span><LocalizedText text={"Completed"} /></span><strong>{dateTime(result.completedAt)}</strong></div>
            <div><span><LocalizedText text={"Source SHA-256"} /></span><strong className="mono">{shortHash(result.sourceSha256)}</strong></div>
            <div><span><LocalizedText text={"Output SHA-256"} /></span><strong className="mono">{shortHash(result.outputSha256)}</strong></div>
          </div>
          <Panel title="Signed by" flush>
            <div className="table-wrap">
              <table>
                <thead><tr><th><LocalizedText text={"Block"} /></th><th><LocalizedText text={"Signer"} /></th><th><LocalizedText text={"Mark"} /></th><th><LocalizedText text={"When"} /></th><th><LocalizedText text={"Evidence"} /></th></tr></thead>
                <tbody>
                  {result.blocks.map((block, index) => (
                    <tr key={`${block.blockCode}-${index}`}>
                      <td>{blockLabel(block.blockCode)}</td>
                      <td>{block.signerName}<small className="muted">{block.signerRole ?? ""}</small></td>
                      <td>{markLabel(block.requiredMark)}{block.stampCode ? <small className="muted"><LocalizedText text={"stamp"} /> {block.stampCode}</small> : null}</td>
                      <td className="mono">{dateTime(block.decidedAt)}</td>
                      <td><small className="muted">{block.authEvidence ?? "—"}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="callout warning" role="note">
            <Icon name="alertTriangle" />
            <span><strong><LocalizedText text={"หน้านี้บอกอะไร"} /></strong>{result.statement}</span>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// SG-03 · My signature — a preference, not a security ceremony
// ---------------------------------------------------------------------------

export function ProductionMySignature({ notify }: SigningScreenProps) {
  const specimen = useEndpoint<SignatureSpecimenView | null>(loadMySignature, null);
  const [editing, setEditing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const active = specimen.data?.active ?? null;

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    if (!active) return;
    void loadMySignatureImage()
      .then((value) => { if (cancelled) { URL.revokeObjectURL(value); return; } url = value; setImageUrl(value); })
      .catch(() => { /* the panel below already shows that no specimen exists */ });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); setImageUrl(null); };
  }, [active]);
  return (
    <>
      <PageHeader eyebrow="PREFERENCES" title="My Signature"
        subtitle="ลายเซ็นนี้ใช้เฉพาะเวลาคุณเซ็น ไม่ถูกแสดงให้ผู้ใช้อื่น ดาวน์โหลดไม่ได้ และปรากฏเฉพาะเมื่อถูก render ลงในเอกสารที่ลงนามแล้ว"
        actions={<>
          <button className="btn primary" type="button" onClick={() => setEditing(true)}><Icon name="edit" />{active ? "Replace" : "Create"}</button>
          <RefreshButton loading={specimen.loading} reload={specimen.reload} />
        </>} />
      {specimen.error ? <LoadError message={specimen.error} retry={specimen.reload} /> : null}

      <Panel title={active ? `Current · v${active.version}` : "No signature yet"}
        subtitle={active ? `${active.source} · active since ${dateTime(active.activeFrom)} · used in ${active.usedInDocuments} marks` : "ต้องสร้างลายเซ็นก่อนจึงจะถูกมอบหมาย signature step ได้"}>
        {active && imageUrl
          // A blob URL of the caller's own specimen; next/image cannot optimise it
          // and must never be given a route that could cache someone's signature.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={imageUrl} alt="ลายเซ็นของฉัน" style={{ maxHeight: 96 }} />
          : <span className="muted">—</span>}
        {active?.initialsText ? <p className="muted"><LocalizedText text={"Initials:"} /> <strong>{active.initialsText}</strong></p> : null}
      </Panel>

      <Panel title="History" subtitle="เอกสารที่ลงนามแล้วยังอ้างอิงเวอร์ชันที่ใช้จริง — การเปลี่ยนลายเซ็นไม่ย้อนไปแก้เอกสารเก่า" flush>
        {specimen.data?.history.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th><LocalizedText text={"Version"} /></th><th><LocalizedText text={"Source"} /></th><th><LocalizedText text={"Active from"} /></th><th><LocalizedText text={"Retired"} /></th><th><LocalizedText text={"Used in"} /></th></tr></thead>
              <tbody>
                {specimen.data.history.map((item) => (
                  <tr key={item.id}>
                    <td className="mono"><LocalizedText text={"v"} />{item.version}</td>
                    <td>{item.source}</td>
                    <td>{dateTime(item.activeFrom)}</td>
                    <td>{item.activeTo ? dateTime(item.activeTo) : <Badge tone="green"><LocalizedText text={"active"} /></Badge>}</td>
                    <td className="num">{item.usedInDocuments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : specimen.loading ? <Loading /> : <EmptyState icon="edit" title="No specimen" message="ยังไม่เคยสร้างลายเซ็น" />}
      </Panel>

      {editing ? (
        <MySignatureModal onClose={() => setEditing(false)}
          onSaved={(message) => { setEditing(false); notify(message); specimen.reload(); }} />
      ) : null}
    </>
  );
}

function MySignatureModal({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const [mode, setMode] = useState<"DRAWN" | "UPLOADED" | "TYPED">("DRAWN");
  const [typedName, setTypedName] = useState("");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [initialsDrawn, setInitialsDrawn] = useState<string | null>(null);
  const [initialsText, setInitialsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const imageBase64 = mode === "DRAWN" ? drawn
        : mode === "UPLOADED" ? uploaded
        : renderTypedSignature(typedName.trim());
      if (!imageBase64) throw new Error("ยังไม่มีภาพลายเซ็น — วาด อัปโหลด หรือพิมพ์ชื่อก่อนบันทึก");
      const result = await replaceMySignature({
        source: mode,
        imageBase64,
        initialsBase64: initialsDrawn ?? undefined,
        initialsText: initialsText.trim() || undefined,
      });
      onSaved(`Signature saved as v${result.version}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="My signature" onClose={onClose}
      subtitle="วาดคือค่าเริ่มต้น เพราะเป็นวิธีเดียวที่ต้องมีตัวคนอยู่จริง — ชื่อพิมพ์เป็นตัวเลือกท้ายสุดและอ่อนแอที่สุด"
      footer={<>
        <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={busy} onClick={() => { void submit(); }}>
          <Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Save specimen"}
        </button>
      </>}>
      <ActionError message={error} />
      <Field label="วิธีสร้าง">
        <div className="table-actions">
          {(["DRAWN", "UPLOADED", "TYPED"] as const).map((value) => (
            <button key={value} type="button" className={mode === value ? "btn primary sm" : "btn ghost sm"}
              onClick={() => setMode(value)}>
              {value === "DRAWN" ? "วาด" : value === "UPLOADED" ? "อัปโหลด PNG" : "พิมพ์ชื่อ"}
            </button>
          ))}
        </div>
      </Field>

      {mode === "DRAWN" ? (
        <Field label="วาดด้วยเมาส์ สไตลัส หรือนิ้ว">
          <SignaturePad width={640} height={200} onChange={setDrawn} />
        </Field>
      ) : null}

      {mode === "UPLOADED" ? (
        <Field label="ไฟล์ PNG พื้นหลังโปร่งใส" hint="กว้างอย่างน้อย 600 px และไม่เกิน 2 MB">
          <input type="file" accept="image/png" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) { setUploaded(null); return; }
            const reader = new FileReader();
            reader.onload = () => setUploaded(typeof reader.result === "string" ? reader.result : null);
            reader.readAsDataURL(file);
          }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {uploaded ? <img src={uploaded} alt="ลายเซ็นที่อัปโหลด" style={{ maxHeight: 80, marginTop: 8 }} /> : null}
        </Field>
      ) : null}

      {mode === "TYPED" ? (
        <Field label="ชื่อที่จะใช้เป็นลายเซ็น" hint="ชื่อพิมพ์เป็นเครื่องหมายที่อ่อนแอที่สุด มีไว้สำหรับคนที่วาดไม่ได้จริง ๆ">
          <input value={typedName} maxLength={60} onChange={(event) => setTypedName(event.target.value)} placeholder="Somchai Prem" />
        </Field>
      ) : null}

      <Field label="ตัวย่อ (สำหรับช่องลายเซ็นในกรอบชื่อแบบ)"
        hint="ช่อง DRAWN BY ในกรอบชื่อแบบกว้างเพียง 18 มม. ลายเซ็นเต็มจะอ่านไม่ออก">
        <input value={initialsText} maxLength={10} onChange={(event) => setInitialsText(event.target.value)} placeholder="S.P" />
        <SignaturePad width={240} height={120} onChange={setInitialsDrawn} />
      </Field>
    </Modal>
  );
}

type Stroke = { x: number; y: number }[];

/**
 * A self-contained drawing surface. It owns its canvas and reports the finished
 * PNG upward, so no ref escapes into the parent's render. Strokes are kept as a
 * list so Undo removes the last one rather than the whole signature.
 */
function SignaturePad({
  width,
  height,
  onChange,
}: {
  width: number;
  height: number;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#10161B";
    for (const stroke of strokes.current) {
      if (stroke.length < 2) continue;
      context.beginPath();
      context.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
  }, []);

  const publish = useCallback(() => {
    const canvas = canvasRef.current;
    const hasInk = strokes.current.some((stroke) => stroke.length > 1);
    onChange(hasInk && canvas ? canvas.toDataURL("image/png") : null);
  }, [onChange]);

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: width >= 480 ? "100%" : width,
          maxWidth: "100%",
          border: "1px solid var(--line, #ccc)",
          borderRadius: 4,
          touchAction: "none",
          background: "#fff",
          marginTop: 8,
        }}
        onPointerDown={(event) => {
          drawing.current = true;
          strokes.current.push([pointFrom(event)]);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          strokes.current[strokes.current.length - 1]?.push(pointFrom(event));
          redraw();
        }}
        onPointerUp={() => { drawing.current = false; publish(); }}
        onPointerLeave={() => { if (drawing.current) { drawing.current = false; publish(); } }} />
      <div className="table-actions">
        <button className="btn ghost sm" type="button"
          onClick={() => { strokes.current.pop(); redraw(); publish(); }}>
          <Icon name="refresh" /><LocalizedText text={"Undo"} /> </button>
        <button className="btn ghost sm" type="button"
          onClick={() => { strokes.current = []; redraw(); publish(); }}>
          <Icon name="x" /><LocalizedText text={"Clear"} /> </button>
      </div>
    </>
  );
}

function renderTypedSignature(name: string): string | null {
  if (!name) return null;
  const canvas = window.document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 200;
  const context = canvas.getContext("2d");
  if (!context) return null
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#10161B";
  context.font = "italic 64px 'Sarabun', 'Segoe Script', 'Georgia', serif";
  context.textBaseline = "middle";
  context.textAlign = "center";
  context.fillText(name, canvas.width / 2, canvas.height / 2, canvas.width - 40);
  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// SG-04 / SG-05 · Company stamps and the flow templates
// ---------------------------------------------------------------------------

export function ProductionCompanyStamps({ bootstrap, notify }: SigningScreenProps) {
  const canRead = hasPermission(bootstrap, "signing.read");
  const canMaster = hasPermission(bootstrap, "signing.master");
  const canGrant = hasPermission(bootstrap, "signing.stamp.grant");
  const stamps = useEndpoint<CompanyStampSummary[]>(canRead ? listCompanyStamps : null, EMPTY);
  const flows = useEndpoint<SignFlowTemplateSummary[]>(canRead ? listSignatureFlows : null, EMPTY);
  const [tab, setTab] = useState<"stamps" | "flows">("stamps");
  const [createOpen, setCreateOpen] = useState(false);
  const [grantFor, setGrantFor] = useState<CompanyStampSummary | null>(null);
  const [revokeFor, setRevokeFor] = useState<{ stamp: CompanyStampSummary; authorityId: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!canRead) {
    return <EmptyState icon="lock" title="No signing access"
      message="บทบาทของคุณยังไม่มีสิทธิ์ signing.read กรุณาติดต่อผู้ดูแลระบบ" />;
  }

  const revoke = async (reason: string) => {
    if (!revokeFor) return;
    setBusy(true); setError("");
    try {
      await revokeStampAuthority(revokeFor.stamp.id, revokeFor.authorityId, reason);
      notify(`${revokeFor.stamp.code}: authority revoked`);
      setRevokeFor(null);
      stamps.reload();
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="MASTER DATA" title="Company Stamps"
        subtitle="ตราประทับเป็นเครื่องหมายขององค์กร ไม่ใช่ของบุคคล ทุกครั้งที่ประทับ ระบบบันทึกคนที่ประทับและพิมพ์ชื่อไว้ใต้ตรา"
        actions={<>
          {canMaster && tab === "stamps" ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"New stamp"} /></button> : null}
          <RefreshButton loading={stamps.loading || flows.loading} reload={() => { stamps.reload(); flows.reload(); }} />
        </>} />

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "stamps"} className={tab === "stamps" ? "tab active" : "tab"}
          onClick={() => setTab("stamps")}><LocalizedText text={"Stamps"} /> <em>{stamps.data.length}</em></button>
        <button type="button" role="tab" aria-selected={tab === "flows"} className={tab === "flows" ? "tab active" : "tab"}
          onClick={() => setTab("flows")}><LocalizedText text={"Signature flows"} /> <em>{flows.data.length}</em></button>
      </div>

      {stamps.error || flows.error ? <LoadError message={stamps.error || flows.error} retry={() => { stamps.reload(); flows.reload(); }} /> : null}
      <ActionError message={error} />

      {tab === "stamps" ? (
        stamps.data.length ? stamps.data.map((stamp) => (
          <Panel key={stamp.id} title={`${stamp.code} · ${stamp.nameEn}`}
            subtitle={`${stamp.legalEntity} · custodian ${stamp.custodianRole} · applied ${stamp.appliedCount} times`}
            actions={canGrant && stamp.status === "ACTIVE"
              ? <button className="btn ghost sm" type="button" onClick={() => setGrantFor(stamp)}><Icon name="plus" /><LocalizedText text={"Grant authority"} /></button>
              : undefined}>
            <div className="detail-grid">
              <div><span><LocalizedText text={"Status"} /></span><strong><Badge tone={stamp.status === "ACTIVE" ? "green" : "slate"}>{stamp.status}</Badge></strong></div>
              <div><span><LocalizedText text={"Artwork"} /></span><strong>{stamp.hasImage ? <Badge tone="green"><LocalizedText text={"on file"} /></Badge> : <Badge tone="amber"><LocalizedText text={"not uploaded"} /></Badge>}</strong></div>
              <div><span><LocalizedText text={"Scope"} /></span><strong>{stamp.scope.map(classLabel).join(" · ")}</strong></div>
              <div><span><LocalizedText text={"Valid"} /></span><strong>{date(stamp.validFrom)} → {stamp.validTo ? date(stamp.validTo) : "—"}</strong></div>
              <div><span><LocalizedText text={"ไทย"} /></span><strong>{stamp.nameTh}</strong></div>
              <div><span><LocalizedText text={"日本語"} /></span><strong>{stamp.nameJa}</strong></div>
            </div>
            <h4><LocalizedText text={"ใครมีสิทธิ์ประทับตรานี้"} /></h4>
            <div className="table-wrap">
              <table>
                <thead><tr><th><LocalizedText text={"Holder"} /></th><th><LocalizedText text={"Classes"} /></th><th><LocalizedText text={"Granted by"} /></th><th><LocalizedText text={"Valid"} /></th><th><LocalizedText text={"Used"} /></th><th><LocalizedText text={"Action"} /></th></tr></thead>
                <tbody>
                  {stamp.authorities.length ? stamp.authorities.map((authority) => (
                    <tr key={authority.id}>
                      <td>{authority.holderKind === "ROLE" ? `role ${authority.holderName}` : authority.holderName}</td>
                      <td>{authority.documentClass ? classLabel(authority.documentClass) : "all in scope"}</td>
                      <td>{authority.grantedByName}</td>
                      <td>{date(authority.validFrom)} → {authority.validTo ? date(authority.validTo) : "—"}</td>
                      <td className="num">{authority.usedCount}</td>
                      <td>
                        {authority.revokedAt
                          ? <Badge tone="slate"><LocalizedText text={"revoked"} /></Badge>
                          : canGrant
                            ? <button className="btn danger sm" type="button" onClick={() => setRevokeFor({ stamp, authorityId: authority.id })}><Icon name="x" /><LocalizedText text={"Revoke"} /></button>
                            : "—"}
                      </td>
                    </tr>
                  )) : <tr><td colSpan={6}><span className="muted"><LocalizedText text={"ยังไม่มีใครได้รับสิทธิ์ประทับตรานี้"} /></span></td></tr>}
                </tbody>
              </table>
            </div>
            <p className="muted"><LocalizedText text={"การยกเลิกสิทธิ์ไม่ทำให้เอกสาร"} /> {stamp.appliedCount} <LocalizedText text={"ฉบับที่ประทับไปแล้วเป็นโมฆะ · Admin ไม่สามารถอยู่ในรายการนี้ได้ — Admin ตั้งค่าระบบ ฝ่ายธุรกิจเป็นผู้ลงนาม"} /> </p>
          </Panel>
        )) : stamps.loading ? <Loading /> : (
          <EmptyState icon="shield" title="No company stamp"
            message="ยังไม่ได้บันทึกตราประทับ · flow ที่ต้องใช้ตราจะยังลงนามด้วยลายเซ็นเท่านั้น" />
        )
      ) : (
        flows.data.length ? (
          <Panel title="Signature flow templates"
            subtitle="แปดคลาสเอกสารต่างกันเฉพาะที่นี่ · คำขอที่กำลังรันจะยึด template version ของตัวเองไว้ การแก้ template ไม่กระทบงานที่ค้างอยู่" flush>
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th><LocalizedText text={"Document type"} /></th><th><LocalizedText text={"Version"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Steps"} /></th>
                  <th><LocalizedText text={"Rules"} /></th><th><LocalizedText text={"Running"} /></th>
                </tr></thead>
                <tbody>
                  {flows.data.map((template) => (
                    <tr key={template.id}>
                      <td><strong>{classLabel(template.documentClass)}</strong></td>
                      <td className="mono"><LocalizedText text={"v"} />{template.version}</td>
                      <td><Badge tone={template.status === "ACTIVE" ? "green" : template.status === "DRAFT" ? "amber" : "slate"}>{template.status}</Badge></td>
                      <td>
                        {template.steps.map((step) => (
                          <small key={step.id} className="muted">
                            {step.stepNo}. {blockLabel(step.blockCode)} <LocalizedText text={"·"} /> {step.assigneeKind === "ROLE" ? `role ${step.assigneeRole}` : step.assigneeKind.toLowerCase()} <LocalizedText text={"·"} /> {markLabel(step.requiredMark)}
                            {step.minAmount !== null || step.maxAmount !== null
                              ? ` · ${step.minAmount !== null ? `> ${money(step.minAmount)}` : `≤ ${money(step.maxAmount)}`}`
                              : ""}
                            {step.isOptional ? " · optional" : ""}
                          </small>
                        ))}
                      </td>
                      <td>
                        <small className="muted">{template.ordered ? "ordered" : "any order"}</small>
                        <small className="muted">{template.noSamePerson ? "no same person" : "same person allowed"}</small>
                        <small className="muted"><LocalizedText text={"return to"} /> {template.returnTarget.toLowerCase()}</small>
                        <small className="muted"><LocalizedText text={"revision voids unsigned · locked"} /></small>
                      </td>
                      <td className="num">{template.runningRequests}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted"><LocalizedText text={"Estimate ไม่อยู่ในรายการนี้โดยเจตนา — เป็นเอกสารต้นทุนภายในที่มี APPROVAL สองขั้นอยู่แล้ว สิ่งที่ลูกค้าได้รับคือ Quotation ซึ่งเป็นตัวที่ลงนามและประทับตรา"} /> </p>
          </Panel>
        ) : flows.loading ? <Loading /> : <EmptyState icon="layers" title="No flow template" message="ยังไม่ได้ตั้งค่า signature flow" />
      )}

      {createOpen ? <CreateStampModal onClose={() => setCreateOpen(false)}
        onCreated={(message) => { setCreateOpen(false); notify(message); stamps.reload(); }} /> : null}
      {grantFor ? <GrantAuthorityModal bootstrap={bootstrap} stamp={grantFor} onClose={() => setGrantFor(null)}
        onGranted={(message) => { setGrantFor(null); notify(message); stamps.reload(); }} /> : null}
      {revokeFor ? <ReasonPrompt title={`Revoke authority on ${revokeFor.stamp.code}`}
        description="การยกเลิกไม่มีผลย้อนหลัง เอกสารที่ประทับไปแล้วยังคงมีตราประทับและยังอ้างอิงสิทธิ์ที่อนุญาตไว้"
        confirmLabel="Revoke authority" busy={busy} onClose={() => setRevokeFor(null)}
        onConfirm={(reason) => { void revoke(reason); }} /> : null}
    </>
  );
}

function CreateStampModal({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string) => void }) {
  const localizeCopy = useStaticCopy();
  const [code, setCode] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [legalEntity, setLegalEntity] = useState("");
  const [custodianRole, setCustodianRole] = useState("Engineering Manager");
  const [scope, setScope] = useState<string[]>(["QUOTATION"]);
  const [validFrom, setValidFrom] = useState(isoToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const result = await createCompanyStamp({
        code: code.trim().toUpperCase(), nameTh: nameTh.trim(), nameEn: nameEn.trim(), nameJa: nameJa.trim(),
        legalEntity: legalEntity.trim(), scope, custodianRole, validFrom,
      });
      onCreated(`Stamp ${result.code} created`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="New company stamp" size="lg" onClose={onClose}
      subtitle="ตราประทับเป็นของนิติบุคคล ไม่ใช่ของระบบ — ต้องระบุว่าเป็นตราของบริษัทใด และใครเป็นผู้รับผิดชอบในโลกจริง"
      footer={<>
        <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" onClick={() => { void submit(); }}
          disabled={busy || !code.trim() || !nameEn.trim() || !legalEntity.trim() || scope.length === 0}>
          <Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : "Create stamp"}
        </button>
      </>}>
      <ActionError message={error} />
      <div className="signing-stamp-form">
      <div className="signing-stamp-form-grid">
        <Field label="Code"><input aria-label={localizeCopy("Code")} value={code} maxLength={20} placeholder="TT-QUOT" onChange={(event) => setCode(event.target.value.toUpperCase())} /></Field>
        <Field label="Legal entity"><input aria-label={localizeCopy("Legal entity")} value={legalEntity} maxLength={200} placeholder="Tomas Tech Co., Ltd." onChange={(event) => setLegalEntity(event.target.value)} /></Field>
      </div>
      <fieldset className="signing-stamp-form-group">
        <legend><LocalizedText text={"ชื่อตราประทับ / Stamp names"} /></legend>
        <div className="signing-stamp-form-grid">
        <Field label="ชื่อ (ไทย)"><input aria-label={localizeCopy("ชื่อ (ไทย)")} value={nameTh} maxLength={200} onChange={(event) => setNameTh(event.target.value)} /></Field>
        <Field label="Name (English)"><input aria-label={localizeCopy("Name (English)")} value={nameEn} maxLength={200} onChange={(event) => setNameEn(event.target.value)} /></Field>
        <Field label="名前 (日本語)" span={2}><input aria-label={localizeCopy("名前 (日本語)")} value={nameJa} maxLength={200} onChange={(event) => setNameJa(event.target.value)} /></Field>
        </div>
      </fieldset>
      <div className="signing-stamp-form-grid">
        <Field label="Custodian role" hint="ใครรับผิดชอบตราประทับนี้ในโลกจริง">
          <select aria-label={localizeCopy("Custodian role")} value={custodianRole} onChange={(event) => setCustodianRole(event.target.value)}>
            {["Engineering Manager", "Project Manager", "Purchasing", "Inventory Controller"].map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </Field>
        <Field label="Valid from" hint="วันที่เริ่มมีผลของตราประทับ"><input aria-label={localizeCopy("Valid from")} type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></Field>
      </div>
      <fieldset className="signing-stamp-form-group">
        <legend><LocalizedText text={"Scope — คลาสเอกสารที่ตรานี้ครอบคลุม"} /></legend>
          <div className="signing-stamp-scope">
            {DOCUMENT_CLASSES.map((item) => (
              <button key={item.value} type="button"
                aria-pressed={scope.includes(item.value)}
                className={scope.includes(item.value) ? "btn primary sm" : "btn ghost sm"}
                onClick={() => setScope((current) => current.includes(item.value)
                  ? current.filter((value) => value !== item.value)
                  : [...current, item.value])}>
                {item.label}
              </button>
            ))}
          </div>
      </fieldset>
      <p className="muted signing-stamp-form-note"><LocalizedText text={"ภาพตราประทับอัปโหลดแยกและต้องใช้สิทธิ์ระดับผู้จัดการ เพราะเป็นสิ่งที่ปรากฏบนกระดาษของลูกค้าจริง ไฟล์ภาพถูกเก็บไว้ในที่ที่ไม่มี route ใดส่งออกได้"} /> </p>
      </div>
    </Modal>
  );
}

function GrantAuthorityModal({
  bootstrap,
  stamp,
  onClose,
  onGranted,
}: {
  bootstrap: BootstrapData;
  stamp: CompanyStampSummary;
  onClose: () => void;
  onGranted: (message: string) => void;
}) {
  const [holderKind, setHolderKind] = useState<"ROLE" | "USER">("ROLE");
  const roles = useMemo(
    () => Array.from(new Set(bootstrap.team.map((member) => member.role))).filter((role) => role !== "Admin"),
    [bootstrap.team]);
  const users = useMemo(() => bootstrap.team.filter((member) => member.role !== "Admin"), [bootstrap.team]);
  const [holderName, setHolderName] = useState(roles[0] ?? "");
  const [holderId, setHolderId] = useState(users[0]?.id ?? 0);
  const [documentClass, setDocumentClass] = useState("");
  const [validFrom, setValidFrom] = useState(isoToday());
  const [validTo, setValidTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      // Role grants are sent by role code; the API resolves the id so the client
      // never has to know one.
      await grantStampAuthority(stamp.id, holderKind === "ROLE"
        ? { holderKind: "ROLE", holderId: 0, holderRole: holderName, documentClass: documentClass || undefined, validFrom, validTo: validTo || undefined }
        : { holderKind: "USER", holderId, documentClass: documentClass || undefined, validFrom, validTo: validTo || undefined });
      onGranted(holderKind === "ROLE"
        ? `${stamp.code}: authority granted to role ${holderName}`
        : `${stamp.code}: authority granted`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Grant authority on ${stamp.code}`} size="sm" onClose={onClose}
      subtitle="สิทธิ์คือรายการที่มีผู้ให้และวันหมดอายุ ไม่ใช่ช่องติ๊ก — คำถามที่โลกจริงถามคือ ใครอนุญาตให้คุณใช้ตราบริษัท และถึงเมื่อไหร่"
      footer={<>
        <button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={busy || (holderKind === "USER" && !holderId)}
          onClick={() => { void submit(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : <LocalizedText text={"Grant"} />}</button>
      </>}>
      <ActionError message={error} />
      <Field label="Holder">
        <div className="table-actions">
          <button type="button" className={holderKind === "USER" ? "btn primary sm" : "btn ghost sm"} onClick={() => setHolderKind("USER")}><LocalizedText text={"Named person"} /></button>
          <button type="button" className={holderKind === "ROLE" ? "btn primary sm" : "btn ghost sm"} onClick={() => setHolderKind("ROLE")}><LocalizedText text={"Role"} /></button>
        </div>
      </Field>
      {holderKind === "USER" ? (
        <Field label="Person">
          <select value={holderId} onChange={(event) => setHolderId(Number(event.target.value))}>
            {users.map((member) => <option key={member.id} value={member.id}>{member.name} <LocalizedText text={"·"} /> {member.role}</option>)}
          </select>
        </Field>
      ) : (
        <Field label="Role" hint="สิทธิ์ระดับบทบาทตั้งค่าโดยผู้ดูแลระบบ เพราะต้องใช้ role id">
          <select value={holderName} onChange={(event) => setHolderName(event.target.value)}>
            {roles.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </Field>
      )}
      <Field label="Document class" hint="เว้นว่างหมายถึงทุกคลาสที่อยู่ใน scope ของตรานี้">
        <select value={documentClass} onChange={(event) => setDocumentClass(event.target.value)}>
          <option value=""><LocalizedText text={"ทุกคลาสใน scope"} /></option>
          {stamp.scope.map((value) => <option key={value} value={value}>{classLabel(value)}</option>)}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Valid from"><input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></Field>
        <Field label="Valid to" hint="เว้นว่างคือไม่มีกำหนด"><input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} /></Field>
      </div>
    </Modal>
  );
}
