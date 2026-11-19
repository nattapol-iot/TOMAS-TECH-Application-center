"use client";
/*
 * The parts of the Estimate Cost screen that V2 lays out the Pegasus way (owner 2026-11-19, lib/estimate-look.ts):
 * the summary bars (DESIGN.md C.2) and the workspace header with one filled action and a More actions menu (C.1.7,
 * 0.4). V1 never renders these. They take what EstimateScreens.tsx already worked out, so both looks show the same
 * numbers and run the same handlers.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "../ui";
import { estimateStatusCell, type EstimateHeaderAction, type EstimateStatusCount } from "../../../lib/estimate-look";
import { useLookCopy } from "./EstimateLook";

export type SummaryCell = { key: string; label: string; value: string; hint?: string; note?: string; color?: string; pressed?: boolean; total?: boolean; onClick?: () => void };

/** A row of figures; each cell with onClick is a button (a filter or a jump to the tab that holds its lines). */
export function PegasusSummaryBar({ cells, label, guide }: { cells: readonly SummaryCell[]; label: string; guide?: string }) {
  // Spans, not dt/dd: a cell that filters is a button, and a button may hold only phrasing content.
  return <div className="pge-summary" role="group" aria-label={label} data-guide={guide}>
    {cells.map((cell) => {
      const body = <>
        <span className="pge-cell-top">
          <span className="pge-cell-label">{cell.color ? <i style={{ background: cell.color }} aria-hidden="true" /> : null}{cell.label}</span>
          {cell.hint ? <span className="pge-cell-hint">{cell.hint}</span> : null}
        </span>
        <span className="pge-cell-value">{cell.value}</span>
        {cell.note ? <span className="pge-cell-note">{cell.note}</span> : null}
      </>;
      const className = `pge-cell${cell.total ? " total" : ""}`;
      return cell.onClick
        ? <button key={cell.key} type="button" className={className} aria-pressed={cell.pressed ?? undefined} onClick={cell.onClick}>{body}</button>
        : <div key={cell.key} className={className}>{body}</div>;
    })}
  </div>;
}

/** The V2 list's status filter: one cell per status with how many estimates and their cost, over the other filters. */
export function EstimateStatusSummary({ tabs, counts, status, onStatus, formatMoney }: {
  tabs: ReadonlyArray<readonly [string, string, string, string]>;
  counts: readonly EstimateStatusCount[] | null;
  status: string;
  onStatus: (status: string) => void;
  formatMoney: (value: number) => string;
}) {
  const copy = useLookCopy();
  return <PegasusSummaryBar label={copy("สถานะ", "Status", "ステータス")} guide="estimate.summary" cells={tabs.map(([value, th, en, ja]) => {
    const cell = counts ? estimateStatusCell(counts, value) : null;
    return {
      key: value, label: copy(th, en, ja), pressed: status === value, onClick: () => onStatus(value),
      value: cell ? cell.count.toLocaleString("en-US") : "—",
      note: cell && cell.count ? formatMoney(cell.total) : undefined,
    };
  })} />;
}

/** key: one of the workflow steps, or a menu-only item such as export-excel. */
export type HeaderAction = { key: EstimateHeaderAction | "export-excel" | "refresh"; label: string; icon: IconName; onClick: () => void; disabled?: boolean; title?: string; guide?: string };

/**
 * The V2 workspace header: title and status on the left; on the right who else is here, More actions (safe items, a
 * separator, then the destructive Manage document) and the one filled action that moves the estimate forward.
 */
export function EstimateHeaderV2({ title, badges, meta, viewers, primary, more, moreMeta, destructive }: {
  title: string; badges: ReactNode; meta: ReactNode; viewers: ReactNode;
  primary: HeaderAction | null; more: readonly HeaderAction[]; moreMeta?: ReactNode; destructive?: ReactNode;
}) {
  const copy = useLookCopy();
  const menu = useRef<HTMLDetailsElement>(null);
  // A click outside the open menu closes it, as a dropdown does; the dialogs it opens are outside it as well.
  useEffect(() => {
    const close = (event: MouseEvent) => { if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const items = more.map((action) => <button key={action.key} className="btn ghost" type="button" disabled={action.disabled} title={action.title} data-guide={action.guide}
    onClick={() => { if (menu.current) menu.current.open = false; action.onClick(); }}><Icon name={action.icon} />{action.label}</button>);
  return <>
    <header className="pge-head">
      <div className="pge-head-title"><h1>{title}</h1>{badges}</div>
      <div className="pge-head-actions">
        {viewers}
        <details ref={menu} className="pge-more">
          <summary className="btn default" data-guide="estimate.moreActions">{copy("การทำงานอื่น", "More actions", "その他の操作")}<Icon name="chevronDown" /></summary>
          <div className="pge-more-menu" role="menu">
            {moreMeta ? <div className="pge-more-meta">{moreMeta}</div> : null}
            {items}
            {destructive ? <><hr /><div className="pge-destructive">{destructive}</div></> : null}
          </div>
        </details>
        {primary ? <button className="btn primary" type="button" data-guide={primary.guide} disabled={primary.disabled} title={primary.title} onClick={primary.onClick}><Icon name={primary.icon} />{primary.label}</button> : null}
      </div>
    </header>
    <div className="pge-meta">{meta}</div>
  </>;
}
