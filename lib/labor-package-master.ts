import type { LaborPackageDetail, LaborPackageInput, LaborPackageLine, LaborPackageLineInput } from "../app/system/api-client";

/** Map a server line back to the complete write shape used by PUT/POST. */
export function laborPackageLineInput(line: LaborPackageLine): LaborPackageLineInput {
  return {
    activity: line.activity,
    department: line.department,
    level: line.level,
    costType: line.costType,
    provider: line.provider,
    rateId: line.rateId,
    rateBasis: line.rateBasis,
    defaultEngineers: line.defaultEngineers,
    defaultManDays: line.defaultManDays,
    defaultHours: line.defaultHours,
    defaultHoursPerDay: line.defaultHoursPerDay,
    referenceDailyRate: line.referenceDailyRate,
    defaultErpCategory: line.defaultErpCategory,
    remark: line.remark,
  };
}

/** Rebuild a package without dropping fields the compact editor does not show. */
export function laborPackageInput(detail: LaborPackageDetail, status = detail.status): LaborPackageInput {
  return {
    code: detail.code,
    name: detail.name,
    costType: detail.costType,
    department: detail.department,
    projectType: detail.projectType,
    description: detail.description,
    status,
    lines: detail.lines.map(laborPackageLineInput),
  };
}

export function laborPackagePermissions(permissions: readonly string[]) {
  const canEditDraft = permissions.includes("estimate.write");
  return {
    canEditDraft,
    canPublish: canEditDraft && permissions.includes("master.write"),
  };
}

export function suggestedCopyCode(code: string): string {
  return `${code.replace(/-COPY(?:-\d+)?$/i, "").slice(0, 35)}-COPY`;
}
