import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "../src/db.js";
import { workingCalendarHolidays } from "../src/master-data/calendar.js";
import { createMasterDataClient, MasterDataError, type MasterDataClient } from "../src/master-data/client.js";
import { thbRateOn } from "../src/master-data/exchange-rates.js";
import { createHolidaySync } from "../src/master-data/holiday-sync.js";
import { createOwnRecordReader, readEntryDate } from "../src/master-data/own-record.js";
import type { TokenSource } from "../src/tmt-id/token-vault.js";

const settings = { masterDataUrl: "https://master.test/", masterDataApiKey: "key" } as Parameters<typeof createMasterDataClient>[0];

test("the working calendar keeps company-wide and Bangkok days off, one per date, Bangkok's name first", () => {
  const holidays = workingCalendarHolidays([
    { holiday_date: "2026-04-13", holiday_name: "Songkran", holiday_name_th: "สงกรานต์", holiday_type: "NATIONAL", division_id: null, branch_code: null },
    { holiday_date: "2026-04-13", holiday_name: "Songkran BKK", holiday_type: "COMPANY", branch_code: "BKK" },
    { holiday_date: "2026-05-01", holiday_name: "Labour Day", holiday_type: "COMPANY" },
    { holiday_date: "2026-05-02", holiday_name: "Saturday off", holiday_type: "SPECIAL" },
    { holiday_date: "2026-06-01", holiday_name: "Vietnam only", holiday_type: "NATIONAL", branch_code: "VN" },
    { holiday_date: "2026-06-02", holiday_name: "One division", holiday_type: "COMPANY", division_id: 2 },
    { holiday_date: "2026-06-03", holiday_name: "Bank", holiday_type: "BANK" },
    { holiday_date: "2026-06-06", holiday_name: "Weekly", holiday_type: "WEEKLY" },
    { holiday_date: "not a date", holiday_name: "Broken", holiday_type: "NATIONAL" }, null, "text",
  ]);
  assert.deepEqual(holidays, [
    { date: "2026-04-13", name: "Songkran BKK" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-02", name: "Saturday off" },
  ]);
});

test("the baht rate is the one in force on the date: latest start not after it, not yet ended", () => {
  const rows = [
    { from_currency: "USD", to_currency: "THB", rate: "35.10", effective_from: "2026-10-01", effective_to: "2026-10-31" },
    { from_currency: "USD", to_currency: "THB", rate: 34.8, effective_from: "2026-11-01", effective_to: null },
    { from_currency: "USD", to_currency: "THB", rate: 36, effective_from: "2026-12-01" },
    { from_currency: "USD", to_currency: "JPY", rate: 150, effective_from: "2026-11-01" },
    { from_currency: "JPY", to_currency: "THB", rate: 0, effective_from: "2026-11-01" },
  ];
  assert.deepEqual(thbRateOn(rows, "USD", "2026-11-21"), { currency: "USD", rate: 34.8, effectiveFrom: "2026-11-01" });
  assert.deepEqual(thbRateOn(rows, "USD", "2026-10-15"), { currency: "USD", rate: 35.1, effectiveFrom: "2026-10-01" });
  assert.equal(thbRateOn(rows, "USD", "2026-09-30"), null);
  assert.equal(thbRateOn(rows, "JPY", "2026-11-21"), null);
});

test("the start date is read only from master's own-record answer", () => {
  assert.equal(readEntryDate({ label: "iot", scopes: ["employee.self"], employee: { entry_date: "2019-04-01" } }), "2019-04-01");
  assert.equal(readEntryDate({ label: "iot", scopes: [] }), null);
  assert.equal(readEntryDate({ employee: null }), null);
  assert.equal(readEntryDate({ employee: { entry_date: "01/04/2019" } }), null);
});

test("the client sends the key and the person's token and walks every page of a list", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fake = (async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
    if (url.includes("/me")) return new Response(JSON.stringify({ employee: null }));
    return new Response(JSON.stringify({ total: 3, limit: 2, items: offset === 0 ? [1, 2] : [3] }));
  }) as unknown as typeof fetch;
  const client = createMasterDataClient(settings, fake)!;
  assert.deepEqual(await client.listAll("/api/v1/company-calendar"), [1, 2, 3]);
  await client.get("/api/v1/me", "person-token");
  assert.deepEqual(calls.map((call) => call.url), [
    "https://master.test/api/v1/company-calendar?offset=0", "https://master.test/api/v1/company-calendar?offset=2", "https://master.test/api/v1/me",
  ]);
  assert.equal(calls[0]!.headers["X-API-Key"], "key");
  assert.equal(calls[0]!.headers["X-User-Token"], undefined);
  assert.equal(calls[2]!.headers["X-User-Token"], "person-token");
  assert.equal(createMasterDataClient({ masterDataUrl: "https://master.test/" } as Parameters<typeof createMasterDataClient>[0]), null);
});

test("the own-record reader retries once with a fresh token, caches, and falls back to the last answer", async () => {
  let now = 0, issued = 0, failNext = false;
  const tokens: TokenSource = { accessToken: async () => `token-${++issued}`, dropAccess: () => {} };
  const asked: (string | undefined)[] = [];
  const client: MasterDataClient = {
    async get(_path, token) {
      asked.push(token);
      if (failNext) throw new MasterDataError(502, "down");
      if (token === "token-1") throw new MasterDataError(401, "expired");
      return { employee: { entry_date: "2019-04-01" } };
    },
    listAll: async () => [],
  };
  const errors: unknown[] = [];
  const reader = createOwnRecordReader(client, tokens, (error) => errors.push(error), () => now);
  assert.equal(await reader.entryDate("subject"), "2019-04-01");
  assert.deepEqual(asked, ["token-1", "token-2"]);
  assert.equal(await reader.entryDate("subject"), "2019-04-01");
  assert.equal(asked.length, 2);
  now = 31 * 60_000; failNext = true;
  assert.equal(await reader.entryDate("subject"), "2019-04-01");
  assert.equal(errors.length, 1);
  assert.equal(await reader.entryDate(""), null);
});

test("a request refreshes the holidays at most every five minutes and never writes from an empty calendar", async () => {
  let now = 0;
  const writes: Record<string, unknown>[] = [];
  const database = {
    async query(_text: string, bind: (request: { input: (name: string, _type: unknown, value: unknown) => unknown }) => void) {
      const inputs: Record<string, unknown> = {};
      const request = { input: (name: string, _type: unknown, value: unknown) => { inputs[name] = value; return request; } };
      bind(request);
      writes.push(inputs);
      return { recordset: [], recordsets: [], rowsAffected: [], output: {} };
    },
  } as unknown as Database;
  let calendar: unknown[] = [];
  const client: MasterDataClient = { get: async () => ({}), listAll: async () => calendar };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const sync = createHolidaySync(client, database, (error) => { throw error; }, () => now);

  sync.refresh(); await settle();
  assert.equal(writes.length, 0, "an empty calendar never writes");

  calendar = [{ holiday_date: "2026-04-13", holiday_name: "Songkran", holiday_type: "NATIONAL" }];
  now = 4 * 60_000;
  sync.refresh(); await settle();
  assert.equal(writes.length, 0, "a request within five minutes of the last sync does not sync again");

  now = 5 * 60_000;
  sync.refresh(); await settle();
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.holidays, JSON.stringify([{ date: "2026-04-13", name: "Songkran" }]));
  assert.equal(writes[0]!.years, "[2026]");
  assert.equal("actor" in writes[0]!, false, "rows from master carry no app author");
});
