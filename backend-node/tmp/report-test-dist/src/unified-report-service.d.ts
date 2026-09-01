import type { Transaction } from 'mssql';
import type { FastifyRequest } from 'fastify';
import type { Database } from './db.js';
import type { CurrentUser } from './types.js';
export declare const REPORT_TYPES: readonly ["INSTALLATION", "UAT", "SERVICE", "INSPECTION", "POC"];
export declare const CUSTOMER_CONSENT = "I have read this exact report revision and consent to record my acknowledgment or signature, identity and date against it.";
export declare const TEAM_CONSENT = "I have reviewed this exact report revision and authorize use of my own signature specimen for this action.";
export declare const reportHash: (value: string | Buffer) => string;
export declare const reportElevated: (actor: CurrentUser) => boolean;
export declare function reportPermissions(tx: Transaction, userId: number): Promise<Set<string>>;
export type ReportRow = {
    id: number;
    report_no: string;
    report_type: string;
    inquiry_id: number | null;
    project_id: number | null;
    schedule_task_id: number | null;
    current_revision: number;
    created_by: number;
    revision_id: number;
    revision: number;
    title: string;
    report_date: Date;
    locale: string;
    body_json: string;
    state: string;
    prepared_by: number;
    reviewer_id: number | null;
    approver_id: number;
    row_version: Buffer;
    submitted_at: Date | null;
    reviewed_at: Date | null;
    approved_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
    snapshot_json: string | null;
    snapshot_sha256: string | null;
    decision_note: string;
    template_id: number | null;
    template_version: number | null;
    template_name: string | null;
};
export declare const REPORT_SELECT = "SELECT h.id,h.report_no,h.report_type,h.inquiry_id,h.project_id,h.schedule_task_id,h.current_revision,h.created_by,h.template_id,h.template_version,h.template_name,\n r.id revision_id,r.revision,r.title,r.report_date,r.locale,r.body_json,r.state,r.prepared_by,r.reviewer_id,r.approver_id,r.row_version,\n r.submitted_at,r.reviewed_at,r.approved_at,r.completed_at,r.created_at,r.updated_at,r.snapshot_json,r.snapshot_sha256,r.decision_note\n FROM dbo.unified_reports h JOIN dbo.unified_report_revisions r ON r.report_id=h.id";
export declare function validateReportSource(type: string, kind: string): void;
export declare function parseReportBody(value: unknown): string;
/** Drafts remain unrestricted. A signature may only freeze a usable report. */
export declare function validateReportForSubmission(reportType: string, bodyJson: string): void;
export declare function draftInput(value: unknown): {
    title: string;
    reportDate: string;
    locale: string;
    bodyJson: string;
    reviewerId: number | null;
    approverId: number;
};
export declare function readReport(tx: Transaction, id: number, revision?: number): Promise<ReportRow>;
export declare function reportVersion(r: ReportRow, value: unknown): void;
export declare function reportSource(tx: Transaction, actor: CurrentUser, kind: string, id: number, write?: boolean, assigned?: boolean): Promise<{
    status: string;
    reference: string;
    title: string;
    customer: string;
    endUserCustomerId: number | null;
    endUserName: string | null;
    endUserCode: string | null;
    allowed: boolean;
}>;
export declare function reportAccess(tx: Transaction, r: ReportRow, actor: CurrentUser, write?: boolean): Promise<{
    status: string;
    reference: string;
    title: string;
    customer: string;
    endUserCustomerId: number | null;
    endUserName: string | null;
    endUserCode: string | null;
    allowed: boolean;
}>;
export declare function reportSignerCapabilities(permissions: ReadonlySet<string>): {
    canReview: boolean;
    canApprove: boolean;
};
export declare function eligibleReportSigners(tx: Transaction, r: {
    project_id: number | null;
    inquiry_id: number | null;
}, author: number, reviewer: number | null, approver: number): Promise<void>;
export declare function reportSnapshot(r: ReportRow, source: {
    reference: string;
    title: string;
    customer: string;
    endUserCustomerId?: number | null;
    endUserName?: string | null;
    endUserCode?: string | null;
}): string;
export declare function signReport(tx: Transaction, db: Database, request: FastifyRequest, actor: CurrentUser, r: ReportRow, stage: string, snapshot: string, consent: unknown): Promise<void>;
export declare function parseCustomerEvidence(value: unknown): {
    name: string;
    title: string;
    company: string;
    date: string;
    mode: string;
    image: Buffer<ArrayBufferLike> | null;
};
export declare function validateCustomerPng(image: Buffer | null): Promise<void>;
export declare function reportDto(tx: Transaction, r: ReportRow, actor: CurrentUser): Promise<{
    id: number;
    number: string;
    reportType: string;
    templateId: number | null;
    templateVersion: number | null;
    templateName: string | null;
    template: {
        id: number;
        name: string | null;
        version: number | null;
    } | null;
    sourceKind: string;
    sourceId: number;
    scheduleTaskId: number | null;
    sourceReference: string;
    sourceTitle: string;
    customer: string;
    endUserCustomerId: number | null;
    endUserName: string | null;
    endUserCode: string | null;
    revision: number;
    currentRevision: number;
    title: string;
    reportDate: string | null;
    locale: string;
    body: any;
    status: string;
    preparedById: number;
    reviewerId: number | null;
    approverId: number;
    preparedBy: {
        id: number;
        name: string;
    } | null;
    reviewer: {
        id: number;
        name: string;
    } | null;
    approver: {
        id: number;
        name: string;
    } | null;
    allowedActions: string[];
    customerLink: {
        expiresAt: Date;
    } | null;
    rowVersion: string;
    snapshotSha256: string | null;
    decisionNote: string;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    approvedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    signatures: {
        stage: string;
        actorId: number;
        actorName: string;
        specimenId: number;
        snapshotSha256: string;
        evidenceSha256: string;
        occurredAt: Date;
    }[];
    customerAcknowledgment: {
        name: unknown;
        title: unknown;
        company: unknown;
        date: string | null;
        mode: unknown;
        snapshotSha256: unknown;
        evidenceSha256: unknown;
        occurredAt: unknown;
        signatureDataUrl: string | null;
    } | null;
    revisions: {
        revision: number;
        status: string;
        title: string;
        createdAt: Date;
    }[];
}>;
