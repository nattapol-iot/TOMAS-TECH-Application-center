import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const adminRoute = read("../backend-node/src/routes/admin.ts");
const masterRoute = read("../backend-node/src/routes/master.ts");
const masterScreen = read("../app/system/production/CoreScreens.tsx");
const ratesScreen = read("../app/system/production/AdminAnalyticsScreens.tsx");
const estimateScreen = read("../app/system/production/EstimateScreens.tsx");

test("engineering rate master is hidden and API-protected below management level", () => {
  const listRoute = adminRoute.match(/app\.get\("\/api\/v1\/admin\/engineering-rates"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  const createRoute = masterRoute.match(/app\.post\("\/api\/v1\/master\/engineering-rates"[\s\S]*?\n  \}\);/)?.[0] ?? "";

  assert.match(listRoute, /demandPermission\(request, "master\.read"\)/);
  assert.match(listRoute, /canViewEngineeringRates\(actor\.role\)/);
  assert.match(createRoute, /demandPermission\(request, "master\.write"\)/);
  assert.match(createRoute, /canManageEngineeringRates\(actor\.role\)/);
  assert.match(masterScreen, /canViewRates = canViewEngineeringRates\(bootstrap\.user\.role\)/);
  assert.match(masterScreen, /canViewRates \? \[\{ id: "rates"/);
  assert.match(ratesScreen, /canRead = bootstrap\.permissions\.includes\("master\.read"\) && canViewEngineeringRates\(bootstrap\.user\.role\)/);
  assert.match(ratesScreen, /canWrite = bootstrap\.permissions\.includes\("master\.write"\) && canManageEngineeringRates\(bootstrap\.user\.role\)/);
});

test("estimate editing uses a limited rate-option endpoint instead of the management master endpoint", () => {
  const optionRoute = adminRoute.match(/app\.get\("\/api\/v1\/estimates\/engineering-rate-options"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  assert.match(optionRoute, /demandPermission\(request, "estimate\.write"\)/);
  assert.doesNotMatch(optionRoute, /engineering_hourly|installation_hourly|created_by_name|row_version/);
  assert.match(estimateScreen, /\/api\/v1\/estimates\/engineering-rate-options/);
  assert.doesNotMatch(estimateScreen.match(/const loadRates = async \(\) => \{[\s\S]*?\n    \};/)?.[0] ?? "", /\/api\/v1\/admin\/engineering-rates/);
});
