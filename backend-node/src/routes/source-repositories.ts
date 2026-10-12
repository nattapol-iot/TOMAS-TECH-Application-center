import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { unzipSync, Zip, ZipDeflate } from "fflate";
import sql from "mssql";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { DOCUMENT_DOWNLOAD_RATE_LIMIT, multipartText, readMultipartForm, resolveStoragePath, uploadedFileName } from "../document-storage.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";

/**
 * Source code repositories, one or more per project, shown in the Download Center.
 *
 *   <storage root>/source-repositories/<repo>/repo.json   (name, project, description, history)
 *   <storage root>/source-repositories/<repo>/files/...   (the source tree, as on a developer's disk)
 *
 * The tree is plain files on the NAS, so a developer may also copy into files/ directly; the page
 * browses it like GitHub (folders, code, README) and hands out single files or the whole tree as a zip.
 * Every signed-in member may read, as in the rest of the Download Center; project.write manages.
 */
export const REPOSITORIES_ROOT = "source-repositories";
const FILES_FOLDER = "files";
const META_FILE = "repo.json";
export const MANAGE_PERMISSION = "project.write";
const MAX_HISTORY = 200;
const MAX_TREE_ENTRIES = 2000;
const MAX_REPOSITORY_FILES = 50_000;
const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024;
export const MAX_VIEW_BYTES = 1024 * 1024;
export const MAX_README_BYTES = 256 * 1024;
const STREAM_CHUNK_BYTES = 1024 * 1024;
/** Many single files can follow each other when someone drops a folder's worth; zips stay the norm. */
export const REPOSITORY_UPLOAD_RATE_LIMIT = { max: 60, timeWindow: "1 minute" } as const;

export type RepositoryActor = { id: number; name: string };
export type RepositoryHistoryEntry = {
  at: string; by: RepositoryActor; action: "create" | "upload" | "delete" | "update"; message: string; path: string; files: number;
};
export type RepositoryMeta = {
  name: string; description: string; projectId: number | null;
  createdAt: string; createdBy: RepositoryActor; updatedAt: string; updatedBy: RepositoryActor;
  fileCount: number; sizeBytes: number; history: RepositoryHistoryEntry[];
};
export type TreeEntry = { name: string; path: string; type: "dir" | "file"; sizeBytes: number; modifiedAt: string };

/** GitHub-style repository names: letters, digits, dot, dash and underscore. */
export function repositoryName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name) || name.endsWith(".") || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) {
    throw new ApiError(400, "validation_failed", "Repository names use 1-100 letters, digits, '.', '-' or '_' and start with a letter or digit.");
  }
  return name;
}

/** Folders and files that are tooling noise rather than source: never listed, never extracted. */
export function isIgnoredName(name: string): boolean {
  return /^(\.git|__MACOSX|node_modules|@eaDir|#recycle|\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(name)
    || /\.(uploading|writing)-[0-9a-f-]{36}\.tmp$/i.test(name);
}

/**
 * A path inside a repository as the page sends it ("src/main.c"). Empty means the root. Each segment
 * must be an ordinary name, so nothing can climb out of the tree or reach an ignored folder.
 */
export function repositoryPath(value: unknown, allowRoot = true): string[] {
  const raw = typeof value === "string" ? value.trim().replace(/^\/+|\/+$/g, "") : "";
  if (!raw) {
    if (allowRoot) return [];
    throw new ApiError(400, "validation_failed", "A file path is required.");
  }
  if (raw.length > 1000) throw new ApiError(400, "validation_failed", "The path is too long.");
  const segments = raw.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || segment.length > 255 || /[\\:*?"<>|\p{Cc}]/u.test(segment)
      || /[. ]$/.test(segment) || isIgnoredName(segment)) {
      throw new ApiError(400, "invalid_path", "The path is invalid.");
    }
  }
  return segments;
}

function actorOf(user: CurrentUser): RepositoryActor {
  return { id: user.id, name: user.name };
}

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function actorValue(value: unknown): RepositoryActor {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { id: typeof body.id === "number" ? body.id : 0, name: text(body.name, 200) };
}

/** repo.json is ours, but it lives on a share people can edit: anything malformed reads as defaults. */
export function parseRepositoryMeta(raw: string, folder: string): RepositoryMeta {
  let body: Record<string, unknown> = {};
  try {
    const value = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) body = value as Record<string, unknown>;
  } catch {
    // defaults below
  }
  const history = Array.isArray(body.history) ? body.history.flatMap((item): RepositoryHistoryEntry[] => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const action = entry.action === "create" || entry.action === "upload" || entry.action === "delete" || entry.action === "update" ? entry.action : null;
    if (!action) return [];
    return [{ at: text(entry.at, 40), by: actorValue(entry.by), action, message: text(entry.message, 500), path: text(entry.path, 1000), files: typeof entry.files === "number" ? entry.files : 0 }];
  }) : [];
  return {
    name: folder,
    description: text(body.description, 1000),
    projectId: typeof body.projectId === "number" && Number.isSafeInteger(body.projectId) && body.projectId > 0 ? body.projectId : null,
    createdAt: text(body.createdAt, 40), createdBy: actorValue(body.createdBy),
    updatedAt: text(body.updatedAt, 40), updatedBy: actorValue(body.updatedBy),
    fileCount: typeof body.fileCount === "number" ? body.fileCount : 0,
    sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : 0,
    history: history.slice(0, MAX_HISTORY),
  };
}

async function writeAtomic(path: string, contents: Uint8Array | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.writing-${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Every file under a folder, depth first, skipping ignored names and links. */
export async function walkFiles(root: string, prefix: string[] = [], found: Array<{ path: string; absolute: string; sizeBytes: number; modifiedAt: Date }> = []) {
  let entries;
  try {
    entries = await readdir(join(root, ...prefix), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (isIgnoredName(entry.name) || entry.isSymbolicLink()) continue;
    if (found.length >= MAX_REPOSITORY_FILES) break;
    if (entry.isDirectory()) await walkFiles(root, [...prefix, entry.name], found);
    else if (entry.isFile()) {
      const absolute = join(root, ...prefix, entry.name);
      try {
        const details = await stat(absolute);
        found.push({ path: [...prefix, entry.name].join("/"), absolute, sizeBytes: details.size, modifiedAt: details.mtime });
      } catch {
        // removed while walking
      }
    }
  }
  return found;
}

/** One folder of the tree, folders first, as GitHub shows it. */
export async function readTree(filesRoot: string, segments: string[]): Promise<TreeEntry[]> {
  const folder = join(filesRoot, ...segments);
  let entries;
  try {
    const details = await stat(folder);
    if (!details.isDirectory()) throw new ApiError(404, "path_not_found", "The folder does not exist.");
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && segments.length === 0) return [];
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") {
      throw new ApiError(404, "path_not_found", "The folder does not exist.");
    }
    throw new ApiError(503, "document_storage_unavailable", "The repository could not be read.");
  }
  const result: TreeEntry[] = [];
  for (const entry of entries.filter((item) => !isIgnoredName(item.name) && !item.isSymbolicLink()).slice(0, MAX_TREE_ENTRIES)) {
    if (!entry.isDirectory() && !entry.isFile()) continue;
    try {
      const details = await stat(join(folder, entry.name));
      result.push({
        name: entry.name, path: [...segments, entry.name].join("/"), type: entry.isDirectory() ? "dir" : "file",
        sizeBytes: entry.isDirectory() ? 0 : details.size, modifiedAt: details.mtime.toISOString(),
      });
    } catch {
      // removed while listing
    }
  }
  return result.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "en", { sensitivity: "base" }) : a.type === "dir" ? -1 : 1));
}

/** Text the page can show; anything with a NUL byte in its head is treated as binary. */
export function decodeSource(bytes: Uint8Array): string | null {
  const head = bytes.subarray(0, 8000);
  if (head.includes(0)) return null;
  const decoded = Buffer.from(bytes).toString("utf8");
  return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
}

/**
 * Files to write from an uploaded zip, in repository paths. A GitHub "Download ZIP" wraps everything
 * in one "name-main/" folder; stripRoot drops that single top folder. Tooling folders are skipped and
 * the uncompressed total is capped before anything is inflated.
 */
export function planZipExtraction(data: Uint8Array, stripRoot: boolean): { files: Array<{ path: string[]; contents: Uint8Array }>; skipped: number } {
  let declared = 0;
  let count = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (file) => {
        if (file.name.endsWith("/")) return false;
        count += 1;
        declared += file.originalSize;
        if (count > MAX_REPOSITORY_FILES) throw new ApiError(413, "repository_too_large", `A zip may hold at most ${MAX_REPOSITORY_FILES} files.`);
        if (declared > MAX_EXTRACTED_BYTES) throw new ApiError(413, "repository_too_large", "The zip expands to more than 1 GB.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_zip", "The file is not a readable zip archive.");
  }
  const names = Object.keys(entries).map((name) => name.replaceAll("\\", "/").replace(/^\/+/, ""));
  const tops = new Set(names.map((name) => name.split("/")[0]));
  const strip = stripRoot && tops.size === 1 && names.every((name) => name.includes("/"));
  const files: Array<{ path: string[]; contents: Uint8Array }> = [];
  let skipped = 0;
  for (const [original, contents] of Object.entries(entries)) {
    const name = original.replaceAll("\\", "/").replace(/^\/+/, "");
    const segments = name.split("/").filter(Boolean).slice(strip ? 1 : 0);
    if (segments.length === 0 || segments.some((segment) => isIgnoredName(segment))) { skipped += 1; continue; }
    try {
      files.push({ path: repositoryPath(segments.join("/"), false), contents });
    } catch {
      skipped += 1;
    }
  }
  return { files, skipped };
}

export type ProjectRef = { id: number; projectNo: string; name: string; status: string };

export async function loadProjects(database: Database, ids: number[]): Promise<Map<number, ProjectRef>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const result = await database.query<{ id: number | string; project_no: string; name: string; status: string }>(`
    SELECT p.id, p.project_no, p.name, p.status FROM dbo.projects p
    WHERE p.deleted_at IS NULL AND p.id IN (SELECT TRY_CONVERT(bigint, value) FROM STRING_SPLIT(@ids, N','));
  `, (request) => request.input("ids", sql.NVarChar(sql.MAX), unique.join(",")));
  return new Map(result.recordset.map((row) => [Number(row.id), { id: Number(row.id), projectNo: row.project_no, name: row.name, status: row.status }]));
}

export function registerSourceRepositoryRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  const storage = config.documentStorage;
  const rootPath = resolveStoragePath(storage, REPOSITORIES_ROOT);
  const repoPath = (name: string) => resolveStoragePath(storage, `${REPOSITORIES_ROOT}/${name}`);
  const filesPath = (name: string) => resolveStoragePath(storage, `${REPOSITORIES_ROOT}/${name}/${FILES_FOLDER}`);

  const readMeta = async (name: string): Promise<RepositoryMeta> => {
    let raw: string;
    try {
      const details = await stat(repoPath(name));
      if (!details.isDirectory()) throw new Error("not a folder");
    } catch {
      throw new ApiError(404, "repository_not_found", "The repository does not exist.");
    }
    try {
      raw = await readFile(join(repoPath(name), META_FILE), "utf8");
    } catch {
      raw = "{}"; // a folder copied onto the share by hand is still a repository
    }
    return parseRepositoryMeta(raw, name);
  };

  const saveMeta = async (meta: RepositoryMeta) => {
    // The folder is the name; repo.json keeps everything else.
    const body: Partial<RepositoryMeta> = { ...meta };
    delete body.name;
    await writeAtomic(join(repoPath(meta.name), META_FILE), JSON.stringify(body, null, 2));
  };

  /** Recount after a change, record who did what, and save. */
  const commit = async (meta: RepositoryMeta, actor: CurrentUser, entry: Omit<RepositoryHistoryEntry, "at" | "by">) => {
    const files = await walkFiles(filesPath(meta.name));
    const now = new Date().toISOString();
    meta.fileCount = files.length;
    meta.sizeBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
    meta.updatedAt = now;
    meta.updatedBy = actorOf(actor);
    meta.history = [{ at: now, by: actorOf(actor), ...entry }, ...meta.history].slice(0, MAX_HISTORY);
    await saveMeta(meta);
  };

  const summary = (meta: RepositoryMeta, projects: Map<number, ProjectRef>) => ({
    name: meta.name, description: meta.description,
    project: meta.projectId ? projects.get(meta.projectId) ?? { id: meta.projectId, projectNo: "", name: "", status: "" } : null,
    fileCount: meta.fileCount, sizeBytes: meta.sizeBytes,
    createdAt: meta.createdAt, createdBy: meta.createdBy, updatedAt: meta.updatedAt, updatedBy: meta.updatedBy,
  });

  const projectIdValue = async (value: unknown): Promise<number | null> => {
    if (value === null || value === undefined || value === "") return null;
    const id = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, "validation_failed", "Project is invalid.");
    if (!(await loadProjects(database, [id])).has(id)) throw new ApiError(404, "project_not_found", "The project does not exist.");
    return id;
  };

  const repoParam = (request: FastifyRequest) => repositoryName((request.params as Record<string, unknown>).repo);
  const queryPath = (request: FastifyRequest, allowRoot = true) => repositoryPath((request.query as Record<string, unknown>).path, allowRoot);

  app.get("/api/v1/download-center/repositories", async (request) => {
    await users.required(request);
    let folders;
    try {
      folders = await readdir(rootPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { items: [], hub: null };
      throw new ApiError(503, "document_storage_unavailable", "The repository folder could not be read.");
    }
    const metas: RepositoryMeta[] = [];
    for (const folder of folders.filter((entry) => entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(entry.name))) {
      try {
        metas.push(await readMeta(folder.name));
      } catch {
        // one unreadable folder must not hide the others
      }
    }
    const projects = await loadProjects(database, metas.flatMap((meta) => (meta.projectId ? [meta.projectId] : [])));
    return { items: metas.map((meta) => summary(meta, projects)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name)), hub: null };
  });

  app.post("/api/v1/download-center/repositories", async (request, reply) => {
    await users.demandPermission(request, MANAGE_PERMISSION);
    const actor = await users.required(request);
    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const name = repositoryName(body.name);
    const projectId = await projectIdValue(body.projectId);
    if (!projectId) throw new ApiError(400, "validation_failed", "Project is required.");
    const description = text(body.description, 1000);
    const existing = (await readdir(rootPath).catch(() => [] as string[])).some((folder) => folder.toLowerCase() === name.toLowerCase());
    if (existing) throw new ApiError(409, "repository_exists", "A repository with this name already exists.");
    const now = new Date().toISOString();
    const meta: RepositoryMeta = {
      name, description, projectId, createdAt: now, createdBy: actorOf(actor), updatedAt: now, updatedBy: actorOf(actor),
      fileCount: 0, sizeBytes: 0, history: [{ at: now, by: actorOf(actor), action: "create", message: description, path: "", files: 0 }],
    };
    try {
      await mkdir(filesPath(name), { recursive: true });
      await saveMeta(meta);
    } catch {
      throw new ApiError(503, "document_storage_unavailable", "The repository could not be created in configured storage.");
    }
    request.log.info({ actorId: actor.id, repository: name, projectId }, "Source repository created");
    return reply.code(201).send(summary(meta, await loadProjects(database, [projectId])));
  });

  app.get("/api/v1/download-center/repositories/:repo", async (request) => {
    await users.required(request);
    const meta = await readMeta(repoParam(request));
    const projects = await loadProjects(database, meta.projectId ? [meta.projectId] : []);
    const canManage = await users.demandPermission(request, MANAGE_PERMISSION).then(() => true, () => false);
    return { ...summary(meta, projects), history: meta.history, canManage };
  });

  app.patch("/api/v1/download-center/repositories/:repo", async (request) => {
    await users.demandPermission(request, MANAGE_PERMISSION);
    const actor = await users.required(request);
    const meta = await readMeta(repoParam(request));
    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    if ("description" in body) meta.description = text(body.description, 1000);
    if ("projectId" in body) meta.projectId = (await projectIdValue(body.projectId)) ?? meta.projectId;
    await commit(meta, actor, { action: "update", message: "", path: "", files: 0 });
    return summary(meta, await loadProjects(database, meta.projectId ? [meta.projectId] : []));
  });

  app.delete("/api/v1/download-center/repositories/:repo", async (request, reply) => {
    await users.demandPermission(request, MANAGE_PERMISSION);
    const actor = await users.required(request);
    const meta = await readMeta(repoParam(request));
    try {
      await rm(repoPath(meta.name), { recursive: true, force: true });
    } catch {
      throw new ApiError(503, "document_storage_unavailable", "The repository could not be removed from configured storage.");
    }
    request.log.info({ actorId: actor.id, repository: meta.name, projectId: meta.projectId, fileCount: meta.fileCount }, "Source repository deleted");
    return reply.code(204).send();
  });

  app.get("/api/v1/download-center/repositories/:repo/tree", async (request) => {
    await users.required(request);
    const meta = await readMeta(repoParam(request));
    const segments = queryPath(request);
    const entries = await readTree(filesPath(meta.name), segments);
    const readmeEntry = entries.find((entry) => entry.type === "file" && /^readme(\.(md|markdown|txt))?$/i.test(entry.name));
    let readme: { name: string; path: string; content: string } | null = null;
    if (readmeEntry && readmeEntry.sizeBytes <= MAX_README_BYTES) {
      const content = decodeSource(await readFile(join(filesPath(meta.name), ...repositoryPath(readmeEntry.path, false))).catch(() => new Uint8Array([0])));
      if (content !== null) readme = { name: readmeEntry.name, path: readmeEntry.path, content };
    }
    return { path: segments.join("/"), entries, readme };
  });

  const fileDetails = async (request: FastifyRequest) => {
    const meta = await readMeta(repoParam(request));
    const segments = queryPath(request, false);
    const absolute = join(filesPath(meta.name), ...segments);
    try {
      const details = await stat(absolute);
      if (!details.isFile()) throw new Error("not a file");
      return { meta, segments, absolute, sizeBytes: details.size, modifiedAt: details.mtime };
    } catch {
      throw new ApiError(404, "path_not_found", "The file does not exist.");
    }
  };

  app.get("/api/v1/download-center/repositories/:repo/blob", async (request) => {
    await users.required(request);
    const file = await fileDetails(request);
    const base = { path: file.segments.join("/"), name: file.segments.at(-1) ?? "", sizeBytes: file.sizeBytes, modifiedAt: file.modifiedAt.toISOString() };
    if (file.sizeBytes > MAX_VIEW_BYTES) return { ...base, content: null, reason: "too_large" as const };
    const content = decodeSource(await readFile(file.absolute));
    return content === null ? { ...base, content: null, reason: "binary" as const } : { ...base, content, reason: null };
  });

  const sendRaw = async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await users.required(request);
    const file = await fileDetails(request);
    const name = file.segments.at(-1) ?? "file";
    const asciiName = name.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
    // Always a download, never rendered: source can be HTML or SVG and must not run on this origin.
    reply.header("Content-Type", "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    reply.header("Cache-Control", "private, no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Length", String(file.sizeBytes));
    if (request.method === "HEAD") return reply.send();
    request.log.info({ actorId: actor.id, repository: file.meta.name, path: file.segments.join("/") }, "Source repository file downloaded");
    return reply.send(createReadStream(file.absolute, { highWaterMark: STREAM_CHUNK_BYTES }));
  };
  app.get("/api/v1/download-center/repositories/:repo/raw", { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT }, exposeHeadRoute: false }, sendRaw);
  app.head("/api/v1/download-center/repositories/:repo/raw", { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT } }, sendRaw);

  const sendArchive = async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await users.required(request);
    const meta = await readMeta(repoParam(request));
    const segments = queryPath(request);
    const base = filesPath(meta.name);
    const files = await walkFiles(base, segments);
    if (segments.length > 0 && files.length === 0) {
      const details = await stat(join(base, ...segments)).catch(() => null);
      if (!details?.isDirectory()) throw new ApiError(404, "path_not_found", "The folder does not exist.");
    }
    const archiveName = `${[meta.name, ...segments].join("-")}.zip`;
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="${archiveName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(archiveName)}`);
    reply.header("Cache-Control", "private, no-store");
    if (request.method === "HEAD") return reply.send();
    request.log.info({ actorId: actor.id, repository: meta.name, path: segments.join("/"), fileCount: files.length }, "Source repository archive downloaded");

    // Streamed: the zip is built while it is sent, so a large tree never sits in memory.
    const output = new PassThrough();
    const zip = new Zip((error, chunk, final) => {
      if (error) { output.destroy(error); return; }
      output.write(chunk);
      if (final) output.end();
    });
    const prefix = [meta.name, ...segments].join("/");
    void (async () => {
      for (const file of files) {
        const entry = new ZipDeflate(`${prefix}/${file.path.slice(segments.length ? segments.join("/").length + 1 : 0)}`, { level: 6 });
        entry.mtime = file.modifiedAt;
        zip.add(entry);
        for await (const chunk of createReadStream(file.absolute, { highWaterMark: STREAM_CHUNK_BYTES })) {
          entry.push(chunk as Buffer);
          if (output.writableNeedDrain) await once(output, "drain");
        }
        entry.push(new Uint8Array(0), true);
      }
      zip.end();
    })().catch((error: unknown) => output.destroy(error instanceof Error ? error : new Error(String(error))));
    return reply.send(output);
  };
  app.get("/api/v1/download-center/repositories/:repo/archive", { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT }, exposeHeadRoute: false }, sendArchive);
  app.head("/api/v1/download-center/repositories/:repo/archive", { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT } }, sendArchive);

  /**
   * One file per request (the multipart limit is one file). A .zip with extract=true unpacks into the
   * target folder; replace=true swaps the whole tree for the zip's contents, like pushing a new version.
   */
  app.post("/api/v1/download-center/repositories/:repo/upload", { config: { rateLimit: REPOSITORY_UPLOAD_RATE_LIMIT } }, async (request) => {
    await users.demandPermission(request, MANAGE_PERMISSION);
    const actor = await users.required(request);
    const meta = await readMeta(repoParam(request));
    const form = await readMultipartForm(request, storage.maxFileSizeBytes);
    if (!form.file) throw new ApiError(400, "file_required", "Exactly one multipart file field named 'file' is required.");
    const target = repositoryPath(multipartText(form.values, "path", 1000));
    const message = multipartText(form.values, "message", 500) ?? "";
    const extract = multipartText(form.values, "extract", 10) === "true";
    const replace = multipartText(form.values, "replace", 10) === "true";
    const stripRoot = multipartText(form.values, "stripRoot", 10) !== "false";
    if (replace && target.length > 0) throw new ApiError(400, "validation_failed", "Replacing the repository only works from its root folder.");
    const fileName = uploadedFileName(form.file.filename);
    const base = filesPath(meta.name);

    let written = 0;
    let skipped = 0;
    try {
      if (extract && /\.zip$/i.test(fileName)) {
        const plan = planZipExtraction(new Uint8Array(await readFile(form.file.filepath)), stripRoot);
        skipped = plan.skipped;
        if (plan.files.length === 0) throw new ApiError(400, "empty_zip", "The zip holds no source files.");
        if (replace) {
          // Build the new tree beside the old one, then swap, so a failed upload leaves the old version intact.
          const staging = join(repoPath(meta.name), `.staging-${randomUUID()}`);
          const retired = join(repoPath(meta.name), `.retired-${randomUUID()}`);
          try {
            for (const file of plan.files) await writeAtomic(join(staging, ...target, ...file.path), file.contents);
            await rename(base, retired).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
            try {
              await rename(staging, base);
            } catch (error) {
              await rename(retired, base).catch(() => undefined);
              throw error;
            }
            await rm(retired, { recursive: true, force: true }).catch(() => undefined);
          } finally {
            await rm(staging, { recursive: true, force: true }).catch(() => undefined);
          }
        } else {
          for (const file of plan.files) await writeAtomic(join(base, ...target, ...file.path), file.contents);
        }
        written = plan.files.length;
      } else {
        const name = repositoryPath(fileName, false);
        if (name.length !== 1) throw new ApiError(400, "invalid_file_name", "The uploaded file name is invalid.");
        await writeAtomic(join(base, ...target, name[0]!), new Uint8Array(await readFile(form.file.filepath)));
        written = 1;
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      request.log.error({ err: error, repository: meta.name }, "Source repository upload failed");
      throw new ApiError(503, "document_storage_unavailable", "The files could not be written to configured storage.");
    }
    await commit(meta, actor, { action: "upload", message: message || fileName, path: target.join("/"), files: written });
    request.log.info({ actorId: actor.id, repository: meta.name, path: target.join("/"), written, skipped, replace }, "Source repository upload");
    return { written, skipped, fileCount: meta.fileCount, sizeBytes: meta.sizeBytes };
  });

  app.delete("/api/v1/download-center/repositories/:repo/files", async (request) => {
    await users.demandPermission(request, MANAGE_PERMISSION);
    const actor = await users.required(request);
    const meta = await readMeta(repoParam(request));
    const segments = queryPath(request, false);
    const absolute = join(filesPath(meta.name), ...segments);
    const details = await stat(absolute).catch(() => null);
    if (!details || (!details.isFile() && !details.isDirectory())) throw new ApiError(404, "path_not_found", "The file does not exist.");
    const removed = details.isDirectory() ? (await walkFiles(filesPath(meta.name), segments)).length : 1;
    try {
      await rm(absolute, { recursive: true, force: true });
    } catch {
      throw new ApiError(503, "document_storage_unavailable", "The file could not be removed from configured storage.");
    }
    const message = text((request.query as Record<string, unknown>).message, 500);
    await commit(meta, actor, { action: "delete", message, path: segments.join("/"), files: removed });
    return { removed, fileCount: meta.fileCount, sizeBytes: meta.sizeBytes };
  });
}
