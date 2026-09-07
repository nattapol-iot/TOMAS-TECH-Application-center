import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/errors.js";
import { validateSalesMaterialCatalog } from "../src/routes/knowledge-sales-materials.js";

const sourceUrl = "https://tomastech275-my.sharepoint.com/:x:/g/personal/wannasiwaporn_k_tomastc_com/IQD0rmC2ug28RpxCUE16_yYHAf4VrsdREIY7krB-PJJJkEM";
const valid = () => ({ sourceUrl, sourceFile: "Sales material.xlsx", groups: [{ id: "0001", title: "Company Profile", materials: [{ row: 3, title: "Company Profile", language: "EN", format: "PDF", filename: "profile.pdf", url: "https://tomastech275-my.sharepoint.com/:b:/g/personal/example" }] }] });

test("sales catalog accepts bounded company SharePoint data", () => {
  assert.deepEqual(validateSalesMaterialCatalog(valid()), valid());
});

test("sales catalog rejects external links and duplicate source rows", () => {
  const external = valid(); external.groups[0]!.materials[0]!.url = "https://example.com/file.pdf";
  assert.throws(() => validateSalesMaterialCatalog(external), (error) => error instanceof ApiError && error.code === "invalid_sales_catalog");
  const duplicate = valid(); duplicate.groups[0]!.materials.push({ ...duplicate.groups[0]!.materials[0]! });
  assert.throws(() => validateSalesMaterialCatalog(duplicate), (error) => error instanceof ApiError && error.code === "invalid_sales_catalog");
});
