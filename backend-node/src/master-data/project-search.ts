import type { ErpProject } from "../erp-projects.js";
import type { MasterDataClient } from "./client.js";
import { MASTER_DATA_PATHS, PROJECT_CLOSED_STATUS, PROJECT_SEARCH_LIMIT } from "./constants.js";

export type ProjectSearch = { search: (query: string) => Promise<ErpProject[]> };

const text = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Master's live projects in the shape the project-number field shows, cancelled ones left out as the ERP search did. */
export function projectHits(page: unknown): ErpProject[] {
  const items = page && typeof page === "object" ? (page as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) return [];
  const byNumber = new Map<string, ErpProject>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const number = text(row.pj_no, 30);
    if (!number || byNumber.has(number) || row.status === PROJECT_CLOSED_STATUS || row.erp_is_deleted === true) continue;
    byNumber.set(number, { number, name: text(row.pj_name, 300), customerName: text(row.customer_name, 300) });
  }
  return [...byNumber.values()];
}

/** Master holds every project (the ERP only offered a 30-row search), so an empty query lists the latest ones. */
export function createProjectSearch(client: MasterDataClient): ProjectSearch {
  return {
    async search(query) {
      const params = new URLSearchParams({ limit: String(PROJECT_SEARCH_LIMIT), sort: "updated_at", direction: "desc" });
      if (query) params.set("search", query);
      return projectHits(await client.get(`${MASTER_DATA_PATHS.projects}?${params}`));
    },
  };
}
