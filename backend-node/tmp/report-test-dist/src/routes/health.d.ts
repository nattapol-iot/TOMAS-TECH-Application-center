import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
export declare function registerHealthRoutes(app: FastifyInstance, config: AppConfig, database: Database): void;
