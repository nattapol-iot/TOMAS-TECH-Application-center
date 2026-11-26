"use client";
/*
 * A project's Overview tab (task doc 5.3) on @tomas-tc/ui (owner 2026-11-25): the figures row (each a way to the Plan
 * tab) and the boxes, each a way to the place that handles it. ProjectOverviewTab (CoreScreens.tsx) reads the data and
 * hands this part what to show, already in the reader's language. Money is never shown here.
 */
import { Button, Card, CardAction, CardContent, CardHeader, CardTitle, NamedIcon, Notice, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tomas-tc/ui";
import { TONE_TEXT, type KitTone } from "./tones";
import { TomasUi } from "./TomasUi";

export type OverviewProgress = { actual: number; planned: number | null; text: string; tone: KitTone };

export type OverviewCell = { key: string; label: string; value: string; tone?: KitTone; progress?: OverviewProgress; onSelect: () => void; hint?: string };

export type OverviewBody =
  | { kind: "loading" }
  | { kind: "facts"; rows: { label: string; value: string }[] }
  | { kind: "bars"; empty: string; rows: { key: string; label: string; sub: string; late: boolean; progress: number | null; planned: number | null; title: string }[] }
  | { kind: "table"; empty: string; head: string[]; rows: { key: string; cells: string[]; over: boolean }[] }
  | { kind: "counts"; empty: string; rows: { key: string; label: string; sub?: string; value: string; done?: boolean }[] }
  | { kind: "list"; empty: string; rows: { key: string; label: string; sub: string }[] };

export type OverviewBox = { key: string; title: string; onOpen: (() => void) | null; body: OverviewBody };

export type ProjectOverviewBoxesProps = {
  openLabel: string;
  cells: OverviewCell[];
  error: { message: string; retryLabel: string; onRetry: () => void } | null;
  boxes: OverviewBox[];
};

const BAR: Record<KitTone, string> = { green: "bg-emerald-600", amber: "bg-amber-500", blue: "bg-primary", red: "bg-red-600", slate: "bg-slate-400", violet: "bg-violet-600" };

function ProgressBar({ actual, planned, tone, label }: { actual: number; planned: number | null; tone: KitTone; label: string }) {
  return (
    <span className="relative block h-1.5 w-full rounded-full bg-muted" role="img" aria-label={label}>
      <span className={`absolute inset-y-0 left-0 rounded-full ${BAR[tone]}`} style={{ width: `${Math.max(0, Math.min(100, actual))}%` }} />
      {planned !== null ? <i className="absolute -top-1 -bottom-1 w-px bg-foreground" style={{ left: `${Math.max(0, Math.min(100, planned))}%` }} aria-hidden="true" /> : null}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function Body({ body }: { body: OverviewBody }) {
  switch (body.kind) {
    case "loading":
      return (
        <div className="grid gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      );
    case "facts":
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {body.rows.map((row) => (
            <div key={row.label} className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "bars":
      return body.rows.length ? (
        <ul className="grid gap-2.5">
          {body.rows.map((row) => (
            <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-center gap-2">
              <span className="grid min-w-0">
                <span className={`truncate text-sm ${row.late ? "font-medium text-destructive" : ""}`}>{row.label}</span>
                <small className="truncate text-xs text-muted-foreground">{row.sub}</small>
              </span>
              {row.progress === null ? (
                <span className="text-muted-foreground">–</span>
              ) : (
                <span title={row.title}>
                  <ProgressBar actual={row.progress} planned={row.planned} tone={row.late ? "red" : "blue"} label={row.title} />
                </span>
              )}
              <span className="text-right font-mono text-xs tabular-nums">{row.progress === null ? "" : `${Math.round(row.progress)}%`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty text={body.empty} />
      );
    case "table":
      return body.rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              {body.head.map((label, index) => (
                <TableHead key={`${label}-${index}`} className={index ? "text-right" : undefined}>
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {body.rows.map((row) => (
              <TableRow key={row.key} className={row.over ? "text-destructive" : undefined}>
                {row.cells.map((cell, index) => (
                  <TableCell key={index} className={index ? "text-right font-mono tabular-nums" : undefined}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty text={body.empty} />
      );
    case "counts":
      return body.rows.length ? (
        <ul className="grid gap-1.5">
          {body.rows.map((row) => (
            <li key={row.key} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                {row.label} {row.sub ? <small className="text-xs text-muted-foreground">{row.sub}</small> : null}
              </span>
              <strong className={`font-mono tabular-nums ${row.done ? "text-emerald-700" : ""}`}>{row.done ? <NamedIcon name="check" className="size-4" /> : row.value}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <Empty text={body.empty} />
      );
    case "list":
      return body.rows.length ? (
        <ul className="grid gap-2">
          {body.rows.map((row) => (
            <li key={row.key} className="grid min-w-0">
              <span className="truncate text-sm">{row.label}</span>
              <small className="truncate text-xs text-muted-foreground">{row.sub}</small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty text={body.empty} />
      );
  }
}

export function ProjectOverviewBoxes(props: ProjectOverviewBoxesProps) {
  return (
    <TomasUi className="project-overview-boxes">
      <div className="grid gap-3">
        {/* The figures row: where the plan stands, each a way to the Plan tab. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] overflow-hidden rounded-md border bg-card" data-guide="projectPage.summary">
          {props.cells.map((cell) => (
            <button
              key={cell.key}
              type="button"
              title={cell.hint}
              onClick={cell.onSelect}
              className="grid content-start gap-1 border-r px-4 py-3 text-left transition-colors last:border-r-0 hover:bg-muted/60"
            >
              <span className="text-xs text-muted-foreground">{cell.label}</span>
              {cell.progress ? (
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <ProgressBar actual={cell.progress.actual} planned={cell.progress.planned} tone={cell.progress.tone} label={cell.progress.text} />
                  <strong className="font-mono text-sm tabular-nums">{cell.value}</strong>
                </span>
              ) : (
                <strong className={`text-lg font-semibold ${cell.tone ? TONE_TEXT[cell.tone] : "text-foreground"}`}>{cell.value}</strong>
              )}
            </button>
          ))}
        </div>
        {props.error ? (
          <div className="flex flex-wrap items-center gap-3">
            <Notice tone="error" message={props.error.message} />
            <Button variant="outline" size="sm" onClick={props.error.onRetry}>
              {props.error.retryLabel}
            </Button>
          </div>
        ) : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3" data-guide="projectPage.boxes">
          {props.boxes.map((box) => (
            <Card key={box.key} className="gap-3 py-4" data-box={box.key}>
              <CardHeader className="px-4">
                <CardTitle className="text-sm">{box.title}</CardTitle>
                {box.onOpen ? (
                  <CardAction>
                    <Button variant="ghost" size="sm" onClick={box.onOpen}>
                      {props.openLabel}
                      <NamedIcon name="arrow-right" />
                    </Button>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent className="px-4">
                <Body body={box.body} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </TomasUi>
  );
}
