"use client";
/*
 * The Projects list (task doc 5.1) on @tomas-tc/ui (owner 2026-11-25: "ใช้ Componance UI @tomas-tc/ui เป็นหลัก").
 * Two parts, each in its own TomasUi root, so the timeline (the app's Gantt) and the app's dialogs stay outside the kit:
 * - ProjectListHead: the title with its count, search, All / Mine, List / Timeline, More, the CEO summary and Create;
 *   the health summary bar, each cell a filter pressed again to clear; the attention chips, and on their line the PM,
 *   team and stage filters. List and Timeline share this head, so they filter the same way (owner 2026-11-26).
 * - ProjectListTable: the list, sorted from its headers, a menu on each row, the stage menu, and paging.
 * ProductionProjects (CoreScreens.tsx) keeps the data, the filters and the dialogs, and hands these parts what to show.
 */
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  NamedIcon,
  Pagination,
  SearchInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tomas-tc/ui";
import type { ReactNode } from "react";
import { TONE_BADGE, TONE_DOT, TONE_TEXT, type KitTone } from "./tones";
import { Segmented } from "./Segmented";
import { TomasUi } from "./TomasUi";

export type ListAction = { key: string; label: string; danger?: boolean; guide?: string; onSelect: () => void };
type Choice<Value> = { value: Value; label: string };

export type ProjectListHeadProps = {
  title: string;
  search: { value: string; placeholder: string; onChange: (value: string) => void };
  mine: { label: string; options: Choice<boolean>[]; value: boolean; onChange: (value: boolean) => void };
  mode: { label: string; options: Choice<"list" | "timeline">[]; value: "list" | "timeline"; onChange: (value: "list" | "timeline") => void };
  more: { label: string; actions: ListAction[] };
  ceo: { label: string; onSelect: () => void } | null;
  create: { label: string; onSelect: () => void } | null;
  summary: { label: string; cells: { key: string | null; label: string; value: number; tone: KitTone; pressed: boolean }[]; onPick: (key: string | null) => void };
  chips: { label: string; items: { key: string; label: string; value: number; tone: KitTone }[]; active: string | null; onPick: (key: string | null) => void };
  /** The PM, team and stage filters, and Clear filters while any filter of the page is on. */
  filters: { label: string; pm: ColumnFilterSpec; team: ColumnFilterSpec; stage: ColumnFilterSpec; clear: { label: string; onSelect: () => void } | null };
};

export function ProjectListHead(props: ProjectListHeadProps) {
  return (
    <TomasUi className="project-list-head">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">{props.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput className="w-64" value={props.search.value} placeholder={props.search.placeholder} aria-label={props.search.placeholder} onValueChange={props.search.onChange} />
            <Segmented label={props.mine.label} options={props.mine.options} value={props.mine.value} onChange={props.mine.onChange} guide="project.mine" />
            <Segmented label={props.mode.label} options={props.mode.options} value={props.mode.value} onChange={props.mode.onChange} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-guide="project.more">
                  <NamedIcon name="ellipsis" />
                  {props.more.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {props.more.actions.map((action) => (
                  <DropdownMenuItem key={action.key} data-guide={action.guide} onSelect={action.onSelect}>
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {props.ceo ? (
              <Button variant="outline" data-guide="project.ceo" onClick={props.ceo.onSelect}>
                <NamedIcon name="chart-column" />
                {props.ceo.label}
              </Button>
            ) : null}
            {props.create ? (
              <Button data-guide="project.create" onClick={props.create.onSelect}>
                <NamedIcon name="plus" />
                {props.create.label}
              </Button>
            ) : null}
          </div>
        </div>
        {/* The health summary bar: each cell filters the list; pressed again, it clears. */}
        <div role="group" aria-label={props.summary.label} data-guide="project.summary" className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] overflow-hidden rounded-md border bg-card">
          {props.summary.cells.map((cell) => (
            <button
              key={cell.key ?? "all"}
              type="button"
              aria-pressed={cell.pressed}
              onClick={() => props.summary.onPick(cell.key)}
              className="grid gap-1 border-r px-4 py-3 text-left transition-colors last:border-r-0 hover:bg-muted/60 aria-pressed:bg-primary/10 aria-pressed:shadow-[inset_0_-2px_0_var(--primary)]"
            >
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {cell.key ? <i className={`inline-block size-2 rounded-[2px] ${TONE_DOT[cell.tone]}`} aria-hidden="true" /> : null}
                {cell.label}
              </span>
              <strong className={`text-xl font-semibold tabular-nums ${cell.key && cell.value ? TONE_TEXT[cell.tone] : "text-foreground"}`}>{cell.value}</strong>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label={props.chips.label} className="flex flex-wrap gap-2">
            {props.chips.items.map((chip) => {
              const on = props.chips.active === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={on}
                  disabled={!chip.value && !on}
                  onClick={() => props.chips.onPick(on ? null : chip.key)}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-50 ${on ? TONE_BADGE[chip.tone] + " ring-2 ring-primary/40" : "bg-background text-foreground hover:bg-muted"}`}
                >
                  {chip.label}
                  <b className={`tabular-nums ${chip.value ? TONE_TEXT[chip.tone] : "text-muted-foreground"}`}>{chip.value}</b>
                </button>
              );
            })}
          </div>
          <div role="group" aria-label={props.filters.label} data-guide="project.filters" className="flex flex-wrap items-center gap-2">
            <FilterButton filter={props.filters.pm} />
            <FilterButton filter={props.filters.team} />
            <FilterButton filter={props.filters.stage} />
            {props.filters.clear ? (
              <Button variant="ghost" size="sm" onClick={props.filters.clear.onSelect}>
                <NamedIcon name="x" />
                {props.filters.clear.label}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </TomasUi>
  );
}

/** One single-value filter: the options with how many projects each has, ticked last wins. */
export type ColumnFilterSpec = {
  label: string;
  /** What the button says while nothing is picked, e.g. "All PMs". */
  allLabel: string;
  clearLabel: string;
  options: { value: string; label: string; count: number }[];
  value: string | null;
  onChange: (value: string | null) => void;
  guide?: string;
};

/** A small button that names the filter's value ("All PMs" until one is picked) and opens the options with their counts. */
function FilterButton({ filter }: { filter: ColumnFilterSpec }) {
  const picked = filter.value === null ? null : (filter.options.find((option) => option.value === filter.value)?.label ?? filter.value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title={filter.label}
          data-guide={filter.guide}
          className={`max-w-56 ${picked === null ? "text-muted-foreground" : "border-primary/50 bg-primary/10 text-primary"}`}
        >
          <span className="truncate">{picked === null ? filter.allLabel : `${filter.label}: ${picked}`}</span>
          <NamedIcon name="chevron-down" className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
        {filter.options.map((option) => (
          <DropdownMenuCheckboxItem key={option.value} checked={filter.value === option.value} onCheckedChange={(checked) => filter.onChange(checked ? option.value : null)}>
            <span className="flex-1">{option.label}</span>
            <span className="ml-3 text-xs text-muted-foreground tabular-nums">{option.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {filter.value !== null ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => filter.onChange(null)}>{filter.clearLabel}</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type ProjectListRow = {
  id: number;
  number: string;
  name: string;
  customerLine: string;
  /** Opens the project's page (or its plan); null when the reader may open neither. */
  onOpen: (() => void) | null;
  menu: { label: string; actions: ListAction[] };
  stage: { label: string; menuLabel: string; disabled: boolean; options: { value: string; label: string; onSelect: () => void }[] | null };
  health: { label: string; tone: KitTone };
  scheduleError: { label: string; hint: string } | null;
  pm: string;
  target: string;
  slip: { text: string; late: boolean };
  progress: { actual: number; planned: number | null; text: string; title: string | undefined; tone: KitTone; manual: { label: string; hint: string } | null };
  hours: { text: string; over: boolean; title: string | undefined };
  follow: { count: number; title: string; onOpen: (() => void) | null };
  lastUpdate: string;
};

type SortKey = "health" | "number" | "name" | "pm" | "target" | "slip" | "progress" | "lastUpdate";

export type ProjectListTableProps = {
  labels: Record<SortKey | "actions" | "stage" | "hours" | "follow" | "followRule", string> & { ascending: string; descending: string };
  sort: { key: SortKey; direction: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  rows: ProjectListRow[];
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
  onPerPage: (perPage: number) => void;
};

/** Columns a phone (720 px or less) leaves out. */
const PHONE_HIDDEN = "max-[720px]:hidden";

const BAR: Record<KitTone, string> = { green: "bg-emerald-600", amber: "bg-amber-500", blue: "bg-primary", red: "bg-red-600", slate: "bg-slate-400", violet: "bg-violet-600" };

export function ProjectListTable(props: ProjectListTableProps) {
  const { labels, sort } = props;
  const sortHead = (key: SortKey, extra?: ReactNode, className = "") => (
    <TableHead className={className} aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={() => props.onSort(key)} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
          {labels[key]}
          {sort.key === key ? <NamedIcon name={sort.direction === "asc" ? "arrow-up" : "arrow-down"} className="size-3.5" /> : null}
        </button>
        {extra}
      </span>
    </TableHead>
  );
  return (
    <TomasUi className="project-list-table">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">{labels.actions}</span>
              </TableHead>
              <TableHead>{labels.stage}</TableHead>
              {sortHead("health")}
              {sortHead("number")}
              {sortHead("name", undefined, "w-[34%] min-w-48 max-w-0")}
              {/* PM, slip and hours give way on a phone, so the stage, health and name need no sideways scroll. */}
              {sortHead("pm", undefined, PHONE_HIDDEN)}
              {sortHead("target")}
              {sortHead("slip", undefined, PHONE_HIDDEN)}
              {sortHead("progress")}
              <TableHead className={PHONE_HIDDEN}>{labels.hours}</TableHead>
              <TableHead data-guide="project.followCol" title={labels.followRule}>
                {labels.follow}
              </TableHead>
              {sortHead("lastUpdate")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={row.menu.label} title={row.menu.label} data-guide="project.rowMenu">
                        <NamedIcon name="ellipsis" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {row.menu.actions.map((action, index) => (
                        <div key={action.key}>
                          {action.danger && index > 0 ? <DropdownMenuSeparator /> : null}
                          <DropdownMenuItem variant={action.danger ? "destructive" : "default"} data-guide={action.guide} onSelect={action.onSelect}>
                            {action.label}
                          </DropdownMenuItem>
                        </div>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
                <TableCell>
                  {row.stage.options ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={row.stage.disabled} aria-label={row.stage.menuLabel}>
                          {row.stage.label}
                          <NamedIcon name="chevron-down" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {row.stage.options.map((option) => (
                          <DropdownMenuItem key={option.value} onSelect={option.onSelect}>
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Badge variant="outline">{row.stage.label}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="grid justify-items-start gap-0.5">
                    <Badge variant="outline" className={TONE_BADGE[row.health.tone]}>
                      {row.health.label}
                    </Badge>
                    {row.scheduleError ? (
                      <small className="text-xs text-destructive" title={row.scheduleError.hint}>
                        {row.scheduleError.label}
                      </small>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="font-mono">
                  {row.onOpen ? (
                    <button type="button" className="font-medium text-primary hover:underline" onClick={row.onOpen}>
                      {row.number}
                    </button>
                  ) : (
                    <strong>{row.number}</strong>
                  )}
                </TableCell>
                <TableCell className="max-w-0">
                  <div className="grid min-w-0 gap-0.5" title={`${row.name}\n${row.customerLine}`}>
                    {row.onOpen ? (
                      <button type="button" className="truncate text-left font-medium text-foreground hover:text-primary hover:underline" onClick={row.onOpen}>
                        {row.name}
                      </button>
                    ) : (
                      <strong className="truncate font-medium">{row.name}</strong>
                    )}
                    <small className="truncate text-xs text-muted-foreground">{row.customerLine}</small>
                  </div>
                </TableCell>
                <TableCell className={PHONE_HIDDEN}>{row.pm}</TableCell>
                <TableCell>{row.target}</TableCell>
                <TableCell className={`${PHONE_HIDDEN}${row.slip.late ? " font-semibold text-destructive" : ""}`}>{row.slip.text}</TableCell>
                <TableCell>
                  <div className="flex min-w-36 items-center gap-2" title={row.progress.title}>
                    <span className="relative h-1.5 flex-1 rounded-full bg-muted" role="img" aria-label={row.progress.text}>
                      <span className={`absolute inset-y-0 left-0 rounded-full ${BAR[row.progress.tone]}`} style={{ width: `${Math.max(0, Math.min(100, row.progress.actual))}%` }} />
                      {row.progress.planned !== null ? (
                        <i className="absolute -top-1 -bottom-1 w-px bg-foreground" style={{ left: `${Math.max(0, Math.min(100, row.progress.planned))}%` }} aria-hidden="true" />
                      ) : null}
                    </span>
                    <span className="font-mono text-xs tabular-nums">{row.progress.planned === null ? `${row.progress.actual}%` : `${row.progress.actual} / ${row.progress.planned}`}</span>
                    {row.progress.manual ? (
                      <small className="text-xs text-amber-700" title={row.progress.manual.hint}>
                        {row.progress.manual.label}
                      </small>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className={`${PHONE_HIDDEN} font-mono tabular-nums ${row.hours.over ? "font-semibold text-destructive" : ""}`} title={row.hours.title}>
                  {row.hours.text}
                </TableCell>
                <TableCell>
                  {row.follow.count && row.follow.onOpen ? (
                    <button
                      type="button"
                      title={row.follow.title}
                      onClick={row.follow.onOpen}
                      className="inline-grid min-w-6 place-items-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200"
                    >
                      {row.follow.count}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">{row.follow.count || "–"}</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{row.lastUpdate}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-3 py-2">
          <Pagination page={props.page} perPage={props.perPage} total={props.total} perPageOptions={[10, 25, 50, 100]} onPageChange={props.onPage} onPerPageChange={props.onPerPage} />
        </div>
      </div>
    </TomasUi>
  );
}
