"use client";

import { useMemo, useState } from "react";
import {
  BOM_LINES, BOM_SECTIONS, BOMS, CUSTOMERS, ESTIMATES, PROJECTS,
  type BomLine,
} from "../data";
import {
  bomLineFacts, bomStatusTone, formatDate, matKpis, matPermission, money, moneyShort,
  stockBalance, traceChain, userName, userOf,
} from "../calc";
import { reserveStock, useMatStore } from "../matstore";
import { useSession } from "../session";
import { Badge, Icon, Modal, Panel, PageHeader, SummaryTile } from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";

/* ==========================================================================
   BOM list
   ========================================================================== */

export function BomList({ go }: ScreenProps) {
  const t = useT();
  useMatStore();

  return (
    <>
      <PageHeader
        eyebrow={t("MATERIAL & PROCUREMENT")}
        title={t("Bill of Materials")}
        subtitle={t("Generated from the approved estimate — every line keeps its link back to the estimate and forward to PR, PO, receipt and issue.")}
      />
      <Panel title={`${BOMS.length} BOM`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("BOM No.")}</th><th>{t("Rev.")}</th><th>{t("Project")}</th><th>{t("Customer")}</th>
                <th>{t("Estimate")}</th><th className="num">{t("Lines")}</th><th className="num">{t("BOM Budget")}</th>
                <th className="num">{t("Purchase Required")}</th><th>{t("Generated")}</th><th>{t("Status")}</th><th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {BOMS.map((bom) => {
                const project = PROJECTS.find((entry) => entry.id === bom.projectId);
                const customer = CUSTOMERS.find((entry) => entry.id === project?.customerId);
                const estimate = ESTIMATES.find((entry) => entry.id === bom.estimateId);
                const lines = BOM_LINES.filter((line) => line.bomId === bom.id);
                const shortage = lines.filter((line) => bomLineFacts(line).purchaseRequired > 0).length;
                return (
                  <tr key={bom.id} className="clickable" onClick={() => go({ name: "bom", id: bom.id })}>
                    <td><strong className="mono">{bom.no}</strong></td>
                    <td><span className="pill">{bom.revision}</span></td>
                    <td><strong>{project?.name}</strong><div className="mono muted" style={{ fontSize: 11 }}>{project?.no}</div></td>
                    <td>{customer?.code}</td>
                    <td className="mono">{estimate?.no} {bom.estimateRev}</td>
                    <td className="num">{lines.length}</td>
                    <td className="num">{moneyShort(lines.reduce((sum, line) => sum + line.qtyRequired * line.estUnitCost, 0))}</td>
                    <td className="num">{shortage ? <Badge tone="red">{shortage} {t("lines")}</Badge> : <Badge tone="green">0</Badge>}</td>
                    <td>{formatDate(bom.generatedAt)} · {userName(bom.generatedBy)}</td>
                    <td><Badge tone={bom.status === "Released" ? "green" : bom.status === "Draft" ? "blue" : "slate"}>{t(bom.status)}</Badge></td>
                    <td><span className="row-action"><Icon name="chevronRight" /></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={t("Projects without a BOM")} subtitle={t("Generate the BOM the day the estimate is approved")} flush>
        <div className="panel-body">
          {PROJECTS.filter((project) => project.status !== "Closed" && !BOMS.some((bom) => bom.projectId === project.id)).slice(0, 4).map((project) => (
            <div className="file-row" key={project.id}>
              <span className="file-icon"><Icon name="layers" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{project.no} — {project.name}</strong>
                <small>{t("Estimate")}: {ESTIMATES.find((entry) => entry.id === project.estimateId)?.no ?? "—"}</small>
              </div>
              <button className="btn default sm" type="button" onClick={(event) => { event.stopPropagation(); go({ name: "project", id: project.id }); }}>
                {t("Open project")}
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

/* ==========================================================================
   Screen 1 — BOM & budget workspace
   ========================================================================== */

export function BomWorkspace({ id, go, notify }: ScreenProps & { id: string }) {
  const t = useT();
  const session = useSession();
  const store = useMatStore();
  const bom = BOMS.find((entry) => entry.id === id) ?? BOMS[0];
  const project = PROJECTS.find((entry) => entry.id === bom.projectId)!;
  const customer = CUSTOMERS.find((entry) => entry.id === project.customerId);
  const estimate = ESTIMATES.find((entry) => entry.id === bom.estimateId);
  const perm = matPermission(session.user, session.role);

  const [section, setSection] = useState("ALL");
  const [traceFor, setTraceFor] = useState<BomLine | null>(null);
  const [allocateFor, setAllocateFor] = useState<BomLine | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const lines = useMemo(
    () => BOM_LINES.filter((line) => line.bomId === bom.id),
    [bom.id, store.version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const kpis = matKpis(project.id);
  const locked = bom.status === "Released";

  const visible = lines.filter((line) => section === "ALL" || line.section === section || line.section.startsWith(`${section}.`));
  const shortageValue = lines.reduce((sum, line) => {
    const facts = bomLineFacts(line);
    return sum + facts.purchaseRequired * line.estUnitCost;
  }, 0);

  // Reconciliation: per estimate line, the BOM must not exceed the estimate budget.
  const reconcile = useMemo(() => {
    const byEstimate = new Map<string, number>();
    for (const line of lines) {
      byEstimate.set(line.estimateLineId, (byEstimate.get(line.estimateLineId) ?? 0) + line.qtyRequired * line.estUnitCost);
    }
    const over: { code: string; over: number }[] = [];
    for (const [estimateLineId, bomBudget] of byEstimate) {
      const estimateLine = estimate?.items.find((item) => item.id === estimateLineId);
      if (estimateLine && bomBudget > estimateLine.qty * estimateLine.unitCost) {
        over.push({ code: estimateLine.itemCode, over: bomBudget - estimateLine.qty * estimateLine.unitCost });
      }
    }
    return over;
  }, [lines, estimate]);

  const sectionCount = (code: string) =>
    lines.filter((line) => line.section === code || line.section.startsWith(`${code}.`)).length;

  return (
    <>
      <div className="breadcrumb">
        <button type="button" onClick={() => go({ name: "boms" })}>{t("Bill of Materials")}</button>
        <Icon name="chevronRight" />
        <span>{bom.no} {bom.revision}</span>
      </div>

      <PageHeader
        eyebrow={`${project.no} · ${project.inquiryNo} · ${estimate?.no} ${bom.estimateRev}`}
        title={`${t("BOM")} — ${project.name}`}
        subtitle={`${customer?.name} · ${bom.no} ${bom.revision} · ${t("Released by")} ${userName(bom.releasedBy)} ${formatDate(bom.releasedAt)}`}
        meta={
          <>
            <div><span>{t("Status")}</span><strong><Badge tone={locked ? "green" : "blue"}>{t(bom.status)}</Badge></strong></div>
            <div><span>{t("Lines")}</span><strong>{lines.length}</strong></div>
            <div><span>{t("Purchase shortage")}</span><strong className={shortageValue ? "red-text" : "green-text"}>{moneyShort(shortageValue)} THB</strong></div>
          </>
        }
        actions={
          <>
            <button className="btn default" type="button" onClick={() => setCompareOpen(true)}><Icon name="compare" />{t("Compare with Estimate")}</button>
            <button className="btn default" type="button" onClick={() => notify(t("BOM exported to Excel — values only, with the estimate references"))}><Icon name="download" />{t("Export BOM")}</button>
            {perm.canCreatePr ? (
              <button className="btn primary" type="button" onClick={() => go({ name: "pr-new", bomId: bom.id })}>
                <Icon name="package" />{t("Generate PR for Shortage")}
              </button>
            ) : null}
          </>
        }
      />

      {locked ? (
        <div className="info-strip">
          <Icon name="lock" />
          {t("This BOM is released — lines cannot be edited directly. Changes need a new BOM revision or an approved change request.")}
          <span className="spacer" />
          {perm.canReleaseBom ? (
            <button className="link-btn" type="button" onClick={() => notify(t("BOM revision R02 drafted — release it to supersede R01"))}>
              {t("Create BOM Revision")}<Icon name="arrowRight" />
            </button>
          ) : null}
        </div>
      ) : null}

      {reconcile.length === 0 ? (
        <div className="info-strip green">
          <Icon name="checkCircle" />
          {t("All BOM quantities reconcile with Estimate Revision")} {bom.estimateRev} — {t("BOM budget")} {moneyShort(kpis.bomBudget)} {t("of")} {moneyShort(kpis.approvedBudget)} THB
        </div>
      ) : (
        <div className="info-strip amber">
          <Icon name="alertTriangle" />
          {reconcile.length} {t("estimate line(s) exceeded by the BOM")}: {reconcile.map((entry) => `${entry.code} +${moneyShort(entry.over)}`).join(", ")}
        </div>
      )}

      <section className="summary-strip six">
        <SummaryTile label={t("Approved Budget")} value={moneyShort(kpis.approvedBudget)} note={`${estimate?.no} ${bom.estimateRev} · ${t("material")}`} />
        <SummaryTile label={t("Reserved Stock Value")} value={moneyShort(kpis.reservedValue)} tone="blue" />
        <SummaryTile label={t("Open Commitment")} value={moneyShort(kpis.openCommitment)} tone="violet" note={t("open PO value")} />
        <SummaryTile label={t("Actual Consumed Cost")} value={moneyShort(kpis.actualConsumed)} note={t("issued minus returned")} />
        <SummaryTile label={t("Forecast Cost")} value={moneyShort(kpis.forecast)} tone={kpis.forecast > kpis.approvedBudget ? "red" : "amber"} note={t("actual + commitment + reserved")} />
        <SummaryTile label={t("Remaining Budget")} value={moneyShort(kpis.remaining)} tone={kpis.remaining < 0 ? "red" : "green"} strong />
      </section>

      <section className="bom-layout">
        <Panel title={t("BOM structure")} flush>
          <ul className="folder-list">
            <li>
              <button type="button" className={section === "ALL" ? "folder-row active" : "folder-row"} onClick={() => setSection("ALL")}>
                <Icon name="layers" /><span>{t("All sections")}</span><em>{lines.length}</em>
              </button>
            </li>
            {BOM_SECTIONS.map((entry) => (
              <li key={entry.code} style={{ paddingLeft: entry.parent ? 14 : 0 }}>
                <button type="button" className={section === entry.code ? "folder-row active" : "folder-row"} onClick={() => setSection(entry.code)}>
                  <Icon name={entry.parent ? "package" : "folder"} />
                  <span>{t(entry.name)}</span>
                  <em>{sectionCount(entry.code) || ""}</em>
                </button>
              </li>
            ))}
          </ul>
          <div className="panel-body" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <button
              className="btn default sm block" type="button" disabled={locked}
              title={locked ? t("Released — add items on the next revision") : undefined}
              onClick={() => notify(locked ? t("Released BOM — create a revision first") : t("New BOM line added"))}
            >
              <Icon name="plus" />{t("Add BOM Item")}
            </button>
          </div>
        </Panel>

        <Panel
          title={section === "ALL" ? t("All sections") : t(BOM_SECTIONS.find((entry) => entry.code === section)?.name ?? section)}
          subtitle={t("Purchase Required = Quantity − Allocated − Customer Supplied − On Order, never negative")}
          flush
        >
          <div className="table-wrap tall">
            <table className="sheet bom-sheet" style={{ minWidth: 2350 }}>
              <colgroup>
                {[36, 96, 140, 220, 90, 150, 52, 46, 88, 96, 50, 62, 62, 62, 62, 68, 96, 160, 52, 96, 110, 118, 60].map((width, index) => (
                  <col key={index} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th>#</th><th>{t("Item Code")}</th><th>{t("Model / Part No.")}</th><th>{t("Description")}</th>
                  <th>{t("Brand")}</th><th>{t("Specification")}</th><th className="num">{t("Qty")}</th><th>{t("Unit")}</th>
                  <th className="num">{t("Est. Unit Cost")}</th><th className="num">{t("Budget")}</th>
                  <th className="num">{t("On Hand")}</th><th className="num">{t("Reserved")}</th><th className="num">{t("Available")}</th>
                  <th className="num">{t("Allocated")}</th><th className="num">{t("On Order")}</th><th className="num">{t("To Buy")}</th>
                  <th>{t("Required")}</th><th>{t("Preferred Supplier")}</th><th className="num">{t("Lead")}</th>
                  <th>{t("Estimate Ref.")}</th><th>{t("Owner")}</th><th>{t("Status")}</th><th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((line, index) => {
                  const facts = bomLineFacts(line);
                  const balance = line.itemId ? stockBalance(line.itemId) : null;
                  const owner = userOf(line.ownerId);
                  const estimateLine = estimate?.items.find((item) => item.id === line.estimateLineId);
                  return (
                    <tr key={line.id} className={facts.status === "Purchase Required" ? "row-late" : facts.status === "Fully Fulfilled" ? "row-ok" : undefined}>
                      <td><span className="cell-text muted">{index + 1}</span></td>
                      <td><span className="cell-text mono">{line.itemCode}</span></td>
                      <td><span className="cell-text mono">{line.partNo}</span></td>
                      <td><span className="cell-text" title={line.remark || undefined}><strong>{line.description}</strong>{line.remark ? " ⓘ" : ""}</span></td>
                      <td><span className="cell-text">{line.brand}</span></td>
                      <td><span className="cell-text muted">{line.specification}</span></td>
                      <td><span className="cell-text num">{line.qtyRequired}{line.customerSupplied ? <em className="muted"> ({line.customerSupplied} {t("cust.")})</em> : null}</span></td>
                      <td><span className="cell-text">{line.unit}</span></td>
                      <td><span className="cell-text num">{moneyShort(line.estUnitCost)}</span></td>
                      <td><span className="cell-text num"><strong>{moneyShort(facts.budget)}</strong></span></td>
                      <td><span className="cell-text num">{balance ? balance.onHand : "—"}</span></td>
                      <td><span className="cell-text num">{balance ? balance.reserved : "—"}</span></td>
                      <td><span className={`cell-text num ${balance && balance.available > 0 ? "green-text" : ""}`}>{balance ? balance.available : "—"}</span></td>
                      <td><span className="cell-text num">{line.nonStock ? "—" : facts.allocated}</span></td>
                      <td><span className={`cell-text num ${facts.onOrder ? "violet-text" : ""}`}>{line.nonStock ? "—" : facts.onOrder}</span></td>
                      <td><span className={`cell-text num ${facts.purchaseRequired ? "red-text" : ""}`}><strong>{line.nonStock ? "—" : facts.purchaseRequired}</strong></span></td>
                      <td><span className="cell-text">{formatDate(line.requiredDate)}</span></td>
                      <td><span className="cell-text">{line.preferredSupplier}</span></td>
                      <td><span className="cell-text num">{line.leadTimeDays ? `${line.leadTimeDays}d` : "—"}</span></td>
                      <td><span className="cell-text mono">{estimateLine?.itemCode ?? "—"}</span></td>
                      <td><span className="cell-text">{owner ? <span className="avatar sm" title={owner.name}>{owner.initials}</span> : "—"}</span></td>
                      <td><Badge tone={bomStatusTone(facts.status)}>{t(facts.status)}</Badge></td>
                      <td>
                        <div className="row tight" style={{ justifyContent: "flex-end" }}>
                          {facts.status === "Available in Stock" && perm.canReserve ? (
                            <button className="row-action" type="button" title={t("Allocate Stock")} onClick={() => setAllocateFor(line)}>
                              <Icon name="lock" />
                            </button>
                          ) : null}
                          <button className="row-action" type="button" title={t("View Budget Trace")} onClick={() => setTraceFor(line)}>
                            <Icon name="gitBranch" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sticky-foot">
            <div className="foot-item"><span>{t("BOM budget")}</span><strong>{moneyShort(kpis.bomBudget)}</strong></div>
            <div className="foot-item"><span>{t("Consumed")}</span><strong>{moneyShort(kpis.actualConsumed)}</strong></div>
            <div className="foot-item"><span>{t("Committed")}</span><strong>{moneyShort(kpis.openCommitment)}</strong></div>
            <div className="foot-item"><span>{t("Still to buy")}</span><strong>{moneyShort(shortageValue)}</strong></div>
            <div className="foot-total"><span>{t("Remaining Budget")}</span><strong>{money(kpis.remaining)}</strong></div>
          </div>
        </Panel>
      </section>

      {traceFor ? <TraceModal line={traceFor} onClose={() => setTraceFor(null)} /> : null}

      {allocateFor ? (
        <AllocateModal
          line={allocateFor} project={project} onClose={() => setAllocateFor(null)}
          onDone={(qty) => {
            setAllocateFor(null);
            notify(`${qty} × ${allocateFor.partNo} ${t("reserved for")} ${project.no}`);
          }}
        />
      ) : null}

      {compareOpen && estimate ? (
        <Modal title={t("Compare with Estimate")} subtitle={`${estimate.no} ${bom.estimateRev} → ${bom.no} ${bom.revision}`} size="lg" onClose={() => setCompareOpen(false)}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t("Estimate line")}</th><th>{t("Description")}</th><th className="num">{t("Estimate budget")}</th><th className="num">{t("BOM budget")}</th><th className="num">{t("Difference")}</th></tr>
              </thead>
              <tbody>
                {estimate.items.map((item) => {
                  const bomBudget = lines.filter((line) => line.estimateLineId === item.id)
                    .reduce((sum, line) => sum + line.qtyRequired * line.estUnitCost, 0);
                  if (!bomBudget) return null;
                  const diff = bomBudget - item.qty * item.unitCost;
                  return (
                    <tr key={item.id}>
                      <td className="mono">{item.itemCode}</td>
                      <td>{item.description}</td>
                      <td className="num">{moneyShort(item.qty * item.unitCost)}</td>
                      <td className="num">{moneyShort(bomBudget)}</td>
                      <td className="num"><strong className={diff > 0 ? "red-text" : "green-text"}>{diff > 0 ? "+" : ""}{moneyShort(diff)}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------------------
   Allocate stock — one quantity, one project
   -------------------------------------------------------------------------- */

function AllocateModal({ line, project, onClose, onDone }: {
  line: BomLine;
  project: { id: string; no: string; name: string };
  onClose: () => void;
  onDone: (qty: number) => void;
}) {
  const t = useT();
  const session = useSession();
  const facts = bomLineFacts(line);
  const balance = stockBalance(line.itemId);
  const max = Math.min(facts.purchaseRequired, balance.available);
  const [qty, setQty] = useState(max);
  return (
    <Modal
      title={t("Allocate Stock")}
      subtitle={`${line.itemCode} · ${line.partNo} → ${project.no}`}
      onClose={onClose}
      footer={
        <>
          <span className="muted">{t("A reserved quantity belongs to one project until released or issued.")}</span>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button
            className="btn primary" type="button" disabled={qty < 1 || qty > max}
            onClick={() => {
              const result = reserveStock(line.itemId, project.id, line.id, qty, line.requiredDate, session);
              if (result) onDone(qty);
            }}
          >
            <Icon name="lock" />{t("Reserve for Project")}
          </button>
        </>
      }
    >
      <dl className="def-list">
        <div><dt>{t("Available")}</dt><dd><strong className="green-text">{balance.available}</strong> {line.unit}</dd></div>
        <div><dt>{t("Still needed")}</dt><dd>{facts.purchaseRequired} {line.unit}</dd></div>
        <div>
          <dt>{t("Reserve quantity")}</dt>
          <dd><input className="num" type="number" min={1} max={max} value={qty} onChange={(event) => setQty(Number(event.target.value))} style={{ width: 90 }} /></dd>
        </div>
        <div><dt>{t("Required")}</dt><dd>{formatDate(line.requiredDate)}</dd></div>
      </dl>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Budget trace — the whole chain of custody for one line
   -------------------------------------------------------------------------- */

export function TraceModal({ line, onClose }: { line: BomLine; onClose: () => void }) {
  const t = useT();
  const chain = traceChain(line);
  const facts = bomLineFacts(line);
  return (
    <Modal
      title={t("Budget Trace")}
      subtitle={`${line.itemCode} · ${line.partNo} — ${t("estimate line to member receipt, one chain")}`}
      size="lg"
      onClose={onClose}
    >
      <div className="trace-chain">
        <div className="trace-step">
          <span className="trace-tag est">{t("Estimate")}</span>
          {chain.estimateLine ? (
            <p><strong>{chain.estimateLine.itemCode}</strong> · {chain.estimateLine.description} · {chain.estimateLine.qty} × {moneyShort(chain.estimateLine.unitCost)} = <strong>{moneyShort(chain.estimateLine.qty * chain.estimateLine.unitCost)}</strong></p>
          ) : <p className="muted">—</p>}
        </div>
        <div className="trace-step">
          <span className="trace-tag bom">BOM</span>
          <p><strong>{line.itemCode}</strong> · {line.qtyRequired} {line.unit} × {moneyShort(line.estUnitCost)} = <strong>{moneyShort(facts.budget)}</strong>
            {line.customerSupplied ? ` · ${line.customerSupplied} ${t("customer supplied")}` : ""}</p>
        </div>
        <div className="trace-step">
          <span className="trace-tag pr">PR</span>
          {chain.prLines.length ? chain.prLines.map(({ pr, line: prLine }) => (
            <p key={prLine.id}><strong className="mono">{pr.no}</strong> · {prLine.qty} × {moneyShort(prLine.unitPrice)} · <Badge tone={pr.status === "Rejected" ? "red" : pr.status === "Converted to PO" ? "green" : "blue"}>{t(pr.status)}</Badge> · {t("by")} {userName(pr.requestedBy)}</p>
          )) : <p className="muted">{t("No requisition yet")}</p>}
        </div>
        <div className="trace-step">
          <span className="trace-tag po">PO</span>
          {chain.poLines.length ? chain.poLines.map(({ po, line: poLine }) => (
            <p key={poLine.id}><strong className="mono">{po.no}</strong> · {po.supplier} · {poLine.qty} × {moneyShort(poLine.unitPrice)} · <Badge tone="violet">{t(po.status)}</Badge></p>
          )) : <p className="muted">{t("No purchase order")}</p>}
        </div>
        <div className="trace-step">
          <span className="trace-tag grn">GRN</span>
          {chain.grnLines.length ? chain.grnLines.map(({ grn, line: grnLine }) => (
            <p key={grnLine.id}><strong className="mono">{grn.no}</strong> · {t("received")} {grnLine.receivedQty} ({grnLine.acceptedQty} {t("accepted")}, {grnLine.damagedQty} {t("damaged")}) · {userName(grn.receivedBy)} {grn.receivedAt.slice(0, 10)}</p>
          )) : <p className="muted">{t("Nothing received yet")}</p>}
        </div>
        <div className="trace-step">
          <span className="trace-tag stk">{t("Stock")}</span>
          {chain.reservations.length ? chain.reservations.map((rsv) => (
            <p key={rsv.id}>{t("Reserved")} {rsv.qty} · {userName(rsv.ownerId)} · <Badge tone={rsv.status === "Active" ? "blue" : rsv.status === "Consumed" ? "green" : "slate"}>{t(rsv.status)}</Badge></p>
          )) : <p className="muted">{t("No reservation")}</p>}
        </div>
        <div className="trace-step">
          <span className="trace-tag mir">{t("Issue")}</span>
          {chain.mirLines.length ? chain.mirLines.map(({ mir, line: mirLine }) => (
            <p key={mirLine.id}><strong className="mono">{mir.no}</strong> · {t("issued")} {mirLine.issueQty}{mirLine.returnedQty ? `, ${mirLine.returnedQty} ${t("returned")}` : ""} · {t("received by")} {mir.receivedBy ? userName(mir.receivedBy) : "—"}</p>
          )) : <p className="muted">{t("Not issued yet")}</p>}
        </div>
      </div>
    </Modal>
  );
}
