import { ApiError } from "./errors.js";
import { parseDateOnly } from "./http.js";

/**
 * Installed base: the shape of an asset as the API accepts it, and how a change becomes timeline
 * events. Pure functions, so the rules are tested without a database.
 */
export const ASSET_CATEGORIES = ["Gateway", "PLC", "HMI", "IPC", "Server", "Network", "Sensor", "Meter", "Camera", "Software", "Other"] as const;
export const ASSET_STATUSES = ["Active", "Spare", "Faulty", "Replaced", "Retired"] as const;
/** Kinds a person may add by hand; the others are written by the system as fields change. */
export const MANUAL_EVENT_KINDS = ["Note", "Serviced"] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export type AssetInput = {
  customerId: number;
  customerSiteId: number | null;
  projectId: number | null;
  monitorSiteId: number | null;
  monitorProgramId: number | null;
  category: AssetCategory;
  name: string;
  manufacturer: string;
  model: string;
  serialNo: string;
  locationDetail: string;
  ipAddress: string;
  firmwareVersion: string;
  repository: string;
  installedOn: string | null;
  warrantyUntil: string | null;
  status: AssetStatus;
  replacedById: number | null;
  notes: string;
};

function text(raw: Record<string, unknown>, key: string, maximum: number, label: string, required = false): string {
  const value = raw[key];
  if (value !== undefined && value !== null && typeof value !== "string") throw new ApiError(400, "validation_failed", `${label} must be text.`);
  const trimmed = (value ?? "").toString().trim().replace(/\s+/g, (space) => (space.includes("\n") ? space : " "));
  if (required && !trimmed) throw new ApiError(400, "validation_failed", `${label} is required.`);
  if (trimmed.length > maximum) throw new ApiError(400, "validation_failed", `${label} cannot exceed ${maximum} characters.`);
  return trimmed;
}

function idOrNull(raw: Record<string, unknown>, key: string, label: string): number | null {
  const value = raw[key];
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number) || number <= 0) throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  return number;
}

/** Validates and normalises an asset from a request body. */
export function parseAssetInput(raw: Record<string, unknown>): AssetInput {
  const customerId = idOrNull(raw, "customerId", "Customer");
  if (!customerId) throw new ApiError(400, "validation_failed", "Customer is required.");
  const category = text(raw, "category", 20, "Category", true);
  if (!(ASSET_CATEGORIES as readonly string[]).includes(category)) {
    throw new ApiError(400, "validation_failed", `Category must be one of: ${ASSET_CATEGORIES.join(", ")}.`);
  }
  const status = text(raw, "status", 20, "Status") || "Active";
  if (!(ASSET_STATUSES as readonly string[]).includes(status)) {
    throw new ApiError(400, "validation_failed", `Status must be one of: ${ASSET_STATUSES.join(", ")}.`);
  }
  const installedOn = parseDateOnly(raw.installedOn, "Installed on", true);
  const warrantyUntil = parseDateOnly(raw.warrantyUntil, "Warranty until", true);
  if (installedOn && warrantyUntil && warrantyUntil < installedOn) {
    throw new ApiError(400, "validation_failed", "Warranty cannot end before the installation date.");
  }
  const repository = text(raw, "repository", 100, "Repository");
  if (repository && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository)) {
    throw new ApiError(400, "validation_failed", "Repository must be a TMTHub repository name.");
  }
  const replacedById = idOrNull(raw, "replacedById", "Replaced by");
  if (replacedById && status !== "Replaced") throw new ApiError(400, "validation_failed", "Only a replaced asset names its replacement.");
  const monitorProgramId = idOrNull(raw, "monitorProgramId", "Monitored program");
  const monitorSiteId = idOrNull(raw, "monitorSiteId", "Monitor site");
  if (monitorProgramId && !monitorSiteId) throw new ApiError(400, "validation_failed", "A monitored program belongs to a Site Monitor site.");
  return {
    customerId,
    customerSiteId: idOrNull(raw, "customerSiteId", "Customer site"),
    projectId: idOrNull(raw, "projectId", "Project"),
    monitorSiteId,
    monitorProgramId,
    category: category as AssetCategory,
    name: text(raw, "name", 200, "Name", true),
    manufacturer: text(raw, "manufacturer", 150, "Manufacturer"),
    model: text(raw, "model", 150, "Model"),
    serialNo: text(raw, "serialNo", 150, "Serial number"),
    locationDetail: text(raw, "locationDetail", 300, "Location"),
    ipAddress: text(raw, "ipAddress", 100, "IP address"),
    firmwareVersion: text(raw, "firmwareVersion", 100, "Firmware / version"),
    repository,
    installedOn,
    warrantyUntil,
    status: status as AssetStatus,
    replacedById,
    notes: text(raw, "notes", 2000, "Notes"),
  };
}

export type AssetEvent = { kind: "StatusChanged" | "FirmwareChanged" | "Moved" | "Replaced" | "Updated"; summary: string; details: Record<string, unknown> };

const FIELD_LABELS: Record<string, string> = {
  name: "name", manufacturer: "manufacturer", model: "model", serialNo: "serial number", ipAddress: "IP address",
  repository: "repository", installedOn: "installation date", warrantyUntil: "warranty", notes: "notes", category: "category",
  projectId: "project", monitorSiteId: "Site Monitor site", monitorProgramId: "monitored program",
};

/**
 * Timeline events for one edit. Status, firmware and location changes get their own events because
 * they are what people look for later; every other field change is folded into one "Updated".
 */
export function assetChangeEvents(before: AssetInput, after: AssetInput): AssetEvent[] {
  const events: AssetEvent[] = [];
  if (before.status !== after.status) {
    events.push(after.status === "Replaced" && after.replacedById
      ? { kind: "Replaced", summary: `Replaced (${before.status} → Replaced)`, details: { from: before.status, to: after.status, replacedById: after.replacedById } }
      : { kind: "StatusChanged", summary: `${before.status} → ${after.status}`, details: { from: before.status, to: after.status } });
  }
  if (before.firmwareVersion !== after.firmwareVersion) {
    events.push({
      kind: "FirmwareChanged",
      summary: `${before.firmwareVersion || "—"} → ${after.firmwareVersion || "—"}`,
      details: { from: before.firmwareVersion, to: after.firmwareVersion },
    });
  }
  if (before.customerId !== after.customerId || before.customerSiteId !== after.customerSiteId || before.locationDetail !== after.locationDetail) {
    events.push({
      kind: "Moved",
      summary: after.locationDetail || "Location changed",
      details: {
        from: { customerId: before.customerId, customerSiteId: before.customerSiteId, location: before.locationDetail },
        to: { customerId: after.customerId, customerSiteId: after.customerSiteId, location: after.locationDetail },
      },
    });
  }
  const changed = Object.keys(FIELD_LABELS).filter((key) => before[key as keyof AssetInput] !== after[key as keyof AssetInput]);
  if (changed.length > 0) {
    events.push({
      kind: "Updated",
      summary: `Changed ${changed.map((key) => FIELD_LABELS[key]).join(", ")}`,
      details: Object.fromEntries(changed.map((key) => [key, { from: before[key as keyof AssetInput], to: after[key as keyof AssetInput] }])),
    });
  }
  return events;
}

/** Warranty state on a business date: expired, ending within 60 days, or fine. */
export function warrantyState(warrantyUntil: string | null, today: string): "none" | "expired" | "expiring" | "covered" {
  if (!warrantyUntil) return "none";
  if (warrantyUntil < today) return "expired";
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 60);
  return warrantyUntil <= soon.toISOString().slice(0, 10) ? "expiring" : "covered";
}
