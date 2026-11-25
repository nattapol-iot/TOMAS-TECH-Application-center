import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { byBudgetRisk, factText, thingsToKnow } from "../lib/ceo-summary.ts";

const labor = (budget, planned, forecast, actual = 0) => ({ budgetManDays: budget, plannedManDays: planned, forecastManDays: forecast, actualManDays: actual, disciplines: [] });
const cost = (change = {}) => ({
  number: "PJ1",
  hardware: { budget: 100, requested: 50, approved: 0, ordered: 0 },
  outsource: { budget: 100, requested: 0, approved: 0, ordered: 0 },
  labor: labor(40, 30, 30),
  ...change,
});

test("things to know are written from the figures: late, follow-ups, a budget over or near, people, the next milestone (task doc 6.3)", () => {
  const facts = thingsToKnow(
    cost({ hardware: { budget: 100, requested: 130, approved: 0, ordered: 0 }, outsource: { budget: 100, requested: 95, approved: 0, ordered: 0 }, labor: labor(40, 44, 48) }),
    {
      status: "Development",
      slipDays: 3,
      followUps: 4,
      nextMilestone: { name: "FAT", date: "2027-01-20" },
    },
  );
  assert.deepEqual(
    facts.map((fact) => [fact.key, fact.tone, fact.params]),
    [
      ["CEO.late", "red", { days: 3 }],
      ["CEO.follow", "amber", { count: 4 }],
      ["CEO.hardware.over", "red", { percent: 130 }],
      ["CEO.outsource.near", "amber", { percent: 95 }],
      ["CEO.people.over", "red", { days: 8, percent: 120 }],
      ["CEO.milestone", "muted", { name: "FAT", date: "2027-01-20" }],
    ],
  );
  assert.equal(
    factText(facts[4], (key) => (key === "CEO.people.over" ? "People {days} MD over ({percent}%)" : key)),
    "People 8 MD over (120%)",
  );
});

test("a closed project says nothing about lateness; a project on track says so; no people budget is said plainly", () => {
  assert.deepEqual(thingsToKnow(cost(), { status: "Closed", slipDays: 9, followUps: 2 }), []);
  assert.deepEqual(
    thingsToKnow(cost(), { status: "Design", health: "On Track" }).map((fact) => fact.key),
    ["CEO.onTrack"],
  );
  assert.deepEqual(
    thingsToKnow(cost({ labor: labor(null, 12, 12) })).map((fact) => [fact.key, fact.params]),
    [["CEO.people.noBudget", { planned: 12 }]],
  );
});

test("projects most at risk on their budget come first, then the latest", () => {
  const over = cost({ number: "PJ3", hardware: { budget: 10, requested: 20, approved: 0, ordered: 0 } });
  const near = cost({ number: "PJ2", labor: labor(40, 39, 39) });
  const fine = cost({ number: "PJ1" });
  const lateFine = cost({ number: "PJ4" });
  const slips = { PJ1: 0, PJ4: 12 };
  assert.deepEqual(
    byBudgetRisk([fine, near, lateFine, over], (item) => slips[item.number]).map((item) => item.number),
    ["PJ3", "PJ2", "PJ4", "PJ1"],
  );
});

test("a people budget of 0 reads as no budget, never an endless percentage; the plan counts when it runs past the forecast", () => {
  assert.deepEqual(
    thingsToKnow(cost({ labor: labor(0, 12, 12) })).map((fact) => fact.key),
    ["CEO.people.noBudget"],
  );
  // Planned 50 against 40, forecast 30: the plan is what is over, as the budget state says.
  assert.deepEqual(
    thingsToKnow(cost({ labor: labor(40, 50, 30) })).map((fact) => [fact.key, fact.params]),
    [["CEO.people.over", { days: 10, percent: 125 }]],
  );
});

test("the CEO summary is drawn on @tomas-tc/ui and still prints as it is on screen (task doc 6.3, 6.4)", async () => {
  const read = async (path) => (await readFile(new URL(`../${path}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const screen = await read("app/system/production/CeoSummaryScreen.tsx");
  const kit = await read("app/system/tomas-ui/CeoSummary.tsx");
  const print = await read("app/system/production/ceo-summary.css");
  assert.match(screen, /import \{ CeoSummary, type CeoCard \} from "\.\.\/tomas-ui\/CeoSummary";/);
  // No old app part inside the kit's root.
  assert.doesNotMatch(screen, /HealthBadge|PgSelect|from "\.\.\/ui"/);
  for (const mark of ["ceo.summary", "ceo.downloads", "ceo.focus", "ceo.note"]) assert.ok(kit.includes(`data-guide="${mark}"`), mark);
  // The print rules hide the buttons and keep each project on one sheet through the kit's ceo-* hooks.
  for (const hook of ["ceo-summary", "ceo-actions", "ceo-back", "ceo-note", "ceo-item", "ceo-list"]) {
    assert.ok(print.includes(`.${hook}`), `print rule for .${hook}`);
    assert.match(kit, new RegExp('className=["{`][^"`]*\\b' + hook + "\\b"), `kit carries .${hook}`);
  }
  // The PM's note: saved by the screen, the editor closes only once it is saved.
  assert.match(kit, /if \(await onSaveNote\(draft\)\) setEditing\(false\);/);
  assert.match(screen, /canEditNote: canWrite && \(item\.managerId === bootstrap\.user\.id \|\| elevated\)/);
});
