"use client";
import { useT as useStaticCopy } from "../i18n";

import { currentLocale, useT as useUiText } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { HistoricalPrPanel } from "./HistoricalPrPanel";
import { PurchaseRequestEditor } from "./PurchaseRequestEditor";
import { newestProjectFirst, projectOverviewPath } from "../project-overview-client";
import { estimateBusinessDate } from "../../../lib/estimate-ux";
import { useMemo, useState } from "react";
import { apiRequest, type BootstrapData } from "../api-client";
import { useEndpoint } from "./material-endpoint";
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
  SearchInput,
  Select,
  Toolbar,
} from "../ui";

export type MaterialScreenProps = {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
};

type BomSummary = {
  id: number;
  number: string;
  revision: number;
  status: string;
  projectId: number;
  projectNumber: string;
  projectName: string;
  estimateId: number;
  estimateNumber: string;
  estimateRevision: number;
  createdAt: string;
  createdByName: string;
  releasedAt: string | null;
  releasedByName: string | null;
  lineCount: number;
  bomBudget: number;
  rowVersion: string;
};

type BomLine = {
  id: number;
  sectionCode: string;
  itemId: number | null;
  itemCode: string | null;
  partNumber: string | null;
  description: string;
  brand: string | null;
  quantityRequired: number;
  unit: string;
  estimatedUnitCost: number;
  customerSuppliedQuantity: number;
  nonStock: boolean;
  estimateLineId: number | null;
  estimateItemCode: string | null;
  ownerId: number;
  ownerName: string;
  sortOrder: number;
  rowVersion: string;
  onHand: number;
  reserved: number;
  available: number;
  allocated: number;
  activeReserved: number;
  module: string;
  requested: number;
  netIssued: number;
  purchaseRequired: number;
  budget: number;
};

type BomWorkspace = {
  bom: {
    id: number;
    number: string;
    revision: number;
    status: string;
    projectId: number;
    projectNumber: string;
    projectName: string;
    estimateId: number;
    estimateNumber: string;
    estimateRevision: number;
    rowVersion: string;
    approvedMaterialBudget: number;
  };
  lines: BomLine[];
  modules: Array<{ module: string; budget: number; requested: number }>;
};

type PurchaseRequisition = {
  id: number;
  number: string;
  projectId: number;
  projectNumber: string;
  projectName: string;
  bomId: number;
  bomNumber: string;
  requestedById: number;
  requestedByName: string;
  priority: string;
  requiredDate: string;
  status: string;
  submittedAt: string | null;
  erpPoRef: string | null;
  lineCount: number;
  missingSuppliers: number;
  substituteLines: number;
  unplannedLines: number;
  amount: number;
  estimateAmount: number;
  variancePercent: number;
  currentStep: string | null;
  currentApproverRole: string | null;
  currentApproverId: number | null;
  currentApproverName: string | null;
  rowVersion: string;
};

type PurchaseRequisitionDetail = {
  purchaseRequisition: {
    id: number;
    number: string;
    projectId: number;
    bomId: number;
    requestedBy: number;
    status: string;
    priority: string;
    requiredDate: string;
    erpPoRef: string | null;
  };
  lines: Array<{
    id: number;
    lineType: "Planned" | "Substitute" | "Unplanned";
    bomLineId: number | null;
    itemCode: string;
    partNumber: string;
    description: string;
    brand: string;
    supplierId: number | null;
    supplierName: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    estimateQuantity: number;
    estimatedUnitCost: number;
    coveredQuantity: number;
    module: string;
    priceSource: string;
    remark: string | null;
    lineTotal: number;
    estimateTotal: number;
    original: { itemCode: string; description: string; unit: string } | null;
  }>;
  steps: Array<{
    id: number;
    sequence: number;
    name: string;
    approverRole: string | null;
    approverId: number | null;
    approverName: string | null;
    ruleCode: string | null;
    status: string;
    decision: string | null;
    comment: string | null;
    actedAt: string | null;
  }>;
  modules: Array<{ module: string; budget: number; requestedElsewhere: number; thisRequest: number }>;
  ruleFlags: Array<{ code: string; text: string; level: "manager" | "management" }>;
};

type PurchaseOrder = {
  id: number;
  number: string;
  purchaseRequisitionId: number;
  purchaseRequisitionNumber: string;
  projectId: number;
  projectNumber: string;
  supplierId: number;
  supplierName: string;
  orderDate: string;
  confirmedDate: string | null;
  expectedDate: string | null;
  status: string;
  orderedQuantity: number;
  receivedQuantity: number;
  value: number;
  openValue: number;
  rowVersion: string;
};

type PurchaseOrderDetail = {
  purchaseOrder: {
    id: number;
    number: string;
    projectId: number;
    projectNumber: string;
    supplierId: number;
    supplierName: string;
    orderDate: string;
    expectedDate: string | null;
    status: string;
    rowVersion: string;
    purchaseRequisitionNumber: string;
  };
  lines: Array<{
    id: number;
    itemId: number | null;
    itemCode: string;
    partNumber: string;
    description: string;
    orderedQuantity: number;
    unit: string;
    unitPrice: number;
    bomLineId: number;
    previouslyReceived: number;
    outstandingQuantity: number;
    defaultLocation: string;
  }>;
};

type GoodsReceipt = {
  id: number;
  number: string;
  purchaseOrderId: number;
  purchaseOrderNumber: string;
  supplierId: number;
  supplierName: string;
  deliveryNote: string;
  receivedDate: string;
  status: string;
  confirmedById: number | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  receivedById: number;
  receivedByName: string;
  receivedQuantity: number;
  acceptedQuantity: number;
  heldQuantity: number;
  rowVersion: string;
};

type GoodsReceiptDetail = {
  goodsReceipt: {
    id: number;
    number: string;
    purchaseOrderId: number;
    purchaseOrderNumber: string;
    supplierId: number;
    supplierName: string;
    deliveryNote: string;
    receivedDate: string;
    status: string;
    receivedById: number;
    receivedByName: string;
    confirmedById: number | null;
    confirmedByName: string | null;
    confirmedAt: string | null;
    rowVersion: string;
  };
  lines: Array<{
    id: number;
    purchaseOrderLineId: number;
    itemId: number | null;
    itemCode: string;
    partNumber: string;
    description: string;
    orderedQuantity: number;
    previouslyReceived: number;
    receivedQuantity: number;
    acceptedQuantity: number;
    damagedQuantity: number;
    rejectedQuantity: number;
    lotNumber: string | null;
    serialNumber: string | null;
    location: string;
    qcStatus: string;
    projectAllocationId: number | null;
    remark: string | null;
    unit: string;
    outstandingAfter: number;
  }>;
};

type MaterialIssue = {
  id: number;
  number: string;
  projectId: number;
  projectNumber: string;
  projectName: string;
  requestedById: number;
  requestedByName: string;
  requestedAt: string;
  requiredDate: string;
  status: string;
  approvedByName: string | null;
  issuedByName: string | null;
  issuedAt: string | null;
  receivedByName: string | null;
  receivedAt: string | null;
  lineCount: number;
  requestedQuantity: number;
  issuedQuantity: number;
  returnedQuantity: number;
  rowVersion: string;
};

type MaterialIssueDetail = {
  materialIssue: {
    id: number;
    number: string;
    projectId: number;
    projectNumber: string;
    projectName: string;
    requestedById: number;
    requestedByName: string;
    requestedAt: string;
    requiredDate: string;
    status: string;
    approvedById: number | null;
    approvedByName: string | null;
    approvedAt: string | null;
    pickedByName: string | null;
    issuedById: number | null;
    issuedByName: string | null;
    issuedAt: string | null;
    receivedById: number | null;
    receivedByName: string | null;
    receivedAt: string | null;
    rowVersion: string;
  };
  lines: Array<{
    id: number;
    bomLineId: number;
    itemId: number;
    itemCode: string;
    partNumber: string;
    description: string;
    bomQuantity: number;
    previouslyIssued: number;
    requestedQuantity: number;
    issuedQuantity: number;
    returnedQuantity: number;
    netIssued: number;
    location: string;
    purpose: string | null;
    unit: string;
    rowVersion: string;
    onHand: number;
    available: number;
    reservedForThisProject: number;
  }>;
};

type StockAdjustment = {
  id: number;
  number: string;
  itemId: number;
  itemCode: string;
  partNumber: string;
  description: string;
  quantityChange: number;
  reason: string;
  requestedById: number;
  requestedByName: string;
  status: string;
  approvedById: number | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rowVersion: string;
  currentUsable: number;
};

type QuarantineItem = {
  itemId: number;
  itemCode: string;
  partNumber: string;
  description: string;
  brand: string;
  unit: string;
  quarantineQuantity: number;
  usableQuantity: number;
  averageUnitCost: number;
  heldSince: string | null;
};

type ProjectPage = {
  items: Array<{ id: number; number: string; name: string; status: string }>;
};

type InventoryItem = {
  itemId: number;
  itemCode: string;
  partNumber: string;
  description: string;
  brand: string;
  unit: string;
  location: string;
  usable: number;
  quarantine: number;
  reserved: number;
  available: number;
  onOrder: number;
  averageUnitCost: number;
  reorderLevel: number;
};

const EMPTY: never[] = [];
const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const body = (value: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(value) });
const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(value));
const quantity = (value: number) => Number(value).toLocaleString(currentLocale(), { maximumFractionDigits: 4 });
const date = (value: string | null) => value ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T00:00:00`)) : "—";
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
// The business day in the configured zone (no DST in Bangkok, so whole days are exact).
const isoDate = (offsetDays = 0) => estimateBusinessDate(new Date(Date.now() + offsetDays * 86_400_000), process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok");
const contains = (value: string, search: string) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
const hasPermission = (bootstrap: BootstrapData, permission: string) => bootstrap.permissions.includes(permission);
const isOpenPurchaseOrder = (item: PurchaseOrder) =>
  ["Ordered", "Partially Received"].includes(item.status)
  && Number(item.orderedQuantity) > Number(item.receivedQuantity);

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="callout danger" role="alert">
      <Icon name="alertTriangle" />
      <span><strong><LocalizedText text={"Could not load"} /></strong>{message}</span>
      <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button>
    </div>
  );
}

function ActionError({ message }: { message: string }) {
  return message ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"ดำเนินการไม่สำเร็จ"} /></strong>{message}</span></div> : null;
}

function Loading() {
  return <div className="empty"><span className="spinner" /><LocalizedText text={"Loading from production API…"} /></div>;
}

function RefreshButton({ loading, reload }: { loading: boolean; reload: () => void }) {
  return <button className="btn ghost" type="button" disabled={loading} onClick={reload}><Icon name="refresh" /><LocalizedText text={"Refresh"} /></button>;
}

function CommentPrompt({
  title,
  description,
  confirmLabel,
  requireComment,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  requireComment?: boolean;
  busy: boolean;
  // Shown inside the dialog: the server asks for a comment only on a flagged or over-BOM approval, and the page behind is hidden.
  error?: string;
  onClose: () => void;
  onConfirm: (comment: string) => void;
}) {
  const localizeCopy = useStaticCopy();
  const [comment, setComment] = useState("");
  return (
    <Modal title={title} subtitle={description} size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" onClick={() => onConfirm(comment.trim())} disabled={busy || (requireComment && !comment.trim())}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : confirmLabel}</button></>}>
      <ActionError message={error ?? ""} />
      <Field label={requireComment ? "Comment (required)" : "Comment / note"}>
        <textarea rows={4} maxLength={20_000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={localizeCopy("เหตุผลหรือข้อมูลประกอบสำหรับ audit trail")} />
      </Field>
    </Modal>
  );
}

export function ProductionProcurementDashboard({ bootstrap }: MaterialScreenProps) {
  const uiText = useUiText();
  const canProcurement = hasPermission(bootstrap, "procurement.read");
  const canInventory = hasPermission(bootstrap, "inventory.read");
  const boms = useEndpoint<BomSummary[]>(canProcurement ? "/api/v1/boms/" : null, EMPTY);
  const prs = useEndpoint<PurchaseRequisition[]>(canProcurement ? "/api/v1/purchase-requisitions/" : null, EMPTY);
  const pos = useEndpoint<PurchaseOrder[]>(canProcurement ? "/api/v1/purchase-orders/" : null, EMPTY);
  const grns = useEndpoint<GoodsReceipt[]>(canInventory ? "/api/v1/goods-receipts/" : null, EMPTY);
  const mirs = useEndpoint<MaterialIssue[]>(canInventory ? "/api/v1/material-issues/" : null, EMPTY);
  const error = boms.error || prs.error || pos.error || grns.error || mirs.error;
  const loading = boms.loading || prs.loading || pos.loading || grns.loading || mirs.loading;
  const reload = () => { boms.reload(); prs.reload(); pos.reload(); grns.reload(); mirs.reload(); };
  const pendingApproval = prs.data.filter((item) => item.status === "In Approval").length
    + mirs.data.filter((item) => item.status === "Pending Approval").length;
  const openOrderValue = pos.data.reduce((sum, item) => sum + Number(item.openValue), 0);
  const materialBudget = boms.data.reduce((sum, item) => sum + Number(item.bomBudget), 0);

  return (
    <>
      <PageHeader eyebrow="MATERIAL & PROCUREMENT" title={uiText("Procurement Dashboard")} subtitle="ภาพรวมนี้คำนวณจาก BOM, PR, PO, GRN และ MIR จริงใน SQL Server" actions={<RefreshButton loading={loading} reload={reload} />} />
      {error ? <LoadError message={error} retry={reload} /> : null}
      <div className="kpi-grid four">
        <KpiCard label="Released BOM" value={boms.data.filter((item) => item.status === "Released").length} note={money(materialBudget)} icon="layers" tone="blue" />
        <KpiCard label="Waiting approval" value={pendingApproval} note="PR + material issue" icon="checkCircle" tone={pendingApproval ? "amber" : "slate"} />
        <KpiCard label="Open PO value" value={money(openOrderValue)} note={`${pos.data.filter(isOpenPurchaseOrder).length} open orders`} icon="truck" tone="violet" />
        <KpiCard label="Draft receipts" value={grns.data.filter((item) => item.status === "Draft").length} note={`${mirs.data.filter((item) => item.status === "Approved").length} MIR ready to issue`} icon="download" tone="green" />
      </div>
      <Panel title="Live procurement queue" subtitle={loading ? "Loading from production API…" : "รายการที่ต้องดำเนินการตามสถานะจริง"} flush>
        {loading && !prs.data.length && !pos.data.length ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th><LocalizedText text={"Document"} /></th><th><LocalizedText text={"Project / supplier"} /></th><th><LocalizedText text={"Stage"} /></th><th><LocalizedText text={"Value / quantity"} /></th><th><LocalizedText text={"Next action"} /></th></tr></thead>
              <tbody>
                {prs.data.filter((item) => !["Converted to PO", "Rejected"].includes(item.status)).slice(0, 8).map((item) => <tr key={`pr-${item.id}`}><td><strong className="mono">{item.number}</strong><small className="muted"><LocalizedText text={"Purchase Requisition"} /></small></td><td>{item.projectNumber} <LocalizedText text={"·"} /> {item.projectName}</td><td><Badge>{item.status}</Badge></td><td className="num">{money(item.amount)}</td><td>{item.currentStep || (item.status === "Draft" ? "Submit requisition" : "—")}</td></tr>)}
                {pos.data.filter(isOpenPurchaseOrder).slice(0, 8).map((item) => <tr key={`po-${item.id}`}><td><strong className="mono">{item.number}</strong><small className="muted"><LocalizedText text={"Purchase Order"} /></small></td><td>{item.projectNumber} <LocalizedText text={"·"} /> {item.supplierName}</td><td><Badge>{item.status}</Badge></td><td className="num">{money(item.openValue)}</td><td>{item.expectedDate ? `Expected ${date(item.expectedDate)}` : "Set expected date"}</td></tr>)}
                {!prs.data.length && !pos.data.length ? <tr><td colSpan={5}><EmptyState icon="package" title="No procurement transaction yet" message="สร้างและ release BOM ก่อนเริ่ม PR และ PO" /></td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

export function ProductionBoms({ bootstrap, notify }: MaterialScreenProps) {
  const uiText = useUiText();
  const endpoint = useEndpoint<BomSummary[]>("/api/v1/boms/", EMPTY);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [action, setAction] = useState<BomSummary | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const canGenerate = hasPermission(bootstrap, "procurement.request");
  const canRelease = hasPermission(bootstrap, "procurement.approve");
  const visible = useMemo(() => endpoint.data.filter((item) => (status === "All status" || item.status === status)
    && (!search.trim() || contains(`${item.number} ${item.projectNumber} ${item.projectName} ${item.estimateNumber}`, search))), [endpoint.data, search, status]);

  const release = async (comment: string) => {
    if (!action) return;
    setActionBusy(true); setActionError("");
    try {
      await apiRequest(`/api/v1/boms/${action.id}/release`, body({ rowVersion: action.rowVersion, comment }));
      notify(`${action.number} released`);
      setAction(null);
      endpoint.reload();
    } catch (error) { setActionError(toError(error)); }
    finally { setActionBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="MATERIAL CONTROL" title={uiText("Bill of Materials")} subtitle="BOM ถูกสร้างจาก Estimate ที่อนุมัติและล็อกแล้ว พร้อมแสดง balance / shortage แบบ live" actions={canGenerate ? <button className="btn primary" type="button" onClick={() => setGenerateOpen(true)}><Icon name="plus" /><LocalizedText text={"Generate BOM"} /></button> : undefined} />
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search BOM, project or estimate…" /><Select label="Status" value={status} onChange={setStatus} options={["All status", "Draft", "Released", "Superseded"]} /><RefreshButton loading={endpoint.loading} reload={endpoint.reload} /></Toolbar>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      <ActionError message={actionError} />
      <Panel title={`${visible.length} BOM revisions`} subtitle={endpoint.loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"BOM"} /></th><th><LocalizedText text={"Project"} /></th><th><LocalizedText text={"Estimate"} /></th><th><LocalizedText text={"Lines"} /></th><th><LocalizedText text={"Budget"} /></th><th><LocalizedText text={"Created"} /></th><th><LocalizedText text={"Released"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Actions"} /></th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong><small className="muted"><LocalizedText text={"Rev."} /> {item.revision}</small></td><td><div className="cell-primary"><strong>{item.projectNumber}</strong><span>{item.projectName}</span></div></td><td>{item.estimateNumber} · R{item.estimateRevision}</td><td className="num">{item.lineCount}</td><td className="num">{money(item.bomBudget)}</td><td>{dateTime(item.createdAt)}<small className="muted">{item.createdByName}</small></td><td>{item.releasedAt ? <>{dateTime(item.releasedAt)}<small className="muted">{item.releasedByName}</small></> : "—"}</td><td><Badge>{item.status}</Badge></td><td><div className="table-actions"><button className="btn ghost sm" type="button" onClick={() => setSelectedId(item.id)}><Icon name="eye" /><LocalizedText text={"View"} /></button>{canRelease && item.status === "Draft" ? <button className="btn primary sm" type="button" onClick={() => { setActionError(""); setAction(item); }}><Icon name="lock" /><LocalizedText text={"Release"} /></button> : null}</div></td></tr>)}</tbody></table></div> : endpoint.loading ? <Loading /> : <EmptyState icon="layers" title="No BOM found" message="Generate BOM from a project whose estimate is approved or locked" />}
      </Panel>
      {selectedId ? <BomDetailModal id={selectedId} bootstrap={bootstrap} notify={notify} onClose={() => setSelectedId(null)} /> : null}
      {generateOpen ? <GenerateBomModal onClose={() => setGenerateOpen(false)} onCreated={(number) => { setGenerateOpen(false); notify(`${number} generated`); endpoint.reload(); }} /> : null}
      {action ? <CommentPrompt title={`Release ${action.number}`} description="หลัง release รายการจะถูก freeze และใช้เป็นฐานของ PR / MIR" confirmLabel="Release BOM" busy={actionBusy} onClose={() => setAction(null)} onConfirm={(comment) => { void release(comment); }} /> : null}
    </>
  );
}

function BomDetailModal({ id, bootstrap, notify, onClose }: { id: number; bootstrap: BootstrapData; notify: (message: string) => void; onClose: () => void }) {
  const endpoint = useEndpoint<BomWorkspace>(`/api/v1/boms/${id}`, { bom: { id, number: "", revision: 0, status: "", projectId: 0, projectNumber: "", projectName: "", estimateId: 0, estimateNumber: "", estimateRevision: 0, rowVersion: "", approvedMaterialBudget: 0 }, lines: [], modules: [] });
  const [reserveLine, setReserveLine] = useState<BomLine | null>(null);
  const canReserve = hasPermission(bootstrap, "procurement.request");
  return (
    <Modal title={endpoint.data.bom.number || "BOM workspace"} subtitle={endpoint.data.bom.projectNumber ? `${endpoint.data.bom.projectNumber} · ${endpoint.data.bom.projectName}` : "Loading from production API…"} size="xl" onClose={onClose} footer={<button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      {endpoint.loading && !endpoint.data.lines.length ? <Loading /> : endpoint.data.lines.length ? <><div className="kpi-grid four"><KpiCard label="Lines" value={endpoint.data.lines.length} icon="layers" tone="blue" /><KpiCard label="Approved budget" value={money(endpoint.data.bom.approvedMaterialBudget)} icon="chart" tone="violet" /><KpiCard label="Purchase required" value={quantity(endpoint.data.lines.reduce((sum, line) => sum + Number(line.purchaseRequired), 0))} icon="package" tone="amber" /><KpiCard label="Available" value={quantity(endpoint.data.lines.reduce((sum, line) => sum + Number(line.available), 0))} icon="database" tone="green" /></div><div className="table-wrap tall"><table><thead><tr><th><LocalizedText text={"Section / item"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Required"} /></th><th><LocalizedText text={"Available"} /></th><th><LocalizedText text={"Reserved"} /></th><th><LocalizedText text={"ขอซื้อแล้ว"} /></th><th><LocalizedText text={"Issued"} /></th><th><LocalizedText text={"Purchase required"} /></th><th><LocalizedText text={"Budget"} /></th><th><LocalizedText text={"Action"} /></th></tr></thead><tbody>{endpoint.data.lines.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode || line.estimateItemCode || "NON-STOCK"}</strong><small className="muted">{line.module} <LocalizedText text={"·"} /> {line.partNumber || "—"}</small></td><td>{line.description}<small className="muted">{line.ownerName}</small></td><td className="num">{quantity(line.quantityRequired)} {line.unit}</td><td className="num">{quantity(line.available)}</td><td className="num">{quantity(line.activeReserved)}</td><td className="num">{quantity(line.requested)}</td><td className="num">{quantity(line.netIssued)}</td><td className="num">{Number(line.purchaseRequired) > 0 ? <Badge tone="amber">{quantity(line.purchaseRequired)} {line.unit}</Badge> : <Badge tone="green"><LocalizedText text={"Covered"} /></Badge>}</td><td className="num">{money(line.budget)}</td><td>{canReserve && endpoint.data.bom.status === "Released" && line.itemId !== null && !line.nonStock && Number(line.available) > 0 ? <button className="btn ghost sm" type="button" onClick={() => setReserveLine(line)}><Icon name="lock" /><LocalizedText text={"Reserve"} /></button> : "—"}</td></tr>)}</tbody></table></div></> : !endpoint.error ? <EmptyState icon="layers" title="BOM has no lines" message="The linked estimate did not produce material lines" /> : null}
      {reserveLine ? <ReserveStockModal bomId={id} line={reserveLine} onClose={() => setReserveLine(null)} onReserved={(amount) => { setReserveLine(null); notify(`${quantity(amount)} ${reserveLine.unit} of ${reserveLine.itemCode} reserved`); endpoint.reload(); }} /> : null}
    </Modal>
  );
}

function ReserveStockModal({ bomId, line, onClose, onReserved }: { bomId: number; line: BomLine; onClose: () => void; onReserved: (amount: number) => void }) {
  const covered = Math.max(Number(line.allocated), Number(line.netIssued) + Number(line.activeReserved));
  const remainingDemand = Math.max(0, Number(line.quantityRequired) - Number(line.customerSuppliedQuantity) - covered);
  const maximum = Math.min(Number(line.available), remainingDemand);
  const [amount, setAmount] = useState(maximum);
  const [requiredDate, setRequiredDate] = useState(isoDate(7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/boms/${bomId}/reservations`, body({ bomLineId: line.id, quantity: amount, requiredDate: requiredDate || null }));
      onReserved(amount);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={`Reserve ${line.itemCode}`} subtitle={`${quantity(line.available)} ${line.unit} available · ${quantity(remainingDemand)} remaining BOM demand`} size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || amount <= 0 || amount > maximum} onClick={() => { void submit(); }}><Icon name="lock" />{busy ? "Reserving…" : "Reserve stock"}</button></>}><ActionError message={error} /><Field label="Quantity"><input type="number" min="0.0001" max={maximum} step="0.0001" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></Field><Field label="Required date"><input type="date" value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} /></Field></Modal>;
}

function GenerateBomModal({ onClose, onCreated }: { onClose: () => void; onCreated: (number: string) => void }) {
  // Every project in scope (the paged list stops at 100), newest number first.
  const projects = useEndpoint<ProjectPage>(projectOverviewPath(true), { items: [] });
  const projectChoices = useMemo(() => [...projects.data.items].sort(newestProjectFirst), [projects.data.items]);
  const [projectId, setProjectId] = useState(0);
  const effectiveProjectId = projectId || projectChoices[0]?.id || 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const created = await apiRequest<{ number: string }>("/api/v1/boms/", body({ projectId: effectiveProjectId }));
      onCreated(created.number);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Generate production BOM" subtitle="ระบบจะคัดลอกรายการจาก Estimate revision ที่อนุมัติและล็อกแล้วของ Project เพียงครั้งเดียว" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !effectiveProjectId} onClick={() => { void submit(); }}><Icon name="layers" />{busy ? "Generating…" : "Generate BOM"}</button></>}>
      {projects.error ? <LoadError message={projects.error} retry={projects.reload} /> : null}
      <ActionError message={error} />
      <Field label="Project"><select value={effectiveProjectId} disabled={projects.loading} onChange={(event) => setProjectId(Number(event.target.value))}><option value={0}><LocalizedText text={"Select project…"} /></option>{projectChoices.map((project) => <option key={project.id} value={project.id}>{project.number} <LocalizedText text={"·"} /> {project.name} ({project.status}<LocalizedText text={")"} /></option>)}</select></Field>
      {!projects.loading && !projects.data.items.length ? <EmptyState icon="folder" title="No project available" message="Create a project from an approved or locked estimate first" /> : null}
    </Modal>
  );
}

type PrAction = { item: PurchaseRequisition; decision: "Approve" | "Reject" };
const PR_KIND_TONE = { Planned: "blue", Substitute: "violet", Unplanned: "amber" } as const;
const PR_KIND_LABEL = { Planned: "ตรงแผน", Substitute: "ทดแทน", Unplanned: "นอกแผน" } as const;
// The database keeps "Converted to PO"; the order itself is raised in the company ERP.
const prStatusLabel = (status: string) => status === "Converted to PO" ? "Ordered in ERP" : status;

export function ProductionPurchaseRequisitions({ bootstrap, notify }: MaterialScreenProps) {
  const uiText = useUiText();
  const endpoint = useEndpoint<PurchaseRequisition[]>("/api/v1/purchase-requisitions/", EMPTY);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [creating, setCreating] = useState(false);
  const boms = useEndpoint<BomSummary[]>(creating ? "/api/v1/boms/" : null, EMPTY);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [decision, setDecision] = useState<PrAction | null>(null);
  const [orderItem, setOrderItem] = useState<PurchaseRequisition | null>(null);
  const [cancelItem, setCancelItem] = useState<PurchaseRequisition | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const canRequest = hasPermission(bootstrap, "procurement.request");
  const canApprove = hasPermission(bootstrap, "procurement.approve");
  const canOrder = hasPermission(bootstrap, "procurement.order");
  // Every held role counts, as on the server: an approver by additional role must see the buttons too.
  const roles = bootstrap.user.roles;
  const isAdmin = roles.includes("Admin");
  const visible = useMemo(() => endpoint.data.filter((item) => (status === "All status" || item.status === status)
    && (!search.trim() || contains(`${item.number} ${item.projectNumber} ${item.projectName} ${item.bomNumber} ${item.requestedByName} ${item.erpPoRef ?? ""}`, search))), [endpoint.data, search, status]);

  const submit = async (item: PurchaseRequisition) => {
    if (!window.confirm(`${uiText("Submit")} ${item.number}?`)) return;
    setBusyId(item.id); setActionError("");
    try {
      await apiRequest(`/api/v1/purchase-requisitions/${item.id}/submit`, body({ rowVersion: item.rowVersion, comment: "Submitted from production workspace" }));
      notify(`${item.number} submitted for approval`);
      endpoint.reload();
    } catch (error) { setActionError(toError(error)); }
    finally { setBusyId(null); }
  };

  const decide = async (comment: string) => {
    if (!decision) return;
    setBusyId(decision.item.id); setActionError("");
    try {
      const result = await apiRequest<{ status: string }>(`/api/v1/purchase-requisitions/${decision.item.id}/decide`, body({ decision: decision.decision, comment }));
      notify(`${decision.item.number}: ${result.status}`);
      setDecision(null);
      endpoint.reload();
    } catch (error) { setActionError(toError(error)); }
    finally { setBusyId(null); }
  };

  const cancel = async (reason: string) => {
    if (!cancelItem) return;
    setBusyId(cancelItem.id); setActionError("");
    try {
      await apiRequest(`/api/v1/purchase-requisitions/${cancelItem.id}/cancel`, body({ rowVersion: cancelItem.rowVersion, reason: reason || undefined }));
      notify(`${cancelItem.number}: ${uiText("Cancelled")}`);
      setCancelItem(null);
      endpoint.reload();
    } catch (error) { setActionError(toError(error)); }
    finally { setBusyId(null); }
  };

  if (creating) return (
    <>
      <PageHeader eyebrow="PROCURE TO PAY" title={uiText("Purchase Requisitions")} subtitle="สร้าง PR จาก BOM ที่ release แล้ว" />
      {boms.error ? <LoadError message={boms.error} retry={boms.reload} /> : null}
      {boms.loading && !boms.data.length ? <Loading /> : <PurchaseRequestEditor bootstrap={bootstrap} released={boms.data.filter((item) => item.status === "Released")}
        onClose={() => setCreating(false)} onCreated={(number) => { setCreating(false); notify(`${number} created`); endpoint.reload(); }} />}
    </>
  );

  return (
    <>
      <PageHeader eyebrow="PROCURE TO PAY" title={uiText("Purchase Requisitions")} subtitle="ขอซื้อจาก BOM อนุมัติตามงบของ Module แล้วฝ่ายจัดซื้อเลือก Supplier และออก PO ใน ERP" actions={canRequest ? <button className="btn primary" type="button" onClick={() => setCreating(true)}><Icon name="plus" /><LocalizedText text={"New PR"} /></button> : undefined} />
      <HistoricalPrPanel canImport={canRequest} notify={notify} />
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search PR, project, BOM or requester…" /><Select label="Status" value={status} onChange={setStatus} options={["All status", "Draft", "In Approval", "Approved", "Converted to PO", "Rejected"]} /><RefreshButton loading={endpoint.loading} reload={endpoint.reload} /></Toolbar>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      <ActionError message={actionError} />
      <Panel title={`${visible.length} requisitions`} subtitle={endpoint.loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"PR"} /></th><th><LocalizedText text={"Project / BOM"} /></th><th><LocalizedText text={"Requester"} /></th><th><LocalizedText text={"Required"} /></th><th><LocalizedText text={"Lines"} /></th><th><LocalizedText text={"Amount"} /></th><th><LocalizedText text={"Supplier"} /></th><th><LocalizedText text={"Current step"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Actions"} /></th></tr></thead><tbody>{visible.map((item) => {
          const isCurrentApprover = item.status === "In Approval" && canApprove
            && item.requestedById !== bootstrap.user.id
            && (isAdmin || item.currentApproverId === bootstrap.user.id || (!item.currentApproverId && roles.includes(item.currentApproverRole ?? "")));
          const isOwnDraft = canRequest && item.status === "Draft" && (item.requestedById === bootstrap.user.id || isAdmin);
          const mix = [item.substituteLines ? `${uiText(PR_KIND_LABEL.Substitute)} ${item.substituteLines}` : "", item.unplannedLines ? `${uiText(PR_KIND_LABEL.Unplanned)} ${item.unplannedLines}` : ""].filter(Boolean).join(" · ");
          return <tr key={item.id}><td><strong className="mono">{item.number}</strong><small className="muted">{item.priority}</small></td><td><div className="cell-primary"><strong>{item.projectNumber}</strong><span>{item.projectName} <LocalizedText text={"·"} /> {item.bomNumber}</span></div></td><td>{item.requestedByName}</td><td>{date(item.requiredDate)}</td><td className="num">{item.lineCount}{mix ? <small className="muted">{mix}</small> : null}</td><td className="num"><strong>{money(item.amount)}</strong><small className="muted"><LocalizedText text={"Budget"} /> {money(item.estimateAmount)}</small></td><td>{item.missingSuppliers ? <Badge tone="amber">{uiText("รอจัดซื้อเลือก")} {item.missingSuppliers}</Badge> : <Badge tone="green"><LocalizedText text={"ครบแล้ว"} /></Badge>}</td><td>{item.currentStep || "—"}<small className="muted">{item.currentApproverName || item.currentApproverRole || ""}</small></td><td><Badge>{uiText(prStatusLabel(item.status))}</Badge>{item.erpPoRef ? <small className="muted mono">{item.erpPoRef}</small> : null}</td><td><div className="table-actions"><button className="btn ghost sm" type="button" onClick={() => setDetailId(item.id)}><Icon name="eye" /><LocalizedText text={"View"} /></button>{isOwnDraft ? <><button className="btn primary sm" type="button" disabled={busyId === item.id} onClick={() => { void submit(item); }}><Icon name="send" /><LocalizedText text={"Submit"} /></button><button className="btn ghost sm" type="button" disabled={busyId === item.id} onClick={() => { setActionError(""); setCancelItem(item); }}><Icon name="x" /><LocalizedText text={"Cancel PR"} /></button></> : null}{isCurrentApprover ? <><button className="btn success sm" type="button" disabled={busyId === item.id} onClick={() => setDecision({ item, decision: "Approve" })}><Icon name="check" /><LocalizedText text={"Approve"} /></button><button className="btn danger sm" type="button" disabled={busyId === item.id} onClick={() => setDecision({ item, decision: "Reject" })}><Icon name="x" /><LocalizedText text={"Reject"} /></button></> : null}{canOrder && item.status === "Approved" ? <button className="btn primary sm" type="button" onClick={() => setOrderItem(item)}><Icon name="truck" /><LocalizedText text={"บันทึก PO จาก ERP"} /></button> : null}</div></td></tr>;
        })}</tbody></table></div> : endpoint.loading ? <Loading /> : <EmptyState icon="package" title="No purchase requisition found" message="Release a BOM, then create a requisition for its shortage lines" />}
      </Panel>
      {detailId ? <PrDetailModal id={detailId} bootstrap={bootstrap} notify={notify} onChanged={endpoint.reload} onClose={() => setDetailId(null)} /> : null}
      {decision ? <CommentPrompt title={`${decision.decision}: ${decision.item.number}`} description={`${decision.item.currentStep || "Current approval step"} · ใส่เหตุผลเพื่อให้ audit trail ครบทุก approval rule`} confirmLabel={decision.decision} requireComment={decision.decision === "Reject"} busy={busyId === decision.item.id} error={actionError} onClose={() => { setDecision(null); setActionError(""); }} onConfirm={(comment) => { void decide(comment); }} /> : null}
      {cancelItem ? <CommentPrompt title={`${uiText("Cancel PR")} ${cancelItem.number}`} description="PR ร่างนี้จะถูกยกเลิก และไม่นับเป็น PR ที่ค้างอยู่ของ BOM อีก" confirmLabel={uiText("Cancel PR")} busy={busyId === cancelItem.id} error={actionError} onClose={() => { setCancelItem(null); setActionError(""); }} onConfirm={(reason) => { void cancel(reason); }} /> : null}
      {orderItem ? <ErpOrderModal item={orderItem} onClose={() => setOrderItem(null)} onOrdered={(reference) => { notify(`${orderItem.number}: ${reference}`); setOrderItem(null); endpoint.reload(); }} /> : null}
    </>
  );
}

const PR_DETAIL_PAGE = 100;

function PrDetailModal({ id, bootstrap, notify, onChanged, onClose }: { id: number; bootstrap: BootstrapData; notify: (message: string) => void; onChanged: () => void; onClose: () => void }) {
  const t = useUiText();
  const endpoint = useEndpoint<PurchaseRequisitionDetail | null>(`/api/v1/purchase-requisitions/${id}`, null);
  const detail = endpoint.data;
  const [page, setPage] = useState(1);
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [bulkSupplier, setBulkSupplier] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Purchasing chooses suppliers while the PR is in approval or approved; the engineer left them open.
  const canAssign = Boolean(detail) && hasPermission(bootstrap, "procurement.order") && ["In Approval", "Approved"].includes(detail?.purchaseRequisition.status ?? "");
  const lines = detail?.lines ?? [];
  const pageCount = Math.max(1, Math.ceil(lines.length / PR_DETAIL_PAGE));
  const currentPage = Math.min(page, pageCount);
  const shown = lines.slice((currentPage - 1) * PR_DETAIL_PAGE, currentPage * PR_DETAIL_PAGE);
  const supplierOf = (line: PurchaseRequisitionDetail["lines"][number]) => choices[line.id] ?? line.supplierId ?? 0;
  const changes = lines.filter((line) => choices[line.id] && choices[line.id] !== line.supplierId);
  const missing = lines.filter((line) => !supplierOf(line)).length;
  const applyBulk = () => setChoices((current) => ({ ...current, ...Object.fromEntries(lines.filter((line) => picked[line.id]).map((line) => [line.id, bulkSupplier])) }));
  const save = async () => {
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ assigned: number; missingSuppliers: number }>(`/api/v1/purchase-requisitions/${id}/suppliers`, { method: "PUT", body: JSON.stringify({ assignments: changes.map((line) => ({ lineId: line.id, supplierId: choices[line.id] })) }) });
      notify(`${detail?.purchaseRequisition.number}: ${result.assigned} · ${t("ยังไม่มี Supplier")} ${result.missingSuppliers}`);
      setChoices({}); setPicked({}); endpoint.reload(); onChanged();
    } catch (saveError) { setError(toError(saveError)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={detail?.purchaseRequisition.number || "Purchase requisition"} subtitle={detail ? `${detail.purchaseRequisition.priority} · Required ${date(detail.purchaseRequisition.requiredDate)}${detail.purchaseRequisition.erpPoRef ? ` · ERP ${detail.purchaseRequisition.erpPoRef}` : ""}` : "Loading from production API…"} size="xl" onClose={onClose}
      footer={<>{canAssign ? <button className="btn primary" type="button" disabled={busy || !changes.length} onClick={() => { void save(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : <>{t("บันทึก Supplier")} ({changes.length})</>}</button> : null}<button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button></>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      <ActionError message={error} />
      {endpoint.loading && !detail ? <Loading /> : detail ? <>
        {detail.ruleFlags.length ? <div className="callout warning" role="status"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"Approval rules triggered"} /></strong>{detail.ruleFlags.map((flag) => `${flag.text} (${flag.level === "management" ? "Engineering Manager" : "PM"})`).join(" · ")}</span></div> : null}
        {detail.modules.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Module"} /></th><th className="num"><LocalizedText text={"งบ Estimate"} /></th><th className="num"><LocalizedText text={"PR ก่อนหน้า"} /></th><th className="num"><LocalizedText text={"PR นี้"} /></th><th className="num"><LocalizedText text={"คงเหลือหลัง PR นี้"} /></th></tr></thead>
          <tbody>{detail.modules.map((module) => { const left = module.budget - module.requestedElsewhere - module.thisRequest; return <tr key={module.module}><td><strong>{module.module}</strong></td><td className="num">{money(module.budget)}</td><td className="num">{money(module.requestedElsewhere)}</td><td className="num">{money(module.thisRequest)}</td><td className="num">{left < 0 ? <Badge tone="red">{money(left)}</Badge> : money(left)}</td></tr>; })}</tbody></table></div> : null}
        {canAssign ? <div className="info-strip blue"><Icon name="truck" /><span><strong><LocalizedText text={"ฝ่ายจัดซื้อเลือก Supplier"} /></strong> {t("ยังไม่มี Supplier")} {missing}</span><span className="spacer" />
          <select value={bulkSupplier} onChange={(event) => setBulkSupplier(Number(event.target.value))} aria-label={t("Supplier")}><option value={0}>{t("Select…")}</option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select>
          <button className="btn ghost sm" type="button" disabled={!bulkSupplier || !lines.some((line) => picked[line.id])} onClick={applyBulk}><LocalizedText text={"ใช้กับรายการที่เลือก"} /></button></div> : null}
        <Panel title={`${detail.lines.length} lines`} subtitle="ประเภท ตรงแผน / ทดแทน / นอกแผน และ Module ที่ใช้งบ" flush><div className="table-wrap"><table><thead><tr>{canAssign ? <th><input type="checkbox" aria-label={t("เลือกทั้งหน้า")} checked={shown.length > 0 && shown.every((line) => picked[line.id])} onChange={(event) => setPicked((current) => ({ ...current, ...Object.fromEntries(shown.map((line) => [line.id, event.target.checked])) }))} /></th> : null}<th><LocalizedText text={"ประเภท"} /></th><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Module"} /></th><th><LocalizedText text={"Qty"} /></th><th><LocalizedText text={"Unit price"} /></th><th><LocalizedText text={"Total"} /></th><th><LocalizedText text={"Estimate"} /></th><th><LocalizedText text={"Supplier"} /></th></tr></thead><tbody>{shown.map((line) => <tr key={line.id}>
          {canAssign ? <td><input type="checkbox" checked={Boolean(picked[line.id])} onChange={(event) => setPicked((current) => ({ ...current, [line.id]: event.target.checked }))} aria-label={t("เลือกรายการนี้")} /></td> : null}
          <td><Badge tone={PR_KIND_TONE[line.lineType]}>{t(PR_KIND_LABEL[line.lineType])}</Badge>{line.lineType === "Substitute" && line.original ? <small className="muted"><LocalizedText text={"แทน"} /> {line.original.itemCode || line.original.description} × {quantity(line.coveredQuantity)} {line.original.unit}</small> : null}</td>
          <td><strong className="mono">{line.itemCode || line.partNumber || "—"}</strong><small className="muted">{[line.partNumber, line.brand].filter(Boolean).join(" · ")}</small></td>
          <td>{line.description}{line.remark ? <small className="muted">{line.remark}</small> : null}</td><td>{line.module}</td>
          <td className="num">{quantity(line.quantity)} {line.unit}</td><td className="num">{money(line.unitPrice)}</td><td className="num"><strong>{money(line.lineTotal)}</strong></td><td className="num">{money(line.estimateTotal)}</td>
          <td>{canAssign ? <select value={supplierOf(line)} onChange={(event) => setChoices((current) => ({ ...current, [line.id]: Number(event.target.value) }))} aria-label={t("Supplier")}><option value={0}>{t("Select…")}</option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select>
            : line.supplierName ?? <Badge tone="amber"><LocalizedText text={"รอจัดซื้อเลือก"} /></Badge>}</td>
        </tr>)}</tbody></table></div>
          {lines.length > PR_DETAIL_PAGE ? <Pagination page={currentPage} pageCount={pageCount} from={(currentPage - 1) * PR_DETAIL_PAGE + 1} to={Math.min(currentPage * PR_DETAIL_PAGE, lines.length)} total={lines.length} onPage={setPage} /> : null}</Panel>
        <Panel title="Approval route" subtitle="PM อนุมัติ แล้วฝ่ายจัดซื้อ · Engineering Manager เมื่อ Module เกินงบเกิน 10%" flush><div className="table-wrap"><table><thead><tr><th>#</th><th><LocalizedText text={"Step"} /></th><th><LocalizedText text={"Approver"} /></th><th><LocalizedText text={"Rule"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Decision"} /></th><th><LocalizedText text={"Comment"} /></th><th><LocalizedText text={"Acted"} /></th></tr></thead><tbody>{detail.steps.map((step) => <tr key={step.id}><td>{step.sequence}</td><td><strong>{step.name}</strong></td><td>{step.approverName || step.approverRole || "—"}</td><td>{step.ruleCode || "—"}</td><td><Badge>{step.status}</Badge></td><td>{step.decision || "—"}</td><td>{step.comment || "—"}</td><td>{dateTime(step.actedAt)}</td></tr>)}</tbody></table></div></Panel>
      </> : null}
    </Modal>
  );
}

/** The ERP raises the purchase order; Purchasing records its number here, which closes the requisition. */
function ErpOrderModal({ item, onClose, onOrdered }: { item: PurchaseRequisition; onClose: () => void; onOrdered: (reference: string) => void }) {
  const t = useUiText();
  const [reference, setReference] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/purchase-requisitions/${item.id}/erp-order`, body({ rowVersion: item.rowVersion, erpPoRef: reference.trim(), comment: comment.trim() || undefined }));
      onOrdered(reference.trim());
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={`${t("บันทึก PO จาก ERP")} ${item.number}`} subtitle="ออก PO ในระบบ ERP แล้วใส่เลข PO ที่นี่ (หลายใบคั่นด้วย , )" size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" onClick={() => { void submit(); }} disabled={busy || !reference.trim()}><Icon name="truck" />{busy ? <LocalizedText text={"Saving…"} /> : <LocalizedText text={"บันทึก PO จาก ERP"} />}</button></>}>
    <ActionError message={error} />
    {item.missingSuppliers ? <div className="callout warning" role="status"><Icon name="alertTriangle" /><span>{t("ยังไม่มี Supplier")} {item.missingSuppliers}</span></div> : null}
    <Field label="เลข PO ใน ERP"><input maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="PO-2026-0001" /></Field>
    <Field label="Comment / note"><textarea rows={3} maxLength={20_000} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
  </Modal>;
}

export function ProductionPurchaseOrders({ bootstrap, notify }: MaterialScreenProps) {
  const uiText = useUiText();
  const endpoint = useEndpoint<PurchaseOrder[]>("/api/v1/purchase-orders/", EMPTY);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("Open orders");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [receiveId, setReceiveId] = useState<number | null>(null);
  const canReceive = hasPermission(bootstrap, "inventory.receive");
  const visible = useMemo(() => endpoint.data.filter((item) => (scope === "All orders" || isOpenPurchaseOrder(item))
    && (!search.trim() || contains(`${item.number} ${item.purchaseRequisitionNumber} ${item.projectNumber} ${item.supplierName}`, search))), [endpoint.data, scope, search]);
  const totals = useMemo(() => ({
    ordered: visible.reduce((sum, item) => sum + Number(item.value), 0),
    open: visible.reduce((sum, item) => sum + Number(item.openValue), 0),
    outstandingUnits: visible.reduce((sum, item) => sum + Math.max(0, Number(item.orderedQuantity) - Number(item.receivedQuantity)), 0),
  }), [visible]);
  return (
    <>
      <PageHeader eyebrow="PROCURE TO PAY" title={uiText("Purchase Orders")} subtitle="PO สร้างจาก PR ที่อนุมัติแล้วเท่านั้น และยอดรับคำนวณจาก confirmed GRN" />
      <div className="kpi-grid three"><KpiCard label="Ordered value" value={money(totals.ordered)} icon="truck" tone="blue" /><KpiCard label="Open commitment" value={money(totals.open)} icon="chart" tone="amber" /><KpiCard label="Outstanding units" value={quantity(totals.outstandingUnits)} icon="package" tone="violet" /></div>
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search PO, PR, project or supplier…" /><Select label="Scope" value={scope} onChange={setScope} options={["Open orders", "All orders"]} /><RefreshButton loading={endpoint.loading} reload={endpoint.reload} /></Toolbar>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      <Panel title={`${visible.length} purchase orders`} subtitle={endpoint.loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"PO"} /></th><th><LocalizedText text={"PR / project"} /></th><th><LocalizedText text={"Supplier"} /></th><th><LocalizedText text={"Order date"} /></th><th><LocalizedText text={"Expected"} /></th><th><LocalizedText text={"Qty"} /></th><th><LocalizedText text={"Received"} /></th><th><LocalizedText text={"Value"} /></th><th><LocalizedText text={"Open"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Actions"} /></th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td><strong>{item.purchaseRequisitionNumber}</strong><small className="muted">{item.projectNumber}</small></td><td>{item.supplierName}</td><td>{date(item.orderDate)}</td><td>{date(item.expectedDate)}</td><td className="num">{quantity(item.orderedQuantity)}</td><td className="num">{quantity(item.receivedQuantity)}</td><td className="num">{money(item.value)}</td><td className="num"><strong>{money(item.openValue)}</strong></td><td><Badge>{item.status}</Badge></td><td><div className="table-actions"><button className="btn ghost sm" type="button" onClick={() => setDetailId(item.id)}><Icon name="eye" /><LocalizedText text={"View"} /></button>{canReceive && isOpenPurchaseOrder(item) ? <button className="btn primary sm" type="button" onClick={() => setReceiveId(item.id)}><Icon name="download" /><LocalizedText text={"Receive"} /></button> : null}</div></td></tr>)}</tbody></table></div> : endpoint.loading ? <Loading /> : <EmptyState icon="truck" title="No purchase order found" message="Approve a PR and convert it to a PO first" />}
      </Panel>
      {detailId ? <PoDetailModal id={detailId} onClose={() => setDetailId(null)} /> : null}
      {receiveId ? <CreateGrnModal purchaseOrderId={receiveId} onClose={() => setReceiveId(null)} onCreated={(number) => { setReceiveId(null); notify(`${number} recorded as draft`); endpoint.reload(); }} /> : null}
    </>
  );
}

function PoDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const endpoint = useEndpoint<PurchaseOrderDetail | null>(`/api/v1/purchase-orders/${id}`, null);
  const detail = endpoint.data;
  return (
    <Modal title={detail?.purchaseOrder.number || "Purchase order"} subtitle={detail ? `${detail.purchaseOrder.supplierName} · ${detail.purchaseOrder.projectNumber}` : "Loading from production API…"} size="xl" onClose={onClose} footer={<button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      {endpoint.loading && !detail ? <Loading /> : detail ? <><div className="kpi-grid four"><KpiCard label="Lines" value={detail.lines.length} icon="package" tone="blue" /><KpiCard label="Ordered units" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.orderedQuantity), 0))} icon="truck" tone="violet" /><KpiCard label="Received units" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.previouslyReceived), 0))} icon="download" tone="green" /><KpiCard label="Outstanding units" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.outstandingQuantity), 0))} icon="clock" tone="amber" /></div><div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Ordered"} /></th><th><LocalizedText text={"Previously received"} /></th><th><LocalizedText text={"Outstanding"} /></th><th><LocalizedText text={"Unit price"} /></th><th><LocalizedText text={"Line value"} /></th><th><LocalizedText text={"Default location"} /></th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.partNumber}</small></td><td>{line.description}</td><td className="num">{quantity(line.orderedQuantity)} {line.unit}</td><td className="num">{quantity(line.previouslyReceived)}</td><td className="num">{Number(line.outstandingQuantity) > 0 ? <Badge tone="amber">{quantity(line.outstandingQuantity)}</Badge> : <Badge tone="green"><LocalizedText text={"Complete"} /></Badge>}</td><td className="num">{money(line.unitPrice)}</td><td className="num">{money(Number(line.orderedQuantity) * Number(line.unitPrice))}</td><td>{line.defaultLocation || "—"}</td></tr>)}</tbody></table></div></> : null}
    </Modal>
  );
}

type ReceiptLineDraft = {
  selected: boolean;
  received: number;
  accepted: number;
  damaged: number;
  rejected: number;
  location: string;
  qcStatus: string;
  lotNumber: string;
  serialNumber: string;
  allowOverReceipt: boolean;
  remark: string;
};

function CreateGrnModal({ purchaseOrderId, onClose, onCreated }: { purchaseOrderId: number; onClose: () => void; onCreated: (number: string) => void }) {
  const localizeCopy = useStaticCopy();
  const endpoint = useEndpoint<PurchaseOrderDetail | null>(`/api/v1/purchase-orders/${purchaseOrderId}`, null);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [receivedDate, setReceivedDate] = useState(isoDate());
  const [lines, setLines] = useState<Record<number, ReceiptLineDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const defaultLine = (line: PurchaseOrderDetail["lines"][number]): ReceiptLineDraft => ({
    selected: Number(line.outstandingQuantity) > 0,
    received: Number(line.outstandingQuantity),
    accepted: Number(line.outstandingQuantity),
    damaged: 0,
    rejected: 0,
    location: line.defaultLocation || "RECEIVING",
    qcStatus: "Passed",
    lotNumber: "",
    serialNumber: "",
    allowOverReceipt: false,
    remark: "",
  });
  const draftFor = (line: PurchaseOrderDetail["lines"][number]) => lines[line.id] ?? defaultLine(line);
  const updateLine = (line: PurchaseOrderDetail["lines"][number], patch: Partial<ReceiptLineDraft>) => setLines((current) => ({ ...current, [line.id]: { ...defaultLine(line), ...current[line.id], ...patch } }));
  const selectedCount = endpoint.data?.lines.filter((line) => { const draft = draftFor(line); return draft.selected && draft.received > 0; }).length ?? 0;
  const invalidSplit = endpoint.data?.lines.some((line) => { const draft = draftFor(line); return draft.selected && Math.abs(draft.accepted + draft.damaged + draft.rejected - draft.received) > 0.00001; }) ?? false;
  const submit = async () => {
    if (!endpoint.data) return;
    const selectedLines = endpoint.data.lines.flatMap((line) => {
      const draft = draftFor(line);
      if (!draft.selected || draft.received <= 0) return [];
      return [{
        purchaseOrderLineId: line.id,
        receivedQuantity: draft.received,
        acceptedQuantity: draft.accepted,
        damagedQuantity: draft.damaged,
        rejectedQuantity: draft.rejected,
        qcStatus: draft.qcStatus,
        lotNumber: draft.lotNumber || undefined,
        serialNumber: draft.serialNumber || undefined,
        location: draft.location,
        projectAllocationId: line.itemId ? endpoint.data?.purchaseOrder.projectId : null,
        allowOverReceipt: draft.allowOverReceipt,
        remark: draft.remark || undefined,
      }];
    });
    setBusy(true); setError("");
    try {
      const created = await apiRequest<{ number: string }>("/api/v1/goods-receipts/", body({ purchaseOrderId, deliveryNote: deliveryNote || undefined, receivedDate, lines: selectedLines }));
      onCreated(created.number);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Receive ${endpoint.data?.purchaseOrder.number || "purchase order"}`} subtitle="บันทึกเป็น Draft ก่อน; stock ledger จะเปลี่ยนเมื่อกด Confirm GRN เท่านั้น" size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !selectedCount || invalidSplit} onClick={() => { void submit(); }}><Icon name="download" />{busy ? "Recording…" : `Record draft GRN (${selectedCount} lines)`}</button></>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      <ActionError message={error} />
      <div className="form-grid two"><Field label="Delivery note"><input maxLength={200} value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} placeholder={localizeCopy("Supplier delivery note")} /></Field><Field label="Received date"><input type="date" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} /></Field></div>
      {invalidSplit ? <div className="callout warning" role="status"><Icon name="alertTriangle" /><span><strong><LocalizedText text={"Quantity split mismatch"} /></strong><LocalizedText text={"Accepted + damaged + rejected ต้องเท่ากับ received quantity ในทุกบรรทัด"} /></span></div> : null}
      {endpoint.loading ? <Loading /> : endpoint.data?.lines.length ? <div className="table-wrap tall"><table><thead><tr><th><LocalizedText text={"Use"} /></th><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Outstanding"} /></th><th><LocalizedText text={"Received"} /></th><th><LocalizedText text={"Accepted"} /></th><th><LocalizedText text={"Damaged"} /></th><th><LocalizedText text={"Rejected"} /></th><th><LocalizedText text={"Location"} /></th><th><LocalizedText text={"QC"} /></th><th><LocalizedText text={"Over"} /></th></tr></thead><tbody>{endpoint.data.lines.map((line) => {
        const draft = draftFor(line);
        const setReceived = (value: number) => updateLine(line, { received: value, accepted: value, damaged: 0, rejected: 0 });
        return <tr key={line.id}><td><input type="checkbox" checked={draft.selected} disabled={Number(line.outstandingQuantity) <= 0} onChange={(event) => updateLine(line, { selected: event.target.checked })} aria-label={`Receive ${line.itemCode}`} /></td><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.description} <LocalizedText text={"·"} /> {line.unit}</small></td><td className="num">{quantity(line.outstandingQuantity)}</td><td><input style={{ width: 88 }} type="number" min="0" step="0.0001" disabled={!draft.selected} value={draft.received} onChange={(event) => setReceived(Number(event.target.value))} /></td><td><input style={{ width: 88 }} type="number" min="0" step="0.0001" disabled={!draft.selected} value={draft.accepted} onChange={(event) => updateLine(line, { accepted: Number(event.target.value) })} /></td><td><input style={{ width: 88 }} type="number" min="0" step="0.0001" disabled={!draft.selected} value={draft.damaged} onChange={(event) => updateLine(line, { damaged: Number(event.target.value) })} /></td><td><input style={{ width: 88 }} type="number" min="0" step="0.0001" disabled={!draft.selected} value={draft.rejected} onChange={(event) => updateLine(line, { rejected: Number(event.target.value) })} /></td><td><input style={{ width: 120 }} maxLength={100} disabled={!draft.selected} value={draft.location} onChange={(event) => updateLine(line, { location: event.target.value })} /></td><td><select disabled={!draft.selected} value={draft.qcStatus} onChange={(event) => updateLine(line, { qcStatus: event.target.value })}><option value={"Passed"}><LocalizedText text={"Passed"} /></option><option value={"Pending"}><LocalizedText text={"Pending"} /></option><option value={"Failed"}><LocalizedText text={"Failed"} /></option></select></td><td><input type="checkbox" checked={draft.allowOverReceipt} disabled={!draft.selected} onChange={(event) => updateLine(line, { allowOverReceipt: event.target.checked, remark: event.target.checked ? "Approved over-receipt from production workspace" : "" })} aria-label={`Allow over receipt for ${line.itemCode}`} /></td></tr>;
      })}</tbody></table></div> : !endpoint.error ? <EmptyState icon="truck" title="No PO line" message="This purchase order has no receivable line" /> : null}
    </Modal>
  );
}

export function ProductionGoodsReceiving({ bootstrap, notify }: MaterialScreenProps) {
  const uiText = useUiText();
  const endpoint = useEndpoint<GoodsReceipt[]>("/api/v1/goods-receipts/", EMPTY);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [confirmItem, setConfirmItem] = useState<GoodsReceipt | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const canReceive = hasPermission(bootstrap, "inventory.receive");
  const visible = useMemo(() => endpoint.data.filter((item) => (status === "All status" || item.status === status)
    && (!search.trim() || contains(`${item.number} ${item.purchaseOrderNumber} ${item.supplierName} ${item.deliveryNote}`, search))), [endpoint.data, search, status]);
  const confirm = async (comment: string) => {
    if (!confirmItem) return;
    setBusyId(confirmItem.id); setActionError("");
    try {
      const result = await apiRequest<{ status: string; accepted: number; quarantined: number }>(`/api/v1/goods-receipts/${confirmItem.id}/confirm`, body({ rowVersion: confirmItem.rowVersion, comment }));
      notify(`${confirmItem.number} confirmed · ${quantity(result.accepted)} accepted · ${quantity(result.quarantined)} quarantined`);
      setConfirmItem(null);
      endpoint.reload();
    } catch (error) { setActionError(toError(error)); }
    finally { setBusyId(null); }
  };
  return (
    <>
      <PageHeader eyebrow="INBOUND MATERIAL" title={uiText("Goods Receiving")} subtitle="Draft GRN เก็บหลักฐานการรับ; Confirm จะ append stock / quarantine ledger แบบ idempotent" />
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search GRN, PO, supplier or delivery note…" /><Select label="Status" value={status} onChange={setStatus} options={["All status", "Draft", "Confirmed"]} /><RefreshButton loading={endpoint.loading} reload={endpoint.reload} /></Toolbar>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}<ActionError message={actionError} />
      <Panel title={`${visible.length} goods receipts`} subtitle={endpoint.loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th>GRN</th><th><LocalizedText text={"PO"} /></th><th><LocalizedText text={"Supplier"} /></th><th><LocalizedText text={"Delivery note"} /></th><th><LocalizedText text={"Received date"} /></th><th><LocalizedText text={"Received"} /></th><th><LocalizedText text={"Accepted"} /></th><th><LocalizedText text={"Held"} /></th><th><LocalizedText text={"Received by"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Actions"} /></th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td>{item.purchaseOrderNumber}</td><td>{item.supplierName}</td><td>{item.deliveryNote || "—"}</td><td>{date(item.receivedDate)}</td><td className="num">{quantity(item.receivedQuantity)}</td><td className="num">{quantity(item.acceptedQuantity)}</td><td className="num">{Number(item.heldQuantity) > 0 ? <Badge tone="amber">{quantity(item.heldQuantity)}</Badge> : "0"}</td><td>{item.receivedByName}<small className="muted">{item.confirmedByName ? `Confirmed by ${item.confirmedByName}` : ""}</small></td><td><Badge>{item.status}</Badge></td><td><div className="table-actions"><button className="btn ghost sm" type="button" onClick={() => setDetailId(item.id)}><Icon name="eye" /><LocalizedText text={"View"} /></button>{canReceive && item.status === "Draft" ? <button className="btn primary sm" type="button" disabled={busyId === item.id} onClick={() => { setActionError(""); setConfirmItem(item); }}><Icon name="check" /><LocalizedText text={"Confirm"} /></button> : null}</div></td></tr>)}</tbody></table></div> : endpoint.loading ? <Loading /> : <EmptyState icon="download" title="No goods receipt found" message="Open a purchase order and record the first delivery" />}
      </Panel>
      {detailId ? <GrnDetailModal id={detailId} onClose={() => setDetailId(null)} /> : null}
      {confirmItem ? <CommentPrompt title={`Confirm ${confirmItem.number}`} description="Accepted quantity จะเข้า usable stock ส่วน damaged / rejected จะเข้า quarantine" confirmLabel="Confirm receipt" busy={busyId === confirmItem.id} onClose={() => setConfirmItem(null)} onConfirm={(comment) => { void confirm(comment); }} /> : null}
    </>
  );
}

function GrnDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const endpoint = useEndpoint<GoodsReceiptDetail | null>(`/api/v1/goods-receipts/${id}`, null);
  const detail = endpoint.data;
  return (
    <Modal title={detail?.goodsReceipt.number || "Goods receipt"} subtitle={detail ? `${detail.goodsReceipt.purchaseOrderNumber} · ${detail.goodsReceipt.supplierName}` : "Loading from production API…"} size="xl" onClose={onClose} footer={<button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      {endpoint.loading && !detail ? <Loading /> : detail ? <><div className="kpi-grid four"><KpiCard label="Received" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.receivedQuantity), 0))} icon="download" tone="blue" /><KpiCard label="Accepted" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.acceptedQuantity), 0))} icon="checkCircle" tone="green" /><KpiCard label="Damaged" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.damagedQuantity), 0))} icon="alertTriangle" tone="amber" /><KpiCard label="Rejected" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.rejectedQuantity), 0))} icon="x" tone="red" /></div><div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Ordered"} /></th><th><LocalizedText text={"Previously"} /></th><th><LocalizedText text={"Received"} /></th><th><LocalizedText text={"Accepted"} /></th><th><LocalizedText text={"Held"} /></th><th><LocalizedText text={"Location"} /></th><th><LocalizedText text={"QC"} /></th><th><LocalizedText text={"Lot / serial"} /></th><th><LocalizedText text={"Outstanding"} /></th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.partNumber}</small></td><td>{line.description}</td><td className="num">{quantity(line.orderedQuantity)} {line.unit}</td><td className="num">{quantity(line.previouslyReceived)}</td><td className="num">{quantity(line.receivedQuantity)}</td><td className="num">{quantity(line.acceptedQuantity)}</td><td className="num">{quantity(Number(line.damagedQuantity) + Number(line.rejectedQuantity))}</td><td>{line.location}</td><td><Badge>{line.qcStatus}</Badge></td><td>{[line.lotNumber, line.serialNumber].filter(Boolean).join(" · ") || "—"}</td><td className="num">{quantity(line.outstandingAfter)}</td></tr>)}</tbody></table></div></> : null}
    </Modal>
  );
}

type MirAction = { item: MaterialIssue; kind: "Approve" | "Reject" | "Issue" | "Receipt" };

export function ProductionMaterialIssues({ bootstrap, notify }: MaterialScreenProps) {
  const uiText = useUiText();
  const endpoint = useEndpoint<MaterialIssue[]>("/api/v1/material-issues/", EMPTY);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [action, setAction] = useState<MirAction | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const canRequest = hasPermission(bootstrap, "procurement.request");
  const canApprove = hasPermission(bootstrap, "procurement.approve");
  const canIssue = hasPermission(bootstrap, "inventory.issue");
  const visible = useMemo(() => endpoint.data.filter((item) => (status === "All status" || item.status === status)
    && (!search.trim() || contains(`${item.number} ${item.projectNumber} ${item.projectName} ${item.requestedByName}`, search))), [endpoint.data, search, status]);
  const runAction = async (comment: string) => {
    if (!action) return;
    setBusyId(action.item.id); setActionError("");
    try {
      let result: { status: string };
      if (action.kind === "Approve" || action.kind === "Reject") {
        result = await apiRequest(`/api/v1/material-issues/${action.item.id}/decide`, body({ decision: action.kind, comment }));
      } else if (action.kind === "Issue") {
        result = await apiRequest(`/api/v1/material-issues/${action.item.id}/issue`, body({ rowVersion: action.item.rowVersion, comment }));
      } else {
        result = await apiRequest(`/api/v1/material-issues/${action.item.id}/receipt`, body({ rowVersion: action.item.rowVersion, comment }));
      }
      notify(`${action.item.number}: ${result.status}`);
      setAction(null);
      endpoint.reload();
    } catch (error) { setActionError(toError(error)); }
    finally { setBusyId(null); }
  };
  return (
    <>
      <PageHeader eyebrow="OUTBOUND MATERIAL" title={uiText("Material Issues")} subtitle="MIR คุม chain of custody ตั้งแต่ request, approval, issue, receipt ถึง return" actions={canRequest ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"New MIR"} /></button> : undefined} />
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search MIR, project or requester…" /><Select label="Status" value={status} onChange={setStatus} options={["All status", "Pending Approval", "Approved", "Picking", "Issued", "Received", "Rejected"]} /><RefreshButton loading={endpoint.loading} reload={endpoint.reload} /></Toolbar>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}<ActionError message={actionError} />
      <Panel title={`${visible.length} material issue requests`} subtitle={endpoint.loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th>MIR</th><th><LocalizedText text={"Project"} /></th><th><LocalizedText text={"Requester"} /></th><th><LocalizedText text={"Requested"} /></th><th><LocalizedText text={"Required"} /></th><th><LocalizedText text={"Lines"} /></th><th><LocalizedText text={"Qty requested"} /></th><th><LocalizedText text={"Issued"} /></th><th><LocalizedText text={"Returned"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Actions"} /></th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td><div className="cell-primary"><strong>{item.projectNumber}</strong><span>{item.projectName}</span></div></td><td>{item.requestedByName}</td><td>{dateTime(item.requestedAt)}</td><td>{date(item.requiredDate)}</td><td className="num">{item.lineCount}</td><td className="num">{quantity(item.requestedQuantity)}</td><td className="num">{quantity(item.issuedQuantity)}</td><td className="num">{quantity(item.returnedQuantity)}</td><td><Badge>{item.status}</Badge></td><td><div className="table-actions"><button className="btn ghost sm" type="button" onClick={() => setDetailId(item.id)}><Icon name="eye" /><LocalizedText text={"View"} /></button>{canApprove && item.status === "Pending Approval" && item.requestedById !== bootstrap.user.id ? <><button className="btn success sm" type="button" disabled={busyId === item.id} onClick={() => setAction({ item, kind: "Approve" })}><Icon name="check" /><LocalizedText text={"Approve"} /></button><button className="btn danger sm" type="button" disabled={busyId === item.id} onClick={() => setAction({ item, kind: "Reject" })}><Icon name="x" /><LocalizedText text={"Reject"} /></button></> : null}{canIssue && ["Approved", "Picking"].includes(item.status) ? <button className="btn primary sm" type="button" disabled={busyId === item.id} onClick={() => setAction({ item, kind: "Issue" })}><Icon name="upload" /><LocalizedText text={"Issue"} /></button> : null}{canRequest && item.status === "Issued" && (item.requestedById === bootstrap.user.id || bootstrap.user.role === "Admin") ? <button className="btn primary sm" type="button" disabled={busyId === item.id} onClick={() => setAction({ item, kind: "Receipt" })}><Icon name="checkCircle" /><LocalizedText text={"Confirm receipt"} /></button> : null}</div></td></tr>)}</tbody></table></div> : endpoint.loading ? <Loading /> : <EmptyState icon="upload" title="No material issue request found" message="Release a BOM and create the first material issue request" />}
      </Panel>
      {createOpen ? <CreateMirModal onClose={() => setCreateOpen(false)} onCreated={(number) => { setCreateOpen(false); notify(`${number} requested`); endpoint.reload(); }} /> : null}
      {detailId ? <MirDetailModal id={detailId} bootstrap={bootstrap} notify={notify} onChanged={endpoint.reload} onClose={() => setDetailId(null)} /> : null}
      {action ? <CommentPrompt title={`${action.kind}: ${action.item.number}`} description={action.kind === "Issue" ? "การ issue จะ debit stock ledger และ consume reservation ของ project" : action.kind === "Receipt" ? "ยืนยันว่าผู้ขอได้รับวัสดุจริงครบตาม MIR" : "ใส่เหตุผลเพื่อรองรับกรณีที่ระบบตรวจพบการขอเกินยอดคงเหลือของ BOM"} confirmLabel={action.kind === "Receipt" ? "Confirm receipt" : action.kind} requireComment={action.kind === "Reject"} busy={busyId === action.item.id} error={actionError} onClose={() => { setAction(null); setActionError(""); }} onConfirm={(comment) => { void runAction(comment); }} /> : null}
    </>
  );
}

type MirLineDraft = { selected: boolean; requested: number; location: string; purpose: string };

function CreateMirModal({ onClose, onCreated }: { onClose: () => void; onCreated: (number: string) => void }) {
  const localizeCopy = useStaticCopy();
  const boms = useEndpoint<BomSummary[]>("/api/v1/boms/", EMPTY);
  const released = boms.data.filter((item) => item.status === "Released");
  const [bomId, setBomId] = useState(0);
  const effectiveBomId = bomId || released[0]?.id || 0;
  const workspace = useEndpoint<BomWorkspace | null>(effectiveBomId ? `/api/v1/boms/${effectiveBomId}` : null, null);
  const [requiredDate, setRequiredDate] = useState(isoDate(1));
  const [purpose, setPurpose] = useState("");
  const [lines, setLines] = useState<Record<number, MirLineDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const defaultLine = (line: BomLine): MirLineDraft => ({ selected: false, requested: Math.max(0, Number(line.quantityRequired) - Number(line.customerSuppliedQuantity) - Number(line.netIssued)), location: "", purpose: "" });
  const draftFor = (line: BomLine) => lines[line.id] ?? defaultLine(line);
  const updateLine = (line: BomLine, patch: Partial<MirLineDraft>) => setLines((current) => ({ ...current, [line.id]: { ...defaultLine(line), ...current[line.id], ...patch } }));
  const selectedCount = workspace.data?.lines.filter((line) => { const draft = draftFor(line); return line.itemId !== null && !line.nonStock && draft.selected && draft.requested > 0; }).length ?? 0;
  const submit = async () => {
    if (!workspace.data) return;
    const selectedLines = workspace.data.lines.flatMap((line) => {
      const draft = draftFor(line);
      return draft.selected && draft.requested > 0 ? [{ bomLineId: line.id, requestedQuantity: draft.requested, location: draft.location || undefined, purpose: draft.purpose || purpose || undefined }] : [];
    });
    setBusy(true); setError("");
    try {
      const created = await apiRequest<{ number: string }>("/api/v1/material-issues/", body({ bomId: effectiveBomId, requiredDate, purpose: purpose || undefined, lines: selectedLines }));
      onCreated(created.number);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="New material issue request" subtitle="ขอเบิกได้เฉพาะ stock line ใน released BOM และไม่เกินยอดคงเหลือของ BOM" size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !selectedCount} onClick={() => { void submit(); }}><Icon name="send" />{busy ? "Requesting…" : `Request material (${selectedCount} lines)`}</button></>}>
      {boms.error || workspace.error ? <LoadError message={boms.error || workspace.error} retry={() => { boms.reload(); workspace.reload(); }} /> : null}<ActionError message={error} />
      <div className="form-grid two"><Field label="Released BOM"><select value={effectiveBomId} onChange={(event) => setBomId(Number(event.target.value))}><option value={0}><LocalizedText text={"Select BOM…"} /></option>{released.map((bom) => <option key={bom.id} value={bom.id}>{bom.number} <LocalizedText text={"·"} /> {bom.projectNumber} <LocalizedText text={"·"} /> {bom.projectName}</option>)}</select></Field><Field label="Required date"><input type="date" value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} /></Field><Field label="Purpose" span={2}><input maxLength={500} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder={localizeCopy("Installation, assembly, FAT, site work…")} /></Field></div>
      {workspace.loading ? <Loading /> : workspace.data ? <div className="table-wrap tall"><table><thead><tr><th><LocalizedText text={"Use"} /></th><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"BOM qty"} /></th><th><LocalizedText text={"Previously issued"} /></th><th><LocalizedText text={"Remaining"} /></th><th><LocalizedText text={"On hand"} /></th><th><LocalizedText text={"Available"} /></th><th><LocalizedText text={"Request qty"} /></th><th><LocalizedText text={"Location override"} /></th></tr></thead><tbody>{workspace.data.lines.filter((line) => line.itemId !== null && !line.nonStock).map((line) => {
        const draft = draftFor(line);
        const remaining = Math.max(0, Number(line.quantityRequired) - Number(line.customerSuppliedQuantity) - Number(line.netIssued));
        return <tr key={line.id}><td><input type="checkbox" checked={draft.selected} disabled={remaining <= 0} onChange={(event) => updateLine(line, { selected: event.target.checked })} aria-label={`Request ${line.itemCode}`} /></td><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.description} <LocalizedText text={"·"} /> {line.unit}</small></td><td className="num">{quantity(line.quantityRequired)}</td><td className="num">{quantity(line.netIssued)}</td><td className="num">{quantity(remaining)}</td><td className="num">{quantity(line.onHand)}</td><td className="num">{quantity(line.available)}</td><td><input style={{ width: 100 }} type="number" min="0" max={remaining} step="0.0001" disabled={!draft.selected} value={draft.requested} onChange={(event) => updateLine(line, { requested: Number(event.target.value) })} /></td><td><input style={{ width: 130 }} maxLength={100} disabled={!draft.selected} value={draft.location} onChange={(event) => updateLine(line, { location: event.target.value })} placeholder={localizeCopy("Use item default")} /></td></tr>;
      })}</tbody></table></div> : !released.length && !boms.loading ? <EmptyState icon="layers" title="No released BOM" message="Release a BOM before requesting material" /> : null}
    </Modal>
  );
}

function MirDetailModal({ id, bootstrap, notify, onChanged, onClose }: { id: number; bootstrap: BootstrapData; notify: (message: string) => void; onChanged: () => void; onClose: () => void }) {
  const endpoint = useEndpoint<MaterialIssueDetail | null>(`/api/v1/material-issues/${id}`, null);
  const [returnLine, setReturnLine] = useState<MaterialIssueDetail["lines"][number] | null>(null);
  const canReturn = hasPermission(bootstrap, "inventory.issue");
  const changed = () => { endpoint.reload(); onChanged(); };
  const detail = endpoint.data;
  return (
    <Modal title={detail?.materialIssue.number || "Material issue"} subtitle={detail ? `${detail.materialIssue.projectNumber} · ${detail.materialIssue.projectName}` : "Loading from production API…"} size="xl" onClose={onClose} footer={<button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      {endpoint.loading && !detail ? <Loading /> : detail ? <><div className="kpi-grid four"><KpiCard label="Requested" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.requestedQuantity), 0))} icon="send" tone="blue" /><KpiCard label="Issued" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.issuedQuantity), 0))} icon="upload" tone="violet" /><KpiCard label="Returned" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.returnedQuantity), 0))} icon="refresh" tone="green" /><KpiCard label="Net issued" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.netIssued), 0))} icon="database" tone="amber" /></div><div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"BOM qty"} /></th><th><LocalizedText text={"Previously"} /></th><th><LocalizedText text={"Requested"} /></th><th><LocalizedText text={"Issued"} /></th><th><LocalizedText text={"Returned"} /></th><th><LocalizedText text={"Net"} /></th><th><LocalizedText text={"On hand"} /></th><th><LocalizedText text={"Available"} /></th><th><LocalizedText text={"Location"} /></th><th><LocalizedText text={"Action"} /></th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.partNumber}</small></td><td>{line.description}</td><td className="num">{quantity(line.bomQuantity)} {line.unit}</td><td className="num">{quantity(line.previouslyIssued)}</td><td className="num">{quantity(line.requestedQuantity)}</td><td className="num">{quantity(line.issuedQuantity)}</td><td className="num">{quantity(line.returnedQuantity)}</td><td className="num"><strong>{quantity(line.netIssued)}</strong></td><td className="num">{quantity(line.onHand)}</td><td className="num">{quantity(line.available)}</td><td>{line.location}</td><td>{canReturn && ["Issued", "Received"].includes(detail.materialIssue.status) && Number(line.netIssued) > 0 ? <button className="btn ghost sm" type="button" onClick={() => setReturnLine(line)}><Icon name="refresh" /><LocalizedText text={"Return"} /></button> : "—"}</td></tr>)}</tbody></table></div><Panel title="Chain of custody"><div className="settings-list"><div><span className="setting-icon blue"><Icon name="user" /></span><span><strong><LocalizedText text={"Requested by"} /> {detail.materialIssue.requestedByName}</strong><small>{dateTime(detail.materialIssue.requestedAt)} <LocalizedText text={"· required"} /> {date(detail.materialIssue.requiredDate)}</small></span><Badge>{detail.materialIssue.status}</Badge></div>{detail.materialIssue.approvedByName ? <div><span className="setting-icon green"><Icon name="checkCircle" /></span><span><strong><LocalizedText text={"Approved by"} /> {detail.materialIssue.approvedByName}</strong><small>{dateTime(detail.materialIssue.approvedAt)}</small></span></div> : null}{detail.materialIssue.issuedByName ? <div><span className="setting-icon violet"><Icon name="upload" /></span><span><strong><LocalizedText text={"Issued by"} /> {detail.materialIssue.issuedByName}</strong><small>{dateTime(detail.materialIssue.issuedAt)}</small></span></div> : null}{detail.materialIssue.receivedByName ? <div><span className="setting-icon green"><Icon name="check" /></span><span><strong><LocalizedText text={"Received by"} /> {detail.materialIssue.receivedByName}</strong><small>{dateTime(detail.materialIssue.receivedAt)}</small></span></div> : null}</div></Panel></> : null}
      {returnLine ? <ReturnMaterialModal materialIssueId={id} line={returnLine} onClose={() => setReturnLine(null)} onReturned={(value) => { setReturnLine(null); notify(`${value} returned to stock`); changed(); }} /> : null}
    </Modal>
  );
}

function ReturnMaterialModal({ materialIssueId, line, onClose, onReturned }: { materialIssueId: number; line: MaterialIssueDetail["lines"][number]; onClose: () => void; onReturned: (message: string) => void }) {
  const localizeCopy = useStaticCopy();
  const returnable = Math.max(0, Number(line.issuedQuantity) - Number(line.returnedQuantity));
  const [amount, setAmount] = useState(returnable);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/material-issues/${materialIssueId}/returns`, body({ lineId: line.id, quantity: amount, reason }));
      onReturned(`${quantity(amount)} ${line.unit} of ${line.itemCode}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={`Return ${line.itemCode}`} subtitle={`${quantity(returnable)} ${line.unit} is currently returnable`} size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || amount <= 0 || amount > returnable || !reason.trim()} onClick={() => { void submit(); }}><Icon name="refresh" />{busy ? "Returning…" : "Return to stock"}</button></>}><ActionError message={error} /><Field label="Return quantity"><input type="number" min="0.0001" max={returnable} step="0.0001" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></Field><Field label="Reason"><textarea rows={3} maxLength={20_000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={localizeCopy("Unused material, wrong part, project complete…")} /></Field></Modal>;
}

type ApprovalAction = {
  source: "PR" | "MIR" | "ADJUSTMENT";
  id: number;
  number: string;
  decision: "Approve" | "Reject";
};

export function ProductionApprovals({ bootstrap, notify }: MaterialScreenProps) {
  const uiText = useUiText();
  const canProcurement = hasPermission(bootstrap, "procurement.approve");
  const canAdjust = hasPermission(bootstrap, "inventory.adjust");
  const prs = useEndpoint<PurchaseRequisition[]>(canProcurement ? "/api/v1/purchase-requisitions/?waitingForMe=true" : null, EMPTY);
  const mirs = useEndpoint<MaterialIssue[]>(canProcurement ? "/api/v1/material-issues/?status=Pending%20Approval" : null, EMPTY);
  const adjustments = useEndpoint<StockAdjustment[]>(canAdjust ? "/api/v1/stock-adjustments/?status=Pending%20Approval" : null, EMPTY);
  const [action, setAction] = useState<ApprovalAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reload = () => { prs.reload(); mirs.reload(); adjustments.reload(); };
  const total = prs.data.length + mirs.data.filter((item) => item.requestedById !== bootstrap.user.id).length
    + adjustments.data.filter((item) => item.requestedById !== bootstrap.user.id).length;
  const decide = async (comment: string) => {
    if (!action) return;
    setBusy(true); setError("");
    try {
      if (action.source === "PR") await apiRequest(`/api/v1/purchase-requisitions/${action.id}/decide`, body({ decision: action.decision, comment }));
      else if (action.source === "MIR") await apiRequest(`/api/v1/material-issues/${action.id}/decide`, body({ decision: action.decision, comment }));
      else await apiRequest(`/api/v1/stock-adjustments/${action.id}/decide`, body({ decision: action.decision, comment }));
      notify(`${action.number}: ${action.decision}`);
      setAction(null);
      reload();
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader eyebrow="CONTROL & GOVERNANCE" title={uiText("Approvals")} subtitle="แสดงเฉพาะรายการจริงที่ role / user ปัจจุบันมีสิทธิ์ตัดสินใจ และห้าม self-approval" actions={<RefreshButton loading={prs.loading || mirs.loading || adjustments.loading} reload={reload} />} />
      <div className="kpi-grid three"><KpiCard label="Waiting for me" value={total} icon="checkCircle" tone={total ? "amber" : "green"} /><KpiCard label="Purchase requisitions" value={prs.data.length} icon="package" tone="blue" /><KpiCard label="Stock controls" value={adjustments.data.length} note={`${mirs.data.length} material issue requests`} icon="shield" tone="violet" /></div>
      {prs.error || mirs.error || adjustments.error ? <LoadError message={prs.error || mirs.error || adjustments.error} retry={reload} /> : null}<ActionError message={error} />
      <Panel title="Purchase requisition approvals" subtitle="Approval route and current approver are calculated by the API" flush>
        {prs.data.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"PR"} /></th><th><LocalizedText text={"Project"} /></th><th><LocalizedText text={"Requester"} /></th><th><LocalizedText text={"Amount"} /></th><th><LocalizedText text={"Variance"} /></th><th><LocalizedText text={"Current step"} /></th><th><LocalizedText text={"Required"} /></th><th><LocalizedText text={"Actions"} /></th></tr></thead><tbody>{prs.data.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td>{item.projectNumber} <LocalizedText text={"·"} /> {item.projectName}</td><td>{item.requestedByName}</td><td className="num"><strong>{money(item.amount)}</strong></td><td>{Number(item.variancePercent) > 0 ? <Badge tone="amber">+{quantity(item.variancePercent)}%</Badge> : <Badge tone="green">{quantity(item.variancePercent)}%</Badge>}</td><td>{item.currentStep}<small className="muted">{item.currentApproverName || item.currentApproverRole}</small></td><td>{date(item.requiredDate)}</td><td><div className="table-actions"><button className="btn success sm" type="button" onClick={() => setAction({ source: "PR", id: item.id, number: item.number, decision: "Approve" })}><Icon name="check" /><LocalizedText text={"Approve"} /></button><button className="btn danger sm" type="button" onClick={() => setAction({ source: "PR", id: item.id, number: item.number, decision: "Reject" })}><Icon name="x" /><LocalizedText text={"Reject"} /></button></div></td></tr>)}</tbody></table></div> : prs.loading ? <Loading /> : <EmptyState icon="checkCircle" title="No purchase requisition waiting" message="ไม่มี PR ที่กำลังรอ user / role ปัจจุบัน" />}
      </Panel>
      <Panel title="Material issue approvals" subtitle="Requester cannot approve their own MIR" flush>
        {mirs.data.filter((item) => item.requestedById !== bootstrap.user.id).length ? <div className="table-wrap"><table><thead><tr><th>MIR</th><th><LocalizedText text={"Project"} /></th><th><LocalizedText text={"Requester"} /></th><th><LocalizedText text={"Required"} /></th><th><LocalizedText text={"Lines"} /></th><th><LocalizedText text={"Quantity"} /></th><th><LocalizedText text={"Actions"} /></th></tr></thead><tbody>{mirs.data.filter((item) => item.requestedById !== bootstrap.user.id).map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td>{item.projectNumber} <LocalizedText text={"·"} /> {item.projectName}</td><td>{item.requestedByName}</td><td>{date(item.requiredDate)}</td><td className="num">{item.lineCount}</td><td className="num">{quantity(item.requestedQuantity)}</td><td><div className="table-actions"><button className="btn success sm" type="button" onClick={() => setAction({ source: "MIR", id: item.id, number: item.number, decision: "Approve" })}><Icon name="check" /><LocalizedText text={"Approve"} /></button><button className="btn danger sm" type="button" onClick={() => setAction({ source: "MIR", id: item.id, number: item.number, decision: "Reject" })}><Icon name="x" /><LocalizedText text={"Reject"} /></button></div></td></tr>)}</tbody></table></div> : mirs.loading ? <Loading /> : <EmptyState icon="upload" title="No material issue waiting" message="ไม่มี MIR ที่รออนุมัติจากผู้ใช้ปัจจุบัน" />}
      </Panel>
      {canAdjust ? <Panel title="Stock adjustment approvals" subtitle="Stock changes only after Inventory Controller approval" flush>
        {adjustments.data.filter((item) => item.requestedById !== bootstrap.user.id).length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Adjustment"} /></th><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Current usable"} /></th><th><LocalizedText text={"Change"} /></th><th><LocalizedText text={"Reason"} /></th><th><LocalizedText text={"Requester"} /></th><th><LocalizedText text={"Actions"} /></th></tr></thead><tbody>{adjustments.data.filter((item) => item.requestedById !== bootstrap.user.id).map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td><strong>{item.itemCode}</strong><small className="muted">{item.description}</small></td><td className="num">{quantity(item.currentUsable)}</td><td className="num"><Badge tone={Number(item.quantityChange) >= 0 ? "green" : "red"}>{Number(item.quantityChange) >= 0 ? "+" : ""}{quantity(item.quantityChange)}</Badge></td><td>{item.reason}</td><td>{item.requestedByName}</td><td><div className="table-actions"><button className="btn success sm" type="button" onClick={() => setAction({ source: "ADJUSTMENT", id: item.id, number: item.number, decision: "Approve" })}><Icon name="check" /><LocalizedText text={"Approve"} /></button><button className="btn danger sm" type="button" onClick={() => setAction({ source: "ADJUSTMENT", id: item.id, number: item.number, decision: "Reject" })}><Icon name="x" /><LocalizedText text={"Reject"} /></button></div></td></tr>)}</tbody></table></div> : adjustments.loading ? <Loading /> : <EmptyState icon="database" title="No stock adjustment waiting" message="ไม่มี stock discrepancy ที่รอ Inventory Controller" />}
      </Panel> : null}
      {action ? <CommentPrompt title={`${action.decision}: ${action.number}`} description={`${action.source} decision · ข้อความจะถูกเก็บใน audit trail`} confirmLabel={action.decision} requireComment={action.decision === "Reject"} busy={busy} error={error} onClose={() => { setAction(null); setError(""); }} onConfirm={(comment) => { void decide(comment); }} /> : null}
    </>
  );
}

export function ProductionInventoryOperations({ bootstrap, notify }: MaterialScreenProps) {
  const adjustments = useEndpoint<StockAdjustment[]>("/api/v1/stock-adjustments/", EMPTY);
  const quarantine = useEndpoint<QuarantineItem[]>("/api/v1/quarantine/", EMPTY);
  const [tab, setTab] = useState<"adjustments" | "quarantine">("adjustments");
  const [createOpen, setCreateOpen] = useState(false);
  const [releaseItem, setReleaseItem] = useState<QuarantineItem | null>(null);
  const [decision, setDecision] = useState<{ item: StockAdjustment; decision: "Approve" | "Reject" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canReceive = hasPermission(bootstrap, "inventory.receive");
  const canAdjust = hasPermission(bootstrap, "inventory.adjust");
  const reload = () => { adjustments.reload(); quarantine.reload(); };
  const decide = async (comment: string) => {
    if (!decision) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/stock-adjustments/${decision.item.id}/decide`, body({ decision: decision.decision, comment }));
      notify(`${decision.item.number}: ${decision.decision}`);
      setDecision(null); reload();
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader eyebrow="INVENTORY CONTROL" title="Stock Operations" subtitle="Corrections use approval workflow; quarantine releases always carry an outcome and reason" actions={canReceive && tab === "adjustments" ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" /><LocalizedText text={"Request adjustment"} /></button> : undefined} />
      <div className="tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "adjustments"} className={tab === "adjustments" ? "tab active" : "tab"} onClick={() => setTab("adjustments")}><LocalizedText text={"Stock adjustments"} /> <em>{adjustments.data.length}</em></button><button type="button" role="tab" aria-selected={tab === "quarantine"} className={tab === "quarantine" ? "tab active" : "tab"} onClick={() => setTab("quarantine")}><LocalizedText text={"Quarantine"} /> <em>{quarantine.data.length}</em></button></div>
      {adjustments.error || quarantine.error ? <LoadError message={adjustments.error || quarantine.error} retry={reload} /> : null}<ActionError message={error} />
      {tab === "adjustments" ? <Panel title={`${adjustments.data.length} stock adjustments`} subtitle="Approved adjustments append a ledger event; balances are never edited directly" flush>{adjustments.data.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Adjustment"} /></th><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Current usable"} /></th><th><LocalizedText text={"Change"} /></th><th><LocalizedText text={"Reason"} /></th><th><LocalizedText text={"Requester"} /></th><th><LocalizedText text={"Approver"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Actions"} /></th></tr></thead><tbody>{adjustments.data.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td><strong>{item.itemCode}</strong><small className="muted">{item.partNumber} <LocalizedText text={"·"} /> {item.description}</small></td><td className="num">{quantity(item.currentUsable)}</td><td className="num"><Badge tone={Number(item.quantityChange) >= 0 ? "green" : "red"}>{Number(item.quantityChange) >= 0 ? "+" : ""}{quantity(item.quantityChange)}</Badge></td><td>{item.reason}</td><td>{item.requestedByName}</td><td>{item.approvedByName || "—"}</td><td><Badge>{item.status}</Badge></td><td>{canAdjust && item.status === "Pending Approval" && item.requestedById !== bootstrap.user.id ? <div className="table-actions"><button className="btn success sm" type="button" onClick={() => setDecision({ item, decision: "Approve" })}><Icon name="check" /><LocalizedText text={"Approve"} /></button><button className="btn danger sm" type="button" onClick={() => setDecision({ item, decision: "Reject" })}><Icon name="x" /><LocalizedText text={"Reject"} /></button></div> : "—"}</td></tr>)}</tbody></table></div> : adjustments.loading ? <Loading /> : <EmptyState icon="database" title="No stock adjustment" message="No discrepancy has been raised" />}</Panel> : <Panel title={`${quarantine.data.length} items on hold`} subtitle="Damaged / rejected receipts stay unavailable until an explicit decision" flush>{quarantine.data.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Item"} /></th><th><LocalizedText text={"Description"} /></th><th><LocalizedText text={"Brand"} /></th><th><LocalizedText text={"Held"} /></th><th><LocalizedText text={"Usable"} /></th><th><LocalizedText text={"Avg. cost"} /></th><th><LocalizedText text={"Held since"} /></th><th><LocalizedText text={"Action"} /></th></tr></thead><tbody>{quarantine.data.map((item) => <tr key={item.itemId}><td><strong className="mono">{item.itemCode}</strong><small className="muted">{item.partNumber}</small></td><td>{item.description}</td><td>{item.brand}</td><td className="num"><Badge tone="amber">{quantity(item.quarantineQuantity)} {item.unit}</Badge></td><td className="num">{quantity(item.usableQuantity)}</td><td className="num">{money(item.averageUnitCost)}</td><td>{dateTime(item.heldSince)}</td><td>{canAdjust ? <button className="btn primary sm" type="button" onClick={() => setReleaseItem(item)}><Icon name="shield" /><LocalizedText text={"Decide"} /></button> : "—"}</td></tr>)}</tbody></table></div> : quarantine.loading ? <Loading /> : <EmptyState icon="shield" title="Quarantine is clear" message="No damaged or rejected material is currently on hold" />}</Panel>}
      {createOpen ? <CreateAdjustmentModal onClose={() => setCreateOpen(false)} onCreated={(number) => { setCreateOpen(false); notify(`${number} requested`); adjustments.reload(); }} /> : null}
      {releaseItem ? <ReleaseQuarantineModal item={releaseItem} onClose={() => setReleaseItem(null)} onReleased={(message) => { setReleaseItem(null); notify(message); quarantine.reload(); }} /> : null}
      {decision ? <CommentPrompt title={`${decision.decision}: ${decision.item.number}`} description="Inventory Controller decision; requester cannot approve their own adjustment" confirmLabel={decision.decision} requireComment={decision.decision === "Reject"} busy={busy} error={error} onClose={() => { setDecision(null); setError(""); }} onConfirm={(comment) => { void decide(comment); }} /> : null}
    </>
  );
}

function CreateAdjustmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (number: string) => void }) {
  const localizeCopy = useStaticCopy();
  const inventory = useEndpoint<InventoryItem[]>("/api/v1/inventory/items", EMPTY);
  const [itemId, setItemId] = useState(0);
  const effectiveItemId = itemId || inventory.data[0]?.itemId || 0;
  const [quantityChange, setQuantityChange] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ number: string }>("/api/v1/stock-adjustments/", body({ itemId: effectiveItemId, quantityChange, reason }));
      onCreated(result.number);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title="Request stock adjustment" subtitle="คำขอนี้ยังไม่เปลี่ยน stock จนกว่า Inventory Controller จะอนุมัติ" size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !effectiveItemId || !quantityChange || !reason.trim()} onClick={() => { void submit(); }}><Icon name="send" />{busy ? "Requesting…" : "Request adjustment"}</button></>}>
    {inventory.error ? <LoadError message={inventory.error} retry={inventory.reload} /> : null}<ActionError message={error} />
    <Field label="Inventory item"><select value={effectiveItemId} onChange={(event) => setItemId(Number(event.target.value))}><option value={0}><LocalizedText text={"Select item…"} /></option>{inventory.data.map((item) => <option key={item.itemId} value={item.itemId}>{item.itemCode} <LocalizedText text={"·"} /> {item.description} <LocalizedText text={"(usable"} /> {quantity(item.usable)}<LocalizedText text={")"} /></option>)}</select></Field>
    <Field label="Quantity change"><input type="number" step="0.0001" value={quantityChange} onChange={(event) => setQuantityChange(Number(event.target.value))} /><small><LocalizedText text={"ใช้ค่าบวกเพื่อเพิ่ม และค่าลบเพื่อลด"} /></small></Field>
    <Field label="Reason"><textarea rows={4} maxLength={20_000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={localizeCopy("Cycle count discrepancy, damaged stock, correction…")} /></Field>
  </Modal>;
}

function ReleaseQuarantineModal({ item, onClose, onReleased }: { item: QuarantineItem; onClose: () => void; onReleased: (message: string) => void }) {
  const localizeCopy = useStaticCopy();
  const [amount, setAmount] = useState(Number(item.quarantineQuantity));
  const [outcome, setOutcome] = useState("Accept");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ reference: string }>("/api/v1/quarantine/release", body({ itemId: item.itemId, quantity: amount, outcome, reason }));
      onReleased(`${item.itemCode}: ${outcome} ${quantity(amount)} ${item.unit} · ${result.reference}`);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={`Quarantine decision: ${item.itemCode}`} subtitle={`${quantity(item.quarantineQuantity)} ${item.unit} is currently held`} size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || amount <= 0 || amount > Number(item.quarantineQuantity) || !reason.trim()} onClick={() => { void submit(); }}><Icon name="shield" />{busy ? <LocalizedText text={"Saving…"} /> : <LocalizedText text={"Record decision"} />}</button></>}>
    <ActionError message={error} />
    <Field label="Outcome"><select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value={"Accept"}><LocalizedText text={"Accept"} /></option><option value={"Return to Supplier"}><LocalizedText text={"Return to Supplier"} /></option><option value={"Scrap"}><LocalizedText text={"Scrap"} /></option></select></Field>
    <Field label="Quantity"><input type="number" min="0.0001" max={item.quarantineQuantity} step="0.0001" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></Field>
    <Field label="Reason"><textarea rows={4} maxLength={20_000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={localizeCopy("QC result and disposition reason")} /></Field>
  </Modal>;
}
