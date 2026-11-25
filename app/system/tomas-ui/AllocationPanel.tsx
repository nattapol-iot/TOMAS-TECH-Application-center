"use client";
/*
 * Projects > Plan: the time of one task (owner decisions 2026-11-25, mockup board 20). It opens from a row's "Free time"
 * cell on the Sheet and shows, for each member on the row:
 * - the hours, the window and what that makes a day (hours and a share of an 8-hour day);
 * - week by week: what the task needs, their other work on every project, time away, what is free, and the shortfall;
 * - their days as bars (this task, the rest of their work, time away) against the time they have;
 * - the verdict, with the forecast against the heading's customer date;
 * - the fixes, one press each and never automatic: move the end, add a person with free time, or open the plan of other
 *   work to move it;
 * - the hours adjusted week by week instead of spread evenly.
 * Built on @tomas-tc/ui inside a TomasUi root.
 */
import {
  Badge,
  Button,
  Input,
  Notice,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@tomas-tc/ui";
import { useMemo, useState } from "react";
import { HOURS_PER_DAY, type PlanFit, type TaskFit } from "../../../lib/capacity-plan";
import { useT } from "../i18n";
import { TomasUi } from "./TomasUi";

export type AllocationFix =
  | { kind: "extend"; date: string; insideFrame: boolean }
  | { kind: "addPerson"; userId: number; name: string; freeHours: number }
  | { kind: "moveOther"; reference: string; title: string; hours: number; href: string | null };

export type AllocationPanelProps = {
  open: boolean;
  onClose: () => void;
  wbs: string;
  name: string;
  projectNo: string;
  heading: { name: string; start: string | null; end: string | null } | null;
  start: string;
  end: string;
  planHours: number;
  actualHours: number;
  fit: PlanFit;
  names: ReadonlyMap<number, string>;
  fixes: readonly AllocationFix[];
  /** The weeks of the whole window with their hours, where the week-by-week hours start from. */
  weeks: readonly { start: string; workDays: number; hours: number }[];
  canPlan: boolean;
  busy: boolean;
  formatDate: (iso: string) => string;
  onFix: (fix: AllocationFix) => void;
  /** Saves hours week by week (the Monday of each week and its hours); resolves when the plan was read again. */
  onSaveWeeks: (weeks: { start: string; hours: number }[]) => Promise<void>;
};

const num = (value: number) => (Math.round(value * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
const fill = (text: string, values: Record<string, string | number>) => Object.entries(values).reduce((out, [key, value]) => out.split(`{${key}}`).join(String(value)), text);

/** One person's days as stacked bars: this task, their other work and time away, against the time they have. */
function DayBars({ fit, formatDate }: { fit: TaskFit; formatDate: (iso: string) => string }) {
  const t = useT();
  const scale = Math.max(HOURS_PER_DAY, ...fit.days.map((day) => day.need + day.otherHours + day.away)) * 1.05;
  const pct = (hours: number) => `${(hours / scale) * 100}%`;
  return (
    <div className="grid gap-1" data-guide="plan.allocLoad">
      {fit.days.map((day) => {
        const total = day.need + day.otherHours;
        const over = total > day.capacity + 0.01;
        return (
          <div key={day.date} className="grid grid-cols-[6rem_1fr_5.5rem] items-center gap-2 text-xs">
            <span className="whitespace-nowrap text-muted-foreground">{formatDate(day.date)}</span>
            <span
              className="relative flex h-2.5 overflow-hidden rounded-sm bg-muted"
              title={day.other.map((row) => `${[row.reference, row.title].filter(Boolean).join(" · ") || t("Alloc.other")} ${num(row.hours)}`).join("\n")}
            >
              <span className="h-full bg-primary" style={{ width: pct(day.need) }} />
              <span className="h-full bg-chart-2" style={{ width: pct(day.otherHours) }} />
              <span className="h-full bg-amber-300" style={{ width: pct(day.away) }} />
              <span className="absolute inset-y-0 border-l border-dashed border-foreground/70" style={{ left: pct(day.capacity + day.away) }} />
            </span>
            <span className={`text-right font-mono tabular-nums ${over ? "font-semibold text-destructive" : ""}`}>
              {num(total)}
              {day.away > 0 ? <small className="ml-1 font-sans text-amber-700">+{num(day.away)}</small> : null}
            </span>
          </div>
        );
      })}
      <p className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm bg-primary" />
          {t("Alloc.thisTask")}
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm bg-chart-2" />
          {t("Alloc.other")}
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm bg-amber-300" />
          {t("Alloc.away")}
        </span>
        <span>{t("Alloc.loadKey")}</span>
      </p>
    </div>
  );
}

function WeekTable({ fit, formatDate }: { fit: TaskFit; formatDate: (iso: string) => string }) {
  const t = useT();
  const total = fit.weeks.reduce((sum, week) => ({ need: sum.need + week.need, other: sum.other + week.other, away: sum.away + week.away, free: sum.free + week.free }), {
    need: 0,
    other: 0,
    away: 0,
    free: 0,
  });
  return (
    <Table data-guide="plan.allocWeeks">
      <TableHeader>
        <TableRow>
          <TableHead>{t("Alloc.week")}</TableHead>
          <TableHead className="text-right">{t("Alloc.need")}</TableHead>
          <TableHead className="text-right">{t("Alloc.other")}</TableHead>
          <TableHead className="text-right">{t("Alloc.away")}</TableHead>
          <TableHead className="text-right">{t("Alloc.free")}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {fit.weeks.map((week) => (
          <TableRow key={week.start}>
            <TableCell>
              {formatDate(week.start)} <small className="text-muted-foreground">· {fill(t("Alloc.days"), { count: week.workDays })}</small>
            </TableCell>
            <TableCell className="text-right font-mono">{num(week.need)}</TableCell>
            <TableCell className="text-right font-mono">{num(week.other)}</TableCell>
            <TableCell className="text-right font-mono">{week.away ? num(week.away) : "–"}</TableCell>
            <TableCell className="text-right font-mono">{num(week.free)}</TableCell>
            <TableCell className={`text-right ${week.short > 0 ? "font-semibold text-destructive" : "text-emerald-700"}`}>
              {week.short > 0 ? fill(t("Alloc.short"), { h: num(week.short) }) : t("Alloc.enough")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>{t("Alloc.total")}</TableCell>
          <TableCell className="text-right font-mono">{num(total.need)}</TableCell>
          <TableCell className="text-right font-mono">{num(total.other)}</TableCell>
          <TableCell className="text-right font-mono">{total.away ? num(total.away) : "–"}</TableCell>
          <TableCell className="text-right font-mono">{num(total.free)}</TableCell>
          <TableCell className={`text-right ${fit.shortHours > 0 ? "font-semibold text-destructive" : "text-emerald-700"}`}>
            {fit.shortHours > 0 ? fill(t("Alloc.short"), { h: num(fit.shortHours) }) : t("Alloc.enough")}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

/** Hours week by week: one box a week of the window, starting from what the even spread gives. */
function WeeklyHours({ weeks, busy, onSave }: { weeks: AllocationPanelProps["weeks"]; busy: boolean; onSave: (weeks: { start: string; hours: number }[]) => Promise<void> }) {
  const t = useT();
  const [hours, setHours] = useState<Record<string, string>>(() => Object.fromEntries(weeks.map((week) => [week.start, num(week.hours)])));
  const parsed = weeks.map((week) => ({ start: week.start, hours: Math.max(0, Number(hours[week.start] ?? 0) || 0) }));
  const total = parsed.reduce((sum, week) => sum + week.hours, 0);
  return (
    <div className="grid gap-2" data-guide="plan.allocWeekly">
      <p className="text-xs text-muted-foreground">{t("Alloc.weeklyHint")}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
        {weeks.map((week) => (
          <label key={week.start} className="grid gap-1 text-xs">
            <span className="text-muted-foreground">{week.start.slice(8, 10) + "/" + week.start.slice(5, 7)}</span>
            <Input inputMode="decimal" value={hours[week.start] ?? ""} onChange={(event) => setHours((current) => ({ ...current, [week.start]: event.target.value }))} />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">
          {t("Alloc.total")} <b className="font-mono">{num(total)}</b> h
        </span>
        <Button size="sm" disabled={busy || total <= 0} onClick={() => void onSave(parsed)}>
          {t("Alloc.saveWeekly")}
        </Button>
      </div>
    </div>
  );
}

export function AllocationPanel(props: AllocationPanelProps) {
  const t = useT();
  const { fit, heading, formatDate } = props;
  const [weekly, setWeekly] = useState(false);
  const frameEnd = heading?.end ?? null;
  const verdict = useMemo(() => {
    const forecast = fit.forecastFinish;
    const lines = [forecast ? fill(t("Alloc.forecast"), { date: formatDate(forecast) }) : t("Alloc.forecastNone")];
    if (heading && frameEnd && forecast) lines.push(fill(t(forecast > frameEnd ? "Alloc.pastFrame" : "Alloc.insideFrame"), { heading: heading.name, date: formatDate(frameEnd) }));
    return lines.join(" ");
  }, [fit.forecastFinish, heading, frameEnd, formatDate, t]);
  return (
    <TomasUi>
      <Sheet open={props.open} onOpenChange={(open) => (open ? undefined : props.onClose())}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-xl" data-guide="plan.alloc">
          <SheetHeader className="border-b">
            <SheetDescription>
              {props.projectNo}
              {heading ? ` · ${heading.name}` : ""}
              {heading?.start && heading.end ? (
                <Badge variant="outline" className="ml-2">
                  {fill(t("Alloc.frame"), { from: formatDate(heading.start), to: formatDate(heading.end) })}
                </Badge>
              ) : null}
            </SheetDescription>
            <SheetTitle>
              <span className="mr-1 font-mono text-muted-foreground">{props.wbs}</span>
              {props.name}
            </SheetTitle>
          </SheetHeader>
          <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("Alloc.member")}</dt>
                <dd>{fit.people.map((person) => props.names.get(person.userId) ?? `#${person.userId}`).join(", ")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Alloc.hours")}</dt>
                <dd className="font-mono">{fill(t("Alloc.hoursValue"), { plan: num(props.planHours), done: num(props.actualHours) })}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">{t("Alloc.window")}</dt>
                <dd>
                  {formatDate(props.start)} – {formatDate(props.end)} <small className="text-muted-foreground">· {fill(t("Alloc.workDays"), { count: fit.people[0]?.workDays ?? 0 })}</small>
                </dd>
              </div>
            </dl>
            <p className="text-sm" data-guide="plan.allocPerDay">
              <b className="mr-1 text-2xl font-semibold">{num(fit.perDayHours)}</b>
              {t("Alloc.perDay")} <span className="text-muted-foreground">{fill(t("Alloc.ofDay"), { pct: fit.percentOfDay })}</span>
            </p>
            {fit.people.map((person) => (
              <section key={person.userId} className="grid gap-3">
                {fit.people.length > 1 ? <h3 className="text-sm font-semibold">{props.names.get(person.userId) ?? `#${person.userId}`}</h3> : null}
                <WeekTable fit={person} formatDate={formatDate} />
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">{fill(t("Alloc.load"), { name: props.names.get(person.userId) ?? `#${person.userId}` })}</p>
                  <DayBars fit={person} formatDate={formatDate} />
                </div>
              </section>
            ))}
            <Notice
              tone={fit.status === "short" ? "error" : "info"}
              message={`${fit.status === "short" ? fill(t("Alloc.shortTitle"), { h: num(fit.shortHours) }) : t("Alloc.fitsTitle")} ${verdict}`}
            />
            {fit.status === "short" ? (
              <section className="grid gap-2" data-guide="plan.allocFixes">
                <h3 className="text-sm font-semibold">
                  {t("Alloc.fixes")} <small className="font-normal text-muted-foreground">{t("Alloc.fixesHint")}</small>
                </h3>
                {props.fixes.length ? (
                  props.fixes.map((fix, index) => (
                    <Button
                      key={`${fix.kind}-${index}`}
                      variant={index === 0 ? "default" : "outline"}
                      className="h-auto justify-start gap-3 py-2 text-left whitespace-normal"
                      disabled={props.busy || (!props.canPlan && fix.kind !== "moveOther") || (fix.kind === "moveOther" && !fix.href)}
                      title={!props.canPlan && fix.kind !== "moveOther" ? t("Alloc.readOnly") : undefined}
                      onClick={() => props.onFix(fix)}
                    >
                      <span className="grid gap-0.5">
                        <b>
                          {fix.kind === "extend"
                            ? fill(t("Alloc.extend"), { date: formatDate(fix.date) })
                            : fix.kind === "addPerson"
                              ? fill(t("Alloc.addPerson"), { name: fix.name })
                              : fill(t("Alloc.moveOther"), { work: [fix.reference, fix.title].filter(Boolean).join(" · ") })}
                        </b>
                        <span className="text-xs opacity-80">
                          {fix.kind === "extend"
                            ? t(fix.insideFrame ? "Alloc.extendInside" : "Alloc.extendPast")
                            : fix.kind === "addPerson"
                              ? fill(t("Alloc.addPersonHint"), { h: num(fix.freeHours) })
                              : fill(t("Alloc.moveOtherHint"), { h: num(fix.hours) })}
                        </span>
                      </span>
                      {index === 0 ? (
                        <Badge variant="secondary" className="ml-auto">
                          {t("Alloc.recommended")}
                        </Badge>
                      ) : null}
                    </Button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{t("Alloc.noFix")}</p>
                )}
              </section>
            ) : null}
            <Separator />
            {props.canPlan && fit.people.length === 1 && props.weeks.length > 1 ? (
              <section className="grid gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t(weekly ? "Alloc.weekly" : "Alloc.even")}</h3>
                  <Button variant="outline" size="sm" data-guide="plan.allocWeeklyToggle" onClick={() => setWeekly((value) => !value)}>
                    {t(weekly ? "Alloc.even" : "Alloc.weekly")}
                  </Button>
                </div>
                {weekly ? <WeeklyHours weeks={props.weeks} busy={props.busy} onSave={props.onSaveWeeks} /> : null}
              </section>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("Alloc.confirmedNote")}</p>
          </div>
          <SheetFooter className="border-t">
            <Button variant="outline" onClick={props.onClose}>
              {t("Alloc.close")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </TomasUi>
  );
}
