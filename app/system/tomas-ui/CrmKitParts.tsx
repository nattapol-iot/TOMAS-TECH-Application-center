"use client";
/*
 * Parts every CRM page on @tomas-tc/ui shares (CrmPages.tsx, CrmPeoplePages.tsx): a section card, a record table with its
 * loading, empty and failed states and paging, the summary bar and the filter chips (each one the filter it names), a
 * toolbar row and the tone of a status. Every label arrives translated: names and codes pass through untouched.
 */
import { Badge, Button, NamedIcon, Notice, OptionSelect, Pagination, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tomas-tc/ui";
import type { ReactNode } from "react";
import { TONE_BADGE, TONE_DOT, TONE_TEXT, type KitTone } from "./tones";

/* Stage, follow-up status and attention flag all say "what state is this in", so they share the badge tones. */
const CRM_TONE: Record<string, KitTone> = {
  NEW: "slate",
  QUALIFICATION: "slate",
  REQUIREMENT: "blue",
  ESTIMATING: "blue",
  PROPOSAL: "violet",
  NEGOTIATION: "amber",
  WON: "green",
  LOST: "red",
  ON_HOLD: "slate",
  Open: "blue",
  WaitingCustomer: "amber",
  WaitingInternal: "amber",
  WaitingSupplier: "amber",
  Done: "green",
  Cancelled: "slate",
  Overdue: "red",
  DueToday: "amber",
  DueSoon: "amber",
  Scheduled: "slate",
  Waiting: "slate",
  Incomplete: "violet",
  NeedsFollowup: "amber",
  NoNextAction: "violet",
  NoActivity: "violet",
  EstimateDueSoon: "amber",
  Approved: "green",
  Active: "green",
  Inactive: "slate",
};
export const toneOf = (code: string): KitTone => CRM_TONE[code] ?? "slate";
export const money = (value: unknown) =>
  value == null || value === "" ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Number(value));

export function StatusBadge({ code, label }: { code: string; label: string }) {
  return (
    <Badge variant="outline" className={TONE_BADGE[toneOf(code)]}>
      {label}
    </Badge>
  );
}

/** A card with a title line (title, one line under it, actions on the right) and its body. */
export function Section({
  title,
  subtitle,
  actions,
  guide,
  flush,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  guide?: string;
  flush?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`grid min-w-0 grid-cols-[minmax(0,1fr)] rounded-md border bg-card ${className ?? ""}`} data-guide={guide}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div className="grid min-w-0 gap-0.5">
            {title ? <h2 className="text-sm font-semibold text-foreground">{title}</h2> : null}
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "min-w-0" : "min-w-0 p-4"}>{children}</div>
    </section>
  );
}

/** Nothing to show: what that means here, and what to do about it when the reader may. */
export function EmptyBlock({ icon = "inbox", title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-10 text-center">
      <NamedIcon name={icon} className="size-8 text-muted-foreground" />
      <strong className="text-sm font-semibold text-foreground">{title}</strong>
      {hint ? <p className="max-w-md text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/** First load: grey lines where the rows will be, never "nothing found" before the answer (CRM UX audit CRM-06). */
export function LoadingRows({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="grid gap-2 p-4">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

/** A read that failed, apart from loading and empty, with a retry. */
export function LoadError({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="p-3">
      <Notice tone="error">
        <span>{message}</span>{" "}
        {onRetry ? (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
      </Notice>
    </div>
  );
}

export type Column<Row> = { key: string; label: string; className?: string; render: (row: Row) => ReactNode };
export type Paging = { page: number; perPage: number; total: number; onPage: (page: number) => void; onPerPage: (perPage: number) => void };
export type TableStates = { loading: string; failed: string; retry: string };

/** Rows with their states: grey lines on the first load, the last rows dimmed while the next answer comes, empty, failed. */
export function RecordTable<Row>({
  label,
  columns,
  rows,
  rowKey,
  loading,
  failed,
  onRetry,
  states,
  empty,
  paging,
  guide,
}: {
  label: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  states: TableStates;
  empty: ReactNode;
  paging?: Paging | null;
  guide?: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]" data-guide={guide}>
      {failed ? <LoadError message={states.failed} retryLabel={states.retry} onRetry={onRetry} /> : null}
      {!rows.length ? (
        loading ? (
          <LoadingRows label={states.loading} />
        ) : failed ? null : (
          empty
        )
      ) : (
        <div className={loading ? "min-w-0 overflow-x-auto opacity-60 transition-opacity" : "min-w-0 overflow-x-auto"} aria-busy={loading || undefined}>
          <Table aria-label={label}>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key} className={column.className}>
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={rowKey(row, index)}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {paging ? <PagingBar paging={paging} /> : null}
    </div>
  );
}

/** The pager under a list (the kit's Pagination), shown once there is something to page. */
export function PagingBar({ paging }: { paging: Paging }) {
  if (paging.total <= 0) return null;
  return (
    <div className="border-t px-3 py-2">
      <Pagination page={paging.page} perPage={paging.perPage} total={paging.total} perPageOptions={[10, 25, 30, 50, 100]} onPageChange={paging.onPage} onPerPageChange={paging.onPerPage} />
    </div>
  );
}

/** A name that opens its record. */
export function OpenLink({ children, onOpen, className, title }: { children: ReactNode; onOpen: () => void; className?: string; title?: string }) {
  return (
    <button type="button" title={title} onClick={onOpen} className={`text-left font-medium text-primary hover:underline ${className ?? ""}`}>
      {children}
    </button>
  );
}

export type SummaryCell = { key: string; label: string; value: number; tone: KitTone | null; pressed: boolean };
/** The Pegasus summary bar: each cell counts what pressing it lists; pressed again, it clears. */
export function SummaryBar({ label, cells, onPick, guide }: { label: string; cells: SummaryCell[]; onPick: (key: string, pressed: boolean) => void; guide?: string }) {
  return (
    <div role="group" aria-label={label} data-guide={guide} className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] overflow-hidden rounded-md border bg-card">
      {cells.map((cell) => (
        <button
          key={cell.key}
          type="button"
          aria-pressed={cell.pressed}
          onClick={() => onPick(cell.key, cell.pressed)}
          className="grid gap-1 border-r border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/60 aria-pressed:bg-primary/10 aria-pressed:shadow-[inset_0_-2px_0_var(--primary)]"
        >
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {cell.tone ? <i className={`inline-block size-2 shrink-0 rounded-[2px] ${TONE_DOT[cell.tone]}`} aria-hidden="true" /> : null}
            {cell.label}
          </span>
          <strong className={`text-lg font-semibold tabular-nums ${cell.tone && cell.value ? TONE_TEXT[cell.tone] : "text-foreground"}`}>{cell.value.toLocaleString("en-US")}</strong>
        </button>
      ))}
    </div>
  );
}

export type ChipItem = { key: string; label: string; value: number; tone: KitTone };
/** Counts that are also filters; a chip with nothing in it waits until it has. */
export function Chips({ label, items, active, onPick, guide, quiet }: { label: string; items: ChipItem[]; active: string; onPick: (key: string) => void; guide?: string; quiet?: boolean }) {
  return (
    <div role="group" aria-label={label} data-guide={guide} className="flex flex-wrap items-center gap-2">
      {items.map((chip) => {
        const on = active === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={on}
            disabled={!chip.value && !on}
            onClick={() => onPick(on ? "" : chip.key)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-50 ${on ? `${TONE_BADGE[chip.tone]} ring-2 ring-primary/40` : quiet ? "bg-muted/40 text-muted-foreground hover:bg-muted" : "bg-background text-foreground hover:bg-muted"}`}
          >
            {chip.label}
            <b className={`tabular-nums ${chip.value && !quiet ? TONE_TEXT[chip.tone] : "text-muted-foreground"}`}>{chip.value}</b>
          </button>
        );
      })}
    </div>
  );
}

/** A short list as a toolbar filter: its name stays in the box so "Stage: all" reads as a filter, not a value. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel,
  className,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  allLabel?: string;
  className?: string;
}) {
  return (
    <div className={className ?? "w-48"}>
      <OptionSelect
        ariaLabel={label}
        value={value || null}
        options={options}
        clearable={Boolean(allLabel)}
        placeholder={allLabel ?? label}
        onChange={(next) => onChange(next == null ? "" : String(next))}
      />
    </div>
  );
}

export function Toolbar({ children, guide }: { children: ReactNode; guide?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-guide={guide}>
      {children}
    </div>
  );
}
