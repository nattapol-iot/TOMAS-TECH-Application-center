import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const material = read("app/system/production/MaterialScreens.tsx");
const shell = read("app/system/ProductionApp.tsx");
const boms = read("backend-node/src/routes/boms.ts");
const requisitions = read("backend-node/src/routes/purchase-requisitions.ts");
const editor = read("app/system/production/PurchaseRequestEditor.tsx");
const sheet = read("lib/pr-spreadsheet.ts");

test("the PR sheet reserves no stock here, asks no supplier of the engineer and labels the estimate price honestly", () => {
  // Stock is kept in the company ERP; reserving here was a separate request per line made before the PR, and a failed PR left them behind.
  assert.doesNotMatch(editor, /\/reservations/);
  assert.doesNotMatch(editor, /suppliers/);
  assert.match(sheet, /lineType: "Planned", bomLineId: row\.bomLineId, quantity: row\.quantity, unitPrice: row\.unitPrice, priceSource: "Estimate"/);
  assert.match(requisitions, /const priceSources = \["Estimate", /);
  assert.match(material, /setCreating\(true\)/);
  assert.doesNotMatch(material, /function CreatePrModal|function ConvertPrModal/);
});

test("an approved PR goes to the ERP, which picks suppliers and raises the PO; nothing is ordered in this app", () => {
  // The ERP's Purchasing does what the in-app review and ERP-PO record did.
  assert.doesNotMatch(material, /\/suppliers`|\/erp-order|function ErpOrderModal|missingSuppliers/);
  assert.doesNotMatch(requisitions, /purchase-requisitions\/:id\/suppliers|purchase-requisitions\/:id\/erp-order|PURCHASING_REVIEW_STEP/);
  assert.doesNotMatch(material, /\/convert`/);
  assert.doesNotMatch(requisitions, /purchase-requisitions\/:id\/convert|INSERT INTO dbo\.mat_pos/);
  // Final approval sends it as the requester; the requester can send it again, and opening it reads the ERP's status.
  assert.match(requisitions, /decided\.status === "Approved" && erp\)[\s\S]*sendToErp\(id, decided\.requestedBy/);
  assert.match(requisitions, /notifyUsers\(transaction, \[decided\.requestedBy\], "PR_ERP_SEND"/);
  assert.match(material, /\/api\/v1\/purchase-requisitions\/\$\{id\}\/erp-send`/);
  assert.match(material, /\/api\/v1\/purchase-requisitions\/\$\{id\}\/erp-sync`/);
  assert.match(editor, /\/api\/v1\/erp\/purchasing\/options/);
  // Opening the list reads its open PRs from the ERP, each at most once per 15 minutes (the ERP team allows 5-15).
  assert.match(requisitions, /app\.post\("\/api\/v1\/purchase-requisitions\/erp-sync"/);
  assert.match(requisitions, /const ERP_LIST_SYNC_MINUTES = 15;/);
  assert.match(material, /apiRequest<\{ checked: number; updated: number \}>\("\/api\/v1\/purchase-requisitions\/erp-sync"/);
  assert.match(shell, /item\.entityType === "PurchaseRequisition"\) (?:\(await setView\("purchase"\)\)|(?:await )?setView\("purchase"\))/);
});

test("a BOM line without an inventory item can still be requested", () => {
  assert.doesNotMatch(boms, /nonStock \? 0 :/);
  assert.match(boms, /remainingToRequest\(/);
  assert.match(requisitions, /remainingToRequest\(/);
  assert.doesNotMatch(requisitions, /"stock_available"/);
});

test("a BOM is generated from the material categories and Outsource, nothing else", () => {
  assert.match(boms, /ci\.category_code IN\(\$\{BOM_CATEGORIES\}\)/);
  assert.match(boms, /WHEN '\$\{OUTSOURCE_CATEGORY_CODE\}' THEN N'\$\{OUTSOURCE_SECTION\}' ELSE N'SVC' END/);
  assert.match(boms, /AND \$\{MATERIAL_LINE\} ORDER BY l\.section_code/);
});

test("a draft PR can be cancelled and nothing offers Request Changes", () => {
  assert.match(requisitions, /app\.post\("\/api\/v1\/purchase-requisitions\/:id\/cancel"/);
  assert.match(material, /\/api\/v1\/purchase-requisitions\/\$\{cancelItem\.id\}\/cancel/);
  assert.doesNotMatch(material, /Request Changes/);
  assert.doesNotMatch(requisitions, /"Request Changes"\]/);
});

test("an approved PR the ERP does not hold is taken back to Draft or cancelled, and a draft is edited (review 2026-10-28)", () => {
  assert.match(requisitions, /app\.post\("\/api\/v1\/purchase-requisitions\/:id\/withdraw"/);
  assert.match(requisitions, /app\.put\("\/api\/v1\/purchase-requisitions\/:id"/);
  // The ERP is asked first; anything but "not found" or "deleted" leaves the PR where it is.
  assert.match(requisitions, /if \(result\.kind === "not_found" \|\| result\.kind === "ref_deleted"\) return;/);
  assert.match(material, /\/api\/v1\/purchase-requisitions\/\$\{id\}\/\$\{takeBack\}`/);
  assert.match(editor, /method: "PUT"/);
  assert.match(editor, /\?exceptPr=\$\{editing\.id\}/);
  // A slow ERP does not hold the approver's request; a quantity is never cut, a remark is.
  assert.match(requisitions, /const ERP_APPROVE_WAIT_MS = 20_000;/);
  assert.doesNotMatch(read("backend-node/src/erp-purchasing.ts"), /Math\.min\(line\.qty/);
  assert.match(read("backend-node/src/erp-purchasing.ts"), /remark: cut\(describe\(line\), ERP_MAX_REMARK\)/);
  // After any refusal the requester can choose another ERP department.
  assert.match(material, /askDepartment \|\| !erp\?\.department \|\| Boolean\(erp\?\.error\)/);
});

test("approvals ask for a comment only when rejecting, and show the server's answer inside the dialog", () => {
  assert.doesNotMatch(material, /requireComment busy=/);
  assert.equal((material.match(/requireComment=\{[a-z.]+ === "Reject"\}/g) ?? []).length, 4);
  assert.match(material, /<ActionError message=\{error \?\? ""\} \/>/);
});

test("the PR screen shows Approve where the server's decide rule allows it, every held role included", () => {
  assert.match(material, /const isCurrentApprover = item\.canDecide;/);
  assert.doesNotMatch(material, /item\.currentApproverRole === bootstrap\.user\.role/);
  // One rule for the list, the Approvals badge and the decision itself.
  assert.equal((requisitions.match(/\$\{WAITING_FOR_ACTOR\}/g) ?? []).length, 4);
  assert.match(requisitions, /cs\.approver_role IN\(SELECT code FROM dbo\.user_effective_roles WHERE user_id=@actor\)/);
});

test("a PR goes to the requester's department head, then the final approver, who alone is emailed (owner 2026-11-03)", () => {
  const migration = read("database/migrations/097_pr_approval_route.sql");
  assert.match(migration, /N'Mechanical Engineer Dept\.', N'warit\.c@tomastc\.com',\s+CAST\(0 AS bit\)/);
  assert.match(migration, /N'Electrical Engineer Dept\.', N'taweesak\.s@tomastc\.com', CAST\(0 AS bit\)/);
  assert.match(migration, /N'IoT Engineer Dept\.',\s+N'tachapon\.m@tomastc\.com', CAST\(1 AS bit\)/);
  assert.match(migration, /email = N'nattapol\.p@tomastc\.com'/);
  assert.match(requisitions, /email\.sendPurchaseRequisitionApproval\(message\)/);
  assert.match(editor, /\/api\/v1\/purchase-requisitions\/approval-route/);
});

test("the requester hears of every decision on their PR, by bell and email (owner 2026-11-04)", () => {
  assert.match(requisitions, /const told = await noticeRequester\(transaction, id, actor, \{ stepId: current\.id, step: current\.name, decision, comment \}\);/);
  assert.match(requisitions, /notifyUsers\(transaction, \[Number\(row\.requested_by\)\], "PR_DECISION"/);
  // A fully approved PR is mailed with the ERP's answer; every other decision at once.
  assert.match(requisitions, /if \(decided\.status !== "Approved" \|\| !erp\) await tell\(decided\.told, null\);/);
  assert.match(requisitions, /void tell\(decided\.told, outcome\)/);
});

test("the Approvals badge counts procurement approvals, not estimates in review", () => {
  assert.match(shell, /apiRequest<\{ waiting: number \}>\("\/api\/v1\/procurement\/approvals\/attention"\)/);
  assert.match(shell, /if \(view === "approvals"\) return procurementApprovalCount;/);
  assert.doesNotMatch(shell, /if \(view === "approvals"\) return bootstrap\.counts\.approvals;/);
});

test("the PR sheet takes many items and sends the PR in one press (owner 2026-11-19)", () => {
  // Rows copied from Excel land in the sheet from the paste box or from any cell; one value pasted into a cell stays a value.
  assert.match(editor, /const read = draftFromPaste\(pasted, \[\.\.\.lines\.values\(\)\], modules, newRowModule\);/);
  assert.match(editor, /setRows\(addPastedRows\(rows, read\.rows, String\(Date\.now\(\)\)\)\);/);
  assert.ok(editor.includes(String.raw`if (!/[\t\n]/.test(pasted.trim())) return;`));
  assert.match(editor, /const grid = \{ onKeyDown: moveDown, onPaste: pasteCells \};/);
  assert.equal((editor.match(/<input \{\.\.\.grid\}/g) ?? []).length, 4);
  // Blank rows are added in bulk and are not part of the PR: checks, budget, totals and the request body leave them out.
  assert.match(editor, /onClick=\{\(\) => addUnplanned\(10\)\}/);
  assert.match(editor, /const live = useMemo\(\(\) => rows\.filter\(\(row\) => !isBlankPrRow\(row\)\), \[rows\]\);/);
  assert.match(editor, /draftIssues\(live, lines, modules\)/);
  assert.match(editor, /lines: payloadLines\(live\)/);
  // One press saves the draft and submits it with the row version the save returned; a failed submit leaves the draft and says so.
  assert.match(editor, /await apiRequest\(`\/api\/v1\/purchase-requisitions\/\$\{saved\.id\}\/submit`, \{ method: "POST", body: JSON\.stringify\(\{ rowVersion: saved\.rowVersion,/);
  assert.match(editor, /onCreated\(\{ number: saved\.number, submitted: false, submitError:/);
  assert.match(editor, /data-guide="pr\.submit" disabled=\{busy \|\| !selected\.length \|\| issues\.size > 0\} onClick=\{\(\) => \{ void submit\(true\); \}\}/);
  assert.match(editor, /onClick=\{\(\) => \{ void submit\(false\); \}\}><LocalizedText text=\{"Save Draft"\} \/>/);
  assert.match(material, /saved\.submitted \? uiText\("ส่งขออนุมัติแล้ว"\)/);
});

test("the PR sheet's lines are an ERP grid: fixed columns, controls filling their cells, framed (owner 2026-11-19)", () => {
  const skin = read("app/system/production/pegasus-skin.css");
  // Twelve columns; only the description (0) takes what is left, so the table never grows past its frame on its own.
  assert.ok(editor.includes("<colgroup>{[84, 120, 130, 0, 84, 130, 92, 54, 104, 110, 110, 104].map"));
  assert.ok(skin.includes(".pg-skin .pr-plan-table { table-layout: fixed; min-width: 1326px; border-collapse: collapse; }"));
  assert.match(skin, /\.pg-skin \.pr-plan-table td\.pg-in :is\(input, select\) \{ display: block; width: 100%;/);
  // No inline widths on the controls any more: the column decides.
  assert.doesNotMatch(editor, /<input \{\.\.\.grid\} style=/);
  assert.match(editor, /<td className="pg-in num"><div className="pg-qty">/);
  // The sheet's blocks keep one gap, and its tables are framed.
  assert.match(skin, /\.pg-skin \.panel-body:not\(\.flush\) > \* \+ \* \{ margin-top: 12px; \}/);
  assert.match(skin, /\.pg-skin \.panel-body:not\(\.flush\) > \.table-wrap \{ border: 1px solid var\(--pg-divider\); border-radius: 8px;/);
});

test("outsource is bought on a PR like material: on the BOM, marked on the screens, named to the ERP (owner 2026-11-19)", () => {
  const migration = read("database/migrations/108_bom_outsource_lines.sql");
  // Existing BOMs: the old hidden SVC lines of category 07 show again, and the missing ones are added once.
  assert.match(migration, /SET bl.section_code = N'OUT'[^;]+WHERE bl.section_code = N'SVC'[^;]+AND ci.category_code = N'07';/);
  assert.match(migration, /AND b.status IN [(]N'Draft', N'Released'[)]/);
  assert.match(migration, /AND NOT EXISTS [(]SELECT 1 FROM dbo.bom_lines existing WHERE existing.bom_id = s.bom_id AND existing.estimate_line_id = ci.id[)];/);
  assert.match(migration, /VALUES [(]108, N'Outsource lines on BOMs'[)];/);
  // The ERP is told the line is outside labour or a service.
  assert.match(requisitions, /CASE WHEN bl.section_code=N'[$][{]OUTSOURCE_SECTION[}]' THEN 1 ELSE 0 END outsource/);
  assert.match(read("backend-node/src/erp-purchasing.ts"), /line.outsource [?] "Outsource" : ""/);
  // The PR sheet and the BOM mark an outsource line.
  assert.match(editor, /line[?]?.sectionCode === "OUT"/);
  assert.match(material, /line.sectionCode === "OUT"/);
});

test("a new PR starts empty; the estimate is a reference to pull from, and prices are approximate (owner 2026-11-19)", () => {
  // Ten rows to type into, not the estimate's lines ticked.
  assert.ok(editor.includes('startingPrRows([...lines.values()], start && start.bomId === effectiveBomId ? start.lineIds : [], onlyModule, "start")'));
  assert.ok(!editor.includes("draftFromBom("));
  // The estimate's lines sit in their own panel; one is brought in by a press, and all that are still to buy by another.
  assert.ok(editor.includes('<div className="pr-estimate">'));
  assert.ok(editor.includes("onClick={() => pull([line])}"));
  assert.ok(editor.includes("onClick={() => pull(pullable)}"));
  // Every cell of a row can be typed over; a row from the estimate then buys something in that line's place.
  assert.ok(editor.includes("afterEdit({ ...row, ...patch }, row.bomLineId === null ? undefined : lines.get(row.bomLineId), ITEM_FIELDS.some((field) => field in patch))"));
  assert.ok(!editor.includes("disabled={!row.selected}"));
  assert.ok(!editor.includes('type="checkbox"'));
  // A row with no module yet is asked for one, and is not shown as a budget overrun meanwhile.
  assert.ok(editor.includes("moduleStatus(live.filter((row) => modules.some((name) => name.toLocaleLowerCase() === row.module.toLocaleLowerCase()))"));
  // The price is an approximate one, in the sheet and on the PR.
  assert.ok(editor.includes('<LocalizedText text={"ราคาประมาณ"} />'));
  assert.ok(editor.includes('<LocalizedText text={"ยอดขอซื้อ (ประมาณ)"} />'));
  assert.ok(material.includes('<th className="num"><LocalizedText text={"ราคาประมาณ"} /></th>'));
  assert.ok(material.includes('const PR_KIND_TONE = { Planned: "blue", Substitute: "violet", Unplanned: "slate" } as const;'));
});

test("a row is added from inside the PR sheet's table: + on a row, and an add-row line under the last one (owner 2026-11-20)", () => {
  const skin = read("app/system/production/pegasus-skin.css");
  // The + opens an empty row under its own row, in that row's module, and puts the cursor in it.
  assert.ok(editor.includes('aria-label={t("แทรกแถวใต้แถวนี้")} onClick={() => insertBelow(row)}><Icon name="plus" /></button>'));
  assert.ok(editor.includes("insertBlankPrRow(rows, row.key, module ?? (row.module || onlyModule), String(Date.now()))"));
  assert.ok(editor.includes("focusRow(next.key);"));
  // Add and remove keep their place on every row; the way back to the estimate's item comes after them.
  assert.ok(editor.indexOf("insertBelow(row)}>") < editor.indexOf('rowAction("trash"') && editor.indexOf('rowAction("trash"') < editor.indexOf('rowAction("refresh"'));
  assert.ok(skin.includes(".pg-skin .pr-plan-table td.pg-acts { width: auto; padding: 4px 0 0 3px; text-align: left; white-space: nowrap; }"));
  // The add-row line is the table's foot, so Enter on the last row still finds no row under it and opens one.
  assert.ok(editor.includes('<tfoot><tr><td colSpan={12}><button className="pr-add-line" type="button" onClick={() => addUnplanned(1)}>'));
  assert.ok(skin.includes(".pg-skin .pr-add-line {"));
  const copy = read("app/system/production/historical-pr-copy.ts");
  assert.ok(copy.includes('"en": "Add a row below"') && copy.includes('"jp": "下に行を追加"'));
});

test("a BOM has one budget figure: the list and the BOM itself both add up its lines (owner 2026-11-20)", () => {
  // The list once summed the BOM lines (outsource included) while the BOM showed the estimate's material total (no outsource,
  // any revision): THB 955,902.64 against 855,902.64 for one BOM.
  assert.match(boms, /const BOM_BUDGET = `\(SELECT COALESCE\(SUM\(l\.qty_required\*l\.est_unit_cost\),0\) FROM dbo\.bom_lines l WHERE l\.bom_id=b\.id AND l\.deleted_at IS NULL AND \$\{MATERIAL_LINE\}\)`;/);
  // The list, the opened BOM, and the release check against the review threshold.
  assert.equal(boms.split("${BOM_BUDGET} bom_budget").length - 1, 3);
  assert.ok(!boms.includes("v_estimate_totals") && !boms.includes("material_total") && !boms.includes("approvedMaterialBudget"));
  assert.ok(boms.includes("bomBudget: Number(h.bom_budget ?? 0)"));
  assert.ok(material.includes('<KpiCard label="Budget" value={money(bom.bomBudget)}'));
  assert.ok(!material.includes("approvedMaterialBudget") && !material.includes("Approved budget"));
});

test("the BOM shows money and line counts, never quantities added across units (owner 2026-11-20)", () => {
  const detail = material.slice(material.indexOf("function BomDetailModal("), material.indexOf("function ReserveStockModal("));
  assert.ok(detail.includes('<KpiCard label="ยังต้องซื้อ" value={money(toBuy.reduce((sum, line) => sum + toBuyValue(line), 0))} note={`${toBuy.length} ${t("รายการ")}`}'));
  assert.ok(detail.includes('<KpiCard label="ขอซื้อแล้ว" value={money(requestedValue)}'));
  assert.doesNotMatch(detail, /KpiCard[^>]*value=\{quantity\(/);
});

test("the BOM's lines can be filtered, exported and ticked to start a PR; empty Actions columns are gone (owner 2026-11-20)", () => {
  const detail = material.slice(material.indexOf("function BomDetailModal("), material.indexOf("function ReserveStockModal("));
  assert.ok(detail.includes('aria-label={t("Module")} onChange={(event) => setModule(event.target.value)}'));
  assert.ok(detail.includes('aria-label={t("Section")} onChange={(event) => setSection(event.target.value)}'));
  assert.ok(detail.includes('exportXlsx(bomSheetRows(bom, shown, estimateBusinessDate()), `BOM_${bom.number}_R${bom.revision}.xlsx`, "BOM")'));
  // Only a released BOM's lines that still need buying can be ticked, by someone who may request.
  assert.ok(detail.includes('const canRequest = Boolean(onRequest) && canReserve && bom.status === "Released";'));
  assert.ok(detail.includes('data-guide="bom.create-pr" disabled={!chosen.length} onClick={() => onRequest?.({ bomId: id, lineIds: chosen })}'));
  // The Reserve column shows only when a line has stock to reserve; the list's Actions column only when a row has an action.
  assert.ok(detail.includes('{anyReservable ? <th><LocalizedText text={"Action"} /></th> : null}'));
  assert.ok(material.includes('{showActions ? <th className="pg-acts"><LocalizedText text={"Actions"} /></th> : null}'));
  assert.ok(material.includes('<RowAction icon="plus" label="สร้าง PR" onClick={() => onRequest?.({ bomId: item.id, lineIds: [] })} />'));
  // The PR screen opens the sheet on that BOM with the ticked lines.
  assert.ok(material.includes("embedded onRequest={(from) => { setStart(from); setCreating(true); }} />"));
  assert.ok(material.includes("start={start ?? undefined} onClose={() => { setCreating(false); setStart(null); }}"));
  assert.ok(editor.includes("const [bomId, setBomId] = useState(start?.bomId ?? 0);"));
  // The ERP workbook's sheet name stays the default of the shared writer.
  assert.ok(read("lib/export-xlsx.ts").includes('export function exportXlsx(rows:CellValue[][],filename:string,sheetName="Summary cost") {'));
});

test("BOM revisions count from zero and show as R<n>, like the estimate's (migration 109)", () => {
  assert.ok(boms.includes("VALUES(@number,0,@project,@estimate,N'Draft',@actor,@actor);"));
  assert.ok(material.includes('<small className="muted">R{item.revision}</small>'));
  assert.ok(!material.includes('<LocalizedText text={"Rev."} />'));
  const migration = read("database/migrations/109_bom_revision_zero_based.sql");
  assert.match(migration, /THROW 51109, 'Migration 108 must be applied before migration 109\.', 1;/);
  // A BOM number that already has a revision 0 is left alone, so a second run changes nothing.
  assert.match(migration, /SET b\.revision = b\.revision - 1\s+FROM dbo\.boms b\s+WHERE NOT EXISTS \(SELECT 1 FROM dbo\.boms z WHERE z\.bom_no = b\.bom_no AND z\.revision = 0\);/);
  assert.match(migration, /VALUES \(109, N'BOM revisions count from zero'\);/);
  const rollback = read("database/rollback/109_bom_revision_zero_based.rollback.sql");
  assert.match(rollback, /UPDATE dbo\.boms SET revision = revision \+ 1;\s+DELETE FROM dbo\.schema_versions WHERE version = 109;/);
  assert.ok(read("backend-node/src/migration-validation.ts").includes('{ version: 109, fileName: "109_bom_revision_zero_based.sql", name: "BOM revisions count from zero" }'));
  assert.ok(read("database/scripts/020_deploy_fresh_database.sql").includes(":r database/migrations/109_bom_revision_zero_based.sql"));
});

test("a BOM at or over the review threshold is released by a second person (migration 110, owner 2026-11-20)", () => {
  // The refusal is in the release itself, not only in what the screen offers.
  assert.match(boms, /if \(reviewed && needsSecondReleaser\(Number\(reviewed\.bom_budget\), threshold\(reviewed\.review_threshold\), Number\(reviewed\.created_by\), actor\.id\)\)\s+throw new ApiError\(403, "bom_self_release_forbidden"/);
  assert.ok(boms.includes('needsSecondReleaser: row.status === "Draft" && needsSecondReleaser(Number(row.bom_budget), threshold(row.review_threshold), Number(row.created_by), actor.id),'));
  // The budget it compares is the one figure the screens show.
  assert.ok(boms.includes("`SELECT ${BOM_BUDGET} bom_budget,b.created_by,${REVIEW_THRESHOLD} review_threshold FROM dbo.boms b WHERE b.id=@id;`"));
  assert.ok(material.includes('item.needsSecondReleaser'));
  assert.ok(material.includes('guide="bom.release" disabled onClick={() => undefined} />'));
  const migration = read("database/migrations/110_bom_review_threshold.sql");
  assert.match(migration, /THROW 51110, 'Migration 109 must be applied before migration 110\.', 1;/);
  assert.match(migration, /bom_review_threshold decimal\(19,4\)\s+NOT NULL CONSTRAINT DF_procurement_settings_bom_review DEFAULT 100000/);
  assert.match(migration, /GRANT SELECT ON OBJECT::dbo\.procurement_settings TO \[iot_team_app_role\];/);
  assert.match(migration, /VALUES \(110, N'BOM review threshold'\);/);
  assert.match(read("database/rollback/110_bom_review_threshold.rollback.sql"), /DROP TABLE dbo\.procurement_settings;\s+DELETE FROM dbo\.schema_versions WHERE version = 110;/);
  assert.ok(read("backend-node/src/migration-validation.ts").includes('{ version: 110, fileName: "110_bom_review_threshold.sql", name: "BOM review threshold" }'));
  assert.ok(read("database/scripts/020_deploy_fresh_database.sql").includes(":r database/migrations/110_bom_review_threshold.sql"));
});
