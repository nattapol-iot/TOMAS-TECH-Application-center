"use client";

import { MAT_ITEMS, PROJECTS } from "../data";
import { formatDate, matKpis, matPrAmount, matPrVariancePct, moneyShort, userName, userOf } from "../calc";
import { useMatStore } from "../matstore";
import { useSession } from "../session";
import { Badge, EmptyState, Icon, Panel, PageHeader, Person, Pill } from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";

/* ==========================================================================
   Approvals inbox — everything waiting for a decision, in one queue
   ========================================================================== */

export default function MatApprovals({ go }: ScreenProps) {
  const t = useT();
  const session = useSession();
  const store = useMatStore();

  const prQueue = store.prs.filter((pr) => pr.status === "In Approval")
    .map((pr) => ({ pr, step: pr.steps.find((step) => step.status === "Current" || step.status === "Auto-added")! }))
    .filter((entry) => entry.step);
  const mirQueue = store.mirs.filter((mir) => mir.status === "Pending Approval");
  const adjustmentQueue = store.adjustments.filter((adjustment) => adjustment.status === "Pending Approval");
  const mine = prQueue.filter((entry) => entry.step.approverId === session.user.id).length
    + mirQueue.filter((mir) => PROJECTS.find((project) => project.id === mir.projectId)?.leadEngineerId === session.user.id).length
    + (session.role === "Inventory Controller" ? adjustmentQueue.length : 0);

  return (
    <>
      <PageHeader
        eyebrow={t("MATERIAL & PROCUREMENT")}
        title={t("Approvals")}
        subtitle={t("Every pending decision in the material flow — requisitions, material issues and stock adjustments. Requesters never see approve buttons on their own documents.")}
        meta={
          <>
            <div><span>{t("Waiting for you")}</span><strong>{mine}</strong></div>
            <div><span>{t("Total pending")}</span><strong>{prQueue.length + mirQueue.length + adjustmentQueue.length}</strong></div>
          </>
        }
      />

      <Panel title={t("Purchase Requisitions")} subtitle={`${prQueue.length} ${t("waiting for a decision")}`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>{t("PR No.")}</th><th>{t("Project")}</th><th>{t("Requested By")}</th><th className="num">{t("Amount")}</th><th className="num">{t("Variance")}</th><th>{t("Budget")}</th><th>{t("Current step")}</th><th>{t("Approver")}</th><th>{t("Rule flags")}</th><th aria-label="Open" /></tr>
            </thead>
            <tbody>
              {prQueue.map(({ pr, step }) => {
                const kpis = matKpis(pr.projectId);
                const project = PROJECTS.find((entry) => entry.id === pr.projectId);
                const over = kpis.remaining < matPrAmount(pr);
                const isMine = step.approverId === session.user.id;
                const flagged = pr.steps.some((entry) => entry.status === "Auto-added");
                return (
                  <tr key={pr.id} className={`clickable ${isMine ? "row-wait" : ""}`} onClick={() => go({ name: "pr", id: pr.id })}>
                    <td><strong className="mono">{pr.no}</strong></td>
                    <td>{project?.no}</td>
                    <td><Person initials={userOf(pr.requestedBy)?.initials ?? "—"} name={userName(pr.requestedBy)} /></td>
                    <td className="num"><strong>{moneyShort(matPrAmount(pr))}</strong></td>
                    <td className="num"><span className={matPrVariancePct(pr) > 0 ? "amber-text" : "green-text"}>{matPrVariancePct(pr) > 0 ? "+" : ""}{matPrVariancePct(pr).toFixed(1)}%</span></td>
                    <td><Badge tone={over ? "red" : "green"}>{over ? t("Over Budget") : t("Within Budget")}</Badge></td>
                    <td>{t(step.name)}</td>
                    <td>{isMine ? <Badge tone="amber">{t("You")}</Badge> : userName(step.approverId)}</td>
                    <td>{flagged ? <Pill tone="amber">{t("exception")}</Pill> : "—"}</td>
                    <td><span className="row-action"><Icon name="chevronRight" /></span></td>
                  </tr>
                );
              })}
              {!prQueue.length ? <tr><td colSpan={10}><EmptyState icon="checkCircle" title={t("Nothing waiting")} message={t("No requisition is waiting for a decision.")} /></td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={t("Material Issues")} subtitle={`${mirQueue.length} ${t("waiting for project approval")}`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>{t("Issue No.")}</th><th>{t("Project")}</th><th>{t("Requested By")}</th><th className="num">{t("Lines")}</th><th>{t("Required")}</th><th>{t("Approver")}</th><th aria-label="Open" /></tr>
            </thead>
            <tbody>
              {mirQueue.map((mir) => {
                const project = PROJECTS.find((entry) => entry.id === mir.projectId);
                const approver = project?.leadEngineerId ?? "";
                return (
                  <tr key={mir.id} className={`clickable ${approver === session.user.id ? "row-wait" : ""}`} onClick={() => go({ name: "mir", id: mir.id })}>
                    <td><strong className="mono">{mir.no}</strong></td>
                    <td>{project?.no} <span className="muted">{project?.name}</span></td>
                    <td><Person initials={userOf(mir.requestedBy)?.initials ?? "—"} name={userName(mir.requestedBy)} /></td>
                    <td className="num">{mir.lines.length}</td>
                    <td>{formatDate(mir.requiredDate)}</td>
                    <td>{approver === session.user.id ? <Badge tone="amber">{t("You")}</Badge> : userName(approver)}</td>
                    <td><span className="row-action"><Icon name="chevronRight" /></span></td>
                  </tr>
                );
              })}
              {!mirQueue.length ? <tr><td colSpan={7}><EmptyState icon="checkCircle" title={t("Nothing waiting")} message={t("No issue request is waiting for approval.")} /></td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={t("Stock Adjustments")} subtitle={`${adjustmentQueue.length} ${t("waiting for the inventory controller")}`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>{t("Adjustment")}</th><th>{t("Item")}</th><th className="num">{t("Change")}</th><th>{t("Reason")}</th><th>{t("Requested By")}</th><th>{t("Decide in")}</th></tr>
            </thead>
            <tbody>
              {adjustmentQueue.map((adjustment) => {
                const item = MAT_ITEMS.find((entry) => entry.id === adjustment.itemId)!;
                return (
                  <tr key={adjustment.id} className="clickable" onClick={() => go({ name: "inventory" })}>
                    <td><strong className="mono">{adjustment.no}</strong></td>
                    <td>{item.itemCode} · {item.partNo}</td>
                    <td className="num"><strong className={adjustment.qtyChange < 0 ? "red-text" : "green-text"}>{adjustment.qtyChange > 0 ? "+" : ""}{adjustment.qtyChange}</strong></td>
                    <td className="muted">{adjustment.reason}</td>
                    <td>{userName(adjustment.requestedBy)}</td>
                    <td><button className="link-btn" type="button">{t("Inventory")}<Icon name="arrowRight" /></button></td>
                  </tr>
                );
              })}
              {!adjustmentQueue.length ? <tr><td colSpan={6}><EmptyState icon="checkCircle" title={t("Nothing waiting")} message={t("No adjustment is pending.")} /></td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
