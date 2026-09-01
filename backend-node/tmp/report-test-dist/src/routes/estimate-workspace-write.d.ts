import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import type { EmailService } from "../email.js";
import type { CurrentUserService } from "../users.js";
export declare function registerEstimateWorkspaceWriteRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService, email: EmailService): void;
