import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "public", "ocr");
const coreTarget = path.join(target, "core");

const assets = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "core/tesseract-core-relaxedsimd-lstm.wasm.js"],
];
const languages = [
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata"],
  ["node_modules/@tesseract.js-data/tha/4.0.0_best_int/tha.traineddata.gz", "tha.traineddata"],
  ["node_modules/@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz", "jpn.traineddata"],
];

mkdirSync(coreTarget, { recursive: true });

for (const [sourceName, targetName] of assets) {
  const source = path.join(root, sourceName);
  const destination = path.join(target, targetName);
  mkdirSync(path.dirname(destination), { recursive: true });
  const sourceSize = statSync(source).size;
  let targetSize = -1;
  try { targetSize = statSync(destination).size; } catch { /* copy missing file */ }
  if (targetSize !== sourceSize) copyFileSync(source, destination);
}

for (const [sourceName, targetName] of languages) {
  const destination = path.join(target, targetName);
  const data = gunzipSync(readFileSync(path.join(root, sourceName)));
  let targetSize = -1;
  try { targetSize = statSync(destination).size; } catch { /* write missing file */ }
  if (targetSize !== data.length) writeFileSync(destination, data);
}

for (const staleName of ["eng.traineddata.gz", "tha.traineddata.gz"]) {
  rmSync(path.join(target, staleName), { force: true });
}

console.log(`Prepared ${assets.length + languages.length} local OCR assets in public/ocr`);
