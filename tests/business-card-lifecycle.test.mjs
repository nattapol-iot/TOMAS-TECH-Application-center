import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript-api";

const compile = (path, jsx = false) =>
  ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText;
const componentCode = compile("../app/system/production/BusinessCardScanner.tsx", true);
const parserCode = compile("../lib/business-card.ts");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const card = (email, extra = {}) => ({
  companyName: "EXAMPLE CO., LTD.",
  contactName: "",
  email,
  phone: "",
  website: "",
  position: "",
  department: "",
  address: "",
  companyNames: [{ language: "en", value: "EXAMPLE CO., LTD." }],
  contactNames: [],
  documentUrl: "https://copilot.test/namecard?doc=1",
  ...extra,
});
class ApiClientError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Exercise the real component handlers with deterministic hook commit semantics: dependencies clean up before their next
// effect runs, the lifecycle that once made setting the first preview cancel its own scan.
function mountScanner(scanCard) {
  const slots = [],
    pendingEffects = [],
    applications = [],
    revoked = [],
    sent = [],
    signIns = [];
  let cursor = 0,
    dirty = false,
    mounted = true,
    tree,
    nextUrl = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [
        slots[index].value,
        (value) => {
          slots[index].value = typeof value === "function" ? value(slots[index].value) : value;
          if (mounted) dirty = true;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const LocalizedText = ({ text }) => text;
  const jsx = (type, props) => (type === LocalizedText ? LocalizedText(props) : { type, props });
  const parser = { exports: {} };
  runInNewContext(parserCode, { module: parser, exports: parser.exports });
  const mod = { exports: {} };
  const dependencies = {
    react: hooks,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "../../../lib/business-card": parser.exports,
    "../api-client": {
      ApiClientError,
      scanBusinessCardViaBackend: (image, name) => {
        sent.push({ image, name });
        return scanCard();
      },
    },
    "../tmt-id-client": { currentAppPath: () => "/customers", redirectToTmtIdLogin: (next) => signIns.push(next) },
    "../ui": { Icon: "icon" },
    "../i18n": { useT: () => (text) => text },
    "../LocalizedText": { LocalizedText },
  };
  runInNewContext(componentCode, {
    module: mod,
    exports: mod.exports,
    require(name) {
      assert.ok(dependencies[name], `Unmocked dependency: ${name}`);
      return dependencies[name];
    },
    window: {
      setTimeout: (fn) => {
        Promise.resolve().then(fn);
        return 1;
      },
      clearTimeout() {},
    },
    URL: { createObjectURL: () => `blob:card-${++nextUrl}`, revokeObjectURL: (url) => revoked.push(url) },
    // No canvas here, so redrawing fails and the original photo is sent, the same path a browser takes when it cannot decode.
    createImageBitmap: async () => {
      throw new Error("no decoder");
    },
  });
  const render = () => {
    cursor = 0;
    dirty = false;
    tree = mod.exports.BusinessCardScanner({
      onApply(result) {
        applications.push(result);
        return ["email"];
      },
    });
    while (pendingEffects.length) pendingEffects.shift()();
  };
  const nodes = (node) => {
    if (Array.isArray(node)) return node.flatMap((child) => nodes(child));
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  };
  const text = (node) => (Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : node?.props ? text(node.props.children) : "");
  const flush = async () => {
    for (let i = 0; i < 30; i++) {
      if (dirty && mounted) render();
      await Promise.resolve();
    }
  };
  render();
  return {
    applications,
    revoked,
    sent,
    signIns,
    flush,
    signInButton: () => nodes(nodes(tree).find((node) => node.props?.role === "alert")).find((node) => node.type === "button"),
    busy: () => nodes(tree).some((node) => node.type === "progress"),
    alert: () => text(nodes(tree).find((node) => node.props?.role === "alert")),
    link: () => nodes(tree).find((node) => node.type === "a")?.props.href,
    chooseName(label, value) {
      const select = nodes(tree).find((node) => node.type === "select" && node.props["aria-label"] === label);
      assert.ok(select, `Expected name selector: ${label}`);
      select.props.onChange({ target: { value } });
    },
    applyNames() {
      const button = nodes(tree).find((node) => node.type === "button" && node.props.children === "เติมข้อมูลที่เลือกในช่องว่าง");
      assert.ok(button, "Multilingual names require explicit review before applying");
      button.props.onClick();
    },
    select(name, type = "image/jpeg") {
      const picker = nodes(tree).find((node) => node.props?.["data-business-card-source"] === "import");
      picker.props.onChange({ target: { files: [{ name, type, size: 1024 }], value: name } });
    },
    cancel() {
      const button = nodes(tree).find((node) => node.type === "button" && node.props.children === "ยกเลิก");
      assert.ok(button, "A running scan must offer to stop waiting");
      button.props.onClick();
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      for (const slot of slots) slot.cleanup?.();
    },
  };
}

test("a picked card is sent to copilot, its fields fill the form and the picker unlocks", async () => {
  const reply = deferred();
  const scanner = mountScanner(() => reply.promise);
  scanner.select("card.jpg");
  await scanner.flush();
  assert.equal(scanner.sent.length, 1);
  assert.equal(scanner.sent[0].name, "business-card.jpg");
  assert.ok(scanner.busy(), "The form shows it is waiting for copilot");
  reply.resolve(card("one@example.test"));
  await scanner.flush();
  assert.equal(scanner.applications.length, 1);
  assert.equal(scanner.applications[0].email, "one@example.test");
  assert.equal(scanner.busy(), false);
  assert.equal(scanner.link(), "https://copilot.test/namecard?doc=1");
});

test("names printed in several scripts wait for the person to choose before anything is filled", async () => {
  const scanner = mountScanner(async () =>
    card("two@example.test", {
      companyNames: [
        { language: "th", value: "บริษัท ตัวอย่าง จำกัด" },
        { language: "en", value: "EXAMPLE CO., LTD." },
      ],
      companyName: "บริษัท ตัวอย่าง จำกัด",
    }),
  );
  scanner.select("card.jpg");
  await scanner.flush();
  assert.equal(scanner.applications.length, 0);
  scanner.chooseName("ชื่อบริษัทที่จะใช้", "EXAMPLE CO., LTD.");
  await scanner.flush();
  scanner.applyNames();
  assert.equal(scanner.applications[0].companyName, "EXAMPLE CO., LTD.");
});

test("an answer arriving after cancel or unmount fills nothing", async () => {
  const late = deferred();
  const cancelled = mountScanner(() => late.promise);
  cancelled.select("card.jpg");
  await cancelled.flush();
  cancelled.cancel();
  await cancelled.flush();
  late.resolve(card("late@example.test"));
  await cancelled.flush();
  assert.equal(cancelled.applications.length, 0);
  assert.equal(cancelled.busy(), false);

  const gone = deferred();
  const unmounted = mountScanner(() => gone.promise);
  unmounted.select("card.jpg");
  await unmounted.flush();
  unmounted.unmount();
  gone.resolve(card("gone@example.test"));
  await unmounted.flush();
  assert.equal(unmounted.applications.length, 0);
  assert.deepEqual(unmounted.revoked, ["blob:card-1"]);
});

test("copilot failures say what to do, and a photo copilot cannot take is never sent", async () => {
  const signedOut = mountScanner(async () => {
    throw new ApiClientError(409, "copilot_sign_in_required", "sign in");
  });
  signedOut.select("card.jpg");
  await signedOut.flush();
  assert.match(signedOut.alert(), /TMT ID/);
  assert.equal(signedOut.busy(), false);
  // Signing in again goes straight to TMT ID and back to this page; there is no sign-out step in between.
  signedOut.signInButton().props.onClick();
  assert.deepEqual(signedOut.signIns, ["/customers"]);

  const heic = mountScanner(async () => card("never@example.test"));
  heic.select("card.heic", "image/heic");
  await heic.flush();
  assert.equal(heic.sent.length, 0);
  assert.match(heic.alert(), /JPEG หรือ PNG/);
  assert.equal(heic.signInButton(), undefined);
});
