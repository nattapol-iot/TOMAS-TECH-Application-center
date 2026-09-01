import sql from "mssql/msnodesqlv8.js";
export class ApiError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = "ApiError";
    }
}
function sqlErrorNumber(error) {
    const value = error.number;
    return typeof value === "number" ? value : undefined;
}
export function registerErrorHandler(app) {
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof ApiError) {
            void reply.status(error.statusCode).send({ code: error.code, message: error.message, details: error.details ?? null });
            return;
        }
        if (error instanceof sql.RequestError) {
            const number = sqlErrorNumber(error);
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
//# sourceMappingURL=errors.js.map