/** Shared limits for quantities and THB unit costs persisted to decimal(19,4). */
export function validCostItemNumbers(quantity: number, unitCost: number): boolean {
  const fourDecimals = (value: number) => Math.abs(value * 10000 - Math.round(value * 10000)) <= Math.max(1e-7, Number.EPSILON * Math.abs(value * 10000));
  return Number.isFinite(quantity) && Number.isFinite(unitCost)
    && quantity >= 0.0001 && quantity < 1_000_000_000
    && unitCost >= 0 && unitCost < 1_000_000_000
    && fourDecimals(quantity) && fourDecimals(unitCost)
    && quantity * unitCost <= 999_999_999_999_999;
}
