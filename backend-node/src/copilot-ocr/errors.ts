import { ApiError } from "../errors.js";
import { CopilotOcrError } from "./client.js";

/** A copilot failure as the API answers it. Not 401: that status signs the browser out of this app, and the person is still signed in here. */
export function ocrApiError(error: unknown): unknown {
  if (!(error instanceof CopilotOcrError)) return error;
  switch (error.reason) {
    case "signed_out":
      return new ApiError(409, "copilot_sign_in_required", "Sign in to TMT ID again, then scan once more. Signing out first is not needed.");
    case "rejected":
      return new ApiError(422, "copilot_rejected", error.message);
    case "unreadable":
      return new ApiError(422, "copilot_unreadable", error.message);
    case "timeout":
      return new ApiError(504, "copilot_busy", error.message);
    case "unavailable":
      return new ApiError(503, "copilot_unavailable", error.message);
  }
}
