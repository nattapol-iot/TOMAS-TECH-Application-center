import type { FastifyInstance } from 'fastify';
import type { Database } from '../db.js';
import type { CurrentUserService } from '../users.js';
export declare function registerReportTemplateRoutes(app: FastifyInstance, db: Database, users: CurrentUserService): void;
