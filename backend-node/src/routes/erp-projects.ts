import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import { describeErpFailure, type ErpGateway } from "../erp-purchasing.js";
import { ERP_PROJECT_TOOL, erpProjectArguments, readErpProjects } from "../erp-projects.js";
import { firstQueryValue } from "../http.js";
import type { CurrentUserService } from "../users.js";

export type ErpProjectHit = { number: string; name: string; customerName: string; customerId: number | null; projectId: number | null };

/**
 * Searches the ERP's projects while someone types a project number (owner decision 2026-11-06), with their own TMT ID
 * token. Each hit says which app customer it names, when exactly one carries that name, and whether a project here already
 * has the number. A failed search never blocks the form: the screen says why and the number can still be typed.
 */
export function registerErpProjectRoutes(app: FastifyInstance, database: Database, users: CurrentUserService, erp: { gateway: ErpGateway } | null = null): void {
  app.get("/api/v1/erp/projects", async (request) => {
    await users.demandPermission(request, "project.write");
    const actor = await users.required(request);
    if (!erp) return { enabled: false, projects: [] as ErpProjectHit[] };
    const result = await erp.gateway.call<unknown>(actor.entraObjectId, ERP_PROJECT_TOOL, erpProjectArguments(firstQueryValue((request.query as { q?: unknown }).q)));
    if (!result.ok) return { enabled: true, projects: [] as ErpProjectHit[], message: describeErpFailure(result), kind: result.kind };
    const found = readErpProjects(result.data);
    if (!found) return { enabled: true, projects: [] as ErpProjectHit[], message: `The ERP answered ${ERP_PROJECT_TOOL} without a projects list.`, kind: "error" };
    if (!found.length) return { enabled: true, projects: [] as ErpProjectHit[] };
    // Typed OPENJSON columns take the database collation, so names compare without case like the rest of the app.
    const known = await database.query<{ id: number | string; value: string }>(`
      SELECT p.id,p.project_no value FROM dbo.projects p
      WHERE p.project_no IN (SELECT n.value FROM OPENJSON(@numbers) WITH (value nvarchar(30) N'$') n);
      SELECT c.id,n.value FROM OPENJSON(@names) WITH (value nvarchar(300) N'$') n
      JOIN dbo.customers c ON c.deleted_at IS NULL AND (c.name=n.value OR c.name_en=n.value OR c.name_th=n.value);`,
    (query) => query.input("numbers", sql.NVarChar(sql.MAX), JSON.stringify(found.map((item) => item.number)))
      .input("names", sql.NVarChar(sql.MAX), JSON.stringify([...new Set(found.map((item) => item.customerName).filter(Boolean))])));
    const [projects, customers] = known.recordsets as unknown as [{ id: number | string; value: string }[], { id: number | string; value: string }[]];
    // The ERP's number is unique; a project in the trash still holds it here.
    const projectByNumber = new Map(projects.map((row) => [row.value.toUpperCase(), Number(row.id)]));
    // A name two app customers share picks neither.
    const idsByName = new Map<string, Set<number>>();
    for (const row of customers) {
      const key = row.value.toLocaleLowerCase("en");
      idsByName.set(key, (idsByName.get(key) ?? new Set()).add(Number(row.id)));
    }
    return {
      enabled: true,
      projects: found.map((item): ErpProjectHit => {
        const ids = idsByName.get(item.customerName.toLocaleLowerCase("en"));
        return { ...item, customerId: ids?.size === 1 ? [...ids][0]! : null, projectId: projectByNumber.get(item.number.toUpperCase()) ?? null };
      }),
    };
  });
}
