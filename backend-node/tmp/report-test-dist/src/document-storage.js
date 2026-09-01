import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { ApiError } from "./errors.js";
export const DOCUMENT_EXTENSIONS = new Set([
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt",
    ".dwg", ".dxf", ".zip", ".jpg", ".jpeg", ".png", ".mp4",
]);
export const SUPPLIER_QUOTATION_EXTENSIONS = new Set([".pdf", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png"]);
/**
 * Per-route limits for the document endpoints, carried across from the C# API's
 * `document-upload` and `document-download` policies.
 *
 * The global limiter in `app.ts` allows 300 requests a minute, which is the
 * right ceiling for small JSON reads and far too generous for routes that move
 * whole files over the NAS link — one careless client can saturate it, and each
 * download re-hashes the file end to end to verify integrity. Fastify merges a
 * route's `config.rateLimit` over the global registration, so the partition key
 * stays the caller's identity rather than their IP.
 */
export const DOCUMENT_UPLOAD_RATE_LIMIT = { max: 6, timeWindow: "1 minute" };
export const DOCUMENT_DOWNLOAD_RATE_LIMIT = { max: 12, timeWindow: "1 minute" };
const MIME_TYPES = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".dwg": "application/acad",
    ".dxf": "application/dxf",
    ".zip": "application/zip",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".mp4": "video/mp4",
};
function rootWithSeparator(rootPath) {
    return rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
}
export function resolveStoragePath(storage, storageKey) {
    if (!storageKey || isAbsolute(storageKey) || storageKey.includes("\\")) {
        throw new ApiError(500, "invalid_storage_key", "Stored document path is invalid.");
    }
    const segments = storageKey.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
        throw new ApiError(500, "invalid_storage_key", "Stored document path is invalid.");
    }
    const target = resolve(storage.rootPath, ...segments);
    if (target !== storage.rootPath && !target.startsWith(rootWithSeparator(storage.rootPath))) {
        throw new ApiError(500, "invalid_storage_key", "Stored document path escapes the configured storage root.");
    }
    return target;
}
function storageFailure(error, message) {
    if (error instanceof ApiError)
        throw error;
    throw new ApiError(503, "document_storage_unavailable", message);
}
export function storageKey(prefix, extension, now = new Date()) {
    const year = String(now.getUTCFullYear()).padStart(4, "0");
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${prefix}/${year}/${month}/${randomUUID()}${extension}`;
}
export function uploadedFileName(fileName) {
    const value = basename(fileName.replaceAll("\\", "/")).trim();
    if (!value ||
        value.length > 500 ||
        [...value].some((character) => {
            const code = character.charCodeAt(0);
            return code <= 31 || code === 127;
        })) {
        throw new ApiError(400, "invalid_file_name", "The uploaded file name is invalid.");
    }
    return value;
}
export function validateFileExtension(fileName, allowed = DOCUMENT_EXTENSIONS) {
    const extension = extname(fileName).toLowerCase();
    if (!extension || !allowed.has(extension)) {
        throw new ApiError(415, "file_type_not_allowed", `Files with extension '${extension}' are not allowed.`, {
            allowedExtensions: [...allowed].sort(),
        });
    }
    return extension;
}
export function contentTypeFor(fileName) {
    return MIME_TYPES[extname(fileName).toLowerCase()] ?? "application/octet-stream";
}
export async function readMultipartUpload(request, maximumBytes) {
    const result = await readMultipartForm(request, maximumBytes);
    if (!result.file)
        throw new ApiError(400, "file_required", "Exactly one multipart file field named 'file' is required.");
    return { file: result.file, values: result.values };
}
export async function readMultipartForm(request, maximumBytes) {
    if (!request.isMultipart()) {
        throw new ApiError(415, "multipart_required", "Upload requests must use multipart/form-data.");
    }
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maximumBytes + 1_048_576) {
        throw new ApiError(413, "file_too_large", `The file limit is ${maximumBytes} bytes.`);
    }
    try {
        const result = await request.saveRequestFiles({ limits: { files: 1, fileSize: maximumBytes, fields: 30, parts: 31 } });
        if (result.files.length > 1 || (result.files[0] && result.files[0].fieldname !== "file")) {
            throw new ApiError(400, "file_required", "At most one multipart file field named 'file' is allowed.");
        }
        return { file: result.files[0] ?? null, values: result.values };
    }
    catch (error) {
        if (error instanceof ApiError)
            throw error;
        const status = error.statusCode;
        if (status === 413)
            throw new ApiError(413, "file_too_large", `The file limit is ${maximumBytes} bytes.`);
        throw new ApiError(400, "invalid_multipart", "The multipart upload is invalid.");
    }
}
function rawMultipartValue(values, name) {
    const entry = values[name];
    if (Array.isArray(entry)) {
        if (entry.length !== 1)
            throw new ApiError(400, "validation_failed", `Multipart field '${name}' may be supplied once.`);
        return entry[0] && typeof entry[0] === "object" && "value" in entry[0] ? entry[0].value : entry[0];
    }
    return entry && typeof entry === "object" && "value" in entry ? entry.value : entry;
}
export function multipartText(values, name, maximumLength, required = false) {
    const raw = rawMultipartValue(values, name);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (required && !value)
        throw new ApiError(400, "validation_failed", `Multipart field '${name}' is required.`);
    if (value.length > maximumLength)
        throw new ApiError(400, "validation_failed", `${name} cannot exceed ${maximumLength} characters.`);
    return value || null;
}
export async function writeStoredFile(storage, key, sourcePath) {
    const target = resolveStoragePath(storage, key);
    const temporary = `${target}.uploading-${randomUUID()}.tmp`;
    let handle = null;
    try {
        await mkdir(resolve(storage.rootPath), { recursive: true });
        await mkdir(resolve(target, ".."), { recursive: true });
        handle = await open(temporary, "wx");
        const hash = createHash("sha256");
        let sizeBytes = 0;
        for await (const chunk of createReadStream(sourcePath)) {
            sizeBytes += chunk.length;
            if (sizeBytes > storage.maxFileSizeBytes)
                throw new ApiError(413, "file_too_large", `The file limit is ${storage.maxFileSizeBytes} bytes.`);
            hash.update(chunk);
            await handle.write(chunk);
        }
        if (sizeBytes === 0)
            throw new ApiError(400, "empty_file", "The uploaded file is empty.");
        await handle.sync();
        await handle.close();
        handle = null;
        await rename(temporary, target);
        return { sizeBytes, sha256: hash.digest("hex") };
    }
    catch (error) {
        if (handle)
            await handle.close().catch(() => undefined);
        await rm(temporary, { force: true }).catch(() => undefined);
        if (error instanceof ApiError)
            throw error;
        storageFailure(error, "The document could not be written to configured storage.");
    }
}
/**
 * Writes bytes the API generated itself — today the signature certificate.
 * Same atomic temp-then-rename and same hash-on-write as an uploaded file, so a
 * generated artefact is stored and verified exactly like a received one.
 */
export async function writeStoredBuffer(storage, key, contents) {
    if (contents.length === 0)
        throw new ApiError(400, "empty_file", "The generated document is empty.");
    if (contents.length > storage.maxFileSizeBytes) {
        throw new ApiError(413, "file_too_large", `The file limit is ${storage.maxFileSizeBytes} bytes.`);
    }
    const target = resolveStoragePath(storage, key);
    const temporary = `${target}.writing-${randomUUID()}.tmp`;
    let handle = null;
    try {
        await mkdir(resolve(storage.rootPath), { recursive: true });
        await mkdir(resolve(target, ".."), { recursive: true });
        handle = await open(temporary, "wx");
        await handle.write(contents);
        await handle.sync();
        await handle.close();
        handle = null;
        await rename(temporary, target);
        return { sizeBytes: contents.length, sha256: createHash("sha256").update(contents).digest("hex") };
    }
    catch (error) {
        if (handle)
            await handle.close().catch(() => undefined);
        await rm(temporary, { force: true }).catch(() => undefined);
        if (error instanceof ApiError)
            throw error;
        storageFailure(error, "The generated document could not be written to configured storage.");
    }
}
export async function deleteStoredFile(storage, key) {
    try {
        await rm(resolveStoragePath(storage, key), { force: true });
    }
    catch (error) {
        storageFailure(error, "An incomplete document could not be removed from configured storage.");
    }
}
export async function verifyStoredFile(storage, key, expectedSize, expectedSha256) {
    const path = resolveStoragePath(storage, key);
    try {
        const fileInfo = await stat(path);
        if (!fileInfo.isFile() || fileInfo.size !== expectedSize) {
            throw new ApiError(409, "document_integrity_failed", "The stored document size does not match its database metadata.");
        }
        const hash = createHash("sha256");
        let size = 0;
        for await (const chunk of createReadStream(path)) {
            size += chunk.length;
            hash.update(chunk);
        }
        if (size !== expectedSize)
            throw new ApiError(409, "document_integrity_failed", "The stored document changed while it was being verified.");
        if (expectedSha256) {
            const actual = Buffer.from(hash.digest("hex"), "ascii");
            const expected = Buffer.from(expectedSha256.toLowerCase(), "ascii");
            if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
                throw new ApiError(409, "document_integrity_failed", "The stored document checksum does not match its database metadata.");
            }
        }
        return path;
    }
    catch (error) {
        if (error instanceof ApiError)
            throw error;
        storageFailure(error, "The document is unavailable in configured storage.");
    }
}
export async function sendStoredFile(request, reply, storage, metadata, options = {}) {
    if (request.method === "HEAD")
        throw new ApiError(405, "method_not_allowed", "HEAD is not supported for protected document downloads.");
    const path = await verifyStoredFile(storage, metadata.storageKey, metadata.sizeBytes, metadata.sha256);
    const asciiName = metadata.fileName.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
    reply.header("Content-Type", metadata.contentType || "application/octet-stream");
    reply.header("Content-Length", String(metadata.sizeBytes));
    reply.header("Content-Disposition", `${options.inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(metadata.fileName)}`);
    return reply.send(createReadStream(path));
}
export function storagePathRelativeToRoot(storage, absolutePath) {
    return relative(storage.rootPath, absolutePath).replaceAll(sep, "/");
}
//# sourceMappingURL=document-storage.js.map