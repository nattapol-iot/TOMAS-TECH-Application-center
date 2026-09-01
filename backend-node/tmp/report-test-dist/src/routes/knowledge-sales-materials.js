import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ApiError } from "../errors.js";
import { resolveStoragePath } from "../document-storage.js";
const SOURCE_URL = "https://tomastech275-my.sharepoint.com/:x:/g/personal/wannasiwaporn_k_tomastc_com/IQD0rmC2ug28RpxCUE16_yYHAf4VrsdREIY7krB-PJJJkEM";
const STORAGE_KEY = "knowledge-sales-materials/catalog.json";
const COMPANY_HOST = "tomastech275-my.sharepoint.com";
const FORMATS = new Set(["PDF", "PPTX", "VIDEO", "—"]);
function object(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new ApiError(400, "invalid_sales_catalog", `${label} is invalid.`);
    return value;
}
function text(value, maximum, label) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > maximum)
        throw new ApiError(400, "invalid_sales_catalog", `${label} is invalid.`);
    return value.trim();
}
export function validateSalesMaterialCatalog(value) {
    const body = object(value, "Sales catalog");
    if (body.sourceUrl !== SOURCE_URL)
        throw new ApiError(400, "invalid_sales_catalog", "The sales catalog source URL is invalid.");
    const sourceFile = text(body.sourceFile, 500, "Source file");
    if (!sourceFile.toLowerCase().endsWith(".xlsx"))
        throw new ApiError(400, "invalid_sales_catalog", "The source file must be an XLSX workbook.");
    if (!Array.isArray(body.groups) || body.groups.length < 1 || body.groups.length > 200)
        throw new ApiError(400, "invalid_sales_catalog", "Sales catalog groups are invalid.");
    const ids = new Set(), rows = new Set();
    let total = 0;
    const groups = body.groups.map((rawGroup) => {
        const group = object(rawGroup, "Sales catalog group"), id = text(group.id, 4, "Group id"), title = text(group.title, 300, "Group title");
        if (!/^\d{4}$/.test(id) || ids.has(id))
            throw new ApiError(400, "invalid_sales_catalog", "Sales catalog group ids must be unique four-digit values.");
        ids.add(id);
        if (!Array.isArray(group.materials) || group.materials.length < 1 || group.materials.length > 1000)
            throw new ApiError(400, "invalid_sales_catalog", `Materials for group ${id} are invalid.`);
        const materials = group.materials.map((rawMaterial) => {
            const material = object(rawMaterial, "Sales material");
            if (!Number.isSafeInteger(material.row) || Number(material.row) < 1 || rows.has(Number(material.row)))
                throw new ApiError(400, "invalid_sales_catalog", "Sales material source rows must be unique positive integers.");
            const row = Number(material.row);
            rows.add(row);
            total += 1;
            if (total > 5000)
                throw new ApiError(400, "invalid_sales_catalog", "The sales catalog cannot exceed 5,000 materials.");
            const format = text(material.format, 10, "Material format").toUpperCase();
            if (!FORMATS.has(format))
                throw new ApiError(400, "invalid_sales_catalog", `Material format '${format}' is not supported.`);
            let url = null;
            if (material.url !== null) {
                const rawUrl = text(material.url, 2_000, "Material URL"), parsed = new URL(rawUrl);
                if (parsed.protocol !== "https:" || parsed.hostname !== COMPANY_HOST || parsed.username || parsed.password)
                    throw new ApiError(400, "invalid_sales_catalog", "Every material URL must use the company SharePoint host over HTTPS.");
                url = parsed.href;
            }
            return { row, title: text(material.title, 500, "Material title"), language: text(material.language, 20, "Material language"), format, filename: text(material.filename, 800, "Material filename"), url };
        });
        return { id, title, materials };
    });
    return { sourceUrl: SOURCE_URL, sourceFile, groups };
}
async function readCatalog(path) {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw new ApiError(503, "document_storage_unavailable", "The sales catalog could not be read.");
    }
}
async function replaceCatalog(path, catalog) {
    const temporary = `${path}.updating-${randomUUID()}.tmp`;
    try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
        await rename(temporary, path);
    }
    catch {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw new ApiError(503, "document_storage_unavailable", "The sales catalog could not be updated.");
    }
}
export function registerKnowledgeSalesMaterialRoutes(app, config, _database, users) {
    const path = resolveStoragePath(config.documentStorage, STORAGE_KEY);
    app.get("/api/v1/knowledge/sales-materials", async (request) => {
        await users.demandPermission(request, "knowledge.view");
        const catalog = await readCatalog(path);
        if (!catalog)
            throw new ApiError(404, "sales_catalog_not_found", "No shared sales catalog update has been published yet.");
        return catalog;
    });
    app.put("/api/v1/knowledge/sales-materials", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request) => {
        await users.demandPermission(request, "knowledge.manage_categories");
        const actor = await users.required(request), value = validateSalesMaterialCatalog(request.body);
        const stored = { ...value, updatedAt: new Date().toISOString(), updatedBy: actor.name };
        await replaceCatalog(path, stored);
        request.log.info({ actorId: actor.id, materialCount: stored.groups.reduce((sum, group) => sum + group.materials.length, 0) }, "Knowledge sales catalog updated");
        return stored;
    });
}
//# sourceMappingURL=knowledge-sales-materials.js.map