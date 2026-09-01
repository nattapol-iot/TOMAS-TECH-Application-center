import type { AuthenticationMode } from "./types.js";
export type AppConfig = {
    environment: "development" | "staging" | "production";
    host: string;
    port: number;
    allowedHosts: string[];
    corsOrigins: string[];
    businessTimeZone: string;
    auth: {
        mode: AuthenticationMode;
        teamTestSigningKey?: string;
        tenantId?: string;
        clientId?: string;
        audience?: string;
        requiredScope?: string;
    };
    database: {
        connectionString: string;
        trustServerCertificate: boolean;
        applicationRoleName?: string;
        applicationRolePassword?: string;
    };
    documentStorage: {
        mode: "Local" | "Nas";
        rootPath: string;
        maxFileSizeBytes: number;
    };
    email: {
        mode: "Disabled" | "MicrosoftGraph";
        tenantId?: string;
        clientId?: string;
        clientSecret?: string;
        senderUser?: string;
        applicationBaseUrl?: string;
    };
};
export declare function normalizeBusinessTimeZone(value?: string): string;
export declare function isPrivateIpv4(host: string): boolean;
export declare function loadConfig(env?: NodeJS.ProcessEnv): AppConfig;
