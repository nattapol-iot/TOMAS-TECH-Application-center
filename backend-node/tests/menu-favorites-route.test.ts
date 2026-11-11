import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import { registerErrorHandler } from "../src/errors.js";
import { MENU_FAVORITE_LIMIT, MENU_FAVORITES_REPLACE, MENU_VIEWS, menuFavoritesInput, registerBootstrapRoutes } from "../src/routes/bootstrap.js";
import type { CurrentUserService } from "../src/users.js";

const users = { async required() { return { id: 7 }; } } as unknown as CurrentUserService;

async function put(t: import("node:test").TestContext, payload: unknown) {
  const captured: { statement: string; user: unknown; views: unknown }[] = [];
  const transactions = { count: 0 };
  t.mock.method(sql.Request.prototype, "query", async function (this: { parameters: Record<string, { value: unknown }> }, statement: string) {
    captured.push({ statement, user: this.parameters.user?.value, views: this.parameters.views?.value });
    return { recordset: (JSON.parse(String(this.parameters.views?.value)) as string[]).map((view_key) => ({ view_key })) };
  });
  const database = {
    async query() { throw new Error("Unexpected database access"); },
    async transaction(action: (tx: object) => Promise<unknown>) { transactions.count++; return action({}); },
  } as unknown as Database;
  const app = Fastify();
  registerErrorHandler(app);
  registerBootstrapRoutes(app, database, users);
  try {
    return { response: await app.inject({ method: "PUT", url: "/api/v1/me/menu-favorites", payload: payload as object }), captured, transactions };
  } finally {
    await app.close();
    t.mock.restoreAll();
  }
}

test("PUT /me/menu-favorites replaces the caller's list in one transaction and returns it in order", async (t) => {
  const { response, captured, transactions } = await put(t, { views: ["estimates", "resources", "crm-customers"] });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { views: ["estimates", "resources", "crm-customers"] });
  assert.equal(transactions.count, 1);
  assert.equal(captured.length, 1);
  assert.equal(captured[0]!.user, 7);
  assert.equal(captured[0]!.views, '["estimates","resources","crm-customers"]');
  const statement = captured[0]!.statement.replace(/\s+/g, " ");
  // The old rows go under a range lock, the new ones take their place in the list as their position.
  assert.match(statement, /DELETE FROM dbo\.user_menu_favorites WITH \(UPDLOCK, SERIALIZABLE\) WHERE user_id=@user;/);
  assert.match(statement, /INSERT INTO dbo\.user_menu_favorites\(user_id, view_key, position\) SELECT @user, item\.\[value\], CONVERT\(int, item\.\[key\]\) FROM OPENJSON\(@views\) item;/);
  assert.match(statement, /SELECT view_key FROM dbo\.user_menu_favorites WHERE user_id=@user ORDER BY position;/);
  assert.equal(captured[0]!.statement, MENU_FAVORITES_REPLACE);
});

test("an empty list clears the favourites", async (t) => {
  const { response, transactions } = await put(t, { views: [] });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { views: [] });
  assert.equal(transactions.count, 1);
});

test("a list that is too long, repeats an entry, names an unknown view or is not a list is refused before any database access", async (t) => {
  const nine = MENU_VIEWS.slice(0, MENU_FAVORITE_LIMIT + 1);
  assert.equal(nine.length, 9);
  for (const payload of [
    { views: nine },
    { views: ["estimates", "estimates"] },
    { views: ["estimates", "profile"] },
    { views: ["crm-pipeline"] },
    { views: ["estimates", 5] },
    { views: "estimates" },
    {},
  ]) {
    const { response, captured, transactions } = await put(t, payload);
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
    assert.equal(response.json().code, "menu_favorites_validation");
    assert.equal(captured.length, 0);
    assert.equal(transactions.count, 0);
  }
});

test("eight entries are accepted, and every menu view is a plain name that fits the column", () => {
  const eight = MENU_VIEWS.slice(0, MENU_FAVORITE_LIMIT);
  assert.deepEqual(menuFavoritesInput({ views: eight }), eight);
  assert.equal(new Set(MENU_VIEWS).size, MENU_VIEWS.length);
  for (const view of MENU_VIEWS) assert.match(view, /^[a-z][a-z-]{1,63}$/);
});
