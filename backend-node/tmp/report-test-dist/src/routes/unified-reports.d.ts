import type { FastifyInstance } from 'fastify';
import type { Database } from '../db.js';
import type { CurrentUserService } from '../users.js';
export declare function registerUnifiedReportRoutes(app: FastifyInstance, db: Database, users: CurrentUserService): void;
