/**
 * The signature certificate: the artefact that makes a printed copy checkable.
 *
 * It carries the document identity, the source and output hashes, every block
 * with its signer, role and timestamp, the stamp code with the person who
 * applied it, and the verification code. It is generated, never typed.
 *
 * Format, and the reason for it: DSN-TC-005 §7.2 specifies the certificate as a
 * page appended to the signed PDF, with the marks rendered into the document's
 * own signature blocks. Both need a PDF library — merging pages and embedding a
 * Thai-capable font are not things to hand-roll, and choosing the library is a
 * dependency and licence decision for the team, tracked as RDL-039. Until it is
 * made the certificate is a self-contained, print-ready HTML document: UTF-8 so
 * Thai and Japanese signer names are correct, A4 @page so "print to PDF" gives
 * the intended sheet, and hashed and verified exactly like the eventual PDF.
 * The integrity model does not change when the renderer does — only the
 * container.
 */
export type CertificateSignature = {
    signaturePngBase64?: string;
    stampPngBase64?: string;
    stepNo: number;
    blockCode: string;
    requiredMark: string;
    signerName: string;
    signerRole: string | null;
    delegatedFromName: string | null;
    stampCode: string | null;
    authEvidence: string | null;
    decidedAt: Date | string | null;
};
export type CertificateModel = {
    documentNo: string;
    revisionLabel: string;
    documentClass: string;
    documentLocale: string;
    title: string;
    projectLabel: string | null;
    ownerName: string;
    legalEntity: string;
    sourceFileName: string;
    sourceSha256: string;
    chainHead: string;
    eventCount: number;
    verifyCode: string;
    verifyUrl: string;
    completedAt: Date;
    signatures: CertificateSignature[];
};
export declare function blockLabel(code: string): string;
export declare function documentClassLabel(code: string): string;
export declare function buildSignatureCertificate(model: CertificateModel): Buffer;
