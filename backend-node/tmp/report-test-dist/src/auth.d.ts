import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
export declare function createTeamTestAccessCode(signingKey: string, email: string): string;
export declare function teamTestAccessCodeMatches(signingKey: string, email: string, supplied: string): boolean;
export declare function registerAuthentication(app: FastifyInstance, config: AppConfig): void;
