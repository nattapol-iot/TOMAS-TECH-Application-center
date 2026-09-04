"use client";

import {
  CUSTOMERS, DEPARTMENT_MANHOURS, ESTIMATES, INQUIRIES, MISSING_PRICES,
  MONTHLY_COST, PROJECT_TYPES,
} from "../data";
import {
  categoryTotals, departmentEffort, estimateTotals, formatDate, millions,
  money, moneyShort, TODAY, userName, daysBetween,
} from "../calc";
import {
  Badge, BarChart, Donut, HBarList, Icon, KpiCard, Panel, PageHeader,
  ProgressCell, Progress, toneOf,
} from "../ui";
import type { ScreenProps } from "../routes";

const isOverdue = (dueDate: string, status: string) =>
  status !== "Approved" && status !== "Locked" && new Date(dueDate) < TODAY;

export default function Dashboard({ go }: ScreenProps) {
  const openInquiry = INQUIRIES.filter((i) => i.status !== "Approved" && i.status !== "Cancelled").length;
  const inProgress = ESTIMATES.filter((e) => e.status === "Engineering Input" || e.status === "Draft" || e.status === "Estimate Completed").length;
  const waitingSupplier = MISSING_PRICES.filter((m) => m.status !== "Price Updated" && m.status !== "Received").length;
  const waitingEngineer = ESTIMATES.flatMap((e) => e.assignments).filter((a) => a.status === "Not Started" || a.status === "In Progress" || a.status === "Waiting Information").length;
  const waitingReview = ESTIMATES.filter((e) => e.status === "Engineering Review").length;
  const dueThisWeek = ESTIMATES.filter((e) => {
    const days = -daysBetween(e.dueDate);
    return days >= 0 && days <= 7 && e.status !== "Approved";
  }).length;
  const overdue = ESTIMATES.filter((e) => isOverdue(e.dueDate, e.status)).length;
  const completedThisMonth = 14;

  const byStatus = ["Draft", "Engineering Input", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Approved"]
    .map((status) => ({ label: status.replace("Engineering ", "Eng. ").replace("Waiting Supplier Price", "Waiting Price"), value: ESTIMATES.filter((e) => e.status === status).length }))
    .filter((entry) => entry.value > 0);

  const byDepartment = DEPARTMENT_MANHOURS.map((d) => ({ label: d.department, value: d.manDays }));

  const byProjectType = PROJECT_TYPES
    .map((type) => ({ label: type, value: ESTIMATES.filter((e) => e.projectType === type).length }))
    .filter((entry) => entry.value > 0);

  const costCategories = (() => {
    const map = new Map<string, number>();
    for (const estimate of ESTIMATES) {
      for (const entry of categoryTotals(estimate.items)) {
        map.set(entry.name, (map.get(entry.name) ?? 0) + entry.total);
      }
    }
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  })();

  const manhourCost = DEPARTMENT_MANHOURS.map((d) => ({ label: d.department, value: d.cost }));

  return (
    <>
      <PageHeader
        eyebrow="ENGINEERING"
        title="Engineering Estimate Dashboard"
        subtitle="Monitor inquiry workload, estimate progress, due dates, missing costs, and engineering resources."
        actions={
          <>
            <button className="btn default" type="button" onClick={() => go({ name: "missing" })}>
              <Icon name="truck" />Waiting supplier price
            </button>
            <button className="btn primary" type="button" onClick={() => go({ name: "inquiry-new" })}>
              <Icon name="plus" />New inquiry
            </button>
          </>
        }
      />

      <section className="kpi-grid eight">
        <KpiCard label="Open Inquiry" value={18} note={`${openInquiry} tracked here`} tone="blue" icon="inbox" onClick={() => go({ name: "inquiries" })} />
        <KpiCard label="Estimate In Progress" value={11} note={`${inProgress} in this workspace`} tone="blue" icon="file" onClick={() => go({ name: "estimates" })} />
        <KpiCard label="Waiting Supplier Price" value={4} note={`${waitingSupplier} items open`} tone="amber" icon="truck" onClick={() => go({ name: "missing" })} />
        <KpiCard label="Waiting Engineer Input" value={6} note={`${waitingEngineer} sections open`} tone="amber" icon="user" />
        <KpiCard label="Waiting Review" value={3} note={`${waitingReview} submitted`} tone="violet" icon="checkCircle" onClick={() => go({ name: "estimates" })} />
        <KpiCard label="Due This Week" value={6} note={`${dueThisWeek} in this list`} tone="amber" icon="calendar" />
        <KpiCard label="Overdue Estimate" value={2} note={`${overdue} past due date`} tone="red" icon="alertTriangle" />
        <KpiCard label="Completed This Month" value={completedThisMonth} note="Approved in August" tone="green" icon="check" />
      </section>

      <section className="grid-3">
        <Panel title="Estimate by Status" subtitle="Current pipeline">
          <Donut
            data={byStatus}
            centerLabel="Estimates"
            centerValue={String(ESTIMATES.length)}
          />
        </Panel>
        <Panel title="Estimate by Department" subtitle="Engineering man-days committed">
          <BarChart data={byDepartment} unit=" MD" />
        </Panel>
        <Panel title="Estimate by Project Type" subtitle="Active estimates">
          <HBarList data={byProjectType} />
        </Panel>
      </section>

      <section className="grid-3">
        <Panel title="Monthly Estimated Cost" subtitle="Total estimated cost issued per month (M THB)">
          <BarChart data={MONTHLY_COST.map((m) => ({ label: m.month, value: m.cost }))} unit="M" />
        </Panel>
        <Panel title="Engineering Man-hour by Department" subtitle="Estimated engineering cost">
          <HBarList data={manhourCost} format={(value) => moneyShort(value)} />
        </Panel>
        <Panel title="Top Cost Categories" subtitle="Across all open estimates">
          <HBarList data={costCategories} format={(value) => millions(value)} />
        </Panel>
      </section>

      <Panel
        title="Recent Estimate Cost"
        subtitle="Latest activity across the engineering team"
        actions={<button className="link-btn" type="button" onClick={() => go({ name: "estimates" })}>View all estimates<Icon name="arrowRight" /></button>}
        flush
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Inquiry No.</th>
                <th>Estimate No.</th>
                <th>Customer</th>
                <th>Project Name</th>
                <th>Project Type</th>
                <th>Estimate Owner</th>
                <th>Rev.</th>
                <th>Due Date</th>
                <th className="num">Total Estimated Cost</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Last Updated</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {ESTIMATES.map((estimate) => {
                const totals = estimateTotals(estimate);
                const customer = CUSTOMERS.find((c) => c.id === estimate.customerId);
                const late = isOverdue(estimate.dueDate, estimate.status);
                return (
                  <tr key={estimate.id} className="clickable" onClick={() => go({ name: "estimate", id: estimate.id })}>
                    <td><span className="mono">{estimate.inquiryNo}</span></td>
                    <td><strong className="mono">{estimate.no}</strong></td>
                    <td>{customer?.code}</td>
                    <td>
                      <div className="cell-primary">
                        <strong>{estimate.projectName}</strong>
                        <span>{customer?.name}</span>
                      </div>
                    </td>
                    <td>{estimate.projectType}</td>
                    <td>{userName(estimate.ownerId)}</td>
                    <td><span className="pill">{estimate.revision}</span></td>
                    <td className={late ? "red-text" : undefined}>{formatDate(estimate.dueDate)}</td>
                    <td className="num"><strong>{moneyShort(totals.total)}</strong></td>
                    <td style={{ minWidth: 110 }}><ProgressCell value={estimate.progress} /></td>
                    <td><Badge tone={toneOf(estimate.status)}>{estimate.status}</Badge></td>
                    <td className="muted">{estimate.updatedAt}</td>
                    <td><span className="row-action"><Icon name="chevronRight" /></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="grid-main">
        <Panel title="Estimate progress by section" subtitle="Multi-engineer completion for EST-2608-0001 R02" flush>
          <div className="panel-body">
            {ESTIMATES[0].assignments.map((assignment) => (
              <div className="assignment-card" key={assignment.id}>
                <div>
                  <strong>{assignment.section}</strong>
                  <small>{assignment.comment || "No open comment"}</small>
                </div>
                <div>
                  <small>Responsible</small>
                  <strong>{userName(assignment.ownerId)}</strong>
                </div>
                <div>
                  <small>Due</small>
                  <strong>{formatDate(assignment.dueDate)}</strong>
                </div>
                <div>
                  <Progress value={assignment.progress} />
                  <small>{assignment.progress}% complete</small>
                </div>
                <Badge tone={toneOf(assignment.status)}>{assignment.status}</Badge>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Needs attention" subtitle="Deadlines, missing prices and reviews">
          <ul className="check-list">
            {ESTIMATES.filter((e) => isOverdue(e.dueDate, e.status)).map((estimate) => (
              <li className="check-item error" key={estimate.id}>
                <Icon name="alertTriangle" />
                <div>
                  <strong>{estimate.no} is overdue</strong>
                  <p>{estimate.projectName} — due {formatDate(estimate.dueDate)}</p>
                </div>
              </li>
            ))}
            {MISSING_PRICES.filter((m) => m.status === "Waiting Supplier" || m.status === "Not Requested").map((missing) => (
              <li className="check-item warning" key={missing.id}>
                <Icon name="clock" />
                <div>
                  <strong>{missing.status === "Not Requested" ? "Supplier price not requested" : "Waiting supplier price"}</strong>
                  <p>{missing.item} — required {formatDate(missing.requiredDate)}</p>
                </div>
              </li>
            ))}
            <li className="check-item warning">
              <Icon name="alertCircle" />
              <div>
                <strong>Supplier quotation expired</strong>
                <p>SQ-2606-0028 HIKROBOT — expired 18-Aug-2026</p>
              </div>
            </li>
          </ul>
          <button className="btn default block" type="button" onClick={() => go({ name: "missing" })} style={{ marginTop: 12 }}>
            Open waiting supplier price
          </button>
        </Panel>
      </section>

      <section className="grid-2">
        <Panel title="Engineering cost snapshot" subtitle={`${ESTIMATES[0].no} — ${ESTIMATES[0].projectName}`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th className="num">Man-days</th>
                  <th className="num">Man-hours</th>
                  <th className="num">Estimated Cost</th>
                </tr>
              </thead>
              <tbody>
                {departmentEffort(ESTIMATES[0]).map((row) => (
                  <tr key={row.department}>
                    <td><strong>{row.department}</strong></td>
                    <td className="num">{row.manDays} MD</td>
                    <td className="num">{row.manHours} HR</td>
                    <td className="num">{moneyShort(row.cost)}</td>
                  </tr>
                ))}
                <tr className="subtotal-row">
                  <td>Total</td>
                  <td className="num">{estimateTotals(ESTIMATES[0]).manDays} MD</td>
                  <td className="num">{estimateTotals(ESTIMATES[0]).manHours} HR</td>
                  <td className="num">{money(estimateTotals(ESTIMATES[0]).engineering)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Customer workload" subtitle="Inquiries received this year">
          <HBarList
            data={CUSTOMERS.map((c) => ({ label: c.name, value: c.inquiries, note: c.industry }))}
          />
        </Panel>
      </section>
    </>
  );
}
