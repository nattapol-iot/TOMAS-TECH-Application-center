import { applyFilters, querySchema, type Row } from "@tomas-tc/blueprint";
import type { RequestJson } from "@tomas-tc/ui";
import { MOCK_ORIGIN } from "../config/tomas-ui.constants";

const notFound = () => Object.assign(new Error("Not found"), { status: 404 });

export function mockRestRequest(tables: Record<string, Row[]>): RequestJson {
  return async (path) => {
    const url = new URL(path, MOCK_ORIGIN);
    const [entity = "", id] = url.pathname.split("/").slice(2);
    const rows = tables[entity] ?? [];
    if (id) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) throw notFound();
      return { data: row };
    }
    const page = Number(url.searchParams.get("page") ?? 1);
    const perPage = Number(url.searchParams.get("perPage") ?? rows.length);
    return { data: rows.slice((page - 1) * perPage, page * perPage), meta: { total: rows.length } };
  };
}

// ponytail: counts only, grouped by a plain field; the real endpoint runs every aggregate and date bucket.
export function mockAnalyticsRequest(rows: Row[]): RequestJson {
  return async (_path, options) => {
    const query = querySchema.parse(options?.body);
    const field = query.groupBy?.field;
    const counts = new Map<string | null, number>();
    for (const row of applyFilters(rows, query.filters)) {
      const group = field ? String(row[field] ?? "") || null : null;
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return { data: [...counts].map(([group, count]) => ({ group, series: null, values: query.measures.map(() => count) })) };
  };
}
