import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

/** The presence endpoint's module allowlist. */
async function acceptedModules() {
  const route = await source("backend-node/src/routes/activity.ts");
  const allowlist = /const modules=new Set\(\[([\s\S]*?)\]\);/.exec(route);
  assert.ok(allowlist, "presence module allowlist not found");
  return new Set([...allowlist[1].matchAll(/'([a-z-]+)'/g)].map((match) => match[1]));
}

/** Every .ts/.tsx file under app/, relative to the repo root. */
async function appFiles(dir = "app") {
  const files = [];
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await appFiles(path));
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

/** The argument text of each `useActivitySubView(...)` call (not its definition). */
function subViewArguments(text) {
  const result = [];
  for (const match of text.matchAll(/(?<!function )useActivitySubView\(/g)) {
    let depth = 1, at = match.index + match[0].length;
    const start = at;
    for (; at < text.length && depth > 0; at++) depth += text[at] === "(" ? 1 : text[at] === ")" ? -1 : 0;
    result.push(text.slice(start, at - 1));
  }
  return result;
}

/** Tab ids of a screen, from its `tabs={[{ id: "x", ... }]}` lists. */
const tabIds = (text) => [...text.matchAll(/tabs=\{\[([\s\S]*?)\]\}/g)].flatMap((list) => [...list[1].matchAll(/id:\s*["']([a-z-]+)["']/g)].map((id) => id[1]));

/** Sub-view keys a call can report: string literals, and `prefix-${tab}` templates expanded over the file's tab ids. */
function subViewKeys(argument, file, text) {
  const keys = [...argument.matchAll(/["']([a-z-]+)["']/g)].map((match) => match[1]);
  for (const template of argument.matchAll(/`([a-z-]*)\$\{[^}]+\}`/g)) {
    const ids = tabIds(text);
    assert.ok(ids.length, `${file}: ${template[0]} needs the screen's tab ids to resolve`);
    keys.push(...ids.map((id) => template[1] + id));
  }
  assert.ok(keys.length || /^\s*null\s*$/.test(argument), `${file}: useActivitySubView(${argument}) has no key the test can read`);
  return keys;
}

/** String literals of a TypeScript union type alias, e.g. `type View = "a" | "b";`. */
function unionMembers(text, alias) {
  const declaration = new RegExp(`type ${alias} =([\\s\\S]*?);`).exec(text);
  assert.ok(declaration, `type ${alias} not found`);
  return [...declaration[1].matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
}

test("every navigable view is a module the presence endpoint accepts", async () => {
  const [shell, crm, route] = await Promise.all([
    source("app/system/ProductionApp.tsx"),
    source("app/system/production/CrmScreens.tsx"),
    source("backend-node/src/routes/activity.ts"),
  ]);
  // The shell reports its current view as the presence module on every navigation.
  assert.match(shell, /useActivityPresence\(bootstrap\?\.user\.id, view,/);
  const views = [...unionMembers(shell, "View"), ...unionMembers(crm, "CrmView")];
  const allowlist = /const modules=new Set\(\[([\s\S]*?)\]\);/.exec(route);
  assert.ok(allowlist, "presence module allowlist not found");
  const accepted = new Set([...allowlist[1].matchAll(/'([a-z-]+)'/g)].map((match) => match[1]));
  // A view missing here answers 400 and the client drops the error, so that page never counts.
  assert.deepEqual(views.filter((view) => !accepted.has(view)), []);
});

test("every sub-view a screen reports is accepted, named after its parent view and labelled", async () => {
  const [accepted, shell, labels] = await Promise.all([acceptedModules(), source("app/system/ProductionApp.tsx"), source("app/system/activity-client.ts")]);
  const views = new Set(unionMembers(shell, "View"));
  const used = [];
  for (const file of await appFiles()) {
    const text = await source(file);
    for (const argument of subViewArguments(text)) used.push(...subViewKeys(argument, file, text).map((key) => ({ key, file })));
  }
  // A key missing from the allowlist answers 400, so that tab would silently never count.
  assert.deepEqual(used.filter(({ key }) => !accepted.has(key)), []);
  // The approved Projects and Resource Plan tabs; Resource Plan keys follow its real tab ids (tasks, gantt, workload, items).
  const subViews = [...accepted].filter((key) => !views.has(key) && /^(projects|resources)-/.test(key));
  assert.deepEqual(subViews.sort(), ["projects-portfolio", "projects-punchlist", "projects-schedule", "resources-gantt", "resources-items", "resources-tasks", "resources-workload"]);
  const resourceTabs = tabIds(await source("app/system/production/ResourcePlanningScreen.tsx"));
  assert.deepEqual(subViews.filter((key) => key.startsWith("resources-")).map((key) => key.slice("resources-".length)).sort(), [...resourceTabs].sort());
  for (const key of subViews) {
    const parent = key.slice(0, key.indexOf("-"));
    // useActivityPresence reports a sub-view only while its parent view is open.
    assert.ok(views.has(parent), `${key}: parent view ${parent} is not a navigable view`);
    // Team Activity shows a readable label and rolls the key up to its parent.
    assert.match(labels, new RegExp(`'${key}':'[^']+'`), `${key} has no activityModuleLabels entry`);
    assert.match(labels, new RegExp(`'${key}':\\{parent:'${parent}',label:'[^']+'\\}`), `${key} does not roll up to ${parent}`);
  }
});

/**
 * Load use-activity-presence.ts with a fake React. Effects queue during "render" and flush children first, as
 * React does, so a screen's sub-view effect runs before the shell's presence effect in the same commit. The shell's
 * presence effect re-runs only when its deps change, after its previous cleanup, and timers are fake.
 */
async function presenceHarness() {
  const code = ts.transpileModule(await source("app/system/use-activity-presence.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const writes = [], queue = [], ref = { current: { at: 0, module: "", user: 0, page: "" } }, timers = new Map();
  let notifications = 0, subscribed = false, snapshot, clock = 0, nextTimer = 1, presenceDeps, presenceCleanup;
  const react = {
    useRef: () => ref,
    useEffect: (effect, deps) => { queue.push({ effect, deps }); },
    useSyncExternalStore(subscribe, getSnapshot) {
      if (!subscribed) { subscribe(() => { notifications++; }); subscribed = true; }
      snapshot = getSnapshot();
      return snapshot;
    },
  };
  const setTimeout = (callback, ms) => { const id = nextTimer++; timers.set(id, { callback, at: clock + ms }); return id; };
  const clearTimeout = (id) => { timers.delete(id); };
  const listeners = new Map();
  const target = { addEventListener(type, listener) { listeners.set(type, listener); }, removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); } };
  const document = { ...target, visibilityState: "visible" };
  const exports = {};
  new Function("require", "module", "exports", "document", "window", "setTimeout", "clearTimeout", code)((name) => {
    if (name === "react") return react;
    // A page open reads "presence:<module>"; a ping that must never log a page reads "ping:<module>".
    if (name === "./activity-client") return { activityWrite: async (path, body) => { writes.push(`${body.page === true ? path : body.page === false ? "ping" : "unflagged"}:${body.module}`); } };
    throw new Error(`Unexpected import ${name}`);
  }, { exports }, exports, document, target, setTimeout, clearTimeout);
  /** Run queued effects child-first and return their cleanups in render order. */
  const flush = () => queue.splice(0).map(({ effect }, index) => ({ index, effect })).reverse().map(({ index, effect }) => ({ index, cleanup: effect() })).sort((a, b) => a.index - b.index).map(({ cleanup }) => cleanup);
  return {
    hooks: exports, writes, ref, document, notifications: () => notifications, renderedSnapshot: () => snapshot, pendingTimers: () => timers.size,
    /** Dispatch a window/document event to the presence listener. */
    fire(type, event = { isTrusted: true }) { listeners.get(type)?.(event); },
    /** Let in-flight writes finish, which releases the hook's one-request-at-a-time guard. */
    settle: () => new Promise((resolve) => setImmediate(resolve)),
    /** The shell renders, then (optionally) a screen with a sub-view; one commit. Returns the screen's unmount. */
    commit(module, key) {
      exports.useActivityPresence(7, module, true);
      const presence = queue.pop();
      if (key !== undefined) exports.useActivitySubView(key);
      // React skips an effect whose deps did not change; otherwise the old run cleans up before any new effect runs.
      const rerun = !presenceDeps || presence.deps.some((dep, index) => !Object.is(dep, presenceDeps[index]));
      if (rerun) { presenceCleanup?.(); presenceDeps = presence.deps; }
      const cleanups = flush();
      if (rerun) presenceCleanup = presence.effect();
      return cleanups[0];
    },
    mount(key) { exports.useActivitySubView(key); return flush()[0]; },
    /** Advance the fake clock, firing due timers in order. */
    advance(ms) {
      clock += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) if (timer.at <= clock && timers.delete(id)) timer.callback();
    },
  };
}

test("a sub-view reports inside its own module only", async () => {
  const { hooks } = await presenceHarness();
  assert.equal(hooks.activityPresenceModule("projects", "projects-schedule"), "projects-schedule");
  assert.equal(hooks.activityPresenceModule("resources", "projects-schedule"), "resources");
  assert.equal(hooks.activityPresenceModule("projects", "projectsx"), "projects");
  assert.equal(hooks.activityPresenceModule("projects", null), "projects");
});

test("a screen's sub-view in the same commit is the first page reported, not its parent view", async () => {
  const h = await presenceHarness();
  // The shell renders "resources" before the screen's effect has set its tab; the presence effect reads the live value.
  const unmount = h.commit("resources", "resources-tasks");
  assert.equal(h.renderedSnapshot(), null);
  assert.deepEqual(h.writes, ["presence:resources-tasks"]);
  // The store change re-renders the shell; the same page inside 60 s does not record again.
  h.commit("resources");
  assert.equal(h.renderedSnapshot(), "resources-tasks");
  assert.deepEqual(h.writes, ["presence:resources-tasks"]);
  unmount();
  h.commit("resources");
  // The bare view waits for a sub-view that might still be loading, then reports itself.
  assert.deepEqual(h.writes, ["presence:resources-tasks"]);
  h.advance(h.hooks.activitySubViewWaitMs);
  assert.deepEqual(h.writes, ["presence:resources-tasks", "presence:resources"]);
});

test("switching tabs re-records as navigation and only the owning screen clears the sub-view", async () => {
  const h = await presenceHarness();
  h.commit("projects");
  assert.deepEqual(h.writes, []);
  h.advance(h.hooks.activitySubViewWaitMs);
  assert.deepEqual(h.writes, ["presence:projects"]);
  const unmountPortfolio = h.mount("projects-portfolio");
  assert.ok(h.notifications() > 0, "subscribers hear about a new sub-view");
  h.commit("projects");
  // The first sub-view after the fallback reported the bare view continues that page open; it is not a second one.
  assert.deepEqual(h.writes, ["presence:projects"]);
  assert.equal(h.ref.current.page, "projects-portfolio");
  // The next tab takes over before the old one unmounts; the old cleanup must not wipe the new owner.
  // A tab change is a navigation: it records at once even inside the 60 s interaction window.
  const unmountSchedule = h.mount("projects-schedule");
  unmountPortfolio();
  h.commit("projects");
  assert.equal(h.renderedSnapshot(), "projects-schedule");
  assert.deepEqual(h.writes.slice(1), ["presence:projects-schedule"]);
  // A null key (a screen rendered outside its tab) changes nothing.
  assert.equal(h.mount(null), undefined);
  h.commit("projects");
  assert.equal(h.writes.length, 2);
  unmountSchedule();
  h.commit("projects");
  assert.equal(h.renderedSnapshot(), null);
  h.advance(h.hooks.activitySubViewWaitMs);
  assert.deepEqual(h.writes.slice(2), ["presence:projects"]);
  // A sub-view of another view never leaks into this one.
  h.mount("resources-gantt");
  h.commit("projects");
  assert.equal(h.writes.length, 3);
  h.commit("resources");
  assert.deepEqual(h.writes.slice(3), ["presence:resources-gantt"]);
});

test("only views whose screens report sub-views hold a page open, and only while no sub-view is known", async () => {
  const [{ hooks }, accepted, shell, labels] = await Promise.all([presenceHarness(), acceptedModules(), source("app/system/ProductionApp.tsx"), source("app/system/activity-client.ts")]);
  const wait = hooks.activitySubViewWaitMs;
  assert.ok(wait > 0 && wait <= 5_000, "the fallback stays short enough that a bare view is still reported");
  assert.equal(hooks.activityPageOpenDelay("projects", "projects"), wait);
  assert.equal(hooks.activityPageOpenDelay("resources", "resources"), wait);
  assert.equal(hooks.activityPageOpenDelay("projects", "projects-schedule"), 0);
  assert.equal(hooks.activityPageOpenDelay("resources", "resources-gantt"), 0);
  assert.equal(hooks.activityPageOpenDelay("dashboard", "dashboard"), 0);
  assert.equal(hooks.activityPageOpenDelay("labor", "labor"), 0, "labor-packages is its own view, not a sub-view of labor");
  // The parents are exactly the views that own "<view>-<tab>" sub-view keys in the allowlist and in Team Activity's roll-up.
  const views = new Set(unionMembers(shell, "View"));
  const parentOf = (key) => key.slice(0, key.indexOf("-"));
  const allowlistParents = new Set([...accepted].filter((key) => !views.has(key) && views.has(parentOf(key))).map(parentOf));
  const labelParents = new Set([...labels.matchAll(/\{parent:'([a-z-]+)'/g)].map((match) => match[1]));
  assert.deepEqual([...hooks.activitySubViewParents].sort(), [...allowlistParents].sort());
  assert.deepEqual([...hooks.activitySubViewParents].sort(), [...labelParents].sort());
});

test("a lazily loaded screen logs one page open: its sub-view, not the parent view first", async () => {
  const h = await presenceHarness();
  // The shell switches to Resource Plan while the screen chunk is still loading.
  h.commit("resources");
  assert.deepEqual(h.writes, []);
  assert.equal(h.pendingTimers(), 1);
  h.advance(h.hooks.activitySubViewWaitMs - 1);
  assert.deepEqual(h.writes, []);
  // The chunk mounts and registers its tab; the store change re-renders the shell.
  h.mount("resources-tasks");
  h.commit("resources");
  assert.deepEqual(h.writes, ["presence:resources-tasks"]);
  assert.equal(h.pendingTimers(), 0, "the bare-view fallback is cancelled");
  h.advance(h.hooks.activitySubViewWaitMs);
  assert.deepEqual(h.writes, ["presence:resources-tasks"]);
});

test("a chunk slower than the fallback still logs one page open, and later tab changes still count", async () => {
  const h = await presenceHarness();
  h.commit("resources");
  h.advance(h.hooks.activitySubViewWaitMs);
  assert.deepEqual(h.writes, ["presence:resources"]);
  // The screen arrives after the fallback reported the bare view: same page open, no second PAGE row.
  h.mount("resources-tasks");
  h.commit("resources");
  assert.deepEqual(h.writes, ["presence:resources"]);
  assert.equal(h.ref.current.page, "resources-tasks");
  // A real tab change afterwards is a new page open.
  h.mount("resources-gantt");
  h.commit("resources");
  assert.deepEqual(h.writes, ["presence:resources", "presence:resources-gantt"]);
});

test("a bare view with sub-views is reported after the fallback when no sub-view registers", async () => {
  const h = await presenceHarness();
  h.commit("projects");
  h.advance(h.hooks.activitySubViewWaitMs - 1);
  assert.deepEqual(h.writes, []);
  h.advance(1);
  assert.deepEqual(h.writes, ["presence:projects"]);
  // A view without sub-views is a page open at once.
  h.commit("dashboard");
  assert.deepEqual(h.writes, ["presence:projects", "presence:dashboard"]);
  assert.equal(h.pendingTimers(), 0);
});

test("interaction and visibility pings never claim a page open; only a real open does", async () => {
  const h = await presenceHarness();
  h.commit("dashboard");
  assert.deepEqual(h.writes, ["presence:dashboard"]);
  // Inside the 60 s throttle an interaction sends nothing; once it has passed, it is a plain ping.
  await h.settle();
  h.fire("pointerdown");
  assert.equal(h.writes.length, 1);
  h.ref.current.at = 0;
  h.fire("pointerdown", { isTrusted: false });
  assert.equal(h.writes.length, 1, "synthetic events earn nothing");
  h.fire("keydown");
  assert.deepEqual(h.writes.slice(1), ["ping:dashboard"]);
  await h.settle();
  h.ref.current.at = 0;
  h.fire("visibilitychange");
  assert.deepEqual(h.writes.slice(2), ["ping:dashboard"]);
  // Pings while a bare view waits for its sub-view stay pings, and the page open still follows.
  h.commit("projects");
  await h.settle();
  h.ref.current.at = 0;
  h.fire("scroll");
  assert.deepEqual(h.writes.slice(3), ["ping:projects"]);
  h.advance(h.hooks.activitySubViewWaitMs);
  assert.deepEqual(h.writes.slice(4), ["presence:projects"]);
});

test("a page opened while the window is hidden is reported as a page open when it becomes visible", async () => {
  const h = await presenceHarness();
  h.document.visibilityState = "hidden";
  h.commit("dashboard");
  assert.deepEqual(h.writes, []);
  h.document.visibilityState = "visible";
  h.fire("visibilitychange");
  assert.deepEqual(h.writes, ["presence:dashboard"]);
  // Becoming visible again later is only a ping.
  await h.settle();
  h.ref.current.at = 0;
  h.fire("visibilitychange");
  assert.deepEqual(h.writes, ["presence:dashboard", "ping:dashboard"]);
});
