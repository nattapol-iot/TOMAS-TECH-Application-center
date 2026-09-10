import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../backend-node/src/routes/master.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../database/migrations/001_core.sql", import.meta.url), "utf8");

test("engineering rate creation captures inserted rows through OUTPUT INTO because the table has an enabled trigger", () => {
  assert.match(schema, /CREATE OR ALTER TRIGGER dbo\.tr_engineering_rates_no_overlap[\s\S]*?ON dbo\.engineering_rates/);
  const createRoute = route.match(/app\.post\("\/api\/v1\/master\/engineering-rates"[\s\S]*?return reply\.status\(201\)/)?.[0] ?? "";
  assert.match(createRoute, /DECLARE @created TABLE/);
  assert.match(createRoute, /OUTPUT inserted\.id,inserted\.level,inserted\.department,inserted\.row_version\s+INTO @created/);
  assert.match(createRoute, /SELECT id,level,department,row_version FROM @created/);
  assert.doesNotMatch(createRoute, /OUTPUT inserted\.id,inserted\.level,inserted\.department,inserted\.row_version\s*\n\s*VALUES/);
});
