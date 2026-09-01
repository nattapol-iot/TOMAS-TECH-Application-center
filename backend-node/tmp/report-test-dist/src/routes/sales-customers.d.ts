import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Transaction } from "mssql";
import type { Database } from "../db.js";
import type { CurrentUserService } from "../users.js";
export type LocalizedNameInput = {
    name: string;
    nameTh: string;
    nameEn: string;
    nameJa: string;
};
type ContactInput = LocalizedNameInput & ContactTitleInput & {
    email: string;
    phone: string;
    department: string;
    position: string;
};
type CustomerInput = LocalizedNameInput & {
    contactTitleTh: string;
    contactTitleEn: string;
    contactTitleJa: string;
    code: string;
    contact: string;
    contactNameTh: string;
    contactNameEn: string;
    contactNameJa: string;
    email: string;
    phone: string;
    site: string;
    industry: string;
    department: string;
    position: string;
};
export declare function localizedNameInput(body: Record<string, unknown>, prefix: "" | "contact", legacyKey: "name" | "contact", maximumLength: number, label: string, required: boolean): LocalizedNameInput;
export type ContactTitleInput = {
    titleTh: string;
    titleEn: string;
    titleJa: string;
};
export declare function contactTitleInput(body: Record<string, unknown>, customer?: boolean): ContactTitleInput;
export declare function salesCustomerInput(body: Record<string, unknown>): CustomerInput;
export declare function salesContactInput(body: Record<string, unknown>): ContactInput;
export declare function demandSalesCustomerPermission(users: CurrentUserService, request: FastifyRequest, write: boolean): Promise<void>;
export declare const primaryCustomerContactApply = "OUTER APPLY (\n  SELECT TOP(1) sc.department,sc.position,sc.title_th,sc.title_en,sc.title_ja,sc.name_th,sc.name_en,sc.name_ja FROM dbo.customer_site_contacts sc\n  JOIN dbo.customer_sites s ON s.id=sc.site_id\n  WHERE s.customer_id=c.id AND s.code=N'MAIN' AND s.is_active=1 AND s.deleted_at IS NULL\n    AND sc.is_primary=1 AND sc.is_active=1 AND sc.deleted_at IS NULL AND sc.name=c.contact\n  ORDER BY sc.id\n) primary_contact";
export declare function syncPrimaryCustomerContact(transaction: Transaction, actorId: number, customerId: number, input: ContactInput, previousName?: string): Promise<void>;
export declare function registerSalesCustomerRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void;
export {};
