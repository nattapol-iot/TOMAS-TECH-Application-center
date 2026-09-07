import type { TmtIdConfig } from "../config.js";
import {
  MASTER_DATA_CACHE_MAX_ENTRIES,
  MASTER_DATA_CACHE_TTL_MS,
  MASTER_DATA_TIMEOUT_MS,
} from "./constants.js";
import type { MasterDataProfile } from "./types.js";

export type MasterDataDirectory = {
  profile: (preferredUsername: string) => Promise<MasterDataProfile | null>;
};

type CacheEntry = { expiresAt: number; profile: MasterDataProfile | null };

function firstText(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstInteger(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    const parsed = typeof value === "string" ? Number(value) : value;
    if (typeof parsed === "number" && Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

// The directory exposes several naming conventions across its endpoints, so the
// keys are read by candidate rather than by a single fixed contract.
function toProfile(payload: unknown): MasterDataProfile | null {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as Record<string, unknown>;
  const record = (
    envelope.data && typeof envelope.data === "object" ? envelope.data : envelope
  ) as Record<string, unknown>;
  return {
    employeeNo: firstInteger(record, ["employeeNo", "employee_no", "employeeNumber"]),
    name: firstText(record, ["nameEn", "name_en", "fullName", "full_name", "name"]),
    department: firstText(record, ["department", "departmentName", "department_name"]),
    role: firstText(record, ["role", "position", "positionName", "position_name"]),
    email: firstText(record, ["email", "workEmail", "work_email"]),
  };
}

export function createMasterDataDirectory(
  config: TmtIdConfig,
  fetchImpl: typeof fetch = fetch,
  onFailure?: (error: unknown) => void,
): MasterDataDirectory | null {
  const baseUrl = config.masterDataUrl?.replace(/\/$/, "");
  const apiKey = config.masterDataApiKey;
  if (!baseUrl || !apiKey) return null;

  const cache = new Map<string, CacheEntry>();

  const remember = (key: string, profile: MasterDataProfile | null): void => {
    if (cache.size >= MASTER_DATA_CACHE_MAX_ENTRIES) {
      const now = Date.now();
      for (const [entryKey, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(entryKey);
      }
      const oldest = cache.keys().next();
      if (cache.size >= MASTER_DATA_CACHE_MAX_ENTRIES && !oldest.done) {
        cache.delete(oldest.value);
      }
    }
    cache.set(key, { expiresAt: Date.now() + MASTER_DATA_CACHE_TTL_MS, profile });
  };

  return {
    async profile(preferredUsername) {
      if (!preferredUsername) return null;
      const cached = cache.get(preferredUsername);
      if (cached && cached.expiresAt > Date.now()) return cached.profile;
      const url = `${baseUrl}/api/v1/employees/by-lineworks-user-id/${encodeURIComponent(preferredUsername)}`;
      try {
        const response = await fetchImpl(url, {
          headers: { "X-API-Key": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(MASTER_DATA_TIMEOUT_MS),
        });
        if (response.status === 404) {
          remember(preferredUsername, null);
          return null;
        }
        if (!response.ok) throw new Error(`Master data responded ${response.status}.`);
        const profile = toProfile(await response.json());
        remember(preferredUsername, profile);
        return profile;
      } catch (error) {
        // An enrichment outage must not sign anyone out, and it must not be
        // cached either, so the last known profile is reused if there is one.
        onFailure?.(error);
        return cached?.profile ?? null;
      }
    },
  };
}