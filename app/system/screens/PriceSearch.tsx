"use client";

import { useMemo, useState } from "react";
import { PRICE_LIBRARY, type PriceRecord } from "../data";
import { formatDate, money, priceAge } from "../calc";
import { Badge, EmptyState, Icon, Modal, SearchInput, Sparkline } from "../ui";

/**
 * Price Search popup — the replacement for hunting through old Excel files.
 * Opened from the estimate workspace, from the Add Cost Item drawer and from
 * the global search.
 */
export function PriceSearchModal({ initialQuery = "", onClose, onUse, onHistory }: {
  initialQuery?: string;
  onClose: () => void;
  onUse: (record: PriceRecord) => void;
  onHistory: (record: PriceRecord) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<string | null>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return PRICE_LIBRARY;
    return PRICE_LIBRARY.filter((record) =>
      `${record.itemCode} ${record.description} ${record.brand} ${record.model} ${record.supplier} ${record.project} ${record.category}`
        .toLowerCase().includes(needle));
  }, [query]);

  const active = results.find((record) => record.id === selected) ?? results[0];

  return (
    <Modal
      title="Search Price Library"
      subtitle="Item, brand, model, supplier, previous project or price — no Excel file needed"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <span className="muted">{results.length} matching item(s) · prices older than 180 days are flagged in red</span>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" disabled={!active} onClick={() => active && onUse(active)}>
            <Icon name="check" />Use price
          </button>
        </>
      }
    >
      <SearchInput value={query} onChange={setQuery} placeholder="e.g. KV-8000, KEYENCE, control panel, FTS Traceability…" />

      <div style={{ marginTop: 12 }} className="table-wrap tall">
        {results.length ? (
          <table>
            <thead>
              <tr>
                <th aria-label="Selected" style={{ width: 30 }} />
                <th>Item Code</th>
                <th>Description</th>
                <th>Brand</th>
                <th>Model</th>
                <th>Supplier</th>
                <th className="num">Price</th>
                <th>Price Date</th>
                <th>Age</th>
                <th>Source / Reference</th>
                <th>Previous Project</th>
                <th>Trend</th>
                <th>Last Used</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {results.map((record) => {
                const age = priceAge(record.priceDate);
                const isActive = active?.id === record.id;
                return (
                  <tr key={record.id} className={isActive ? "selected clickable" : "clickable"} onClick={() => setSelected(record.id)}>
                    <td>{isActive ? <Icon name="check" /> : null}</td>
                    <td className="mono">{record.itemCode}</td>
                    <td><strong>{record.description}</strong></td>
                    <td>{record.brand}</td>
                    <td className="mono">{record.model}</td>
                    <td>{record.supplier}</td>
                    <td className="num"><strong>{money(record.price)}</strong></td>
                    <td>{formatDate(record.priceDate)}</td>
                    <td><span className={`age ${age.tone}`}><i />{age.days} days</span></td>
                    <td>
                      <div className="cell-primary">
                        <strong>{record.source}</strong>
                        <span className="mono">{record.reference}</span>
                      </div>
                    </td>
                    <td>{record.project}</td>
                    <td><Sparkline values={record.history.map((h) => h.price)} /></td>
                    <td className="muted">{formatDate(record.lastUsed)}</td>
                    <td>
                      <div className="row tight">
                        <button className="btn sm default" type="button" onClick={(e) => { e.stopPropagation(); onUse(record); }}>Use Price</button>
                        <button className="btn sm ghost" type="button" onClick={(e) => { e.stopPropagation(); onHistory(record); }}>History</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState icon="search" title="Nothing found in the price library" message="Try the brand or model only, or request a new supplier price instead." />
        )}
      </div>

      {active ? (
        <div className="info-strip" style={{ marginTop: 12 }}>
          <Icon name="alertCircle" />
          <span>
            <strong>{active.model || active.itemCode}</strong> — {money(active.price)} from {active.supplier}, priced {formatDate(active.priceDate)} on {active.reference}.
            {priceAge(active.priceDate).days > 180 ? " This price is older than 180 days — confirm with the supplier before approval." : ""}
          </span>
          <span className="spacer" />
          <Badge tone={priceAge(active.priceDate).tone === "green" ? "green" : priceAge(active.priceDate).tone === "amber" ? "amber" : "red"}>
            {priceAge(active.priceDate).days} days old
          </Badge>
        </div>
      ) : null}
    </Modal>
  );
}
