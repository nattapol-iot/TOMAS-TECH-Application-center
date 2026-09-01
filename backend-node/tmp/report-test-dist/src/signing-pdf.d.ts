import { PDFDocument } from "pdf-lib";
/** Top-left normalized coordinates on the displayed CropBox, including page rotation. */
export type MarkPlacement = {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
};
export type PdfMark = {
    placement: MarkPlacement | null;
    png: Uint8Array;
    label: string;
};
export declare function parsePlacement(value: unknown): MarkPlacement | null;
export declare function loadSigningPdf(bytes: Uint8Array, contentType: string, expectedHash?: string): Promise<PDFDocument>;
export declare function validatePage(pdf: PDFDocument, placement: MarkPlacement): void;
export declare function imageTransform(box: {
    x: number;
    y: number;
    width: number;
    height: number;
}, rotation: number, rect: {
    x: number;
    y: number;
    width: number;
    height: number;
}): {
    x: number;
    y: number;
    rotate: import("pdf-lib").Degrees;
};
export declare function paintMarks(pdf: PDFDocument, marks: PdfMark[]): Promise<void>;
export declare function appendPdfCertificate(pdf: PDFDocument, marks: PdfMark[], info: {
    number: string;
    revision: string;
    verifyCode: string;
    hash: string;
    chain: string;
}): Promise<void>;
