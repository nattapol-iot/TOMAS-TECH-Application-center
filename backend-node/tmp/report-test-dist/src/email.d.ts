import type { AppConfig } from "./config.js";
export type EmailRecipient = {
    name: string;
    email: string;
};
export type EmailDeliveryResult = {
    status: "sent" | "disabled" | "failed";
    recipients: string[];
};
export type EstimateAssignmentEmail = {
    estimateId: number;
    estimateNumber: string;
    projectName: string;
    section: string;
    dueDate: string;
    assignedBy: string;
    recipients: EmailRecipient[];
};
type FetchLike = typeof fetch;
export declare class EmailService {
    private readonly config;
    private readonly fetcher;
    private readonly reportError;
    private token;
    constructor(config: AppConfig["email"], fetcher?: FetchLike, reportError?: (error: unknown) => void);
    sendEstimateAssignment(message: EstimateAssignmentEmail): Promise<EmailDeliveryResult>;
    private accessToken;
}
export {};
