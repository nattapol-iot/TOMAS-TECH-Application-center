import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { supportLabel } from "../app/system/support-copy.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("the Support Center stylesheet reaches only the Support Center and defines every --pg-* value it uses", async () => {
  const css = withoutComments(await read("app/system/production/support-center.css"));
  // @keyframes steps (from/to) are not selectors of the page.
  const rules = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const heads = [...rules.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim()).filter((head) => !head.startsWith("@"));
  assert.ok(heads.length > 50, "the stylesheet was read");
  for (const head of heads) {
    for (const selector of head.split(",").map((part) => part.trim())) assert.match(selector, /^\.support-center(?:$|[.\s:])/, selector);
  }
  const defined = new Set([...css.matchAll(/(--pg-[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  for (const [, name] of css.matchAll(/var\((--pg-[a-z0-9-]+)/g)) assert.ok(defined.has(name), `${name} is used but defined nowhere`);
  assert.doesNotMatch(css, /var\(--pg-fg\)|box-shadow:\s*var\(--pg-ring\)/, "the shared names are --pg-foreground and --pg-focus");
});

test("every status has a Pegasus tone and every tone has a badge rule", async () => {
  const [screen, css] = await Promise.all([read("app/system/production/SupportScreens.tsx"), read("app/system/production/support-center.css")]);
  const tones = /const STATUS_TONE: Record<string, string> = \{([^}]+)\}/.exec(screen)?.[1];
  assert.ok(tones, "STATUS_TONE is declared");
  const map = Object.fromEntries([...tones.matchAll(/(\w+): "(\w+)"/g)].map((match) => [match[1], match[2]]));
  for (const status of ["New", "Acknowledged", "InProgress", "WaitingForReporter", "Resolved", "Closed", "Cancelled"]) {
    assert.ok(map[status], `${status} has a tone`);
    assert.match(css, new RegExp(`\\.support-center \\.sp-badge\\.${map[status]} \\{`), `${status} -> ${map[status]} has a rule`);
  }
  // B.1: cancelled is grey, done is green; one colour keeps one meaning.
  assert.equal(map.Cancelled, "neutral");
  assert.equal(map.Closed, "success");
});

test("every label on the Support Center screens exists in Thai, English and Japanese", async () => {
  const screen = await read("app/system/production/SupportScreens.tsx");
  // A capitalised string literal is a copy key, except these few that are values, not words on the screen.
  const notCopy = new Set(["POST", "Escape"]);
  const keys = new Set([...screen.matchAll(/"([A-Z][A-Za-z0-9 &.?'/-]*)"/g)].map((match) => match[1]).filter((key) => !notCopy.has(key)));
  assert.ok(keys.size > 80, `labels were found (${keys.size})`);
  // supportLabel falls back to the key itself, so a key with no entry reads the same in all three languages.
  const missing = [...keys].filter((key) => ["TH", "EN", "JP"].every((lang) => supportLabel(key, lang) === key));
  assert.deepEqual(missing, [], "keys missing from support-copy.ts");
});

test("the list's summary bar filters on status groups that the API accepts and counts", async () => {
  const [screen, routes, client] = await Promise.all([read("app/system/production/SupportScreens.tsx"), read("backend-node/src/routes/support.ts"), read("app/system/support-client.ts")]);
  // The summary bar sends a comma list; the API checks each status and splits the list in SQL.
  assert.match(screen, /statuses\.join\(","\)/);
  assert.match(routes, /String\(query\.status\?\?''\)\.split\(','\)[\s\S]{0,120}oneOf\(s,'Status',SUPPORT_STATUSES\)/);
  assert.match(routes, /t\.status IN\(SELECT value FROM STRING_SPLIT\(@statuses,N','\)\)/);
  // The counts cover the other filters only, so each cell shows what pressing it would list.
  assert.match(routes, /SELECT t\.status,COUNT_BIG\(\*\) n FROM dbo\.support_tickets t \$\{scoped\} GROUP BY t\.status/);
  assert.match(routes, /total:Number\([^)]*\)\[0\]\?\.total\?\?0\),statusCounts\}/);
  assert.match(client, /statusCounts\?:Record<string,number>/);
});

test("the ticket page keeps one primary action and puts the rest under More actions", async () => {
  const screen = await read("app/system/production/SupportScreens.tsx");
  assert.equal((screen.match(/data-guide="support\.primary"/g) ?? []).length, 1);
  assert.match(screen, /<summary className="btn default">\{s\("More actions"\)\}/);
  // A reporter's own steps are named (Confirm close, Reopen, Withdraw) instead of a status picker; withdraw is destructive.
  assert.match(screen, /to === "Closed" \? "Confirm close" : to === "Cancelled" \? "Withdraw" : "Reopen"/);
  assert.match(screen, /danger: to === "Cancelled"/);
  // The top bar's Copy link already copies #support/<id>; the screen no longer has its own.
  assert.doesNotMatch(screen, /Shareable link/);
});
