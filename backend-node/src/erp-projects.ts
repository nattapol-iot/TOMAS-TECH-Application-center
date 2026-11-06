// The Pegasus ERP's project search (purchasing_projects_list, section 5 of the ERP team's PURCHASE-REQUEST-MCP-TH.md):
// up to 30 projects matching a number, a project name or a customer name, cancelled ones left out. The ERP has no tool
// that lists every project, so the app searches while someone types the number. See docs/PEGASUS_ERP_PROJECTS_TH.md.

export const ERP_PROJECT_TOOL = "purchasing_projects_list";
/** The longest search the screens send. */
export const ERP_PROJECT_QUERY_MAX = 100;

export type ErpProject = { number: string; name: string; customerName: string };

const text = (value: unknown, max: number) => {
  const raw = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  const clean = raw.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) : clean;
};

/** What to search for: the typed text, trimmed. Nothing searches the ERP's most recent projects. */
export const erpProjectArguments = (query: unknown): Record<string, unknown> => {
  const q = text(query, ERP_PROJECT_QUERY_MAX);
  return q ? { q } : {};
};

/** The projects in one answer, each once and as the ERP spells its number, or null when the answer has no list. */
export function readErpProjects(data: unknown): ErpProject[] | null {
  const list = data && typeof data === "object" ? (data as Record<string, unknown>).projects : undefined;
  if (!Array.isArray(list)) return null;
  const byNumber = new Map<string, ErpProject>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    // The ERP's numbers are case-sensitive (pj260172 is refused); the app stores them as the ERP gives them.
    const number = text(row.project_no, 30);
    if (!number || byNumber.has(number)) continue;
    byNumber.set(number, { number, name: text(row.project_name, 300), customerName: text(row.customer_name, 300) });
  }
  return [...byNumber.values()];
}
