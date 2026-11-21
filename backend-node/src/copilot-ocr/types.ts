export type OcrKind = "namecard" | "quotation";

export type OcrUpload = { name: string; type: string; bytes: Uint8Array };

export type OcrSchemaField = {
  name: string;
  type?: "text" | "number" | "date" | "boolean" | "list" | "object" | "table";
  description?: string;
  columns?: OcrSchemaField[];
};

export type OcrSchema = { description?: string; fields: OcrSchemaField[] };

export type OcrScanRequest = { kind: OcrKind; files: OcrUpload[]; schema?: OcrSchema };

export type OcrDocument = {
  kind: string;
  data: Record<string, unknown>;
  custom?: Record<string, unknown> | null;
  customError?: string | null;
  webUrl?: string | null;
};

export type ScriptText = { ja?: string | null; en?: string | null; th?: string | null } | null | undefined;

export type BusinessCardName = { language: "th" | "en" | "ja"; value: string };

/** The fields the business card scanner fills; the same shape as lib/business-card.ts on the frontend. */
export type BusinessCardExtraction = {
  companyName: string;
  contactName: string;
  companyNames: BusinessCardName[];
  contactNames: BusinessCardName[];
  email: string;
  phone: string;
  website: string;
  position: string;
  department: string;
  address: string;
  documentUrl: string;
};

export type QuotationCurrency = "THB" | "JPY" | "USD" | "EUR";

export type ParsedQuotationLine = {
  lineNo: number;
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  currency: QuotationCurrency;
  remark: string;
};

/** What POST /supplier-quotations/parse-pdf answers; the same shape the Python pdf-parser returned. */
export type ParsedQuotation = {
  supplierName: string;
  supplierTaxId: string;
  quotationNumber: string;
  receivedDate: string;
  validUntil: string;
  currency: QuotationCurrency;
  totalAmount: number;
  lines: ParsedQuotationLine[];
  rawText: string;
  requiresOcr: boolean;
  confidence: Record<string, "high" | "low" | "none">;
};

export type CopilotOcr = { scan: (subject: string, request: OcrScanRequest) => Promise<OcrDocument> };
