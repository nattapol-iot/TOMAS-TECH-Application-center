// Read-only smoke for the deployed create-document modal. Never upload/freeze.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire("C:/Users/natta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json");
const { chromium } = require("playwright");
const outputDirectory = new URL("../../output/signing-modal/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(process.env.SIGNING_TEST_ORIGIN);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.locator('input[type="email"]').fill(process.env.SIGNING_TEST_EMAIL);
  await page.locator('input[type="password"]').fill(process.env.SIGNING_TEST_CODE);
  await page.locator('button[type="submit"]').click();

  const navigation = page.locator("button.nav-item").filter({ hasText: "Signed Documents" });
  await navigation.waitFor({ state: "attached" });
  if (!await navigation.isVisible()) {
    await page.locator("button.nav-group-toggle").filter({ hasText: "DOCUMENTS & SIGNING" }).click();
  }
  await navigation.click();
  await page.getByRole("button", { name: "New signable document", exact: true }).click();

  const modal = page.getByRole("dialog").filter({ hasText: "Freeze a document for signature" });
  await modal.waitFor();
  const project = modal.locator(".field").filter({ has: page.getByText("Project", { exact: true }) }).locator("select");
  const documentClass = modal.locator(".field").filter({ has: page.getByText("Document class", { exact: true }) }).locator("select");
  let simulatedTaskFailure = false;
  await page.route("**/api/v1/projects/*/drawing-tasks", async (route) => {
    if (!simulatedTaskFailure) {
      simulatedTaskFailure = true;
      await route.abort("connectionrefused");
      return;
    }
    await route.continue();
  });
  await documentClass.selectOption("DRAWING");
  const task = modal.locator(".field").filter({ has: page.getByText("My Design task", { exact: true }) }).locator("select");
  const taskError = modal.getByRole("alert").filter({ hasText: "Could not load" });
  await taskError.waitFor();
  assert.equal((await taskError.textContent()).includes("Failed to fetch"), false, "the raw fetch error must be replaced with recovery guidance");
  await taskError.getByRole("button", { name: "Try again", exact: true }).click();
  await page.waitForFunction(() => {
    const label = [...document.querySelectorAll('[role="dialog"] .field > label')]
      .find((element) => element.textContent?.trim() === "Project");
    const projectSelect = label?.parentElement?.querySelector("select");
    return projectSelect instanceof HTMLSelectElement && !projectSelect.disabled && projectSelect.options.length > 0;
  });
  await task.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const label = [...document.querySelectorAll('[role="dialog"] .field > label')]
      .find((element) => element.textContent?.trim() === "My Design task");
    const taskSelect = label?.parentElement?.querySelector("select");
    return taskSelect instanceof HTMLSelectElement && !taskSelect.disabled && taskSelect.options.length > 1;
  });

  const grid = modal.locator(".form-grid.two");
  assert.equal(await grid.count(), 1, "the create modal must use its two-column form grid");
  const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  assert.equal(columns, 2, "the desktop modal must render two columns");
  assert.ok((await modal.boundingBox())?.width >= 850, "the create modal must have room for file and task controls");
  assert.ok(await project.inputValue(), "a project must be selected after loading");
  assert.ok(await task.locator("option").count() > 1, "the assigned Design task must load");
  assert.equal(await modal.locator('.callout.danger, [role="alert"]').count(), 0, "retry must clear the transient endpoint error");
  assert.equal((await modal.textContent()).includes("Failed to fetch"), false, "raw network errors must not remain in the form");
  assert.deepEqual(pageErrors, []);

  await page.screenshot({
    path: fileURLToPath(new URL("live-create.png", outputDirectory)),
    fullPage: true,
  });
  console.log("SIGNING MODAL LIVE UI PASSED: project/files/task loaded and two-column layout rendered; no mutation performed.");
} finally {
  await browser.close();
}
