import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

/** Screen modules that load on first visit (app/system/production/LazyScreens.tsx). */
const LAZY = [
  "InquiryScreens", "ResourcePlanningScreen", "ProjectTimelineScreen", "ReportScreens", "EstimateScreens",
  "MaterialScreens", "KnowledgeScreens", "ModuleTemplateScreens", "LaborPackageMaster", "ScheduleTemplateMaster",
  "PerformanceScreen", "SiteVisitScreens", "TeamActivityScreen",
];
/** The first-load graph: the shell and what Dashboard and My Work import statically. */
const EAGER = [
  "ProductionApp.tsx", "production/CoreScreens.tsx", "production/PlanningPricingScreens.tsx", "production/CrmScreens.tsx",
  "production/SigningScreens.tsx", "production/AdminAnalyticsScreens.tsx", "production/ExecutiveDashboard.tsx",
  "production/ResourceTaskWorkspace.tsx", "production/ProfileScreen.tsx", "production/SupportScreens.tsx",
  "production/EmployeeManualScreen.tsx",
];

test("screens off the landing path load on first visit and stay out of the eager graph", async () => {
  const lazy = await source("app/system/production/LazyScreens.tsx");
  assert.match(lazy, /import dynamic, \{ type DynamicOptionsLoadingProps \} from "next\/dynamic"/);
  // Without a loading component vinext installs no error boundary, and a failed chunk blanks the app.
  assert.match(lazy, /const screen = \{ loading: ScreenLoading \}/);
  assert.match(lazy, /window\.location\.reload\(\)/);
  assert.doesNotMatch(lazy, /\bssr:\s*false\s*[,}]/, "ssr:false shows the loading state on every mount");
  assert.doesNotMatch(lazy, /from "\.\/[A-Z]/, "LazyScreens must not import a screen statically");
  for (const name of LAZY) assert.ok(lazy.includes(`import("./${name}")`), name);

  for (const file of EAGER) {
    const text = await source(`app/system/${file}`);
    for (const name of LAZY) {
      assert.doesNotMatch(text, new RegExp(`from ["'](?:\\./|\\./production/)${name}["']`), `${file} statically imports ${name}`);
    }
  }
  const shell = await source("app/system/ProductionApp.tsx");
  assert.match(shell, /from "\.\/production\/LazyScreens"/);
  assert.match(shell, /from "\.\/production\/CoreScreens"/);
  assert.match(shell, /from "\.\/production\/PlanningPricingScreens"/);
});

test("a lazy screen's error panel tells a missing chunk from a crash", async () => {
  const lazy = await source("app/system/production/LazyScreens.tsx");
  // A crash gets a retry with its own message; only a missing module or CSS asks for a reload.
  assert.match(lazy, /const CHUNK_FAILURE = \/dynamically imported module\|Importing a module script failed\|Unable to preload CSS/);
  assert.match(lazy, /if \(error && !CHUNK_FAILURE\.test\(error\.message\)\)/);
  assert.match(lazy, /onClick=\{\(\) => retry\?\.\(\)\}/);
});

test("a component shared by two lazy screens imports the stylesheet it renders with", async () => {
  // KPI & Growth renders the Team Activity summary row; with separate chunks the row's CSS
  // must come with the component, not with Team Activity.
  const summary = await source("app/system/production/ActivityKpiSummary.tsx");
  assert.match(summary, /import "\.\/team-activity\.css";/);
  assert.match(summary, /className="activity-inline"/);
});
