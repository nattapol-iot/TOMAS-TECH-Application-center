import { ApiError } from "./errors.js";

export function parseModuleDescriptionRows(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20 || value.some(row => typeof row !== "string" || row.length > 500)) {
    throw new ApiError(400, "validation_failed", "Module details allow up to 20 text rows, each at most 500 characters.");
  }
  return (value as string[]).map(row => row.trim()).filter(Boolean);
}

/** Refuse unrepresentable quantities rather than silently losing components when scaling back. */
export function scaleModuleQuantities(rows: { id: number; qty: number | string }[], previous: number, next: number) {
  const ticks = (value: number | string) => {
    const scaled = Math.round(Number(value) * 10000);
    if (!Number.isSafeInteger(scaled)) throw new ApiError(400, "quantity_range", "Quantity exceeds supported precision.");
    return BigInt(scaled);
  };
  const oldTicks = ticks(previous), newTicks = ticks(next);
  return rows.map(row => {
    const numerator = ticks(row.qty) * newTicks;
    if (oldTicks <= 0n || numerator % oldTicks !== 0n)
      throw new ApiError(400, "quantity_precision", "This quantity would require more than four decimal places for a component.");
    const result = numerator / oldTicks;
    if (result % 10000n !== 0n) throw new ApiError(400, "quantity_integer", "Changing module quantity would create a fractional item quantity. Adjust the item quantities first.");
    if (result <= 0n || result > BigInt(Number.MAX_SAFE_INTEGER))
      throw new ApiError(400, "quantity_range", "A component quantity is outside the supported range.");
    return { id: row.id, quantity: Number(result) / 10000 };
  });
}
