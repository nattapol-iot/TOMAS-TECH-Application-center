import type { TokenSource } from "../tmt-id/token-vault.js";
import { MasterDataError, type MasterDataClient } from "./client.js";
import { MASTER_DATA_PATHS, OWN_RECORD_CACHE_TTL_MS } from "./constants.js";

export type OwnRecordReader = { entryDate: (subject: string) => Promise<string | null> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readEntryDate(payload: unknown): string | null {
  const employee = payload && typeof payload === "object" ? (payload as { employee?: unknown }).employee : null;
  const value = employee && typeof employee === "object" ? (employee as { entry_date?: unknown }).entry_date : null;
  return typeof value === "string" && DATE.test(value) ? value : null;
}

/**
 * A person's own start date from master's /me, asked with their TMT ID token so master answers for that person only. The app's
 * key holds employee.self and nothing above the directory, so nobody's date reaches anyone else through this app.
 */
export function createOwnRecordReader(client: MasterDataClient, tokens: TokenSource, onError: (error: unknown) => void,
  now: () => number = Date.now): OwnRecordReader {
  // ponytail: unbounded per-subject cache; the app has a few hundred people at most.
  const cache = new Map<string, { at: number; entryDate: string | null }>();

  const ask = async (subject: string): Promise<string | null> => {
    const token = await tokens.accessToken(subject);
    if (!token) throw new MasterDataError(401, "No TMT ID token for this person.");
    try {
      return readEntryDate(await client.get(MASTER_DATA_PATHS.me, token));
    } catch (error) {
      if (!(error instanceof MasterDataError) || error.status !== 401) throw error;
      tokens.dropAccess(subject);
      const fresh = await tokens.accessToken(subject);
      if (!fresh) throw error;
      return readEntryDate(await client.get(MASTER_DATA_PATHS.me, fresh));
    }
  };

  return {
    async entryDate(subject) {
      if (!subject) return null;
      const cached = cache.get(subject);
      if (cached && now() - cached.at < OWN_RECORD_CACHE_TTL_MS) return cached.entryDate;
      try {
        const entryDate = await ask(subject);
        cache.set(subject, { at: now(), entryDate });
        return entryDate;
      } catch (error) {
        onError(error);
        return cached?.entryDate ?? null;
      }
    },
  };
}
