export type AuthenticationMode = "Development" | "TeamTest" | "Entra" | "TmtId";

export type Identity = {
  mode: AuthenticationMode;
  value: string;
  email?: string;
  name?: string;
  // TMT ID preferred_username. Distinct from the subject id because this, not
  // sub, is the join key into the org master-data directory.
  preferredUsername?: string;
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
  /** The primary role on dbo.users. Audit stamps and workflow routing use this one value. */
  role: string;
  /** Primary role plus every additional role granted through dbo.user_business_roles. */
  roles: string[];
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
