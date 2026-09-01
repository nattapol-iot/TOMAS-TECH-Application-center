import { ApiError } from "./errors.js";

export function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export function optionalText(value: unknown, maxLength: number, label: string): string | null {
  const normalized = firstQueryValue(value)?.trim() ?? "";
  if (normalized.length > maxLength) {
    throw new ApiError(400, "validation_failed", `${label} cannot exceed ${maxLength} characters.`);
  }
  return normalized || null;
}

export function positiveLong(value: unknown, label: string): number {
  const normalized = firstQueryValue(value);
  const number = normalized && /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new ApiError(400, "validation_failed", `${label} must be a positive number.`);
  }
  return number;
}

export function optionalPositiveLong(value: unknown, label: string): number | null {
  const normalized = firstQueryValue(value);
  return normalized === undefined || normalized === "" ? null : positiveLong(normalized, label);
}

export function clampedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const normalized = firstQueryValue(value);
  const parsed = normalized && /^-?\d+$/.test(normalized) ? Number(normalized) : fallback;
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

export function booleanQuery(value: unknown, fallback = false): boolean {
  const normalized = firstQueryValue(value)?.toLowerCase();
  if (normalized === undefined || normalized === "") return fallback;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new ApiError(400, "validation_failed", "Boolean query values must be true or false.");
}

export function dateOnly(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "validation_failed", "A JSON request body is required.");
  }
  return value as Record<string, unknown>;
}

export function requiredText(value: unknown, maxLength: number, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new ApiError(400, "validation_failed", `${label} is required.`);
  if (normalized.length > maxLength) {
    throw new ApiError(400, "validation_failed", `${label} cannot exceed ${maxLength} characters.`);
  }
  return normalized;
}

export function optionalBodyText(value: unknown, maxLength: number, label: string): string | null {
  if (value === undefined || value === null) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > maxLength) {
    throw new ApiError(400, "validation_failed", `${label} cannot exceed ${maxLength} characters.`);
  }
  return normalized || null;
}

export function requiredInteger(value: unknown, label: string, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  }
  return value as number;
}

export function oneOf(value: string, label: string, allowed: readonly string[]): string {
  if (!allowed.includes(value)) {
    throw new ApiError(400, "validation_failed", `${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

export function parseDateOnly(value: unknown, label: string, optional = false): string | null {
  if ((value === undefined || value === null || value === "") && optional) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, "validation_failed", `${label} must be a valid date in YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, "validation_failed", `${label} must be a valid date in YYYY-MM-DD format.`);
  }
  return value;
}

export function parseRowVersion(value: unknown): Buffer {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "invalid_row_version", "The row version is required.");
  }
  try {
    const bytes = Buffer.from(value, "base64");
    const canonical = bytes.toString("base64");
    if (bytes.length !== 8 || canonical !== value.trim()) {
      throw new ApiError(400, "invalid_row_version", bytes.length === 8
        ? "The row version is invalid."
        : "The row version must contain exactly 8 bytes.");
    }
    return bytes;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_row_version", "The row version is invalid.");
  }
}

export function timestamp(value: Date | string): Date | string {
  return value;
}
