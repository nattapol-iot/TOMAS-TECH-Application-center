import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { DASHBOARD_ROLES } from "../backend-node/src/executive-dashboard-model.ts";
import * as rememberedView from "../lib/remembered-view.ts";

const source = readFileSync(new URL("../app/system/ProductionApp.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const bootstrap = {
  user: { id: 7, name: "Restore Tester", department: "QA", role: "User" },
  permissions: [],
  counts: { inquiries: 0, estimates: 0, activeProjects: 0, approvals: 0 },
  team: [],
};

const loginCopy = {
  identityBadge: "ID",
  identityPoint: "Identity",
  heading: "Sign in",
  intro: "Sign in",
  submitLabel: "Continue",
  lockedTitle: "Locked",
  accessTitle: "Access",
  accessBody: "Access",
};

function createHarness({
  mode,
  configured = true,
  restoreAccount = async () => null,
  loadTmtIdSession = async () => ({ status: "signed-out" }),
  loadBootstrap = async () => bootstrap,
  savedView = null,
  hash = "",
  storageBlocked = false,
  reactive = false,
}) {
  const states = [];
  let cursor = 0;
  let mounted = false;
  let mountEffects = [];
  let tmtLoginRedirects = 0;
  const hooks = [];
  let hookCursor = 0;
  const timers = new Map();
  const listeners = new Map();
  const history = [hash];
  let historyIndex = 0;
  const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const memo = (factory, deps) => {
    const index = hookCursor++;
    if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) hooks[index] = { deps, value: factory() };
    return hooks[index].value;
  };

  const react = {
    useCallback: (callback, deps) => reactive ? memo(() => callback, deps) : callback,
    useEffect(effect, deps) {
      if (reactive) {
        const index = hookCursor++;
        if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) {
          const previous = hooks[index];
          hooks[index] = { deps, cleanup: previous?.cleanup };
          mountEffects.push(() => { previous?.cleanup?.(); hooks[index].cleanup = effect(); });
        }
        return;
      }
      if (!mounted) mountEffects.push(effect);
    },
    useMemo: (factory, deps) => reactive ? memo(factory, deps) : factory(),
    useRef: (value) => reactive ? memo(() => ({ current: value }), []) : ({ current: value }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => {
        states[index] = typeof next === "function" ? next(states[index]) : next;
      }];
    },
  };

  const jsxRuntime = {
    Fragment: Symbol("Fragment"),
    jsx: (type, props, key) => ({ type, props: props ?? {}, key }),
    jsxs: (type, props, key) => ({ type, props: props ?? {}, key }),
  };
  const componentModule = new Proxy({}, {
    get: (_target, property) => property === "default" ? "MockDefaultComponent" : String(property),
  });
  const modules = {
    "../../lib/remembered-view": rememberedView,
    "../../backend-node/src/engineering-rate-access": { canViewEngineeringRates: role => DASHBOARD_ROLES.includes(role) },
    react,
    "react/jsx-runtime": jsxRuntime,
    "./auth-client": {
      IS_ENTRA_CONFIGURED: configured && mode === "entra",
      restoreAccount,
      signInWithMicrosoft: async () => {},
      signOutMicrosoft: async () => {},
    },
    "./api-client": {
      IS_API_CONFIGURED: configured,
      apiRequest: async () => [],
      loadBootstrap,
    },
    "./team-test-client": {
      IS_TEAM_TEST_MODE: mode === "team-test",
      clearTeamTestSession: () => {},
      getTeamTestSession: () => mode === "team-test" ? { email: "team@example.com" } : null,
      saveTeamTestSession: () => {},
    },
    "./tmt-id.constants": { IS_TMT_ID_MODE: mode === "tmt-id" },
    "./tmt-id-client": {
      currentAppPath: () => "/",
      loadTmtIdSession,
      redirectToTmtIdLogin: () => { tmtLoginRedirects += 1; },
      redirectToTmtIdLogout: () => {},
    },
    "./sign-in-mode.constants": { SIGN_IN_MODE: mode },
    "./production/production-login-copy": {
      PRODUCTION_LOGIN_COPY: {
        "tmt-id": loginCopy,
        "team-test": loginCopy,
        entra: loginCopy,
      },
    },
    "./Brand": { BrandLockup: "BrandLockup", BrandMark: "BrandMark" },
    "./product": { PRODUCT: { company: "Tomas Tech", name: "IoT Team", version: "test" } },
    "./i18n": {
      LANGUAGES: ["EN", "TH", "JP"],
      LanguageContext: { Provider: "LanguageProvider" },
      applyDocumentLanguage: () => {},
      translate: (text) => text,
    },
    "./support-copy": { supportLabel: (text) => text },
    "./production/EmployeeManualScreen": {
      EmployeeManualScreen: "EmployeeManualScreen",
      employeeManualLabel: () => "Employee Manual",
    },
    "./use-activity-presence": { useActivityPresence: () => {} },
    "../../backend-node/src/executive-dashboard-model": { DASHBOARD_ROLES: [] },
  };

  const moduleObject = { exports: {} };
  const localRequire = (specifier) => modules[specifier] ?? componentModule;
  new Function("require", "module", "exports", compiled)(localRequire, moduleObject, moduleObject.exports);
  const ProductionApp = moduleObject.exports.default;

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const storage = new Map();
  globalThis.window = {
    addEventListener: (name, callback) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    clearInterval: () => {},
    clearTimeout: (id) => timers.delete(id),
    confirm: () => true,
    history: {
      replaceState: (_state, _title, url) => { if (reactive) { window.location.hash = new URL(url, "https://app.test").hash; history[historyIndex] = window.location.hash; } },
      pushState: (_state, _title, url) => { if (reactive) { window.location.hash = new URL(url, "https://app.test").hash; history.splice(++historyIndex); history.push(window.location.hash); } },
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, String(value)),
    },
    sessionStorage: {
      getItem: () => { if (storageBlocked) throw new Error("Storage blocked"); return savedView; },
      setItem: () => {},
      removeItem: () => {},
    },
    location: { hash, pathname: "/", search: "" },
    removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
    scrollTo: () => {},
    setInterval: () => 1,
    setTimeout: (callback, delay) => { const id = Symbol(); if (reactive && delay === 0) timers.set(id, callback); return id; },
  };
  globalThis.document = { documentElement: { lang: "en" } };

  return {
    render() {
      cursor = 0;
      hookCursor = 0;
      return ProductionApp();
    },
    async flush() {
      for (let round = 0; round < 8; round++) {
        this.render();
        this.runMountEffects();
        for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
        await new Promise(resolve => setImmediate(resolve));
      }
      return this.render();
    },
    go(delta) {
      historyIndex += delta;
      window.location.hash = history[historyIndex];
      for (const listener of listeners.get("hashchange") ?? []) listener();
    },
    navigate(hash) {
      window.location.hash = hash;
      for (const listener of listeners.get("hashchange") ?? []) listener();
    },
    runMountEffects() {
      const effects = mountEffects;
      mountEffects = [];
      mounted = true;
      for (const effect of effects) effect();
    },
    getTmtLoginRedirects: () => tmtLoginRedirects,
    cleanup() {
      if (reactive) for (const hook of hooks) hook?.cleanup?.();
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    },
  };
}

function findNode(node, predicate) {
  if (Array.isArray(node)) return node.map(child => findNode(child, predicate)).find(Boolean);
  if (node == null || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  for (const child of children) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return undefined;
}

const isLogin = (node) => typeof node.type === "function" && node.type.name === "ProductionLogin";
const isWorkspace = (node) => node.props?.className === "app";
const assertLoading = (node) => {
  assert.equal(node.type, "main");
  assert.equal(node.props.className, "session-loading");
  assert.equal(node.props.role, "status");
  assert.equal(node.props["aria-busy"], "true");
  assert.equal(findNode(node, isLogin), undefined);
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

test("TMT ID keeps the loading screen mounted while redirecting a signed-out visitor", async () => {
  const harness = createHarness({ mode: "tmt-id" });
  try {
    assertLoading(harness.render());
    harness.runMountEffects();
    await new Promise((resolve) => setImmediate(resolve));
    assertLoading(harness.render());
    assert.equal(harness.getTmtLoginRedirects(), 1);
  } finally {
    harness.cleanup();
  }
});

test("pending configured session restoration renders a status screen without flashing Login", () => {
  const harness = createHarness({ mode: "entra", restoreAccount: () => new Promise(() => {}) });
  try {
    const initial = harness.render();
    assert.equal(initial.type, "main");
    assert.equal(initial.props.className, "session-loading");
    assert.equal(initial.props.role, "status");
    assert.equal(initial.props["aria-busy"], "true");
    assert.equal(findNode(initial, isLogin), undefined);

    harness.runMountEffects();
    const whilePending = harness.render();
    assert.equal(whilePending.props.className, "session-loading");
    assert.equal(findNode(whilePending, isLogin), undefined);
  } finally {
    harness.cleanup();
  }
});

test("all sign-in modes wait for bootstrap before rendering the workspace", async (t) => {
  for (const mode of ["tmt-id", "team-test", "entra"]) {
    await t.test(mode, async () => {
      const bootstrapRequest = deferred();
      const harness = createHarness({
        mode,
        restoreAccount: async () => ({ username: "user@example.com" }),
        loadTmtIdSession: async () => ({ status: "signed-in", user: { id: "7" } }),
        loadBootstrap: () => bootstrapRequest.promise,
      });
      try {
        assertLoading(harness.render());
        harness.runMountEffects();
        await new Promise((resolve) => setImmediate(resolve));
        assertLoading(harness.render());
        bootstrapRequest.resolve(bootstrap);
        await new Promise((resolve) => setImmediate(resolve));
        const restored = harness.render();
        assert.ok(findNode(restored, isWorkspace));
        assert.equal(findNode(restored, isLogin), undefined);
      } finally {
        harness.cleanup();
      }
    });
  }
});

test("missing or failed restored sessions show Login after restoration settles", async (t) => {
  for (const [name, restoreAccount] of [
    ["missing", async () => null],
    ["failed", async () => { throw new Error("restore failed"); }],
  ]) {
    await t.test(name, async () => {
      const harness = createHarness({ mode: "entra", restoreAccount });
      try {
        assert.equal(harness.render().props.className, "session-loading");
        harness.runMountEffects();
        await new Promise((resolve) => setImmediate(resolve));
        assert.ok(findNode(harness.render(), isLogin));
      } finally {
        harness.cleanup();
      }
    });
  }
});

test("bootstrap failure shows Login only after the failed request settles", async () => {
  const bootstrapRequest = deferred();
  const harness = createHarness({
    mode: "entra",
    restoreAccount: async () => ({ username: "user@example.com" }),
    loadBootstrap: () => bootstrapRequest.promise,
  });
  try {
    harness.render();
    harness.runMountEffects();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.render().props.className, "session-loading");

    bootstrapRequest.reject(new Error("bootstrap failed"));
    await new Promise((resolve) => setImmediate(resolve));
    const login = findNode(harness.render(), isLogin);
    assert.ok(login);
    assert.equal(login.props.error, "bootstrap failed");
  } finally {
    harness.cleanup();
  }
});

test("unconfigured authentication renders Login immediately without attempting restoration", () => {
  let restoreCalls = 0;
  const harness = createHarness({
    mode: "entra",
    configured: false,
    restoreAccount: async () => { restoreCalls += 1; return null; },
  });
  try {
    assert.ok(findNode(harness.render(), isLogin));
    harness.runMountEffects();
    assert.equal(restoreCalls, 0);
  } finally {
    harness.cleanup();
  }
});

test("authenticated refresh restores Estimate Cost in every sign-in mode", async (t) => {
  for (const mode of ["tmt-id", "team-test", "entra"]) {
    await t.test(mode, async () => {
      const harness = createHarness({ mode, savedView: "estimates",
        restoreAccount: async () => ({}), loadTmtIdSession: async () => ({ status: "signed-in" }),
        loadBootstrap: async () => ({ ...bootstrap, permissions: ["estimate.read"] }),
      });
      try {
        harness.render(); harness.runMountEffects();
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(findNode(harness.render(), node => node.type === "ProductionEstimates"));
      } finally { harness.cleanup(); }
    });
  }
});

test("refresh falls back safely for revoked permissions or blocked storage", async (t) => {
  for (const storageBlocked of [false, true]) {
    await t.test(String(storageBlocked), async () => {
      const harness = createHarness({ mode: "team-test", savedView: "estimates", storageBlocked });
      try {
        harness.render(); harness.runMountEffects();
        await new Promise(resolve => setImmediate(resolve));
        const tree = harness.render();
        assert.ok(findNode(tree, node => node.type === "ProductionDashboard"));
        assert.equal(findNode(tree, node => node.type === "ProductionEstimates"), undefined);
      } finally { harness.cleanup(); }
    });
  }
});

function navLeaf(tree, label) {
  return findNode(tree, node => node.type === "a" && findNode(node, child => child.type === "span" && child.props.children === label));
}
const plainClick = () => ({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, prevented: false, preventDefault() { this.prevented = true; } });

test("opening an estimate from an inquiry leaves a shareable document URL", async () => {
  const harness = createHarness({ mode: "team-test", reactive: true, hash: "#/inquiries",
    loadBootstrap: async () => ({ ...bootstrap, permissions: ["inquiry.read", "estimate.read"] }),
  });
  try {
    const tree = await harness.flush();
    findNode(tree, node => node.type === "ProductionInquiries").props.openEstimate(42);
    const opened = await harness.flush();
    assert.equal(findNode(opened, node => node.type === "ProductionEstimates").props.initialEstimateId, 42);
    assert.equal(window.location.hash, "#/estimates/42");
  } finally { harness.cleanup(); }
});

test("shared Inquiry and Estimate links restore the exact record after sign-in", async (t) => {
  for (const [view, oldName, component, idProp, permission] of [
    ["estimates", "estimate", "ProductionEstimates", "initialEstimateId", "estimate.read"],
    ["inquiries", "inquiry", "ProductionInquiries", "preferredInquiryId", "inquiry.read"],
  ]) {
    for (const mode of ["tmt-id", "team-test", "entra"]) {
      for (const hash of [`#/${view}/42`, `#${oldName}/42`]) {
        await t.test(`${mode} ${hash}`, async () => {
          const harness = createHarness({ mode, reactive: true, hash, savedView: "dashboard", storageBlocked: true,
            restoreAccount: async () => ({}), loadTmtIdSession: async () => ({ status: "signed-in" }),
            loadBootstrap: async () => ({ ...bootstrap, permissions: [permission] }),
          });
          try {
            const tree = await harness.flush();
            assert.equal(findNode(tree, node => node.type === component).props[idProp], 42);
            assert.equal(window.location.hash, `#/${view}/42`);
          } finally { harness.cleanup(); }
        });
      }
    }
  }
});

test("document selection, Back, Forward and returning to the list keep URL and selection together", async (t) => {
  for (const [view, component, idProp, selectProp, label, permission] of [
    ["estimates", "ProductionEstimates", "initialEstimateId", "onSelectEstimate", "Estimate Cost", "estimate.read"],
    ["inquiries", "ProductionInquiries", "preferredInquiryId", "onSelectInquiry", "RFQ intake & estimating", "inquiry.read"],
  ]) {
    await t.test(view, async () => {
      const harness = createHarness({ mode: "team-test", reactive: true, hash: `#/${view}`,
        loadBootstrap: async () => ({ ...bootstrap, permissions: [permission] }),
      });
      const screen = tree => findNode(tree, node => node.type === component);
      try {
        let tree = await harness.flush();
        for (const id of [42, 43]) {
          screen(tree).props[selectProp](id);
          tree = await harness.flush();
          assert.equal(window.location.hash, `#/${view}/${id}`);
        }
        harness.go(-1); tree = await harness.flush();
        assert.equal(screen(tree).props[idProp], 42);
        harness.go(-1); tree = await harness.flush();
        assert.equal(screen(tree).props[idProp], null);
        harness.go(1); tree = await harness.flush();
        assert.equal(screen(tree).props[idProp], 42);
        navLeaf(tree, label).props.onClick(plainClick()); tree = await harness.flush();
        assert.equal(window.location.hash, `#/${view}`);
        assert.equal(screen(tree).props[idProp], null);
        screen(tree).props[selectProp](44); tree = await harness.flush();
        screen(tree).props[selectProp](null); tree = await harness.flush();
        assert.equal(window.location.hash, `#/${view}`);
        harness.navigate(`#/${view}/45`); tree = await harness.flush();
        assert.equal(screen(tree).props[idProp], 45);
      } finally { harness.cleanup(); }
    });
  }
});

test("a shared document URL never bypasses module permissions", async () => {
  for (const hash of ["#/estimates/42", "#estimate/42", "#/inquiries/42", "#inquiry/42"]) {
    const harness = createHarness({ mode: "team-test", reactive: true, hash });
    try {
      const tree = await harness.flush();
      assert.ok(findNode(tree, node => node.type === "ProductionDashboard"));
      assert.equal(findNode(tree, node => ["ProductionInquiries", "ProductionEstimates"].includes(node.type)), undefined);
      assert.equal(window.location.hash, "#/dashboard");
      harness.navigate(hash);
      await harness.flush();
      assert.equal(window.location.hash, "#/dashboard");
    } finally { harness.cleanup(); }
  }
});

test("legacy project timeline links and remembered views preserve schedule access", async (t) => {
  for (const permissions of [[], ["project.read"], ["schedule.read"], ["project.read", "schedule.read"]]) {
    for (const hash of ["", "#/project-timeline"]) {
      await t.test(`${permissions.join(",") || "none"} ${hash || "remembered"}`, async () => {
        const harness = createHarness({ mode: "team-test", savedView: "project-timeline", hash,
          loadBootstrap: async () => ({ ...bootstrap, permissions }),
        });
        try {
          harness.render(); harness.runMountEffects();
          await new Promise(resolve => setImmediate(resolve));
          const tree = harness.render();
          const timeline = findNode(tree, node => node.type === "ProductionProjects" && node.props.initialMode === "timeline");
          assert.equal(navLeaf(tree, "Project Timeline"), undefined, "Timeline is a Projects mode, not a second menu");
          assert.equal(Boolean(timeline), permissions.length === 2);
          if (timeline) {
            assert.equal(navLeaf(tree, "Projects").props["aria-current"], "page");
            timeline.props.openProjectSchedule(42, 8);
            const plan = findNode(harness.render(), node => node.type === "ProductionProjectSchedule");
            assert.ok(plan, "a timeline task still opens its project plan");
            assert.equal(plan.props.preferredProjectId, 42);
            assert.equal(plan.props.preferredTaskId, 8);
          } else {
            assert.ok(findNode(tree, node => node.type === "ProductionDashboard"));
          }
        } finally { harness.cleanup(); }
      });
    }
  }
});

test("master leaves restore directly and legacy master still opens customers", async (t) => {
  for (const [savedView, destination] of [["master", "customers"], ["suppliers", "suppliers"], ["employees", "employees"], ["material-master", "inventory"], ["user-accounts", "team"]]) {
    await t.test(savedView, async () => {
      const harness = createHarness({mode:"team-test",savedView,loadBootstrap:async()=>({...bootstrap,permissions:["master.read"]})});
      try {
        harness.render(); harness.runMountEffects(); await new Promise(resolve=>setImmediate(resolve));
        const tree=harness.render();
        assert.equal(findNode(tree,n=>n.type==="ProductionMasterData").props.destination,destination);
      } finally {harness.cleanup();}
    });
  }
});

test("non-admin estimators see libraries and help without rate or account access", async () => {
  const harness=createHarness({mode:"team-test",loadBootstrap:async()=>({...bootstrap,permissions:["estimate.read"]})});
  try {
    harness.render();harness.runMountEffects();await new Promise(resolve=>setImmediate(resolve));const tree=harness.render();
    for(const label of ["Module Templates","Labor Packages","Employee Manual","Report & Track Issues"]) assert.ok(navLeaf(tree,label),label);
    for(const label of ["Engineering rates","User Accounts & Permissions","Customers"]) assert.equal(navLeaf(tree,label),undefined,label);
  } finally {harness.cleanup();}
});

test("rate visibility still requires management role as well as master.read", async (t) => {
  for(const role of ["User","Admin"]){await t.test(role,async()=>{
    const harness=createHarness({mode:"team-test",savedView:"rates",loadBootstrap:async()=>({...bootstrap,user:{...bootstrap.user,role},permissions:["master.read"]})});
    try {harness.render();harness.runMountEffects();await new Promise(resolve=>setImmediate(resolve));const tree=harness.render();assert.equal(Boolean(navLeaf(tree,"Engineering rates")),role==="Admin");assert.equal(Boolean(findNode(tree,n=>n.type==="ProductionEngineeringRates")),role==="Admin");}finally{harness.cleanup();}
  });}
});

test("reports have distinct restored destinations and preserve the dirty exit guard", async(t)=>{
  for(const savedView of ["reports","summary-reports"]){await t.test(savedView,async()=>{
    const harness=createHarness({mode:"team-test",savedView,loadBootstrap:async()=>({...bootstrap,permissions:["report.read"]})});
    try {harness.render();harness.runMountEffects();await new Promise(resolve=>setImmediate(resolve));const tree=harness.render();
      const label=savedView==="reports"?"Operational Reports":"Summary Reports";
      assert.equal(navLeaf(tree,label).props["aria-current"],"page");
      assert.ok(findNode(tree,n=>n.type===(savedView==="reports"?"ReportScreens":"ProductionReports")));
      if(savedView==="reports") {findNode(tree,n=>n.type==="ReportScreens").props.onDirtyChange(true);globalThis.window.confirm=()=>false;navLeaf(tree,"Summary Reports").props.onClick(plainClick());assert.ok(findNode(harness.render(),n=>n.type==="ReportScreens"));}
    }finally{harness.cleanup();}
  });}
});

test("active groups can collapse and reopen without changing destination",async()=>{
  const harness=createHarness({mode:"team-test",savedView:"suppliers",loadBootstrap:async()=>({...bootstrap,permissions:["master.read"]})});
  try {
    harness.render();harness.runMountEffects();await new Promise(resolve=>setImmediate(resolve));
    const heading=tree=>findNode(tree,n=>n.type==="button"&&n.props.title==="MASTER DATA");
    assert.equal(heading(harness.render()).props["aria-expanded"],true);
    heading(harness.render()).props.onClick();
    assert.equal(heading(harness.render()).props["aria-expanded"],false);
    assert.equal(findNode(harness.render(),n=>n.type==="ProductionMasterData").props.destination,"suppliers");
    heading(harness.render()).props.onClick();
    assert.equal(heading(harness.render()).props["aria-expanded"],true);
  }finally{harness.cleanup();}
});

test("mobile leaf navigation closes the drawer only after accepting navigation",async()=>{
  const harness=createHarness({mode:"team-test",savedView:"reports",loadBootstrap:async()=>({...bootstrap,permissions:["report.read"]})});
  try {
    globalThis.window.matchMedia=()=>({matches:true});
    harness.render();harness.runMountEffects();await new Promise(resolve=>setImmediate(resolve));
    const tree=harness.render();navLeaf(tree,"Summary Reports").props.onClick(plainClick());
    assert.ok(findNode(harness.render(),n=>n.props.className==="app sidebar-collapsed"));
    assert.ok(findNode(harness.render(),n=>n.type==="ProductionReports"));
  }finally{harness.cleanup();}
});

test("a menu entry is a link: Ctrl/Cmd+Click is left to the browser, a plain click stays in the app",async()=>{
  const harness=createHarness({mode:"team-test",savedView:"reports",loadBootstrap:async()=>({...bootstrap,permissions:["report.read"]})});
  try {
    harness.render();harness.runMountEffects();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(navLeaf(harness.render(),"Summary Reports").props.href,"#/summary-reports");
    for(const modifier of ["ctrlKey","metaKey","shiftKey"]){
      const event={...plainClick(),[modifier]:true};
      navLeaf(harness.render(),"Summary Reports").props.onClick(event);
      assert.equal(event.prevented,false,modifier);
      assert.ok(findNode(harness.render(),n=>n.type==="ReportScreens"),modifier);
    }
    const event=plainClick();
    navLeaf(harness.render(),"Summary Reports").props.onClick(event);
    assert.equal(event.prevented,true);
    assert.ok(findNode(harness.render(),n=>n.type==="ProductionReports"));
  }finally{harness.cleanup();}
});
