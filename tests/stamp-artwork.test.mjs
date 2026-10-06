import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("company stamps can be given their artwork from the Company Stamps screen", async () => {
  const [screen, client, route, copy] = await Promise.all([
    source("app/system/production/SigningScreens.tsx"),
    source("app/system/api-client.ts"),
    source("backend-node/src/routes/signature-master.ts"),
    source("app/system/remaining-workspace-copy.ts"),
  ]);
  // Without artwork a stamp can be granted but never applied, so the upload is part of the screen.
  assert.match(client, /export const setCompanyStampImage = \(stampId: number, imageBase64: string, rowVersion: string\) =>/);
  assert.match(client, /`\/api\/v1\/master\/company-stamps\/\$\{stampId\}\/image`, \{\s*method: "PUT",\s*body: JSON\.stringify\(\{ imageBase64, rowVersion \}\)/);
  assert.match(screen, /await setCompanyStampImage\(stamp\.id, image, stamp\.rowVersion\)/);

  // The button is offered to exactly the people the route lets through.
  // Bounded to the image handler: the authority routes after it demand the same permission.
  const start = route.indexOf('"/api/v1/master/company-stamps/:stampId/image"');
  const end = route.indexOf("/api/v1/master/company-stamps/:stampId/authorities", start);
  assert.ok(start > 0 && end > start, "image route not found before the authority routes");
  const imageRoute = route.slice(start, end);
  assert.match(imageRoute, /await users\.demandPermission\(request, "signing\.stamp\.grant"\);/);
  assert.equal(imageRoute.match(/demandPermission\(/g)?.length, 1);
  assert.match(imageRoute, /decodePng\(body\.imageBase64, "image_required"\)/);
  assert.match(imageRoute, /parseRowVersion\(body\.rowVersion\)/);
  assert.match(screen, /const canGrant = hasPermission\(bootstrap, "signing\.stamp\.grant"\);/);
  assert.match(screen, /actions=\{canGrant && stamp\.status === "ACTIVE"[\s\S]{0,400}setArtworkFor\(stamp\)/);

  // The client refuses what the server would refuse, with the same 2 MB limit.
  assert.match(route, /const MAX_IMAGE_BYTES = 2 \* 1024 \* 1024;/);
  assert.match(screen, /const MAX_STAMP_IMAGE_BYTES = 2 \* 1024 \* 1024;/);
  assert.match(screen, /file\.type !== "image\/png"/);

  // Every new string is translated.
  for (const key of ["Upload artwork", "Replace artwork", "Artwork saved", "Selected artwork", "Only PNG images are accepted.",
    "The image must be 2 MB or smaller.", "This image is printed wherever this stamp is applied. It cannot be downloaded again after upload, so keep the original file."]) {
    assert.ok(screen.includes(`"${key}"`), `${key} is not used`);
    assert.match(copy, new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}": \\{\\s*"th": "[^"]+",\\s*"jp": "[^"]+"`), `${key} lacks th/jp`);
  }
});
