import type { Transaction } from 'mssql';
import type { FastifyRequest } from 'fastify';
import type { CurrentUser } from './types.js';
import type { CurrentUserService } from './users.js';
export type ReportTemplateRow = {
    id: number;
    name: string;
    description: string;
    report_type: string;
    locale: string;
    body_json: string;
    version: number;
    is_active: boolean;
    created_by: number;
    row_version: Buffer;
};
export declare function safeTemplateBody(reportType: string, body: unknown): Record<string, unknown>;
export declare function templateLocale(value: unknown): string;
export declare function templateMetadata(value: unknown): {
    name: string;
    description: string;
};
export declare function canManageTemplate(row: ReportTemplateRow, actor: CurrentUser, permissions: Set<string>): boolean;
export declare function templateDto(row: ReportTemplateRow, actor: CurrentUser, permissions: Set<string>): {
    id: number;
    name: string;
    description: string;
    reportType: string;
    locale: string;
    body: any;
    version: number;
    isActive: boolean;
    rowVersion: string;
    canEdit: boolean;
};
export declare function templateRow(tx: Transaction, id: number): Promise<ReportTemplateRow>;
export declare function templateVersion(row: ReportTemplateRow, value: unknown): void;
export declare function templateInput(tx: Transaction, users: CurrentUserService, request: FastifyRequest, actor: CurrentUser, value: unknown): Promise<{
    reportType: string;
    locale: string;
    body: Record<string, unknown>;
}>;
/** Locks the selected version until the caller snapshots it into the new report. */
export declare function reportTemplateSnapshot(tx: Transaction, id: unknown, version: unknown, reportType: string, actor: CurrentUser): Promise<{
    id: number;
    name: string;
    version: number;
    locale: string;
    bodyJson: string;
}>;
