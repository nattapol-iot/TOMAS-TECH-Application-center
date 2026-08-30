"use client";

import { useMemo, useState } from "react";
import {
  BOM_LINES, BOMS, MAT_PRS, PROJECTS,
  type MatPr, type MatPrLine,
} from "../data";
import {
  bomLineFacts, formatDate, matPermission, matPrAmount, matPrEstimateAmount, matPrVariancePct,
  money, moneyShort, prBudgetCheck, prLineVariancePct, prRuleFlags, stockBalance, TODAY_ISO,
  userName, userOf,
} from "../calc";
import { convertPrToPo, decidePr, submitPr, useMatStore } from "../matstore";
import { useSession } from "../session";
import {
  Badge, EmptyState, Field, Icon, Modal, Panel, PageHeader, Person, Pill, Tabs,
} from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";
import { TraceModal } from "./Bom";
import type { BomLine } from "../data";

export const prStatusTone = (status: MatPr["status"]) =>
  (status === "Approved" || status === "Converted to PO" ? "green"
    : status === "Rejected" ? "red"
      : status === "In Approval" ? "blue" : "slate") as "green" | "red" | "blue" | "slate";

/* ==========================================================================
   PR list
   ========================================================================== */

export function PrList({ go }: ScreenProps) {
  const t = useT();
  const store = useMatStore();
  const session = useSession();
  const waitingOnMe = store.prs.filter((pr) =>
    pr.status === "In Approval" && pr.steps.some((step) => (step.status === "Current" || step.status === "Auto-added") && step.approverId === session.user.id));

  return (
    <>
      <PageHeader
        eyebrow={t("MATERIAL & PROCUREMENT")}
        title={t("Purchase Requisitions")}
        subtitle={t("Raised from BOM shortages, checked against the project budget, and approved before a single baht is committed.")}
      />
      {waitingOnMe.length ? (
        <div className="info-strip amber">
          <Icon name="alertTriangle" />
          {waitingOnMe.length} {t("PR(s) are waiting for your decision")}
          <span className="spacer" />
          <button className="link-btn" type="button" onClick={() => go({ name: "pr", id: waitingOnMe[0].id })}>{t("Review")}<Icon name="arrowRight" /></button>
        </div>
      ) : null}
      <Panel title={`${store.prs.length} ${t("requisitions")}`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("PR No.")}</th><th>{t("Project")}</th><th>{t("Source")}</th><th>{t("Requested By")}</th>
                <th>{t("Request Date")}</th><th>{t("Required")}</th><th className="num">{t("Lines")}</th>
                <th className="num">{t("PR Amount")}</th><th className="num">{t("vs Estimate")}</th>
                <th>{t("Budget")}</th><th>{t("Waiting on")}</th><th>{t("Status")}</th><th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {store.prs.map((pr) => {
                const project = PROJECTS.find((entry) => entry.id === pr.projectId);
                const variance = matPrVariancePct(pr);
                const check = prBudgetCheck(pr);
                const current = pr.steps.find((step) => step.status === "Current" || step.status === "Auto-added");
                return (
                  <tr key={pr.id} className="clickable" onClick={() => go({ name: "pr", id: pr.id })}>
                    <td><strong className="mono">{pr.no}</strong></td>
                    <td><strong>{project?.no}</strong><div className="muted" style={{ fontSize: 11 }}>{project?.name}</div></td>
                    <td className="mono">{pr.sourceLabel}</td>
                    <td><Person initials={userOf(pr.requestedBy)?.initials ?? "—"} name={userName(pr.requestedBy)} /></td>
                    <td>{formatDate(pr.requestDate)}</td>
                    <td>{formatDate(pr.requiredDate)}</td>
                    <td className="num">{pr.lines.length}</td>
                    <td className="num"><strong>{moneyShort(matPrAmount(pr))}</strong></td>
                    <td className="num"><span className={variance > 0 ? "red-text" : "green-text"}>{variance > 0 ? "+" : ""}{variance.toFixed(1)}%</span></td>
                    <td>{pr.status === "Rejected" ? "—" : <Badge tone={check.withinBudget ? "green" : "red"}>{check.withinBudget ? t("Within Budget") : t("Over Budget")}</Badge>}</td>
                    <td>{pr.status === "In Approval" && current ? userName(current.approverId) : "—"}</td>
                    <td><Badge tone={prStatusTone(pr.status)}>{t(pr.status)}</Badge></td>
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
   Screen 2 — create PR from BOM shortages
   ========================================================================== */

type DraftLine = {
  bomLine: BomLine | null;
  itemCode: string;
  partNo: string;
  description: string;
  qtyRequired: number;
  available: number;
  qty: number;
  estUnitCost: number;
  unitPrice: number;
  priceSource: MatPrLine["priceSource"];
  supplier: string;
  leadTimeDays: number;
  budgetSection: string;
  reason: string;
  unplanned: boolean;
  justification: string;
};

export function PrCreate({ bomId, go, notify }: ScreenProps & { bomId?: string }) {
  const t = useT();
  const session = useSession();
  useMatStore();
  const bom = BOMS.find((entry) => entry.id === bomId) ?? BOMS[0];
  const project = PROJECTS.find((entry) => entry.id === bom.projectId)!;

  // Prefill from the live shortages the moment the screen opens.
  const [lines, setLines] = useState<DraftLine[]>(() =>
    BOM_LINES.filter((line) => line.bomId === bom.id && !line.nonStock)
      .map((line) => ({ line, facts: bomLineFacts(line) }))
      // Only real shortages: a line that available stock fully covers is
      // allocated, never bought — buying it anyway is a manual, flagged act.
      .filter(({ facts }) => facts.purchaseRequired > 0 && facts.onPrQty === 0 && facts.status !== "Available in Stock")
      .map(({ line, facts }) => ({
        bomLine: line, itemCode: line.itemCode, partNo: line.partNo, description: line.description,
        qtyRequired: line.qtyRequired,
        available: line.itemId ? stockBalance(line.itemId).available : 0,
        qty: facts.purchaseRequired, estUnitCost: line.estUnitCost, unitPrice: line.estUnitCost,
        priceSource: "Price Library" as const, supplier: line.preferredSupplier,
        leadTimeDays: line.leadTimeDays, budgetSection: line.section, reason: "",
        unplanned: false, justification: "",
      })));
  const [requiredDate, setRequiredDate] = useState("2026-09-20");
  const [priority, setPriority] = useState<MatPr["priority"]>("Normal");
  const [unplannedOpen, setUnplannedOpen] = useState(false);

  const amount = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const kpiCheck = prBudgetCheck({ ...MAT_PRS[0], projectId: project.id, lines: [] } as MatPr);
  const forecastAfter = kpiCheck.forecastBefore + amount;
  const stockCovered = BOM_LINES.filter((line) => line.bomId === bom.id && !line.nonStock)
    .filter((line) => {
      const facts = bomLineFacts(line);
      return facts.purchaseRequired === 0 && (facts.allocated > 0 || facts.status === "Available in Stock");
    }).length;
  const overPriced = lines.filter((line) => line.estUnitCost && ((line.unitPrice - line.estUnitCost) / line.estUnitCost) * 100 > 10);

  const patch = (index: number, part: Partial<DraftLine>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...part } : line)));

  const nextNo = `PR-${TODAY_ISO.slice(2, 4)}${TODAY_ISO.slice(5, 7)}-${String(MAT_PRS.length + 3).padStart(4, "0")}`;

  return (
    <>
      <div className="breadcrumb">
        <button type="button" onClick={() => go({ name: "purchase" })}>{t("Purchase Requisitions")}</button>
        <Icon name="chevronRight" />
        <span>{t("New Purchase Requisition")}</span>
      </div>

      <PageHeader
        eyebrow={`${t("Source")}: ${bom.no} ${bom.revision}`}
        title={`${t("New Purchase Requisition")} — ${nextNo}`}
        subtitle={`${project.no} ${project.name} · ${t("Requested By")}: ${session.user.name} · ${t("Department")}: ${session.user.department}`}
        meta={
          <>
            <div><span>{t("Request Date")}</span><strong>{formatDate(TODAY_ISO)}</strong></div>
            <div><span>{t("Required Date")}</span><strong><input type="date" value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} /></strong></div>
            <div><span>{t("Priority")}</span><strong>
              <select value={priority} onChange={(event) => setPriority(event.target.value as MatPr["priority"])}>
                {["Normal", "High", "Emergency"].map((option) => <option key={option} value={option}>{t(option)}</option>)}
              </select>
            </strong></div>
            <div><span>{t("Status")}</span><strong><Badge tone="slate">{t("Draft")}</Badge></strong></div>
          </>
        }
        actions={
          <>
            <button className="btn default" type="button" onClick={() => go({ name: "bom", id: bom.id })}><Icon name="arrowLeft" />{t("Return to BOM")}</button>
            <button className="btn default" type="button" onClick={() => notify(t("Supplier quotation attached to the requisition"))}><Icon name="paperclip" />{t("Attach Supplier Quotation")}</button>
            <button className="btn default" type="button" onClick={() => setUnplannedOpen(true)}><Icon name="plus" />{t("Add Unplanned Item")}</button>
            <button className="btn default" type="button" onClick={() => notify(t("Draft saved"))}>{t("Save Draft")}</button>
            <button className="btn primary" type="button" disabled={!lines.length} onClick={() => { notify(`${nextNo} ${t("submitted — Section Owner Review is next")}`); go({ name: "purchase" }); }}>
              <Icon name="send" />{t("Submit PR")}
            </button>
          </>
        }
      />

      <div className="strip-stack">
        <div className="info-strip green"><Icon name="checkCircle" />{stockCovered} {t("item(s) can be supplied from existing stock — they are not on this PR")}</div>
        <div className="info-strip"><Icon name="package" />{lines.length} {t("item(s) require purchasing")}</div>
        {overPriced.length ? (
          <div className="info-strip amber"><Icon name="alertTriangle" />{overPriced.map((line) => `${line.partNo} ${t("exceeds the estimated unit cost by")} ${(((line.unitPrice - line.estUnitCost) / line.estUnitCost) * 100).toFixed(1)}%`).join(" · ")} — {t("management approval will be added")}</div>
        ) : null}
        <div className={`info-strip ${forecastAfter <= kpiCheck.approvedBudget ? "green" : "amber"}`}>
          <Icon name={forecastAfter <= kpiCheck.approvedBudget ? "checkCircle" : "alertTriangle"} />
          {forecastAfter <= kpiCheck.approvedBudget ? t("Current PR is within the total project budget") : t("This PR pushes the forecast over the approved budget — a budget exception approval will be added")}
        </div>
      </div>

      <Panel title={`${lines.length} ${t("PR lines")}`} subtitle={t("Quantities prefilled from the live BOM shortage — stock-covered items never appear here")} flush>
        <div className="table-wrap">
          <table className="sheet" style={{ minWidth: 1780 }}>
            <colgroup>
              {[36, 100, 150, 220, 64, 70, 64, 96, 96, 96, 76, 130, 170, 56, 90, 100, 160, 46].map((width, index) => <col key={index} style={{ width }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>#</th><th>{t("Item Code")}</th><th>{t("Part Number")}</th><th>{t("Description")}</th>
                <th className="num">{t("Req.")}</th><th className="num">{t("Avail.")}</th><th className="num">{t("Buy")}</th>
                <th className="num">{t("Est. Unit Cost")}</th><th className="num">{t("Unit Price")}</th><th className="num">{t("PR Amount")}</th>
                <th className="num">{t("Variance")}</th><th>{t("Price Source")}</th><th>{t("Supplier")}</th><th className="num">{t("Lead")}</th>
                <th>{t("Budget Section")}</th><th>{t("Budget")}</th><th>{t("Reason")}</th><th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const variance = line.estUnitCost ? ((line.unitPrice - line.estUnitCost) / line.estUnitCost) * 100 : 0;
                return (
                  <tr key={line.itemCode + index} className={line.unplanned ? "row-wait" : undefined}>
                    <td><span className="cell-text muted">{index + 1}</span></td>
                    <td><span className="cell-text mono">{line.itemCode}{line.unplanned ? <Pill tone="amber">{t("unplanned")}</Pill> : null}</span></td>
                    <td><span className="cell-text mono">{line.partNo}</span></td>
                    <td><span className="cell-text">{line.description}</span></td>
                    <td><span className="cell-text num">{line.qtyRequired}</span></td>
                    <td><span className="cell-text num">{line.available}</span></td>
                    <td><input className="num" type="number" min={1} value={line.qty} onChange={(event) => patch(index, { qty: Math.max(1, Number(event.target.value)) })} /></td>
                    <td><span className="cell-text num">{line.estUnitCost ? moneyShort(line.estUnitCost) : "—"}</span></td>
                    <td><input className="num" type="number" min={0} step={10} value={line.unitPrice} onChange={(event) => patch(index, { unitPrice: Number(event.target.value), priceSource: "Manual" })} /></td>
                    <td><span className="cell-text num"><strong>{moneyShort(line.qty * line.unitPrice)}</strong></span></td>
                    <td><span className={`cell-text num ${variance > 10 ? "red-text" : variance > 0 ? "amber-text" : "green-text"}`}>{variance > 0 ? "+" : ""}{variance.toFixed(1)}%</span></td>
                    <td>
                      <select value={line.priceSource} onChange={(event) => patch(index, { priceSource: event.target.value as DraftLine["priceSource"] })}>
                        {["Price Library", "Supplier Quotation", "Previous Purchase", "Manual"].map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </td>
                    <td><input value={line.supplier} onChange={(event) => patch(index, { supplier: event.target.value })} /></td>
                    <td><span className="cell-text num">{line.leadTimeDays}d</span></td>
                    <td><span className="cell-text mono">{line.budgetSection}</span></td>
                    <td><Badge tone="green">{t("Within Budget")}</Badge></td>
                    <td><input value={line.reason} placeholder={line.unplanned ? t("Business reason (required)") : "—"} onChange={(event) => patch(index, { reason: event.target.value })} /></td>
                    <td>
                      <button className="row-action" type="button" title={t("Remove line")} onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}>
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!lines.length ? (
                <tr><td colSpan={18}><EmptyState icon="checkCircle" title={t("No shortage")} message={t("Everything on the BOM is covered by stock or already ordered.")} /></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="sticky-foot">
          <div className="foot-item"><span>{t("Approved Budget")}</span><strong>{moneyShort(kpiCheck.approvedBudget)}</strong></div>
          <div className="foot-item"><span>{t("Previously Committed")}</span><strong>{moneyShort(kpiCheck.committed)}</strong></div>
          <div className="foot-item"><span>{t("Current PR Amount")}</span><strong>{moneyShort(amount)}</strong></div>
          <div className="foot-item"><span>{t("Forecast After Approval")}</span><strong>{moneyShort(forecastAfter)}</strong></div>
          <div className="foot-total">
            <span>{t("Remaining Budget")}</span>
            <strong className={kpiCheck.approvedBudget - forecastAfter < 0 ? "red-text" : undefined}>{money(kpiCheck.approvedBudget - forecastAfter)}</strong>
          </div>
        </div>
      </Panel>

      {unplannedOpen ? (
        <Modal
          title={t("Add Unplanned Item")}
          subtitle={t("Not in the approved estimate — it needs a business reason, a technical justification and an additional approver.")}
          onClose={() => setUnplannedOpen(false)}
          footer={
            <>
              <span className="muted"><Icon name="alertTriangle" /> {t("Management approval is added automatically")}</span>
              <span className="spacer" />
              <button className="btn default" type="button" onClick={() => setUnplannedOpen(false)}>{t("Cancel")}</button>
              <button className="btn primary" type="button" onClick={() => {
                setLines((prev) => [...prev, {
                  bomLine: null, itemCode: "EL-MISC-001", partNo: "—", description: "Unplanned item", qtyRequired: 1,
                  available: 0, qty: 1, estUnitCost: 0, unitPrice: 0, priceSource: "Manual", supplier: "",
                  leadTimeDays: 7, budgetSection: "HW.EL", reason: "", unplanned: true, justification: "",
                }]);
                setUnplannedOpen(false);
              }}><Icon name="plus" />{t("Add line")}</button>
            </>
          }
        >
          <div className="form-grid">
            <Field label={t("Business reason")} span={4}><input placeholder={t("Why is this needed when it is not in the estimate?")} /></Field>
            <Field label={t("Cost section")}><select>{["HW.STD", "HW.EL", "HW.ME", "HW.PC", "HW.INF"].map((option) => <option key={option}>{option}</option>)}</select></Field>
            <Field label={t("Technical justification")} span={3}><input placeholder={t("Technical detail the approver needs")} /></Field>
            <Field label={t("Requested by")}><input readOnly value={session.user.name} /></Field>
            <Field label={t("Supporting document")} span={2}><button className="btn default sm" type="button"><Icon name="paperclip" />{t("Attach")}</button></Field>
            <Field label={t("Additional approver")}><input readOnly value="Yuki Tanaka — Engineering Manager" /></Field>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/* ==========================================================================
   Screen 3 — PR approval workspace
   ========================================================================== */

export function PrDetail({ id, go, notify }: ScreenProps & { id: string }) {
  const t = useT();
  const session = useSession();
  const store = useMatStore();
  const pr = store.prs.find((entry) => entry.id === id) ?? store.prs[0];
  const project = PROJECTS.find((entry) => entry.id === pr.projectId)!;
  const perm = matPermission(session.user, session.role);
  const check = prBudgetCheck(pr);
  const variance = matPrVariancePct(pr);
  const flags = useMemo(() => prRuleFlags(pr), [pr, store.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = pr.steps.find((step) => step.status === "Current" || step.status === "Auto-added");
  const isMyDecision = !!current && current.approverId === session.user.id && pr.status === "In Approval";
  const isRequester = pr.requestedBy === session.user.id;

  const [tab, setTab] = useState<"summary" | "budget" | "documents" | "audit">("summary");
  const [decision, setDecision] = useState<"Approve" | "Reject" | "Request Changes" | null>(null);
  const [traceFor, setTraceFor] = useState<BomLine | null>(null);

  const auditRows = store.audit.filter((entry) => entry.entityNo === pr.no || entry.before === pr.no).reverse();

  return (
    <>
      <div className="breadcrumb">
        <button type="button" onClick={() => go({ name: "purchase" })}>{t("Purchase Requisitions")}</button>
        <Icon name="chevronRight" />
        <span>{pr.no}</span>
      </div>

      <PageHeader
        eyebrow={`${t("Source")}: ${pr.sourceLabel} · ${project.no}`}
        title={`${pr.no} — ${project.name}`}
        subtitle={`${t("Requested By")}: ${userName(pr.requestedBy)} · ${t("Project Owner")}: ${userName(project.leadEngineerId)} · ${t("Required")} ${formatDate(pr.requiredDate)}`}
        meta={
          <>
            <div><span>{t("Total PR Amount")}</span><strong>{money(matPrAmount(pr))}</strong></div>
            <div><span>{t("Budget Status")}</span><strong><Badge tone={check.withinBudget ? "green" : "red"}>{check.withinBudget ? t("Within Budget") : t("Over Budget")}</Badge></strong></div>
            <div><span>{t("Price Variance")}</span><strong className={variance > 0 ? "red-text" : "green-text"}>{variance > 0 ? "+" : ""}{variance.toFixed(1)}%</strong></div>
            <div><span>{t("Status")}</span><strong><Badge tone={prStatusTone(pr.status)}>{t(pr.status)}</Badge></strong></div>
          </>
        }
        actions={
          isMyDecision ? (
            <>
              <button className="btn default" type="button" onClick={() => notify(t("Forwarded — Yuki Tanaka added as an additional approver on this step"))}><Icon name="send" />{t("Forward to Additional Approver")}</button>
              <button className="btn default" type="button" onClick={() => setDecision("Request Changes")}><Icon name="refresh" />{t("Request Changes")}</button>
              <button className="btn default" type="button" onClick={() => setDecision("Reject")}><Icon name="x" />{t("Reject")}</button>
              <button className="btn primary" type="button" onClick={() => setDecision("Approve")}><Icon name="check" />{t("Approve")}</button>
            </>
          ) : pr.status === "Approved" && perm.canCreatePo ? (
            <button className="btn primary" type="button" onClick={() => { const pos = convertPrToPo(pr.id, session); notify(`${pos.join(" / ")} ${t("created — one PO per supplier")}`); }}>
              <Icon name="truck" />{t("Convert to PO")}
            </button>
          ) : pr.status === "Draft" && isRequester ? (
            <button className="btn primary" type="button" onClick={() => { submitPr(pr.id, session); notify(t("Submitted — Section Owner Review is next")); }}>
              <Icon name="send" />{t("Submit PR")}
            </button>
          ) : undefined
        }
      />

      {isRequester && pr.status === "In Approval" ? (
        <div className="info-strip"><Icon name="lock" />{t("You raised this PR — the approval buttons are disabled for you. It is waiting for")} {current ? userName(current.approverId) : "—"}.</div>
      ) : null}

      {flags.length ? (
        <div className="info-strip amber">
          <Icon name="alertTriangle" />
          <div>{flags.map((flag) => <div key={flag}>{flag}</div>)}</div>
        </div>
      ) : null}

      <Panel title={t("Approval timeline")} subtitle={t("The requester can never approve their own PR — rule-added steps show why they exist")} flush>
        <div className="approval-rail">
          {pr.steps.map((step, index) => (
            <div className={`approval-node ${step.status === "Completed" ? "done" : step.status === "Current" ? "current" : step.status === "Auto-added" ? "auto" : step.status === "Not Required" ? "skipped" : ""}`} key={step.name}>
              <span className="approval-dot">{step.status === "Completed" ? <Icon name="check" /> : index + 1}</span>
              <div>
                <strong>{t(step.name)}</strong>
                <small>
                  {userName(step.approverId)}
                  {step.at ? ` · ${step.at.slice(0, 16)}` : step.status === "Current" ? ` · ${t("waiting")}` : step.status === "Not Required" ? ` · ${t("Not Required")}` : ""}
                </small>
                {step.rule ? <small className="amber-text"><Icon name="alertTriangle" /> {step.rule}</small> : null}
                {step.comment ? <small>“{step.comment}”</small> : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "summary", label: t("PR Summary"), count: pr.lines.length },
          { id: "budget", label: t("Budget Impact") },
          { id: "documents", label: t("References") },
          { id: "audit", label: t("Audit History"), count: auditRows.length },
        ]}
      />

      {tab === "summary" ? (
        <Panel title={t("PR lines")} subtitle={t("Every line keeps its estimate cost beside the requested price")} flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Item")}</th><th>{t("Part Number")}</th><th className="num">{t("Qty")}</th>
                  <th className="num">{t("Stock at request")}</th><th className="num">{t("Est. Unit Cost")}</th>
                  <th className="num">{t("Unit Price")}</th><th className="num">{t("PR Amount")}</th><th className="num">{t("Variance")}</th>
                  <th>{t("Price Source")}</th><th>{t("Supplier")}</th><th>{t("Budget Section")}</th><th>{t("Reason")}</th><th aria-label="Trace" />
                </tr>
              </thead>
              <tbody>
                {pr.lines.map((line) => {
                  const lineVariance = prLineVariancePct(line);
                  const bomLine = BOM_LINES.find((entry) => entry.id === line.bomLineId);
                  return (
                    <tr key={line.id}>
                      <td><strong className="mono">{line.itemCode}</strong>{line.unplanned ? <Pill tone="amber">{t("unplanned")}</Pill> : null}<div className="muted" style={{ fontSize: 11 }}>{line.description}</div></td>
                      <td className="mono">{line.partNo}</td>
                      <td className="num"><strong>{line.qty}</strong></td>
                      <td className="num">{line.stockSnapshot}</td>
                      <td className="num">{line.estUnitCost ? moneyShort(line.estUnitCost) : "—"}</td>
                      <td className="num">{moneyShort(line.unitPrice)}{line.priceSource === "Manual" ? <Pill tone="violet">M</Pill> : null}</td>
                      <td className="num"><strong>{moneyShort(line.qty * line.unitPrice)}</strong></td>
                      <td className="num"><span className={lineVariance > 10 ? "red-text" : lineVariance > 0 ? "amber-text" : "green-text"}>{lineVariance > 0 ? "+" : ""}{lineVariance.toFixed(1)}%</span></td>
                      <td>{t(line.priceSource)}</td>
                      <td>{line.supplier}</td>
                      <td className="mono">{line.budgetSection}</td>
                      <td className="muted">{line.reason || "—"}</td>
                      <td>{bomLine ? (
                        <button className="row-action" type="button" title={t("View Calculation Trace")} onClick={() => setTraceFor(bomLine)}>
                          <Icon name="gitBranch" />
                        </button>
                      ) : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="sticky-foot">
            <div className="foot-item"><span>{t("Estimate value")}</span><strong>{moneyShort(matPrEstimateAmount(pr))}</strong></div>
            <div className="foot-item"><span>{t("Price Variance")}</span><strong>{variance > 0 ? "+" : ""}{variance.toFixed(1)}%</strong></div>
            <div className="foot-total"><span>{t("Total PR Amount")}</span><strong>{money(matPrAmount(pr))}</strong></div>
          </div>
        </Panel>
      ) : null}

      {tab === "budget" ? (
        <section className="grid-main">
          <Panel title={t("Budget Impact")} subtitle={t("Forecast = actual consumed + open commitment + reserved stock")} flush>
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><td>{t("Approved Budget")} ({t("material")})</td><td className="num"><strong>{money(check.approvedBudget)}</strong></td></tr>
                  <tr><td>{t("Previously Committed")} ({t("open PO")})</td><td className="num">{money(check.committed)}</td></tr>
                  <tr><td>{t("Forecast before this PR")}</td><td className="num">{money(check.forecastBefore)}</td></tr>
                  <tr><td>{t("Current PR Amount")}</td><td className="num">{money(check.amount)}</td></tr>
                  <tr className="subtotal-row"><td>{t("Forecast After Approval")}</td><td className="num"><strong>{money(check.forecastAfter)}</strong></td></tr>
                  <tr><td>{t("Remaining Budget after approval")}</td><td className="num"><strong className={check.remainingAfter < 0 ? "red-text" : "green-text"}>{money(check.remainingAfter)}</strong></td></tr>
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title={t("Stock Availability")} subtitle={t("Snapshot now — buying despite available stock needs a reason")} flush>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t("Item")}</th><th className="num">{t("Available now")}</th><th className="num">{t("Buy")}</th><th>{t("Check")}</th></tr></thead>
                <tbody>
                  {pr.lines.filter((line) => line.itemId).map((line) => {
                    const balance = stockBalance(line.itemId);
                    const covered = balance.available >= line.qty;
                    return (
                      <tr key={line.id}>
                        <td className="mono">{line.partNo}</td>
                        <td className="num">{balance.available}</td>
                        <td className="num">{line.qty}</td>
                        <td>{covered ? <Badge tone="amber">{t("Stock covers this — justify")}</Badge> : <Badge tone="green">{t("Purchase needed")}</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      ) : null}

      {tab === "documents" ? (
        <section className="grid-main">
          <Panel title={t("References")} flush>
            <div className="panel-body">
              <div className="file-row"><span className="file-icon"><Icon name="layers" /></span><div style={{ flex: 1 }}><strong>{pr.sourceLabel}</strong><small>{t("BOM Reference")}</small></div>
                {pr.sourceBomId ? <button className="btn default sm" type="button" onClick={() => go({ name: "bom", id: pr.sourceBomId })}>{t("Open")}</button> : null}</div>
              <div className="file-row"><span className="file-icon"><Icon name="file" /></span><div style={{ flex: 1 }}><strong>EST-2608-0001 R03</strong><small>{t("Estimate Cost Reference")}</small></div>
                <button className="btn default sm" type="button" onClick={() => go({ name: "estimate", id: project.estimateId })}>{t("Open")}</button></div>
              {pr.lines.filter((line) => line.attachment).map((line) => (
                <div className="file-row" key={line.id}><span className="file-icon"><Icon name="paperclip" /></span><div style={{ flex: 1 }}><strong>{line.attachment}</strong><small>{t("Supplier Quotation")} · {line.partNo}</small></div>
                  <button className="btn default sm" type="button" onClick={() => notify(`${line.attachment} ${t("opened")}`)}>{t("Open")}</button></div>
              ))}
            </div>
          </Panel>
          <Panel title={t("Previous Purchase History")} flush>
            <div className="panel-body">
              {pr.lines.slice(0, 4).map((line) => (
                <div className="file-row" key={line.id}>
                  <span className="file-icon"><Icon name="clock" /></span>
                  <div style={{ flex: 1 }}>
                    <strong>{line.partNo}</strong>
                    <small>{line.estUnitCost ? `${t("Last purchase")} ${moneyShort(line.estUnitCost)} THB · ${t("Price Library")}` : t("No purchase history")}</small>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      ) : null}

      {tab === "audit" ? (
        <Panel title={t("Audit History")} subtitle={t("Append-only — records cannot be edited or deleted")} flush>
          <div className="panel-body feed">
            {auditRows.map((entry) => (
              <div className="feed-row" key={entry.id}>
                <span className="avatar sm">{userOf(entry.actorId)?.initials ?? "—"}</span>
                <div>
                  <p><strong>{userName(entry.actorId)}</strong> · {entry.role} · {entry.action}</p>
                  <p className="muted">{entry.before} → {entry.after}{entry.reason ? ` · “${entry.reason}”` : ""}</p>
                </div>
                <span className="muted mono" style={{ fontSize: 11 }}>{entry.at}</span>
              </div>
            ))}
            {!auditRows.length ? <p className="muted">{t("No audit entries yet.")}</p> : null}
          </div>
        </Panel>
      ) : null}

      {decision ? (
        <DecisionModal
          pr={pr} decision={decision} flags={flags}
          onClose={() => setDecision(null)}
          onDone={(comment) => {
            const error = decidePr(pr.id, decision, comment, session);
            setDecision(null);
            notify(error || (decision === "Approve" ? t("Approved — the next step is notified") : decision === "Reject" ? t("Rejected — the requester is notified") : t("Returned to the requester for changes")));
          }}
        />
      ) : null}

      {traceFor ? <TraceModal line={traceFor} onClose={() => setTraceFor(null)} /> : null}
    </>
  );
}

function DecisionModal({ pr, decision, flags, onClose, onDone }: {
  pr: MatPr;
  decision: "Approve" | "Reject" | "Request Changes";
  flags: string[];
  onClose: () => void;
  onDone: (comment: string) => void;
}) {
  const t = useT();
  const [comment, setComment] = useState("");
  // A comment is mandatory when rejecting, requesting changes, or approving
  // anything a rule has flagged (exception, manual price, stock available…).
  const commentRequired = decision !== "Approve" || flags.length > 0;
  return (
    <Modal
      title={`${t(decision)} — ${pr.no}`}
      subtitle={flags.length ? `${flags.length} ${t("rule flag(s) on this PR — your comment goes on the audit record")}` : undefined}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button
            className={`btn ${decision === "Reject" ? "danger" : "primary"}`} type="button"
            disabled={commentRequired && !comment.trim()}
            onClick={() => onDone(comment.trim())}
          >
            <Icon name={decision === "Approve" ? "check" : decision === "Reject" ? "x" : "refresh"} />{t(decision)}
          </button>
        </>
      }
    >
      {flags.length ? (
        <ul className="check-list" style={{ marginBottom: 12 }}>
          {flags.map((flag) => (
            <li className="check-item warning" key={flag}><Icon name="alertTriangle" /><div><strong>{flag}</strong></div></li>
          ))}
        </ul>
      ) : null}
      <Field label={commentRequired ? t("Comment (required)") : t("Comment (optional)")}>
        <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("Why — the next reader of the audit trail needs this")} />
      </Field>
    </Modal>
  );
}
