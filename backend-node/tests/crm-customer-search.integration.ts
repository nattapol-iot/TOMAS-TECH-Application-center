import assert from "node:assert/strict";
import test from "node:test";
import sql from "mssql";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createTeamTestAccessCode } from "../src/auth.js";

// Opt-in, read-only regression against a populated TeamTest database.
// Uses the normal connection/signing environment and an authorized test actor.
test("Customer 360 search preserves results and responds within one second", {
  skip: process.env.CRM_SEARCH_SQL_TEST !== "1",
}, async () => {
  const config = loadConfig();
  assert.equal(config.database.readOnly, true);
  assert.equal(config.database.runMigrations, false);
  assert.equal(config.auth.mode, "TeamTest");
  const email = process.env.CRM_SEARCH_TEST_EMAIL;
  assert.ok(email, "CRM_SEARCH_TEST_EMAIL must identify an authorized CRM reader");
  const signingKey = config.auth.teamTestSigningKey;
  assert.ok(signingKey, "TeamTest signing configuration is required");
  const { app, database } = await buildApp(config);
  try {
    await app.ready();
    const headers = {
      host: "localhost",
      "x-team-test-email": email,
      "x-team-test-code": createTeamTestAccessCode(signingKey, email),
    };
    // Establish the connection/authentication before measuring search latency.
    assert.equal((await app.inject({ url: "/api/v1/crm/customers", headers })).statusCode, 200);
    for (const search of ["keyence", "meiji", "Shintaro", "unlikely-customer-6ed762", ""]) {
      const reference = (await database.query<{ id: number | string }>(`
        SELECT c.id FROM dbo.customers c WHERE c.deleted_at IS NULL
        AND (@search=N'' OR c.name LIKE @search OR c.code LIKE @search
          OR EXISTS(SELECT 1 FROM dbo.customer_site_contacts co
            JOIN dbo.customer_sites s ON s.id=co.site_id
            WHERE s.customer_id=c.id AND co.name LIKE @search))
        ORDER BY c.name,c.id`, q => q.input("search", sql.NVarChar(400), search ? `%${search}%` : ""))).recordset;
      for (const page of reference.length > 1 ? [1, 2] : [1]) {
        const started = performance.now();
        const response = await app.inject({
          url: `/api/v1/crm/customers?${new URLSearchParams({ search, page: String(page), pageSize: "1" })}`,
          headers,
        });
        const elapsed = performance.now() - started;
        assert.equal(response.statusCode, 200);
        const result = response.json();
        assert.equal(result.total, reference.length);
        assert.deepEqual(result.items.map((row: { id: number }) => row.id), reference.slice(page - 1, page).map(row => Number(row.id)));
        assert.ok(elapsed < 1000, `${search || "unfiltered"}, page ${page}: ${Math.round(elapsed)} ms exceeds 1000 ms`);
      }
    }
  } finally {
    await app.close();
  }
});
