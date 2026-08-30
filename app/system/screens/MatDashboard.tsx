"use client";

import { BOM_SECTIONS, MAT_ITEMS, PROJECTS } from "../data";
import {
  formatDate, isSlowMoving, matKpis, matPrAmount, matPrVariancePct, moneyShort,
  poFacts, stockBalance, userName,
} from "../calc";
import { useMatStore } from "../matstore";
import { Badge, BarChart, HBarList, Icon, Panel, PageHeader } from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";

/* ==========================================================================
   Screen 7 — management view of procurement, budget and inventory risk
   ========================================================================== */

export default function MatDashboard({ go }: ScreenProps) {
  const t = useT();
  const store = useMatStore();

  const projects = PROJECTS.filter((project) => project.status !== "Closed")
    .map((project) => ({ project, kpis: matKpis(project.id) }))
    .filter(({ kpis }) => kpis.approvedBudget > 0 && (kpis.forecast > 0 || kpis.bomBudget > 0));

  const openPrs = store.prs.filter((pr) => pr.status === "Draft" || pr.status === "In Approval");
  const openPrValue = openPrs.reduce((sum, pr) => sum + matPrAmount(pr), 0);
  const overBudgetPrs = store.prs.filter((pr) => pr.status === "In Approval" && matKpis(pr.projectId).remaining < matPrAmount(pr));
  const openPos = store.pos.filter((po) => po.status !== "Received" && po.status !== "Closed");
  const openPoValue = openPos.reduce((sum, po) => sum + poFacts(po).openValue, 0);
  const overduePos = openPos.filter((po) => poFacts(po).overdue);
  const partialPos = store.pos.filter((po) => po.status === "Partially Received");
  const inventoryValue = MAT_ITEMS.reduce((sum, item) => sum + stockBalance(item.id).onHand * item.avgUnitCost, 0);
  const reservedValue = MAT_ITEMS.reduce((sum, item) => sum + stockBalance(item.id).reserved * item.avgUnitCost, 0);
  const slowValue = MAT_ITEMS.filter((item) => isSlowMoving(item.id))
    .reduce((sum, item) => sum + stockBalance(item.id).usable * item.avgUnitCost, 0);
  const pendingIssues = store.mirs.filter((mir) => ["Pending Approval", "Approved", "Picking"].includes(mir.status)).length;
  const totalConsumed = projects.reduce((sum, { kpis }) => sum + kpis.actualConsumed, 0);
  const totalRemaining = projects.reduce((sum, { kpis }) => sum + kpis.remaining, 0);

  // Cost variance by section for the Cobot BOM (PR price vs estimate).
  const sectionVariance = ["HW.EL", "HW.ME", "HW.STD", "HW.INF"].map((section) => {
    const lines = store.prs.flatMap((pr) => pr.lines).filter((line) => line.budgetSection === section);
    const est = lines.reduce((sum, line) => sum + line.qty * line.estUnitCost, 0);
    const actual = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
    return { label: t(BOM_SECTIONS.find((entry) => entry.code === section)?.name ?? section), value: actual - est };
  });

  const monthlyPr = [
    { label: "Apr", value: 412_000 }, { label: "May", value: 655_000 }, { label: "Jun", value: 380_000 },
    { label: "Jul", value: 1_240_000 }, { label: "Aug", value: Math.round(store.prs.filter((pr) => pr.requestDate.startsWith("2026-08")).reduce((sum, pr) => sum + matPrAmount(pr), 0)) },
  ];

  const suppliers = [
    { label: "RS Components Thailand", value: 96, note: "24 " + t("deliveries") },
    { label: "Mitsubishi Electric Automation", value: 92, note: "11 " + t("deliveries") },
    { label: "Keyence (Thailand)", value: 88, note: "9 " + t("deliveries") },
    { label: "TP Precision Fabrication", value: 71, note: "7 " + t("deliveries") },
    { label: "Thai Control Panel Works", value: 78, note: "6 " + t("deliveries") },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t("MATERIAL & PROCUREMENT")}
        title={t("Procurement Dashboard")}
        subtitle={t("Budget, commitment, consumption and inventory risk across every running project — the management view.")}
      />

      <section className="kpi-grid eight">
        <div className="kpi blue"><span className="kpi-icon"><Icon name="file" /></span><span className="kpi-body"><span className="kpi-label">{t("Open PR Value")}</span><strong className="kpi-value">{moneyShort(openPrValue)}</strong><span className="kpi-note">{openPrs.length} PR</span></span></div>
        <div className="kpi violet"><span className="kpi-icon"><Icon name="truck" /></span><span className="kpi-body"><span className="kpi-label">{t("Open PO Value")}</span><strong className="kpi-value">{moneyShort(openPoValue)}</strong><span className="kpi-note">{openPos.length} PO</span></span></div>
        <div className="kpi red"><span className="kpi-icon"><Icon name="alertTriangle" /></span><span className="kpi-body"><span className="kpi-label">{t("PR Over Budget")}</span><strong className="kpi-value">{overBudgetPrs.length}</strong><span className="kpi-note">{t("needs exception approval")}</span></span></div>
        <div className="kpi red"><span className="kpi-icon"><Icon name="clock" /></span><span className="kpi-body"><span className="kpi-label">{t("Overdue Deliveries")}</span><strong className="kpi-value">{overduePos.length}</strong><span className="kpi-note">{partialPos.length} {t("partial")}</span></span></div>
        <div className="kpi blue"><span className="kpi-icon"><Icon name="database" /></span><span className="kpi-body"><span className="kpi-label">{t("Inventory Value")}</span><strong className="kpi-value">{moneyShort(inventoryValue)}</strong><span className="kpi-note">{t("Reserved")} {moneyShort(reservedValue)}</span></span></div>
        <div className="kpi amber"><span className="kpi-icon"><Icon name="package" /></span><span className="kpi-body"><span className="kpi-label">{t("Slow-moving Inventory")}</span><strong className="kpi-value">{moneyShort(slowValue)}</strong><span className="kpi-note">{t("unused project stock")}</span></span></div>
        <div className="kpi blue"><span className="kpi-icon"><Icon name="upload" /></span><span className="kpi-body"><span className="kpi-label">{t("Pending Material Issues")}</span><strong className="kpi-value">{pendingIssues}</strong><span className="kpi-note">{t("waiting approval or picking")}</span></span></div>
        <div className="kpi green"><span className="kpi-icon"><Icon name="checkCircle" /></span><span className="kpi-body"><span className="kpi-label">{t("Actual Material Consumption")}</span><strong className="kpi-value">{moneyShort(totalConsumed)}</strong><span className="kpi-note">{t("Remaining Budget")} {moneyShort(totalRemaining)}</span></span></div>
      </section>

      <Panel
        title={t("Budget vs Commitment vs Actual by Project")}
        subtitle={t("Forecast = actual consumed + open commitment + reserved stock — the red line is the approved material budget")}
        flush
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Project")}</th><th className="num">{t("Approved Budget")}</th>
                <th className="num">{t("Actual")}</th><th className="num">{t("Committed")}</th><th className="num">{t("Reserved")}</th>
                <th className="num">{t("Forecast")}</th><th className="num">{t("Remaining")}</th>
                <th style={{ width: 260 }}>{t("Consumption")}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(({ project, kpis }) => {
                const pct = (value: number) => Math.min(100, kpis.approvedBudget ? (value / kpis.approvedBudget) * 100 : 0);
                return (
                  <tr key={project.id} className="clickable" onClick={() => go({ name: "project", id: project.id })}>
                    <td><strong>{project.no}</strong><div className="muted" style={{ fontSize: 11 }}>{project.name}</div></td>
                    <td className="num"><strong>{moneyShort(kpis.approvedBudget)}</strong></td>
                    <td className="num">{moneyShort(kpis.actualConsumed)}</td>
                    <td className="num violet-text">{moneyShort(kpis.openCommitment)}</td>
                    <td className="num">{moneyShort(kpis.reservedValue)}</td>
                    <td className="num"><strong className={kpis.forecast > kpis.approvedBudget ? "red-text" : undefined}>{moneyShort(kpis.forecast)}</strong></td>
                    <td className="num"><strong className={kpis.remaining < 0 ? "red-text" : "green-text"}>{moneyShort(kpis.remaining)}</strong></td>
                    <td>
                      <div className="budget-bar" title={`${t("Actual")} ${moneyShort(kpis.actualConsumed)} · ${t("Committed")} ${moneyShort(kpis.openCommitment)} · ${t("Reserved")} ${moneyShort(kpis.reservedValue)}`}>
                        <span className="seg actual" style={{ width: `${pct(kpis.actualConsumed)}%` }} />
                        <span className="seg committed" style={{ width: `${pct(kpis.openCommitment)}%` }} />
                        <span className="seg reserved" style={{ width: `${pct(kpis.reservedValue)}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel-body" style={{ display: "flex", gap: 16, borderTop: "1px solid var(--line-soft)" }}>
          <span className="legend-chip actual">{t("Actual")}</span>
          <span className="legend-chip committed">{t("Committed")}</span>
          <span className="legend-chip reserved">{t("Reserved")}</span>
        </div>
      </Panel>

      <section className="grid-main">
        <div className="stack">
          <Panel title={t("Monthly PR Value")} subtitle={t("Requested purchasing value per month (THB)")}>
            <BarChart data={monthlyPr} unit="" />
          </Panel>
          <Panel title={t("Cost Variance by Section")} subtitle={t("PR price minus estimate, per BOM section")}>
            <HBarList data={sectionVariance} format={(value) => `${value > 0 ? "+" : ""}${moneyShort(value)}`} />
          </Panel>
        </div>
        <div className="stack">
          <Panel title={t("Supplier On-time Delivery Rate")} subtitle={t("Last 12 months")}>
            <HBarList data={suppliers} format={(value) => `${value}%`} />
          </Panel>
          <Panel title={t("Purchasing exceptions")} flush>
            <div className="panel-body">
              {store.prs.filter((pr) => pr.status === "In Approval").map((pr) => (
                <div className="file-row" key={pr.id}>
                  <span className="file-icon"><Icon name="file" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{pr.no} · {moneyShort(matPrAmount(pr))} THB</strong>
                    <small>{userName(pr.requestedBy)} · {t("variance")} {matPrVariancePct(pr) > 0 ? "+" : ""}{matPrVariancePct(pr).toFixed(1)}% · {t("waiting")} {userName(pr.steps.find((step) => step.status === "Current")?.approverId ?? "")}</small>
                  </div>
                  <button className="btn default sm" type="button" onClick={() => go({ name: "pr", id: pr.id })}>{t("Review")}</button>
                </div>
              ))}
              {overduePos.map((po) => (
                <div className="file-row" key={po.id}>
                  <span className="file-icon"><Icon name="clock" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong className="red-text">{po.no} · {po.supplier}</strong>
                    <small>{t("expected")} {formatDate(po.expectedDate)} · {t("open value")} {moneyShort(poFacts(po).openValue)}</small>
                  </div>
                  <Badge tone="red">{t("Overdue")}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>
    </>
  );
}
