"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, type BootstrapData } from "../api-client";
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  KpiCard,
  Modal,
  PageHeader,
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
  onOrder: number;
  onOpenPr: number;
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
  lineCount: number;
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
  };
  lines: Array<{
    id: number;
    bomLineId: number;
    itemId: number | null;
    itemCode: string;
    partNumber: string;
    description: string;
    supplierId: number;
    supplierName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    estimateQuantity: number;
    estimatedUnitCost: number;
    priceSource: string;
    stockSnapshot: number;
    isUnplanned: boolean;
    buyDespiteStock: boolean;
    remark: string | null;
    lineTotal: number;
    estimateTotal: number;
    rowVersion: string;
    availableNow: number;
    variancePercent: number;
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
  budget: {
    approvedBudget: number;
    actualConsumed: number;
    openCommitment: number;
    reservedValue: number;
    siblingOpenPrValue: number;
    currentAmount: number;
    forecastBefore: number;
    forecastAfter: number;
    remainingAfter: number;
    withinBudget: boolean;
  };
  ruleFlags: Array<{ code: string; text: string }>;
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
  page: number;
  pageSize: number;
  total: number;
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
const money = (value: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(value));
const quantity = (value: number) => Number(value).toLocaleString("th-TH", { maximumFractionDigits: 4 });
const date = (value: string | null) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T00:00:00`)) : "—";
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const isoDate = (offsetDays = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const contains = (value: string, search: string) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
const hasPermission = (bootstrap: BootstrapData, permission: string) => bootstrap.permissions.includes(permission);
const isOpenPurchaseOrder = (item: PurchaseOrder) =>
  ["Ordered", "Partially Received"].includes(item.status)
  && Number(item.orderedQuantity) > Number(item.receivedQuantity);

function useEndpoint<T>(path: string | null, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const initialRef = useRef(initial);
  const pathRef = useRef(path);
  const requestRef = useRef(0);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const requestId = ++requestRef.current;
    const pathChanged = pathRef.current !== path;
    pathRef.current = path;
    const load = async () => {
      await Promise.resolve();
      if (requestRef.current !== requestId) return;
      if (pathChanged) setData(initialRef.current);
      if (!path) {
        setLoading(false);
        setError("");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const result = await apiRequest<T>(path);
        if (requestRef.current === requestId) setData(result);
      }
      catch (requestError) {
        if (requestRef.current === requestId) setError(toError(requestError));
      }
      finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    };
    void load();
    return () => {
      if (requestRef.current === requestId) requestRef.current += 1;
    };
  }, [path, revision]);

  return { data, loading, error, reload };
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="callout danger" role="alert">
      <Icon name="alertTriangle" />
      <span><strong>โหลดข้อมูลไม่สำเร็จ</strong>{message}</span>
      <button className="btn ghost" type="button" onClick={retry}><Icon name="refresh" />ลองใหม่</button>
    </div>
  );
}

function ActionError({ message }: { message: string }) {
  return message ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span><strong>ดำเนินการไม่สำเร็จ</strong>{message}</span></div> : null;
}

function Loading() {
  return <div className="empty"><span className="spinner" />Loading from production API…</div>;
}

function RefreshButton({ loading, reload }: { loading: boolean; reload: () => void }) {
  return <button className="btn ghost" type="button" disabled={loading} onClick={reload}><Icon name="refresh" />Refresh</button>;
}

function CommentPrompt({
  title,
  description,
  confirmLabel,
  requireComment,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  requireComment?: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");
  return (
    <Modal title={title} subtitle={description} size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" type="button" onClick={() => onConfirm(comment.trim())} disabled={busy || (requireComment && !comment.trim())}><Icon name="check" />{busy ? "Saving…" : confirmLabel}</button></>}>
      <Field label={requireComment ? "Comment (required)" : "Comment / note"}>
        <textarea rows={4} maxLength={20_000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="เหตุผลหรือข้อมูลประกอบสำหรับ audit trail" />
      </Field>
    </Modal>
  );
}

export function ProductionProcurementDashboard({ bootstrap }: MaterialScreenProps) {
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
      <PageHeader eyebrow="MATERIAL & PROCUREMENT" title="Procurement Dashboard" subtitle="ภาพรวมนี้คำนวณจาก BOM, PR, PO, GRN และ MIR จริงใน SQL Server" actions={<RefreshButton loading={loading} reload={reload} />} />
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
              <thead><tr><th>Document</th><th>Project / supplier</th><th>Stage</th><th>Value / quantity</th><th>Next action</th></tr></thead>
              <tbody>
                {prs.data.filter((item) => !["Converted to PO", "Rejected"].includes(item.status)).slice(0, 8).map((item) => <tr key={`pr-${item.id}`}><td><strong className="mono">{item.number}</strong><small className="muted">Purchase Requisition</small></td><td>{item.projectNumber} · {item.projectName}</td><td><Badge>{item.status}</Badge></td><td className="num">{money(item.amount)}</td><td>{item.currentStep || (item.status === "Draft" ? "Submit requisition" : "—")}</td></tr>)}
                {pos.data.filter(isOpenPurchaseOrder).slice(0, 8).map((item) => <tr key={`po-${item.id}`}><td><strong className="mono">{item.number}</strong><small className="muted">Purchase Order</small></td><td>{item.projectNumber} · {item.supplierName}</td><td><Badge>{item.status}</Badge></td><td className="num">{money(item.openValue)}</td><td>{item.expectedDate ? `Expected ${date(item.expectedDate)}` : "Set expected date"}</td></tr>)}
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
      <PageHeader eyebrow="MATERIAL CONTROL" title="Bill of Materials" subtitle="BOM ถูกสร้างจาก approved estimate และแสดง balance / shortage แบบ live" actions={canGenerate ? <button className="btn primary" type="button" onClick={() => setGenerateOpen(true)}><Icon name="plus" />Generate BOM</button> : undefined} />
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search BOM, project or estimate…" /><Select label="Status" value={status} onChange={setStatus} options={["All status", "Draft", "Released", "Superseded"]} /><RefreshButton loading={endpoint.loading} reload={endpoint.reload} /></Toolbar>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      <ActionError message={actionError} />
      <Panel title={`${visible.length} BOM revisions`} subtitle={endpoint.loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th>BOM</th><th>Project</th><th>Estimate</th><th>Lines</th><th>Budget</th><th>Created</th><th>Released</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong><small className="muted">Rev. {item.revision}</small></td><td><div className="cell-primary"><strong>{item.projectNumber}</strong><span>{item.projectName}</span></div></td><td>{item.estimateNumber} · R{item.estimateRevision}</td><td className="num">{item.lineCount}</td><td className="num">{money(item.bomBudget)}</td><td>{dateTime(item.createdAt)}<small className="muted">{item.createdByName}</small></td><td>{item.releasedAt ? <>{dateTime(item.releasedAt)}<small className="muted">{item.releasedByName}</small></> : "—"}</td><td><Badge>{item.status}</Badge></td><td><div className="table-actions"><button className="btn ghost sm" type="button" onClick={() => setSelectedId(item.id)}><Icon name="eye" />View</button>{canRelease && item.status === "Draft" ? <button className="btn primary sm" type="button" onClick={() => { setActionError(""); setAction(item); }}><Icon name="lock" />Release</button> : null}</div></td></tr>)}</tbody></table></div> : endpoint.loading ? <Loading /> : <EmptyState icon="layers" title="No BOM found" message="Generate BOM from a project whose estimate is approved" />}
      </Panel>
      {selectedId ? <BomDetailModal id={selectedId} bootstrap={bootstrap} notify={notify} onClose={() => setSelectedId(null)} /> : null}
      {generateOpen ? <GenerateBomModal onClose={() => setGenerateOpen(false)} onCreated={(number) => { setGenerateOpen(false); notify(`${number} generated`); endpoint.reload(); }} /> : null}
      {action ? <CommentPrompt title={`Release ${action.number}`} description="หลัง release รายการจะถูก freeze และใช้เป็นฐานของ PR / MIR" confirmLabel="Release BOM" busy={actionBusy} onClose={() => setAction(null)} onConfirm={(comment) => { void release(comment); }} /> : null}
    </>
  );
}

function BomDetailModal({ id, bootstrap, notify, onClose }: { id: number; bootstrap: BootstrapData; notify: (message: string) => void; onClose: () => void }) {
  const endpoint = useEndpoint<BomWorkspace>(`/api/v1/boms/${id}`, { bom: { id, number: "", revision: 0, status: "", projectId: 0, projectNumber: "", projectName: "", estimateId: 0, estimateNumber: "", estimateRevision: 0, rowVersion: "", approvedMaterialBudget: 0 }, lines: [] });
  const [reserveLine, setReserveLine] = useState<BomLine | null>(null);
  const canReserve = hasPermission(bootstrap, "procurement.request");
  return (
    <Modal title={endpoint.data.bom.number || "BOM workspace"} subtitle={endpoint.data.bom.projectNumber ? `${endpoint.data.bom.projectNumber} · ${endpoint.data.bom.projectName}` : "Loading from production API…"} size="xl" onClose={onClose} footer={<button className="btn ghost" type="button" onClick={onClose}>Close</button>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      {endpoint.loading && !endpoint.data.lines.length ? <Loading /> : endpoint.data.lines.length ? <><div className="kpi-grid four"><KpiCard label="Lines" value={endpoint.data.lines.length} icon="layers" tone="blue" /><KpiCard label="Approved budget" value={money(endpoint.data.bom.approvedMaterialBudget)} icon="chart" tone="violet" /><KpiCard label="Purchase required" value={quantity(endpoint.data.lines.reduce((sum, line) => sum + Number(line.purchaseRequired), 0))} icon="package" tone="amber" /><KpiCard label="Available" value={quantity(endpoint.data.lines.reduce((sum, line) => sum + Number(line.available), 0))} icon="database" tone="green" /></div><div className="table-wrap tall"><table><thead><tr><th>Section / item</th><th>Description</th><th>Required</th><th>Available</th><th>Reserved</th><th>On PO</th><th>Open PR</th><th>Issued</th><th>Purchase required</th><th>Budget</th><th>Action</th></tr></thead><tbody>{endpoint.data.lines.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode || line.estimateItemCode || "NON-STOCK"}</strong><small className="muted">{line.sectionCode} · {line.partNumber || "—"}</small></td><td>{line.description}<small className="muted">{line.ownerName}</small></td><td className="num">{quantity(line.quantityRequired)} {line.unit}</td><td className="num">{quantity(line.available)}</td><td className="num">{quantity(line.activeReserved)}</td><td className="num">{quantity(line.onOrder)}</td><td className="num">{quantity(line.onOpenPr)}</td><td className="num">{quantity(line.netIssued)}</td><td className="num">{Number(line.purchaseRequired) > 0 ? <Badge tone="amber">{quantity(line.purchaseRequired)} {line.unit}</Badge> : <Badge tone="green">Covered</Badge>}</td><td className="num">{money(line.budget)}</td><td>{canReserve && endpoint.data.bom.status === "Released" && line.itemId !== null && !line.nonStock && Number(line.available) > 0 ? <button className="btn ghost sm" type="button" onClick={() => setReserveLine(line)}><Icon name="lock" />Reserve</button> : "—"}</td></tr>)}</tbody></table></div></> : !endpoint.error ? <EmptyState icon="layers" title="BOM has no lines" message="The linked estimate did not produce material lines" /> : null}
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
  return <Modal title={`Reserve ${line.itemCode}`} subtitle={`${quantity(line.available)} ${line.unit} available · ${quantity(remainingDemand)} remaining BOM demand`} size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" type="button" disabled={busy || amount <= 0 || amount > maximum} onClick={() => { void submit(); }}><Icon name="lock" />{busy ? "Reserving…" : "Reserve stock"}</button></>}><ActionError message={error} /><Field label="Quantity"><input type="number" min="0.0001" max={maximum} step="0.0001" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></Field><Field label="Required date"><input type="date" value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} /></Field></Modal>;
}

function GenerateBomModal({ onClose, onCreated }: { onClose: () => void; onCreated: (number: string) => void }) {
  const projects = useEndpoint<ProjectPage>("/api/v1/projects/?page=1&pageSize=100", { items: [], page: 1, pageSize: 100, total: 0 });
  const [projectId, setProjectId] = useState(0);
  const effectiveProjectId = projectId || projects.data.items[0]?.id || 0;
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
    <Modal title="Generate production BOM" subtitle="ระบบจะ copy รายการจาก approved estimate revision ของ project เพียงครั้งเดียว" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" type="button" disabled={busy || !effectiveProjectId} onClick={() => { void submit(); }}><Icon name="layers" />{busy ? "Generating…" : "Generate BOM"}</button></>}>
      {projects.error ? <LoadError message={projects.error} retry={projects.reload} /> : null}
      <ActionError message={error} />
      <Field label="Project"><select value={effectiveProjectId} disabled={projects.loading} onChange={(event) => setProjectId(Number(event.target.value))}><option value={0}>Select project…</option>{projects.data.items.map((project) => <option key={project.id} value={project.id}>{project.number} · {project.name} ({project.status})</option>)}</select></Field>
      {!projects.loading && !projects.data.items.length ? <EmptyState icon="folder" title="No project available" message="Create a project from an approved estimate first" /> : null}
    </Modal>
  );
}

type PrAction = { item: PurchaseRequisition; decision: "Approve" | "Reject" | "Request Changes" };

export function ProductionPurchaseRequisitions({ bootstrap, notify }: MaterialScreenProps) {
  const endpoint = useEndpoint<PurchaseRequisition[]>("/api/v1/purchase-requisitions/", EMPTY);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [decision, setDecision] = useState<PrAction | null>(null);
  const [convertItem, setConvertItem] = useState<PurchaseRequisition | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const canRequest = hasPermission(bootstrap, "procurement.request");
  const canApprove = hasPermission(bootstrap, "procurement.approve");
  const canOrder = hasPermission(bootstrap, "procurement.order");
  const visible = useMemo(() => endpoint.data.filter((item) => (status === "All status" || item.status === status)
    && (!search.trim() || contains(`${item.number} ${item.projectNumber} ${item.projectName} ${item.bomNumber} ${item.requestedByName}`, search))), [endpoint.data, search, status]);

  const submit = async (item: PurchaseRequisition) => {
    if (!window.confirm(`Submit ${item.number} for approval?`)) return;
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

  return (
    <>
      <PageHeader eyebrow="PROCURE TO PAY" title="Purchase Requisitions" subtitle="PR, approval route, budget flags และการแปลงเป็น PO ทำงานผ่าน API / SQL จริง" actions={canRequest ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />New PR</button> : undefined} />
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search PR, project, BOM or requester…" /><Select label="Status" value={status} onChange={setStatus} options={["All status", "Draft", "In Approval", "Approved", "Converted to PO", "Rejected"]} /><RefreshButton loading={endpoint.loading} reload={endpoint.reload} /></Toolbar>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      <ActionError message={actionError} />
      <Panel title={`${visible.length} requisitions`} subtitle={endpoint.loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th>PR</th><th>Project / BOM</th><th>Requester</th><th>Required</th><th>Lines</th><th>Amount</th><th>Variance</th><th>Current step</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((item) => {
          const isCurrentApprover = item.status === "In Approval" && canApprove
            && item.requestedById !== bootstrap.user.id
            && (bootstrap.user.role === "Admin" || item.currentApproverId === bootstrap.user.id || (!item.currentApproverId && item.currentApproverRole === bootstrap.user.role));
          return <tr key={item.id}><td><strong className="mono">{item.number}</strong><small className="muted">{item.priority}</small></td><td><div className="cell-primary"><strong>{item.projectNumber}</strong><span>{item.projectName} · {item.bomNumber}</span></div></td><td>{item.requestedByName}</td><td>{date(item.requiredDate)}</td><td className="num">{item.lineCount}</td><td className="num"><strong>{money(item.amount)}</strong><small className="muted">Budget {money(item.estimateAmount)}</small></td><td>{Number(item.variancePercent) > 0 ? <Badge tone="amber">+{quantity(item.variancePercent)}%</Badge> : <Badge tone="green">{quantity(item.variancePercent)}%</Badge>}</td><td>{item.currentStep || "—"}<small className="muted">{item.currentApproverName || item.currentApproverRole || ""}</small></td><td><Badge>{item.status}</Badge></td><td><div className="table-actions"><button className="btn ghost sm" type="button" onClick={() => setDetailId(item.id)}><Icon name="eye" />View</button>{canRequest && item.status === "Draft" && (item.requestedById === bootstrap.user.id || bootstrap.user.role === "Admin") ? <button className="btn primary sm" type="button" disabled={busyId === item.id} onClick={() => { void submit(item); }}><Icon name="send" />Submit</button> : null}{isCurrentApprover ? <><button className="btn success sm" type="button" disabled={busyId === item.id} onClick={() => setDecision({ item, decision: "Approve" })}><Icon name="check" />Approve</button><button className="btn danger sm" type="button" disabled={busyId === item.id} onClick={() => setDecision({ item, decision: "Reject" })}><Icon name="x" />Reject</button></> : null}{canOrder && item.status === "Approved" ? <button className="btn primary sm" type="button" onClick={() => setConvertItem(item)}><Icon name="truck" />Create PO</button> : null}</div></td></tr>;
        })}</tbody></table></div> : endpoint.loading ? <Loading /> : <EmptyState icon="package" title="No purchase requisition found" message="Release a BOM, then create a requisition for its shortage lines" />}
      </Panel>
      {createOpen ? <CreatePrModal bootstrap={bootstrap} onClose={() => setCreateOpen(false)} onCreated={(number) => { setCreateOpen(false); notify(`${number} created`); endpoint.reload(); }} /> : null}
      {detailId ? <PrDetailModal id={detailId} onClose={() => setDetailId(null)} /> : null}
      {decision ? <CommentPrompt title={`${decision.decision}: ${decision.item.number}`} description={`${decision.item.currentStep || "Current approval step"} · ใส่เหตุผลเพื่อให้ audit trail ครบทุก approval rule`} confirmLabel={decision.decision} requireComment busy={busyId === decision.item.id} onClose={() => setDecision(null)} onConfirm={(comment) => { void decide(comment); }} /> : null}
      {convertItem ? <ConvertPrModal item={convertItem} onClose={() => setConvertItem(null)} onConverted={(count) => { notify(`${convertItem.number} converted to ${count} purchase order(s)`); setConvertItem(null); endpoint.reload(); }} /> : null}
    </>
  );
}

function PrDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const endpoint = useEndpoint<PurchaseRequisitionDetail | null>(`/api/v1/purchase-requisitions/${id}`, null);
  const detail = endpoint.data;
  return (
    <Modal title={detail?.purchaseRequisition.number || "Purchase requisition"} subtitle={detail ? `${detail.purchaseRequisition.priority} · Required ${date(detail.purchaseRequisition.requiredDate)}` : "Loading from production API…"} size="xl" onClose={onClose} footer={<button className="btn ghost" type="button" onClick={onClose}>Close</button>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      {endpoint.loading && !detail ? <Loading /> : detail ? <>
        <div className="kpi-grid four"><KpiCard label="PR value" value={money(detail.budget.currentAmount)} icon="package" tone="blue" /><KpiCard label="Approved budget" value={money(detail.budget.approvedBudget)} icon="chart" tone="violet" /><KpiCard label="Forecast after" value={money(detail.budget.forecastAfter)} icon="trendingUp" tone={detail.budget.withinBudget ? "green" : "red"} /><KpiCard label="Remaining" value={money(detail.budget.remainingAfter)} icon="database" tone={detail.budget.remainingAfter >= 0 ? "green" : "red"} /></div>
        {detail.ruleFlags.length ? <div className="callout warning" role="status"><Icon name="alertTriangle" /><span><strong>Approval rules triggered</strong>{detail.ruleFlags.map((flag) => flag.text).join(" · ")}</span></div> : null}
        <Panel title={`${detail.lines.length} requisition lines`} flush><div className="table-wrap"><table><thead><tr><th>Item</th><th>Description</th><th>Supplier</th><th>Qty</th><th>Unit price</th><th>Total</th><th>Estimate</th><th>Variance</th><th>Stock snapshot</th><th>Source</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.partNumber}</small></td><td>{line.description}</td><td>{line.supplierName}</td><td className="num">{quantity(line.quantity)} {line.unit}</td><td className="num">{money(line.unitPrice)}</td><td className="num"><strong>{money(line.lineTotal)}</strong></td><td className="num">{money(line.estimateTotal)}</td><td>{Number(line.variancePercent) > 0 ? <Badge tone="amber">+{quantity(line.variancePercent)}%</Badge> : <Badge tone="green">{quantity(line.variancePercent)}%</Badge>}</td><td className="num">{quantity(line.stockSnapshot)}</td><td>{line.priceSource}{line.buyDespiteStock ? <small className="muted">Buy despite stock</small> : null}</td></tr>)}</tbody></table></div></Panel>
        <Panel title="Approval route" subtitle="ทุก step มาจาก rule engine ของ API" flush><div className="table-wrap"><table><thead><tr><th>#</th><th>Step</th><th>Approver</th><th>Rule</th><th>Status</th><th>Decision</th><th>Comment</th><th>Acted</th></tr></thead><tbody>{detail.steps.map((step) => <tr key={step.id}><td>{step.sequence}</td><td><strong>{step.name}</strong></td><td>{step.approverName || step.approverRole || "—"}</td><td>{step.ruleCode || "—"}</td><td><Badge>{step.status}</Badge></td><td>{step.decision || "—"}</td><td>{step.comment || "—"}</td><td>{dateTime(step.actedAt)}</td></tr>)}</tbody></table></div></Panel>
      </> : null}
    </Modal>
  );
}

type PrLineDraft = {
  selected: boolean;
  supplierId: number;
  quantity: number;
  unitPrice: number;
  priceSource: string;
  isUnplanned: boolean;
  buyDespiteStock: boolean;
  remark: string;
};

function CreatePrModal({ bootstrap, onClose, onCreated }: { bootstrap: BootstrapData; onClose: () => void; onCreated: (number: string) => void }) {
  const boms = useEndpoint<BomSummary[]>("/api/v1/boms/", EMPTY);
  const released = boms.data.filter((item) => item.status === "Released");
  const [bomId, setBomId] = useState(0);
  const effectiveBomId = bomId || released[0]?.id || 0;
  const workspace = useEndpoint<BomWorkspace | null>(effectiveBomId ? `/api/v1/boms/${effectiveBomId}` : null, null);
  const [priority, setPriority] = useState("Normal");
  const [requiredDate, setRequiredDate] = useState(isoDate(14));
  const [purpose, setPurpose] = useState("");
  const [lines, setLines] = useState<Record<number, PrLineDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const defaultLine = (line: BomLine): PrLineDraft => ({
      selected: Number(line.purchaseRequired) > 0,
      supplierId: bootstrap.suppliers[0]?.id ?? 0,
      quantity: Math.max(0, Number(line.purchaseRequired)),
      unitPrice: Math.max(0, Number(line.estimatedUnitCost)),
      priceSource: "Price Library",
      isUnplanned: false,
      buyDespiteStock: false,
      remark: "",
  });
  const draftFor = (line: BomLine) => lines[line.id] ?? defaultLine(line);
  const updateLine = (line: BomLine, patch: Partial<PrLineDraft>) => setLines((current) => ({ ...current, [line.id]: { ...defaultLine(line), ...current[line.id], ...patch } }));
  const selectedCount = workspace.data?.lines.filter((line) => { const draft = draftFor(line); return draft.selected && draft.quantity > 0 && draft.supplierId > 0; }).length ?? 0;
  const invalidOverride = workspace.data?.lines.some((line) => {
    const draft = draftFor(line);
    if (!draft.selected || draft.quantity <= 0) return false;
    const needsUnplanned = draft.quantity > Number(line.purchaseRequired);
    const needsBuyDespiteStock = !line.nonStock && Number(line.available) >= draft.quantity;
    return (needsUnplanned && !draft.isUnplanned)
      || (needsBuyDespiteStock && !draft.buyDespiteStock)
      || ((draft.isUnplanned || draft.buyDespiteStock) && !draft.remark.trim());
  }) ?? false;
  const submit = async () => {
    if (!workspace.data) return;
    const selectedLines = workspace.data.lines.flatMap((line) => {
      const draft = draftFor(line);
      if (!draft.selected || draft.quantity <= 0 || draft.supplierId <= 0) return [];
      return [{
        bomLineId: line.id,
        supplierId: draft.supplierId,
        quantity: draft.quantity,
        unitPrice: draft.unitPrice,
        priceSource: draft.priceSource,
        isUnplanned: draft.isUnplanned,
        buyDespiteStock: draft.buyDespiteStock,
        remark: draft.remark || undefined,
        itemCodeOverride: line.itemCode || line.estimateItemCode || `NONSTOCK-${line.id}`,
      }];
    });
    setBusy(true); setError("");
    try {
      const created = await apiRequest<{ number: string }>("/api/v1/purchase-requisitions/", body({ bomId: effectiveBomId, priority, requiredDate, purpose: purpose || undefined, lines: selectedLines }));
      onCreated(created.number);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="New purchase requisition" subtitle="เลือก shortage จาก released BOM; API จะ validate stock, budget และ approval rules อีกครั้ง" size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" type="button" disabled={busy || !effectiveBomId || !selectedCount || invalidOverride || !bootstrap.suppliers.length} onClick={() => { void submit(); }}><Icon name="check" />{busy ? "Creating…" : `Create PR (${selectedCount} lines)`}</button></>}>
      {boms.error || workspace.error ? <LoadError message={boms.error || workspace.error} retry={() => { boms.reload(); workspace.reload(); }} /> : null}
      <ActionError message={error} />
      {invalidOverride ? <div className="callout warning" role="status"><Icon name="alertTriangle" /><span><strong>Override ยังไม่ครบ</strong>รายการเกิน shortage ต้องเลือก Unplanned; รายการที่ stock เพียงพอต้องเลือก Buy despite stock และทุก override ต้องมีเหตุผล</span></div> : null}
      {!bootstrap.suppliers.length ? <div className="callout warning" role="status"><Icon name="alertTriangle" /><span><strong>Supplier master is empty</strong>เพิ่ม supplier ใน Master Data ก่อนสร้าง PR</span></div> : null}
      <div className="form-grid two">
        <Field label="Released BOM"><select value={effectiveBomId} onChange={(event) => setBomId(Number(event.target.value))}><option value={0}>Select BOM…</option>{released.map((bom) => <option key={bom.id} value={bom.id}>{bom.number} · {bom.projectNumber} · {bom.projectName}</option>)}</select></Field>
        <Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Normal</option><option>High</option><option>Emergency</option></select></Field>
        <Field label="Required date"><input type="date" value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} /></Field>
        <Field label="Purpose"><input maxLength={500} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Project material / site requirement" /></Field>
      </div>
      {workspace.loading ? <Loading /> : workspace.data?.lines.length ? <div className="table-wrap tall"><table><thead><tr><th>Use</th><th>Item / description</th><th>Shortage</th><th>Available</th><th>Supplier</th><th>Qty</th><th>Unit price</th><th>Source</th><th>Override</th><th>Reason</th></tr></thead><tbody>{workspace.data.lines.map((line) => {
        const draft = draftFor(line);
        return <tr key={line.id} className={draft.selected ? undefined : "row-muted"}><td><input type="checkbox" checked={draft.selected} onChange={(event) => updateLine(line, { selected: event.target.checked })} aria-label={`Include ${line.description}`} /></td><td><strong className="mono">{line.itemCode || line.estimateItemCode || "NON-STOCK"}</strong><small className="muted">{line.description} · {line.unit}</small></td><td className="num">{quantity(line.purchaseRequired)}</td><td className="num">{quantity(line.available)}</td><td><select value={draft.supplierId} disabled={!draft.selected} onChange={(event) => updateLine(line, { supplierId: Number(event.target.value) })}><option value={0}>Select…</option>{bootstrap.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select></td><td><input style={{ width: 96 }} type="number" min="0" step="0.0001" disabled={!draft.selected} value={draft.quantity} onChange={(event) => updateLine(line, { quantity: Number(event.target.value) })} /></td><td><input style={{ width: 118 }} type="number" min="0" step="0.0001" disabled={!draft.selected} value={draft.unitPrice} onChange={(event) => updateLine(line, { unitPrice: Number(event.target.value) })} /></td><td><select value={draft.priceSource} disabled={!draft.selected} onChange={(event) => updateLine(line, { priceSource: event.target.value })}><option>Price Library</option><option>Supplier Quotation</option><option>Previous Purchase</option><option>Manual</option></select></td><td><label className="checkbox"><input type="checkbox" checked={draft.isUnplanned} disabled={!draft.selected} onChange={(event) => updateLine(line, { isUnplanned: event.target.checked })} /><span>Unplanned</span></label><label className="checkbox"><input type="checkbox" checked={draft.buyDespiteStock} disabled={!draft.selected} onChange={(event) => updateLine(line, { buyDespiteStock: event.target.checked })} /><span>Buy despite stock</span></label></td><td><input style={{ minWidth: 180 }} maxLength={20_000} disabled={!draft.selected} value={draft.remark} onChange={(event) => updateLine(line, { remark: event.target.value })} placeholder={draft.isUnplanned || draft.buyDespiteStock ? "Required reason" : "Optional note"} /></td></tr>;
      })}</tbody></table></div> : bomId && !workspace.error ? <EmptyState icon="layers" title="No BOM line available" message="This released BOM has no shortage or material line" /> : !released.length && !boms.loading ? <EmptyState icon="layers" title="No released BOM" message="Release a BOM before creating a requisition" /> : null}
    </Modal>
  );
}

function ConvertPrModal({ item, onClose, onConverted }: { item: PurchaseRequisition; onClose: () => void; onConverted: (count: number) => void }) {
  const [expectedDate, setExpectedDate] = useState(isoDate(14));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ purchaseOrders: Array<{ id: number; number: string }> }>(`/api/v1/purchase-requisitions/${item.id}/convert`, body({ rowVersion: item.rowVersion, expectedDate: expectedDate || null }));
      onConverted(result.purchaseOrders.length);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={`Create purchase orders from ${item.number}`} subtitle="ระบบจะแยก PO ตาม supplier และ lock PR revision ด้วย row version" size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" type="button" onClick={() => { void submit(); }} disabled={busy}><Icon name="truck" />{busy ? "Creating…" : "Create PO"}</button></>}><ActionError message={error} /><Field label="Expected delivery date"><input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></Field></Modal>;
}

export function ProductionPurchaseOrders({ bootstrap, notify }: MaterialScreenProps) {
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
      <PageHeader eyebrow="PROCURE TO PAY" title="Purchase Orders" subtitle="PO สร้างจาก PR ที่อนุมัติแล้วเท่านั้น และยอดรับคำนวณจาก confirmed GRN" />
      <div className="kpi-grid three"><KpiCard label="Ordered value" value={money(totals.ordered)} icon="truck" tone="blue" /><KpiCard label="Open commitment" value={money(totals.open)} icon="chart" tone="amber" /><KpiCard label="Outstanding units" value={quantity(totals.outstandingUnits)} icon="package" tone="violet" /></div>
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search PO, PR, project or supplier…" /><Select label="Scope" value={scope} onChange={setScope} options={["Open orders", "All orders"]} /><RefreshButton loading={endpoint.loading} reload={endpoint.reload} /></Toolbar>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      <Panel title={`${visible.length} purchase orders`} subtitle={endpoint.loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th>PO</th><th>PR / project</th><th>Supplier</th><th>Order date</th><th>Expected</th><th>Qty</th><th>Received</th><th>Value</th><th>Open</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td><strong>{item.purchaseRequisitionNumber}</strong><small className="muted">{item.projectNumber}</small></td><td>{item.supplierName}</td><td>{date(item.orderDate)}</td><td>{date(item.expectedDate)}</td><td className="num">{quantity(item.orderedQuantity)}</td><td className="num">{quantity(item.receivedQuantity)}</td><td className="num">{money(item.value)}</td><td className="num"><strong>{money(item.openValue)}</strong></td><td><Badge>{item.status}</Badge></td><td><div className="table-actions"><button className="btn ghost sm" type="button" onClick={() => setDetailId(item.id)}><Icon name="eye" />View</button>{canReceive && isOpenPurchaseOrder(item) ? <button className="btn primary sm" type="button" onClick={() => setReceiveId(item.id)}><Icon name="download" />Receive</button> : null}</div></td></tr>)}</tbody></table></div> : endpoint.loading ? <Loading /> : <EmptyState icon="truck" title="No purchase order found" message="Approve a PR and convert it to a PO first" />}
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
    <Modal title={detail?.purchaseOrder.number || "Purchase order"} subtitle={detail ? `${detail.purchaseOrder.supplierName} · ${detail.purchaseOrder.projectNumber}` : "Loading from production API…"} size="xl" onClose={onClose} footer={<button className="btn ghost" type="button" onClick={onClose}>Close</button>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      {endpoint.loading && !detail ? <Loading /> : detail ? <><div className="kpi-grid four"><KpiCard label="Lines" value={detail.lines.length} icon="package" tone="blue" /><KpiCard label="Ordered units" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.orderedQuantity), 0))} icon="truck" tone="violet" /><KpiCard label="Received units" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.previouslyReceived), 0))} icon="download" tone="green" /><KpiCard label="Outstanding units" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.outstandingQuantity), 0))} icon="clock" tone="amber" /></div><div className="table-wrap"><table><thead><tr><th>Item</th><th>Description</th><th>Ordered</th><th>Previously received</th><th>Outstanding</th><th>Unit price</th><th>Line value</th><th>Default location</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.partNumber}</small></td><td>{line.description}</td><td className="num">{quantity(line.orderedQuantity)} {line.unit}</td><td className="num">{quantity(line.previouslyReceived)}</td><td className="num">{Number(line.outstandingQuantity) > 0 ? <Badge tone="amber">{quantity(line.outstandingQuantity)}</Badge> : <Badge tone="green">Complete</Badge>}</td><td className="num">{money(line.unitPrice)}</td><td className="num">{money(Number(line.orderedQuantity) * Number(line.unitPrice))}</td><td>{line.defaultLocation || "—"}</td></tr>)}</tbody></table></div></> : null}
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
    <Modal title={`Receive ${endpoint.data?.purchaseOrder.number || "purchase order"}`} subtitle="บันทึกเป็น Draft ก่อน; stock ledger จะเปลี่ยนเมื่อกด Confirm GRN เท่านั้น" size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" type="button" disabled={busy || !selectedCount || invalidSplit} onClick={() => { void submit(); }}><Icon name="download" />{busy ? "Recording…" : `Record draft GRN (${selectedCount} lines)`}</button></>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      <ActionError message={error} />
      <div className="form-grid two"><Field label="Delivery note"><input maxLength={200} value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} placeholder="Supplier delivery note" /></Field><Field label="Received date"><input type="date" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} /></Field></div>
      {invalidSplit ? <div className="callout warning" role="status"><Icon name="alertTriangle" /><span><strong>Quantity split mismatch</strong>Accepted + damaged + rejected ต้องเท่ากับ received quantity ในทุกบรรทัด</span></div> : null}
      {endpoint.loading ? <Loading /> : endpoint.data?.lines.length ? <div className="table-wrap tall"><table><thead><tr><th>Use</th><th>Item</th><th>Outstanding</th><th>Received</th><th>Accepted</th><th>Damaged</th><th>Rejected</th><th>Location</th><th>QC</th><th>Over</th></tr></thead><tbody>{endpoint.data.lines.map((line) => {
        const draft = draftFor(line);
        const setReceived = (value: number) => updateLine(line, { received: value, accepted: value, damaged: 0, rejected: 0 });
        return <tr key={line.id}><td><input type="checkbox" checked={draft.selected} disabled={Number(line.outstandingQuantity) <= 0} onChange={(event) => updateLine(line, { selected: event.target.checked })} aria-label={`Receive ${line.itemCode}`} /></td><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.description} · {line.unit}</small></td><td className="num">{quantity(line.outstandingQuantity)}</td><td><input style={{ width: 88 }} type="number" min="0" step="0.0001" disabled={!draft.selected} value={draft.received} onChange={(event) => setReceived(Number(event.target.value))} /></td><td><input style={{ width: 88 }} type="number" min="0" step="0.0001" disabled={!draft.selected} value={draft.accepted} onChange={(event) => updateLine(line, { accepted: Number(event.target.value) })} /></td><td><input style={{ width: 88 }} type="number" min="0" step="0.0001" disabled={!draft.selected} value={draft.damaged} onChange={(event) => updateLine(line, { damaged: Number(event.target.value) })} /></td><td><input style={{ width: 88 }} type="number" min="0" step="0.0001" disabled={!draft.selected} value={draft.rejected} onChange={(event) => updateLine(line, { rejected: Number(event.target.value) })} /></td><td><input style={{ width: 120 }} maxLength={100} disabled={!draft.selected} value={draft.location} onChange={(event) => updateLine(line, { location: event.target.value })} /></td><td><select disabled={!draft.selected} value={draft.qcStatus} onChange={(event) => updateLine(line, { qcStatus: event.target.value })}><option>Passed</option><option>Pending</option><option>Failed</option></select></td><td><input type="checkbox" checked={draft.allowOverReceipt} disabled={!draft.selected} onChange={(event) => updateLine(line, { allowOverReceipt: event.target.checked, remark: event.target.checked ? "Approved over-receipt from production workspace" : "" })} aria-label={`Allow over receipt for ${line.itemCode}`} /></td></tr>;
      })}</tbody></table></div> : !endpoint.error ? <EmptyState icon="truck" title="No PO line" message="This purchase order has no receivable line" /> : null}
    </Modal>
  );
}

export function ProductionGoodsReceiving({ bootstrap, notify }: MaterialScreenProps) {
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
      <PageHeader eyebrow="INBOUND MATERIAL" title="Goods Receiving" subtitle="Draft GRN เก็บหลักฐานการรับ; Confirm จะ append stock / quarantine ledger แบบ idempotent" />
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search GRN, PO, supplier or delivery note…" /><Select label="Status" value={status} onChange={setStatus} options={["All status", "Draft", "Confirmed"]} /><RefreshButton loading={endpoint.loading} reload={endpoint.reload} /></Toolbar>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}<ActionError message={actionError} />
      <Panel title={`${visible.length} goods receipts`} subtitle={endpoint.loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th>GRN</th><th>PO</th><th>Supplier</th><th>Delivery note</th><th>Received date</th><th>Received</th><th>Accepted</th><th>Held</th><th>Received by</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td>{item.purchaseOrderNumber}</td><td>{item.supplierName}</td><td>{item.deliveryNote || "—"}</td><td>{date(item.receivedDate)}</td><td className="num">{quantity(item.receivedQuantity)}</td><td className="num">{quantity(item.acceptedQuantity)}</td><td className="num">{Number(item.heldQuantity) > 0 ? <Badge tone="amber">{quantity(item.heldQuantity)}</Badge> : "0"}</td><td>{item.receivedByName}<small className="muted">{item.confirmedByName ? `Confirmed by ${item.confirmedByName}` : ""}</small></td><td><Badge>{item.status}</Badge></td><td><div className="table-actions"><button className="btn ghost sm" type="button" onClick={() => setDetailId(item.id)}><Icon name="eye" />View</button>{canReceive && item.status === "Draft" ? <button className="btn primary sm" type="button" disabled={busyId === item.id} onClick={() => { setActionError(""); setConfirmItem(item); }}><Icon name="check" />Confirm</button> : null}</div></td></tr>)}</tbody></table></div> : endpoint.loading ? <Loading /> : <EmptyState icon="download" title="No goods receipt found" message="Open a purchase order and record the first delivery" />}
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
    <Modal title={detail?.goodsReceipt.number || "Goods receipt"} subtitle={detail ? `${detail.goodsReceipt.purchaseOrderNumber} · ${detail.goodsReceipt.supplierName}` : "Loading from production API…"} size="xl" onClose={onClose} footer={<button className="btn ghost" type="button" onClick={onClose}>Close</button>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      {endpoint.loading && !detail ? <Loading /> : detail ? <><div className="kpi-grid four"><KpiCard label="Received" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.receivedQuantity), 0))} icon="download" tone="blue" /><KpiCard label="Accepted" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.acceptedQuantity), 0))} icon="checkCircle" tone="green" /><KpiCard label="Damaged" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.damagedQuantity), 0))} icon="alertTriangle" tone="amber" /><KpiCard label="Rejected" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.rejectedQuantity), 0))} icon="x" tone="red" /></div><div className="table-wrap"><table><thead><tr><th>Item</th><th>Description</th><th>Ordered</th><th>Previously</th><th>Received</th><th>Accepted</th><th>Held</th><th>Location</th><th>QC</th><th>Lot / serial</th><th>Outstanding</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.partNumber}</small></td><td>{line.description}</td><td className="num">{quantity(line.orderedQuantity)} {line.unit}</td><td className="num">{quantity(line.previouslyReceived)}</td><td className="num">{quantity(line.receivedQuantity)}</td><td className="num">{quantity(line.acceptedQuantity)}</td><td className="num">{quantity(Number(line.damagedQuantity) + Number(line.rejectedQuantity))}</td><td>{line.location}</td><td><Badge>{line.qcStatus}</Badge></td><td>{[line.lotNumber, line.serialNumber].filter(Boolean).join(" · ") || "—"}</td><td className="num">{quantity(line.outstandingAfter)}</td></tr>)}</tbody></table></div></> : null}
    </Modal>
  );
}

type MirAction = { item: MaterialIssue; kind: "Approve" | "Reject" | "Issue" | "Receipt" };

export function ProductionMaterialIssues({ bootstrap, notify }: MaterialScreenProps) {
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
      <PageHeader eyebrow="OUTBOUND MATERIAL" title="Material Issues" subtitle="MIR คุม chain of custody ตั้งแต่ request, approval, issue, receipt ถึง return" actions={canRequest ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />New MIR</button> : undefined} />
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search MIR, project or requester…" /><Select label="Status" value={status} onChange={setStatus} options={["All status", "Pending Approval", "Approved", "Picking", "Issued", "Received", "Rejected"]} /><RefreshButton loading={endpoint.loading} reload={endpoint.reload} /></Toolbar>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}<ActionError message={actionError} />
      <Panel title={`${visible.length} material issue requests`} subtitle={endpoint.loading ? "Loading from production API…" : "Live SQL Server data"} flush>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th>MIR</th><th>Project</th><th>Requester</th><th>Requested</th><th>Required</th><th>Lines</th><th>Qty requested</th><th>Issued</th><th>Returned</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td><div className="cell-primary"><strong>{item.projectNumber}</strong><span>{item.projectName}</span></div></td><td>{item.requestedByName}</td><td>{dateTime(item.requestedAt)}</td><td>{date(item.requiredDate)}</td><td className="num">{item.lineCount}</td><td className="num">{quantity(item.requestedQuantity)}</td><td className="num">{quantity(item.issuedQuantity)}</td><td className="num">{quantity(item.returnedQuantity)}</td><td><Badge>{item.status}</Badge></td><td><div className="table-actions"><button className="btn ghost sm" type="button" onClick={() => setDetailId(item.id)}><Icon name="eye" />View</button>{canApprove && item.status === "Pending Approval" && item.requestedById !== bootstrap.user.id ? <><button className="btn success sm" type="button" disabled={busyId === item.id} onClick={() => setAction({ item, kind: "Approve" })}><Icon name="check" />Approve</button><button className="btn danger sm" type="button" disabled={busyId === item.id} onClick={() => setAction({ item, kind: "Reject" })}><Icon name="x" />Reject</button></> : null}{canIssue && ["Approved", "Picking"].includes(item.status) ? <button className="btn primary sm" type="button" disabled={busyId === item.id} onClick={() => setAction({ item, kind: "Issue" })}><Icon name="upload" />Issue</button> : null}{canRequest && item.status === "Issued" && (item.requestedById === bootstrap.user.id || bootstrap.user.role === "Admin") ? <button className="btn primary sm" type="button" disabled={busyId === item.id} onClick={() => setAction({ item, kind: "Receipt" })}><Icon name="checkCircle" />Confirm receipt</button> : null}</div></td></tr>)}</tbody></table></div> : endpoint.loading ? <Loading /> : <EmptyState icon="upload" title="No material issue request found" message="Release a BOM and create the first material issue request" />}
      </Panel>
      {createOpen ? <CreateMirModal onClose={() => setCreateOpen(false)} onCreated={(number) => { setCreateOpen(false); notify(`${number} requested`); endpoint.reload(); }} /> : null}
      {detailId ? <MirDetailModal id={detailId} bootstrap={bootstrap} notify={notify} onChanged={endpoint.reload} onClose={() => setDetailId(null)} /> : null}
      {action ? <CommentPrompt title={`${action.kind}: ${action.item.number}`} description={action.kind === "Issue" ? "การ issue จะ debit stock ledger และ consume reservation ของ project" : action.kind === "Receipt" ? "ยืนยันว่าผู้ขอได้รับวัสดุจริงครบตาม MIR" : "ใส่เหตุผลเพื่อรองรับกรณีที่ระบบตรวจพบการขอเกินยอดคงเหลือของ BOM"} confirmLabel={action.kind === "Receipt" ? "Confirm receipt" : action.kind} requireComment={["Approve", "Reject"].includes(action.kind)} busy={busyId === action.item.id} onClose={() => setAction(null)} onConfirm={(comment) => { void runAction(comment); }} /> : null}
    </>
  );
}

type MirLineDraft = { selected: boolean; requested: number; location: string; purpose: string };

function CreateMirModal({ onClose, onCreated }: { onClose: () => void; onCreated: (number: string) => void }) {
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
    <Modal title="New material issue request" subtitle="ขอเบิกได้เฉพาะ stock line ใน released BOM และไม่เกินยอดคงเหลือของ BOM" size="xl" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" type="button" disabled={busy || !selectedCount} onClick={() => { void submit(); }}><Icon name="send" />{busy ? "Requesting…" : `Request material (${selectedCount} lines)`}</button></>}>
      {boms.error || workspace.error ? <LoadError message={boms.error || workspace.error} retry={() => { boms.reload(); workspace.reload(); }} /> : null}<ActionError message={error} />
      <div className="form-grid two"><Field label="Released BOM"><select value={effectiveBomId} onChange={(event) => setBomId(Number(event.target.value))}><option value={0}>Select BOM…</option>{released.map((bom) => <option key={bom.id} value={bom.id}>{bom.number} · {bom.projectNumber} · {bom.projectName}</option>)}</select></Field><Field label="Required date"><input type="date" value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} /></Field><Field label="Purpose" span={2}><input maxLength={500} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Installation, assembly, FAT, site work…" /></Field></div>
      {workspace.loading ? <Loading /> : workspace.data ? <div className="table-wrap tall"><table><thead><tr><th>Use</th><th>Item</th><th>BOM qty</th><th>Previously issued</th><th>Remaining</th><th>On hand</th><th>Available</th><th>Request qty</th><th>Location override</th></tr></thead><tbody>{workspace.data.lines.filter((line) => line.itemId !== null && !line.nonStock).map((line) => {
        const draft = draftFor(line);
        const remaining = Math.max(0, Number(line.quantityRequired) - Number(line.customerSuppliedQuantity) - Number(line.netIssued));
        return <tr key={line.id}><td><input type="checkbox" checked={draft.selected} disabled={remaining <= 0} onChange={(event) => updateLine(line, { selected: event.target.checked })} aria-label={`Request ${line.itemCode}`} /></td><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.description} · {line.unit}</small></td><td className="num">{quantity(line.quantityRequired)}</td><td className="num">{quantity(line.netIssued)}</td><td className="num">{quantity(remaining)}</td><td className="num">{quantity(line.onHand)}</td><td className="num">{quantity(line.available)}</td><td><input style={{ width: 100 }} type="number" min="0" max={remaining} step="0.0001" disabled={!draft.selected} value={draft.requested} onChange={(event) => updateLine(line, { requested: Number(event.target.value) })} /></td><td><input style={{ width: 130 }} maxLength={100} disabled={!draft.selected} value={draft.location} onChange={(event) => updateLine(line, { location: event.target.value })} placeholder="Use item default" /></td></tr>;
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
    <Modal title={detail?.materialIssue.number || "Material issue"} subtitle={detail ? `${detail.materialIssue.projectNumber} · ${detail.materialIssue.projectName}` : "Loading from production API…"} size="xl" onClose={onClose} footer={<button className="btn ghost" type="button" onClick={onClose}>Close</button>}>
      {endpoint.error ? <LoadError message={endpoint.error} retry={endpoint.reload} /> : null}
      {endpoint.loading && !detail ? <Loading /> : detail ? <><div className="kpi-grid four"><KpiCard label="Requested" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.requestedQuantity), 0))} icon="send" tone="blue" /><KpiCard label="Issued" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.issuedQuantity), 0))} icon="upload" tone="violet" /><KpiCard label="Returned" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.returnedQuantity), 0))} icon="refresh" tone="green" /><KpiCard label="Net issued" value={quantity(detail.lines.reduce((sum, line) => sum + Number(line.netIssued), 0))} icon="database" tone="amber" /></div><div className="table-wrap"><table><thead><tr><th>Item</th><th>Description</th><th>BOM qty</th><th>Previously</th><th>Requested</th><th>Issued</th><th>Returned</th><th>Net</th><th>On hand</th><th>Available</th><th>Location</th><th>Action</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}><td><strong className="mono">{line.itemCode}</strong><small className="muted">{line.partNumber}</small></td><td>{line.description}</td><td className="num">{quantity(line.bomQuantity)} {line.unit}</td><td className="num">{quantity(line.previouslyIssued)}</td><td className="num">{quantity(line.requestedQuantity)}</td><td className="num">{quantity(line.issuedQuantity)}</td><td className="num">{quantity(line.returnedQuantity)}</td><td className="num"><strong>{quantity(line.netIssued)}</strong></td><td className="num">{quantity(line.onHand)}</td><td className="num">{quantity(line.available)}</td><td>{line.location}</td><td>{canReturn && ["Issued", "Received"].includes(detail.materialIssue.status) && Number(line.netIssued) > 0 ? <button className="btn ghost sm" type="button" onClick={() => setReturnLine(line)}><Icon name="refresh" />Return</button> : "—"}</td></tr>)}</tbody></table></div><Panel title="Chain of custody"><div className="settings-list"><div><span className="setting-icon blue"><Icon name="user" /></span><span><strong>Requested by {detail.materialIssue.requestedByName}</strong><small>{dateTime(detail.materialIssue.requestedAt)} · required {date(detail.materialIssue.requiredDate)}</small></span><Badge>{detail.materialIssue.status}</Badge></div>{detail.materialIssue.approvedByName ? <div><span className="setting-icon green"><Icon name="checkCircle" /></span><span><strong>Approved by {detail.materialIssue.approvedByName}</strong><small>{dateTime(detail.materialIssue.approvedAt)}</small></span></div> : null}{detail.materialIssue.issuedByName ? <div><span className="setting-icon violet"><Icon name="upload" /></span><span><strong>Issued by {detail.materialIssue.issuedByName}</strong><small>{dateTime(detail.materialIssue.issuedAt)}</small></span></div> : null}{detail.materialIssue.receivedByName ? <div><span className="setting-icon green"><Icon name="check" /></span><span><strong>Received by {detail.materialIssue.receivedByName}</strong><small>{dateTime(detail.materialIssue.receivedAt)}</small></span></div> : null}</div></Panel></> : null}
      {returnLine ? <ReturnMaterialModal materialIssueId={id} line={returnLine} onClose={() => setReturnLine(null)} onReturned={(value) => { setReturnLine(null); notify(`${value} returned to stock`); changed(); }} /> : null}
    </Modal>
  );
}

function ReturnMaterialModal({ materialIssueId, line, onClose, onReturned }: { materialIssueId: number; line: MaterialIssueDetail["lines"][number]; onClose: () => void; onReturned: (message: string) => void }) {
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
  return <Modal title={`Return ${line.itemCode}`} subtitle={`${quantity(returnable)} ${line.unit} is currently returnable`} size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" type="button" disabled={busy || amount <= 0 || amount > returnable || !reason.trim()} onClick={() => { void submit(); }}><Icon name="refresh" />{busy ? "Returning…" : "Return to stock"}</button></>}><ActionError message={error} /><Field label="Return quantity"><input type="number" min="0.0001" max={returnable} step="0.0001" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></Field><Field label="Reason"><textarea rows={3} maxLength={20_000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Unused material, wrong part, project complete…" /></Field></Modal>;
}

type ApprovalAction = {
  source: "PR" | "MIR" | "ADJUSTMENT";
  id: number;
  number: string;
  decision: "Approve" | "Reject" | "Request Changes";
};

export function ProductionApprovals({ bootstrap, notify }: MaterialScreenProps) {
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
      <PageHeader eyebrow="CONTROL & GOVERNANCE" title="Approvals" subtitle="แสดงเฉพาะรายการจริงที่ role / user ปัจจุบันมีสิทธิ์ตัดสินใจ และห้าม self-approval" actions={<RefreshButton loading={prs.loading || mirs.loading || adjustments.loading} reload={reload} />} />
      <div className="kpi-grid three"><KpiCard label="Waiting for me" value={total} icon="checkCircle" tone={total ? "amber" : "green"} /><KpiCard label="Purchase requisitions" value={prs.data.length} icon="package" tone="blue" /><KpiCard label="Stock controls" value={adjustments.data.length} note={`${mirs.data.length} material issue requests`} icon="shield" tone="violet" /></div>
      {prs.error || mirs.error || adjustments.error ? <LoadError message={prs.error || mirs.error || adjustments.error} retry={reload} /> : null}<ActionError message={error} />
      <Panel title="Purchase requisition approvals" subtitle="Approval route and current approver are calculated by the API" flush>
        {prs.data.length ? <div className="table-wrap"><table><thead><tr><th>PR</th><th>Project</th><th>Requester</th><th>Amount</th><th>Variance</th><th>Current step</th><th>Required</th><th>Actions</th></tr></thead><tbody>{prs.data.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td>{item.projectNumber} · {item.projectName}</td><td>{item.requestedByName}</td><td className="num"><strong>{money(item.amount)}</strong></td><td>{Number(item.variancePercent) > 0 ? <Badge tone="amber">+{quantity(item.variancePercent)}%</Badge> : <Badge tone="green">{quantity(item.variancePercent)}%</Badge>}</td><td>{item.currentStep}<small className="muted">{item.currentApproverName || item.currentApproverRole}</small></td><td>{date(item.requiredDate)}</td><td><div className="table-actions"><button className="btn success sm" type="button" onClick={() => setAction({ source: "PR", id: item.id, number: item.number, decision: "Approve" })}><Icon name="check" />Approve</button><button className="btn ghost sm" type="button" onClick={() => setAction({ source: "PR", id: item.id, number: item.number, decision: "Request Changes" })}><Icon name="refresh" />Changes</button><button className="btn danger sm" type="button" onClick={() => setAction({ source: "PR", id: item.id, number: item.number, decision: "Reject" })}><Icon name="x" />Reject</button></div></td></tr>)}</tbody></table></div> : prs.loading ? <Loading /> : <EmptyState icon="checkCircle" title="No purchase requisition waiting" message="ไม่มี PR ที่กำลังรอ user / role ปัจจุบัน" />}
      </Panel>
      <Panel title="Material issue approvals" subtitle="Requester cannot approve their own MIR" flush>
        {mirs.data.filter((item) => item.requestedById !== bootstrap.user.id).length ? <div className="table-wrap"><table><thead><tr><th>MIR</th><th>Project</th><th>Requester</th><th>Required</th><th>Lines</th><th>Quantity</th><th>Actions</th></tr></thead><tbody>{mirs.data.filter((item) => item.requestedById !== bootstrap.user.id).map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td>{item.projectNumber} · {item.projectName}</td><td>{item.requestedByName}</td><td>{date(item.requiredDate)}</td><td className="num">{item.lineCount}</td><td className="num">{quantity(item.requestedQuantity)}</td><td><div className="table-actions"><button className="btn success sm" type="button" onClick={() => setAction({ source: "MIR", id: item.id, number: item.number, decision: "Approve" })}><Icon name="check" />Approve</button><button className="btn danger sm" type="button" onClick={() => setAction({ source: "MIR", id: item.id, number: item.number, decision: "Reject" })}><Icon name="x" />Reject</button></div></td></tr>)}</tbody></table></div> : mirs.loading ? <Loading /> : <EmptyState icon="upload" title="No material issue waiting" message="ไม่มี MIR ที่รออนุมัติจากผู้ใช้ปัจจุบัน" />}
      </Panel>
      {canAdjust ? <Panel title="Stock adjustment approvals" subtitle="Stock changes only after Inventory Controller approval" flush>
        {adjustments.data.filter((item) => item.requestedById !== bootstrap.user.id).length ? <div className="table-wrap"><table><thead><tr><th>Adjustment</th><th>Item</th><th>Current usable</th><th>Change</th><th>Reason</th><th>Requester</th><th>Actions</th></tr></thead><tbody>{adjustments.data.filter((item) => item.requestedById !== bootstrap.user.id).map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td><strong>{item.itemCode}</strong><small className="muted">{item.description}</small></td><td className="num">{quantity(item.currentUsable)}</td><td className="num"><Badge tone={Number(item.quantityChange) >= 0 ? "green" : "red"}>{Number(item.quantityChange) >= 0 ? "+" : ""}{quantity(item.quantityChange)}</Badge></td><td>{item.reason}</td><td>{item.requestedByName}</td><td><div className="table-actions"><button className="btn success sm" type="button" onClick={() => setAction({ source: "ADJUSTMENT", id: item.id, number: item.number, decision: "Approve" })}><Icon name="check" />Approve</button><button className="btn danger sm" type="button" onClick={() => setAction({ source: "ADJUSTMENT", id: item.id, number: item.number, decision: "Reject" })}><Icon name="x" />Reject</button></div></td></tr>)}</tbody></table></div> : adjustments.loading ? <Loading /> : <EmptyState icon="database" title="No stock adjustment waiting" message="ไม่มี stock discrepancy ที่รอ Inventory Controller" />}
      </Panel> : null}
      {action ? <CommentPrompt title={`${action.decision}: ${action.number}`} description={`${action.source} decision · ข้อความจะถูกเก็บใน audit trail`} confirmLabel={action.decision} requireComment busy={busy} onClose={() => setAction(null)} onConfirm={(comment) => { void decide(comment); }} /> : null}
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
      <PageHeader eyebrow="INVENTORY CONTROL" title="Stock Operations" subtitle="Corrections use approval workflow; quarantine releases always carry an outcome and reason" actions={canReceive && tab === "adjustments" ? <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />Request adjustment</button> : undefined} />
      <div className="tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "adjustments"} className={tab === "adjustments" ? "tab active" : "tab"} onClick={() => setTab("adjustments")}>Stock adjustments <em>{adjustments.data.length}</em></button><button type="button" role="tab" aria-selected={tab === "quarantine"} className={tab === "quarantine" ? "tab active" : "tab"} onClick={() => setTab("quarantine")}>Quarantine <em>{quarantine.data.length}</em></button></div>
      {adjustments.error || quarantine.error ? <LoadError message={adjustments.error || quarantine.error} retry={reload} /> : null}<ActionError message={error} />
      {tab === "adjustments" ? <Panel title={`${adjustments.data.length} stock adjustments`} subtitle="Approved adjustments append a ledger event; balances are never edited directly" flush>{adjustments.data.length ? <div className="table-wrap"><table><thead><tr><th>Adjustment</th><th>Item</th><th>Current usable</th><th>Change</th><th>Reason</th><th>Requester</th><th>Approver</th><th>Status</th><th>Actions</th></tr></thead><tbody>{adjustments.data.map((item) => <tr key={item.id}><td><strong className="mono">{item.number}</strong></td><td><strong>{item.itemCode}</strong><small className="muted">{item.partNumber} · {item.description}</small></td><td className="num">{quantity(item.currentUsable)}</td><td className="num"><Badge tone={Number(item.quantityChange) >= 0 ? "green" : "red"}>{Number(item.quantityChange) >= 0 ? "+" : ""}{quantity(item.quantityChange)}</Badge></td><td>{item.reason}</td><td>{item.requestedByName}</td><td>{item.approvedByName || "—"}</td><td><Badge>{item.status}</Badge></td><td>{canAdjust && item.status === "Pending Approval" && item.requestedById !== bootstrap.user.id ? <div className="table-actions"><button className="btn success sm" type="button" onClick={() => setDecision({ item, decision: "Approve" })}><Icon name="check" />Approve</button><button className="btn danger sm" type="button" onClick={() => setDecision({ item, decision: "Reject" })}><Icon name="x" />Reject</button></div> : "—"}</td></tr>)}</tbody></table></div> : adjustments.loading ? <Loading /> : <EmptyState icon="database" title="No stock adjustment" message="No discrepancy has been raised" />}</Panel> : <Panel title={`${quarantine.data.length} items on hold`} subtitle="Damaged / rejected receipts stay unavailable until an explicit decision" flush>{quarantine.data.length ? <div className="table-wrap"><table><thead><tr><th>Item</th><th>Description</th><th>Brand</th><th>Held</th><th>Usable</th><th>Avg. cost</th><th>Held since</th><th>Action</th></tr></thead><tbody>{quarantine.data.map((item) => <tr key={item.itemId}><td><strong className="mono">{item.itemCode}</strong><small className="muted">{item.partNumber}</small></td><td>{item.description}</td><td>{item.brand}</td><td className="num"><Badge tone="amber">{quantity(item.quarantineQuantity)} {item.unit}</Badge></td><td className="num">{quantity(item.usableQuantity)}</td><td className="num">{money(item.averageUnitCost)}</td><td>{dateTime(item.heldSince)}</td><td>{canAdjust ? <button className="btn primary sm" type="button" onClick={() => setReleaseItem(item)}><Icon name="shield" />Decide</button> : "—"}</td></tr>)}</tbody></table></div> : quarantine.loading ? <Loading /> : <EmptyState icon="shield" title="Quarantine is clear" message="No damaged or rejected material is currently on hold" />}</Panel>}
      {createOpen ? <CreateAdjustmentModal onClose={() => setCreateOpen(false)} onCreated={(number) => { setCreateOpen(false); notify(`${number} requested`); adjustments.reload(); }} /> : null}
      {releaseItem ? <ReleaseQuarantineModal item={releaseItem} onClose={() => setReleaseItem(null)} onReleased={(message) => { setReleaseItem(null); notify(message); quarantine.reload(); }} /> : null}
      {decision ? <CommentPrompt title={`${decision.decision}: ${decision.item.number}`} description="Inventory Controller decision; requester cannot approve their own adjustment" confirmLabel={decision.decision} requireComment busy={busy} onClose={() => setDecision(null)} onConfirm={(comment) => { void decide(comment); }} /> : null}
    </>
  );
}

function CreateAdjustmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (number: string) => void }) {
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
  return <Modal title="Request stock adjustment" subtitle="คำขอนี้ยังไม่เปลี่ยน stock จนกว่า Inventory Controller จะอนุมัติ" size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" type="button" disabled={busy || !effectiveItemId || !quantityChange || !reason.trim()} onClick={() => { void submit(); }}><Icon name="send" />{busy ? "Requesting…" : "Request adjustment"}</button></>}>
    {inventory.error ? <LoadError message={inventory.error} retry={inventory.reload} /> : null}<ActionError message={error} />
    <Field label="Inventory item"><select value={effectiveItemId} onChange={(event) => setItemId(Number(event.target.value))}><option value={0}>Select item…</option>{inventory.data.map((item) => <option key={item.itemId} value={item.itemId}>{item.itemCode} · {item.description} (usable {quantity(item.usable)})</option>)}</select></Field>
    <Field label="Quantity change"><input type="number" step="0.0001" value={quantityChange} onChange={(event) => setQuantityChange(Number(event.target.value))} /><small>ใช้ค่าบวกเพื่อเพิ่ม และค่าลบเพื่อลด</small></Field>
    <Field label="Reason"><textarea rows={4} maxLength={20_000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Cycle count discrepancy, damaged stock, correction…" /></Field>
  </Modal>;
}

function ReleaseQuarantineModal({ item, onClose, onReleased }: { item: QuarantineItem; onClose: () => void; onReleased: (message: string) => void }) {
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
  return <Modal title={`Quarantine decision: ${item.itemCode}`} subtitle={`${quantity(item.quarantineQuantity)} ${item.unit} is currently held`} size="sm" onClose={onClose} footer={<><button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" type="button" disabled={busy || amount <= 0 || amount > Number(item.quarantineQuantity) || !reason.trim()} onClick={() => { void submit(); }}><Icon name="shield" />{busy ? "Saving…" : "Record decision"}</button></>}>
    <ActionError message={error} />
    <Field label="Outcome"><select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option>Accept</option><option>Return to Supplier</option><option>Scrap</option></select></Field>
    <Field label="Quantity"><input type="number" min="0.0001" max={item.quarantineQuantity} step="0.0001" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></Field>
    <Field label="Reason"><textarea rows={4} maxLength={20_000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="QC result and disposition reason" /></Field>
  </Modal>;
}
