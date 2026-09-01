import type { FastifyInstance } from "fastify";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
export declare function registerEstimateCostWriteRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void;
