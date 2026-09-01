/** Browser-safe allowlist shared by template preview/editor and server writes.
 * Free text in these fields is reusable instruction/requirement text. Review it
 * before publishing a library template; field filtering cannot anonymize prose.
 */
export declare const REPORT_TEMPLATE_FIELDS: Record<string, {
    repeat: boolean;
    fields: readonly string[];
}>;
export declare const REPORT_TEMPLATE_SECTIONS_BY_TYPE: Record<string, readonly string[]>;
export declare function sanitizeReportTemplate(reportType: string, value: unknown): Record<string, unknown>;
