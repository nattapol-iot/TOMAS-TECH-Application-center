/*
 * The project page's Cost tab (task doc 6.1): the team's man-days over time. Planned is each own-staff row's man-days
 * spread evenly over its working days (weekends and company holidays skipped), actual is the hours people confirmed,
 * both added up week by week from the first week either has. Budget and the forecast at completion come with the
 * project's labor figures (project-cost.ts). Hours and man-days only; the money stays where the access allows it.
 */

export type CurveRow = { planStart: string | null; planFinish: string | null; plannedManDays: number };
export type CurvePoint = { week: string; plannedManDays: number; actualManDays: number };

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const weekday = (day: number) => new Date(day * DAY_MS).getUTCDay();
/** The Monday of a day's week, as a day number. */
const mondayOf = (day: number) => day - ((weekday(day) + 6) % 7);
const round2 = (value: number) => Math.round(value * 100) / 100;
/** The longest curve drawn: three years of weeks. */
const MAX_WEEKS = 160;

/**
 * today: hours dated after it (a mistyped day) are left out, so one stray date cannot push the project's weeks out of
 * the drawn window. A row with no dates is left out of the curve; the labor figures beside it still count it.
 */
export function hoursCurve(rows: readonly CurveRow[], actual: readonly { date: string; hours: number }[], holidays: ReadonlySet<string>, hoursPerManDay: number, today?: string): CurvePoint[] {
  const planned = new Map<number, number>();
  for (const row of rows) {
    if (!row.planStart || !row.planFinish || row.plannedManDays <= 0) continue;
    const from = dayNumber(row.planStart),
      to = dayNumber(row.planFinish);
    const days: number[] = [];
    // Longer than three years, or ending before it starts: the whole row goes on its first day.
    if (to >= from && to - from <= 3 * 366) for (let day = from; day <= to; day++) if (weekday(day) !== 0 && weekday(day) !== 6 && !holidays.has(isoOf(day))) days.push(day);
    // A row on days that are all off still counts, on its first day.
    const spread = days.length ? days : [from];
    for (const day of spread) planned.set(mondayOf(day), (planned.get(mondayOf(day)) ?? 0) + row.plannedManDays / spread.length);
  }
  const done = new Map<number, number>();
  for (const entry of actual) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || (today && entry.date > today)) continue;
    const week = mondayOf(dayNumber(entry.date));
    done.set(week, (done.get(week) ?? 0) + entry.hours / hoursPerManDay);
  }
  const weeks = [...planned.keys(), ...done.keys()];
  if (!weeks.length) return [];
  const first = Math.min(...weeks),
    last = Math.max(...weeks),
    // The latest weeks are drawn; earlier ones still count in the totals the curve starts from.
    shownFrom = Math.max(first, last - (MAX_WEEKS - 1) * 7);
  const points: CurvePoint[] = [];
  let plannedSum = 0,
    actualSum = 0;
  for (let week = first; week <= last; week += 7) {
    plannedSum += planned.get(week) ?? 0;
    actualSum += done.get(week) ?? 0;
    if (week >= shownFrom) points.push({ week: isoOf(week), plannedManDays: round2(plannedSum), actualManDays: round2(actualSum) });
  }
  return points;
}

/** One purchase request line: when it was requested, when its order was seen (null: not ordered), its category and amount. */
export type PurchaseLine = { requestedOn: string; orderedOn: string | null; neededBy: string | null; category: string; amount: number };
export type PurchasePoint = { week: string; requested: number; ordered: number };
export type PurchaseCategory = { category: string; budget: number | null; requested: number; ordered: number };

/**
 * Task doc 6.2: bought cost over time, requested by the request's date and ordered by its order's date (the date the app
 * first saw it, owner decision 5), added up week by week; the need-by dates of the requests as the buying window; and
 * the split by the estimate's category (01-05 hardware, 07 outsource; "" for a line typed with no estimate line).
 */
export function purchaseCurve(lines: readonly PurchaseLine[], budgets: ReadonlyMap<string, number> | null, today: string) {
  const requested = new Map<number, number>(),
    ordered = new Map<number, number>();
  const categories = new Map<string, PurchaseCategory>();
  const category = (code: string) => {
    const found = categories.get(code);
    if (found) return found;
    // A category the estimate gave no bought budget (a line typed on the request) has none, rather than a budget of 0.
    const fresh = { category: code, budget: budgets?.has(code) ? budgets.get(code)! : null, requested: 0, ordered: 0 };
    categories.set(code, fresh);
    return fresh;
  };
  for (const [code] of budgets ?? []) category(code);
  const needed: string[] = [];
  for (const line of lines) {
    const amount = Number.isFinite(line.amount) ? line.amount : 0;
    category(line.category).requested += amount;
    if (/^\d{4}-\d{2}-\d{2}$/.test(line.requestedOn) && line.requestedOn <= today) {
      const week = mondayOf(dayNumber(line.requestedOn));
      requested.set(week, (requested.get(week) ?? 0) + amount);
    }
    if (line.orderedOn && /^\d{4}-\d{2}-\d{2}$/.test(line.orderedOn)) {
      category(line.category).ordered += amount;
      if (line.orderedOn <= today) {
        const week = mondayOf(dayNumber(line.orderedOn));
        ordered.set(week, (ordered.get(week) ?? 0) + amount);
      }
    }
    if (line.neededBy && /^\d{4}-\d{2}-\d{2}$/.test(line.neededBy)) needed.push(line.neededBy);
  }
  const weeks = [...requested.keys(), ...ordered.keys()];
  const points: PurchasePoint[] = [];
  if (weeks.length) {
    const first = Math.min(...weeks),
      // The totals run on to this week, so the lines reach today.
      last = Math.max(...weeks, mondayOf(dayNumber(today))),
      shownFrom = Math.max(first, last - (MAX_WEEKS - 1) * 7);
    let requestedSum = 0,
      orderedSum = 0;
    for (let week = first; week <= last; week += 7) {
      requestedSum += requested.get(week) ?? 0;
      orderedSum += ordered.get(week) ?? 0;
      if (week >= shownFrom) points.push({ week: isoOf(week), requested: round2(requestedSum), ordered: round2(orderedSum) });
    }
  }
  needed.sort();
  return {
    curve: points,
    window: needed.length ? { from: needed[0]!, to: needed.at(-1)! } : null,
    categories: [...categories.values()]
      .map((item) => ({ ...item, requested: round2(item.requested), ordered: round2(item.ordered), budget: item.budget === null ? null : round2(item.budget) }))
      .sort((left, right) => (left.category || "zz").localeCompare(right.category || "zz")),
  };
}
