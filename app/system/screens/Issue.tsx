"use client";

import { useState } from "react";
import { BOMS, PROJECTS, type Mir } from "../data";
import { formatDate, matPermission, stockBalance, userName, userOf } from "../calc";
import { confirmIssue, confirmMemberReceipt, decideMir, returnMaterial, useMatStore } from "../matstore";
import { useSession } from "../session";
import { Badge, Field, Icon, Modal, Panel, PageHeader, Person } from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";

const mirTone = (status: Mir["status"]) =>
  (status === "Completed" || status === "Received" ? "green"
    : status === "Issued" ? "blue"
      : status === "Pending Approval" ? "amber"
        : status === "Approved" || status === "Picking" ? "violet" : "slate") as "green" | "blue" | "amber" | "violet" | "slate";

/* ==========================================================================
   Material issue list
   ========================================================================== */

export function MirList({ go }: ScreenProps) {
  const t = useT();
  const store = useMatStore();

  return (
    <>
      <PageHeader
        eyebrow={t("MATERIAL & PROCUREMENT")}
        title={t("Material Issues")}
        subtitle={t("Request → project approval → picking → warehouse issue → member receipt. Received quantity and issued quantity are never the same number by accident.")}
      />
      <Panel title={`${store.mirs.length} ${t("issue requests")}`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Issue No.")}</th><th>{t("Project")}</th><th>{t("BOM")}</th><th>{t("Requested By")}</th>
                <th>{t("Required")}</th><th className="num">{t("Lines")}</th><th className="num">{t("Requested Qty")}</th>
                <th className="num">{t("Issued Qty")}</th><th className="num">{t("Returned")}</th>
                <th>{t("Received By")}</th><th>{t("Status")}</th><th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {store.mirs.map((mir) => {
                const project = PROJECTS.find((entry) => entry.id === mir.projectId);
                return (
                  <tr key={mir.id} className="clickable" onClick={() => go({ name: "mir", id: mir.id })}>
                    <td><strong className="mono">{mir.no}</strong></td>
                    <td><strong>{project?.no}</strong><div className="muted" style={{ fontSize: 11 }}>{project?.name}</div></td>
                    <td className="mono">{BOMS.find((entry) => entry.id === mir.bomId)?.no}</td>
                    <td><Person initials={userOf(mir.requestedBy)?.initials ?? "—"} name={userName(mir.requestedBy)} /></td>
                    <td>{formatDate(mir.requiredDate)}</td>
                    <td className="num">{mir.lines.length}</td>
                    <td className="num">{mir.lines.reduce((sum, line) => sum + line.requestedQty, 0)}</td>
                    <td className="num"><strong>{mir.lines.reduce((sum, line) => sum + line.issueQty, 0)}</strong></td>
                    <td className="num">{mir.lines.reduce((sum, line) => sum + line.returnedQty, 0) || 0}</td>
                    <td>{mir.receivedBy ? userName(mir.receivedBy) : "—"}</td>
                    <td><Badge tone={mirTone(mir.status)}>{t(mir.status)}</Badge></td>
                    <td><span className="row-action"><Icon name="chevronRight" /></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ==========================================================================
   Screen 6 — material issue request
   ========================================================================== */

export function MirDetail({ id, go, notify }: ScreenProps & { id: string }) {
  const t = useT();
  const session = useSession();
  const store = useMatStore();
  const perm = matPermission(session.user, session.role);
  const mir = store.mirs.find((entry) => entry.id === id) ?? store.mirs[0];
  const project = PROJECTS.find((entry) => entry.id === mir.projectId)!;
  const bom = BOMS.find((entry) => entry.id === mir.bomId);
  const isRequester = mir.requestedBy === session.user.id;
  const isMember = project.members.includes(session.user.id) || project.leadEngineerId === session.user.id;

  const [decideOpen, setDecideOpen] = useState<"Approve" | "Reject" | "">("");
  const overBom = mir.lines.some((line) => line.requestedQty > line.bomQty - line.previouslyIssued);
  const [returnFor, setReturnFor] = useState("");

  const flow: { label: string; done: boolean; current: boolean }[] = [
    { label: "Issue Request", done: true, current: false },
    { label: "Project Approval", done: !!mir.approvedAt, current: mir.status === "Pending Approval" },
    { label: "Ready for Picking", done: ["Issued", "Received", "Completed"].includes(mir.status), current: mir.status === "Approved" || mir.status === "Picking" },
    { label: "Issued by Storekeeper", done: ["Issued", "Received", "Completed"].includes(mir.status), current: false },
    { label: "Received by Member", done: ["Received", "Completed"].includes(mir.status), current: mir.status === "Issued" },
    { label: "Consumed or Returned", done: mir.status === "Completed", current: mir.status === "Received" },
  ];

  return (
    <>
      <div className="breadcrumb">
        <button type="button" onClick={() => go({ name: "issues" })}>{t("Material Issues")}</button>
        <Icon name="chevronRight" />
        <span>{mir.no}</span>
      </div>

      <PageHeader
        eyebrow={`${project.no} · ${bom?.no} ${bom?.revision}`}
        title={`${t("Issue Request")} ${mir.no}`}
        subtitle={`${project.name} · ${t("Requested By")} ${userName(mir.requestedBy)} · ${t("Required")} ${formatDate(mir.requiredDate)} · ${mir.purpose}`}
        meta={
          <>
            <div><span>{t("Status")}</span><strong><Badge tone={mirTone(mir.status)}>{t(mir.status)}</Badge></strong></div>
            <div><span>{t("Work Area")}</span><strong>{mir.workArea}</strong></div>
            <div><span>{t("Approved By")}</span><strong>{mir.approvedBy ? userName(mir.approvedBy) : "—"}</strong></div>
            <div><span>{t("Issued By")}</span><strong>{mir.issuedBy ? userName(mir.issuedBy) : "—"}</strong></div>
            <div><span>{t("Received By")}</span><strong>{mir.receivedBy ? `${userName(mir.receivedBy)} · ${mir.receivedAt.slice(0, 16)}` : "—"}</strong></div>
          </>
        }
        actions={
          <>
            {mir.status === "Pending Approval" && perm.canApproveIssue && !isRequester ? (
              <>
                <button className="btn default" type="button" onClick={() => setDecideOpen("Reject")}><Icon name="x" />{t("Reject")}</button>
                <button
                  className="btn primary" type="button"
                  onClick={() => {
                    if (overBom) { setDecideOpen("Approve"); return; }
                    const error = decideMir(mir.id, "Approve", "", session);
                    notify(error || t("Approved — the warehouse can pick"));
                  }}
                >
                  <Icon name="check" />{t("Approve Issue")}
                </button>
              </>
            ) : null}
            {mir.status === "Approved" && perm.canIssue ? (
              <>
                <button className="btn default" type="button" onClick={() => notify(t("Picking list PICK-2608-0008 printed"))}><Icon name="table" />{t("Generate Picking List")}</button>
                <button className="btn primary" type="button" onClick={() => { const error = confirmIssue(mir.id, session); notify(error || t("Issued — stock moved out on the ledger, reservations consumed")); }}>
                  <Icon name="upload" />{t("Confirm Warehouse Issue")}
                </button>
              </>
            ) : null}
            {mir.status === "Issued" && isRequester ? (
              <button className="btn primary" type="button" onClick={() => { confirmMemberReceipt(mir.id, session); notify(t("Receipt confirmed — the material is now yours to use or return")); }}>
                <Icon name="checkCircle" />{t("Confirm Member Receipt")}
              </button>
            ) : null}
          </>
        }
      />

      {mir.status === "Pending Approval" && isRequester ? (
        <div className="info-strip"><Icon name="lock" />{t("You raised this request — it is waiting for the project owner's approval.")}</div>
      ) : null}
      {!isMember && mir.status === "Pending Approval" ? (
        <div className="info-strip amber"><Icon name="alertTriangle" />{t("A member may request material only on projects they are assigned to, for items on the BOM, within the remaining BOM quantity.")}</div>
      ) : null}

      <Panel title={t("Issue workflow")} flush>
        <div className="approval-rail">
          {flow.map((step, index) => (
            <div className={`approval-node ${step.done ? "done" : step.current ? "current" : ""}`} key={step.label}>
              <span className="approval-dot">{step.done ? <Icon name="check" /> : index + 1}</span>
              <div><strong>{t(step.label)}</strong></div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title={t("Issue lines")}
        subtitle={t("Requested quantity may not exceed the remaining BOM quantity without approval — issue quantity is what actually left the store")}
        flush
      >
        <div className="table-wrap">
          <table className="sheet" style={{ minWidth: 1420 }}>
            <colgroup>
              {[110, 150, 60, 66, 66, 66, 66, 66, 60, 92, 150, 120, 96, 110].map((width, index) => <col key={index} style={{ width }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>{t("Item")}</th><th>{t("Part Number")}</th>
                <th className="num">{t("BOM Qty")}</th><th className="num">{t("Prev. Issued")}</th><th className="num">{t("Requested")}</th>
                <th className="num">{t("Reserved")}</th><th className="num">{t("Available")}</th><th className="num">{t("Issued")}</th>
                <th className="num">{t("Returned")}</th><th>{t("Location")}</th><th>{t("Purpose")}</th><th>{t("Work Area")}</th><th>{t("Lot/Serial")}</th><th>{t("Line status")}</th>
              </tr>
            </thead>
            <tbody>
              {mir.lines.map((line) => {
                const balance = line.itemId ? stockBalance(line.itemId) : null;
                const over = line.requestedQty > line.bomQty - line.previouslyIssued;
                return (
                  <tr key={line.id} className={over ? "row-late" : undefined}>
                    <td><span className="cell-text mono">{line.itemCode}</span></td>
                    <td><span className="cell-text mono">{line.partNo}</span></td>
                    <td><span className="cell-text num">{line.bomQty}</span></td>
                    <td><span className="cell-text num">{line.previouslyIssued}</span></td>
                    <td><span className="cell-text num"><strong>{line.requestedQty}</strong>{over ? " ⚠" : ""}</span></td>
                    <td><span className="cell-text num violet-text">{balance ? balance.reserved : "—"}</span></td>
                    <td><span className="cell-text num green-text">{balance ? balance.available : "—"}</span></td>
                    <td><span className="cell-text num"><strong>{line.issueQty}</strong></span></td>
                    <td><span className="cell-text num">{line.returnedQty || 0}</span></td>
                    <td><span className="cell-text mono">{line.location}</span></td>
                    <td><span className="cell-text">{line.purpose}</span></td>
                    <td><span className="cell-text">{line.workArea}</span></td>
                    <td><span className="cell-text mono">{line.lotNo}</span></td>
                    <td>
                      {line.issueQty > 0 && mir.status !== "Pending Approval"
                        ? <Badge tone="green">{t("Issued")}</Badge>
                        : over ? <Badge tone="red">{t("Over BOM — needs approval")}</Badge>
                          : balance && balance.reserved + balance.available >= line.requestedQty
                            ? <Badge tone="blue">{t("Covered")}</Badge>
                            : <Badge tone="amber">{t("Short")}</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="grid-main">
        <Panel title={t("Responsibility")} subtitle={t("Exact actor history — who asked, who approved, who picked, who received")} flush>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><td>{t("Requested By")}</td><td><Person initials={userOf(mir.requestedBy)?.initials ?? "—"} name={userName(mir.requestedBy)} /></td><td className="muted">{mir.requestedAt}</td></tr>
                <tr><td>{t("Approved By")}</td><td>{mir.approvedBy ? <Person initials={userOf(mir.approvedBy)?.initials ?? "—"} name={userName(mir.approvedBy)} /> : "—"}</td><td className="muted">{mir.approvedAt}</td></tr>
                <tr><td>{t("Picked By")}</td><td>{mir.pickedBy ? <Person initials={userOf(mir.pickedBy)?.initials ?? "—"} name={userName(mir.pickedBy)} /> : "—"}</td><td className="muted" /></tr>
                <tr><td>{t("Issued By")}</td><td>{mir.issuedBy ? <Person initials={userOf(mir.issuedBy)?.initials ?? "—"} name={userName(mir.issuedBy)} /> : "—"}</td><td className="muted">{mir.issuedAt}</td></tr>
                <tr><td>{t("Received By")}</td><td>{mir.receivedBy ? <Person initials={userOf(mir.receivedBy)?.initials ?? "—"} name={userName(mir.receivedBy)} /> : "—"}</td><td className="muted">{mir.receivedAt}</td></tr>
                <tr><td>{t("Used For")}</td><td colSpan={2}>{mir.purpose} · {mir.workArea} · {project.no}</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={t("Returns and damage")} flush>
          <div className="panel-body">
            {["Received", "Completed"].includes(mir.status) && isRequester ? (
              <>
                <p className="muted">{t("Unused material goes back to the store on a return transaction — it re-enters Available Stock and reduces the project's actual cost.")}</p>
                {mir.lines.filter((line) => line.issueQty - line.returnedQty > 0).map((line) => (
                  <div className="file-row" key={line.id}>
                    <span className="file-icon"><Icon name="refresh" /></span>
                    <div style={{ flex: 1 }}><strong>{line.partNo}</strong><small>{t("issued")} {line.issueQty} · {t("returned")} {line.returnedQty}</small></div>
                    <button className="btn default sm" type="button" onClick={() => setReturnFor(line.id)}>{t("Return Material")}</button>
                  </div>
                ))}
              </>
            ) : (
              <p className="muted">{t("Returns open after the member confirms receipt.")}</p>
            )}
            <button className="btn default sm" type="button" style={{ marginTop: 8 }} onClick={() => notify(t("Damage / loss report DR-2609-#### drafted — the inventory controller is notified"))}>
              <Icon name="alertTriangle" />{t("Report Damage or Loss")}
            </button>
          </div>
        </Panel>
      </section>

      {decideOpen ? (
        <DecideModal
          decision={decideOpen}
          overBom={overBom}
          onClose={() => setDecideOpen("")}
          onDone={(comment) => {
            const error = decideMir(mir.id, decideOpen, comment, session);
            setDecideOpen("");
            notify(error || (decideOpen === "Approve" ? t("Approved — the warehouse can pick") : t("Rejected — returned to the requester as a draft")));
          }}
        />
      ) : null}

      {returnFor ? (
        <ReturnModal
          mir={mir} lineId={returnFor}
          onClose={() => setReturnFor("")}
          onDone={(qty, reason) => {
            returnMaterial(mir.id, returnFor, qty, reason, session);
            setReturnFor("");
            notify(t("Return posted — the quantity is back in Available Stock"));
          }}
        />
      ) : null}
    </>
  );
}

function DecideModal({ decision, overBom, onClose, onDone }: {
  decision: "Approve" | "Reject"; overBom: boolean; onClose: () => void; onDone: (comment: string) => void;
}) {
  const t = useT();
  const [comment, setComment] = useState("");
  return (
    <Modal
      title={decision === "Approve" ? t("Approve issue request") : t("Reject issue request")}
      subtitle={overBom && decision === "Approve" ? t("This request exceeds the remaining BOM quantity — your comment goes on the audit record.") : undefined}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn primary" type="button" disabled={!comment.trim()} onClick={() => onDone(comment.trim())}>
            <Icon name={decision === "Approve" ? "check" : "x"} />{t(decision)}
          </button>
        </>
      }
    >
      <Field label={t("Comment (required)")}>
        <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("Why — the requester sees this")} />
      </Field>
    </Modal>
  );
}

function ReturnModal({ mir, lineId, onClose, onDone }: {
  mir: Mir; lineId: string; onClose: () => void; onDone: (qty: number, reason: string) => void;
}) {
  const t = useT();
  const line = mir.lines.find((entry) => entry.id === lineId)!;
  const max = line.issueQty - line.returnedQty;
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  return (
    <Modal
      title={`${t("Return Material")} — ${line.partNo}`}
      subtitle={`${t("issued")} ${line.issueQty} · ${t("already returned")} ${line.returnedQty}`}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn primary" type="button" disabled={qty < 1 || qty > max || !reason.trim()} onClick={() => onDone(qty, reason.trim())}>
            <Icon name="refresh" />{t("Post return")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t("Return quantity")}><input className="num" type="number" min={1} max={max} value={qty} onChange={(event) => setQty(Number(event.target.value))} /></Field>
        <Field label={t("Reason (required)")} span={3}><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("e.g. over-picked / not used")} /></Field>
      </div>
    </Modal>
  );
}
