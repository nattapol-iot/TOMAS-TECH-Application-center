import { ApiError } from "./errors.js";

export function parseModuleDescriptionRows(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20 || value.some(row => typeof row !== "string" || row.length > 500)) {
    throw new ApiError(400, "validation_failed", "Module details allow up to 20 text rows, each at most 500 characters.");
  }
  return (value as string[]).map(row => row.trim()).filter(Boolean);
}
