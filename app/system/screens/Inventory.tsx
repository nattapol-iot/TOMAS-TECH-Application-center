"use client";

import { useState } from "react";
import { BOM_LINES, BOMS, MAT_ITEMS, PROJECTS, type MatItem } from "../data";
import {
  formatDate, inventoryTone, isSlowMoving, matPermission, moneyShort, stockBalance,
  userName, userOf,
} from "../calc";
import { decideAdjustment, releaseReservation, requestAdjustment, useMatStore } from "../matstore";
import { useSession } from "../session";
import {
  Badge, Drawer, EmptyState, Field, Icon, Modal, Panel, PageHeader, Pill, SearchInput, Toolbar,
} from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";

export default function Inventory({ go, notify }: ScreenProps) {
  const t = useT();
  const session = useSession();
  const store = useMatStore();
  const perm = matPermission(session.user, session.role);
  const [search, setSearch] = useState("");
  const [ledgerFor, setLedgerFor] = useState<MatItem | null>(null);
  const [rejectAdj, setRejectAdj] = useState("");
  const [adjustFor, setAdjustFor] = useState<MatItem | null>(null);

  const rows = MAT_ITEMS
    .map((item) => ({ item, balance: stockBalance(item.id) }))
    .filter(({ item }) => !search || `${item.itemCode} ${item.partNo} ${item.description} ${item.brand}`.toLowerCase().includes(search.toLowerCase()));

  const totalValue = rows.reduce((sum, { item, balance }) => sum + balance.onHand * item.avgUnitCost, 0);
  const availableValue = rows.reduce((sum, { item, balance }) => sum + Math.max(0, balance.available) * item.avgUnitCost, 0);
  const reservedValue = rows.reduce((sum, { item, balance }) => sum + balance.reserved * item.avgUnitCost, 0);
  const onOrderValue = rows.reduce((sum, { item, balance }) => sum + balance.onOrder * item.avgUnitCost, 0);
  const quarantineCount = rows.reduce((sum, { balance }) => sum + balance.quarantine, 0);
  const pendingIssues = store.mirs.filter((mir) => ["Pending Approval", "Approved", "Picking"].includes(mir.status)).length;
  const slowMoving = MAT_ITEMS.filter((item) => isSlowMoving(item.id)).length;
  const pendingAdjustments = store.adjustments.filter((adjustment) => adjustment.status === "Pending Approval");

  const activeReservations = store.reservations.filter((rsv) => rsv.status === "Active");

  return (
    <>
      <PageHeader
        eyebrow={t("MATERIAL & PROCUREMENT")}
        title={t("Inventory")}
        subtitle={t("Every balance is computed from the transaction ledger — On Hand includes quarantine; Available = On Hand − Reserved − Quarantine.")}
        actions={
          <>
            <button className="btn default" type="button" onClick={() => notify(t("Cycle count CC-2609-0001 started for WH1 — count sheet printed"))}><Icon name="refresh" />{t("Start Cycle Count")}</button>
            <button className="btn default" type="button" onClick={() => notify(t("QR labels sent to the label printer"))}><Icon name="grid" />{t("Print QR Label")}</button>
          </>
        }
      />

      <section className="kpi-grid eight">
        <div className="kpi blue"><span className="kpi-icon"><Icon name="database" /></span><span className="kpi-body"><span className="kpi-label">{t("Total Inventory Value")}</span><strong className="kpi-value">{moneyShort(totalValue)}</strong><span className="kpi-note">{MAT_ITEMS.length} {t("items")}</span></span></div>
        <div className="kpi green"><span className="kpi-icon"><Icon name="checkCircle" /></span><span className="kpi-body"><span className="kpi-label">{t("Available Stock")}</span><strong className="kpi-value">{moneyShort(availableValue)}</strong><span className="kpi-note">{t("free to allocate")}</span></span></div>
        <div className="kpi violet"><span className="kpi-icon"><Icon name="lock" /></span><span className="kpi-body"><span className="kpi-label">{t("Reserved Stock")}</span><strong className="kpi-value">{moneyShort(reservedValue)}</strong><span className="kpi-note">{activeReservations.length} {t("reservations")}</span></span></div>
        <div className="kpi violet"><span className="kpi-icon"><Icon name="truck" /></span><span className="kpi-body"><span className="kpi-label">{t("On Order")}</span><strong className="kpi-value">{moneyShort(onOrderValue)}</strong><span className="kpi-note">{t("ordered − received")}</span></span></div>
        <div className="kpi amber"><span className="kpi-icon"><Icon name="alertTriangle" /></span><span className="kpi-body"><span className="kpi-label">{t("Quarantine")}</span><strong className="kpi-value">{quarantineCount}</strong><span className="kpi-note">{t("waiting inspection or action")}</span></span></div>
        <div className="kpi blue"><span className="kpi-icon"><Icon name="upload" /></span><span className="kpi-body"><span className="kpi-label">{t("Pending Issues")}</span><strong className="kpi-value">{pendingIssues}</strong><span className="kpi-note">{t("requests to pick")}</span></span></div>
        <div className="kpi amber"><span className="kpi-icon"><Icon name="clock" /></span><span className="kpi-body"><span className="kpi-label">{t("Slow-moving Items")}</span><strong className="kpi-value">{slowMoving}</strong><span className="kpi-note">{t("no movement, nothing reserved")}</span></span></div>
        <div className="kpi red"><span className="kpi-icon"><Icon name="edit" /></span><span className="kpi-body"><span className="kpi-label">{t("Adjustments Pending")}</span><strong className="kpi-value">{pendingAdjustments.length}</strong><span className="kpi-note">{t("inventory controller approval")}</span></span></div>
      </section>

      {pendingAdjustments.length ? (
        <Panel title={t("Stock Adjustments Pending Approval")} subtitle={t("A balance is never edited — an approved adjustment writes a ledger transaction")} flush>
          <div className="panel-body">
            {pendingAdjustments.map((adjustment) => {
              const item = MAT_ITEMS.find((entry) => entry.id === adjustment.itemId)!;
              return (
                <div className="request-row" key={adjustment.id}>
                  <div className="request-head">
                    <strong className="mono">{adjustment.no}</strong>
                    <span>{item.itemCode} · {item.partNo}</span>
                    <Pill tone={adjustment.qtyChange < 0 ? "red" : "green"}>{adjustment.qtyChange > 0 ? "+" : ""}{adjustment.qtyChange}</Pill>
                    <span className="muted">{t("by")} {userName(adjustment.requestedBy)} · {adjustment.requestedAt}</span>
                  </div>
                  <p className="muted">{adjustment.reason}</p>
                  {perm.canApproveAdjustment ? (
                    <div className="row tight">
                      <button className="btn primary sm" type="button" onClick={() => { const error = decideAdjustment(adjustment.id, "Approved", "", session); notify(error || t("Adjustment approved — ledger transaction written")); }}>
                        <Icon name="check" />{t("Approve")}
                      </button>
                      <button className="btn default sm" type="button" onClick={() => setRejectAdj(adjustment.id)}>
                        <Icon name="x" />{t("Reject")}
                      </button>
                    </div>
                  ) : <p className="muted">{t("Waiting for the inventory controller")}</p>}
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t("Search item code, part number, description or brand…")} />
      </Toolbar>

      <Panel title={`${rows.length} ${t("items")}`} subtitle={t("Click a row for the transaction ledger — balances cannot be typed over")} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Item Code")}</th><th>{t("Model / Part No.")}</th><th>{t("Description")}</th><th>{t("Brand")}</th>
                <th>{t("Location")}</th>
                <th className="num">{t("On Hand")}</th><th className="num">{t("Reserved")}</th><th className="num">{t("Available")}</th>
                <th className="num">{t("On Order")}</th><th className="num">{t("Quar.")}</th><th className="num">{t("Issued (month)")}</th>
                <th className="num">{t("Reorder")}</th><th className="num">{t("Avg Cost")}</th><th className="num">{t("Value")}</th>
                <th>{t("Last Movement")}</th><th>{t("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, balance }) => {
                const slow = isSlowMoving(item.id);
                return (
                  <tr key={item.id} className="clickable" onClick={() => setLedgerFor(item)}>
                    <td><strong className="mono">{item.itemCode}</strong></td>
                    <td className="mono">{item.partNo}</td>
                    <td>{item.description}</td>
                    <td>{item.brand}</td>
                    <td className="mono">{item.location}</td>
                    <td className="num"><strong>{balance.onHand}</strong></td>
                    <td className="num">{balance.reserved ? <span className="violet-text">{balance.reserved}</span> : 0}</td>
                    <td className="num"><strong className={balance.available > 0 ? "green-text" : balance.available < 0 ? "red-text" : undefined}>{balance.available}</strong></td>
                    <td className="num">{balance.onOrder ? <span className="violet-text">{balance.onOrder}</span> : 0}</td>
                    <td className="num">{balance.quarantine ? <span className="amber-text">{balance.quarantine}</span> : 0}</td>
                    <td className="num">{balance.issuedThisMonth}</td>
                    <td className="num muted">{item.reorderLevel}</td>
                    <td className="num">{moneyShort(item.avgUnitCost)}</td>
                    <td className="num"><strong>{moneyShort(balance.onHand * item.avgUnitCost)}</strong></td>
                    <td>{balance.lastMovement ? formatDate(balance.lastMovement.slice(0, 10)) : "—"}</td>
                    <td>
                      {slow ? <Badge tone="amber">{t("Slow-moving")}</Badge>
                        : <Badge tone={inventoryTone(balance, item.reorderLevel)}>
                          {balance.quarantine > 0 ? t("Quarantine")
                            : balance.available < 0 ? t("Over-reserved")
                              : balance.usable <= item.reorderLevel && balance.onOrder === 0 ? t("Low stock")
                                : balance.available === 0 && balance.reserved > 0 ? t("Fully reserved") : t("OK")}
                        </Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={t("Stock Allocation")} subtitle={t("Active reservations — one quantity belongs to one project until it is released or issued")} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>{t("Item")}</th><th>{t("Project")}</th><th>{t("BOM")}</th><th className="num">{t("Reserved Qty")}</th><th>{t("Required")}</th><th>{t("Owner")}</th><th>{t("Status")}</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {activeReservations.map((rsv) => {
                const item = MAT_ITEMS.find((entry) => entry.id === rsv.itemId)!;
                const project = PROJECTS.find((entry) => entry.id === rsv.projectId);
                return (
                  <tr key={rsv.id}>
                    <td><strong className="mono">{item.itemCode}</strong> · {item.partNo}</td>
                    <td>
                      <button className="link-btn" type="button" onClick={() => go({ name: "project", id: rsv.projectId })}>{project?.no}</button>
                      <span className="muted"> {project?.name}</span>
                    </td>
                    <td className="mono">{(() => {
                      const bomLine = BOM_LINES.find((entry) => entry.id === rsv.bomLineId);
                      return bomLine ? BOMS.find((entry) => entry.id === bomLine.bomId)?.no ?? "—" : "—";
                    })()}</td>
                    <td className="num"><strong>{rsv.qty}</strong></td>
                    <td>{formatDate(rsv.requiredDate)}</td>
                    <td>{userName(rsv.ownerId)}</td>
                    <td><Badge tone="blue">{t(rsv.status)}</Badge></td>
                    <td>
                      {perm.canReserve ? (
                        <button className="row-action" type="button" title={t("Release Reservation")} onClick={() => { releaseReservation(rsv.id, session); notify(`${item.partNo} ${t("reservation released back to available stock")}`); }}>
                          <Icon name="x" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!activeReservations.length ? <tr><td colSpan={8}><EmptyState icon="lock" title={t("No active reservation")} message={t("Reserve stock from a BOM line or from this screen.")} /></td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>

      {ledgerFor ? (
        <Drawer
          title={`${ledgerFor.itemCode} — ${ledgerFor.partNo}`}
          subtitle={`${ledgerFor.description} · ${t("Avg Cost")} ${moneyShort(ledgerFor.avgUnitCost)} THB`}
          width={640}
          onClose={() => setLedgerFor(null)}
        >
          {(() => {
            const balance = stockBalance(ledgerFor.id);
            const txns = store.txns.filter((txn) => txn.itemId === ledgerFor.id).slice().reverse();
            return (
              <>
                <section className="summary-strip" style={{ marginBottom: 12 }}>
                  <div className="summary-tile"><span>{t("On Hand")}</span><strong>{balance.onHand}</strong></div>
                  <div className="summary-tile"><span>{t("Reserved")}</span><strong>{balance.reserved}</strong></div>
                  <div className="summary-tile"><span>{t("Available")}</span><strong className={balance.available > 0 ? "green-text" : undefined}>{balance.available}</strong></div>
                  <div className="summary-tile"><span>{t("On Order")}</span><strong>{balance.onOrder}</strong></div>
                  <div className="summary-tile"><span>{t("Quarantine")}</span><strong>{balance.quarantine}</strong></div>
                </section>
                <p className="muted" style={{ margin: "0 0 8px" }}>
                  <Icon name="lock" /> {t("Transaction Ledger — append-only. Balances are the sum of these rows; nobody can type over them.")}
                </p>
                {perm.canAdjustStock ? (
                  <div className="row tight" style={{ marginBottom: 10 }}>
                    <button className="btn default sm" type="button" onClick={() => setAdjustFor(ledgerFor)}>
                      <Icon name="edit" />{t("Adjust Stock")}
                    </button>
                    <button className="btn default sm" type="button" onClick={() => notify(t("Transfer posted as a ledger transaction — pick the target location on the store terminal"))}>
                      <Icon name="refresh" />{t("Transfer Stock")}
                    </button>
                  </div>
                ) : null}
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>{t("Date")}</th><th>{t("Type")}</th><th className="num">{t("Qty")}</th><th>{t("Ref.")}</th><th>{t("Project")}</th><th>{t("By")}</th><th>{t("Note")}</th></tr></thead>
                    <tbody>
                      {txns.map((txn) => (
                        <tr key={txn.id}>
                          <td className="mono" style={{ whiteSpace: "nowrap" }}>{txn.at.slice(0, 16)}</td>
                          <td><Badge tone={txn.type === "Goods Receipt" || txn.type === "Material Return" ? "green" : txn.type === "Material Issue" ? "blue" : txn.type.startsWith("Quarantine") ? "amber" : "slate"}>{t(txn.type)}</Badge></td>
                          <td className="num"><strong className={txn.qty < 0 ? "red-text" : "green-text"}>{txn.qty > 0 ? "+" : ""}{txn.qty}</strong></td>
                          <td className="mono">{txn.refNo}</td>
                          <td>{txn.projectId ? PROJECTS.find((entry) => entry.id === txn.projectId)?.no : "—"}</td>
                          <td>{userOf(txn.byId)?.initials}</td>
                          <td className="muted">{txn.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </Drawer>
      ) : null}

      {rejectAdj ? (
        <RejectAdjustmentModal
          onClose={() => setRejectAdj("")}
          onDone={(comment) => {
            const error = decideAdjustment(rejectAdj, "Rejected", comment, session);
            setRejectAdj("");
            notify(error || t("Adjustment rejected"));
          }}
        />
      ) : null}

      {adjustFor ? (
        <AdjustStockModal
          item={adjustFor}
          onClose={() => setAdjustFor(null)}
          onDone={(qtyChange, reason) => {
            const error = requestAdjustment(adjustFor.id, qtyChange, reason, session);
            setAdjustFor(null);
            notify(error || t("Adjustment requested — pending the inventory controller"));
          }}
        />
      ) : null}
    </>
  );
}

function RejectAdjustmentModal({ onClose, onDone }: { onClose: () => void; onDone: (comment: string) => void }) {
  const t = useT();
  const [comment, setComment] = useState("");
  return (
    <Modal
      title={t("Reject adjustment")}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn primary" type="button" disabled={!comment.trim()} onClick={() => onDone(comment.trim())}>
            <Icon name="x" />{t("Reject")}
          </button>
        </>
      }
    >
      <Field label={t("Comment (required)")}>
        <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("Why the count is not accepted")} />
      </Field>
    </Modal>
  );
}

function AdjustStockModal({ item, onClose, onDone }: {
  item: MatItem; onClose: () => void; onDone: (qtyChange: number, reason: string) => void;
}) {
  const t = useT();
  const [qtyChange, setQtyChange] = useState(-1);
  const [reason, setReason] = useState("");
  return (
    <Modal
      title={`${t("Adjust Stock")} — ${item.partNo}`}
      subtitle={t("An adjustment never edits the balance — it waits for the inventory controller, then writes a ledger transaction.")}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn primary" type="button" disabled={!qtyChange || !reason.trim()} onClick={() => onDone(qtyChange, reason.trim())}>
            <Icon name="check" />{t("Request adjustment")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t("Quantity change")}><input className="num" type="number" value={qtyChange} onChange={(event) => setQtyChange(Number(event.target.value))} /></Field>
        <Field label={t("Reason (required)")} span={3}><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("e.g. cycle count found a discrepancy")} /></Field>
      </div>
    </Modal>
  );
}
