import type { FastifyInstance } from "fastify";
export declare class ApiError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: unknown | undefined;
    constructor(statusCode: number, code: string, message: string, details?: unknown | undefined);
}
export declare function registerErrorHandler(app: FastifyInstance): void;
