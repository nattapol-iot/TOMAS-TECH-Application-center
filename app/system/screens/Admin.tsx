"use client";

import { useState } from "react";
import {
  AUDIT_LOG, BRANDS, COST_STRUCTURE, CUSTOMERS, DEPARTMENTS, ENGINEERING_ACTIVITIES,
  ENGINEER_LEVELS, ESTIMATE_LEAD_TIME, ESTIMATES, MONTHLY_COST,
  PRICE_LIBRARY, PROJECT_TYPES, RATES, SUPPLIERS, UNITS, USERS, DEPARTMENT_MANHOURS,
} from "../data";
import { estimateTotals, formatDate, moneyShort, userName } from "../calc";
import {
  Badge, BarChart, Donut, EmptyState, Field, GridControls, HBarList, Icon, Modal, Pagination, Panel,
  PageHeader, Person, Pill, ProgressCell, SearchInput, Select, Tabs, Toolbar, toneOf, usePaged,
} from "../ui";
import type { ScreenProps } from "../routes";

/* ==========================================================================
   Customers
   ========================================================================== */

export function Customers({ go, notify }: ScreenProps) {
  const [search, setSearch] = useState("");
  const rows = CUSTOMERS.filter((c) => `${c.code} ${c.name} ${c.industry}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader
        eyebrow="MASTER DATA"
        title="Customers"
        subtitle="Customer master shared by inquiry, estimate and reporting."
        actions={<button className="btn primary" type="button" onClick={() => notify("Customer form opened")}><Icon name="plus" />Add customer</button>}
      />
      <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Search customer code, name or industry…" /></Toolbar>
      <Panel title={`${rows.length} customers`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Code</th><th>Customer</th><th>Industry</th><th>Main contact</th><th>Email</th><th>Phone</th><th>Site</th><th className="num">Inquiries</th><th className="num">Open estimates</th><th aria-label="Action" /></tr>
            </thead>
            <tbody>
              {rows.map((customer) => {
                const open = ESTIMATES.filter((e) => e.customerId === customer.id && e.status !== "Approved").length;
                return (
                  <tr key={customer.id} className="clickable" onClick={() => go({ name: "inquiries" })}>
                    <td><strong className="mono">{customer.code}</strong></td>
                    <td><strong>{customer.name}</strong></td>
                    <td>{customer.industry}</td>
                    <td>{customer.contact}</td>
                    <td className="muted">{customer.email}</td>
                    <td className="mono">{customer.phone}</td>
                    <td>{customer.site}</td>
                    <td className="num">{customer.inquiries}</td>
                    <td className="num">{open}</td>
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
   Projects
   ========================================================================== */

export function Projects({ go }: ScreenProps) {
  const [type, setType] = useState("All project types");
  const rows = ESTIMATES.filter((estimate) => type === "All project types" || estimate.projectType === type);

  return (
    <>
      <PageHeader
        eyebrow="DELIVERY"
        title="Projects"
        subtitle="Approved estimates become project cost baselines — this is the bridge to project planning."
      />
      <Toolbar>
        <Select label="Project type" value={type} onChange={setType} options={["All project types", ...PROJECT_TYPES]} />
      </Toolbar>
      <Panel title={`${rows.length} projects`} subtitle="Estimated cost is the internal engineering baseline, never a selling price" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Project</th><th>Customer</th><th>Type</th><th>Estimate</th><th>Rev.</th><th>Owner</th><th className="num">Material</th><th className="num">Engineering</th><th className="num">Total Cost</th><th>Progress</th><th>Status</th><th aria-label="Action" /></tr>
            </thead>
            <tbody>
              {rows.map((estimate) => {
                const totals = estimateTotals(estimate);
                const customer = CUSTOMERS.find((c) => c.id === estimate.customerId);
                return (
                  <tr key={estimate.id} className="clickable" onClick={() => go({ name: "estimate", id: estimate.id })}>
                    <td><strong>{estimate.projectName}</strong></td>
                    <td>{customer?.code}</td>
                    <td>{estimate.projectType}</td>
                    <td className="mono">{estimate.no}</td>
                    <td><span className="pill">{estimate.revision}</span></td>
                    <td>{userName(estimate.ownerId)}</td>
                    <td className="num">{moneyShort(totals.material)}</td>
                    <td className="num">{moneyShort(totals.engineering)}</td>
                    <td className="num"><strong>{moneyShort(totals.total)}</strong></td>
                    <td style={{ minWidth: 110 }}><ProgressCell value={estimate.progress} /></td>
                    <td><Badge tone={toneOf(estimate.status)}>{estimate.status}</Badge></td>
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
   Reports
   ========================================================================== */

const REPORTS = [
  { id: "r1", name: "Estimate Cost by Month", detail: "Total estimated cost issued per month", icon: "chart" as const },
  { id: "r2", name: "Cost by Project Type", detail: "Where engineering cost is concentrated", icon: "layers" as const },
  { id: "r3", name: "Cost by Customer", detail: "Estimated cost per customer", icon: "users" as const },
  { id: "r4", name: "Material Cost Analysis", detail: "Category and supplier concentration", icon: "package" as const },
  { id: "r5", name: "Engineering Man-hour Analysis", detail: "Man-days and cost by department", icon: "clock" as const },
  { id: "r6", name: "Department Workload", detail: "Open estimate sections per department", icon: "grid" as const },
  { id: "r7", name: "Estimate Lead Time", detail: "Days from inquiry to approved estimate", icon: "calendar" as const },
  { id: "r8", name: "Estimate Accuracy", detail: "Estimated cost versus executed project cost", icon: "trendingUp" as const },
  { id: "r9", name: "Supplier Price Trend", detail: "Price movement by supplier and item", icon: "truck" as const },
  { id: "r10", name: "Cost Category Analysis", detail: "Share of each cost breakdown section", icon: "book" as const },
  { id: "r11", name: "Overdue Estimate", detail: "Estimates past their committed due date", icon: "alertTriangle" as const },
  { id: "r12", name: "Waiting Supplier Price", detail: "Items blocking estimate completion", icon: "clock" as const },
  { id: "r13", name: "Engineer Estimate Performance", detail: "Estimates prepared, on time, and reworked", icon: "user" as const },
];

export function Reports({ notify }: ScreenProps) {
  const [active, setActive] = useState("r1");

  const costByCustomer = CUSTOMERS.map((customer) => ({
    label: customer.code,
    value: ESTIMATES.filter((e) => e.customerId === customer.id).reduce((sum, e) => sum + estimateTotals(e).total, 0),
  })).filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value);

  const costByType = PROJECT_TYPES.map((type) => ({
    label: type,
    value: ESTIMATES.filter((e) => e.projectType === type).reduce((sum, e) => sum + estimateTotals(e).total, 0),
  })).filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value);

  const workload = DEPARTMENTS.map((department) => ({
    label: department,
    value: ESTIMATES.flatMap((e) => e.assignments).filter((a) => {
      const owner = USERS.find((u) => u.id === a.ownerId);
      return owner?.department === department && a.status !== "Completed" && a.status !== "Reviewed";
    }).length,
  })).filter((entry) => entry.value > 0);

  return (
    <>
      <PageHeader
        eyebrow="ANALYSIS"
        title="Reports"
        subtitle="Engineering estimate reporting — cost, effort, lead time and workload. No commercial figures."
        actions={
          <>
            <button className="btn default" type="button" onClick={() => notify("Report exported to Excel")}><Icon name="download" />Export Excel</button>
            <button className="btn default" type="button" onClick={() => notify("Report exported to PDF")}><Icon name="file" />Export PDF</button>
          </>
        }
      />

      <section className="grid-main">
        <div className="stack">
          <Panel title={REPORTS.find((report) => report.id === active)?.name} subtitle={REPORTS.find((report) => report.id === active)?.detail}>
            {active === "r1" ? <BarChart data={MONTHLY_COST.map((m) => ({ label: m.month, value: m.cost }))} unit="M" height={220} /> : null}
            {active === "r2" ? <HBarList data={costByType} format={(value) => moneyShort(value)} /> : null}
            {active === "r3" ? <HBarList data={costByCustomer} format={(value) => moneyShort(value)} /> : null}
            {active === "r4" ? (
              <Donut
                data={COST_STRUCTURE.slice(0, 6).map((category) => ({
                  label: `${category.code} ${category.name}`,
                  value: ESTIMATES.flatMap((e) => e.items).filter((i) => i.categoryCode === category.code).reduce((sum, i) => sum + i.qty * i.unitCost, 0),
                })).filter((entry) => entry.value > 0)}
                centerLabel="Material"
                centerValue={`${Math.round(ESTIMATES.reduce((sum, e) => sum + estimateTotals(e).material, 0) / 1_000_000)}M`}
                format={(value) => moneyShort(value)}
              />
            ) : null}
            {active === "r5" ? <BarChart data={DEPARTMENT_MANHOURS.map((d) => ({ label: d.department, value: d.manDays }))} unit=" MD" height={220} /> : null}
            {active === "r6" ? <HBarList data={workload} /> : null}
            {active === "r7" ? <BarChart data={ESTIMATE_LEAD_TIME.map((entry) => ({ label: entry.type, value: entry.days }))} unit=" d" height={220} /> : null}
            {active === "r8" ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Project</th><th className="num">Estimated</th><th className="num">Executed</th><th className="num">Variance</th><th>Result</th></tr></thead>
                  <tbody>
                    {[
                      ["FTS Traceability 2026", 2380000, 2455000],
                      ["AAPICO Press Line", 1712000, 1668000],
                      ["Meiji OEE Phase 1", 1245000, 1310000],
                      ["TTS Energy Phase 1", 986000, 972000],
                    ].map(([project, estimated, executed]) => {
                      const variance = (Number(executed) - Number(estimated)) / Number(estimated) * 100;
                      return (
                        <tr key={String(project)}>
                          <td><strong>{project}</strong></td>
                          <td className="num">{moneyShort(Number(estimated))}</td>
                          <td className="num">{moneyShort(Number(executed))}</td>
                          <td className={`num ${variance > 0 ? "red-text" : "green-text"}`}>{variance > 0 ? "+" : ""}{variance.toFixed(1)}%</td>
                          <td><Badge tone={Math.abs(variance) <= 3 ? "green" : "amber"}>{Math.abs(variance) <= 3 ? "Within tolerance" : "Review estimate method"}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {active === "r9" ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Item</th><th>Brand</th><th>Supplier</th><th className="num">First price</th><th className="num">Latest price</th><th className="num">Change</th></tr></thead>
                  <tbody>
                    {PRICE_LIBRARY.map((record) => {
                      const first = record.history[0].price;
                      const change = ((record.price - first) / first) * 100;
                      return (
                        <tr key={record.id}>
                          <td><strong>{record.description}</strong></td>
                          <td>{record.brand}</td>
                          <td>{record.supplier}</td>
                          <td className="num">{moneyShort(first)}</td>
                          <td className="num">{moneyShort(record.price)}</td>
                          <td className={`num ${change >= 0 ? "red-text" : "green-text"}`}>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {active === "r10" ? (
              <HBarList
                data={COST_STRUCTURE.map((category) => ({
                  label: `${category.code} ${category.name}`,
                  value: ESTIMATES.flatMap((e) => e.items).filter((i) => i.categoryCode === category.code).reduce((sum, i) => sum + i.qty * i.unitCost, 0),
                })).filter((entry) => entry.value > 0)}
                format={(value) => moneyShort(value)}
              />
            ) : null}
            {active === "r11" ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Estimate</th><th>Project</th><th>Owner</th><th>Due</th><th className="num">Days late</th><th>Status</th></tr></thead>
                  <tbody>
                    {ESTIMATES.filter((e) => new Date(e.dueDate) < new Date("2026-08-29") && e.status !== "Approved").map((estimate) => (
                      <tr key={estimate.id}>
                        <td className="mono">{estimate.no}</td>
                        <td><strong>{estimate.projectName}</strong></td>
                        <td>{userName(estimate.ownerId)}</td>
                        <td className="red-text">{formatDate(estimate.dueDate)}</td>
                        <td className="num red-text">{Math.round((new Date("2026-08-29").getTime() - new Date(estimate.dueDate).getTime()) / 86400000)}</td>
                        <td><Badge tone={toneOf(estimate.status)}>{estimate.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {active === "r12" ? (
              <EmptyState icon="truck" title="Open the dedicated screen" message="Waiting supplier price has its own working screen with status control." />
            ) : null}
            {active === "r13" ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Engineer</th><th>Department</th><th className="num">Estimates</th><th className="num">On time</th><th className="num">Revisions</th><th className="num">Avg. lead time</th></tr></thead>
                  <tbody>
                    {USERS.filter((user) => user.role === "Engineer").map((user, index) => (
                      <tr key={user.id}>
                        <td><Person initials={user.initials} name={user.name} /></td>
                        <td>{user.department}</td>
                        <td className="num">{6 + index}</td>
                        <td className="num green-text">{85 + index * 2}%</td>
                        <td className="num">{1 + (index % 3)}</td>
                        <td className="num">{7 + index} days</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Panel>
        </div>

        <Panel title="Report library" subtitle="Excel and PDF export on every report" flush>
          <div className="panel-body" style={{ padding: 8 }}>
            {REPORTS.map((report) => (
              <button
                key={report.id}
                type="button"
                className={`search-result${active === report.id ? " selected" : ""}`}
                style={active === report.id ? { background: "var(--blue-soft)" } : undefined}
                onClick={() => setActive(report.id)}
              >
                <Icon name={report.icon} />
                <span style={{ flex: 1 }}>
                  <strong>{report.name}</strong>
                  <small>{report.detail}</small>
                </span>
                <Icon name="chevronRight" />
              </button>
            ))}
          </div>
        </Panel>
      </section>
    </>
  );
}

/* ==========================================================================
   Master data
   ========================================================================== */

type MasterTab =
  | "customer" | "supplier" | "employee" | "level" | "projectType" | "category"
  | "subcategory" | "brand" | "item" | "unit" | "activity" | "rate" | "document" | "standard";

export function MasterData({ go, notify }: ScreenProps) {
  const [tab, setTab] = useState<MasterTab>("customer");

  const simple = (title: string, values: string[], columns: string[] = ["Name"]) => (
    <Panel title={title} subtitle={`${values.length} records`} actions={<button className="btn primary sm" type="button" onClick={() => notify(`${title} record added`)}><Icon name="plus" />Add</button>} flush>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th>{columns.map((column) => <th key={column}>{column}</th>)}<th>Status</th><th aria-label="Action" /></tr></thead>
          <tbody>
            {values.map((value, index) => (
              <tr key={value}>
                <td className="mono">{String(index + 1).padStart(3, "0")}</td>
                <td><strong>{value}</strong></td>
                <td><Badge tone="green">Active</Badge></td>
                <td><button className="row-action" type="button" aria-label={`Edit ${value}`}><Icon name="edit" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );

  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Master Data"
        subtitle="One controlled vocabulary for every estimate — so different engineers cannot use different calculation methods."
        actions={<button className="btn default" type="button" onClick={() => go({ name: "rates" })}><Icon name="book" />Engineering rate master</button>}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "customer", label: "Customer", count: CUSTOMERS.length },
          { id: "supplier", label: "Supplier", count: SUPPLIERS.length },
          { id: "employee", label: "Employee", count: USERS.length },
          { id: "level", label: "Engineer Level", count: ENGINEER_LEVELS.length },
          { id: "projectType", label: "Project Type", count: PROJECT_TYPES.length },
          { id: "category", label: "Cost Category", count: COST_STRUCTURE.length },
          { id: "subcategory", label: "Cost Subcategory", count: COST_STRUCTURE.flatMap((c) => c.subs).length },
          { id: "brand", label: "Brand", count: BRANDS.length },
          { id: "item", label: "Item Master", count: PRICE_LIBRARY.length },
          { id: "unit", label: "Unit", count: UNITS.length },
          { id: "activity", label: "Engineering Activity", count: ENGINEERING_ACTIVITIES.length },
          { id: "rate", label: "Engineering Rate", count: RATES.length },
          { id: "document", label: "Document Category", count: 10 },
          { id: "standard", label: "Project Standard", count: 6 },
        ]}
      />

      {tab === "customer" ? (
        <Panel title="Customer Master" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Customer</th><th>Industry</th><th>Contact</th><th>Email</th><th>Site</th><th aria-label="Action" /></tr></thead>
              <tbody>
                {CUSTOMERS.map((customer) => (
                  <tr key={customer.id}>
                    <td className="mono">{customer.code}</td>
                    <td><strong>{customer.name}</strong></td>
                    <td>{customer.industry}</td>
                    <td>{customer.contact}</td>
                    <td className="muted">{customer.email}</td>
                    <td>{customer.site}</td>
                    <td><button className="row-action" type="button" aria-label="Edit"><Icon name="edit" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {tab === "supplier" ? (
        <Panel title="Supplier Master" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Supplier</th><th>Category</th><th>Brands</th><th>Contact</th><th>Email</th><th>Phone</th><th>Status</th><th aria-label="Action" /></tr></thead>
              <tbody>
                {SUPPLIERS.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="mono">{supplier.code}</td>
                    <td><strong>{supplier.name}</strong></td>
                    <td>{supplier.category}</td>
                    <td>{supplier.brands.join(", ")}</td>
                    <td>{supplier.contact}</td>
                    <td className="muted">{supplier.email}</td>
                    <td className="mono">{supplier.phone}</td>
                    <td><Badge tone={supplier.status === "Active" ? "green" : "amber"}>{supplier.status}</Badge></td>
                    <td><button className="row-action" type="button" aria-label="Edit"><Icon name="edit" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {tab === "employee" ? (
        <Panel title="Employee Master" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Email</th><th>Department</th><th>Level</th><th>Role</th><th className="num">Daily rate</th><th aria-label="Action" /></tr></thead>
              <tbody>
                {USERS.map((user) => {
                  const rate = RATES.find((r) => r.level === user.level && r.department === user.department);
                  return (
                    <tr key={user.id}>
                      <td><Person initials={user.initials} name={user.name} /></td>
                      <td className="muted">{user.email}</td>
                      <td>{user.department}</td>
                      <td>{user.level}</td>
                      <td><Badge tone="slate">{user.role}</Badge></td>
                      <td className="num">{rate ? moneyShort(rate.engineeringDaily) : "—"}</td>
                      <td><button className="row-action" type="button" aria-label="Edit"><Icon name="edit" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {tab === "level" ? simple("Engineer Level Master", ENGINEER_LEVELS) : null}
      {tab === "projectType" ? simple("Project Type Master", PROJECT_TYPES) : null}
      {tab === "category" ? (
        <Panel title="Cost Category / Cost Breakdown Structure" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Cost category</th><th className="num">Subcategories</th><th>Subcategory list</th><th aria-label="Action" /></tr></thead>
              <tbody>
                {COST_STRUCTURE.map((category) => (
                  <tr key={category.code}>
                    <td><Pill tone="blue">{category.code}</Pill></td>
                    <td><strong>{category.name}</strong></td>
                    <td className="num">{category.subs.length}</td>
                    <td className="muted">{category.subs.map((sub) => sub.name).join(" · ")}</td>
                    <td><button className="row-action" type="button" aria-label="Edit"><Icon name="edit" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      {tab === "subcategory" ? (
        <Panel title="Cost Subcategory Master" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Subcategory</th><th>Parent category</th><th aria-label="Action" /></tr></thead>
              <tbody>
                {COST_STRUCTURE.flatMap((category) => category.subs.map((sub) => ({ ...sub, parent: `${category.code} ${category.name}` }))).map((sub) => (
                  <tr key={sub.code}>
                    <td className="mono">{sub.code}</td>
                    <td><strong>{sub.name}</strong></td>
                    <td>{sub.parent}</td>
                    <td><button className="row-action" type="button" aria-label="Edit"><Icon name="edit" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      {tab === "brand" ? simple("Brand Master", BRANDS) : null}
      {tab === "item" ? (
        <Panel title="Item Master" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item code</th><th>Description</th><th>Brand</th><th>Model</th><th>Category</th><th>Unit</th><th className="num">Latest price</th><th aria-label="Action" /></tr></thead>
              <tbody>
                {PRICE_LIBRARY.map((record) => (
                  <tr key={record.id}>
                    <td className="mono">{record.itemCode}</td>
                    <td><strong>{record.description}</strong></td>
                    <td>{record.brand}</td>
                    <td className="mono">{record.model}</td>
                    <td>{record.category}</td>
                    <td>{record.unit}</td>
                    <td className="num">{moneyShort(record.price)}</td>
                    <td><button className="row-action" type="button" aria-label="Edit"><Icon name="edit" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      {tab === "unit" ? simple("Unit Master", UNITS) : null}
      {tab === "activity" ? simple("Engineering Activity Master", ENGINEERING_ACTIVITIES) : null}
      {tab === "rate" ? <RateTable notify={notify} /> : null}
      {tab === "document" ? simple("Document Category Master", ["Customer RFQ", "Meeting Record", "Specification", "Drawing", "Layout", "Equipment List", "Customer Standard", "Supplier Document", "Reference Document", "Other"]) : null}
      {tab === "standard" ? simple("Project Standard Master", ["ISO 10218-2 Robot Safety", "IATF 16949", "Astemo AS-114", "DENSO DQS-08", "Meiji Food Safety", "Fujikura IT Integration Guideline"]) : null}
    </>
  );
}

/* ==========================================================================
   Engineering rate master
   ========================================================================== */

function RateTable({ notify }: { notify: (message: string) => void }) {
  return (
    <Panel
      title="Engineering Rate Master"
      subtitle="Standard hourly and daily cost per employee level — used automatically when engineering effort is estimated"
      actions={<button className="btn primary sm" type="button" onClick={() => notify("New rate row added")}><Icon name="plus" />Add rate</button>}
      flush
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee Level</th><th>Department</th>
              <th className="num">Engineering Hourly</th><th className="num">Engineering Daily</th>
              <th className="num">Install. &amp; Service Hourly</th><th className="num">Install. &amp; Service Daily</th>
              <th className="num">Service uplift</th>
              <th>Effective from</th><th>Status</th><th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {RATES.map((rate) => (
              <tr key={rate.id}>
                <td><strong>{rate.level}</strong></td>
                <td>{rate.department}</td>
                <td className="num">{moneyShort(rate.engineeringHourly)}</td>
                <td className="num"><strong>{moneyShort(rate.engineeringDaily)}</strong></td>
                <td className="num">{moneyShort(rate.installationHourly)}</td>
                <td className="num"><strong className="amber-text">{moneyShort(rate.installationDaily)}</strong></td>
                <td className="num muted">+{Math.round(((rate.installationDaily - rate.engineeringDaily) / rate.engineeringDaily) * 100)}%</td>
                <td>{formatDate(rate.effective)}</td>
                <td><Badge tone="green">Active</Badge></td>
                <td><button className="row-action" type="button" aria-label="Edit"><Icon name="edit" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function RateMaster({ notify }: ScreenProps) {
  return (
    <>
      <PageHeader
        eyebrow="ADMIN CONTROLLED"
        title="Employee / Engineering Rate Master"
        subtitle="Engineers select a level instead of remembering a rate. Only the Engineering Manager and Admin can change these numbers."
        actions={<span className="badge amber"><Icon name="lock" />Engineering Manager / Admin only</span>}
      />
      <RateTable notify={notify} />
      <Panel title="How the rate is used" subtitle="Centralised calculation">
        <ul className="check-list">
          <li className="check-item"><Icon name="cpu" /><div><strong>Total Man-hour = Engineer Qty × Man-days × Hours per Day</strong><p>Hours per day defaults to 8 and can be changed per activity.</p></div></li>
          <li className="check-item"><Icon name="cpu" /><div><strong>Engineering Cost = Engineer Qty × Man-days × Daily Cost</strong><p>Or Total Hours × Hourly Cost when the activity is booked hourly.</p></div></li>
          <li className="check-item"><Icon name="truck" /><div><strong>Installation &amp; service work uses its own rate</strong><p>Each work package is marked Engineering cost or Installation &amp; Service cost; the estimate reads the matching rate automatically, and travel, accommodation and per diem are estimated inside the package.</p></div></li>
          <li className="check-item"><Icon name="quote" /><div><strong>Supplier man-hour is quoted, not rated</strong><p>Outsourced effort carries its supplier and quotation number instead of a master rate.</p></div></li>
          <li className="check-item"><Icon name="lock" /><div><strong>Rates are never typed on an estimate</strong><p>The estimate reads the rate from this master so two engineers cannot use different numbers.</p></div></li>
        </ul>
      </Panel>
    </>
  );
}

/* ==========================================================================
   Audit log
   ========================================================================== */

export function AuditLogScreen({ notify }: ScreenProps) {
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("All modules");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const modules = ["All modules", ...new Set(AUDIT_LOG.map((entry) => entry.module))];

  const rows = AUDIT_LOG.filter((entry) => {
    const haystack = `${entry.user} ${entry.estimate} ${entry.action} ${entry.reason}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (module !== "All modules" && entry.module !== module) return false;
    return true;
  });

  const paged = usePaged(rows, pageSize, page);

  return (
    <>
      <PageHeader
        eyebrow="TRACEABILITY"
        title="Audit Log"
        subtitle="Every cost, scope and workflow change with its previous value, new value and reason. Normal users cannot delete entries."
        actions={<button className="btn default" type="button" onClick={() => notify("Audit log exported to Excel")}><Icon name="download" />Export</button>}
      />
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search user, estimate, action or reason…" />
        <Select label="Module" value={module} onChange={setModule} options={modules} />
        <span className="spacer" />
        <span className="badge slate"><Icon name="lock" />Retained permanently</span>
      </Toolbar>
      <Panel title={`${rows.length} entries`} flush>
        <GridControls pageSize={pageSize} onPageSize={(size) => { setPageSize(size); setPage(1); }} search={search} onSearch={(value) => { setSearch(value); setPage(1); }} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date / Time</th><th>User</th><th>Estimate</th><th>Rev.</th><th>Module</th><th>Action</th><th>Previous Value</th><th>New Value</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {paged.pageRows.map((entry) => (
                <tr key={entry.id}>
                  <td className="mono">{entry.at}</td>
                  <td><Person initials={entry.user.split(" ").map((part) => part[0]).join("")} name={entry.user} /></td>
                  <td className="mono">{entry.estimate}</td>
                  <td><span className="pill">{entry.revision}</span></td>
                  <td><Badge tone="slate">{entry.module}</Badge></td>
                  <td><strong>{entry.action}</strong></td>
                  <td className="muted">{entry.before}</td>
                  <td className="green-text">{entry.after}</td>
                  <td className="muted">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={paged.current} pageCount={paged.pageCount} from={paged.from} to={paged.to} total={paged.total} onPage={setPage} />
        </div>
      </Panel>
    </>
  );
}

/* ==========================================================================
   Settings
   ========================================================================== */

const PERMISSIONS: { role: string; can: string[] }[] = [
  { role: "Engineer", can: ["Create estimate", "Input cost", "Search price", "Upload supplier quotation", "Estimate man-hour", "Update assigned section"] },
  { role: "Project Manager", can: ["Assign engineer", "Review scope", "Review estimate"] },
  { role: "Engineering Manager", can: ["Approve estimate cost", "Manage engineering rate", "View all estimate cost"] },
  { role: "Sales Engineer", can: ["Create inquiry", "View estimate status", "Cannot edit engineering cost unless granted"] },
  { role: "Admin", can: ["Manage users", "Manage master data", "System settings"] },
  { role: "Viewer", can: ["Read only"] },
];

const NOTIFICATION_RULES = [
  "New inquiry assigned",
  "Estimate due in 3 days",
  "Estimate due tomorrow",
  "Estimate overdue",
  "Engineering section not completed",
  "Supplier price still missing",
  "Supplier quotation expired",
  "Estimate waiting review",
  "Estimate revision requested",
  "Estimate approved",
  "New requirement added",
];

export function Settings({ notify }: ScreenProps) {
  const [tab, setTab] = useState<"roles" | "notification" | "numbering" | "storage" | "general">("roles");
  const [enabled, setEnabled] = useState<string[]>(NOTIFICATION_RULES.slice(0, 8));
  const [invite, setInvite] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Settings"
        subtitle="Roles, notifications, numbering standard and document storage."
        actions={<button className="btn primary" type="button" onClick={() => setInvite(true)}><Icon name="plus" />Add user</button>}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "roles", label: "Users & Roles" },
          { id: "notification", label: "Notifications" },
          { id: "numbering", label: "Numbering Standard" },
          { id: "storage", label: "Document Storage" },
          { id: "general", label: "General" },
        ]}
      />

      {tab === "roles" ? (
        <section className="grid-main">
          <Panel title="Users" subtitle={`${USERS.length} accounts`} flush>
            <div className="table-wrap">
              <table>
                <thead><tr><th>User</th><th>Email</th><th>Department</th><th>Role</th><th>Level</th><th>Status</th><th aria-label="Action" /></tr></thead>
                <tbody>
                  {USERS.map((user) => (
                    <tr key={user.id}>
                      <td><Person initials={user.initials} name={user.name} /></td>
                      <td className="muted">{user.email}</td>
                      <td>{user.department}</td>
                      <td><Badge tone={user.role === "Admin" ? "violet" : user.role === "Engineering Manager" ? "blue" : "slate"}>{user.role}</Badge></td>
                      <td>{user.level}</td>
                      <td><Badge tone="green">Active</Badge></td>
                      <td><button className="row-action" type="button" aria-label="Edit"><Icon name="edit" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Role permissions" subtitle="Approval covers technical scope and cost only — there is no margin approval in this system">
            {PERMISSIONS.map((permission) => (
              <div key={permission.role} style={{ marginBottom: 14 }}>
                <strong style={{ fontSize: "var(--fs-sm)" }}>{permission.role}</strong>
                <ul style={{ marginTop: 6 }}>
                  {permission.can.map((entry) => (
                    <li key={entry} className="row" style={{ gap: 6, color: "var(--muted)", fontSize: "var(--fs-xs)", padding: "2px 0" }}>
                      <Icon name="check" className="green-text" />{entry}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Panel>
        </section>
      ) : null}

      {tab === "notification" ? (
        <Panel title="Notification rules" subtitle="Sent by email and in-app">
          <ul className="check-list">
            {NOTIFICATION_RULES.map((rule) => (
              <li className="check-item" key={rule}>
                <label className="checkbox-row" style={{ flex: 1 }}>
                  <input
                    type="checkbox"
                    aria-label={rule}
                    checked={enabled.includes(rule)}
                    onChange={() => setEnabled((prev) => prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule])}
                  />
                  {rule}
                </label>
                <Badge tone={enabled.includes(rule) ? "green" : "slate"}>{enabled.includes(rule) ? "On" : "Off"}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {tab === "numbering" ? (
        <section className="grid-2">
          <Panel title="Numbering standard" subtitle="Generated by the system — users never type a number">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Document</th><th>Pattern</th><th>Example</th><th>Next</th></tr></thead>
                <tbody>
                  <tr><td>Inquiry</td><td className="mono">INQ-YYMM-XXXX</td><td className="mono">INQ-2608-0001</td><td className="mono">INQ-2608-0015</td></tr>
                  <tr><td>Estimate Cost</td><td className="mono">EST-YYMM-XXXX</td><td className="mono">EST-2608-0001</td><td className="mono">EST-2608-0007</td></tr>
                  <tr><td>Revision</td><td className="mono">R00, R01, R02…</td><td className="mono">R02</td><td className="mono">R03</td></tr>
                  <tr><td>Supplier Quotation</td><td className="mono">SQ-YYMM-XXXX</td><td className="mono">SQ-2608-0001</td><td className="mono">SQ-2608-0036</td></tr>
                  <tr><td>Purchase Requisition</td><td className="mono">PR-YYMM-XXXX</td><td className="mono">PR-2608-0001</td><td className="mono">PR-2609-0004</td></tr>
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Data integrity rules">
            <ul className="check-list">
              {[
                "Inquiry number cannot duplicate",
                "Estimate number cannot duplicate",
                "Every estimate must have an owner",
                "Every revision records its creator",
                "Created by / date and updated by / date on every change",
                "Approved by / date on every approval",
                "An approved revision cannot be edited",
                "Cost calculation is server controlled",
                "Delete is always a soft delete",
                "Audit logs are permanently available",
              ].map((rule) => (
                <li className="check-item pass" key={rule}><Icon name="checkCircle" /><div><strong>{rule}</strong></div></li>
              ))}
            </ul>
          </Panel>
        </section>
      ) : null}

      {tab === "storage" ? (
        <Panel title="Document storage" subtitle="The estimate database stores a storage key, not a file path — so the backing store can change without a migration">
          <div className="form-grid two">
            <Field label="Current storage provider">
              <select defaultValue="Microsoft 365 / SharePoint"><option>Microsoft 365 / SharePoint</option><option>Company NAS</option></select>
            </Field>
            <Field label="Site / share">
              <input defaultValue="https://tomastc.sharepoint.com/sites/Engineering" />
            </Field>
            <Field label="Folder pattern" span={2} hint="Applied to every uploaded document">
              <input defaultValue="/{Year}/{Customer}/{InquiryNo}/{DocumentCategory}/" />
            </Field>
          </div>
          <div className="info-strip" style={{ marginTop: 14 }}>
            <Icon name="alertCircle" />
            Migrating to the company NAS later only changes the storage adapter — inquiry, estimate and revision records stay untouched.
          </div>
        </Panel>
      ) : null}

      {tab === "general" ? (
        <section className="grid-2">
          <Panel title="General">
            <div className="form-grid two">
              <Field label="Default language"><select defaultValue="EN"><option>TH</option><option>EN</option><option>JP</option></select></Field>
              <Field label="Currency"><select defaultValue="THB"><option>THB</option><option>JPY</option><option>USD</option></select></Field>
              <Field label="Default hours per day"><input type="number" defaultValue={8} /></Field>
              <Field label="Default contingency (%)"><input type="number" defaultValue={3} /></Field>
              <Field label="Price age warning (days)"><input type="number" defaultValue={90} /></Field>
              <Field label="Price age critical (days)"><input type="number" defaultValue={180} /></Field>
            </div>
          </Panel>
          <Panel title="Estimate defaults">
            <div className="form-grid two">
              <Field label="Estimate due lead time (days)"><input type="number" defaultValue={10} /></Field>
              <Field label="Require price reference"><select defaultValue="Warning"><option>Warning</option><option>Block approval</option><option>Off</option></select></Field>
              <Field label="Auto save" span={2}><select defaultValue="Every 30 seconds"><option>Every 30 seconds</option><option>Every 2 minutes</option><option>Off</option></select></Field>
            </div>
            <div className="info-strip green" style={{ marginTop: 14 }}><Icon name="checkCircle" />No margin, markup or selling price field exists anywhere in this system.</div>
          </Panel>
        </section>
      ) : null}

      {invite ? (
        <Modal
          title="Add user"
          onClose={() => setInvite(false)}
          footer={<><span className="spacer" /><button className="btn default" type="button" onClick={() => setInvite(false)}>Cancel</button><button className="btn primary" type="button" onClick={() => { setInvite(false); notify("Invitation sent"); }}>Send invitation</button></>}
        >
          <div className="form-grid two">
            <Field label="Full name"><input placeholder="e.g. Somchai Rattana" /></Field>
            <Field label="Email"><input type="email" placeholder="name@tomastc.com" /></Field>
            <Field label="Department"><select>{DEPARTMENTS.map((department) => <option key={department}>{department}</option>)}</select></Field>
            <Field label="Engineer level"><select>{ENGINEER_LEVELS.map((level) => <option key={level}>{level}</option>)}</select></Field>
            <Field label="Role" span={2}><select>{["Admin", "Engineering Manager", "Project Manager", "Engineer", "Sales Engineer", "Viewer"].map((role) => <option key={role}>{role}</option>)}</select></Field>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
