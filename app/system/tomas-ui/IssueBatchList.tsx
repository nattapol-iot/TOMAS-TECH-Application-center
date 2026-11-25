"use client";
/*
 * Projects > Punchlist, the list of customer issue batches, on @tomas-tc/ui (owner 2026-11-25). IssueBatchScreen loads
 * the batches and keeps the tab, search, page and selection; this draws them: the head with Create, the summary bar that
 * is the filter, the search, the table with its actions on the left, the pager and the bar for what is selected. The
 * batch's own dialogs (the issue grid, the batch, export) stay the Pegasus ones the screen opens over the page.
 */
import { Badge, Button, Checkbox, EmptyState, NamedIcon, Notice, SearchInput, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tomas-tc/ui";
import { TONE_BADGE, type KitTone } from "./tones";
import { TomasUi } from "./TomasUi";

export type IssueSummaryCell<Key extends string> = { key: Key; label: string; sub: string; value: string; warn: boolean };
export type IssueBatchRow = {
  id: number;
  batchNo: string;
  project: string;
  projectSub: string;
  reportedOn: string;
  reportedBy: string;
  progress: { percent: number; text: string };
  hours: string;
  badges: { key: string; label: string; tone: KitTone }[];
  selected: boolean;
  labels: { open: string; export: string; select: string };
};

export type IssueBatchListProps<Key extends string> = {
  labels: {
    title: string;
    subtitle: string;
    create: string;
    filterBy: string;
    search: string;
    refresh: string;
    retry: string;
    loading: string;
    actions: string;
    batchNo: string;
    project: string;
    reportedOn: string;
    progress: string;
    hours: string;
    status: string;
    selectPage: string;
    open: string;
    export: string;
    prev: string;
    next: string;
    clearSelection: string;
  };
  onCreate: (() => void) | null;
  summary: { cells: IssueSummaryCell<Key>[]; active: Key; onPick: (key: Key) => void };
  search: string;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  error: string;
  loading: boolean;
  /** Shown in place of the table when there is no row: no match, or nothing in this tab. */
  empty: string | null;
  rows: IssueBatchRow[];
  allOnPage: boolean;
  onToggleAll: () => void;
  onToggle: (id: number) => void;
  onOpen: (id: number) => void;
  onExport: (ids: number[]) => void;
  pager: { text: string; canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void } | null;
  selection: { text: string; ids: number[]; onClear: () => void } | null;
};

export function IssueBatchList<Key extends string>(props: IssueBatchListProps<Key>) {
  const { labels } = props;
  return (
    <TomasUi>
      <div className="grid gap-3" data-guide="issues.page">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-xl font-semibold text-foreground">{labels.title}</h1>
            <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
          </div>
          {props.onCreate ? (
            <Button data-guide="issues.create" onClick={props.onCreate}>
              <NamedIcon name="plus" />
              {labels.create}
            </Button>
          ) : null}
        </div>
        {/* The summary bar is the filter: one tab at a time, as the API reads it. */}
        <div role="group" aria-label={labels.filterBy} data-guide="issues.summary" className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] overflow-hidden rounded-md border bg-card">
          {props.summary.cells.map((cell) => (
            <button
              key={cell.key}
              type="button"
              aria-pressed={props.summary.active === cell.key}
              onClick={() => props.summary.onPick(cell.key)}
              className="grid gap-0.5 border-r px-4 py-3 text-left transition-colors last:border-r-0 hover:bg-muted/60 aria-pressed:bg-primary/10 aria-pressed:shadow-[inset_0_-2px_0_var(--primary)]"
            >
              <span className="text-xs text-muted-foreground">{cell.label}</span>
              <strong className={`text-xl font-semibold tabular-nums ${cell.warn ? "text-amber-700" : "text-foreground"}`}>{cell.value}</strong>
              <span className="text-xs text-muted-foreground">{cell.sub}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-2 rounded-md border bg-card p-2">
          <div className="flex items-center gap-2">
            <SearchInput className="w-72 max-w-full" value={props.search} placeholder={labels.search} aria-label={labels.search} onValueChange={props.onSearch} />
            <span className="flex-1" />
            <Button variant="ghost" size="icon-sm" aria-label={labels.refresh} title={labels.refresh} onClick={props.onRefresh}>
              <NamedIcon name="refresh-cw" />
            </Button>
          </div>
          {props.error ? (
            <div className="flex flex-wrap items-center gap-3">
              <Notice tone="error" message={props.error} />
              <Button variant="outline" size="sm" onClick={props.onRefresh}>
                {labels.retry}
              </Button>
            </div>
          ) : null}
          {props.loading ? (
            <div className="grid gap-2 p-2" aria-busy="true" aria-label={labels.loading}>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : props.empty !== null ? (
            <EmptyState className="py-10 text-center text-sm text-muted-foreground">{props.empty}</EmptyState>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox aria-label={labels.selectPage} checked={props.allOnPage} onCheckedChange={props.onToggleAll} />
                    </TableHead>
                    <TableHead className="w-20">{labels.actions}</TableHead>
                    <TableHead>{labels.batchNo}</TableHead>
                    <TableHead>{labels.project}</TableHead>
                    <TableHead>{labels.reportedOn}</TableHead>
                    <TableHead>{labels.progress}</TableHead>
                    <TableHead className="text-right">{labels.hours}</TableHead>
                    <TableHead>{labels.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {props.rows.map((row) => (
                    <TableRow key={row.id} data-state={row.selected ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox aria-label={row.labels.select} checked={row.selected} onCheckedChange={() => props.onToggle(row.id)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-0.5">
                          <Button variant="ghost" size="icon-sm" aria-label={row.labels.open} title={labels.open} onClick={() => props.onOpen(row.id)}>
                            <NamedIcon name="eye" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={row.labels.export} title={labels.export} onClick={() => props.onExport([row.id])}>
                            <NamedIcon name="download" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <button type="button" className="font-mono font-medium text-primary hover:underline" data-guide="issues.batch" onClick={() => props.onOpen(row.id)}>
                          {row.batchNo}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <span className="block font-medium">{row.project}</span>
                        {row.projectSub ? <span className="block text-xs text-muted-foreground">{row.projectSub}</span> : null}
                      </TableCell>
                      <TableCell>
                        <span className="block tabular-nums">{row.reportedOn}</span>
                        <span className="block text-xs text-muted-foreground">{row.reportedBy}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <i className={`block h-full ${row.progress.percent === 100 ? "bg-emerald-600" : "bg-primary"}`} style={{ width: `${row.progress.percent}%` }} />
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">{row.progress.text}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.hours}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.badges.map((badge) => (
                            <Badge key={badge.key} variant="outline" className={TONE_BADGE[badge.tone]}>
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {props.pager ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-2 pt-2 text-sm">
              <span className="tabular-nums text-muted-foreground">{props.pager.text}</span>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" disabled={!props.pager.canPrev} onClick={props.pager.onPrev}>
                  {labels.prev}
                </Button>
                <Button variant="outline" size="sm" disabled={!props.pager.canNext} onClick={props.pager.onNext}>
                  {labels.next}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        {props.selection ? (
          <div className="sticky bottom-3 z-10 flex items-center gap-3 justify-self-center rounded-md border bg-card px-3 py-2 shadow-lg">
            <span className="text-sm font-medium">{props.selection.text}</span>
            <Button size="sm" onClick={() => props.onExport(props.selection?.ids ?? [])}>
              <NamedIcon name="download" />
              {labels.export}
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={labels.clearSelection} onClick={props.selection.onClear}>
              <NamedIcon name="x" />
            </Button>
          </div>
        ) : null}
      </div>
    </TomasUi>
  );
}
