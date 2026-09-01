import type { FastifyRequest } from "fastify";
import type { Transaction as TransactionType } from "mssql";
import type { Database } from "./db.js";
import type { CurrentUser } from "./types.js";
/**
 * Document signing (DSN-TC-005).
 *
 * Signing is not approving. An approval is a decision about a *record*; a
 * signature is a mark placed on one exact *file*, identified by its SHA-256.
 * The two are produced by one user action wherever both apply, but they are
 * stored separately and neither replaces the other.
 */
export declare const DOCUMENT_CLASSES: readonly ["DRAWING", "SPEC", "MANUAL", "MAT_APPROVE", "QUOTATION", "PR_PO", "UAT_ACCEPT", "SERVICE_RPT"];
export type DocumentClass = (typeof DOCUMENT_CLASSES)[number];
export declare function numberPrefix(documentClass: DocumentClass): string;
export declare function demandDocumentClass(value: unknown): DocumentClass;
export declare function demandLocale(value: unknown): string;
export declare function normalizeRevisionLabel(value: unknown): string;
export declare function requireReason(value: unknown, code: string): string;
export declare function isSha256Hex(value: unknown): value is string;
export type ChainField = [string, string | null | undefined];
export declare function canonicalPayload(fields: ChainField[]): string;
export declare function sha256Hex(value: string): string;
export declare function chainHash(previousHash: string | null, payloadHash: string): string;
export declare function newVerifyCode(): string;
export declare function isVerifyCodeShape(value: unknown): value is string;
export type SigningAssurance = {
    evidence: string;
    authenticatedAt: Date;
};
export declare function evaluateSigningAssurance(request: FastifyRequest): SigningAssurance;
export type SignableDocumentContext = {
    id: number;
    documentNo: string;
    documentClass: DocumentClass;
    title: string;
    projectId: number | null;
    estimateId: number | null;
    documentLocale: string;
    amount: number | null;
    ownerId: number;
    currentFileId: number | null;
    signingState: string;
    rowVersion: Buffer;
    projectManagerId: number | null;
    scheduleTaskId: number | null;
};
export declare function loadSignableDocument(database: Database, documentId: number, transaction?: TransactionType, forUpdate?: boolean): Promise<SignableDocumentContext>;
/**
 * A signable document is visible to the people working on it. When it hangs off
 * a project, project assignment decides; otherwise the owner, the initiator of
 * its request, its signers and elevated roles can see it.
 */
export declare function demandDocumentScope(database: Database, document: SignableDocumentContext, actor: CurrentUser, transaction?: TransactionType): Promise<void>;
export declare function demandRowVersion(actual: Buffer, expected: Buffer): void;
export declare function demandOwnerOrElevated(document: SignableDocumentContext, actor: CurrentUser): void;
/** Appends one link to a request's hash chain. */
export declare function appendSignEvent(transaction: TransactionType, input: {
    requestId: number;
    stepId?: number | null;
    actorId?: number | null;
    action: string;
    payload: Record<string, string | null | undefined>;
    ip?: string | null;
    userAgent?: string | null;
    assurance?: SigningAssurance | null;
}): Promise<string>;
export type ChainVerification = {
    verified: boolean;
    head: string;
    count: number;
};
/**
 * Re-computes the chain in front of whoever is looking. This is a user action on
 * the record screen and the verification page, not an admin tool: a claim of
 * integrity nobody can check is not worth making.
 */
export declare function verifyChain(database: Database, requestId: number, transaction?: TransactionType): Promise<ChainVerification>;
/**
 * Does this person hold a live authority to apply this stamp to this class of
 * document today? Returns the grant that permitted it, because at audit time the
 * question is whether they were allowed to, not only whether they did.
 */
export declare function resolveStampAuthority(transaction: TransactionType, companyStampId: number, documentClass: string, actor: CurrentUser): Promise<number | null>;
export declare function activeSpecimenId(database: Database, userId: number, transaction?: TransactionType): Promise<number | null>;
export declare function setDocumentState(transaction: TransactionType, documentId: number, signingState: string, currentFileId?: number | null): Promise<void>;
export declare function clientIp(request: FastifyRequest): string;
export declare function clientUserAgent(request: FastifyRequest): string | null;
