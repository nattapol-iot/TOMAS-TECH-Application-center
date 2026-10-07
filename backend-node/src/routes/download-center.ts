import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { DOCUMENT_DOWNLOAD_RATE_LIMIT, contentTypeFor, resolveStoragePath } from "../document-storage.js";
import type { CurrentUserService } from "../users.js";

/**
 * Download Center: department software and files kept on the NAS, under the document storage root.
 *
 *   <storage root>/download-center/<category folder>/<file>
 *   <storage root>/download-center/<category folder>/_info.json   (optional titles and descriptions)
 *
 * Admins publish by copying files into the share (\\NAS\IoT Department\IoT Team Center\download-center);
 * the API only lists and streams what is there. Only files that the listing shows can be downloaded,
 * so hidden files and anything outside the folder are unreachable by construction.
 */
export const DOWNLOAD_CENTER_ROOT = "download-center";
const INFO_FILE = "_info.json";
const MAX_CATEGORIES = 100;
const MAX_FILES_PER_CATEGORY = 500;
/**
 * The files sit on an SMB share behind the VM mount, where every read is a network round trip.
 * The default 64 KB stream chunk makes installer downloads crawl; 1 MB reads keep the pipe full.
 */
const STREAM_CHUNK_BYTES = 1024 * 1024;

export type DownloadFile = {
  name: string;
  title: string;
  description: string;
  version: string;
  recommended: boolean;
  sizeBytes: number;
  modifiedAt: string;
};

export type DownloadCategory = {
  folder: string;
  title: string;
  description: string;
  order: number;
  files: DownloadFile[];
};

type FileInfo = { title?: string; description?: string; version?: string; recommended?: boolean; order?: number };
type FolderInfo = { title?: string; description?: string; order?: number; files?: Record<string, FileInfo> };

/** Names people never mean to publish: dot files, _info.json, NAS recycle bins, partial copies. */
export function isPublishedName(name: string): boolean {
  if (!name || name.startsWith(".") || name.startsWith("_") || name.startsWith("#") || name.startsWith("~$")) return false;
  if (/\.(tmp|part|partial|crdownload)$/i.test(name)) return false;
  return !/^(thumbs\.db|desktop\.ini|\.ds_store)$/i.test(name);
}

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function order(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 1000;
}

/** _info.json is written by hand on the share, so anything malformed is ignored rather than fatal. */
export function parseFolderInfo(raw: string): FolderInfo {
  try {
    // Windows editors (Notepad) save UTF-8 with a byte order mark, which JSON.parse rejects.
    const value = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const body = value as Record<string, unknown>;
    const files: Record<string, FileInfo> = {};
    if (body.files && typeof body.files === "object" && !Array.isArray(body.files)) {
      for (const [name, rawFile] of Object.entries(body.files as Record<string, unknown>)) {
        if (!rawFile || typeof rawFile !== "object" || Array.isArray(rawFile)) continue;
        const file = rawFile as Record<string, unknown>;
        files[name] = {
          title: text(file.title, 200), description: text(file.description, 1000), version: text(file.version, 40),
          recommended: file.recommended === true, order: order(file.order),
        };
      }
    }
    return { title: text(body.title, 200), description: text(body.description, 1000), order: order(body.order), files };
  } catch {
    return {};
  }
}

async function readInfo(folderPath: string): Promise<FolderInfo> {
  try {
    return parseFolderInfo(await readFile(join(folderPath, INFO_FILE), "utf8"));
  } catch {
    return {};
  }
}

/** Reads the published categories and files. A missing download-center folder is simply empty. */
export async function readDownloadCatalog(rootPath: string): Promise<DownloadCategory[]> {
  let folders;
  try {
    folders = await readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new ApiError(503, "document_storage_unavailable", "The Download Center folder could not be read.");
  }

  const categories: DownloadCategory[] = [];
  for (const folder of folders.filter((entry) => entry.isDirectory() && isPublishedName(entry.name)).slice(0, MAX_CATEGORIES)) {
    const folderPath = join(rootPath, folder.name);
    const info = await readInfo(folderPath);
    let entries;
    try {
      entries = await readdir(folderPath, { withFileTypes: true });
    } catch {
      continue; // one unreadable folder must not hide the others
    }
    const files: Array<DownloadFile & { order: number }> = [];
    for (const entry of entries.filter((item) => item.isFile() && isPublishedName(item.name)).slice(0, MAX_FILES_PER_CATEGORY)) {
      try {
        const details = await stat(join(folderPath, entry.name));
        const meta = info.files?.[entry.name] ?? {};
        files.push({
          name: entry.name,
          title: meta.title || entry.name,
          description: meta.description ?? "",
          version: meta.version ?? "",
          recommended: meta.recommended === true,
          sizeBytes: details.size,
          modifiedAt: details.mtime.toISOString(),
          order: meta.order ?? 1000,
        });
      } catch {
        // deleted while listing
      }
    }
    files.sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.order - b.order || a.title.localeCompare(b.title, "th"));
    categories.push({
      folder: folder.name,
      title: info.title || folder.name,
      description: info.description ?? "",
      order: info.order ?? 1000,
      files: files.map((file) => ({
        name: file.name, title: file.title, description: file.description, version: file.version,
        recommended: file.recommended, sizeBytes: file.sizeBytes, modifiedAt: file.modifiedAt,
      })),
    });
  }
  return categories.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "th"));
}

/** A single "bytes=start-end" range (the only form browsers send to resume). null = whole file. */
export function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null; // multiple or odd ranges: send the whole file
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

export function registerDownloadCenterRoutes(app: FastifyInstance, config: AppConfig, _database: Database, users: CurrentUserService): void {
  const rootPath = resolveStoragePath(config.documentStorage, DOWNLOAD_CENTER_ROOT);

  // Every signed-in member of the department may browse and download.
  app.get("/api/v1/download-center", async (request) => {
    await users.required(request);
    return { categories: await readDownloadCatalog(rootPath) };
  });

  const sendFile = async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const folder = typeof query.category === "string" ? query.category : "";
    const name = typeof query.file === "string" ? query.file : "";
    // Only what the listing publishes can be fetched: no path syntax ever reaches the file system.
    const category = (await readDownloadCatalog(rootPath)).find((item) => item.folder === folder);
    const file = category?.files.find((item) => item.name === name);
    if (!category || !file) throw new ApiError(404, "download_not_found", "The file is no longer available in the Download Center.");

    const path = resolveStoragePath(config.documentStorage, `${DOWNLOAD_CENTER_ROOT}/${category.folder}/${file.name}`);
    let size: number;
    try {
      const details = await stat(path);
      if (!details.isFile()) throw new Error("not a file");
      size = details.size;
    } catch {
      throw new ApiError(404, "download_not_found", "The file is no longer available in the Download Center.");
    }
    const asciiName = file.name.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
    reply.header("Content-Type", contentTypeFor(file.name));
    reply.header("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    reply.header("Cache-Control", "private, no-store");
    reply.header("Accept-Ranges", "bytes");
    reply.header("Last-Modified", new Date(file.modifiedAt).toUTCString());
    // The page checks with HEAD before handing the link to the browser. Answer it here: Fastify's
    // automatic HEAD route would drain a whole stream, i.e. read the file from the NAS for nothing.
    if (request.method === "HEAD") {
      reply.header("Content-Length", String(size));
      return reply.send();
    }
    request.log.info({ actorId: actor.id, category: category.folder, file: file.name, sizeBytes: size, range: request.headers.range }, "Download Center file downloaded");
    // Browsers resume an interrupted download with a Range request; honour it unless the file changed.
    const range = parseByteRange(request.headers.range, size);
    const ifRange = request.headers["if-range"];
    if (range === "invalid") {
      reply.header("Content-Range", `bytes */${size}`);
      return reply.code(416).send();
    }
    if (range && (!ifRange || ifRange === new Date(file.modifiedAt).toUTCString())) {
      reply.code(206);
      reply.header("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
      reply.header("Content-Length", String(range.end - range.start + 1));
      return reply.send(createReadStream(path, { start: range.start, end: range.end, highWaterMark: STREAM_CHUNK_BYTES }));
    }
    reply.header("Content-Length", String(size));
    return reply.send(createReadStream(path, { highWaterMark: STREAM_CHUNK_BYTES }));
  };
  app.get("/api/v1/download-center/content", { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT }, exposeHeadRoute: false }, sendFile);
  app.head("/api/v1/download-center/content", { config: { rateLimit: DOCUMENT_DOWNLOAD_RATE_LIMIT } }, sendFile);
}
