import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { MASTER_KINDS, type MasterKind } from "../erp-master-data.js";
import { createErpMasterSync } from "../erp-master-sync.js";
import type { ErpGateway } from "../erp-purchasing.js";
import { bodyObject, positiveLong, requiredText } from "../http.js";
import { hasRole } from "../user-roles.js";
import type { CurrentUserService } from "../users.js";

/** Who reads a register: customers belong to CRM and Master Data, suppliers to Master Data. */
const READERS: Readonly<Record<MasterKind, readonly string[]>> = { customers: ["crm.read", "master.read"], suppliers: ["master.read"] };

const kindOf = (request: FastifyRequest): MasterKind => {
  const kind = (request.params as { kind?: string }).kind as MasterKind;
  if (!MASTER_KINDS.includes(kind)) throw new ApiError(404, "not_found", "Unknown ERP register.");
  return kind;
};

/**
 * Customers and suppliers from the Pegasus ERP (migration 099, owner decision 2026-11-05). The screens call sync when they
 * open; the round runs with the caller's TMT ID token and at most once per 15 minutes for the whole app. An Admin settles
 * the records that resemble more than one app record, or resemble one only doubtfully.
 */
export function registerErpMasterDataRoutes(app: FastifyInstance, database: Database, users: CurrentUserService, erp: { gateway: ErpGateway } | null = null): void {
  const master = createErpMasterSync(database, erp?.gateway ?? null);
  const readable = async (request: FastifyRequest) => {
    const actor = await users.required(request);
    const held = new Set((await database.query<{ code: string }>(`SELECT code FROM dbo.user_effective_permissions WHERE user_id=@id;`,
      (q) => q.input("id", sql.BigInt, actor.id))).recordset.map((row) => row.code));
    return { actor, kinds: MASTER_KINDS.filter((kind) => READERS[kind].some((code) => held.has(code))) };
  };
  const reader = async (request: FastifyRequest, kind: MasterKind) => {
    const { actor, kinds } = await readable(request);
    if (!kinds.includes(kind)) throw new ApiError(403, "permission_denied", `Permission '${READERS[kind].join("' or '")}' is required.`);
    return actor;
  };
  const admin = async (request: FastifyRequest, kind: MasterKind) => {
    const actor = await reader(request, kind);
    if (!hasRole(actor, "Admin")) throw new ApiError(403, "admin_required", "Only an Admin settles ERP records that match doubtfully.");
    return actor;
  };

  app.get("/api/v1/erp/master-data", async (request) => {
    const { actor, kinds } = await readable(request);
    const registers = (await master.status()).filter((item) => kinds.includes(item.kind));
    return { enabled: master.enabled, canSettle: hasRole(actor, "Admin"), registers };
  });

  app.post("/api/v1/erp/master-data/:kind/sync", async (request) => {
    const kind = kindOf(request), actor = await reader(request, kind);
    const force = request.body ? bodyObject(request.body).force === true : false;
    if (force && !hasRole(actor, "Admin")) throw new ApiError(403, "admin_required", "Only an Admin reads the ERP again before 15 minutes have passed.");
    return master.sync(kind, actor, force);
  });

  app.get("/api/v1/erp/master-data/:kind/review", async (request) => {
    const kind = kindOf(request);
    await admin(request, kind);
    return master.reviewList(kind);
  });

  app.post("/api/v1/erp/master-data/:kind/review/:key", async (request) => {
    const kind = kindOf(request), actor = await admin(request, kind);
    const key = requiredText((request.params as { key?: string }).key, 50, "ERP record");
    const body = bodyObject(request.body);
    if (body.action === "create") return master.resolve(kind, key, { action: "create" }, actor);
    if (body.action === "link") return master.resolve(kind, key, { action: "link", id: positiveLong(String(body.id), "App record") }, actor);
    throw new ApiError(400, "validation_failed", "Choose link or create.");
  });
}
