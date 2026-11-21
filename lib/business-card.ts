export type BusinessCardName = { language: "th" | "en" | "ja"; value: string };

/** What POST /api/v1/business-cards/scan answers: copilot's reading of the card (backend-node/src/copilot-ocr/business-card.ts). */
export type BusinessCardExtraction = {
  companyName: string;
  contactName: string;
  companyNames?: BusinessCardName[];
  contactNames?: BusinessCardName[];
  email: string;
  phone: string;
  website: string;
  position: string;
  department: string;
  address: string;
  /** The scan in the person's copilot Document Scanner. */
  documentUrl: string;
};

export function countBusinessCardFields(result: BusinessCardExtraction) {
  return [result.companyName, result.contactName, result.email, result.phone, result.position, result.department, result.address].filter(Boolean).length;
}
