import type {
  EstimateCostWorkspace,
  EstimateErpSummary,
  EstimateErpSourceType,
} from "../app/system/api-client";

export type EstimateModuleTarget = "cost" | "manhour" | "other";

export type EstimateModuleSummary = {
  key: string;
  moduleName: string;
  section: string;
  disciplines: string[];
  costTypes: string[];
  inHouseAmount: number;
  outsourcedAmount: number;
  unclassifiedAmount: number;
  lineCount: number;
  amount: number;
  share: number;
  warningCount: number;
  errorCount: number;
  erpStatus: "Mapped" | "Partial" | "Unmapped" | "Loading";
  erpCategories: string[];
  responsibleEngineers: string[];
  lastUpdated: string | null;
  targetTab: EstimateModuleTarget;
  focusKey: string | null;
};

type SourceRef = { sourceType: EstimateErpSourceType; sourceId: number };
type MutableModule = Pick<EstimateModuleSummary, "key" | "moduleName" | "section" | "inHouseAmount" | "outsourcedAmount" | "unclassifiedAmount" | "lineCount" | "amount" | "lastUpdated" | "targetTab" | "focusKey"> & {
  disciplines: Set<string>;
  costTypes: Set<string>;
  responsibleEngineers: Set<string>;
  refs: SourceRef[];
};

const amount = (value: number | string | null | undefined) => Number(value ?? 0);
const refKey = (sourceType: EstimateErpSourceType, sourceId: number | null) => `${sourceType}:${sourceId ?? "estimate"}`;
export const estimateCostModuleKey = (categoryCode: string, moduleName: string) => `${categoryCode}::${moduleName}`;
export const estimateWorkPackageKey = (costType: string, packageName: string) => `${costType}\u0000${packageName}`;
export const estimateOtherCostSectionCode = (category: string) => category === "Outsource" ? "07" : category === "Transportation" ? "08" : category === "Accommodation" ? "09" : "10";

function laterDate(current: string | null, candidate: string | null | undefined) {
  if (!candidate) return current;
  return !current || candidate > current ? candidate : current;
}

function assignmentOwners(workspace: EstimateCostWorkspace, section: string, disciplines: Set<string>) {
  const normalized = [section, ...disciplines].map((value) => value.toLowerCase());
  return workspace.assignments
    .filter((assignment) => normalized.some((value) => assignment.section.toLowerCase().includes(value) || value.includes(assignment.section.toLowerCase())))
    .map((assignment) => assignment.ownerName);
}

/**
 * Builds the manager-facing Estimate hierarchy. Every returned record is one
 * Module / Work Package; source cost lines remain reachable only through refs.
 */
export function buildEstimateModuleSummary(workspace: EstimateCostWorkspace, erpSummary: EstimateErpSummary | null): EstimateModuleSummary[] {
  const groups = new Map<string, MutableModule>();

  const ensure = (input: Pick<MutableModule, "key" | "moduleName" | "section" | "targetTab" | "focusKey">) => {
    let group = groups.get(input.key);
    if (!group) {
      group = {
        ...input,
        disciplines: new Set(),
        costTypes: new Set(),
        inHouseAmount: 0,
        outsourcedAmount: 0,
        unclassifiedAmount: 0,
        lineCount: 0,
        amount: 0,
        responsibleEngineers: new Set(),
        lastUpdated: null,
        refs: [],
      };
      groups.set(input.key, group);
    } else if (!group.section.split(" / ").includes(input.section)) {
      group.section = `${group.section} / ${input.section}`;
    }
    return group as MutableModule;
  };

  for (const line of workspace.costItems) {
    const moduleName = line.module.trim() || "Unassigned module";
    const focusKey = estimateCostModuleKey(line.categoryCode, moduleName);
    const group = ensure({ key: `cost:${focusKey}`, moduleName, section: `${line.categoryCode} ${line.category}`, targetTab: "cost", focusKey });
    group.disciplines.add(line.category);
    group.costTypes.add(["01", "02", "03", "04", "05"].includes(line.categoryCode) ? "Material" : line.category);
    const lineAmount = amount(line.lineTotal);
    if (line.categoryCode === "07" || line.supplierId) group.outsourcedAmount += lineAmount;
    else if (["01", "02", "03", "04", "05"].includes(line.categoryCode)) group.unclassifiedAmount += lineAmount;
    else group.inHouseAmount += lineAmount;
    group.amount += lineAmount;
    group.lineCount += 1;
    if (line.ownerName) group.responsibleEngineers.add(line.ownerName);
    group.lastUpdated = laterDate(group.lastUpdated, line.updatedAt);
    group.refs.push({ sourceType: "CostItem", sourceId: line.id });
  }

  for (const line of workspace.manhourLines) {
    const moduleName = line.package.trim() || "Unassigned work package";
    const group = ensure({ key: `work:${estimateWorkPackageKey(line.costType, moduleName)}`, moduleName, section: line.costType === "Installation" ? "07 Installation" : "06 Engineering", targetTab: "manhour", focusKey: null });
    group.disciplines.add(line.department || "Engineering");
    group.costTypes.add(line.costType);
    const lineAmount = amount(line.lineCost);
    if (line.provider === "Supplier") group.outsourcedAmount += lineAmount; else group.inHouseAmount += lineAmount;
    group.amount += lineAmount;
    group.lineCount += 1;
    if (line.ownerName) group.responsibleEngineers.add(line.ownerName);
    group.lastUpdated = laterDate(group.lastUpdated, line.updatedAt);
    group.refs.push({ sourceType: "ManhourLine", sourceId: line.id });
  }

  for (const line of workspace.expenseLines) {
    const moduleName = line.package.trim() || "Unassigned work package";
    const group = ensure({ key: `work:${estimateWorkPackageKey(line.costType, moduleName)}`, moduleName, section: line.costType === "Installation" ? "07 Installation" : "06 Engineering", targetTab: "manhour", focusKey: null });
    group.disciplines.add(line.costType);
    group.costTypes.add(line.expenseType || line.costType);
    const lineAmount = amount(line.lineTotal);
    if (line.supplierId) group.outsourcedAmount += lineAmount; else group.inHouseAmount += lineAmount;
    group.amount += lineAmount;
    group.lineCount += 1;
    if (line.ownerName) group.responsibleEngineers.add(line.ownerName);
    group.lastUpdated = laterDate(group.lastUpdated, line.updatedAt);
    group.refs.push({ sourceType: "ExpenseLine", sourceId: line.id });
  }

  const issues = new Map<string, { errors: number; warnings: number }>();
  for (const issue of workspace.validationIssues) {
    const key = refKey(issue.entityType as EstimateErpSourceType, issue.entityId);
    const current = issues.get(key) ?? { errors: 0, warnings: 0 };
    if (issue.severity.trim().toLowerCase() === "error") current.errors += 1; else current.warnings += 1;
    issues.set(key, current);
  }
  const erpByRef = new Map((erpSummary?.lines ?? []).filter((line) => line.sourceId !== null).map((line) => [refKey(line.sourceType, line.sourceId), line]));
  const total = amount(workspace.header.totals.total);

  return [...groups.values()]
    .sort((left, right) => left.section.localeCompare(right.section) || left.moduleName.localeCompare(right.moduleName, "th"))
    .map((group) => {
      const groupIssues = group.refs.map((ref) => issues.get(refKey(ref.sourceType, ref.sourceId))).filter(Boolean);
      const erpLines = group.refs.map((ref) => erpByRef.get(refKey(ref.sourceType, ref.sourceId))).filter(Boolean);
      const mappedLines = erpLines.filter((line) => line?.erpCategory !== "Unmapped");
      const erpStatus = !erpSummary ? "Loading" : !mappedLines.length ? "Unmapped" : mappedLines.length === group.refs.length ? "Mapped" : "Partial";
      const owners = group.responsibleEngineers.size ? [...group.responsibleEngineers] : assignmentOwners(workspace, group.section, group.disciplines);
      return {
        key: group.key,
        moduleName: group.moduleName,
        section: group.section,
        disciplines: [...group.disciplines],
        costTypes: [...group.costTypes],
        inHouseAmount: group.inHouseAmount,
        outsourcedAmount: group.outsourcedAmount,
        unclassifiedAmount: group.unclassifiedAmount,
        lineCount: group.lineCount,
        amount: group.amount,
        share: total ? group.amount / total * 100 : 0,
        warningCount: groupIssues.reduce((sum, issue) => sum + (issue?.warnings ?? 0), 0),
        errorCount: groupIssues.reduce((sum, issue) => sum + (issue?.errors ?? 0), 0),
        erpStatus,
        erpCategories: [...new Set(mappedLines.map((line) => line!.erpCategory).filter((category) => category !== "Unmapped"))],
        responsibleEngineers: [...new Set(owners)],
        lastUpdated: group.lastUpdated,
        targetTab: group.targetTab,
        focusKey: group.focusKey,
      };
    });
}
