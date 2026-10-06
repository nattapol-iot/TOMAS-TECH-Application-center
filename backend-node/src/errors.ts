import type { FastifyError, FastifyInstance } from "fastify";
import sql from "mssql";
import type { ConnectionError, RequestError } from "mssql";
import { DatabaseReadOnlyViolationError } from "./db.js";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function sqlErrorNumber(error: RequestError): number | undefined {
  const value = (error as RequestError & { number?: number }).number;
  return typeof value === "number" ? value : undefined;
}

/**
 * THROW numbers of dbo.answer_schedule_day_request (database/migrations/007_schedule_day_request_answers.sql).
 * The estimate revision triggers (migrations 008/058) reuse 51112-51115 at runtime, so these numbers are not mapped in
 * the global handler: only the answer route translates them, through dayRequestAnswerError().
 */
const DAY_REQUEST_ANSWER_ERRORS: Readonly<Record<number, readonly [status: number, code: string, message: string]>> = {
  51110: [400, "validation_failed", "Request, task, project and answer actor identifiers are required."],
  51111: [400, "validation_failed", "Day request answer is invalid."],
  51112: [400, "value_too_long", "Answer note cannot exceed 20000 characters."],
  51113: [400, "validation_failed", "Expected task row version is required."],
  51114: [403, "schedule_day_request_answer_forbidden", "Answer actor must be an active user."],
  51115: [404, "project_not_found", "Project not found."],
  51116: [404, "schedule_task_not_found", "Schedule task not found."],
  51117: [409, "schedule_day_request_invalid", "The day request no longer matches its task."],
  51118: [404, "schedule_day_request_not_found", "Schedule day request not found."],
  51119: [409, "schedule_day_request_invalid", "The day request no longer matches its task."],
  51120: [409, "schedule_day_request_invalid", "The schedule update is not a valid day request."],
  51121: [409, "schedule_day_request_answered", "This day request has already been answered."],
  51122: [409, "concurrency_conflict", "The schedule changed. Reload it and try again."],
  51123: [409, "project_closed", "A closed project's schedule cannot be changed."],
  51124: [400, "validation_failed", "Accepting this request would make the task longer than 3650 calendar days."],
  51125: [403, "schedule_day_request_answer_forbidden", "Only the project manager, an Engineering Manager or an Admin can answer this request."],
  51126: [409, "schedule_day_request_not_leaf", "A day request can only be answered while its task remains a non-phase leaf row."],
};

/** THROWs of dbo.withdraw_project_document (migration 069); mapped only around that call. */
const DOCUMENT_WITHDRAW_ERRORS: Readonly<Record<number, readonly [status: number, code: string, message: string]>> = {
  51690: [500, "document_withdraw_transaction", "Withdrawing a project document requires a transaction."],
  51696: [400, "validation_failed", "Document, project, actor and row version are required."],
  51691: [404, "document_not_found", "Project document not found."],
  51692: [409, "concurrency_conflict", "The project document changed. Reload it and try again."],
  51693: [403, "document_withdraw_forbidden", "Only the uploader, the project manager, an Engineering Manager or an Admin can withdraw this document."],
  51694: [409, "document_used_for_signing", "A document that signing uses cannot be withdrawn."],
};

export function documentWithdrawError(error: unknown): ApiError | null {
  if (!(error instanceof sql.RequestError)) return null;
  const mapped = DOCUMENT_WITHDRAW_ERRORS[sqlErrorNumber(error) ?? 0];
  return mapped ? new ApiError(mapped[0], mapped[1], mapped[2]) : null;
}

/** The 4xx ApiError for a dbo.answer_schedule_day_request THROW, or null when the error is anything else. */
export function dayRequestAnswerError(error: unknown): ApiError | null {
  if (!(error instanceof sql.RequestError)) return null;
  const mapped = DAY_REQUEST_ANSWER_ERRORS[sqlErrorNumber(error) ?? 0];
  return mapped ? new ApiError(mapped[0], mapped[1], mapped[2]) : null;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ApiError | ConnectionError | RequestError | DatabaseReadOnlyViolationError, request, reply) => {
    if (error instanceof ApiError) {
      void reply.status(error.statusCode).send({ code: error.code, message: error.message, details: error.details ?? null });
      return;
    }

    if (error instanceof DatabaseReadOnlyViolationError) {
      void reply.status(403).send({ code: "local_read_only", message: "This local API is connected in read-only mode. Database changes are disabled.", details: null });
      return;
    }

    if (error instanceof sql.RequestError) {
      const number = sqlErrorNumber(error);
      if (number === 51433 || number === 51434) {
        void reply.status(409).send({ code: "estimate_erp_mapping_rejected", message: number === 51433 ? "ERP mappings can be changed only on the current Estimate revision before approval." : "ERP mapping source does not belong to this Estimate revision.", details: null });
        return;
      }
      if (number === 51420) {
        void reply.status(422).send({ code: "estimate_total_out_of_range", message: "The estimate total exceeds the supported monetary range. Reduce quantities, rates, contingency or overhead before continuing.", details: null });
        return;
      }
      if (number === 51352 || number === 51351) {
        void reply.status(409).send({code:"activity_conflict",message:number===51352?"A reporting commitment overlaps this period.":"Activity history or a finalized score cannot be changed.",details:null});
        return;
      }
      if (number === 2601 || number === 2627) {
        void reply.status(409).send({ code: "duplicate", message: "The operation would create a duplicate record.", details: null });
        return;
      }
      if (number === 8152 || number === 2628) {
        void reply.status(400).send({ code: "value_too_long", message: "One or more values exceed the allowed length.", details: null });
        return;
      }
      if (number === 547 || number === 8115) {
        void reply.status(422).send({ code: "constraint_violation", message: "The submitted values are outside the allowed range or reference an unavailable record.", details: null });
        return;
      }
      request.log.error({ err: error, sqlErrorNumber: number }, "Database operation failed");
      void reply.status(503).send({ code: "database_unavailable", message: "The database operation could not be completed.", details: null });
      return;
    }

    if (error instanceof sql.ConnectionError) {
      request.log.error({ err: error }, "Database connection failed");
      void reply.status(503).send({ code: "database_unavailable", message: "The database is unavailable.", details: null });
      return;
    }

    request.log.error({ err: error }, "Unhandled API failure");
    void reply.status(error.statusCode && error.statusCode >= 400 ? error.statusCode : 500).send({
      code: error.statusCode === 413 ? "payload_too_large" : "internal_error",
      message: error.statusCode === 413 ? "The request exceeds the configured upload limit." : "An unexpected error occurred.",
      details: null,
    });
  });
}
