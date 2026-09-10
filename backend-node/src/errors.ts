import type { FastifyError, FastifyInstance } from "fastify";
import sql from "mssql";
import type { ConnectionError, RequestError } from "mssql";

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

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ApiError | ConnectionError | RequestError, request, reply) => {
    if (error instanceof ApiError) {
      void reply.status(error.statusCode).send({ code: error.code, message: error.message, details: error.details ?? null });
      return;
    }

    if (error instanceof sql.RequestError) {
      const number = sqlErrorNumber(error);
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
