import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  decodeSource, isIgnoredName, parseRepositoryMeta, planZipExtraction, readTree, repositoryName, repositoryPath, walkFiles,
} from "../src/routes/source-repositories.js";

test("repository names are GitHub-style and safe as a NAS folder", () => {
  for (const name of ["tmt-gateway", "Firmware_v2", "a", "app.web"]) assert.equal(repositoryName(name), name);
  for (const name of ["", "-x", ".git", "has space", "a/b", "con", "end.", "x".repeat(101), "ไทย"]) {
    assert.throws(() => repositoryName(name), { code: "validation_failed" }, name);
  }
});

test("repository paths never climb out of the tree", () => {
  assert.deepEqual(repositoryPath(""), []);
  assert.deepEqual(repositoryPath("/src/main.c/"), ["src", "main.c"]);
  assert.deepEqual(repositoryPath(".gitignore"), [".gitignore"]);
  assert.throws(() => repositoryPath("", false), { code: "validation_failed" });
  for (const path of ["../x", "src/../../x", "a//b", "a\\b", "C:/x", ".git/config", "src/node_modules/x", "trailing."]) {
    assert.throws(() => repositoryPath(path), { code: "invalid_path" }, path);
  }
});

test("tooling folders and temporary writes are not part of the source", () => {
  for (const name of [".git", "node_modules", "__MACOSX", "@eaDir", "#recycle", "Thumbs.db", `a.c.writing-${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}.tmp`]) {
    assert.equal(isIgnoredName(name), true, name);
  }
  for (const name of [".gitignore", "__init__.py", "src", "README.md"]) assert.equal(isIgnoredName(name), false, name);
});

test("repo.json that someone edited by hand reads back as defaults", () => {
  const meta = parseRepositoryMeta("not json", "fw");
  assert.equal(meta.name, "fw");
  assert.equal(meta.projectId, null);
  assert.deepEqual(meta.history, []);
  const parsed = parseRepositoryMeta(String.fromCharCode(0xfeff) + JSON.stringify({
    projectId: 12, description: "Gateway", history: [{ action: "upload", at: "2026-10-12T00:00:00Z", by: { id: 1, name: "A" }, files: 3 }, { action: "hack" }],
  }), "fw");
  assert.equal(parsed.projectId, 12);
  assert.equal(parsed.description, "Gateway");
  assert.equal(parsed.history.length, 1);
  assert.equal(parsed.history[0]?.files, 3);
});

test("source text is shown, binary content is not", () => {
  assert.equal(decodeSource(strToU8("int main() {}\n")), "int main() {}\n");
  assert.equal(decodeSource(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])), "A");
  assert.equal(decodeSource(new Uint8Array([0x89, 0x50, 0x00, 0x47])), null);
});

test("a GitHub zip unpacks without its wrapper folder and without tooling folders", () => {
  const zip = zipSync({
    "fw-main/src/main.c": strToU8("int main(){}"),
    "fw-main/README.md": strToU8("# FW"),
    "fw-main/.git/config": strToU8("x"),
    "fw-main/node_modules/a/index.js": strToU8("x"),
  });
  const plan = planZipExtraction(zip, true);
  assert.deepEqual(plan.files.map((file) => file.path.join("/")).sort(), ["README.md", "src/main.c"]);
  assert.equal(plan.skipped, 2);
  assert.deepEqual(planZipExtraction(zip, false).files.map((file) => file.path.join("/")).sort(), ["fw-main/README.md", "fw-main/src/main.c"]);
  // two top-level entries: nothing to strip
  const flat = planZipExtraction(zipSync({ "a.c": strToU8("a"), "lib/b.c": strToU8("b") }), true);
  assert.deepEqual(flat.files.map((file) => file.path.join("/")).sort(), ["a.c", "lib/b.c"]);
  assert.throws(() => planZipExtraction(strToU8("not a zip"), true), { code: "invalid_zip" });
});

test("a zip entry that tries to escape is skipped", () => {
  const plan = planZipExtraction(zipSync({ "../evil.sh": strToU8("x"), "ok.c": strToU8("y") }), false);
  assert.deepEqual(plan.files.map((file) => file.path.join("/")), ["ok.c"]);
  assert.equal(plan.skipped, 1);
});

test("the tree lists folders first and hides tooling folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "source-repo-"));
  try {
    assert.deepEqual(await readTree(join(root, "missing"), []), []);
    await mkdir(join(root, "src", "lib"), { recursive: true });
    await mkdir(join(root, ".git"));
    await writeFile(join(root, ".git", "HEAD"), "ref");
    await writeFile(join(root, "README.md"), "# x");
    await writeFile(join(root, "src", "main.c"), "int main(){}");
    await writeFile(join(root, "src", "lib", "util.c"), "u");
    const top = await readTree(root, []);
    assert.deepEqual(top.map((entry) => `${entry.type}:${entry.path}`), ["dir:src", "file:README.md"]);
    const src = await readTree(root, ["src"]);
    assert.deepEqual(src.map((entry) => entry.path), ["src/lib", "src/main.c"]);
    await assert.rejects(readTree(root, ["nope"]), { code: "path_not_found" });
    await assert.rejects(readTree(root, ["README.md"]), { code: "path_not_found" });
    const files = await walkFiles(root);
    assert.deepEqual(files.map((file) => file.path), ["README.md", "src/lib/util.c", "src/main.c"]);
    assert.deepEqual((await walkFiles(root, ["src"])).map((file) => file.path), ["src/lib/util.c", "src/main.c"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a project repository is created, filled from a zip, browsed, downloaded and trimmed over HTTP", async () => {
  const { default: Fastify } = await import("fastify");
  const { default: multipart } = await import("@fastify/multipart");
  const { unzipSync, strFromU8 } = await import("fflate");
  const { registerErrorHandler } = await import("../src/errors.js");
  const { registerSourceRepositoryRoutes } = await import("../src/routes/source-repositories.js");
  const root = await mkdtemp(join(tmpdir(), "source-repo-http-"));
  const permitted = { value: true };
  const users = {
    async required() { return { id: 7, name: "Dev One" }; },
    async demandPermission() { if (!permitted.value) throw Object.assign(new Error("denied"), { statusCode: 403 }); },
  };
  const database = {
    async query(_text: string, bind: (request: { input: (name: string, _type: unknown, value: unknown) => void }) => void) {
      let ids = "";
      bind({ input: (name, _type, value) => { if (name === "ids") ids = String(value); } });
      return { recordset: ids.split(",").filter((id) => id === "12").map(() => ({ id: 12, project_no: "PJ-26-012", name: "Gateway", status: "Active" })) };
    },
  };
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(multipart, { limits: { files: 1, fileSize: 10_000_000, fields: 30, parts: 31 }, throwFileSizeLimit: true });
  registerSourceRepositoryRoutes(app, { documentStorage: { mode: "Local", rootPath: root, maxFileSizeBytes: 10_000_000 } } as never, database as never, users as never);
  const multipartBody = (fields: Record<string, string>, fileName: string, contents: Uint8Array) => {
    const boundary = "----repo-test";
    const parts: Buffer[] = [];
    for (const [name, value] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(Buffer.from(contents), Buffer.from(`\r\n--${boundary}--\r\n`));
    return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
  };
  try {
    assert.deepEqual((await app.inject({ method: "GET", url: "/api/v1/download-center/repositories" })).json(), { items: [], hub: null, uploadMaxBytes: 10_000_000 });
    assert.equal((await app.inject({ method: "POST", url: "/api/v1/download-center/repositories", payload: { name: "fw", projectId: 99 } })).statusCode, 404);
    const created = await app.inject({ method: "POST", url: "/api/v1/download-center/repositories", payload: { name: "fw", projectId: 12, description: "Gateway firmware" } });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().project.projectNo, "PJ-26-012");
    assert.equal((await app.inject({ method: "POST", url: "/api/v1/download-center/repositories", payload: { name: "FW", projectId: 12 } })).statusCode, 409);

    const zip = zipSync({ "fw-main/README.md": strToU8("# Gateway\n\nRun `make`."), "fw-main/src/main.c": strToU8("int main(){return 0;}\n"), "fw-main/.git/HEAD": strToU8("x") });
    const upload = multipartBody({ path: "", message: "v1.0.0", extract: "true", replace: "true", stripRoot: "true" }, "fw-main.zip", zip);
    const uploaded = await app.inject({ method: "POST", url: "/api/v1/download-center/repositories/fw/upload", ...upload });
    assert.equal(uploaded.statusCode, 200, uploaded.body);
    assert.deepEqual(uploaded.json(), { written: 2, skipped: 1, fileCount: 2, sizeBytes: 44 });

    const single = multipartBody({ path: "src", message: "" }, "util.h", strToU8("#pragma once\n"));
    assert.equal((await app.inject({ method: "POST", url: "/api/v1/download-center/repositories/fw/upload", ...single })).json().fileCount, 3);

    const tree = (await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/tree?path=" })).json();
    assert.deepEqual(tree.entries.map((entry: { path: string }) => entry.path), ["src", "README.md"]);
    assert.equal(tree.readme.name, "README.md");
    const blob = (await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/blob?path=src/main.c" })).json();
    assert.equal(blob.content, "int main(){return 0;}\n");
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/blob?path=../repo.json" })).statusCode, 400);
    const raw = await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/raw?path=src/util.h" });
    assert.equal(raw.headers["content-type"], "application/octet-stream");
    assert.equal(raw.body, "#pragma once\n");

    const archive = await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/archive" });
    assert.equal(archive.statusCode, 200);
    const unpacked = unzipSync(new Uint8Array(archive.rawPayload));
    assert.deepEqual(Object.keys(unpacked).sort(), ["fw/README.md", "fw/src/main.c", "fw/src/util.h"]);
    assert.equal(strFromU8(unpacked["fw/src/main.c"]!), "int main(){return 0;}\n");
    const folderZip = unzipSync(new Uint8Array((await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/archive?path=src" })).rawPayload));
    assert.deepEqual(Object.keys(folderZip).sort(), ["fw/src/main.c", "fw/src/util.h"]);

    assert.equal((await app.inject({ method: "DELETE", url: "/api/v1/download-center/repositories/fw/files?path=src/util.h" })).json().fileCount, 2);
    const detail = (await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw" })).json();
    assert.deepEqual(detail.history.map((entry: { action: string }) => entry.action), ["delete", "upload", "upload", "create"]);
    assert.equal(detail.history[2].message, "v1.0.0");
    assert.equal(detail.canManage, true);

    permitted.value = false;
    assert.equal((await app.inject({ method: "DELETE", url: "/api/v1/download-center/repositories/fw" })).statusCode, 403);
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw" })).json().canManage, false);
    permitted.value = true;
    assert.equal((await app.inject({ method: "DELETE", url: "/api/v1/download-center/repositories/fw" })).statusCode, 204);
    assert.deepEqual((await app.inject({ method: "GET", url: "/api/v1/download-center/repositories" })).json(), { items: [], hub: null, uploadMaxBytes: 10_000_000 });
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
