import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
type Material = {
    row: number;
    title: string;
    language: string;
    format: string;
    filename: string;
    url: string | null;
};
type Catalog = {
    sourceUrl: string;
    sourceFile: string;
    groups: Array<{
        id: string;
        title: string;
        materials: Material[];
    }>;
    updatedAt?: string;
    updatedBy?: string;
};
export declare function validateSalesMaterialCatalog(value: unknown): Catalog;
export declare function registerKnowledgeSalesMaterialRoutes(app: FastifyInstance, config: AppConfig, _database: Database, users: CurrentUserService): void;
export {};
