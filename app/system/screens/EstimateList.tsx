"use client";

import { useMemo, useState } from "react";
import { CUSTOMERS, DEPARTMENTS, ESTIMATES, PROJECT_TYPES, USERS } from "../data";
import { estimateTotals, formatDate, moneyShort, TODAY, userName, userOf } from "../calc";
import {
  Badge, EmptyState, GridControls, Icon, Pagination, Panel, PageHeader, Person, ProgressCell,
  SearchInput, Select, StatusLegend, Toolbar, toneOf, usePaged,
} from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";

export default function EstimateList({ go, notify }: ScreenProps) {
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("All customers");
  const [type, setType] = useState("All project types");
  const [owner, setOwner] = useState("All owners");
  const [department, setDepartment] = useState("All departments");
  const [status, setStatus] = useState("All status");
  const [revision, setRevision] = useState("All revisions");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const t = useT();

  const rows = useMemo(() => ESTIMATES.filter((estimate) => {
    const customerRecord = CUSTOMERS.find((c) => c.id === estimate.customerId);
    const haystack = `${estimate.no} ${estimate.inquiryNo} ${estimate.projectName} ${customerRecord?.name}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (customer !== "All customers" && customerRecord?.code !== customer) return false;
    if (type !== "All project types" && estimate.projectType !== type) return false;
    if (owner !== "All owners" && userName(estimate.ownerId) !== owner) return false;
    if (department !== "All departments" && userOf(estimate.ownerId)?.department !== department) return false;
    if (status !== "All status" && estimate.status !== status) return false;
    if (revision !== "All revisions" && estimate.revision !== revision) return false;
    return true;
  }), [search, customer, type, owner, department, status, revision]);

  const totalOfRows = rows.reduce((sum, estimate) => sum + estimateTotals(estimate).total, 0);
  const paged = usePaged(rows, pageSize, page);

  return (
    <>
      <PageHeader
        eyebrow={t("ENGINEERING COST")}
        title={t("Estimate Cost")}
        subtitle={t("Every estimate, its revision, its owner and its cost — one source of truth instead of many Excel files.")}
        actions={
          <>
            <button className="btn default" type="button" onClick={() => notify("Excel import wizard opens inside the estimate workspace")}>
              <Icon name="upload" />Import Excel
            </button>
            <button className="btn primary" type="button" onClick={() => go({ name: "inquiries" })}>
              <Icon name="plus" />New estimate from inquiry
            </button>
          </>
        }
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search estimate no., inquiry no., project or customer…" />
        <Select label="Customer" value={customer} onChange={setCustomer} options={["All customers", ...CUSTOMERS.map((c) => c.code)]} />
        <Select label="Project type" value={type} onChange={setType} options={["All project types", ...PROJECT_TYPES]} />
        <Select label="Estimate owner" value={owner} onChange={setOwner} options={["All owners", ...USERS.filter((u) => u.role === "Engineer").map((u) => u.name)]} />
        <Select label="Department" value={department} onChange={setDepartment} options={["All departments", ...DEPARTMENTS]} />
        <Select label="Status" value={status} onChange={setStatus} options={["All status", "Draft", "Engineering Input", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Revision Required", "Approved", "Locked"]} />
        <Select label="Revision" value={revision} onChange={setRevision} options={["All revisions", "R00", "R01", "R02", "R03"]} />
      </Toolbar>

      <StatusLegend items={[
        { label: "Draft", kind: "wait" },
        { label: "Engineering input", kind: "new" },
        { label: "Waiting price", kind: "revised" },
        { label: "Engineering review", kind: "approved" },
        { label: "Approved", kind: "confirmed" },
        { label: "Overdue", kind: "canceled" },
      ]} />

      <Panel
        title={`${rows.length} estimates`}
        subtitle={`Combined estimated cost ${moneyShort(totalOfRows)} THB — internal engineering cost only`}
        actions={<button className="btn default sm" type="button" onClick={() => notify("Estimate list exported to Excel")}><Icon name="download" />Export</button>}
        flush
      >
        <GridControls pageSize={pageSize} onPageSize={(size) => { setPageSize(size); setPage(1); }} search={search} onSearch={(value) => { setSearch(value); setPage(1); }} />
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Estimate No.")}</th>
                  <th>{t("Inquiry No.")}</th>
                  <th>{t("Customer")}</th>
                  <th>{t("Project")}</th>
                  <th>{t("Estimate Owner")}</th>
                  <th>{t("Rev.")}</th>
                  <th>{t("Created")}</th>
                  <th>{t("Due Date")}</th>
                  <th className="num">{t("Material")}</th>
                  <th className="num">{t("Engineering")}</th>
                  <th className="num">{t("Outsource")}</th>
                  <th className="num">{t("Other")}</th>
                  <th className="num">{t("Total Cost")}</th>
                  <th>{t("Progress")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Last Updated")}</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {paged.pageRows.map((estimate) => {
                  const totals = estimateTotals(estimate);
                  const customerRecord = CUSTOMERS.find((c) => c.id === estimate.customerId);
                  const late = new Date(estimate.dueDate) < TODAY && estimate.status !== "Approved" && estimate.status !== "Locked";
                  return (
                    <tr
                      key={estimate.id}
                      className={`clickable ${late ? "row-late" : estimate.status === "Approved" || estimate.status === "Locked" ? "row-ok" : estimate.status === "Waiting Supplier Price" ? "row-wait" : ""}`}
                      onClick={() => go({ name: "estimate", id: estimate.id })}
                    >
                      <td><strong className="mono">{estimate.no}</strong></td>
                      <td className="mono">{estimate.inquiryNo}</td>
                      <td>{customerRecord?.code}</td>
                      <td>
                        <div className="cell-primary">
                          <strong>{estimate.projectName}</strong>
                          <span>{estimate.projectType}</span>
                        </div>
                      </td>
                      <td><Person initials={userOf(estimate.ownerId)?.initials ?? "—"} name={userName(estimate.ownerId)} /></td>
                      <td><span className="pill">{estimate.revision}</span></td>
                      <td>{formatDate(estimate.createdDate)}</td>
                      <td className={late ? "red-text" : undefined}>
                        {formatDate(estimate.dueDate)}
                        {late ? <span className="badge red" style={{ marginLeft: 6 }}>Overdue</span> : null}
                      </td>
                      <td className="num">{moneyShort(totals.material)}</td>
                      <td className="num">{moneyShort(totals.engineering)}</td>
                      <td className="num">{moneyShort(totals.outsource)}</td>
                      <td className="num">{moneyShort(totals.other + totals.transportation + totals.accommodation + totals.contingency)}</td>
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
            <Pagination page={paged.current} pageCount={paged.pageCount} from={paged.from} to={paged.to} total={paged.total} onPage={setPage} />
          </div>
        ) : (
          <EmptyState icon="file" title="No estimate matches the filter" message="Clear a filter, or create an estimate from a registered inquiry." />
        )}
      </Panel>
    </>
  );
}
