import type { TmtIdConfig } from "../config.js";
import { MASTER_DATA_TIMEOUT_MS } from "../tmt-id/constants.js";

export class MasterDataError extends Error {
  constructor(readonly status: number | null, message: string) { super(message); }
}

export type MasterDataClient = {
  get: (path: string, userToken?: string) => Promise<unknown>;
  /** Every live row of a reference list, page after page. */
  listAll: (path: string) => Promise<unknown[]>;
};

type Page = { total?: unknown; limit?: unknown; items?: unknown };

export function createMasterDataClient(config: TmtIdConfig, fetchImpl: typeof fetch = fetch): MasterDataClient | null {
  const baseUrl = config.masterDataUrl?.replace(/\/$/, "");
  const apiKey = config.masterDataApiKey;
  if (!baseUrl || !apiKey) return null;

  const get = async (path: string, userToken?: string): Promise<unknown> => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json", ...(userToken ? { "X-User-Token": userToken } : {}) },
      signal: AbortSignal.timeout(MASTER_DATA_TIMEOUT_MS),
    });
    if (!response.ok) throw new MasterDataError(response.status, `Master data answered ${response.status} for ${path.split("?")[0]}.`);
    return response.json();
  };

  return {
    get,
    async listAll(path) {
      const rows: unknown[] = [];
      for (;;) {
        const page = await get(`${path}${path.includes("?") ? "&" : "?"}offset=${rows.length}`) as Page;
        if (!Array.isArray(page?.items)) throw new MasterDataError(null, `Master data answered ${path} without an items list.`);
        rows.push(...page.items);
        if (!page.items.length || rows.length >= Number(page.total ?? 0)) return rows;
      }
    },
  };
}
