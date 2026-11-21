import { QUOTATION_CURRENCIES, QUOTATION_DEFAULT_CURRENCY, TAX_ID_DIGITS } from "./constants.js";
import type { OcrDocument, OcrSchema, ParsedQuotation, ParsedQuotationLine, QuotationCurrency } from "./types.js";

/** The fields a supplier quotation is read into; copilot returns them in document.custom with these names and types. */
export const QUOTATION_SCHEMA: OcrSchema = {
  description: "A supplier quotation sent to us (Tomas Tech); we are the customer it is addressed to.",
  fields: [
    { name: "supplier_name", description: "The company that issued the quotation (the seller), never the customer it is addressed to" },
    { name: "supplier_tax_id", description: "The seller's 13-digit tax ID, digits only" },
    { name: "quotation_number", description: "The number of this quotation" },
    { name: "issue_date", type: "date", description: "The date the quotation was issued" },
    { name: "valid_until", type: "date", description: "The date the prices stop being valid, when a date is printed" },
    { name: "validity_days", type: "number", description: "The validity period in days, when a period is printed instead of a date" },
    { name: "currency", description: "Currency code of the prices: THB, JPY, USD or EUR" },
    { name: "total_amount", type: "number", description: "The final total the supplier asks for, as printed on the quotation" },
    {
      name: "lines",
      type: "table",
      description: "Every priced row of the item table; skip section headings that carry no price",
      columns: [
        { name: "item_code", description: "Part number or item code, when printed" },
        { name: "description", description: "What is quoted" },
        { name: "brand" },
        { name: "model", description: "Model or type number" },
        { name: "qty", type: "number" },
        { name: "unit", description: "Unit of measure such as pcs, set, lot" },
        { name: "unit_price", type: "number" },
        { name: "line_total", type: "number", description: "Amount of the row" },
        { name: "remark" },
      ],
    },
  ],
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const date = (value: unknown) => (typeof value === "string" && DATE.test(value) ? value : "");

function currencyOf(value: unknown): QuotationCurrency {
  const code = str(value).toUpperCase();
  return (QUOTATION_CURRENCIES as readonly string[]).includes(code) ? (code as QuotationCurrency) : QUOTATION_DEFAULT_CURRENCY;
}

function addDays(isoDate: string, days: number): string {
  const day = new Date(`${isoDate}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + Math.round(days));
  return day.toISOString().slice(0, 10);
}

/** Copilot's reading of a quotation (document.custom for QUOTATION_SCHEMA) in the shape the quotation form fills from. */
export function quotationFromScan(document: OcrDocument): ParsedQuotation {
  const fields = document.custom ?? {};
  const currency = currencyOf(fields.currency);
  const receivedDate = date(fields.issue_date);
  const validityDays = num(fields.validity_days);
  const validUntil = date(fields.valid_until) || (receivedDate && validityDays > 0 ? addDays(receivedDate, validityDays) : "");
  const rows = Array.isArray(fields.lines) ? fields.lines : [];
  const lines: ParsedQuotationLine[] = rows
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : {}))
    .filter((row) => str(row.description) || str(row.item_code))
    .map((row, index) => ({
      lineNo: index + 1,
      itemCode: str(row.item_code),
      description: str(row.description),
      brand: str(row.brand),
      model: str(row.model),
      qty: num(row.qty),
      unit: str(row.unit),
      unitPrice: num(row.unit_price),
      lineTotal: num(row.line_total),
      currency,
      remark: str(row.remark),
    }));
  const supplierName = str(fields.supplier_name),
    supplierTaxId = str(fields.supplier_tax_id).replace(/\D/g, ""),
    quotationNumber = str(fields.quotation_number);
  const totalAmount = num(fields.total_amount);
  const level = (present: boolean, strong: boolean) => (strong ? "high" : present ? "low" : "none");
  return {
    supplierName,
    supplierTaxId,
    quotationNumber,
    receivedDate,
    validUntil,
    currency,
    totalAmount,
    lines,
    rawText: "",
    requiresOcr: false,
    confidence: {
      supplierName: level(Boolean(supplierName), supplierName.length > 5),
      supplierTaxId: level(Boolean(supplierTaxId), supplierTaxId.length === TAX_ID_DIGITS),
      quotationNumber: level(Boolean(quotationNumber), Boolean(quotationNumber)),
      receivedDate: level(Boolean(receivedDate), Boolean(receivedDate)),
      validUntil: level(Boolean(validUntil), Boolean(validUntil)),
      totalAmount: level(totalAmount > 0, totalAmount > 0),
    },
  };
}
