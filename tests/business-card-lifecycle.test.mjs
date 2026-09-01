import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compile = (path, jsx = false) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
}).outputText;
const componentCode = compile("../app/system/production/BusinessCardScanner.tsx", true);
const parserCode = compile("../lib/business-card.ts");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = email => ({ data: { text: `EXAMPLE CO., LTD.\nEmail: ${email}`, confidence: 90 } });
const makeWorker = () => {
  const recognition = deferred();
  return {
    recognition, terminated: 0, recognized: 0,
    async setParameters() {},
    recognize() { this.recognized++; return recognition.promise; },
    async terminate() { this.terminated++; },
  };
};

// Exercise the real component handlers with deterministic hook commit semantics.
// Dependencies clean up before their next effect runs, exactly the lifecycle that
// previously made setting the first preview cancel its own OCR operation.
function mountScanner(workerFactory, { createBitmap = async () => ({ width: 300, height: 200, close() {} }) } = {}) {
  const slots = [], pendingEffects = [], applications = [], revoked = [], timers = new Set();
  let cursor = 0, dirty = false, mounted = true, tree, nextUrl = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, value => {
        slots[index].value = typeof value === "function" ? value(slots[index].value) : value;
        if (mounted) dirty = true;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
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
  const jsx = (type, props) => ({ type, props });
  const parser = { exports: {} };
  runInNewContext(parserCode, { module: parser, exports: parser.exports });
  const mod = { exports: {} };
  const dependencies = {
    react: hooks,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "../../../lib/business-card": parser.exports,
    "../ui": { Icon: "icon" },
    "tesseract.js": { createWorker: workerFactory, OEM: { LSTM_ONLY: 1 }, PSM: { SPARSE_TEXT: 11 } },
  };
  runInNewContext(componentCode, {
    module: mod, exports: mod.exports,
    require(name) { assert.ok(dependencies[name], `Unmocked dependency: ${name}`); return dependencies[name]; },
    window: {
      location: { origin: "http://localhost:3000" },
      setTimeout(fn, delay) {
        const timer = { fn, delay };
        timers.add(timer);
        if (delay === 4_000) Promise.resolve().then(() => { if (timers.delete(timer)) fn(); });
        return timer;
      },
      clearTimeout(timer) { timers.delete(timer); },
    },
    URL: { createObjectURL: () => `blob:card-${++nextUrl}`, revokeObjectURL: url => revoked.push(url) },
    createImageBitmap: createBitmap,
  });
  const render = () => {
    cursor = 0; dirty = false;
    tree = mod.exports.BusinessCardScanner({ onApply(result) { applications.push(result); return ["email"]; } });
    while (pendingEffects.length) pendingEffects.shift()();
  };
  const nodes = node => {
    if (Array.isArray(node)) return node.flatMap(child => nodes(child));
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  };
  const flush = async () => {
    // Commit synchronously before letting the image/OCR promises resume.
    for (let i = 0; i < 30; i++) {
      if (dirty && mounted) render();
      await Promise.resolve();
    }
  };
  render();
  return {
    applications, revoked, flush,
    busy: () => nodes(tree).some(node => node.type === "progress"),
    hasError: () => nodes(tree).some(node => node.props?.role === "alert"),
    chooseName(label, value) {
      const select = nodes(tree).find(node => node.type === "select" && node.props["aria-label"] === label);
      assert.ok(select, `Expected name selector: ${label}`);
      select.props.onChange({ target: { value } });
    },
    applyNames() {
      const button = nodes(tree).find(node => node.type === "button" && node.props.children === "เติมข้อมูลที่เลือกในช่องว่าง");
      assert.ok(button, "Multilingual names require explicit review before applying");
      button.props.onClick();
    },
    expireDeadline() {
      const deadline = [...timers].find(timer => timer.delay === 120_000);
      assert.ok(deadline, "A stalled scan must have a bounded deadline");
      timers.delete(deadline);
      deadline.fn();
    },
    select(name) {
      const picker = nodes(tree).find(node => node.props?.["data-business-card-source"] === "import");
      picker.props.onChange({ target: { files: [{ name, type: "image/jpeg", size: 1024 }], value: name } });
    },
    cancel() {
      const button = nodes(tree).find(node => node.type === "button" && node.props.children === "ยกเลิก");
      assert.ok(button, "Active scan must expose cancellation");
      button.props.onClick();
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      for (const slot of slots) slot.cleanup?.();
      timers.clear();
    },
  };
}

test("selecting an image survives the preview effect commit, applies OCR and unlocks the picker", async t => {
  const worker = makeWorker();
  let created = 0;
  const scanner = mountScanner(async () => { created++; return worker; });
  t.after(() => scanner.unmount());
  scanner.select("first.jpg");
  await scanner.flush();
  assert.equal(created, 1, "A preview rerender must not invalidate the scan before worker creation");
  assert.equal(worker.recognized, 1);
  assert.equal(scanner.busy(), true);
  worker.recognition.resolve(response("first@example.test"));
  await scanner.flush();
  assert.equal(scanner.applications.length, 1);
  assert.equal(scanner.applications[0].email, "first@example.test");
  assert.equal(scanner.busy(), false);
  assert.ok(worker.terminated >= 1);
});

test("a mobile image decoder that never settles falls back to the original file", async t => {
  const worker = makeWorker();
  const scanner = mountScanner(async () => worker, { createBitmap: () => new Promise(() => {}) });
  t.after(() => scanner.unmount());
  scanner.select("mobile-camera.jpg");
  await scanner.flush();
  assert.equal(worker.recognized, 1, "Image preparation must not block OCR indefinitely");
  worker.recognition.resolve(response("mobile@example.test"));
  await scanner.flush();
  assert.equal(scanner.applications[0].email, "mobile@example.test");
  assert.equal(scanner.busy(), false);
});

test("a cancelled recognition finishing late cannot apply results or terminate the replacement worker", async t => {
  const oldWorker = makeWorker(), newWorker = makeWorker();
  const workers = [oldWorker, newWorker];
  const scanner = mountScanner(async () => workers.shift());
  t.after(() => scanner.unmount());
  scanner.select("old.jpg");
  await scanner.flush();
  scanner.cancel();
  await scanner.flush();
  assert.equal(scanner.busy(), false);
  scanner.select("new.jpg");
  await scanner.flush();
  assert.equal(newWorker.recognized, 1);
  oldWorker.recognition.resolve(response("stale@example.test"));
  await scanner.flush();
  assert.equal(scanner.applications.length, 0);
  assert.equal(newWorker.terminated, 0, "Old scan cleanup must retain the current worker");
  assert.equal(scanner.busy(), true);
  newWorker.recognition.resolve(response("current@example.test"));
  await scanner.flush();
  assert.equal(scanner.applications.length, 1);
  assert.equal(scanner.applications[0].email, "current@example.test");
  assert.equal(scanner.busy(), false);
  assert.ok(scanner.revoked.includes("blob:card-1"));
});

test("a worker created after cancellation is disposed without disturbing the new scan", async t => {
  const pendingCreation = deferred(), oldWorker = makeWorker(), newWorker = makeWorker();
  let calls = 0;
  const scanner = mountScanner(() => ++calls === 1 ? pendingCreation.promise : Promise.resolve(newWorker));
  t.after(() => scanner.unmount());
  scanner.select("old.jpg");
  await scanner.flush();
  assert.equal(calls, 1);
  scanner.cancel();
  await scanner.flush();
  scanner.select("new.jpg");
  await scanner.flush();
  pendingCreation.resolve(oldWorker);
  await scanner.flush();
  assert.equal(oldWorker.recognized, 0);
  assert.ok(oldWorker.terminated >= 1);
  assert.equal(newWorker.terminated, 0);
  newWorker.recognition.resolve(response("new@example.test"));
  await scanner.flush();
  assert.equal(scanner.applications.length, 1);
  assert.equal(scanner.busy(), false);
});

test("unmount terminates active OCR, releases its preview and ignores the late response", async () => {
  const worker = makeWorker();
  const scanner = mountScanner(async () => worker);
  scanner.select("closing.jpg");
  await scanner.flush();
  assert.equal(worker.recognized, 1);
  scanner.unmount();
  assert.ok(worker.terminated >= 1);
  assert.ok(scanner.revoked.includes("blob:card-1"));
  worker.recognition.resolve(response("late@example.test"));
  await scanner.flush();
  assert.equal(scanner.applications.length, 0);
});

test("stalled worker initialization times out, restores retry and disposes a late worker", async t => {
  const pendingCreation = deferred(), oldWorker = makeWorker(), newWorker = makeWorker();
  let calls = 0;
  const scanner = mountScanner(() => ++calls === 1 ? pendingCreation.promise : Promise.resolve(newWorker));
  t.after(() => scanner.unmount());
  scanner.select("stalled.jpg");
  await scanner.flush();
  assert.equal(scanner.busy(), true);
  scanner.expireDeadline();
  await scanner.flush();
  assert.equal(scanner.busy(), false);
  assert.equal(scanner.hasError(), true);
  scanner.select("retry.jpg");
  await scanner.flush();
  assert.equal(scanner.hasError(), false);
  pendingCreation.resolve(oldWorker);
  await scanner.flush();
  assert.ok(oldWorker.terminated >= 1);
  assert.equal(oldWorker.recognized, 0);
  assert.equal(newWorker.terminated, 0);
  newWorker.recognition.resolve(response("retry@example.test"));
  await scanner.flush();
  assert.equal(scanner.applications.length, 1);
  assert.equal(scanner.applications[0].email, "retry@example.test");
  assert.equal(scanner.busy(), false);
});

test("OCR rejection shows a form error and unlocks selection without applying data", async t => {
  const worker = makeWorker();
  const scanner = mountScanner(async () => worker);
  t.after(() => scanner.unmount());
  scanner.select("broken.jpg");
  await scanner.flush();
  worker.recognition.reject(new Error("worker failed"));
  await scanner.flush();
  assert.equal(scanner.hasError(), true);
  assert.equal(scanner.busy(), false);
  assert.equal(scanner.applications.length, 0);
  assert.ok(worker.terminated >= 1);
});

test("multilingual names wait for explicit selection before filling the form", async t => {
  const worker = makeWorker();
  const scanner = mountScanner(async () => worker);
  t.after(() => scanner.unmount());
  scanner.select("multilingual.jpg");
  await scanner.flush();
  worker.recognition.resolve({ data: { text: "EXAMPLE CO., LTD.\n株式会社サンプル\nMr. Taro Yamada\n氏名：山田 太郎\nEmail: taro@example.test", confidence: 90 } });
  await scanner.flush();
  assert.equal(scanner.applications.length, 0);
  assert.equal(scanner.busy(), false);
  scanner.chooseName("ชื่อบริษัทที่จะใช้", "株式会社サンプル");
  scanner.chooseName("ชื่อผู้ติดต่อที่จะใช้", "山田 太郎");
  await scanner.flush();
  scanner.applyNames();
  await scanner.flush();
  assert.equal(scanner.applications.length, 1);
  assert.equal(scanner.applications[0].companyName, "株式会社サンプル");
  assert.equal(scanner.applications[0].contactName, "山田 太郎");
  assert.equal(scanner.applications[0].email, "taro@example.test");
});
