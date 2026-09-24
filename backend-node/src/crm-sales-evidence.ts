import { ApiError } from "./errors.js";
import { optionalBodyText, parseDateOnly } from "./http.js";

export function salesEvidenceInput(body: Record<string, unknown>) {
  return {
    proposalSentOn: parseDateOnly(body.proposalSentOn || null, "Quotation sent date", true),
    proposalReference: optionalBodyText(body.proposalReference, 1000, "Quotation reference") ?? null,
    wonOn: parseDateOnly(body.wonOn || null, "Order confirmation date", true),
    wonReference: optionalBodyText(body.wonReference, 1000, "Order confirmation reference") ?? null,
  };
}

/** Existing unverified stages remain editable, but entering a sales milestone needs evidence. */
export function validateSalesEvidence(
  input: ReturnType<typeof salesEvidenceInput> & { stage: string },
  previous: Record<string, unknown> | null,
  today: string,
) {
  const pairs: [string | null, string | null, unknown][] = [
    [input.proposalSentOn, input.proposalReference, previous?.proposal_sent_on],
    [input.wonOn, input.wonReference, previous?.won_on],
  ];
  for (const [date, reference, previousDate] of pairs) {
    if (Boolean(date) !== Boolean(reference) || (date && date > today) || (previousDate && !date)) {
      throw new ApiError(422, "crm_sales_evidence_required", "Provide both an actual date and a document or customer confirmation reference; recorded evidence cannot be cleared.");
    }
  }
  if (input.stage !== previous?.stage) {
    if (["PROPOSAL", "NEGOTIATION"].includes(input.stage) && !input.proposalSentOn)
      throw new ApiError(422, "crm_proposal_evidence_required", "Record the quotation sent date and reference before advancing the sales stage.");
    if (input.stage === "WON" && !input.wonOn)
      throw new ApiError(422, "crm_order_evidence_required", "Record the order confirmation date and reference before marking the opportunity won.");
  }
}

export function inquiryEstimateOwner(selected: unknown, technicalOwner: unknown): unknown {
  return selected == null || selected === "" ? technicalOwner : selected;
}
