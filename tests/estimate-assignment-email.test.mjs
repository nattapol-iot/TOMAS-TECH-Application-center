import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("estimate sections can be assigned explicitly and notify only newly assigned people", async () => {
  const [screen, client, route, email, config, example] = await Promise.all([
    readFile(new URL("app/system/production/EstimateScreens.tsx", root), "utf8"),
    readFile(new URL("app/system/api-client.ts", root), "utf8"),
    readFile(new URL("backend-node/src/routes/estimate-workspace-write.ts", root), "utf8"),
    readFile(new URL("backend-node/src/email.ts", root), "utf8"),
    readFile(new URL("backend-node/src/config.ts", root), "utf8"),
    readFile(new URL("backend-node/.env.example", root), "utf8"),
  ]);
  assert.match(screen, /Assign section/);
  assert.match(screen, /Assign and notify/);
  assert.match(screen, /createEstimateAssignment\(estimateId, input\)/);
  assert.match(client, /POST[^]*\/assignments/);
  assert.match(route, /app\.post\("\/api\/v1\/estimates\/:id\/assignments"/);
  assert.match(route, /estimate_assignment_exists/);
  assert.match(route, /newRecipientIds/);
  assert.match(route, /deliverAssignmentEmail/);
  assert.match(email, /graph\.microsoft\.com\/v1\.0\/users\/\$\{encodeURIComponent\(this\.config\.senderUser!\)\}\/sendMail/);
  assert.match(email, /scope: "https:\/\/graph\.microsoft\.com\/\.default"/);
  assert.match(email, /AbortSignal\.timeout\(10_000\)/);
  assert.match(config, /Email__Mode/);
  assert.match(example, /Mail\.Send/);
  assert.match(example, /Email__Mode=Disabled/);
});
