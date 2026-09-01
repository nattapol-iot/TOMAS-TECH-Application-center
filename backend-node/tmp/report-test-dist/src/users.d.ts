import type { FastifyRequest } from "fastify";
import type { Database } from "./db.js";
import type { CurrentUser } from "./types.js";
export declare class CurrentUserService {
    private readonly database;
    constructor(database: Database);
    required(request: FastifyRequest): Promise<CurrentUser>;
    demandPermission(request: FastifyRequest, permission: string): Promise<void>;
}
