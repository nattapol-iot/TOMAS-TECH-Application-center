/** Only active, explicitly mapped rows contribute to this document's comparison. */
export function historicalPrComparison(
  lines: { key: string; status: string; actualCost: number | null; totalPrice: number }[],
  links: Record<string, { estimateLineId: number | null }>,
  estimate: { id: number; quantity: number; unitCost: number },
) {
  const mapped = lines.filter(line => links[line.key]?.estimateLineId === estimate.id && ["Approved", "Pending"].includes(line.status));
  const amount = Math.round(mapped.reduce((sum, line) => sum + (line.actualCost ?? line.totalPrice), 0) * 100) / 100;
  const budget = Math.round(estimate.quantity * estimate.unitCost * 100) / 100;
  return { amount, budget, variance: budget > 0 ? Math.round((amount - budget) * 100) / 100 : null,
    quotedRows: mapped.filter(line => line.actualCost === null).length };
}
