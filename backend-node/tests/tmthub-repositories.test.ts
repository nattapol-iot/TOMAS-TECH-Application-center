import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { strToU8, zipSync } from "fflate";
import { loadConfig } from "../src/config.js";
import { registerErrorHandler } from "../src/errors.js";
import { batchZipEntries, listZipEntries, readZipEntries } from "../src/routes/source-repositories.js";
import { projectIdFromTopics, registerTmthubRepositoryRoutes } from "../src/routes/tmthub-repositories.js";

const HUB = { apiUrl: "http://tmthub:3000", token: "t".repeat(40), org: "TMT", publicUrl: "https://tmthub.example:8446" };

test("a repository's project is its project-<id> topic", () => {
  assert.equal(projectIdFromTopics(["firmware", "project-12"]), 12);
  assert.equal(projectIdFromTopics(["projects-12", "project-"]), null);
  assert.equal(projectIdFromTopics(undefined), null);
});

test("TMTHub is configured only with a token, and its URLs are checked", () => {
  const base = {
    NODE_ENV: "development", Authentication__Mode: "Development", ConnectionStrings__IoTTeamCenter: "Server=x;Database=y;User Id=a;Password=b",
    DocumentStorage__RootPath: "./tmp-docs",
  };
  assert.equal(loadConfig(base).tmthub, undefined);
  const configured = loadConfig({ ...base, TMTHUB_API_TOKEN: "a".repeat(40), TMTHUB_PUBLIC_URL: "https://tmthub.example:8446/" });
  assert.deepEqual(configured.tmthub, { apiUrl: "http://tmthub:3000", token: "a".repeat(40), org: "TMT", publicUrl: "https://tmthub.example:8446" });
  assert.throws(() => loadConfig({ ...base, TMTHUB_API_TOKEN: "a".repeat(40) }), /TMTHUB_PUBLIC_URL/);
  assert.throws(() => loadConfig({ ...base, TMTHUB_API_TOKEN: "a".repeat(40), TMTHUB_PUBLIC_URL: "ftp://x" }), /http/);
  assert.throws(() => loadConfig({ ...base, TMTHUB_API_TOKEN: "short", TMTHUB_PUBLIC_URL: "https://x" }), /access token/);
});

type Call = { method: string; path: string; body: unknown; auth: string | null };

/** A small in-memory Forgejo: one organisation, repositories with files on "main". */
function fakeHub() {
  const calls: Call[] = [];
  const repos = new Map<string, { description: string; topics: string[]; files: Map<string, string> }>();
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  const repoJson = (name: string) => {
    const repo = repos.get(name)!;
    return {
      name, description: repo.description, empty: repo.files.size === 0, size: 3, default_branch: "main", topics: repo.topics,
      html_url: `${HUB.publicUrl}/TMT/${name}`, clone_url: `${HUB.publicUrl}/TMT/${name}.git`,
      updated_at: "2026-10-12T03:00:00Z", created_at: "2026-10-12T02:00:00Z",
    };
  };
  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const path = decodeURIComponent(parsed.pathname.replace(/^\/api\/v1/, ""));
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body, auth: new Headers(init.headers).get("Authorization") });
    let match: RegExpExecArray | null;
    if (method === "GET" && path === "/orgs/TMT/repos") return json([...repos.keys()].map(repoJson));
    if (method === "POST" && path === "/orgs/TMT/repos") {
      if (repos.has(body.name)) return json({ message: "repository already exists" }, 409);
      repos.set(body.name, { description: body.description, topics: [], files: new Map([["README.md", `# ${body.name}\n`]]) });
      return json(repoJson(body.name), 201);
    }
    if ((match = /^\/repos\/TMT\/([^/]+)(.*)$/.exec(path))) {
      const name = match[1]!;
      const rest = match[2] ?? "";
      const repo = repos.get(name);
      if (!repo) return json({ message: "not found" }, 404);
      if (rest === "" && method === "GET") return json(repoJson(name));
      if (rest === "" && method === "DELETE") { repos.delete(name); return new Response(null, { status: 204 }); }
      if (rest === "/topics" && method === "PUT") { repo.topics = body.topics; return new Response(null, { status: 204 }); }
      if (rest === "/commits") return json([{ sha: "abc123", html_url: "u", created: "", commit: { message: "Upload v1\n\nbody", author: { name: "Dev One", email: "d@x", date: "2026-10-12T03:00:00Z" } } }]);
      if (rest.startsWith("/git/trees/")) return json({ truncated: false, tree: [...repo.files.keys()].map((p) => ({ path: p, type: "blob", sha: `sha-${p}`, size: 1 })) });
      if (rest === "/contents" && method === "POST") {
        for (const change of body.files) {
          if (change.operation === "delete") repo.files.delete(change.path);
          else repo.files.set(change.path, Buffer.from(change.content, "base64").toString());
        }
        return json({}, 201);
      }
      if (rest.startsWith("/contents")) {
        const target = rest.replace(/^\/contents\/?/, "");
        if (repo.files.has(target)) return json({ name: target.split("/").at(-1), path: target, type: "file", size: repo.files.get(target)!.length, last_commit_when: "2026-10-12T03:00:00Z" });
        const prefix = target ? `${target}/` : "";
        const children = new Map<string, "file" | "dir">();
        for (const file of repo.files.keys()) {
          if (!file.startsWith(prefix)) continue;
          const [first, ...more] = file.slice(prefix.length).split("/");
          children.set(first!, more.length ? "dir" : "file");
        }
        if (children.size === 0) return json({ message: "not found" }, 404);
        return json([...children].map(([child, type]) => ({ name: child, path: prefix + child, type, size: type === "file" ? repo.files.get(prefix + child)!.length : 0 })));
      }
      if (rest.startsWith("/media/")) {
        const file = repo.files.get(rest.slice("/media/".length));
        return file === undefined ? json({ message: "not found" }, 404) : new Response(file, { headers: { "Content-Length": String(Buffer.byteLength(file)) } });
      }
      if (rest === "/archive/main.zip") return new Response("ZIPDATA", { headers: { "Content-Type": "application/zip" } });
    }
    return json({ message: `unexpected ${method} ${path}` }, 500);
  };
  return { calls, repos, fetchImpl };
}

test("TMTHub mode: create, browse, upload as a commit, download and delete through the Forgejo API", async () => {
  const hub = fakeHub();
  const permitted = { value: true };
  const users = {
    async required() { return { id: 7, name: "Dev One", email: "dev.one@tomastc.com" }; },
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
  registerTmthubRepositoryRoutes(app, { tmthub: HUB, documentStorage: { mode: "Local", rootPath: ".", maxFileSizeBytes: 10_000_000 } } as never, database as never, users as never, hub.fetchImpl as never);
  const multipartBody = (fields: Record<string, string>, fileName: string, contents: Uint8Array) => {
    const boundary = "----hub-test";
    const parts: Buffer[] = [];
    for (const [name, value] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(Buffer.from(contents), Buffer.from(`\r\n--${boundary}--\r\n`));
    return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
  };
  try {
    const empty = (await app.inject({ method: "GET", url: "/api/v1/download-center/repositories" })).json();
    assert.deepEqual(empty, { items: [], hub: { url: HUB.publicUrl, org: "TMT", orgUrl: `${HUB.publicUrl}/TMT` }, uploadMaxBytes: 10_000_000 });
    assert.equal(hub.calls[0]?.auth, `token ${HUB.token}`);

    const created = await app.inject({ method: "POST", url: "/api/v1/download-center/repositories", payload: { name: "fw", projectId: 12, description: "Gateway firmware" } });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().project.projectNo, "PJ-26-012");
    assert.equal(created.json().cloneUrl, `${HUB.publicUrl}/TMT/fw.git`);
    assert.deepEqual(hub.repos.get("fw")?.topics, ["project-12"]);
    assert.equal(hub.calls.find((call) => call.method === "POST" && call.path === "/orgs/TMT/repos")?.body && (hub.calls.find((call) => call.path === "/orgs/TMT/repos" && call.method === "POST")!.body as { private: boolean }).private, true);
    assert.equal((await app.inject({ method: "POST", url: "/api/v1/download-center/repositories", payload: { name: "fw", projectId: 12 } })).statusCode, 409);

    const zip = zipSync({ "fw-main/src/main.c": strToU8("int main(){}\n"), "fw-main/README.md": strToU8("# FW v1\n"), "fw-main/.git/HEAD": strToU8("x") });
    const upload = await app.inject({ method: "POST", url: "/api/v1/download-center/repositories/fw/upload", ...multipartBody({ path: "", message: "v1.0.0", extract: "true", replace: "true" }, "fw.zip", zip) });
    assert.equal(upload.statusCode, 200, upload.body);
    assert.equal(upload.json().written, 2);
    const commit = hub.calls.find((call) => call.method === "POST" && call.path === "/repos/TMT/fw/contents")!.body as { message: string; author: { email: string }; files: Array<{ operation: string; path: string; sha?: string }> };
    assert.match(commit.message, /^v1\.0\.0\n/);
    assert.equal(commit.author.email, "dev.one@tomastc.com");
    assert.deepEqual(commit.files.map((file) => `${file.operation}:${file.path}`).sort(), ["create:src/main.c", "update:README.md"]);
    assert.equal(commit.files.find((file) => file.path === "README.md")?.sha, "sha-README.md");

    const tree = (await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/tree?path=" })).json();
    assert.deepEqual(tree.entries.map((entry: { type: string; path: string }) => `${entry.type}:${entry.path}`), ["dir:src", "file:README.md"]);
    assert.equal(tree.readme.content, "# FW v1\n");
    const blob = (await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/blob?path=src/main.c" })).json();
    assert.equal(blob.content, "int main(){}\n");
    const raw = await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/raw?path=src/main.c" });
    assert.equal(raw.headers["content-type"], "application/octet-stream");
    assert.equal(raw.body, "int main(){}\n");
    const archive = await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/archive" });
    assert.equal(archive.body, "ZIPDATA");
    assert.match(String(archive.headers["content-disposition"]), /fw-main\.zip/);
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw/archive?path=src" })).statusCode, 400);

    const detail = (await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw" })).json();
    assert.equal(detail.history[0].message, "Upload v1");
    assert.equal(detail.history[0].by.name, "Dev One");
    assert.equal(detail.canManage, true);

    const removed = await app.inject({ method: "DELETE", url: "/api/v1/download-center/repositories/fw/files?path=src" });
    assert.equal(removed.json().removed, 1);
    assert.deepEqual([...hub.repos.get("fw")!.files.keys()], ["README.md"]);

    permitted.value = false;
    assert.equal((await app.inject({ method: "DELETE", url: "/api/v1/download-center/repositories/fw" })).statusCode, 403);
    permitted.value = true;
    assert.equal((await app.inject({ method: "DELETE", url: "/api/v1/download-center/repositories/fw" })).statusCode, 204);
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/download-center/repositories/fw" })).statusCode, 404);
  } finally {
    await app.close();
  }
});

test("a zip is listed without inflating and grouped into commit-sized batches", () => {
  const zip = zipSync({ "p/a.c": new Uint8Array(10), "p/b.bin": new Uint8Array(30), "p/c.c": new Uint8Array(5), "p/.git/x": new Uint8Array(1) });
  const listing = listZipEntries(zip, true);
  assert.deepEqual(listing.entries.map((entry) => `${entry.path.join("/")}:${entry.sizeBytes}`).sort(), ["a.c:10", "b.bin:30", "c.c:5"]);
  assert.equal(listing.skipped, 1);
  const batches = batchZipEntries(listing.entries.sort((a, b) => a.original.localeCompare(b.original)), 20);
  assert.deepEqual(batches.map((batch) => batch.map((entry) => entry.path.join("/"))), [["a.c"], ["b.bin"], ["c.c"]]);
  assert.deepEqual(batchZipEntries(listing.entries, 100).length, 1);
  const read = readZipEntries(zip, [listing.entries.find((entry) => entry.path[0] === "b.bin")!]);
  assert.equal(read[0]?.contents.length, 30);
});

test("a repository upload past the document limit is accepted and committed in parts", async () => {
  const hub = fakeHub();
  hub.repos.set("big", { description: "", topics: [], files: new Map([["README.md", "# big\n"], ["old.txt", "x"]]) });
  const users = { async required() { return { id: 7, name: "Dev One", email: "dev.one@tomastc.com" }; }, async demandPermission() {} };
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(multipart, { limits: { files: 1, fileSize: 2_000_000, fields: 30, parts: 31 }, throwFileSizeLimit: true });
  registerTmthubRepositoryRoutes(app, {
    tmthub: HUB, documentStorage: { mode: "Local", rootPath: ".", maxFileSizeBytes: 2_000_000, repositoryUploadMaxBytes: 40_000_000 },
  } as never, { async query() { return { recordset: [] }; } } as never, users as never, hub.fetchImpl as never);
  // Random bytes do not compress: the zip itself is ~30 MB, past the 2 MB document limit.
  const noise = (size: number) => Uint8Array.from({ length: size }, () => Math.floor(Math.random() * 256));
  const zip = zipSync({ "src/a.bin": noise(15_000_000), "src/b.bin": noise(15_000_000), "src/c.txt": strToU8("c") }, { level: 0 });
  const boundary = "----big";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="extract"\r\n\r\ntrue\r\n--${boundary}\r\nContent-Disposition: form-data; name="replace"\r\n\r\ntrue\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.zip"\r\nContent-Type: application/zip\r\n\r\n`),
    Buffer.from(zip), Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  try {
    const response = await app.inject({ method: "POST", url: "/api/v1/download-center/repositories/big/upload", payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual({ written: response.json().written, commits: response.json().commits }, { written: 3, commits: 2 });
    const commits = hub.calls.filter((call) => call.method === "POST" && call.path === "/repos/TMT/big/contents").map((call) => call.body as { message: string; files: Array<{ operation: string; path: string }> });
    assert.deepEqual(commits.map((commit) => commit.message.split("\n")[0]), ["Upload big.zip (part 1/2)", "Upload big.zip (part 2/2)"]);
    // Replacing deletes what the zip no longer holds, once, in the last commit.
    assert.deepEqual(commits[1]!.files.filter((file) => file.operation === "delete").map((file) => file.path).sort(), ["README.md", "old.txt"]);
    assert.deepEqual([...hub.repos.get("big")!.files.keys()].sort(), ["a.bin", "b.bin", "c.txt"]);
  } finally {
    await app.close();
  }
});

test("TMTHub being down reads as 503, not as a crash", async () => {
  const app = Fastify();
  registerErrorHandler(app);
  const users = { async required() { return { id: 1, name: "A", email: "a@x" }; }, async demandPermission() {} };
  registerTmthubRepositoryRoutes(app, { tmthub: HUB, documentStorage: { maxFileSizeBytes: 1 } } as never, {} as never, users as never,
    (async () => { throw new TypeError("fetch failed"); }) as never);
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/download-center/repositories" });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().code, "tmthub_unavailable");
  } finally {
    await app.close();
  }
});
