"use client";

import { useMemo, useState } from "react";
import { BRANDS, MISSING_PRICES, PRICE_LIBRARY, QUOTATIONS, SUPPLIERS } from "../data";
import { daysBetween, formatDate, money, moneyShort, priceAge, userName } from "../calc";
import {
  Badge, EmptyState, Field, GridControls, Icon, LineChart, Modal, Pagination, Panel, PageHeader, Person,
  Pill, SearchInput, Select, Sparkline, Toolbar, toneOf, usePaged,
} from "../ui";
import type { ScreenProps } from "../routes";

/* ==========================================================================
   Price Library
   ========================================================================== */

export function PriceLibrary({ go, notify }: ScreenProps) {
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("All brands");
  const [supplier, setSupplier] = useState("All suppliers");
  const [age, setAge] = useState("All ages");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => PRICE_LIBRARY.filter((record) => {
    const haystack = `${record.itemCode} ${record.description} ${record.brand} ${record.model} ${record.supplier} ${record.project} ${record.category}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (brand !== "All brands" && record.brand !== brand) return false;
    if (supplier !== "All suppliers" && record.supplier !== supplier) return false;
    if (age !== "All ages") {
      const days = priceAge(record.priceDate).days;
      if (age === "0–90 days" && days > 90) return false;
      if (age === "91–180 days" && (days <= 90 || days > 180)) return false;
      if (age === "Older than 180 days" && days <= 180) return false;
    }
    return true;
  }), [search, brand, supplier, age]);

  const paged = usePaged(rows, pageSize, page);
  const fresh = PRICE_LIBRARY.filter((r) => priceAge(r.priceDate).days <= 90).length;
  const aging = PRICE_LIBRARY.filter((r) => { const d = priceAge(r.priceDate).days; return d > 90 && d <= 180; }).length;
  const stale = PRICE_LIBRARY.filter((r) => priceAge(r.priceDate).days > 180).length;

  return (
    <>
      <PageHeader
        eyebrow="REFERENCE DATA"
        title="Price Library"
        subtitle="Every price used on an estimate is stored here with its source, so engineers never search old Excel files again."
        actions={
          <>
            <button className="btn default" type="button" onClick={() => go({ name: "quotations" })}><Icon name="quote" />Supplier quotations</button>
            <button className="btn primary" type="button" onClick={() => notify("New price record form opened")}><Icon name="plus" />Add price record</button>
          </>
        }
      />

      <section className="kpi-grid">
        <div className="kpi blue"><span className="kpi-icon"><Icon name="book" /></span><span className="kpi-body"><span className="kpi-label">Price records</span><strong className="kpi-value">{PRICE_LIBRARY.length}</strong><span className="kpi-note">Across every project</span></span></div>
        <div className="kpi green"><span className="kpi-icon"><Icon name="checkCircle" /></span><span className="kpi-body"><span className="kpi-label">Current (0–90 days)</span><strong className="kpi-value">{fresh}</strong><span className="kpi-note">Safe to reuse</span></span></div>
        <div className="kpi amber"><span className="kpi-icon"><Icon name="clock" /></span><span className="kpi-body"><span className="kpi-label">Aging (91–180 days)</span><strong className="kpi-value">{aging}</strong><span className="kpi-note">Confirm before approval</span></span></div>
        <div className="kpi red"><span className="kpi-icon"><Icon name="alertTriangle" /></span><span className="kpi-body"><span className="kpi-label">Older than 180 days</span><strong className="kpi-value">{stale}</strong><span className="kpi-note">Request a new price</span></span></div>
      </section>

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search item, brand, model, supplier, previous project or price…" />
        <Select label="Brand" value={brand} onChange={setBrand} options={["All brands", ...BRANDS]} />
        <Select label="Supplier" value={supplier} onChange={setSupplier} options={["All suppliers", ...SUPPLIERS.map((s) => s.name)]} />
        <Select label="Price age" value={age} onChange={setAge} options={["All ages", "0–90 days", "91–180 days", "Older than 180 days"]} />
      </Toolbar>

      <Panel title={`${rows.length} price records`} subtitle="Green 0–90 days · orange 91–180 days · red older than 180 days" flush>
        <GridControls pageSize={pageSize} onPageSize={(size) => { setPageSize(size); setPage(1); }} search={search} onSearch={(value) => { setSearch(value); setPage(1); }} />
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th><th>Description</th><th>Brand</th><th>Model</th><th>Category</th>
                  <th>Supplier</th><th className="num">Price (THB)</th><th>Price Date</th><th>Price Age</th>
                  <th>Source</th><th>Reference</th><th>Previous Project</th><th>Trend</th><th>Last Used</th><th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {paged.pageRows.map((record) => {
                  const recordAge = priceAge(record.priceDate);
                  return (
                    <tr key={record.id}>
                      <td className="mono">{record.itemCode}</td>
                      <td><strong>{record.description}</strong></td>
                      <td>{record.brand}</td>
                      <td className="mono">{record.model}</td>
                      <td className="muted">{record.category}</td>
                      <td>{record.supplier}</td>
                      <td className="num"><strong>{moneyShort(record.price)}</strong></td>
                      <td>{formatDate(record.priceDate)}</td>
                      <td><span className={`age ${recordAge.tone}`}><i />{recordAge.days} days</span></td>
                      <td><Badge tone="slate">{record.source}</Badge></td>
                      <td className="mono">{record.reference}</td>
                      <td>{record.project}</td>
                      <td><Sparkline values={record.history.map((h) => h.price)} /></td>
                      <td className="muted">{formatDate(record.lastUsed)}</td>
                      <td>
                        <div className="row tight">
                          <button className="btn sm default" type="button" onClick={() => notify(`${record.model || record.itemCode} price copied to clipboard for the open estimate`)}>Use Price</button>
                          <button className="btn sm ghost" type="button" onClick={() => go({ name: "price-history", id: record.id })}>Price History</button>
                          <button className="row-action" type="button" title="View source" onClick={() => go({ name: "quotations" })}><Icon name="eye" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={paged.current} pageCount={paged.pageCount} from={paged.from} to={paged.to} total={paged.total} onPage={setPage} />
          </div>
        ) : (
          <EmptyState icon="search" title="No price record found" message="Try a different brand or model, or request a supplier price instead." />
        )}
      </Panel>

      <Panel title="Price sources in use" subtitle="Every cost should ideally carry a reference">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Price source</th><th>Meaning</th><th className="num">Records</th></tr></thead>
            <tbody>
              {[
                ["Supplier Quotation", "A quotation document is attached and linked to the cost item"],
                ["Previous Estimate", "Price reused from an earlier estimate of another project"],
                ["Previous Project Cost", "Actual cost recorded when the project was executed"],
                ["Purchase Price", "Purchase order price from the procurement system"],
                ["Master Price", "Internal standard price maintained in master data"],
                ["Manual Estimate", "Engineering judgement — no document behind it"],
                ["Budgetary Price", "Indicative supplier price, not a firm quotation"],
              ].map(([source, meaning]) => (
                <tr key={source}>
                  <td><Badge tone={source === "Manual Estimate" ? "amber" : "slate"}>{source}</Badge></td>
                  <td className="muted">{meaning}</td>
                  <td className="num">{PRICE_LIBRARY.filter((r) => r.source === source).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ==========================================================================
   Price history
   ========================================================================== */

export function PriceHistory({ id, go }: ScreenProps & { id: string }) {
  const record = PRICE_LIBRARY.find((r) => r.id === id) ?? PRICE_LIBRARY[0];
  const first = record.history[0];
  const latest = record.history[record.history.length - 1];
  const change = ((latest.price - first.price) / first.price) * 100;

  return (
    <>
      <button className="back-link" type="button" onClick={() => go({ name: "price" })}><Icon name="arrowLeft" />Price Library</button>
      <PageHeader
        eyebrow={record.brand}
        title={`${record.model || record.itemCode}`}
        subtitle={record.description}
        meta={
          <>
            <div><span>Latest price</span><strong>{money(record.price)}</strong></div>
            <div><span>Price date</span><strong>{formatDate(record.priceDate)}</strong></div>
            <div><span>Price age</span><strong><span className={`age ${priceAge(record.priceDate).tone}`}><i />{priceAge(record.priceDate).days} days</span></strong></div>
            <div><span>Change since {formatDate(first.date)}</span><strong className={change >= 0 ? "red-text" : "green-text"}>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</strong></div>
          </>
        }
        actions={<button className="btn primary" type="button"><Icon name="check" />Use latest price</button>}
      />

      <Panel title="Price Trend" subtitle={`${record.history.length} recorded prices · ${record.supplier}`}>
        <LineChart points={record.history.map((point) => ({ label: formatDate(point.date).slice(3), value: point.price }))} format={(value) => moneyShort(value)} />
      </Panel>

      <Panel title="Price history" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Price Date</th><th>Supplier</th><th className="num">Price (THB)</th><th className="num">Change</th><th>Quotation Reference</th><th>Project Used</th><th>Uploaded By</th></tr>
            </thead>
            <tbody>
              {record.history.map((point, index) => {
                const previous = index > 0 ? record.history[index - 1].price : point.price;
                const delta = point.price - previous;
                return (
                  <tr key={point.date}>
                    <td>{formatDate(point.date)}</td>
                    <td>{point.supplier}</td>
                    <td className="num"><strong>{moneyShort(point.price)}</strong></td>
                    <td className={`num ${delta > 0 ? "red-text" : delta < 0 ? "green-text" : "muted"}`}>{delta === 0 ? "—" : `${delta > 0 ? "+" : "−"}${moneyShort(Math.abs(delta))}`}</td>
                    <td className="mono">{point.reference}</td>
                    <td>{point.project}</td>
                    <td><Person initials={point.uploadedBy.split(" ").map((p) => p[0]).join("")} name={point.uploadedBy} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="grid-2">
        <Panel title="Where this item was used">
          <ul className="check-list">
            {record.history.map((point) => (
              <li className="check-item pass" key={`${point.date}-use`}>
                <Icon name="checkCircle" />
                <div>
                  <strong>{point.project || "—"}</strong>
                  <p>{formatDate(point.date)} · {money(point.price)} · {point.reference}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Item information">
          <dl className="def-list">
            <div><dt>Item code</dt><dd className="mono">{record.itemCode}</dd></div>
            <div><dt>Category</dt><dd>{record.category}</dd></div>
            <div><dt>Brand</dt><dd>{record.brand}</dd></div>
            <div><dt>Model</dt><dd className="mono">{record.model}</dd></div>
            <div><dt>Unit</dt><dd>{record.unit}</dd></div>
            <div><dt>Current source</dt><dd>{record.source}</dd></div>
            <div><dt>Reference</dt><dd className="mono">{record.reference}</dd></div>
            <div><dt>Last used</dt><dd>{formatDate(record.lastUsed)}</dd></div>
          </dl>
        </Panel>
      </section>
    </>
  );
}

/* ==========================================================================
   Supplier quotations
   ========================================================================== */

export function Quotations({ go, notify }: ScreenProps) {
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("All suppliers");
  const [status, setStatus] = useState("All status");
  const [upload, setUpload] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const quotationRows = QUOTATIONS.filter((quotation) => {
    const haystack = `${quotation.no} ${quotation.supplier} ${quotation.project} ${quotation.inquiryNo}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (supplier !== "All suppliers" && quotation.supplier !== supplier) return false;
    if (status !== "All status" && quotation.status !== status) return false;
    return true;
  });
  const rows = quotationRows;
  const quotationPage = usePaged(rows, pageSize, page);

  return (
    <>
      <PageHeader
        eyebrow="SUPPLIER"
        title="Supplier Quotations"
        subtitle="Quotation documents are linked to cost items, so any price on an estimate can be traced to its source."
        actions={
          <>
            <button className="btn default" type="button" onClick={() => go({ name: "missing" })}><Icon name="clock" />Waiting supplier price</button>
            <button className="btn primary" type="button" onClick={() => setUpload(true)}><Icon name="upload" />Upload quotation</button>
          </>
        }
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search quotation no., supplier, project or inquiry…" />
        <Select label="Supplier" value={supplier} onChange={setSupplier} options={["All suppliers", ...SUPPLIERS.map((s) => s.name)]} />
        <Select label="Status" value={status} onChange={setStatus} options={["All status", "Valid", "Expiring", "Expired", "Superseded"]} />
      </Toolbar>

      <Panel title={`${rows.length} supplier quotations`} subtitle="PDF, Excel and image files are accepted" flush>
        <GridControls pageSize={pageSize} onPageSize={(size) => { setPageSize(size); setPage(1); }} search={search} onSearch={(value) => { setSearch(value); setPage(1); }} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Supplier Quotation No.</th><th>Supplier</th><th>Received</th><th>Valid Until</th>
                <th>Inquiry</th><th>Project</th><th>Currency</th><th className="num">Amount</th>
                <th>Uploaded By</th><th>Status</th><th>Attachment</th><th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {quotationPage.pageRows.map((quotation) => {
                const daysLeft = -daysBetween(quotation.validUntil);
                return (
                  <tr key={quotation.id}>
                    <td><strong className="mono">{quotation.no}</strong></td>
                    <td>{quotation.supplier}</td>
                    <td>{formatDate(quotation.receivedDate)}</td>
                    <td className={daysLeft < 0 ? "red-text" : daysLeft <= 30 ? "amber-text" : undefined}>
                      {formatDate(quotation.validUntil)}
                      <span className="muted" style={{ marginLeft: 6 }}>{daysLeft < 0 ? `${Math.abs(daysLeft)} d ago` : `${daysLeft} d left`}</span>
                    </td>
                    <td className="mono">{quotation.inquiryNo}</td>
                    <td>{quotation.project}</td>
                    <td>{quotation.currency}</td>
                    <td className="num"><strong>{moneyShort(quotation.amount)}</strong></td>
                    <td><Person initials={quotation.uploadedBy.split(" ").map((p) => p[0]).join("")} name={quotation.uploadedBy} /></td>
                    <td><Badge tone={toneOf(quotation.status)}>{quotation.status}</Badge></td>
                    <td>
                      <span className="row">
                        <Pill tone={quotation.fileType === "PDF" ? "red" : quotation.fileType === "Excel" ? "green" : "blue"}>{quotation.fileType}</Pill>
                        <span className="muted" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{quotation.file}</span>
                      </span>
                    </td>
                    <td>
                      <div className="row tight">
                        <button className="row-action" type="button" title="Preview" onClick={() => notify(`${quotation.file} opened in the document viewer`)}><Icon name="eye" /></button>
                        <button className="row-action" type="button" title="Link to cost item" onClick={() => notify(`${quotation.no} linked to a cost item`)}><Icon name="paperclip" /></button>
                        <button className="row-action" type="button" title="Download"><Icon name="download" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={quotationPage.current} pageCount={quotationPage.pageCount} from={quotationPage.from} to={quotationPage.to} total={quotationPage.total} onPage={setPage} />
        </div>
      </Panel>

      {upload ? (
        <Modal
          title="Upload supplier quotation"
          subtitle="The quotation becomes selectable as a price source on any cost item"
          onClose={() => setUpload(false)}
          footer={
            <>
              <span className="spacer" />
              <button className="btn default" type="button" onClick={() => setUpload(false)}>Cancel</button>
              <button className="btn primary" type="button" onClick={() => { setUpload(false); notify("SQ-2608-0036 uploaded and linked"); }}><Icon name="upload" />Upload</button>
            </>
          }
        >
          <div className="attachment-drop">
            <Icon name="upload" />
            <strong>Drop the quotation file here</strong>
            <span>PDF, Excel or image</span>
          </div>
          <div className="form-grid two" style={{ marginTop: 14 }}>
            <Field label="Supplier Quotation No." hint="Generated as SQ-YYMM-XXXX"><input value="SQ-2608-0036" readOnly /></Field>
            <Field label="Supplier">
              <select>{SUPPLIERS.map((s) => <option key={s.id}>{s.name}</option>)}</select>
            </Field>
            <Field label="Received Date"><input type="date" defaultValue="2026-08-29" /></Field>
            <Field label="Valid Until"><input type="date" defaultValue="2026-10-28" /></Field>
            <Field label="Currency"><select><option>THB</option><option>JPY</option><option>USD</option><option>EUR</option></select></Field>
            <Field label="Amount"><input type="number" placeholder="0" /></Field>
            <Field label="Inquiry" span={2}><select><option>INQ-2608-0001 — Cobot Picking Machine</option><option>INQ-2608-0004 — IoT Energy Monitoring Phase 2</option></select></Field>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/* ==========================================================================
   Waiting supplier price
   ========================================================================== */

export function MissingPrices({ go, notify }: ScreenProps) {
  const [rows, setRows] = useState(MISSING_PRICES);
  const open = rows.filter((row) => row.status !== "Price Updated").length;
  const late = rows.filter((row) => daysBetween(row.requiredDate) > 0 && row.status !== "Price Updated").length;

  return (
    <>
      <PageHeader
        eyebrow="ESTIMATE BLOCKERS"
        title="Waiting Supplier Price"
        subtitle="Every cost item that has no price yet — this is where estimate delays become visible to the manager."
        actions={
          <>
            <button className="btn default" type="button" onClick={() => go({ name: "quotations" })}><Icon name="quote" />Supplier quotations</button>
            <button className="btn primary" type="button" onClick={() => notify("Price request email drafted for 3 suppliers")}><Icon name="send" />Request prices</button>
          </>
        }
      />

      <section className="kpi-grid">
        <div className="kpi amber"><span className="kpi-icon"><Icon name="clock" /></span><span className="kpi-body"><span className="kpi-label">Open items</span><strong className="kpi-value">{open}</strong><span className="kpi-note">Blocking an estimate</span></span></div>
        <div className="kpi red"><span className="kpi-icon"><Icon name="alertTriangle" /></span><span className="kpi-body"><span className="kpi-label">Past required date</span><strong className="kpi-value">{late}</strong><span className="kpi-note">Escalate to the supplier</span></span></div>
        <div className="kpi slate"><span className="kpi-icon"><Icon name="send" /></span><span className="kpi-body"><span className="kpi-label">Not requested yet</span><strong className="kpi-value">{rows.filter((r) => r.status === "Not Requested").length}</strong><span className="kpi-note">Engineer action</span></span></div>
        <div className="kpi green"><span className="kpi-icon"><Icon name="checkCircle" /></span><span className="kpi-body"><span className="kpi-label">Price updated</span><strong className="kpi-value">{rows.filter((r) => r.status === "Price Updated").length}</strong><span className="kpi-note">Estimate unblocked</span></span></div>
      </section>

      <Panel title="Missing price management" subtitle="Update the status as the request moves forward" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Inquiry</th><th>Project</th><th>Item</th><th>Brand</th><th>Model</th><th>Supplier</th>
                <th>Requested By</th><th>Request Date</th><th>Required Date</th><th>Status</th><th>Owner</th><th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const overdue = daysBetween(row.requiredDate) > 0 && row.status !== "Price Updated";
                return (
                  <tr key={row.id}>
                    <td className="mono">{row.inquiryNo}</td>
                    <td>{row.project}</td>
                    <td><strong>{row.item}</strong></td>
                    <td>{row.brand}</td>
                    <td className="mono">{row.model}</td>
                    <td>{row.supplier}</td>
                    <td>{row.requestedBy}</td>
                    <td>{row.requestDate === "—" ? <span className="muted">Not requested</span> : formatDate(row.requestDate)}</td>
                    <td className={overdue ? "red-text" : undefined}>{formatDate(row.requiredDate)}</td>
                    <td>
                      <select
                        value={row.status}
                        onChange={(e) => setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: e.target.value as typeof row.status } : item)))}
                        style={{ height: 26, borderRadius: 6, border: "1px solid var(--line)", padding: "0 6px", fontSize: "var(--fs-2xs)" }}
                      >
                        {["Not Requested", "Requested", "Waiting Supplier", "Received", "Price Updated"].map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </td>
                    <td><Person initials={userName(row.ownerId).split(" ").map((p) => p[0]).join("")} name={userName(row.ownerId)} /></td>
                    <td>
                      <div className="row tight">
                        <button className="btn sm default" type="button" onClick={() => notify(`Price request sent to ${row.supplier}`)}>Request</button>
                        <button className="btn sm ghost" type="button" onClick={() => go({ name: "quotations" })}>Upload</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Status meaning">
        <div className="row">
          {[
            ["Not Requested", "The engineer has not asked the supplier yet"],
            ["Requested", "Request sent, waiting acknowledgement"],
            ["Waiting Supplier", "Supplier is preparing the quotation"],
            ["Received", "Quotation received, not yet in the estimate"],
            ["Price Updated", "Cost item updated — estimate unblocked"],
          ].map(([status, meaning]) => (
            <div key={status} style={{ flex: "1 1 180px" }}>
              <Badge tone={toneOf(status)}>{status}</Badge>
              <p className="muted" style={{ marginTop: 4, fontSize: "var(--fs-xs)" }}>{meaning}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
