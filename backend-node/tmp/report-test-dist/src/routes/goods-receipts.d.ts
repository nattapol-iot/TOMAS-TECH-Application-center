import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
export declare function registerGoodsReceiptRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void;
