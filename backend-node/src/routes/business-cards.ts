import type { FastifyInstance } from "fastify";
import { readFile, unlink } from "node:fs/promises";
import { businessCardFromScan } from "../copilot-ocr/business-card.js";
import { BUSINESS_CARD_MAX_BYTES, BUSINESS_CARD_TYPES } from "../copilot-ocr/constants.js";
import { ocrApiError } from "../copilot-ocr/errors.js";
import type { CopilotOcr } from "../copilot-ocr/types.js";
import { DOCUMENT_UPLOAD_RATE_LIMIT, readMultipartUpload } from "../document-storage.js";
import { ApiError } from "../errors.js";
import type { CurrentUserService } from "../users.js";

/** A business card photo read by copilot's OCR API as the signed-in person; nothing is stored here, the forms fill from the answer. */
export function registerBusinessCardRoutes(app: FastifyInstance, users: CurrentUserService, ocr: CopilotOcr | null): void {
  app.post("/api/v1/business-cards/scan", { config: { rateLimit: DOCUMENT_UPLOAD_RATE_LIMIT } }, async (request) => {
    const actor = await users.required(request);
    const { file } = await readMultipartUpload(request, BUSINESS_CARD_MAX_BYTES);
    let bytes: Buffer;
    try {
      bytes = await readFile(file.filepath);
    } finally {
      await unlink(file.filepath).catch(() => undefined);
    }
    if (!ocr) throw new ApiError(503, "copilot_off", "Business card reading is not connected on this server.");
    if (!BUSINESS_CARD_TYPES.includes(file.mimetype)) throw new ApiError(400, "validation_failed", "Send the card as a JPEG or PNG image.");
    try {
      return businessCardFromScan(
        await ocr.scan(actor.entraObjectId, {
          kind: "namecard",
          files: [{ name: file.filename || "business-card.jpg", type: file.mimetype, bytes }],
        }),
      );
    } catch (error) {
      throw ocrApiError(error);
    }
  });
}
