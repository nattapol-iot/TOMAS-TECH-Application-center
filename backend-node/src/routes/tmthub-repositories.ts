import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig, TmthubConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { DOCUMENT_DOWNLOAD_RATE_LIMIT, multipartText, readMultipartForm, uploadedFileName } from "../document-storage.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";
import {
  decodeSource, loadProjects, MANAGE_PERMISSION, MAX_README_BYTES, MAX_VIEW_BYTES, planZipExtraction, REPOSITORY_UPLOAD_RATE_LIMIT,
  repositoryName, repositoryPath, type ProjectRef,
} from "./source-repositories.js";

/**
 * The Download Center's project repositories when TMTHub (Forgejo) is configured: every repository
 * is a real git repository in one TMTHub organisation, so the team can clone, pull and push it,
 * and this page browses it, downloads it and commits uploads to it through the TMTHub API.
 *
 * The project link is a repository topic "project-<id>", so it survives renames on either side.
 * Reads use the service token; uploads and deletions become commits authored by the signed-in
 * person. Same routes and response shapes as the NAS file mode in source-repositories.ts.
 */
const PROJECT_TOPIC = /^project-(\d{1,15})$/;
const MAX_CHANGED_FILES = 5000;
const HUB_TIMEOUT_MS = 30_000;

type HubRepository = {
  name: string; description: string; empty: boolean; size: number; default_branch: string; topics?: string[];
  html_url: string; clone_url: string; updated_at: string; created_at: string;
};
type HubContent = { name: string; path: string; type: "file" | "dir" | "symlink" | "submodule"; size: number; last_commit_when?: string };
type HubCommit = {
  sha: string; html_url: string; created: string;
  commit: { message: string; author: { name: string; email: string; date: string } };
};
type HubTreeEntry = { path: string; type: "blob" | "tree" | "commit"; sha: string; size: number };

export type HubFetch = (url: string, init?: RequestInit) => Promise<Response>;

export function projectIdFromTopics(topics: string[] | undefined): number | null {
  for (const topic of topics ?? []) {
    const match = PROJECT_TOPIC.exec(topic);
    if (match) return Number(match[1]);
  }
  return null;
}

function encodePath(segments: string[]): string {
  return segments.map(encodeURIComponent).join("/");
}

export function createHubClient(hub: TmthubConfig, fetchImpl: HubFetch = fetch) {
  const call = async (path: string, init: RequestInit = {}, notFound?: ApiError): Promise<Response> => {
    let response: Response;
    try {
      response = await fetchImpl(`${hub.apiUrl}/api/v1${path}`, {
        ...init,
        headers: { Authorization: `token ${hub.token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
        signal: init.signal ?? AbortSignal.timeout(HUB_TIMEOUT_MS),
      });
    } catch {
      throw new ApiError(503, "tmthub_unavailable", "TMTHub is not reachable right now.");
    }
    if (response.ok) return response;
    if (response.status === 404 && notFound) throw notFound;
    const body = await response.json().catch(() => ({})) as { message?: string };
    if (response.status === 409 || response.status === 422) {
      throw new ApiError(409, "tmthub_conflict", body.message || "TMTHub refused the change.");
    }
    if (response.status === 413) throw new ApiError(413, "file_too_large", "The upload is too large for TMTHub.");
    throw new ApiError(502, "tmthub_error", `TMTHub answered ${response.status}${body.message ? `: ${body.message}` : ""}.`);
  };
  const json = async <T>(path: string, init?: RequestInit, notFound?: ApiError): Promise<T> => (await call(path, init, notFound)).json() as Promise<T>;
  const repoNotFound = new ApiError(404, "repository_not_found", "The repository does not exist.");
  const pathNotFound = new ApiError(404, "path_not_found", "The file or folder does not exist.");
  const repo = (name: string) => `/repos/${encodeURIComponent(hub.org)}/${encodeURIComponent(name)}`;

  return {
    hub,
    repoNotFound,
    pathNotFound,
    async list(): Promise<HubRepository[]> {
      const all: HubRepository[] = [];
      for (let page = 1; page <= 40; page += 1) {
        let batch: HubRepository[];
        try {
          batch = await json<HubRepository[]>(`/orgs/${encodeURIComponent(hub.org)}/repos?limit=50&page=${page}`, {}, new ApiError(404, "org_missing", ""));
        } catch (error) {
          if (error instanceof ApiError && error.code === "org_missing") return [];
          throw error;
        }
        all.push(...batch);
        if (batch.length < 50) break;
      }
      return all;
    },
    get: (name: string) => json<HubRepository>(repo(name), {}, repoNotFound),
    create: (body: Record<string, unknown>) => json<HubRepository>(`/orgs/${encodeURIComponent(hub.org)}/repos`, { method: "POST", body: JSON.stringify(body) }),
    edit: (name: string, body: Record<string, unknown>) => json<HubRepository>(repo(name), { method: "PATCH", body: JSON.stringify(body) }, repoNotFound),
    setTopics: (name: string, topics: string[]) => call(`${repo(name)}/topics`, { method: "PUT", body: JSON.stringify({ topics }) }, repoNotFound),
    remove: (name: string) => call(repo(name), { method: "DELETE" }, repoNotFound),
    async commits(name: string, branch: string, limit = 30): Promise<HubCommit[]> {
      try {
        return await json<HubCommit[]>(`${repo(name)}/commits?sha=${encodeURIComponent(branch)}&limit=${limit}&stat=false&verification=false&files=false`, {}, repoNotFound);
      } catch (error) {
        if (error instanceof ApiError && error.code === "tmthub_conflict") return []; // an empty repository has no commits
        throw error;
      }
    },
    async contents(name: string, segments: string[], ref: string): Promise<HubContent[] | HubContent> {
      const path = segments.length ? `/${encodePath(segments)}` : "";
      return json<HubContent[] | HubContent>(`${repo(name)}/contents${path}?ref=${encodeURIComponent(ref)}`, {}, pathNotFound);
    },
    /** File bytes through /media, which also resolves LFS pointers. */
    media: (name: string, segments: string[], ref: string) =>
      call(`${repo(name)}/media/${encodePath(segments)}?ref=${encodeURIComponent(ref)}`, { headers: { Accept: "*/*" }, signal: AbortSignal.timeout(15 * 60_000) }, pathNotFound),
    archive: (name: string, branch: string) =>
      call(`${repo(name)}/archive/${encodeURIComponent(branch)}.zip`, { headers: { Accept: "*/*" }, signal: AbortSignal.timeout(30 * 60_000) }, repoNotFound),
    async tree(name: string, branch: string): Promise<HubTreeEntry[]> {
      const entries: HubTreeEntry[] = [];
      for (let page = 1; page <= 100; page += 1) {
        const result = await json<{ tree: HubTreeEntry[] | null; truncated: boolean }>(
          `${repo(name)}/git/trees/${encodeURIComponent(branch)}?recursive=true&per_page=1000&page=${page}`, {}, new ApiError(404, "empty_tree", ""),
        ).catch((error: unknown) => {
          if (error instanceof ApiError && error.code === "empty_tree") return { tree: [], truncated: false };
          throw error;
        });
        entries.push(...(result.tree ?? []));
        if (!result.truncated) break;
      }
      return entries.filter((entry) => entry.type === "blob");
    },
    changeFiles: (name: string, body: Record<string, unknown>) =>
      json<unknown>(`${repo(name)}/contents`, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(15 * 60_000) }, repoNotFound),
  };
}

export type HubClient = ReturnType<typeof createHubClient>;

function authorOf(actor: CurrentUser) {
  return { name: actor.name || actor.email, email: actor.email };
}

/** Sends a TMTHub file or archive response through as a download, never rendered on this origin. */
async function pipeDownload(reply: FastifyReply, upstream: Response, fileName: string, contentType: string): Promise<FastifyReply> {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  reply.header("Content-Type", contentType);
  reply.header("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  reply.header("Cache-Control", "private, no-store");
  reply.header("X-Content-Type-Options", "nosniff");
  const length = upstream.headers.get("content-length");
  if (length) reply.header("Content-Length", length);
  if (!upstream.body) return reply.send(Buffer.alloc(0));
  return reply.send(Readable.fromWeb(upstream.body as unknown as WebReadableStream<Uint8Array>));
}

export function registerTmthubRepositoryRoutes(
  app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService, fetchImpl: HubFetch = fetch,
): void {
  if (!config.tmthub) throw new Error("registerTmthubRepositoryRoutes needs config.tmthub.");
  const client = createHubClient(config.tmthub, fetchImpl);
  const { hub } = client;
  const hubInfo = { url: hub.publicUrl, org: hub.org, orgUrl: `${hub.publicUrl}/${encodeURIComponent(hub.org)}` };

  const summary = (repo: HubRepository, projects: Map<number, ProjectRef>) => {
    const projectId = projectIdFromTopics(repo.topics);
    return {
      name: repo.name,
      description: repo.description ?? "",
      project: projectId ? projects.get(projectId) ?? { id: projectId, projectNo: "", name: "", status: "" } : null,
      fileCount: null,
      sizeBytes: Math.max(0, Number(repo.size) || 0) * 1024,
      createdAt: repo.created_at, createdBy: { id: 0, name: "" },
      updatedAt: repo.updated_at, updatedBy: { id: 0, name: "" },
      defaultBranch: repo.default_branch || "main",
      webUrl: repo.html_url,
      cloneUrl: repo.clone_url,
      empty: repo.empty,
    };
  };

  const projectIdValue = async (value: unknown): Promise<number | null> => {
    if (value === null || value === undefined || value === "") return null;
    const id = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, "validation_failed", "Project is invalid.");
    if (!(await loadProjects(database, [id])).has(id)) throw new ApiError(404, "project_not_found", "The project does not exist.");
    return id;
  };
  const withProjectTopic = (topics: string[] | undefined, projectId: number) =>
    [...(topics ?? []).filter((topic) => !PROJECT_TOPIC.test(topic)), `project-${projectId}`];

  const repoParam = (request: FastifyRequest) => repositoryName((request.params as Record<string, unknown>).repo);
  const queryPath = (request: FastifyRequest, allowRoot = true) => repositoryPath((request.query as Record<string, unknown>).path, allowRoot);
  const body = (request: FastifyRequest) => (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;

  app.get("/api/v1/download-center/repositories", async (request) => {
    await users.required(request);
    const repos = await client.list();
    const projects = await loadProjects(database, repos.flatMap((repo) => {
      const id = projectIdFromTopics(repo.topics);
      return id ? [id] : [];
    }));
    return {
      items: repos.map((repo) => summary(repo, projects)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name)),
      hub: hubInfo,
    };
  });

  app.post("/api/v1/download-center/repositories", async (request, reply) => {
    await users.demandPermission(request, MANAGE_PERMISSION);
    const actor = await users.required(request);
    const input = body(request);
    const name = repositoryName(input.name);
    const projectId = await projectIdValue(input.projectId);
    if (!projectId) throw new ApiError(400, "validation_failed", "Project is required.");
    const description = typeof input.description === "string" ? input.description.trim().slice(0, 1000) : "";
    let created: HubRepository;
    try {
      created = await client.create({ name, description, private: true, auto_init: true, default_branch: "main", readme: "Default" });
    } catch (error) {
      if (error instanceof ApiError && error.code === "tmthub_conflict") throw new ApiError(409, "repository_exists", "A repository with this name already exists.");
      throw error;
    }
    await client.setTopics(name, withProjectTopic([], projectId));
    request.log.info({ actorId: actor.id, repository: name, projectId }, "TMTHub repository created");
    return reply.code(201).send(summary({ ...created, topics: [`project-${projectId}`] }, await loadProjects(database, [projectId])));
  });

  app.get("/api/v1/download-center/repositories/:repo", async (request) => {
    await users.required(request);
    const repo = await client.get(repoParam(request));
    const projectId = projectIdFromTopics(repo.topics);
    const [projects, commits, canManage] = await Promise.all([
      loadProjects(database, projectId ? [projectId] : []),
      repo.empty ? Promise.resolve([] as HubCommit[]) : client.commits(repo.name, repo.default_branch || "main"),
      users.demandPermission(request, MANAGE_PERMISSION).then(() => true, () => false),
    ]);
    return {
      ...summary(repo, projects),
      canManage,
      hub: hubInfo,
      history: commits.map((commit) => ({
        at: commit.commit.author.date || commit.created,
        by: { id: 0, name: commit.commit.author.name },
        action: "commit" as const,
        message: commit.commit.message.split("\n")[0]!.slice(0, 500),
        path: "",
        files: 0,
        sha: commit.sha,
        url: commit.html_url,
      })),
    };
  });

  app.patch("/api/v1/download-center/repositories/:repo", async (request) => {
    await users.demandPermission(request, MANAGE_PERMISSION);
    await users.required(request);
    const name = repoParam(request);
    const input = body(request);
    let repo = await client.get(name);
    if ("description" in input) {
      repo = await client.edit(name, { description: typeof input.description === "string" ? input.description.trim().slice(0, 1000) : "" });
    }
    const projectId = "projectId" in input ? await projectIdValue(input.projectId) : null;
    if (projectId) {
      const topics = withProjectTopic(repo.topics, projectId);
      await client.setTopics(name, topics);
      repo = { ...repo, topics };
    }
    const id = projectIdFromTopics(repo.topics);
    return summary(repo, await loadProjects(database, id ? [id] : []));
  });

  app.delete("/api/v1/download-center/repositories/:repo", async (request, reply) => {
    await users.demandPermission(request, MANAGE_PERMISSION);
    const actor = await users.required(request);
    const name = repoParam(request);
    await client.remove(name);
    request.log.info({ actorId: actor.id, repository: name }, "TMTHub repository deleted");
    return reply.code(204).send();
  });

  const branchOf = async (name: string) => {
    const repo = await client.get(name);
    return { repo, branch: repo.default_branch || "main" };
  };

  app.get("/api/v1/download-center/repositories/:repo/tree", async (request) => {
    await users.required(request);
    const name = repoParam(request);
    const segments = queryPath(request);
    const { repo, branch } = await branchOf(name);
    if (repo.empty) return { path: segments.join("/"), entries: [], readme: null };
    const listing = await client.contents(name, segments, branch);
    if (!Array.isArray(listing)) throw client.pathNotFound;
    const entries = listing
      .map((item) => ({
        name: item.name, path: item.path, type: item.type === "dir" ? "dir" as const : "file" as const,
        sizeBytes: item.type === "dir" ? 0 : item.size, modifiedAt: item.last_commit_when ?? repo.updated_at,
      }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "en", { sensitivity: "base" }) : a.type === "dir" ? -1 : 1));
    const readmeEntry = entries.find((entry) => entry.type === "file" && /^readme(\.(md|markdown|txt))?$/i.test(entry.name));
    let readme: { name: string; path: string; content: string } | null = null;
    if (readmeEntry && readmeEntry.sizeBytes <= MAX_README_BYTES) {
      const content = decodeSource(new Uint8Array(await (await client.media(name, readmeEntry.path.split("/"), branch)).arrayBuffer()));
      if (content !== null) readme = { name: readmeEntry.name, path: readmeEntry.path, content };
    }
    return { path: segments.join("/"), entries, readme };
  });

  app.get("/api/v1/download-center/repositories/:repo/blob", async (request) => {
    await users.required(request);
    const name = repoParam(request);
    const segments = queryPath(request, false);
    const { branch } = await branchOf(name);
    const item = await client.contents(name, segments, branch);
    if (Array.isArray(item) || item.type === "dir") throw client.pathNotFound;
    const base = { path: item.path, name: item.name, sizeBytes: item.size, modifiedAt: item.last_commit_when ?? "" };
    if (item.size > MAX_VIEW_BYTES) return { ...base, content: null, reason: "too_large" as const };
    const content = decodeSource(new Uint8Array(await (await client.media(name, segments, branch)).arrayBuffer()));
    return content === null ? { ...base, content: null, reason: "binary" as const } : { ...base, content, reason: null };
  });

  const sendRaw = async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await users.required(request);
    const name = repoParam(request);
    const segments = queryPath(request, false);
    const { branch } = await branchOf(name);
    const upstream = await client.media(name, segments, branch);
    if (request.method === "HEAD") {
      await upstream.body?.cancel();
      return pipeDownload(reply, new Response(null, { headers: upstream.headers }), segments.at(-1) ?? "file", "application/octet-stream");
    }
    request.log.info({ actorId: actor.id, repository: name, path: segments.join("/") }, "TMTHub file downloaded");
    return pipeDownload(reply, upstream, segments.at(-1) ?? "file", "application/octet-stream");
  };
  app.get("/api/v1/download-center/repositories/:repo/raw", { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT }, exposeHeadRoute: false }, sendRaw);
  app.head("/api/v1/download-center/repositories/:repo/raw", { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT } }, sendRaw);

  const sendArchive = async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await users.required(request);
    const name = repoParam(request);
    if (queryPath(request).length > 0) {
      throw new ApiError(400, "folder_archive_unavailable", "TMTHub repositories download whole; clone the repository for a single folder.");
    }
    const { repo, branch } = await branchOf(name);
    if (repo.empty) throw new ApiError(404, "repository_empty", "The repository has no files yet.");
    const fileName = `${name}-${branch}.zip`;
    if (request.method === "HEAD") return pipeDownload(reply, new Response(null), fileName, "application/zip");
    request.log.info({ actorId: actor.id, repository: name }, "TMTHub archive downloaded");
    return pipeDownload(reply, await client.archive(name, branch), fileName, "application/zip");
  };
  app.get("/api/v1/download-center/repositories/:repo/archive", { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT }, exposeHeadRoute: false }, sendArchive);
  app.head("/api/v1/download-center/repositories/:repo/archive", { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT } }, sendArchive);

  /** One commit per upload: a .zip (optionally replacing every file) or a single file. */
  app.post("/api/v1/download-center/repositories/:repo/upload", { config: { rateLimit: REPOSITORY_UPLOAD_RATE_LIMIT } }, async (request) => {
    await users.demandPermission(request, MANAGE_PERMISSION);
    const actor = await users.required(request);
    const name = repoParam(request);
    const { branch } = await branchOf(name);
    const form = await readMultipartForm(request, config.documentStorage.maxFileSizeBytes);
    if (!form.file) throw new ApiError(400, "file_required", "Exactly one multipart file field named 'file' is required.");
    const target = repositoryPath(multipartText(form.values, "path", 1000));
    const message = multipartText(form.values, "message", 500) ?? "";
    const extract = multipartText(form.values, "extract", 10) === "true";
    const replace = multipartText(form.values, "replace", 10) === "true";
    const stripRoot = multipartText(form.values, "stripRoot", 10) !== "false";
    if (replace && target.length > 0) throw new ApiError(400, "validation_failed", "Replacing the repository only works from its root folder.");
    const fileName = uploadedFileName(form.file.filename);

    let files: Array<{ path: string[]; contents: Uint8Array }>;
    let skipped = 0;
    if (extract && /\.zip$/i.test(fileName)) {
      const plan = planZipExtraction(new Uint8Array(await readFile(form.file.filepath)), stripRoot);
      if (plan.files.length === 0) throw new ApiError(400, "empty_zip", "The zip holds no source files.");
      files = plan.files.map((file) => ({ path: [...target, ...file.path], contents: file.contents }));
      skipped = plan.skipped;
    } else {
      const single = repositoryPath(fileName, false);
      files = [{ path: [...target, ...single], contents: new Uint8Array(await readFile(form.file.filepath)) }];
    }

    const existing = new Map((await client.tree(name, branch)).map((entry) => [entry.path, entry.sha]));
    const uploaded = new Set(files.map((file) => file.path.join("/")));
    const changes: Array<Record<string, unknown>> = files.map((file) => {
      const path = file.path.join("/");
      const sha = existing.get(path);
      return { operation: sha ? "update" : "create", path, content: Buffer.from(file.contents).toString("base64"), ...(sha ? { sha } : {}) };
    });
    if (replace) {
      for (const [path, sha] of existing) if (!uploaded.has(path)) changes.push({ operation: "delete", path, sha });
    }
    if (changes.length > MAX_CHANGED_FILES) {
      throw new ApiError(413, "too_many_files", `One upload may change at most ${MAX_CHANGED_FILES} files; push larger changes with git.`);
    }
    await client.changeFiles(name, {
      branch,
      message: `${message || `Upload ${fileName}`}\n\nUploaded through Engineering Center (Download Center).`,
      author: authorOf(actor),
      files: changes,
    });
    request.log.info({ actorId: actor.id, repository: name, written: files.length, skipped, replace }, "TMTHub upload committed");
    return { written: files.length, skipped, fileCount: null, sizeBytes: null };
  });

  app.delete("/api/v1/download-center/repositories/:repo/files", async (request) => {
    await users.demandPermission(request, MANAGE_PERMISSION);
    const actor = await users.required(request);
    const name = repoParam(request);
    const segments = queryPath(request, false);
    const { branch } = await branchOf(name);
    const prefix = segments.join("/");
    const doomed = (await client.tree(name, branch)).filter((entry) => entry.path === prefix || entry.path.startsWith(`${prefix}/`));
    if (doomed.length === 0) throw client.pathNotFound;
    if (doomed.length > MAX_CHANGED_FILES) throw new ApiError(413, "too_many_files", "Delete a folder this large with git.");
    const note = typeof (request.query as Record<string, unknown>).message === "string" ? String((request.query as Record<string, unknown>).message).trim().slice(0, 500) : "";
    await client.changeFiles(name, {
      branch,
      message: `${note || `Delete ${prefix}`}\n\nDeleted through Engineering Center (Download Center).`,
      author: authorOf(actor),
      files: doomed.map((entry) => ({ operation: "delete", path: entry.path, sha: entry.sha })),
    });
    return { removed: doomed.length, fileCount: null, sizeBytes: null };
  });
}
