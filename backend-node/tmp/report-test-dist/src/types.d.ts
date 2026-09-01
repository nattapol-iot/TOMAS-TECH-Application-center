export type AuthenticationMode = "Development" | "TeamTest" | "Entra";
export type Identity = {
    mode: AuthenticationMode;
    value: string;
    email?: string;
    objectId?: string;
    partitionKey: string;
    /**
     * Unix seconds from the access token, carried so a signature can evidence how
     * recently the person was actually present. `authTime` is the identity
     * provider's own assertion and is the strong form; `issuedAt` only says the
     * token is fresh, which a silent refresh also satisfies. See signing-core.
     */
    authTime?: number;
    issuedAt?: number;
};
export type CurrentUser = {
    id: number;
    entraObjectId: string;
    email: string;
    name: string;
    role: string;
    department: string;
    isActive: boolean;
};
declare module "fastify" {
    interface FastifyContextConfig {
        public?: boolean;
    }
    interface FastifyRequest {
        identity: Identity | null;
        currentUser: CurrentUser | null;
    }
}
