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
