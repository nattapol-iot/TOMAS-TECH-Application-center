import type { EstimateCostWorkspace } from "../app/system/api-client";

export type EstimateModuleOverview = {
  key: string;
  name: string;
  kind: "Module" | "Work Package";
  section: string;
  discipline: string;
  lineCount: number;
  amount: number;
  ownerNames: string[];
  lastUpdated: string | null;
  attentionCount: number;
  targetTab: "cost" | "manhour";
  focusKey: string | null;
};

const MATERIAL_CODES = ["01", "02", "03", "04", "05"];
const amount = (value: number | string | null | undefined) => Number(value ?? 0);
const latestUpdate = (current: string | null, candidate: string | null | undefined) => candidate && (!current || candidate > current) ? candidate : current;

export const estimateCostModuleKey = (categoryCode: string, moduleName: string) => `${categoryCode}::${moduleName}`;

export function buildEstimateModuleOverview(workspace: EstimateCostWorkspace, costOnly = false): EstimateModuleOverview[] {
  const validationKeys = new Set(workspace.validationIssues.map((issue) => `${issue.entityType}:${issue.entityId}`));
  const costGroups = new Map<string, { overview: EstimateModuleOverview; owners: Set<string>; attentionIds: Set<number> }>();
  for (const line of workspace.costItems) {
    const name = line.module.trim() || "Unassigned";
    const focusKey = estimateCostModuleKey(line.categoryCode, name);
    let group = costGroups.get(focusKey);
    if (!group) {
      group = {
        overview: { key: `cost:${focusKey}`, name, kind: "Module", section: `${line.categoryCode} ${line.category}`, discipline: line.category, lineCount: 0, amount: 0, ownerNames: [], lastUpdated: null, attentionCount: 0, targetTab: "cost", focusKey },
        owners: new Set(), attentionIds: new Set(),
      };
      costGroups.set(focusKey, group);
    }
    group.overview.lineCount += 1;
    group.overview.amount += amount(line.lineTotal);
    group.overview.lastUpdated = latestUpdate(group.overview.lastUpdated, line.updatedAt);
    if (line.ownerName) group.owners.add(line.ownerName);
    if (amount(line.unitCost) <= 0 || (!line.supplierId && MATERIAL_CODES.includes(line.categoryCode)) || validationKeys.has(`CostItem:${line.id}`)) group.attentionIds.add(line.id);
  }
  const result = [...costGroups.values()].map(({ overview, owners, attentionIds }) => ({ ...overview, ownerNames: [...owners], attentionCount: attentionIds.size }));
  if (costOnly) return result.sort(sortOverview);

  const packages = new Map<string, { overview: EstimateModuleOverview; owners: Set<string>; disciplines: Set<string>; sourceKeys: Set<string> }>();
  const ensurePackage = (costType: "Engineering" | "Installation", packageName: string) => {
    const name = packageName.trim() || "Unassigned work package";
    const key = `${costType}\u0000${name}`;
    let group = packages.get(key);
    if (!group) {
      group = {
        overview: { key: `work:${key}`, name, kind: "Work Package", section: costType === "Installation" ? "07 Installation" : "06 Engineering", discipline: costType, lineCount: 0, amount: 0, ownerNames: [], lastUpdated: null, attentionCount: 0, targetTab: "manhour", focusKey: null },
        owners: new Set(), disciplines: new Set(), sourceKeys: new Set(),
      };
      packages.set(key, group);
    }
    return group;
  };
  for (const line of workspace.manhourLines) {
    const group = ensurePackage(line.costType, line.package);
    group.overview.lineCount += 1; group.overview.amount += amount(line.lineCost); group.overview.lastUpdated = latestUpdate(group.overview.lastUpdated, line.updatedAt);
    if (line.ownerName) group.owners.add(line.ownerName);
    group.disciplines.add(line.department || line.costType); group.sourceKeys.add(`ManhourLine:${line.id}`);
  }
  for (const line of workspace.expenseLines) {
    const group = ensurePackage(line.costType, line.package);
    group.overview.lineCount += 1; group.overview.amount += amount(line.lineTotal); group.overview.lastUpdated = latestUpdate(group.overview.lastUpdated, line.updatedAt);
    if (line.ownerName) group.owners.add(line.ownerName);
    group.disciplines.add(line.costType); group.sourceKeys.add(`ExpenseLine:${line.id}`);
  }
  for (const group of packages.values()) {
    group.overview.ownerNames = [...group.owners];
    group.overview.discipline = [...group.disciplines].join(", ") || group.overview.discipline;
    group.overview.attentionCount = [...group.sourceKeys].filter((key) => validationKeys.has(key)).length;
    result.push(group.overview);
  }
  return result.sort(sortOverview);
}

function sortOverview(left: EstimateModuleOverview, right: EstimateModuleOverview) {
  return left.section.localeCompare(right.section) || left.name.localeCompare(right.name, "th");
}
