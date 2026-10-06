import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PORTFOLIO_SORT,
  EMPTY_PORTFOLIO_FILTERS,
  PORTFOLIO_HEALTH_ORDER,
  effectiveOption,
  effectiveStatusFilter,
  formatSlip,
  isProgressStale,
  matchesPortfolioChip,
  matchesPortfolioSearch,
  nextPortfolioSort,
  parsePortfolioSort,
  portfolioSortStorageKey,
  portfolioView,
  rowMenuPlacement,
  sortPortfolio,
} from "../lib/project-portfolio.ts";

const NOW = Date.parse("2026-10-06T05:00:00Z");
const DAY = 86_400_000;

function row(overrides) {
  return {
    id: 1, number: "P-25-001", name: "Line 3 IoT", customerName: "ACME", endUserName: "Plant A",
    purchaseOrderNumber: "PO-1", managerName: "Somchai", managerId: 10, leadEngineerId: 20, team: "IoT",
    status: "Installation", health: "On Track", targetDelivery: "2026-10-12", slipDays: 0, progress: 40,
    lastProgressAt: new Date(NOW - DAY).toISOString(), taskCount: 5, overdueCount: 0, blockedCount: 0, pendingRequests: 0,
    ...overrides,
  };
}

test("the default sort is health worst-first, then the largest slip, then the project number", () => {
  assert.deepEqual(DEFAULT_PORTFOLIO_SORT, { key: "health", direction: "asc" });
  assert.deepEqual(PORTFOLIO_HEALTH_ORDER, ["Delayed", "At Risk", "No plan", "On Track", "On Hold", "Completed"]);
  const rows = [
    row({ id: 1, number: "P-6", health: "Completed" }),
    row({ id: 2, number: "P-5", health: "On Track" }),
    row({ id: 3, number: "P-4", health: "On Hold" }),
    row({ id: 4, number: "P-3", health: "No plan" }),
    row({ id: 5, number: "P-2", health: "At Risk" }),
    row({ id: 6, number: "P-1", health: "Delayed", slipDays: 2 }),
    row({ id: 7, number: "P-7", health: "Delayed", slipDays: 9 }),
    row({ id: 8, number: "P-8", health: "Delayed", slipDays: null }),
    row({ id: 9, number: "P-0", health: "Delayed", slipDays: 2 }),
  ];
  assert.deepEqual(sortPortfolio(rows).map((item) => item.number), ["P-7", "P-0", "P-1", "P-8", "P-2", "P-3", "P-5", "P-4", "P-6"]);
  // A row from an API that sent no health ranks as "No plan".
  assert.deepEqual(sortPortfolio([row({ id: 1, number: "A", health: "On Track" }), row({ id: 2, number: "B", health: undefined })]).map((item) => item.number), ["B", "A"]);
  // Descending health puts the finished work first and keeps the same tie-breakers.
  assert.deepEqual(sortPortfolio(rows.slice(0, 2), { key: "health", direction: "desc" }).map((item) => item.number), ["P-6", "P-5"]);
});

test("slip sorts both ways with projects that have no forecast last", () => {
  const rows = [row({ id: 1, number: "A", slipDays: 3 }), row({ id: 2, number: "B", slipDays: null }), row({ id: 3, number: "C", slipDays: -4 }), row({ id: 4, number: "D", slipDays: 12 })];
  assert.deepEqual(sortPortfolio(rows, { key: "slip", direction: "asc" }).map((item) => item.number), ["C", "A", "D", "B"]);
  assert.deepEqual(sortPortfolio(rows, { key: "slip", direction: "desc" }).map((item) => item.number), ["D", "A", "C", "B"]);
});

test("the other sortable columns order by their own value", () => {
  const rows = [
    row({ id: 1, number: "P-10", managerName: "Wichai", targetDelivery: "2026-12-01", progress: 80, lastProgressAt: null }),
    row({ id: 2, number: "P-9", managerName: "Anan", targetDelivery: null, progress: 10, lastProgressAt: "2026-10-01T03:00:00Z" }),
    row({ id: 3, number: "P-11", managerName: "Malee", targetDelivery: "2026-10-20", progress: 55, lastProgressAt: "2026-10-05T03:00:00Z" }),
  ];
  const order = (sort) => sortPortfolio(rows, sort).map((item) => item.number);
  assert.deepEqual(order({ key: "project", direction: "asc" }), ["P-9", "P-10", "P-11"]);
  assert.deepEqual(order({ key: "pm", direction: "asc" }), ["P-9", "P-11", "P-10"]);
  assert.deepEqual(order({ key: "target", direction: "asc" }), ["P-11", "P-10", "P-9"]);
  assert.deepEqual(order({ key: "progress", direction: "desc" }), ["P-10", "P-11", "P-9"]);
  assert.deepEqual(order({ key: "lastUpdate", direction: "desc" }), ["P-11", "P-9", "P-10"]);
});

test("clicking a header toggles its direction and a new column starts ascending", () => {
  assert.deepEqual(nextPortfolioSort(DEFAULT_PORTFOLIO_SORT, "health"), { key: "health", direction: "desc" });
  assert.deepEqual(nextPortfolioSort({ key: "health", direction: "desc" }, "health"), { key: "health", direction: "asc" });
  assert.deepEqual(nextPortfolioSort({ key: "health", direction: "desc" }, "slip"), { key: "slip", direction: "asc" });
});

test("a remembered sort survives a reload and damaged storage falls back to the default", () => {
  assert.equal(portfolioSortStorageKey(42), "tomas-tech-project-portfolio-sort:42");
  assert.deepEqual(parsePortfolioSort('{"key":"slip","direction":"desc"}'), { key: "slip", direction: "desc" });
  for (const raw of [null, "", "not-json", "[]", "null", '{"key":"margin","direction":"asc"}', '{"key":"slip","direction":"up"}']) {
    assert.deepEqual(parsePortfolioSort(raw), DEFAULT_PORTFOLIO_SORT, String(raw));
  }
});

test("search matches every typed word across number, name, customer, end user, PO and PM", () => {
  const item = row({ number: "P-25-031", name: "Line3 IoT", customerName: "ACME Foods", endUserName: "Plant A", purchaseOrderNumber: "PO-7788", managerName: "Somchai K." });
  for (const query of ["", "  ", "p-25-031", "line3", "acme", "plant a", "7788", "somchai", "ACME   somchai", "ｐｏ-7788"]) {
    assert.equal(matchesPortfolioSearch(item, query), true, query);
  }
  for (const query of ["Bangkok", "acme bangkok", "Installation"]) assert.equal(matchesPortfolioSearch(item, query), false, query);
  assert.equal(matchesPortfolioSearch({ ...item, endUserName: null }, "acme"), true);
});

test("each attention chip has its own predicate", () => {
  assert.equal(matchesPortfolioChip(row({ overdueCount: 2 }), "overdue", NOW), true);
  assert.equal(matchesPortfolioChip(row({ overdueCount: 0 }), "overdue", NOW), false);
  assert.equal(matchesPortfolioChip(row({ blockedCount: 1 }), "blocked", NOW), true);
  assert.equal(matchesPortfolioChip(row({ blockedCount: 0 }), "blocked", NOW), false);
  assert.equal(matchesPortfolioChip(row({ pendingRequests: 1 }), "waiting", NOW), true);
  assert.equal(matchesPortfolioChip(row({ pendingRequests: 0 }), "waiting", NOW), false);
  assert.equal(matchesPortfolioChip(row({ slipDays: 4 }), "pastTarget", NOW), true);
  assert.equal(matchesPortfolioChip(row({ slipDays: 0 }), "pastTarget", NOW), false);
  assert.equal(matchesPortfolioChip(row({ slipDays: -2 }), "pastTarget", NOW), false);
  assert.equal(matchesPortfolioChip(row({ slipDays: null }), "pastTarget", NOW), false);
});

test("no update 7d+ needs tasks, an open project and no progress in the last seven days", () => {
  assert.equal(isProgressStale(row({ lastProgressAt: null }), NOW), true);
  assert.equal(isProgressStale(row({ lastProgressAt: new Date(NOW - 8 * DAY).toISOString() }), NOW), true);
  assert.equal(isProgressStale(row({ lastProgressAt: new Date(NOW - 6 * DAY).toISOString() }), NOW), false);
  assert.equal(isProgressStale(row({ lastProgressAt: null, taskCount: 0 }), NOW), false);
  assert.equal(isProgressStale(row({ lastProgressAt: null, status: "Closed" }), NOW), false);
  assert.equal(isProgressStale(row({ lastProgressAt: null, status: "On Hold" }), NOW), false);
  assert.equal(matchesPortfolioChip(row({ lastProgressAt: null }), "stale", NOW), true);
});

test("the health bar ignores its own filter and the chips ignore theirs", () => {
  const rows = [
    row({ id: 1, number: "A", health: "Delayed", overdueCount: 2, managerId: 10 }),
    row({ id: 2, number: "B", health: "Delayed", overdueCount: 0, managerId: 10 }),
    row({ id: 3, number: "C", health: "At Risk", overdueCount: 1, managerId: 10 }),
    row({ id: 4, number: "D", health: "On Track", overdueCount: 0, managerId: 11, leadEngineerId: 10 }),
    row({ id: 5, number: "E", health: "On Track", overdueCount: 3, managerId: 12, leadEngineerId: 13, team: "Electrical" }),
  ];
  const all = portfolioView(rows, EMPTY_PORTFOLIO_FILTERS, NOW);
  assert.equal(all.barTotal, 5);
  assert.deepEqual(all.healthCounts, { Delayed: 2, "At Risk": 1, "No plan": 0, "On Track": 2, "On Hold": 0, Completed: 0 });
  assert.equal(all.chipCounts.overdue, 3);

  const delayed = portfolioView(rows, { ...EMPTY_PORTFOLIO_FILTERS, health: "Delayed" }, NOW);
  assert.deepEqual(delayed.rows.map((item) => item.number), ["A", "B"]);
  assert.equal(delayed.healthCounts["On Track"], 2, "the bar still counts every health while one is picked");
  assert.equal(delayed.chipCounts.overdue, 1, "the chips count within the picked health");

  const overdue = portfolioView(rows, { ...EMPTY_PORTFOLIO_FILTERS, chip: "overdue" }, NOW);
  assert.deepEqual(overdue.rows.map((item) => item.number), ["A", "C", "E"]);
  assert.equal(overdue.barTotal, 3);
  assert.deepEqual(overdue.healthCounts, { Delayed: 1, "At Risk": 1, "No plan": 0, "On Track": 1, "On Hold": 0, Completed: 0 });
  assert.equal(overdue.chipCounts.overdue, 3, "a chip keeps its count while it is active");

  const mine = portfolioView(rows, { ...EMPTY_PORTFOLIO_FILTERS, mineUserId: 10 }, NOW);
  assert.deepEqual(mine.rows.map((item) => item.number), ["A", "B", "C", "D"], "Mine is projects I manage or lead");
  assert.deepEqual(portfolioView(rows, { ...EMPTY_PORTFOLIO_FILTERS, managerId: 12 }, NOW).rows.map((item) => item.number), ["E"]);
  assert.deepEqual(portfolioView(rows, { ...EMPTY_PORTFOLIO_FILTERS, team: "Electrical" }, NOW).rows.map((item) => item.number), ["E"]);
  assert.deepEqual(portfolioView(rows, { ...EMPTY_PORTFOLIO_FILTERS, status: "Design" }, NOW).rows, []);
  assert.deepEqual(portfolioView(rows, { ...EMPTY_PORTFOLIO_FILTERS, search: "e" }, NOW).rows.map((item) => item.number), ["A", "B", "C", "D", "E"]);
});

test("slip reads +N when late, 0 on time, -N early and nothing without a forecast", () => {
  assert.equal(formatSlip(9), "+9");
  assert.equal(formatSlip(0), "0");
  assert.equal(formatSlip(-3), "-3");
  assert.equal(formatSlip(null), null);
});

test("a PM or team the reloaded list no longer offers stops filtering", () => {
  assert.equal(effectiveOption(10, [10, 11]), 10);
  assert.equal(effectiveOption(12, [10, 11]), null, "a PM whose projects were all closed falls back to all PMs");
  assert.equal(effectiveOption(null, [10]), null);
  assert.equal(effectiveOption("IoT", ["IoT", "Electrical"]), "IoT");
  assert.equal(effectiveOption("Gone", ["IoT"]), null);
  assert.equal(effectiveOption("IoT", []), null, "nothing loaded yet means no team filter");

  // The effective value is what scopes the rows: a stale PM no longer empties the table.
  const rows = [row({ id: 1, managerId: 10 }), row({ id: 2, managerId: 11, number: "P-25-002" })];
  const managerIds = [...new Set(rows.map((item) => item.managerId))];
  const view = portfolioView(rows, { ...EMPTY_PORTFOLIO_FILTERS, managerId: effectiveOption(99, managerIds) }, NOW);
  assert.equal(view.rows.length, 2);
});

test("the status filter ignores Closed while closed projects are not loaded", () => {
  assert.equal(effectiveStatusFilter("All status", false), null);
  assert.equal(effectiveStatusFilter("All status", true), null);
  assert.equal(effectiveStatusFilter("Installation", false), "Installation");
  assert.equal(effectiveStatusFilter("Closed", true), "Closed");
  assert.equal(effectiveStatusFilter("Closed", false), null, "Closed with Show closed off would always be empty");
});

test("row menus open below their trigger, flip up when only the space above fits, and cap when neither does", () => {
  const viewport = { width: 1280, height: 800 };
  // Plenty of room below.
  assert.deepEqual(rowMenuPlacement({ top: 100, bottom: 130, right: 1200 }, viewport, 180),
    { top: 134, bottom: null, right: 80, maxHeight: null });
  // Near the bottom: 800 - 700 - 12 = 88px below, 688px above, so it opens upwards from the trigger's top.
  assert.deepEqual(rowMenuPlacement({ top: 670, bottom: 700, right: 1200 }, viewport, 180),
    { top: null, bottom: 134, right: 80, maxHeight: null });
  // A short window where neither side fits: the roomier side, with a scrolling cap.
  const short = { width: 1280, height: 300 };
  assert.deepEqual(rowMenuPlacement({ top: 100, bottom: 130, right: 1200 }, short, 400),
    { top: 134, bottom: null, right: 80, maxHeight: 158 });
  assert.deepEqual(rowMenuPlacement({ top: 200, bottom: 230, right: 1200 }, short, 400),
    { top: null, bottom: 104, right: 80, maxHeight: 188 });
  // A trigger hard against the right edge keeps the menu inside the margin.
  assert.equal(rowMenuPlacement({ top: 100, bottom: 130, right: 1279 }, viewport, 100).right, 8);
});
