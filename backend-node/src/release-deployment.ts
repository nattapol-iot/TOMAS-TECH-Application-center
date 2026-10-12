import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { AppConfig } from "./config.js";
import { resolveStoragePath, sanitizeStorageSegment } from "./document-storage.js";
import { ApiError } from "./errors.js";

/**
 * Release deployments: which release files can be installed on a monitored program, when a program
 * can take one, and how the approved bytes are kept. Pure where it can be, so the rules are tested
 * without a database or TMTHub.
 */
export const MAX_ARTIFACT_BYTES = 500 * 1024 * 1024;

/** TMT Control Panel installs a zip (unpacked over the program folder) or a single executable. */
export function deployableAssetKind(name: string): "zip" | "exe" | null {
  if (!name || /[\\/:*?"<>|\p{Cc}]/u.test(name) || name.startsWith(".")) return null;
  if (/\.zip$/i.test(name)) return "zip";
  if (/\.exe$/i.test(name)) return "exe";
  return null;
}

export type ProgramState = {
  removed: boolean;
  agentRevoked: boolean;
  siteActive: boolean;
  agentOnline: boolean;
  allowsControl: boolean;
  repository: string;
};

/** Why a program cannot receive an update right now, as an API error, or null when it can. */
export function deploymentBlocker(state: ProgramState, stage: "request" | "approve"): ApiError | null {
  if (state.removed || state.agentRevoked) return new ApiError(404, "monitor_program_not_found", "The program is no longer monitored.");
  if (!state.siteActive) return new ApiError(409, "monitor_site_inactive", "The site is inactive.");
  if (!state.repository) return new ApiError(409, "monitor_program_no_repository", "Link the program to its TMTHub repository first.");
  if (!state.allowsControl) return new ApiError(409, "monitor_control_disabled", "Remote control is turned off in TMT Control Panel on this machine.");
  // A request may wait for an offline machine; an approval queues the command, so the machine must listen.
  if (stage === "approve" && !state.agentOnline) {
    return new ApiError(409, "monitor_agent_offline", "The machine running this program is offline, so it cannot receive the update.");
  }
  return null;
}

/** Where an approved release copy is kept, under the document storage root. */
export function artifactStorageKey(fileName: string, now = new Date()): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `monitor-deployments/${year}/${month}/${randomUUID()}/${sanitizeStorageSegment(fileName)}`;
}

/**
 * Streams a release file into storage, hashing as it goes. The size must match what TMTHub declared,
 * so a truncated download is never approved. Written to a temporary name and renamed when complete.
 */
export async function storeArtifact(
  storage: AppConfig["documentStorage"], key: string, body: Response["body"], expectedSize: number,
): Promise<{ sizeBytes: number; sha256: string }> {
  if (!body) throw new ApiError(502, "tmthub_error", "TMTHub sent an empty release file.");
  if (expectedSize <= 0 || expectedSize > MAX_ARTIFACT_BYTES) {
    throw new ApiError(413, "monitor_artifact_too_large", `A release file may be at most ${MAX_ARTIFACT_BYTES / 1024 / 1024} MB.`);
  }
  const target = resolveStoragePath(storage, key);
  const temporary = `${target}.writing-${randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  const handle = await open(temporary, "wx");
  const hash = createHash("sha256");
  let size = 0;
  try {
    for await (const chunk of Readable.fromWeb(body as unknown as WebReadableStream<Uint8Array>)) {
      const bytes = chunk as Buffer;
      size += bytes.length;
      if (size > expectedSize) throw new ApiError(502, "monitor_artifact_size_mismatch", "The release file is larger than TMTHub declared.");
      hash.update(bytes);
      await handle.write(bytes);
    }
    if (size !== expectedSize) throw new ApiError(502, "monitor_artifact_size_mismatch", "The release file download was incomplete.");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  await handle.close();
  await rename(temporary, target);
  return { sizeBytes: size, sha256: hash.digest("hex") };
}
