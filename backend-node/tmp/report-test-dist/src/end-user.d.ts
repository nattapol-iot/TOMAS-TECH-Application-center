import type { Transaction } from "mssql";
import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import type { CurrentUserService } from "./users.js";
export declare function endUserCustomerId(value: unknown, required?: boolean): number | null | undefined;
export declare function demandEditableEndUser(status: string): void;
export declare function validateEndUser(transaction: Transaction, id: number | null): Promise<{
    endUserCustomerId: number | null;
    endUserName: string | null;
    endUserCode: string | null;
}>;
export declare function registerEndUserUpdateRoute(app: FastifyInstance, database: Database, users: CurrentUserService, entity: "Inquiry" | "Project"): void;
