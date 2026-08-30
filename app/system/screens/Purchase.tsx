"use client";

import { useState } from "react";
import {
  CUSTOMERS, ESTIMATES, PR_STATUSES, PURCHASE_REQUISITIONS, SUPPLIERS, UNITS, USERS,
  type CostItem, type PrLine, type PurchaseRequisition,
} from "../data";
import {
  formatDate, groupByModule, lineTotal, moneyShort, prLineEstimate, prLineTotal,
  prLineVariance, prTotals, TODAY, userName, userOf,
} from "../calc";
import {
  Badge, EmptyState, Field, GridControls, Icon, Modal, Pagination, Panel, PageHeader, Person, Pill,
  SearchInput, Select, Toolbar, toneOf, usePaged,
} from "../ui";
import type { ScreenProps } from "../routes";

const STATUS_TONE: Record<string, "slate" | "blue" | "green" | "amber" | "red"> = {
  Draft: "slate", Submitted: "blue", Approved: "green", Ordered: "green", Rejected: "red",
};

const varianceTone = (value: number) => (value > 0 ? "red-text" : value < 0 ? "green-text" : "muted");
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${moneyShort(Math.abs(value))}`;

/* ==========================================================================
   Purchase requisition list
   ========================================================================== */

export function PurchaseList({ go, notify }: ScreenProps) {
  const [requisitions, setRequisitions] = useState(PURCHASE_REQUISITIONS);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [createOpen, setCreateOpen] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const rows = requisitions.filter((pr) => {
    const haystack = `${pr.no} ${pr.projectName} ${pr.projectNo} ${pr.estimateNo} ${pr.customer}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (status !== "All status" && pr.status !== status) return false;
    return true;
  });

  const paged = usePaged(rows, pageSize, page);
  const open = requisitions.filter((pr) => pr.status === "Draft" || pr.status === "Submitted").length;
  const totalValue = requisitions.reduce((sum, pr) => sum + prTotals(pr).total, 0);
  const variance = requisitions.reduce((sum, pr) => sum + prTotals(pr).variance, 0);
  const unlinked = requisitions.reduce((sum, pr) => sum + prTotals(pr).unlinked, 0);

  return (
    <>
      <PageHeader
        eyebrow="PROCUREMENT"
        title="Purchase Requisition"
        subtitle="Raised once an inquiry becomes a project. Every line points back at the estimate item it came from, so a rounded estimate can be compared with what is actually bought."
        actions={
          <>
            <button className="btn default" type="button" onClick={() => go({ name: "projects" })}><Icon name="folder" />Projects</button>
            <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}><Icon name="plus" />New PR from estimate</button>
          </>
        }
      />

      <section className="kpi-grid">
        <div className="kpi blue"><span className="kpi-icon"><Icon name="file" /></span><span className="kpi-body"><span className="kpi-label">Requisitions</span><strong className="kpi-value">{requisitions.length}</strong><span className="kpi-note">{open} still open</span></span></div>
        <div className="kpi slate"><span className="kpi-icon"><Icon name="package" /></span><span className="kpi-body"><span className="kpi-label">Requested value</span><strong className="kpi-value">{moneyShort(totalValue)}</strong><span className="kpi-note">THB across all PRs</span></span></div>
        <div className={variance > 0 ? "kpi red" : "kpi green"}><span className="kpi-icon"><Icon name="trendingUp" /></span><span className="kpi-body"><span className="kpi-label">Versus estimate</span><strong className="kpi-value">{signed(variance)}</strong><span className="kpi-note">THB against the estimated lines</span></span></div>
        <div className="kpi amber"><span className="kpi-icon"><Icon name="alertTriangle" /></span><span className="kpi-body"><span className="kpi-label">Lines with no estimate link</span><strong className="kpi-value">{unlinked}</strong><span className="kpi-note">Were inside a rounded figure</span></span></div>
      </section>

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search PR no., project, estimate or customer…" />
        <Select label="Status" value={status} onChange={setStatus} options={["All status", ...PR_STATUSES]} />
      </Toolbar>

      <Panel title={`${rows.length} purchase requisitions`} subtitle="Variance is the PR value against the estimated value of the same items" flush>
        <GridControls pageSize={pageSize} onPageSize={(size) => { setPageSize(size); setPage(1); }} search={search} onSearch={(value) => { setSearch(value); setPage(1); }} />
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PR No.</th><th>Project</th><th>Estimate</th><th>Customer</th>
                  <th>Requester</th><th>Created</th><th>Required</th>
                  <th className="num">Lines</th><th className="num">Estimated</th><th className="num">PR value</th>
                  <th className="num">Variance</th><th>Status</th><th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {paged.pageRows.map((pr) => {
                  const totals = prTotals(pr);
                  const late = new Date(pr.requiredDate) < TODAY && pr.status !== "Ordered";
                  return (
                    <tr key={pr.id} className="clickable" onClick={() => go({ name: "pr", id: pr.id })}>
                      <td><strong className="mono">{pr.no}</strong></td>
                      <td>
                        <div className="cell-primary">
                          <strong>{pr.projectName}</strong>
                          <span className="mono">{pr.projectNo}</span>
                        </div>
                      </td>
                      <td><span className="mono">{pr.estimateNo}</span> <span className="pill">{pr.revision}</span></td>
                      <td>{pr.customer}</td>
                      <td><Person initials={userOf(pr.requesterId)?.initials ?? "—"} name={userName(pr.requesterId)} /></td>
                      <td>{formatDate(pr.createdDate)}</td>
                      <td className={late ? "red-text" : undefined}>{formatDate(pr.requiredDate)}</td>
                      <td className="num">{pr.lines.length}</td>
                      <td className="num muted">{moneyShort(totals.estimated)}</td>
                      <td className="num"><strong>{moneyShort(totals.total)}</strong></td>
                      <td className={`num ${varianceTone(totals.variance)}`}>
                        {signed(totals.variance)}
                        {totals.estimated ? <span className="muted"> ({totals.variancePercent > 0 ? "+" : ""}{totals.variancePercent.toFixed(1)}%)</span> : null}
                      </td>
                      <td><Badge tone={STATUS_TONE[pr.status]}>{pr.status}</Badge></td>
                      <td><span className="row-action"><Icon name="chevronRight" /></span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={paged.current} pageCount={paged.pageCount} from={paged.from} to={paged.to} total={paged.total} onPage={setPage} />
          </div>
        ) : (
          <EmptyState icon="file" title="No purchase requisition" message="Create a PR from an approved estimate to start buying the equipment it priced." />
        )}
      </Panel>

      {createOpen ? (
        <CreatePrModal
          onClose={() => setCreateOpen(false)}
          onCreate={(pr) => {
            setRequisitions((prev) => [pr, ...prev]);
            setCreateOpen(false);
            notify(`${pr.no} created as a draft with ${pr.lines.length} line(s) from ${pr.estimateNo}`);
          }}
        />
      ) : null}
    </>
  );
}

/* ==========================================================================
   Purchase requisition detail
   ========================================================================== */

export function PurchaseDetail({ id, go, notify }: ScreenProps & { id: string }) {
  const source = PURCHASE_REQUISITIONS.find((pr) => pr.id === id) ?? PURCHASE_REQUISITIONS[0];
  const [pr, setPr] = useState<PurchaseRequisition>(source);
  const totals = prTotals(pr);
  const estimate = ESTIMATES.find((entry) => entry.id === pr.estimateId);
  const locked = pr.status === "Approved" || pr.status === "Ordered";

  const patchLine = (lineId: string, patch: Partial<PrLine>) =>
    setPr((prev) => ({ ...prev, lines: prev.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)) }));

  return (
    <>
      <button className="back-link" type="button" onClick={() => go({ name: "purchase" })}><Icon name="arrowLeft" />Purchase Requisition</button>
      <PageHeader
        eyebrow={`${pr.no} · ${pr.projectNo}`}
        title={pr.projectName}
        subtitle={`${pr.customer} · from estimate ${pr.estimateNo} ${pr.revision}`}
        meta={
          <>
            <div><span>Requester</span><strong>{userName(pr.requesterId)}</strong></div>
            <div><span>Required date</span><strong>{formatDate(pr.requiredDate)}</strong></div>
            <div><span>Status</span><strong><Badge tone={STATUS_TONE[pr.status]}>{pr.status}</Badge></strong></div>
            <div><span>PR value</span><strong>{moneyShort(totals.total)} THB</strong></div>
            <div><span>Versus estimate</span><strong className={varianceTone(totals.variance)}>{signed(totals.variance)} THB</strong></div>
          </>
        }
        actions={
          <>
            {estimate ? (
              <button className="btn default" type="button" onClick={() => go({ name: "estimate", id: estimate.id })}>
                <Icon name="file" />Open estimate
              </button>
            ) : null}
            {pr.status === "Draft" ? (
              <button className="btn primary" type="button" onClick={() => { setPr({ ...pr, status: "Submitted" }); notify(`${pr.no} submitted for approval`); }}>
                <Icon name="send" />Submit
              </button>
            ) : null}
            {pr.status === "Submitted" ? (
              <>
                <button className="btn danger" type="button" onClick={() => { setPr({ ...pr, status: "Rejected" }); notify(`${pr.no} rejected`); }}>
                  <Icon name="x" />Reject
                </button>
                <button className="btn success" type="button" onClick={() => { setPr({ ...pr, status: "Approved" }); notify(`${pr.no} approved`); }}>
                  <Icon name="checkCircle" />Approve
                </button>
              </>
            ) : null}
            {pr.status === "Approved" ? (
              <button className="btn primary" type="button" onClick={() => { setPr({ ...pr, status: "Ordered" }); notify(`${pr.no} marked as ordered`); }}>
                <Icon name="truck" />Mark ordered
              </button>
            ) : null}
          </>
        }
      />

      {totals.variance > 0 ? (
        <div className="info-strip amber">
          <Icon name="alertTriangle" />
          <span>
            This requisition is <strong>{signed(totals.variance)} THB ({totals.variancePercent.toFixed(1)}%)</strong> above the estimated value of the same items
            {totals.unlinked ? `, and ${totals.unlinked} line(s) were never estimated separately` : ""}.
          </span>
        </div>
      ) : null}

      <section className="summary-strip">
        <SummaryCell label="Estimated value" value={`${moneyShort(totals.estimated)} THB`} note="Same items in the estimate" />
        <SummaryCell label="PR value" value={`${moneyShort(totals.total)} THB`} note={`${pr.lines.length} line(s)`} />
        <SummaryCell label="Variance" value={`${signed(totals.variance)} THB`} note={totals.estimated ? `${totals.variancePercent.toFixed(1)}% versus estimate` : "No estimate reference"} />
        <SummaryCell label="Lines without estimate link" value={String(totals.unlinked)} note="Hidden inside a rounded figure" />
      </section>

      <Panel
        title="Requisition lines"
        subtitle="Each line keeps the estimate item it came from, with the estimated quantity and unit cost frozen next to what is being bought"
        actions={<button className="btn default sm" type="button" onClick={() => notify("PR exported to Excel")}><Icon name="download" />Export</button>}
        flush
      >
        <div className="table-wrap">
          <table className="sheet" style={{ minWidth: 1860 }}>
            <thead>
              <tr>
                <th style={{ width: 44 }}>No.</th>
                <th style={{ width: 150 }}>Estimate item</th>
                <th style={{ width: 250 }}>Description</th>
                <th style={{ width: 110 }}>Brand</th>
                <th style={{ width: 140 }}>Model</th>
                <th style={{ width: 190 }}>Supplier</th>
                <th className="num" style={{ width: 90 }}>Est. Qty</th>
                <th className="num" style={{ width: 110 }}>Est. Unit</th>
                <th className="num" style={{ width: 120 }}>Est. Total</th>
                <th className="num" style={{ width: 80 }}>PR Qty</th>
                <th style={{ width: 90 }}>Unit</th>
                <th className="num" style={{ width: 120 }}>PR Unit Cost</th>
                <th className="num" style={{ width: 120 }}>PR Total</th>
                <th className="num" style={{ width: 120 }}>Variance</th>
                <th style={{ width: 190 }}>Remark</th>
              </tr>
            </thead>
            <tbody>
              {pr.lines.map((line, index) => (
                <tr key={line.id}>
                  <td><span className="cell-text muted">{index + 1}</span></td>
                  <td>
                    <span className="cell-text">
                      {line.estimateItemId
                        ? <span className="mono">{line.itemCode}</span>
                        : <Badge tone="amber">Not estimated</Badge>}
                    </span>
                  </td>
                  <td><input value={line.description} disabled={locked} onChange={(event) => patchLine(line.id, { description: event.target.value })} /></td>
                  <td><input value={line.brand} disabled={locked} onChange={(event) => patchLine(line.id, { brand: event.target.value })} /></td>
                  <td><input value={line.model} disabled={locked} onChange={(event) => patchLine(line.id, { model: event.target.value })} /></td>
                  <td>
                    <select value={line.supplier} disabled={locked} onChange={(event) => patchLine(line.id, { supplier: event.target.value })}>
                      <option value="">— select supplier —</option>
                      {SUPPLIERS.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </td>
                  <td><span className="cell-text num muted">{line.estimateQty || "—"}</span></td>
                  <td><span className="cell-text num muted">{line.estimateUnitCost ? moneyShort(line.estimateUnitCost) : "—"}</span></td>
                  <td><span className="cell-text num muted">{prLineEstimate(line) ? moneyShort(prLineEstimate(line)) : "—"}</span></td>
                  <td><input className="num" type="number" min="0" value={line.qty} disabled={locked} onChange={(event) => patchLine(line.id, { qty: Number(event.target.value) })} /></td>
                  <td>
                    <select value={line.unit} disabled={locked} onChange={(event) => patchLine(line.id, { unit: event.target.value })}>
                      {UNITS.map((unit) => <option key={unit}>{unit}</option>)}
                    </select>
                  </td>
                  <td><input className="num" type="number" min="0" step="100" value={line.unitCost} disabled={locked} onChange={(event) => patchLine(line.id, { unitCost: Number(event.target.value) })} /></td>
                  <td className="computed">{moneyShort(prLineTotal(line))}</td>
                  <td className={`computed ${varianceTone(prLineVariance(line))}`}>{prLineEstimate(line) ? signed(prLineVariance(line)) : "—"}</td>
                  <td><input value={line.remark} disabled={locked} onChange={(event) => patchLine(line.id, { remark: event.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sticky-foot">
          <div className="foot-item"><span>Estimated value</span><strong>{moneyShort(totals.estimated)}</strong></div>
          <div className="foot-item"><span>Lines</span><strong>{pr.lines.length}</strong></div>
          <div className="foot-item"><span>Not estimated</span><strong>{totals.unlinked}</strong></div>
          <div className="foot-total">
            <span>Variance</span>
            <strong>{signed(totals.variance)} THB</strong>
          </div>
          <div className="foot-total">
            <span>PR value</span>
            <strong>{moneyShort(totals.total)} THB</strong>
          </div>
        </div>
      </Panel>

      <section className="grid-2">
        <Panel title="Requisition information">
          <dl className="def-list">
            <div><dt>PR number</dt><dd className="mono">{pr.no}</dd></div>
            <div><dt>Project</dt><dd>{pr.projectNo} — {pr.projectName}</dd></div>
            <div><dt>Estimate reference</dt><dd className="mono">{pr.estimateNo} {pr.revision}</dd></div>
            <div><dt>Customer</dt><dd>{pr.customer}</dd></div>
            <div><dt>Requester</dt><dd>{userName(pr.requesterId)}</dd></div>
            <div><dt>Approver</dt><dd>{userName(pr.approverId)}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(pr.createdDate)}</dd></div>
            <div><dt>Required on site</dt><dd>{formatDate(pr.requiredDate)}</dd></div>
            <div style={{ gridColumn: "span 2" }}><dt>Purpose</dt><dd>{pr.purpose}</dd></div>
          </dl>
        </Panel>
        <Panel title="Why the PR differs from the estimate" subtitle="What the buyer and the engineering manager need to see">
          <ul className="check-list">
            {pr.lines.filter((line) => prLineVariance(line) !== 0 || !line.estimateItemId).map((line) => (
              <li className={`check-item ${!line.estimateItemId ? "warning" : prLineVariance(line) > 0 ? "error" : "pass"}`} key={line.id}>
                <Icon name={!line.estimateItemId ? "alertTriangle" : prLineVariance(line) > 0 ? "alertCircle" : "checkCircle"} />
                <div>
                  <strong>{line.description}</strong>
                  <p>
                    {line.estimateItemId
                      ? `Estimate ${line.estimateQty} × ${moneyShort(line.estimateUnitCost)} → PR ${line.qty} × ${moneyShort(line.unitCost)} (${signed(prLineVariance(line))} THB)`
                      : `Not in the estimate — ${moneyShort(prLineTotal(line))} THB`}
                    {line.remark ? ` · ${line.remark}` : ""}
                  </p>
                </div>
              </li>
            ))}
            {pr.lines.every((line) => prLineVariance(line) === 0 && line.estimateItemId) ? (
              <li className="check-item pass"><Icon name="checkCircle" /><div><strong>Every line matches the estimate</strong><p>Nothing to explain to the approver.</p></div></li>
            ) : null}
          </ul>
        </Panel>
      </section>
    </>
  );
}

function SummaryCell({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{note}</em>
    </div>
  );
}

/* ==========================================================================
   Create a PR from an estimate
   ========================================================================== */

function CreatePrModal({ onClose, onCreate, presetEstimateId }: {
  onClose: () => void;
  onCreate: (pr: PurchaseRequisition) => void;
  presetEstimateId?: string;
}) {
  const [estimateId, setEstimateId] = useState(presetEstimateId ?? ESTIMATES[0].id);
  const [requiredDate, setRequiredDate] = useState("2026-10-15");
  const [purpose, setPurpose] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const estimate = ESTIMATES.find((entry) => entry.id === estimateId) ?? ESTIMATES[0];
  const groups = groupByModule(estimate.items);
  const chosen = estimate.items.filter((item) => selected.includes(item.id));
  const chosenValue = chosen.reduce((sum, item) => sum + lineTotal(item), 0);

  const toggle = (item: CostItem) =>
    setSelected((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]));

  function create() {
    const pr: PurchaseRequisition = {
      id: `pr-new-${chosen.length}-${estimate.id}`,
      no: "PR-2609-0004",
      projectNo: `PRJ-${estimate.no.slice(4)}`,
      projectName: estimate.projectName,
      estimateId: estimate.id,
      estimateNo: estimate.no,
      revision: estimate.revision,
      customer: CUSTOMERS.find((entry) => entry.id === estimate.customerId)?.code ?? "",
      requesterId: estimate.ownerId,
      approverId: "u6",
      createdDate: "2026-08-30",
      requiredDate,
      status: "Draft",
      purpose: purpose || "Material for the awarded project.",
      lines: chosen.map((item, index) => ({
        id: `nl-${index}`,
        estimateItemId: item.id,
        itemCode: item.itemCode,
        description: item.description,
        brand: item.brand,
        model: item.model,
        specification: item.specification,
        supplier: item.supplier,
        qty: item.qty,
        unit: item.unit,
        unitCost: item.unitCost,
        estimateQty: item.qty,
        estimateUnitCost: item.unitCost,
        remark: "",
      })),
    };
    onCreate(pr);
  }

  return (
    <Modal
      title="New purchase requisition"
      subtitle="Pick the estimate lines to buy — quantity, supplier and price stay editable, and the link back to the estimate item is kept"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <span className="muted">{chosen.length} line(s) selected · {moneyShort(chosenValue)} THB estimated</span>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" disabled={!chosen.length} onClick={create}>
            <Icon name="check" />Create requisition
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Estimate" span={2}>
          <select value={estimateId} onChange={(event) => { setEstimateId(event.target.value); setSelected([]); }}>
            {ESTIMATES.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.no} {entry.revision} — {entry.projectName} ({entry.status})</option>
            ))}
          </select>
        </Field>
        <Field label="Required on site"><input type="date" value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} /></Field>
        <Field label="Requester">
          <select defaultValue={estimate.ownerId}>
            {USERS.filter((user) => user.role === "Engineer" || user.role === "Project Manager").map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Purpose" span={4}>
          <input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="e.g. Long lead hardware for the cobot cell" />
        </Field>
      </div>

      {estimate.status !== "Approved" && estimate.status !== "Locked" ? (
        <div className="info-strip amber" style={{ marginTop: 12 }}>
          <Icon name="alertTriangle" />
          {estimate.no} is still <strong>{estimate.status}</strong>. A requisition is normally raised once the estimate is approved and the inquiry has become a project.
        </div>
      ) : null}

      <div className="form-section">
        <div className="form-section-title">
          <h3>Estimate items</h3>
          <span />
          <button className="link-btn" type="button" onClick={() => setSelected(estimate.items.map((item) => item.id))}>Select all</button>
          <button className="link-btn" type="button" onClick={() => setSelected([])}>Clear</button>
        </div>
        <div className="table-wrap tall">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }} aria-label="Select" />
                <th>Item</th><th>Module</th><th>Supplier</th>
                <th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Estimated total</th><th>Price source</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => [
                <tr className="subtotal-row" key={`g-${group.module}`}>
                  <td colSpan={8}>{group.module || "Unassigned items"} · {group.items.length} item(s)</td>
                </tr>,
                ...group.items.map((item) => (
                  <tr key={item.id} className={selected.includes(item.id) ? "selected clickable" : "clickable"} onClick={() => toggle(item)}>
                    <td>
                      <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item)} aria-label={`Select ${item.description}`} />
                    </td>
                    <td>
                      <div className="cell-primary">
                        <strong>{item.description}</strong>
                        <span>{item.brand} {item.model} · {item.itemCode}</span>
                      </div>
                    </td>
                    <td><Pill>{item.module || "—"}</Pill></td>
                    <td>{item.supplier}</td>
                    <td className="num">{item.qty} {item.unit}</td>
                    <td className="num">{moneyShort(item.unitCost)}</td>
                    <td className="num"><strong>{moneyShort(lineTotal(item))}</strong></td>
                    <td><Badge tone={toneOf(item.status)}>{item.source || "Not set"}</Badge></td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
