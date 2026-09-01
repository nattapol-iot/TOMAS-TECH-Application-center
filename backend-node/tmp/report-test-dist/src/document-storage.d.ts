import type { FastifyReply, FastifyRequest } from "fastify";
import type { MultipartFields, SavedMultipartFile } from "@fastify/multipart";
import type { AppConfig } from "./config.js";
export declare const DOCUMENT_EXTENSIONS: Set<string>;
export declare const SUPPLIER_QUOTATION_EXTENSIONS: Set<string>;
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
export declare const DOCUMENT_UPLOAD_RATE_LIMIT: {
    readonly max: 6;
    readonly timeWindow: "1 minute";
};
export declare const DOCUMENT_DOWNLOAD_RATE_LIMIT: {
    readonly max: 12;
    readonly timeWindow: "1 minute";
};
export type StoredWrite = {
    sizeBytes: number;
    sha256: string;
};
export type MultipartUpload = {
    file: SavedMultipartFile;
    values: MultipartFields | Record<string, unknown>;
};
export type MultipartForm = {
    file: SavedMultipartFile | null;
    values: MultipartFields | Record<string, unknown>;
};
export declare function resolveStoragePath(storage: AppConfig["documentStorage"], storageKey: string): string;
export declare function storageKey(prefix: string, extension: string, now?: Date): string;
export declare function uploadedFileName(fileName: string): string;
export declare function validateFileExtension(fileName: string, allowed?: ReadonlySet<string>): string;
export declare function contentTypeFor(fileName: string): string;
export declare function readMultipartUpload(request: FastifyRequest, maximumBytes: number): Promise<MultipartUpload>;
export declare function readMultipartForm(request: FastifyRequest, maximumBytes: number): Promise<MultipartForm>;
export declare function multipartText(values: MultipartFields | Record<string, unknown>, name: string, maximumLength: number, required?: boolean): string | null;
export declare function writeStoredFile(storage: AppConfig["documentStorage"], key: string, sourcePath: string): Promise<StoredWrite>;
/**
 * Writes bytes the API generated itself — today the signature certificate.
 * Same atomic temp-then-rename and same hash-on-write as an uploaded file, so a
 * generated artefact is stored and verified exactly like a received one.
 */
export declare function writeStoredBuffer(storage: AppConfig["documentStorage"], key: string, contents: Buffer): Promise<StoredWrite>;
export declare function deleteStoredFile(storage: AppConfig["documentStorage"], key: string): Promise<void>;
export declare function verifyStoredFile(storage: AppConfig["documentStorage"], key: string, expectedSize: number, expectedSha256: string | null): Promise<string>;
export declare function sendStoredFile(request: FastifyRequest, reply: FastifyReply, storage: AppConfig["documentStorage"], metadata: {
    storageKey: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    sha256: string | null;
}, options?: {
    inline?: boolean;
}): Promise<FastifyReply>;
export declare function storagePathRelativeToRoot(storage: AppConfig["documentStorage"], absolutePath: string): string;
