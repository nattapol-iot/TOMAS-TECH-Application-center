// Read-only smoke of the deployed application. Never submit/sign/upload.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const require=createRequire("C:/Users/natta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json");
const {chromium}=require("playwright");
const browser=await chromium.launch({headless:true,channel:"msedge"});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1080}});const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(process.env.SIGNING_TEST_ORIGIN);
 await page.getByRole("button",{name:"EN",exact:true}).click();
 await page.locator('input[type="email"]').fill(process.env.SIGNING_TEST_EMAIL);
 await page.locator('input[type="password"]').fill(process.env.SIGNING_TEST_CODE);
 await page.locator('button[type="submit"]').click();
 const nav=page.locator("button.nav-item").filter({hasText:"Signed Documents"});
 await nav.waitFor({state:"attached"});
 if(!await nav.isVisible()) await page.locator("button.nav-group-toggle").filter({hasText:"DOCUMENTS & SIGNING"}).click();
 await nav.click();
 const row=page.locator("tbody tr").filter({hasText:"DWG-2609-0001"});await row.getByRole("button",{name:"Open",exact:true}).click();
 await page.getByRole("button",{name:"Preview file & signatures",exact:true}).click();
 await page.locator("canvas").waitFor();await page.waitForFunction(()=>document.querySelector("canvas")?.width>0);
 await page.waitForTimeout(700);
 assert.equal(await page.locator('.sign-preview [role="alert"]').count(),0);
 await page.screenshot({path:fileURLToPath(new URL("../../output/signing-preview/live.png",import.meta.url)),fullPage:true});
 await page.getByRole("button",{name:"Close",exact:true}).last().click();
 const signed=page.getByRole("button",{name:/View signed file \/ /});
 if(await signed.count()) {
  await signed.click();await page.locator(".sign-certificate-frame, .sign-page canvas").waitFor();
  await page.screenshot({path:fileURLToPath(new URL("../../output/signing-preview/live-signed.png",import.meta.url)),fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log("LIVE UI PASSED: authenticated document access, deployed PDF worker/canvas, source/previous marks preview; no signing performed.");
}finally{await browser.close();}
