import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
test("frontend collection URLs select the same route with or without a trailing slash", async () => {
    const config = loadConfig({
        NODE_ENV: "development",
        Authentication__Mode: "Development",
        ConnectionStrings__IoTTeamCenter: "Server=localhost;Database=UnusedRoutingTest;Integrated Security=true",
        DocumentStorage__RootPath: ".",
    });
    const { app } = await buildApp(config);
    try {
        await app.ready();
        for (const method of ["GET", "POST"]) {
            for (const path of ["inquiries", "estimates", "boms", "sales-intakes", "site-visits"]) {
                const url = `/api/v1/${path}`;
                const plain = app.findRoute({ method, url });
                const trailing = app.findRoute({ method, url: `${url}/` });
                assert.ok(plain, `${method} ${url} must exist`);
                assert.ok(trailing, `${method} ${url}/ must exist`);
                assert.equal(trailing.handler, plain.handler, `${method} ${url}/ must select its collection handler`);
                assert.deepEqual(trailing.params, plain.params, `${url}/ must not become an empty detail id`);
            }
        }
        const response = await app.inject({ method: "GET", url: "/health/live/" });
        assert.equal(response.statusCode, 200);
        assert.equal(response.json().status, "ok");
    }
    finally {
        await app.close();
    }
});
//# sourceMappingURL=routing.test.js.map