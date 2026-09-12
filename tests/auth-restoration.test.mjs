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
}) {
  const states = [];
  let cursor = 0;
  let mounted = false;
  let mountEffects = [];
  let tmtLoginRedirects = 0;

  const react = {
    useCallback: (callback) => callback,
    useEffect(effect) {
      if (!mounted) mountEffects.push(effect);
    },
    useMemo: (factory) => factory(),
    useRef: (value) => ({ current: value }),
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
    addEventListener: () => {},
    clearInterval: () => {},
    clearTimeout: () => {},
    confirm: () => true,
    history: { replaceState: () => {} },
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
    removeEventListener: () => {},
    scrollTo: () => {},
    setInterval: () => 1,
    setTimeout: () => 1,
  };
  globalThis.document = { documentElement: { lang: "en" } };

  return {
    render() {
      cursor = 0;
      return ProductionApp();
    },
    runMountEffects() {
      const effects = mountEffects;
      mountEffects = [];
      mounted = true;
      for (const effect of effects) effect();
    },
    getTmtLoginRedirects: () => tmtLoginRedirects,
    cleanup() {
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
  return findNode(tree, node => node.type === "button" && findNode(node, child => child.type === "span" && child.props.children === label));
}

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
      if(savedView==="reports") {findNode(tree,n=>n.type==="ReportScreens").props.onDirtyChange(true);globalThis.window.confirm=()=>false;navLeaf(tree,"Summary Reports").props.onClick();assert.ok(findNode(harness.render(),n=>n.type==="ReportScreens"));}
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
    const tree=harness.render();navLeaf(tree,"Summary Reports").props.onClick();
    assert.ok(findNode(harness.render(),n=>n.props.className==="app sidebar-collapsed"));
    assert.ok(findNode(harness.render(),n=>n.type==="ProductionReports"));
  }finally{harness.cleanup();}
});
