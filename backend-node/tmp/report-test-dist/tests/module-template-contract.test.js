import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerModuleTemplateRoutes } from "../src/routes/module-templates.js";
import { registerEstimateCostWriteRoutes } from "../src/routes/estimate-cost-write.js";
test("template pagination totals use the same search filter as the rows", async () => {
    const app = Fastify();
    const statements = [];
    const database = { query: async (statement) => {
            statements.push(statement);
            return { recordset: statement.includes("SELECT COUNT(*) AS total") ? [{ total: 0 }] : [] };
        } };
    const users = { demandPermission: async () => { } };
    registerModuleTemplateRoutes(app, database, users);
    try {
        const response = await app.inject({ method: "GET", url: "/api/v1/module-templates?search=no-match&pageSize=50" });
        assert.equal(response.statusCode, 200);
        assert.equal(response.json().total, 0);
        assert.equal(statements.length, 2);
        for (const statement of statements)
            assert.ok(statement.includes("@search = N'' OR t.code LIKE"));
    }
    finally {
        await app.close();
    }
});
test("template JSON identifiers accept frontend numbers and reject invalid values before SQL", async () => {
    const app = Fastify();
    let transactions = 0;
    const database = { transaction: async () => { transactions++; return { reachedTransaction: true }; } };
    const users = { required: async () => ({ id: 1 }), demandPermission: async () => { } };
    registerModuleTemplateRoutes(app, database, users);
    registerEstimateCostWriteRoutes(app, database, users);
    try {
        const cases = [
            { url: "/api/v1/estimates/1/apply-template", payload: { estimateRowVersion: "AAAAAAAAAAE=", templateId: 2, module: "Panel", modules: 3, ownerId: 1 } },
            { url: "/api/v1/module-templates/from-estimate", payload: { estimateId: 1, module: "Panel", categoryCode: "01", code: "PANEL", name: "Panel" } },
            { url: "/api/v1/module-templates", payload: { categoryCode: "01", code: "PANEL", name: "Panel", lines: [{ categoryCode: "01", itemCode: "X", description: "Hardware", supplierId: 1, quantityPerModule: 1, unit: "pcs" }] } },
        ];
        for (const item of cases) {
            const before = transactions;
            const response = await app.inject({ method: "POST", ...item });
            assert.equal(response.statusCode, 201, response.body);
            assert.equal(transactions, before + 1);
        }
        for (const templateId of [0, -1, 1.5, "2", null]) {
            const response = await app.inject({ method: "POST", url: cases[0].url, payload: { ...cases[0].payload, templateId } });
            assert.equal(response.statusCode, 400);
        }
        assert.equal(transactions, 3);
    }
    finally {
        await app.close();
    }
});
//# sourceMappingURL=module-template-contract.test.js.map