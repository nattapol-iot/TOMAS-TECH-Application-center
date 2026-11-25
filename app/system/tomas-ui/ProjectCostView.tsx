"use client";
/*
 * A project's Cost tab (task doc 6.1, 6.2) on @tomas-tc/ui (owner 2026-11-25): the views, the four figures that each open
 * their view, the team's man-days over time beside the split by discipline, the tables by task and by person, and what
 * was bought over time and by category. ProjectCostPage (ProjectCostScreen.tsx) reads the data, decides what the viewer
 * may see (project-cost-model.ts) and hands this part words and figures; the breakdown of what was bought by Module
 * stays the app's, under this part.
 */
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tomas-tc/ui";
import { Segmented } from "./Segmented";
import { TONE_TEXT, type KitTone } from "./tones";
import { TomasUi } from "./TomasUi";

export type CostView = "overview" | "tasks" | "people" | "bought";
export type CostCell = { key: string; label: string; value: string; note: string; view: CostView; tone?: KitTone };
export type CostTable = {
  empty: string;
  head: string[];
  /** Columns from this index on are figures, right-aligned. */ numbersFrom: number;
  rows: { key: string; cells: string[]; over?: boolean; /** A bought category's code: its colour before the first cell. */ category?: string }[];
};

export type HoursCurveModel = {
  title: string;
  empty: string;
  points: { week: string; planned: number; actual: number }[];
  today: string;
  budget: number | null;
  forecast: number | null;
  keys: { planned: string; actual: string; budget: string; forecast: string };
};

export type PurchaseModel = {
  curve: {
    title: string;
    empty: string;
    points: { week: string; requested: number; ordered: number }[];
    budget: number | null;
    window: { from: string; to: string } | null;
    today: string;
    keys: { requested: string; ordered: string; budget: string; window: string };
  };
  categories: { title: string; splitLabel: string; table: CostTable; split: { key: string; category: string; share: number; title: string }[] };
  amount: (value: number) => string;
};

export type ProjectCostViewProps = {
  views: { label: string; options: { value: CostView; label: string }[]; value: CostView; onChange: (view: CostView) => void };
  cells: CostCell[];
  curve: HoursCurveModel;
  disciplines: { title: string; table: CostTable; unit: string };
  tasks: CostTable;
  people: CostTable;
  bought: PurchaseModel | null;
};

/** The bought categories' colours, the estimate's category codes (01 Hardware … 07 Outsource; "" a typed line). */
const CATEGORY_FILL: Record<string, string> = { "01": "bg-primary", "02": "bg-violet-600", "03": "bg-amber-500", "04": "bg-emerald-700", "05": "bg-slate-900", "07": "bg-red-700" };
const fillOf = (category: string) => CATEGORY_FILL[category] ?? "bg-slate-400";

function KitTable({ table }: { table: CostTable }) {
  if (!table.rows.length) return <p className="text-sm text-muted-foreground">{table.empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {table.head.map((label, index) => (
            <TableHead key={`${label}-${index}`} className={index >= table.numbersFrom ? "text-right" : undefined}>
              {label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.rows.map((row) => (
          <TableRow key={row.key} className={row.over ? "text-destructive" : undefined}>
            {row.cells.map((cell, index) => (
              <TableCell key={index} className={index >= table.numbersFrom ? "text-right font-mono tabular-nums" : "whitespace-normal"}>
                {index === 0 && row.category !== undefined ? <i className={`mr-1.5 inline-block size-2.5 rounded-[2px] align-middle ${fillOf(row.category)}`} aria-hidden="true" /> : null}
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Key({ items }: { items: { label: string; swatch: string }[] }) {
  return (
    <figcaption className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <i className={item.swatch} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </figcaption>
  );
}

const W = 560,
  H = 200,
  BOTTOM = 22;

/** Man-days added up week by week: planned, confirmed (up to today), the budget and the forecast at completion. */
function HoursCurve({ curve }: { curve: HoursCurveModel }) {
  const points = curve.points;
  if (!points.length) return <p className="text-sm text-muted-foreground">{curve.empty}</p>;
  const left = 36;
  const top = Math.max(1, curve.budget ?? 0, curve.forecast ?? 0, ...points.map((point) => Math.max(point.planned, point.actual)));
  const x = (index: number) => left + (points.length === 1 ? 0 : (index / (points.length - 1)) * (W - left - 8));
  const y = (value: number) => H - BOTTOM - (value / top) * (H - BOTTOM - 8);
  const path = (list: [number, number][]) => list.map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  let doneUpTo = -1;
  points.forEach((point, index) => {
    // The confirmed line stops at today; the plan runs on.
    if (point.week <= curve.today) doneUpTo = index;
  });
  const last = points.length - 1;
  return (
    <figure className="m-0 grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={curve.title} className="block h-auto w-full">
        {[0, 0.5, 1].map((share) => (
          <g key={share}>
            <line x1={left} x2={W - 8} y1={y(top * share)} y2={y(top * share)} className="stroke-border" />
            <text x={left - 4} y={y(top * share) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {Math.round(top * share)}
            </text>
          </g>
        ))}
        {curve.budget ? <line x1={left} x2={W - 8} y1={y(curve.budget)} y2={y(curve.budget)} className="stroke-red-700 [stroke-dasharray:2_3]" /> : null}
        <path d={path(points.map((point, index) => [x(index), y(point.planned)]))} className="fill-none stroke-primary [stroke-dasharray:5_3] [stroke-width:2]" />
        {doneUpTo >= 0 ? <path d={path(points.slice(0, doneUpTo + 1).map((point, index) => [x(index), y(point.actual)]))} className="fill-none stroke-emerald-700 [stroke-width:2.5]" /> : null}
        {curve.forecast !== null ? <circle cx={x(last)} cy={y(curve.forecast)} r={4} className="fill-amber-500" /> : null}
        {/* One week alone draws no line: its points show as dots. */}
        {points.length === 1 ? <circle cx={x(0)} cy={y(points[0]!.planned)} r={3} className="fill-primary" /> : null}
        {points.length === 1 && doneUpTo === 0 ? <circle cx={x(0)} cy={y(points[0]!.actual)} r={3} className="fill-emerald-700" /> : null}
        <text x={left} y={H - 4} className="fill-muted-foreground text-[10px]">
          {points[0]!.week}
        </text>
        <text x={W - 8} y={H - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
          {points[last]!.week}
        </text>
      </svg>
      <Key
        items={[
          { label: curve.keys.planned, swatch: "inline-block h-[3px] w-3.5 bg-primary" },
          { label: curve.keys.actual, swatch: "inline-block h-[3px] w-3.5 bg-emerald-700" },
          ...(curve.budget ? [{ label: curve.keys.budget, swatch: "inline-block h-[3px] w-3.5 bg-red-700" }] : []),
          ...(curve.forecast !== null ? [{ label: curve.keys.forecast, swatch: "inline-block size-2 rounded-full bg-amber-500" }] : []),
        ]}
      />
    </figure>
  );
}

/** Requested and ordered added up week by week against the budget, with the need-by window of the requests as a band. */
function PurchaseChart({ model }: { model: PurchaseModel }) {
  const curve = model.curve;
  const points = curve.points;
  if (!points.length) return <p className="text-sm text-muted-foreground">{curve.empty}</p>;
  const left = 44;
  // The band of need-by dates may lie past the last request: the drawing runs to whichever is later.
  const firstWeek = points[0]!.week,
    lastWeek = [points.at(-1)!.week, curve.window?.to ?? "", curve.today].sort().at(-1)!;
  const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  const extent = Math.max(1, dayOf(lastWeek) - dayOf(firstWeek));
  const x = (iso: string) => left + ((Math.min(Math.max(dayOf(iso), dayOf(firstWeek)), dayOf(lastWeek)) - dayOf(firstWeek)) / extent) * (W - left - 8);
  const top = Math.max(1, curve.budget ?? 0, ...points.map((point) => Math.max(point.requested, point.ordered)));
  const y = (value: number) => H - BOTTOM - (value / top) * (H - BOTTOM - 8);
  const path = (pick: (point: (typeof points)[number]) => number) => points.map((point, index) => `${index ? "L" : "M"}${x(point.week).toFixed(1)},${y(pick(point)).toFixed(1)}`).join(" ");
  return (
    <figure className="m-0 grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={curve.title} className="block h-auto w-full">
        {curve.window ? <rect x={x(curve.window.from)} y={8} width={Math.max(2, x(curve.window.to) - x(curve.window.from))} height={H - BOTTOM - 8} className="fill-sky-100" /> : null}
        {[0, 0.5, 1].map((share) => (
          <g key={share}>
            <line x1={left} x2={W - 8} y1={y(top * share)} y2={y(top * share)} className="stroke-border" />
            <text x={left - 4} y={y(top * share) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {model.amount(top * share)}
            </text>
          </g>
        ))}
        {curve.budget ? <line x1={left} x2={W - 8} y1={y(curve.budget)} y2={y(curve.budget)} className="stroke-red-700 [stroke-dasharray:2_3]" /> : null}
        <path d={path((point) => point.requested)} className="fill-none stroke-primary [stroke-dasharray:5_3] [stroke-width:2]" />
        <path d={path((point) => point.ordered)} className="fill-none stroke-emerald-700 [stroke-width:2.5]" />
        {points.length === 1 ? <circle cx={x(points[0]!.week)} cy={y(points[0]!.requested)} r={3} className="fill-primary" /> : null}
        {points.length === 1 ? <circle cx={x(points[0]!.week)} cy={y(points[0]!.ordered)} r={3} className="fill-emerald-700" /> : null}
        <text x={left} y={H - 4} className="fill-muted-foreground text-[10px]">
          {firstWeek}
        </text>
        <text x={W - 8} y={H - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
          {lastWeek}
        </text>
      </svg>
      <Key
        items={[
          { label: curve.keys.requested, swatch: "inline-block h-[3px] w-3.5 bg-primary" },
          { label: curve.keys.ordered, swatch: "inline-block h-[3px] w-3.5 bg-emerald-700" },
          ...(curve.budget ? [{ label: curve.keys.budget, swatch: "inline-block h-[3px] w-3.5 bg-red-700" }] : []),
          ...(curve.window ? [{ label: curve.keys.window, swatch: "inline-block h-2 w-3.5 bg-sky-100" }] : []),
        ]}
      />
    </figure>
  );
}

function Box({ title, guide, children }: { title: string; guide?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3 py-4" data-guide={guide}>
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 px-4">{children}</CardContent>
    </Card>
  );
}

export function ProjectCostView(props: ProjectCostViewProps) {
  const view = props.views.value;
  return (
    <TomasUi className="project-cost-view">
      <div className="grid gap-3">
        <div data-guide="cost.views">
          <Segmented label={props.views.label} options={props.views.options} value={view} onChange={props.views.onChange} />
        </div>
        {/* Four figures, each opening its view. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] overflow-hidden rounded-md border bg-card" data-guide="cost.cells">
          {props.cells.map((cell) => (
            <button
              key={cell.key}
              type="button"
              aria-pressed={view === cell.view}
              onClick={() => props.views.onChange(cell.view)}
              className="grid content-start gap-0.5 border-r px-4 py-3 text-left transition-colors last:border-r-0 hover:bg-muted/60 aria-pressed:bg-primary/10 aria-pressed:shadow-[inset_0_-2px_0_var(--primary)]"
            >
              <span className="text-xs text-muted-foreground">{cell.label}</span>
              <strong className={`font-mono text-lg font-semibold tabular-nums ${cell.tone ? TONE_TEXT[cell.tone] : "text-foreground"}`}>{cell.value}</strong>
              <small className="text-xs text-muted-foreground">{cell.note}</small>
            </button>
          ))}
        </div>
        {view === "overview" ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Box title={props.curve.title}>
              <HoursCurve curve={props.curve} />
            </Box>
            <Box title={props.disciplines.title}>
              <KitTable table={props.disciplines.table} />
              <p className="text-xs text-muted-foreground">{props.disciplines.unit}</p>
            </Box>
          </div>
        ) : null}
        {view === "tasks" ? (
          <div className="rounded-md border bg-card px-2">
            <KitTable table={props.tasks} />
          </div>
        ) : null}
        {view === "people" ? (
          <div className="rounded-md border bg-card px-2">
            <KitTable table={props.people} />
          </div>
        ) : null}
        {view === "bought" && props.bought ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Box title={props.bought.curve.title} guide="cost.purchaseCurve">
              <PurchaseChart model={props.bought} />
            </Box>
            <Box title={props.bought.categories.title}>
              {props.bought.categories.split.length ? (
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={props.bought.categories.splitLabel}>
                  {props.bought.categories.split.map((part) => (
                    <i key={part.key} className={`block h-full ${fillOf(part.category)}`} style={{ width: `${part.share * 100}%` }} title={part.title} />
                  ))}
                </div>
              ) : null}
              <KitTable table={props.bought.categories.table} />
            </Box>
          </div>
        ) : null}
      </div>
    </TomasUi>
  );
}
