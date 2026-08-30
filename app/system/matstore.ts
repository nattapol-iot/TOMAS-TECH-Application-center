"use client";

/* ==========================================================================
   Material store

   The single write seam for BOM, PR, PO, receiving, stock and issues.
   Stock is NEVER set — every movement appends a ledger transaction, every
   action appends an audit record, and each function maps 1:1 onto a future
   API endpoint. Screens read balances through the pure functions in calc.ts.
   ========================================================================== */

import { useSyncExternalStore } from "react";
import {
  GRNS, MAT_AUDIT, MAT_POS, MAT_PRS, MIRS, PROJECTS, RESERVATIONS, STOCK_ADJUSTMENTS, STOCK_TXNS,
  type Grn, type MatAudit, type MatPo, type MatPr, type Mir, type Reservation,
  type StockAdjustment, type StockTxn,
} from "./data";
import { itemOf, prRuleFlags, stockBalance, TODAY_ISO, userName } from "./calc";
import type { Session } from "./session";

export type MatState = {
  txns: StockTxn[];
  reservations: Reservation[];
  prs: MatPr[];
  pos: MatPo[];
  grns: Grn[];
  mirs: Mir[];
  adjustments: StockAdjustment[];
  audit: MatAudit[];
  version: number;
};

let state: MatState = {
  txns: STOCK_TXNS,
  reservations: RESERVATIONS,
  prs: MAT_PRS,
  pos: MAT_POS,
  grns: GRNS,
  mirs: MIRS,
  adjustments: STOCK_ADJUSTMENTS,
  audit: MAT_AUDIT,
  version: 0,
};

const listeners = new Set<() => void>();
const emit = (next: Partial<MatState>) => {
  state = { ...state, ...next, version: state.version + 1 };
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useMatStore = (): MatState => useSyncExternalStore(subscribe, () => state, () => state);

/**
 * The screens read live balances through calc.ts, which imports the seed
 * arrays — so the store mutates those arrays in place (push only for the
 * ledger, status patches for documents) and bumps the version to re-render.
 * On the server this whole file becomes transactions in the database.
 */

let seq = 500;
const nextId = (prefix: string) => `${prefix}${(seq += 1)}`;

const NOW = `${TODAY_ISO} ${new Date().toTimeString().slice(0, 5)}`;

function audit(entry: Omit<MatAudit, "id" | "at">) {
  state.audit.push({ ...entry, id: nextId("mau"), at: NOW });
}

function ledger(txn: Omit<StockTxn, "id" | "at">) {
  state.txns.push({ ...txn, id: nextId("mt"), at: NOW });
}

/* ---- Reservations ---------------------------------------------------------- */

/** Reserve available stock for one project. Refuses to double-book. */
export function reserveStock(itemId: string, projectId: string, bomLineId: string, qty: number, requiredDate: string, session: Session): string | null {
  const balance = stockBalance(itemId);
  if (qty <= 0 || qty > balance.available) return null;
  state.reservations.push({
    id: nextId("rsv"), itemId, projectId, bomLineId, qty, requiredDate,
    ownerId: session.user.id, status: "Active", createdAt: TODAY_ISO,
  });
  const project = PROJECTS.find((entry) => entry.id === projectId);
  audit({
    actorId: session.user.id, role: session.role, action: "Reserved stock for project",
    entity: "Reservation", entityNo: itemOf(itemId)?.itemCode ?? itemId,
    before: `Available ${balance.available}`, after: `Reserved ${qty} → ${project?.no ?? projectId}`,
    qty, projectId, reason: "BOM allocation", attachment: "", approverId: "",
  });
  emit({});
  return "ok";
}

export function releaseReservation(reservationId: string, session: Session) {
  const reservation = state.reservations.find((entry) => entry.id === reservationId);
  if (!reservation || reservation.status !== "Active") return;
  reservation.status = "Released";
  audit({
    actorId: session.user.id, role: session.role, action: "Released reservation",
    entity: "Reservation", entityNo: itemOf(reservation.itemId)?.itemCode ?? reservation.itemId,
    before: `Reserved ${reservation.qty}`, after: "Released",
    qty: reservation.qty, projectId: reservation.projectId, reason: "", attachment: "", approverId: "",
  });
  emit({});
}

/* ---- Purchase requisitions --------------------------------------------------- */

export function submitPr(prId: string, session: Session) {
  const pr = state.prs.find((entry) => entry.id === prId);
  if (!pr || pr.status !== "Draft") return;
  pr.status = "In Approval";
  const step = pr.steps.find((entry) => entry.name === "Submitted by Requester");
  if (step) { step.status = "Completed"; step.at = NOW; }
  const next = pr.steps.find((entry) => entry.status === "Pending");
  if (next) next.status = "Current";
  audit({
    actorId: session.user.id, role: session.role, action: "Submitted PR", entity: "PR", entityNo: pr.no,
    before: "Draft", after: "In Approval", qty: 0, projectId: pr.projectId, reason: "", attachment: "", approverId: "",
  });
  emit({});
}

/** Approve / reject / return the current step. The requester can never decide. */
export function decidePr(prId: string, decision: "Approve" | "Reject" | "Request Changes", comment: string, session: Session): string {
  const pr = state.prs.find((entry) => entry.id === prId);
  if (!pr) return "PR not found";
  if (pr.requestedBy === session.user.id) return "The requester cannot approve their own PR";
  const current = pr.steps.find((step) => step.status === "Current" || step.status === "Auto-added");
  if (!current) return "No step is waiting for a decision";
  if (current.approverId && current.approverId !== session.user.id && session.role !== "Admin") {
    return `This step is waiting for ${userName(current.approverId)}`;
  }
  // A comment is required on reject / request-changes, and on approving
  // anything a rule has flagged — the same gate the UI shows, enforced here.
  const flagged = !!current.rule || prRuleFlags(pr).length > 0;
  if ((decision !== "Approve" || flagged) && !comment.trim()) return "A comment is required for this decision";

  current.at = NOW;
  current.comment = comment;
  if (decision === "Reject") {
    current.status = "Completed";
    pr.status = "Rejected";
  } else if (decision === "Request Changes") {
    current.status = "Pending";
    pr.status = "Draft";
    const submitted = pr.steps.find((step) => step.name === "Submitted by Requester");
    if (submitted) submitted.status = "Pending";
  } else {
    current.status = "Completed";
    const next = pr.steps.find((step) => step.status === "Pending" || step.status === "Auto-added");
    if (next && next.name !== "PO Creation") next.status = "Current";
    else pr.status = "Approved";
  }
  audit({
    actorId: session.user.id, role: session.role,
    action: `${decision} — ${current.name}`, entity: "PR", entityNo: pr.no,
    before: current.name, after: pr.status, qty: 0, projectId: pr.projectId,
    reason: comment, attachment: "", approverId: session.user.id,
  });
  emit({});
  return "";
}

/** Purchasing converts an approved PR into POs, one per supplier. */
export function convertPrToPo(prId: string, session: Session): string[] {
  const pr = state.prs.find((entry) => entry.id === prId);
  if (!pr || pr.status !== "Approved") return [];
  const suppliers = [...new Set(pr.lines.map((line) => line.supplier))];
  const created: string[] = [];
  for (const supplier of suppliers) {
    const poId = nextId("mpo");
    const month = TODAY_ISO.slice(2, 4) + TODAY_ISO.slice(5, 7);
    const no = `PO-${month}-${String(state.pos.length + 13).padStart(4, "0")}`;
    state.pos.push({
      id: poId, no, prId: pr.id, projectId: pr.projectId, supplier,
      orderDate: TODAY_ISO, confirmedDate: "", expectedDate: "", createdBy: session.user.id, status: "Ordered",
      lines: pr.lines.filter((line) => line.supplier === supplier).map((line) => ({
        id: nextId("mpol"), poId, prLineId: line.id, bomLineId: line.bomLineId, itemId: line.itemId,
        itemCode: line.itemCode, partNo: line.partNo, description: line.description,
        qty: line.qty, unitPrice: line.unitPrice,
      })),
    });
    created.push(no);
  }
  pr.status = "Converted to PO";
  const step = pr.steps.find((entry) => entry.name === "PO Creation");
  if (step) { step.status = "Completed"; step.at = NOW; step.comment = created.join(" / "); }
  audit({
    actorId: session.user.id, role: session.role, action: "Converted PR to PO", entity: "PO",
    entityNo: created.join(" / "), before: pr.no, after: `${created.length} purchase order(s)`,
    qty: 0, projectId: pr.projectId, reason: "", attachment: "", approverId: "",
  });
  emit({});
  return created;
}

/* ---- Goods receiving ----------------------------------------------------------- */

/** Confirm a receipt: accepted goes to stock, damaged/rejected to quarantine. */
export function confirmGrn(grnId: string, session: Session): string {
  const grn = state.grns.find((entry) => entry.id === grnId);
  if (!grn || grn.status === "Confirmed") return "Nothing to confirm";
  for (const line of grn.lines) {
    if (line.acceptedQty + line.damagedQty + line.rejectedQty !== line.receivedQty) {
      return `${line.partNo}: accepted + damaged + rejected must equal the received quantity`;
    }
    if (line.previouslyReceived + line.receivedQty > line.orderedQty) {
      return `${line.partNo}: receiving more than the PO quantity requires approval`;
    }
  }
  grn.status = "Confirmed";
  for (const line of grn.lines) {
    if (!line.itemId) continue;
    if (line.acceptedQty > 0) {
      ledger({ type: "Goods Receipt", itemId: line.itemId, qty: line.acceptedQty, bucket: "stock", location: line.location, refNo: grn.no, projectId: "", byId: session.user.id, note: line.remark });
    }
    const held = line.damagedQty + line.rejectedQty;
    if (held > 0) {
      ledger({ type: "Quarantine In", itemId: line.itemId, qty: held, bucket: "quarantine", location: "WH1-QC", refNo: grn.no, projectId: "", byId: session.user.id, note: "Damaged or rejected on receipt" });
    }
  }
  audit({
    actorId: session.user.id, role: session.role, action: "Confirmed goods receipt", entity: "GRN",
    entityNo: grn.no, before: "Draft", after: grn.deliveryStatus,
    qty: grn.lines.reduce((sum, line) => sum + line.receivedQty, 0),
    projectId: "", reason: "", attachment: grn.deliveryNote, approverId: "",
  });
  emit({});
  return "";
}

/* ---- Material issues -------------------------------------------------------------- */

export function decideMir(mirId: string, decision: "Approve" | "Reject", comment: string, session: Session): string {
  const mir = state.mirs.find((entry) => entry.id === mirId);
  if (!mir || mir.status !== "Pending Approval") return "Nothing to approve";
  if (mir.requestedBy === session.user.id) return "The requester cannot approve their own issue request";
  const overBom = mir.lines.some((line) => line.requestedQty > line.bomQty - line.previouslyIssued);
  if ((decision === "Reject" || overBom) && !comment.trim()) {
    return decision === "Reject"
      ? "A comment is required when rejecting"
      : "This request exceeds the remaining BOM quantity — a comment is required to approve it";
  }
  mir.status = decision === "Approve" ? "Approved" : "Draft";
  mir.approvedBy = decision === "Approve" ? session.user.id : "";
  mir.approvedAt = decision === "Approve" ? NOW : "";
  audit({
    actorId: session.user.id, role: session.role, action: `${decision} material issue`, entity: "MIR",
    entityNo: mir.no, before: "Pending Approval", after: mir.status, qty: 0,
    projectId: mir.projectId, reason: comment, attachment: "", approverId: session.user.id,
  });
  emit({});
  return "";
}

/** The storekeeper picks and issues — this is the moment stock actually moves. */
export function confirmIssue(mirId: string, session: Session): string {
  const mir = state.mirs.find((entry) => entry.id === mirId);
  if (!mir || (mir.status !== "Approved" && mir.status !== "Picking")) return "Nothing to issue";
  // Guard before anything moves: the store may only hand out what physically
  // exists, and never a quantity another project holds a reservation on.
  for (const line of mir.lines) {
    if (!line.itemId) continue;
    const balance = stockBalance(line.itemId);
    const ownReserved = state.reservations
      .filter((rsv) => rsv.itemId === line.itemId && rsv.projectId === mir.projectId && rsv.status === "Active")
      .reduce((sum, rsv) => sum + rsv.qty, 0);
    if (line.requestedQty > balance.usable) {
      return `${line.partNo}: only ${balance.usable} in stock`;
    }
    if (line.requestedQty > ownReserved + balance.available) {
      return `${line.partNo}: ${balance.reserved - ownReserved} of the stock is reserved for another project`;
    }
  }
  mir.status = "Issued";
  mir.pickedBy = session.user.id;
  mir.issuedBy = session.user.id;
  mir.issuedAt = NOW;
  for (const line of mir.lines) {
    line.issueQty = line.requestedQty;
    if (!line.itemId) continue;
    ledger({ type: "Material Issue", itemId: line.itemId, qty: -line.issueQty, bucket: "stock", location: line.location, refNo: mir.no, projectId: mir.projectId, byId: session.user.id, note: line.purpose });
    // Consume this project's reservations before touching free stock —
    // splitting a reservation that is larger than the issued quantity.
    let toConsume = line.issueQty;
    for (const rsv of state.reservations) {
      if (toConsume <= 0) break;
      if (rsv.itemId === line.itemId && rsv.projectId === mir.projectId && rsv.status === "Active") {
        if (rsv.qty <= toConsume) {
          rsv.status = "Consumed";
          toConsume -= rsv.qty;
        } else {
          rsv.qty -= toConsume;
          state.reservations.push({ ...rsv, id: nextId("rsv"), qty: toConsume, status: "Consumed" });
          toConsume = 0;
        }
      }
    }
  }
  audit({
    actorId: session.user.id, role: session.role, action: "Issued material", entity: "MIR",
    entityNo: mir.no, before: "Approved", after: "Issued",
    qty: mir.lines.reduce((sum, line) => sum + line.issueQty, 0),
    projectId: mir.projectId, reason: "", attachment: "", approverId: "",
  });
  emit({});
  return "";
}

export function confirmMemberReceipt(mirId: string, session: Session) {
  const mir = state.mirs.find((entry) => entry.id === mirId);
  if (!mir || mir.status !== "Issued") return;
  mir.status = "Received";
  mir.receivedBy = session.user.id;
  mir.receivedAt = NOW;
  audit({
    actorId: session.user.id, role: session.role, action: "Confirmed member receipt", entity: "MIR",
    entityNo: mir.no, before: "Issued", after: `Received by ${session.user.name}`,
    qty: 0, projectId: mir.projectId, reason: "", attachment: "", approverId: "",
  });
  emit({});
}

export function returnMaterial(mirId: string, lineId: string, qty: number, reason: string, session: Session) {
  const mir = state.mirs.find((entry) => entry.id === mirId);
  const line = mir?.lines.find((entry) => entry.id === lineId);
  if (!mir || !line || qty <= 0 || qty > line.issueQty - line.returnedQty) return;
  line.returnedQty += qty;
  if (line.itemId) {
    ledger({ type: "Material Return", itemId: line.itemId, qty, bucket: "stock", location: line.location, refNo: mir.no, projectId: mir.projectId, byId: session.user.id, note: reason });
  }
  audit({
    actorId: session.user.id, role: session.role, action: "Processed material return", entity: "MIR",
    entityNo: mir.no, before: `${line.partNo} issued ${line.issueQty}`, after: `${qty} returned`,
    qty, projectId: mir.projectId, reason, attachment: "", approverId: "",
  });
  emit({});
}

/* ---- Stock adjustments -------------------------------------------------------------- */

export function decideAdjustment(adjId: string, decision: "Approved" | "Rejected", comment: string, session: Session): string {
  const adjustment = state.adjustments.find((entry) => entry.id === adjId);
  if (!adjustment || adjustment.status !== "Pending Approval") return "Nothing to decide";
  if (decision === "Rejected" && !comment.trim()) return "A comment is required when rejecting";
  adjustment.status = decision;
  adjustment.approvedBy = session.user.id;
  if (decision === "Approved") {
    ledger({ type: "Stock Adjustment", itemId: adjustment.itemId, qty: adjustment.qtyChange, bucket: "stock", location: itemOf(adjustment.itemId)?.location ?? "", refNo: adjustment.no, projectId: "", byId: session.user.id, note: adjustment.reason });
  }
  audit({
    actorId: session.user.id, role: session.role, action: `${decision} stock adjustment`, entity: "Adjustment",
    entityNo: adjustment.no, before: "Pending Approval", after: decision, qty: adjustment.qtyChange,
    projectId: "", reason: comment.trim() || adjustment.reason, attachment: "", approverId: session.user.id,
  });
  emit({});
  return "";
}

/** Warehouse or the controller flags a discrepancy — pending until approved. */
export function requestAdjustment(itemId: string, qtyChange: number, reason: string, session: Session): string {
  if (!qtyChange || !reason.trim()) return "Quantity and reason are required";
  const month = TODAY_ISO.slice(2, 4) + TODAY_ISO.slice(5, 7);
  const no = `ADJ-${month}-${String(state.adjustments.length + 4).padStart(4, "0")}`;
  state.adjustments.push({
    id: nextId("adj"), no, itemId, qtyChange, reason: reason.trim(),
    requestedBy: session.user.id, requestedAt: NOW, status: "Pending Approval", approvedBy: "",
  });
  audit({
    actorId: session.user.id, role: session.role, action: "Requested stock adjustment",
    entity: "Adjustment", entityNo: no,
    before: `${itemOf(itemId)?.itemCode ?? itemId} ledger`,
    after: `${qtyChange > 0 ? "+" : ""}${qtyChange}`,
    qty: qtyChange, projectId: "", reason: reason.trim(), attachment: "", approverId: "",
  });
  emit({});
  return "";
}
