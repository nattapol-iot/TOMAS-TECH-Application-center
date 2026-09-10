import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

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

function createHarness({ configured, restoreAccount, loadBootstrap = async () => bootstrap, teamTest = false }) {
  const states = [];
  let cursor = 0;
  let mounted = false;
  let mountEffects = [];

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
    react,
    "react/jsx-runtime": jsxRuntime,
    "./auth-client": {
      IS_ENTRA_CONFIGURED: configured && !teamTest,
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
      IS_TEAM_TEST_MODE: teamTest,
      clearTeamTestSession: () => {},
      getTeamTestSession: () => teamTest ? { email: "team@example.com" } : null,
      saveTeamTestSession: () => {},
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
    location: { hash: "", pathname: "/system", search: "" },
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
    cleanup() {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    },
  };
}

function findNode(node, predicate) {
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

test("pending configured session restoration renders a status screen without flashing Login", () => {
  const harness = createHarness({ configured: true, restoreAccount: () => new Promise(() => {}) });
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

test("successful restoration waits for bootstrap then moves directly to the workspace", async (t) => {
  for (const [name, teamTest] of [["Microsoft Entra", false], ["Team Test", true]]) {
    await t.test(name, async () => {
      const bootstrapRequest = deferred();
      const harness = createHarness({
        configured: true,
        restoreAccount: async () => ({ username: "user@example.com" }),
        loadBootstrap: () => bootstrapRequest.promise,
        teamTest,
      });
      try {
        assert.equal(harness.render().props.className, "session-loading");
        harness.runMountEffects();
        await new Promise((resolve) => setImmediate(resolve));

        const whileBootstrapLoads = harness.render();
        assert.equal(whileBootstrapLoads.props.className, "session-loading");
        assert.equal(findNode(whileBootstrapLoads, isLogin), undefined);

        bootstrapRequest.resolve(bootstrap);
        await new Promise((resolve) => setImmediate(resolve));
        const restored = harness.render();
        assert.ok(findNode(restored, (node) => node.props?.className === "app"));
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
      const harness = createHarness({ configured: true, restoreAccount });
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
    configured: true,
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
