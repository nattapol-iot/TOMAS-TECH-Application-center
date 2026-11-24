import { applyFilters, parsePicks, type DataAdapter, type ListRequest, type ListResult, type Row, type RowValue } from "@tomas-tc/blueprint";

const blank = (value: RowValue | undefined) => value === null || value === undefined || value === "";

const holdsPick = (value: RowValue | undefined, picks: string[]) => (Array.isArray(value) ? value : [value]).some((one) => !blank(one) && picks.includes(String(one)));

const compare = (left: RowValue | undefined, right: RowValue | undefined) => (typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right)));

export function answerList(rows: Row[], { query, where, searchFields }: ListRequest): ListResult {
  const needle = query.search.toLowerCase();
  const matched = applyFilters(rows, where).filter(
    (row) =>
      (needle === "" ||
        searchFields.some((key) =>
          String(row[key] ?? "")
            .toLowerCase()
            .includes(needle),
        )) &&
      Object.entries(query.filters).every(([key, value]) => holdsPick(row[key], parsePicks(value))),
  );
  const sort = query.sort;
  const sorted = sort
    ? [...matched].sort((a, b) => {
        const left = a[sort.key];
        const right = b[sort.key];
        if (blank(left) || blank(right)) return Number(blank(left)) - Number(blank(right));
        return sort.dir === "desc" ? -compare(left, right) : compare(left, right);
      })
    : matched;
  const start = (query.page - 1) * query.perPage;
  return { rows: sorted.slice(start, start + query.perPage), total: matched.length };
}

export function memoryAdapter(seed: Row[]): DataAdapter {
  let rows = seed;
  return {
    list: async (request) => answerList(rows, request),
    get: async (id) => rows.find((row) => row.id === id) ?? null,
    create: async (values) => {
      const row: Row = { ...values, id: `new-${Date.now()}` };
      rows = [...rows, row];
      return row;
    },
    update: async (id, values) => {
      const next: Row = { ...(rows.find((row) => row.id === id) ?? { id }), ...values, id };
      rows = rows.map((row) => (row.id === id ? next : row));
      return next;
    },
    remove: async (ids) => {
      rows = rows.filter((row) => !ids.includes(row.id));
    },
    all: async () => rows,
  };
}
