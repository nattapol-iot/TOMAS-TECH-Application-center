import { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { Database } from "./db.js";
export type Application = {
    app: FastifyInstance;
    database: Database;
};
export declare function buildApp(config: AppConfig): Promise<Application>;
