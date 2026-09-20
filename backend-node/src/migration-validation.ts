export type MigrationIdentity = Readonly<{
  version: number;
  fileName: string;
  name: string;
}>;

export type AppliedMigration = Readonly<{
  version: number;
  name: string;
}>;

export const REQUIRED_MIGRATIONS: readonly MigrationIdentity[] = [
  { version: 50, fileName: "050_estimate_product_codes.sql", name: "Preserve product codes across estimate modules" },
  { version: 49, fileName: "049_estimate_module_quantity.sql", name: "Estimate module quantity and unit" },
  { version: 25, fileName: "025_reports.sql", name: "Unified revisioned reports and customer acknowledgment" },
  { version: 26, fileName: "026_performance_reviews.sql", name: "Durable role-scoped KPI performance reviews" },
  { version: 27, fileName: "027_report_templates.sql", name: "Reusable sanitized report templates and frozen provenance" },
  { version: 28, fileName: "028_end_user_companies.sql", name: "Optional end user companies for inquiries and projects" },
  { version: 29, fileName: "029_sales_performance_reviews.sql", name: "Role-specific Sales KPI performance reviews" },
  { version: 30, fileName: "030_customer_multilingual_names.sql", name: "Customer and contact names in Thai, English and Japanese" },
  { version: 31, fileName: "031_customer_contact_titles.sql", name: "Customer contact titles in Thai, English and Japanese" },
  { version: 32, fileName: "032_estimate_excel_import.sql", name: "Estimate Excel import audited historical rate provenance" },
  { version: 33, fileName: "033_historical_pr_import.sql", name: "Historical PR workbook imports with source versions and reconciliation links" },
  { version: 34, fileName: "034_support_center.sql", name: "Support Center and reporter contribution points" },
  { version: 35, fileName: "035_team_activity.sql", name: "Team activity, reporting discipline and versioned KPI contribution" },
  { version: 36, fileName: "036_report_evidence_images.sql", name: "Report evidence images with immutable file hashes" },
  { version: 37, fileName: "037_unified_report_exports.sql", name: "Archive generated report PDF/PPTX exports on NAS storage" },
  { version: 38, fileName: "038_supplier_quotation_lines.sql", name: "supplier_quotation_lines" },
  { version: 39, fileName: "039_nas_storage_settings.sql", name: "NAS storage connection draft settings" },
  { version: 40, fileName: "040_estimate_overhead_policy.sql", name: "Immutable overhead policies and estimate revision snapshots" },
  { version: 41, fileName: "041_user_role_management.sql", name: "Admin-managed primary user roles with audited least-privilege writes" },
  { version: 42, fileName: "042_estimate_total_guard.sql", name: "Guard estimate aggregates within supported decimal precision" },
  { version: 43, fileName: "043_estimate_erp_cost_mapping.sql", name: "Revision-scoped Estimate ERP cost classifications" },
  { version: 44, fileName: "044_estimate_labor_masters.sql", name: "Reusable labor rate masters and estimate labor packages" },
  { version: 45, fileName: "045_estimate_line_order.sql", name: "Shared estimate module and cost line ordering" },
  { version: 46, fileName: "046_estimate_module_details.sql", name: "Revision-scoped estimate module names and remarks" },
  { version: 48, fileName: "048_estimate_price_sets.sql", name: "Estimate supplier price sets" },
  { version: 47, fileName: "047_estimate_module_description_rows.sql", name: "Estimate module description rows and summary notes" },
  { version: 51, fileName: "051_additional_application_roles.sql", name: "Additional application roles carry their full permission set" },
  { version: 52, fileName: "052_support_email_notification.sql", name: "Support member email notification preference" },
  { version: 53, fileName: "053_crm.sql", name: "CRM opportunities and customer follow-up" },
  { version: 54, fileName: "054_crm_end_user.sql", name: "CRM opportunity end user company" },
] as const;

export const REQUIRED_SCHEMA_VERSION = REQUIRED_MIGRATIONS.at(-1)!.version;
export const REQUIRED_SCHEMA_VERSIONS = REQUIRED_MIGRATIONS.map(({ version }) => version);

const LEGACY_ROLE_MIGRATION = "Admin-managed primary user roles with audited least-privilege writes";

function migrationVersion(fileName: string): number | null {
  const match = /^(\d{3})_.+\.sql$/i.exec(fileName);
  return match ? Number(match[1]) : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateMigrationFiles(files: readonly Readonly<{ fileName: string; sql: string }>[]): void {
  const filesByVersion = new Map<number, string[]>();
  for (const file of files) {
    const version = migrationVersion(file.fileName);
    if (version === null) continue;
    const names = filesByVersion.get(version) ?? [];
    names.push(file.fileName);
    filesByVersion.set(version, names);
  }

  const duplicates = [...filesByVersion.entries()].filter(([, names]) => names.length > 1);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate migration version(s): ${duplicates.map(([version, names]) => `${version} (${names.join(", ")})`).join("; ")}`);
  }

  const byName = new Map(files.map((file) => [file.fileName, file.sql]));
  for (const expected of REQUIRED_MIGRATIONS) {
    const sql = byName.get(expected.fileName);
    if (sql === undefined) throw new Error(`Required migration file is missing: ${expected.fileName}`);
    const identity = new RegExp(
      `schema_versions\\s*\\(\\s*version\\s*,\\s*name\\s*\\)[\\s\\S]*?VALUES\\s*\\(\\s*${expected.version}\\s*,\\s*N'${escapeRegExp(expected.name)}'\\s*\\)`,
      "i",
    );
    if (!identity.test(sql)) {
      throw new Error(`Migration ${expected.fileName} does not record the required schema identity '${expected.name}'.`);
    }
  }
}

export function validateAppliedMigrationIdentities(applied: readonly AppliedMigration[]): void {
  const byVersion = new Map(applied.map((migration) => [Number(migration.version), migration.name]));
  if (byVersion.get(37) === LEGACY_ROLE_MIGRATION) {
    throw new Error(
      "Legacy migration identity detected: user role management was recorded as schema version 37. " +
      "Automatic migration is blocked until an operator inspects and reconciles that database.",
    );
  }
  for (const expected of REQUIRED_MIGRATIONS) {
    const actual = byVersion.get(expected.version);
    if (actual !== undefined && actual !== expected.name) {
      throw new Error(`Schema version ${expected.version} identity mismatch: expected '${expected.name}', found '${actual}'.`);
    }
  }
}

export function migrationReadiness(applied: readonly AppliedMigration[]): {
  ready: boolean;
  missingVersions: number[];
  mismatchedVersions: number[];
} {
  const byVersion = new Map(applied.map((migration) => [Number(migration.version), migration.name]));
  const missingVersions: number[] = [];
  const mismatchedVersions: number[] = [];
  for (const expected of REQUIRED_MIGRATIONS) {
    const actual = byVersion.get(expected.version);
    if (actual === undefined) missingVersions.push(expected.version);
    else if (actual !== expected.name) mismatchedVersions.push(expected.version);
  }
  return {
    ready: missingVersions.length === 0 && mismatchedVersions.length === 0,
    missingVersions,
    mismatchedVersions,
  };
}
