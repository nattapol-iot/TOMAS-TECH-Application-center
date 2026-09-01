export type HistoricalLine = {
    key: string;
    sheet: string;
    row: number;
    revision: string;
    issuedBy: string;
    issuedDate: string | null;
    partNumber: string;
    description: string;
    quantity: number;
    unit: string;
    brand: string;
    supplier: string;
    quotation: string;
    leadTime: string;
    unitPrice: number;
    totalPrice: number;
    actualCost: number | null;
    actualCostText: string;
    currency: string;
    poNumber: string;
    poStatus: string;
    status: "Approved" | "Pending" | "Cancelled" | "Unknown";
    prIssued: boolean;
    remark: string;
};
export type HistoricalWorkbook = {
    sourceName: string;
    sourceHash: string;
    projectNumber: string;
    projectName: string;
    customer: string;
    documentReference: string;
    referenceFromFilename: boolean;
    estimate: number | null;
    lines: HistoricalLine[];
    warnings: string[];
    totals: {
        approved: number;
        pending: number;
        cancelled: number;
        unknown: number;
        active: number;
        all: number;
    };
};
export declare function historicalTotals(lines: HistoricalLine[]): HistoricalWorkbook["totals"];
/** Read workbook data only. Strikethrough means PR issued, not cancelled demand. */
export declare function parseHistoricalPr(bytes: Uint8Array, sourceName: string): HistoricalWorkbook;
