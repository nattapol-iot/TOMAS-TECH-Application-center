"use client";

import { PROJECTS } from "../data";
import { formatDate, matPermission, moneyShort, poFacts, poLineReceived, userName, userOf } from "../calc";
import { confirmGrn, useMatStore } from "../matstore";
import { useSession } from "../session";
import { Badge, Icon, Panel, PageHeader, Person, Pill } from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";

/* ==========================================================================
   Purchase orders
   ========================================================================== */

export function PoList({ go }: ScreenProps) {
  const t = useT();
  const store = useMatStore();

  return (
    <>
      <PageHeader
        eyebrow={t("MATERIAL & PROCUREMENT")}
        title={t("Purchase Orders")}
        subtitle={t("One PO per supplier, always born from an approved PR — receiving quantity is tracked line by line.")}
      />
      <Panel title={`${store.pos.length} ${t("purchase orders")}`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("PO No.")}</th><th>{t("Supplier")}</th><th>{t("Project")}</th><th>{t("From PR")}</th>
                <th>{t("Order Date")}</th><th>{t("Expected")}</th>
                <th className="num">{t("Ordered")}</th><th className="num">{t("Received")}</th>
                <th className="num">{t("PO Value")}</th><th className="num">{t("Open Value")}</th>
                <th>{t("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {store.pos.map((po) => {
                const facts = poFacts(po);
                const project = PROJECTS.find((entry) => entry.id === po.projectId);
                const pr = store.prs.find((entry) => entry.id === po.prId);
                return (
                  <tr key={po.id} className={facts.overdue ? "row-late" : undefined}>
                    <td><strong className="mono">{po.no}</strong></td>
                    <td>{po.supplier}</td>
                    <td><button className="link-btn" type="button" onClick={() => go({ name: "project", id: po.projectId })}>{project?.no}</button></td>
                    <td><button className="link-btn mono" type="button" onClick={() => pr && go({ name: "pr", id: pr.id })}>{pr?.no}</button></td>
                    <td>{formatDate(po.orderDate)}</td>
                    <td className={facts.overdue ? "red-text" : undefined}>{po.expectedDate ? formatDate(po.expectedDate) : t("waiting confirmation")}</td>
                    <td className="num">{facts.ordered}</td>
                    <td className="num">{facts.received}</td>
                    <td className="num"><strong>{moneyShort(facts.value)}</strong></td>
                    <td className="num"><span className={facts.openValue ? "violet-text" : "green-text"}>{moneyShort(facts.openValue)}</span></td>
                    <td>
                      <Badge tone={po.status === "Received" || po.status === "Closed" ? "green" : po.status === "Partially Received" ? "amber" : "violet"}>
                        {facts.overdue ? t("Overdue") : t(po.status)}
                      </Badge>
                    </td>
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
   Screen 5 — goods receiving
   ========================================================================== */

export function GrnList({ go, notify }: ScreenProps) {
  const t = useT();
  const session = useSession();
  const store = useMatStore();
  const perm = matPermission(session.user, session.role);

  return (
    <>
      <PageHeader
        eyebrow={t("MATERIAL & PROCUREMENT")}
        title={t("Goods Receiving")}
        subtitle={t("Partial deliveries are normal — accepted quantity goes to stock, damaged and rejected quantity goes to quarantine, never to Available.")}
        actions={perm.canReceive ? (
          <button className="btn primary" type="button" onClick={() => notify(t("Select the PO on the receiving terminal to start a new receipt"))}>
            <Icon name="download" />{t("New Goods Receipt")}
          </button>
        ) : undefined}
      />

      <Panel title={t("Waiting for delivery")} subtitle={t("Open purchase order lines")} flush>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t("PO No.")}</th><th>{t("Supplier")}</th><th>{t("Item")}</th><th className="num">{t("Ordered")}</th><th className="num">{t("Received")}</th><th className="num">{t("Remaining")}</th><th>{t("Expected")}</th><th>{t("Status")}</th></tr></thead>
            <tbody>
              {store.pos.flatMap((po) => po.lines.map((line) => {
                const received = poLineReceived(line.id);
                if (received >= line.qty) return null;
                const overdue = poFacts(po).overdue;
                return (
                  <tr key={line.id} className={overdue ? "row-late" : undefined}>
                    <td className="mono">{po.no}</td>
                    <td>{po.supplier}</td>
                    <td><strong className="mono">{line.itemCode}</strong> · {line.partNo}</td>
                    <td className="num">{line.qty}</td>
                    <td className="num">{received}</td>
                    <td className="num"><strong>{line.qty - received}</strong></td>
                    <td className={overdue ? "red-text" : undefined}>{po.expectedDate ? formatDate(po.expectedDate) : "—"}</td>
                    <td><Badge tone={received > 0 ? "amber" : "violet"}>{received > 0 ? t("Partially Received") : t("On Order")}</Badge></td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`${store.grns.length} ${t("goods receipts")}`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>{t("GRN No.")}</th><th>{t("PO No.")}</th><th>{t("PR No.")}</th><th>{t("Supplier")}</th><th>{t("Received By")}</th><th>{t("Date")}</th><th className="num">{t("Received")}</th><th className="num">{t("Accepted")}</th><th className="num">{t("Damaged")}</th><th>{t("Delivery")}</th><th>{t("Status")}</th><th aria-label="Open" /></tr>
            </thead>
            <tbody>
              {store.grns.map((grn) => {
                const received = grn.lines.reduce((sum, line) => sum + line.receivedQty, 0);
                const accepted = grn.lines.reduce((sum, line) => sum + line.acceptedQty, 0);
                const damaged = grn.lines.reduce((sum, line) => sum + line.damagedQty + line.rejectedQty, 0);
                const pr = store.prs.find((entry) => entry.id === grn.prId);
                return (
                  <tr key={grn.id} className="clickable" onClick={() => go({ name: "grn", id: grn.id })}>
                    <td><strong className="mono">{grn.no}</strong></td>
                    <td className="mono">{store.pos.find((entry) => entry.id === grn.poId)?.no}</td>
                    <td className="mono">{pr?.no}</td>
                    <td>{grn.supplier}</td>
                    <td><Person initials={userOf(grn.receivedBy)?.initials ?? "—"} name={userName(grn.receivedBy)} /></td>
                    <td>{grn.receivedAt.slice(0, 10)}</td>
                    <td className="num">{received}</td>
                    <td className="num green-text">{accepted}</td>
                    <td className="num">{damaged ? <span className="red-text">{damaged}</span> : 0}</td>
                    <td><Badge tone={grn.deliveryStatus === "Full Delivery" ? "green" : "amber"}>{t(grn.deliveryStatus)}</Badge></td>
                    <td><Badge tone={grn.status === "Confirmed" ? "green" : "slate"}>{t(grn.status)}</Badge></td>
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

export function GrnDetail({ id, go, notify }: ScreenProps & { id: string }) {
  const t = useT();
  const session = useSession();
  const store = useMatStore();
  const perm = matPermission(session.user, session.role);
  const grn = store.grns.find((entry) => entry.id === id) ?? store.grns[0];
  const po = store.pos.find((entry) => entry.id === grn.poId);
  const pr = store.prs.find((entry) => entry.id === grn.prId);

  return (
    <>
      <div className="breadcrumb">
        <button type="button" onClick={() => go({ name: "receiving" })}>{t("Goods Receiving")}</button>
        <Icon name="chevronRight" />
        <span>{grn.no}</span>
      </div>

      <PageHeader
        eyebrow={`${po?.no} · ${pr?.no}`}
        title={`${t("Goods Receipt")} ${grn.no}`}
        subtitle={`${grn.supplier} · ${t("Received By")} ${userName(grn.receivedBy)} (${t("Warehouse")}) · ${grn.receivedAt}`}
        meta={
          <>
            <div><span>{t("Delivery Note")}</span><strong className="mono">{grn.deliveryNote}</strong></div>
            <div><span>{t("Invoice Reference")}</span><strong className="mono">{grn.invoiceRef}</strong></div>
            <div><span>{t("Warehouse")}</span><strong>{grn.warehouse}</strong></div>
            <div><span>{t("Delivery Status")}</span><strong><Badge tone={grn.deliveryStatus === "Full Delivery" ? "green" : "amber"}>{t(grn.deliveryStatus)}</Badge></strong></div>
            <div><span>{t("Photos")}</span><strong>{grn.photos} {t("attached")}</strong></div>
          </>
        }
        actions={
          <>
            <button className="btn default" type="button" onClick={() => po && notify(`${po.no} ${t("opened")}`)}><Icon name="truck" />{t("View PO")}</button>
            <button className="btn default" type="button" onClick={() => pr && go({ name: "pr", id: pr.id })}><Icon name="file" />{t("View PR")}</button>
            <button className="btn default" type="button" onClick={() => notify(t("Receiving label printed"))}><Icon name="grid" />{t("Print Receiving Label")}</button>
            <button className="btn default" type="button" onClick={() => notify(`${userName(pr?.requestedBy ?? "")} ${t("notified — partial delivery received")}`)}><Icon name="bell" />{t("Notify Requester")}</button>
            {grn.status === "Draft" && perm.canReceive ? (
              <button className="btn primary" type="button" onClick={() => { const error = confirmGrn(grn.id, session); notify(error || t("Receipt confirmed — accepted quantity is now in stock, damage is in quarantine")); }}>
                <Icon name="check" />{t("Confirm Receipt")}
              </button>
            ) : null}
          </>
        }
      />

      {grn.damageReport ? (
        <div className="info-strip amber"><Icon name="alertTriangle" />{t("Damage Report")}: {grn.damageReport} — {t("damaged quantity is in quarantine, not in Available Stock")}</div>
      ) : null}

      <Panel title={t("Received lines")} subtitle={t("Accepted → stock · Damaged / Rejected → quarantine · Remaining stays On Order")} flush>
        <div className="table-wrap">
          <table className="sheet" style={{ minWidth: 1500 }}>
            <colgroup>
              {[110, 150, 64, 64, 64, 64, 64, 64, 64, 52, 110, 90, 92, 88, 150, 160].map((width, index) => <col key={index} style={{ width }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>{t("Item")}</th><th>{t("Part Number")}</th>
                <th className="num">{t("Ordered")}</th><th className="num">{t("Prev. Received")}</th><th className="num">{t("This Time")}</th>
                <th className="num">{t("Remaining")}</th><th className="num">{t("Accepted")}</th><th className="num">{t("Damaged")}</th><th className="num">{t("Rejected")}</th>
                <th>{t("Unit")}</th><th>{t("Lot No.")}</th><th>{t("Serial")}</th><th>{t("Location")}</th><th>{t("QC")}</th>
                <th>{t("Project Allocation")}</th><th>{t("Remark")}</th>
              </tr>
            </thead>
            <tbody>
              {grn.lines.map((line) => (
                <tr key={line.id}>
                  <td><span className="cell-text mono">{line.itemCode}</span></td>
                  <td><span className="cell-text mono">{line.partNo}</span></td>
                  <td><span className="cell-text num">{line.orderedQty}</span></td>
                  <td><span className="cell-text num">{line.previouslyReceived}</span></td>
                  <td><span className="cell-text num"><strong>{line.receivedQty}</strong></span></td>
                  <td><span className="cell-text num amber-text">{line.orderedQty - line.previouslyReceived - line.receivedQty}</span></td>
                  <td><span className="cell-text num green-text"><strong>{line.acceptedQty}</strong></span></td>
                  <td><span className="cell-text num red-text">{line.damagedQty || 0}</span></td>
                  <td><span className="cell-text num red-text">{line.rejectedQty || 0}</span></td>
                  <td><span className="cell-text">{line.unit}</span></td>
                  <td><span className="cell-text mono">{line.lotNo}</span></td>
                  <td><span className="cell-text mono">{line.serialNo}</span></td>
                  <td><span className="cell-text mono">{line.location}</span></td>
                  <td><Badge tone={line.qcStatus === "Passed" ? "green" : line.qcStatus === "Failed" ? "red" : "amber"}>{t(line.qcStatus)}</Badge></td>
                  <td><span className="cell-text">{line.projectAllocation}</span></td>
                  <td><span className="cell-text muted">{line.remark}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sticky-foot">
          <div className="foot-item"><span>{t("Ordered")}</span><strong>{grn.lines.reduce((sum, line) => sum + line.orderedQty, 0)}</strong></div>
          <div className="foot-item"><span>{t("Received This Time")}</span><strong>{grn.lines.reduce((sum, line) => sum + line.receivedQty, 0)}</strong></div>
          <div className="foot-item"><span>{t("Accepted → stock")}</span><strong>{grn.lines.reduce((sum, line) => sum + line.acceptedQty, 0)}</strong></div>
          <div className="foot-item"><span>{t("Quarantine")}</span><strong>{grn.lines.reduce((sum, line) => sum + line.damagedQty + line.rejectedQty, 0)}</strong></div>
          <div className="foot-total"><span>{t("Remaining on order")}</span><strong>{grn.lines.reduce((sum, line) => sum + line.orderedQty - line.previouslyReceived - line.receivedQty, 0)}</strong></div>
        </div>
      </Panel>

      <section className="grid-main">
        <Panel title={t("Receiving rules")} flush>
          <ul className="check-list" style={{ padding: 14 }}>
            <li className="check-item pass"><Icon name="checkCircle" /><div><strong>{t("Damaged, rejected and quarantine quantities never enter Available Stock")}</strong></div></li>
            <li className="check-item pass"><Icon name="checkCircle" /><div><strong>{t("Receiving more than the PO quantity requires approval")}</strong></div></li>
            <li className="check-item pass"><Icon name="checkCircle" /><div><strong>{t("Every receipt writes ledger transactions — the balance is never typed")}</strong></div></li>
          </ul>
        </Panel>
        <Panel title={t("Supporting documents")} flush>
          <div className="panel-body">
            <div className="file-row"><span className="file-icon"><Icon name="file" /></span><div style={{ flex: 1 }}><strong>{grn.deliveryNote}.pdf</strong><small>{t("Delivery Note")}</small></div><Pill>PDF</Pill></div>
            <div className="file-row"><span className="file-icon"><Icon name="file" /></span><div style={{ flex: 1 }}><strong>{grn.invoiceRef}.pdf</strong><small>{t("Invoice Reference")}</small></div><Pill>PDF</Pill></div>
            {grn.damageReport ? <div className="file-row"><span className="file-icon"><Icon name="alertTriangle" /></span><div style={{ flex: 1 }}><strong>DR-2608-0002.pdf</strong><small>{t("Damage Report")} · 3 {t("photos")}</small></div><Pill tone="red">QC</Pill></div> : null}
          </div>
        </Panel>
      </section>
    </>
  );
}
