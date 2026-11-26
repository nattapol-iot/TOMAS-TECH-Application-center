/*
 * The Sales screens in two looks (owner 2026-11-21, "ใช้ UI นี้ปรับส่วนของฟีเจอร์ Sales หน่อย แต่อยากให้มีปุ่ม V1,V2"), arranged
 * the way Estimating is (lib/estimate-look.ts): V1 is the screen as it was, V2 is the same screen in the Pegasus ERP look, with
 * the deal list and the RFQ list laid out the Pegasus way. Both read and write through the same API, so a feature added later
 * shows in both. Everyone starts on V1; the choice is kept per person in this browser, apart from the Estimating one.
 */
export type SalesLook = "v1" | "v2";

/**
 * The menu screens of the Sales group that carry the V1 / V2 switch. The CRM screens left it on 2026-11-26: they are built
 * on @tomas-tc/ui, the Pegasus look, for everyone (owner's choice).
 */
export const SALES_LOOK_VIEWS = ["inquiries", "site-visits", "my-assignments", "visit-master", "customers"] as const;

export const SALES_LOOK_DEFAULT: SalesLook = "v1";

export function salesLookKey(userId: number | string): string {
  return `tomas-tech-sales-look:${userId}`;
}

/** Anything that is not exactly "v2" reads as the default. */
export function parseSalesLook(value: unknown): SalesLook {
  return value === "v2" ? "v2" : SALES_LOOK_DEFAULT;
}

/** The seven statuses dbo.inquiries allows, in the order an RFQ moves through them. */
export const INQUIRY_STATUSES = ["New", "Estimating", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Approved", "Cancelled"] as const;

export type InquiryStatusCount = { status: string; count: number };

/**
 * The RFQ summary bar's count for one cell, over every filter but the status ("All status" adds them all). A cell counts
 * exactly what pressing it lists, because the API filters on the status as stored.
 */
export function inquiryStatusCell(counts: readonly InquiryStatusCount[], status: string): number {
  return counts.filter((row) => status === "All status" || row.status === status).reduce((sum, row) => sum + row.count, 0);
}

/** One cell of the deal summary bar: the deals it counts and the filter it sets. */
export type DealSummaryCell = { key: string; stage: string; open: boolean; count: number };

/**
 * The deal list's summary bar: every open deal, then each stage a deal travels through, then the two ways it ends. A stage
 * cell lists that stage only; Won and Lost turn the open-only filter off, or they would list nothing.
 */
export function dealSummaryCells(openStages: readonly string[], stageCounts: Record<string, number>, open: number): DealSummaryCell[] {
  const count = (stage: string) => Number(stageCounts[stage] ?? 0);
  return [
    { key: "open", stage: "", open: true, count: open },
    ...openStages.map((stage) => ({ key: stage, stage, open: true, count: count(stage) })),
    { key: "WON", stage: "WON", open: false, count: count("WON") },
    { key: "LOST", stage: "LOST", open: false, count: count("LOST") },
  ];
}
