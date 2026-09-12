// Rebuild navigational evidence only. No application execution, network or database access.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));
const files = dir => fs.readdirSync(path.join(root, dir), {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(root,p)), {recursive:true}); fs.writeFileSync(path.join(root,p), s); };
const link = (from, to, label=to) => `[${label}](<${path.relative(path.dirname(from),to).replaceAll('\\','/')}>)`;
const sha = execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const modules = [
 ['shell','Application shell / Login / Profile','เมนู ภาษา session bootstrap และโปรไฟล์','auth-tmt-id bootstrap','ProductionApp.tsx production/ProfileScreen.tsx','auth|tmt-id|routing|remembered-view'],
 ['dashboard','Dashboard / Executive','ภาพรวมผู้บริหารและข้อมูลทีม','executive-dashboard','production/ExecutiveDashboard.tsx production/CoreScreens.tsx','executive-dashboard'],
 ['inquiry','Inquiry / Sales intake','รับงาน ลูกค้า end user และส่งต่อสำรวจ','inquiries inquiry-attachments sales-intakes','production/InquiryScreens.tsx','inquiry|end-user'],
 ['site-visit','Site Visit / My Assignments','นัดหมาย มอบหมาย สำรวจ รายงาน และอนุมัติ','site-visits-read site-visits-workflow site-visit-reports visit-master','production/SiteVisitScreens.tsx','site-visit|inquiry-visit'],
 ['estimate','Estimate Cost','สร้าง revision รายการต้นทุน ค่าใช้จ่าย validation และ workflow','estimates estimate-workspace-read estimate-cost-write estimate-workspace-write estimate-cost-lookup','production/EstimateScreens.tsx production/CostItemFields.tsx production/CostItemLookup.tsx','estimate|cost-item'],
 ['estimate-copy','Copy Estimate / Assignment queue','คัดลอกหลาย ledger และแสดงงานที่ยังไม่เริ่มใน My Work','estimate-copy estimate-assignments-read','production/EstimateScreens.tsx production/PlanningPricingScreens.tsx','estimate-copy|estimate-assignment'],
 ['estimate-erp','ERP Summary / Excel','จัดหมวด ERP สรุปยอด export และ import workbook','estimate-erp estimate-excel-import overhead-policies','production/EstimateScreens.tsx','erp|estimate-excel|overhead|estimate-total'],
 ['labor','Labor Package / Rate Master','เซฟและใช้ชุดค่าแรง version rate และนำกลับมาใช้','labor-packages labor-rates','production/LaborPackageMaster.tsx production/LaborPackagePicker.tsx production/AdminAnalyticsScreens.tsx','labor|engineering-rate'],
 ['templates','Module Templates','สร้าง template โมดูลและนำเข้า estimate','module-templates','production/ModuleTemplateScreens.tsx production/ModuleTemplateEditor.tsx','template-selection|module-template'],
 ['pricing','Price Library / Supplier Quotation','ราคาย้อนหลัง ใบเสนอราคา PDF parser และติดตามราคาที่ขาด','pricing supplier-quotations','production/PlanningPricingScreens.tsx','quotation|historical-pr'],
 ['projects','Projects / Project Documents','ทะเบียนโครงการ end user และรับส่งเอกสารจาก inquiry/site visit','projects project-documents','production/CoreScreens.tsx','project|end-user'],
 ['planning','Schedule / Resource / My Work','แผนงาน timeline กำลังคน lifecycle งานและคำขอปรับวัน','schedule resource-planning resource-tasks','production/PlanningPricingScreens.tsx production/ResourcePlanningScreen.tsx production/ResourceTaskWorkspace.tsx production/ProjectTimelineScreen.tsx','resource|drawing|schedule'],
 ['procurement','BOM / PR / PO / Approvals','จัดซื้อ อนุมัติ และประวัติ PR','boms purchase-requisitions historical-pr','production/MaterialScreens.tsx','material|historical-pr'],
 ['inventory','Inventory / Receiving / Issues','รับของ เบิกของ stock ledger และการควบคุมยอด','inventory goods-receipts material-issues stock-control','production/MaterialScreens.tsx production/CoreScreens.tsx','material|inventory'],
 ['signing','Sign Drawing / Documents / Stamps','ลงนาม inbox ลายเซ็น ตราบริษัท และตรวจ certificate','signing signature-master','production/SigningScreens.tsx production/SigningPreview.tsx','signing|drawing'],
 ['reports','Reports / Inspection / Report Templates','แก้รายงาน workflow หลักฐาน ส่งออก PDF/PPTX และ customer acknowledgment','unified-reports report-templates reports','production/ReportScreens.tsx production/ReportDocumentForm.tsx production/ReportTemplateLibrary.tsx production/InspectionReportBody.tsx','report'],
 ['knowledge','Knowledge Hub','บทความ เอกสาร collaboration workflow และ sales materials','knowledge-admin knowledge-articles knowledge-collaboration knowledge-documents knowledge-workflow knowledge-sales-materials','production/KnowledgeScreens.tsx','knowledge'],
 ['performance','KPI / Growth / Team Activity','ประเมิน performance หลักฐาน insights และ activity','performance activity','production/PerformanceScreen.tsx production/TeamActivityScreen.tsx','performance|activity'],
 ['support','Support / Employee Manual','แจ้งปัญหา ticket การตอบรับ และคู่มือ','support','production/SupportScreens.tsx production/EmployeeManualScreen.tsx','support|employee-manual'],
 ['master','Master Data / Customers / Admin','ลูกค้า supplier พนักงาน role audit และ settings','master sales-customers admin','production/CoreScreens.tsx production/AdminAnalyticsScreens.tsx','customer|user-role|admin|business-card'],
 ['platform','Platform / Health / Storage','config database migration authentication และ document storage','health','','migration|database|startup|network|audit|http'],
];
const routes = files('backend-node/src/routes').filter(p=>p.endsWith('.ts'));
const tests = [...files('tests'),...files('backend-node/tests')].filter(p=>/\.test\.(mjs|ts)$/.test(p));
const registered = read('backend-node/src/app.ts');
const owners = new Map();
for(const m of modules) for(const r of m[3].split(' ')) { if(owners.has(r)) throw Error(`Duplicate route owner: ${r}`); owners.set(r,m[0]); }
for(const p of routes) { const name=path.basename(p,'.ts'); if(!owners.has(name)) throw Error(`Unmapped route: ${name}`); }

function inspect(p) {
 const text=read(p), ast=ts.createSourceFile(p,text,ts.ScriptTarget.Latest,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const line=n=>ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1;
 const end=n=>ast.getLineAndCharacterOfPosition(n.end).line+1;
 const symbols=[], endpoints=[], imports=[];
 for(const n of ast.statements) {
  if(ts.isFunctionDeclaration(n)&&n.name) symbols.push([n.name.text,line(n),end(n)]);
  if(ts.isVariableStatement(n)) for(const d of n.declarationList.declarations) if(ts.isIdentifier(d.name)&&d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer))) symbols.push([d.name.text,line(d),end(d)]);
  if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text.startsWith('.')) {
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(p),n.moduleSpecifier.text));
   const resolved=[target,target.replace(/\.js$/,'.ts'),target+'.ts',target+'.tsx',target+'/index.ts'].find(exists);
   if(resolved) imports.push(resolved);
  }
 }
 function visit(n) {
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&/^(get|post|put|patch|delete|head|options)$/.test(n.expression.name.text)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text.startsWith('/')) endpoints.push([n.expression.name.text.toUpperCase(),n.arguments[0].text,line(n),end(n)]);
  ts.forEachChild(n,visit);
 }
 visit(ast);
 return {symbols,endpoints,imports,text};
}
const symbolRows=(from,p,items)=>items.map(([name,start,end])=>`| \`${name}\` | ${link(from,p)} | ${start}–${end} |`).join('\n');
let endpointCount=0;
for(const p of routes) {
 const name=path.basename(p,'.ts'), out=`docs/context/api/${name}.md`, info=inspect(p);
 endpointCount+=info.endpoints.length;
 const tables=[...new Set(info.text.match(/\bdbo\.[A-Za-z_][A-Za-z_0-9]*/g)||[])].sort();
 write(out,`# ${name}\n\n[Module](../modules/${owners.get(name)}.md) · [Index](../../../AGENTS.md)\n\nEvidence: source snapshot \`${sha}\`; generated, do not edit. ${link(out,p)}. Ranges are hints: search symbol after edits.\n\n## API operations\n\n| Method | Path | Source lines |\n|---|---|---|\n${info.endpoints.map(([method,url,start,end])=>`| ${method} | \`${url}\` | ${start}–${end} |`).join('\n')}\n\n## Named functions\n\n| Symbol | Source | Lines |\n|---|---|---|\n${symbolRows(out,p,info.symbols)}\n\n## Direct local dependencies\n\n${info.imports.map(d=>'- '+link(out,d)).join('\n')}\n\n## SQL references (literal scan, not a complete schema or write-set)\n\n${tables.map(t=>'`'+t+'`').join(', ')||'No literal dbo reference in this file; follow dependencies.'}\n\n## Change boundary\n\nRead the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.\n`);
}
for(const [id,title,purpose,routeNames,uiNames,pattern] of modules) {
 const out=`docs/context/modules/${id}.md`, ui=uiNames.split(' ').filter(Boolean).map(p=>'app/system/'+p).filter(exists);
 const backend=routeNames.split(' ').map(r=>`backend-node/src/routes/${r}.ts`);
 const deps=[...new Set([...backend,...ui].flatMap(p=>inspect(p).imports))].filter(p=>!/^backend-node\/src\/(config|db|http|errors|users|types|audit)\.ts$/.test(p));
 const matchingTests=tests.filter(p=>new RegExp(pattern).test(path.basename(p)));
 write(out,`# ${title}\n\n[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)\n\n${purpose}\n\nEvidence: snapshot \`${sha}\`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.\n\n## Read only the operation you change\n\n${routeNames.split(' ').map(r=>`- [${r} API and function map](../api/${r}.md)${registered.includes('/'+r+'.js')?' — registered in Node app':''}`).join('\n')}\n\n## UI function locator\n\nShared screens contain other modules: use the symbol and line range instead of reading the whole file.\n\n| Symbol | Source | Lines |\n|---|---|---|\n${ui.map(p=>symbolRows(out,p,inspect(p).symbols)).join('\n')}\n\n## Domain helpers / direct dependencies\n\n${deps.map(p=>'- '+link(out,p)).join('\n')}\n\n## Candidate regression tests\n\n${matchingTests.map(p=>'- '+link(out,p)).join('\n')||'No filename-matched tests. Inspect production-guardrails and tests importing the touched file.'}\n\n## Client contract lookup\n\nSearch the selected API path or function in ${link(out,'app/system/api-client.ts')}; follow its screen callers. Common UI/language changes require ${link(out,'app/system/ui.tsx')} and ${link(out,'app/system/i18n.ts')}. For SQL changes use [schema map](../SCHEMA.md).\n`);
}
const migrations=files('database/migrations').filter(p=>p.endsWith('.sql')).sort();
const schema='docs/context/SCHEMA.md';
write(schema,`# Schema navigation\n\n[Context index](../../AGENTS.md)\n\nEvidence: repository migrations at \`${sha}\`. Highest file number is not proof of the live DB version. No credentials or connection strings are stored here.\n\n| Migration | Objects mentioned (literal CREATE TABLE / VIEW only) |\n|---|---|\n${migrations.map(p=>{const objects=[...read(p).matchAll(/CREATE\s+(?:OR\s+ALTER\s+)?(?:TABLE|VIEW)\s+([\w.\[\]]+)/gi)].map(m=>m[1]);return `| ${link(schema,p,path.basename(p))} | ${[...new Set(objects)].map(s=>'`'+s+'`').join(', ')||'Inspect migration SQL'} |`;}).join('\n')}\n\nRead ${link(schema,'backend-node/src/migration-validation.ts')}, ${link(schema,'backend-node/src/startup-migrations.ts')} and ${link(schema,'backend-node/src/migrate.ts')} before planning a migration. Applied migration identities and environment flags matter; never rewrite an already applied migration.\n`);
const index='AGENTS.md';
const indexContent = `## Project Context — IoT Team Center\n\nจุดเริ่มต้นเดียวสำหรับ AI · Source snapshot: \`${sha}\` · เอกสารอ้างโค้ด ไม่ใช่สถานะ live\n\n## อ่านแบบประหยัด Context\n\n1. อ่านกฎด้านบน แล้วเลือกโมดูลด้านล่างเพียงหนึ่งเรื่อง\n2. เปิด module card แล้วเลือก API operation / ชื่อฟังก์ชันที่เกี่ยวข้อง\n3. อ่าน source เฉพาะ handler และ helper ที่เรียก พร้อม test ของเส้นทางนั้น\n4. เปิด Architecture เมื่อแก้ข้ามระบบ; เปิด Schema เมื่อแก้ SQL; อย่าโหลด docs ทั้งโฟลเดอร์\n5. เมื่อเปลี่ยนโค้ด อัปเดต context ด้วยคำสั่งใน Change guide\n\n## สารบัญฟีเจอร์\n\n| Module | ขอบเขต |\n|---|---|\n${modules.map(([id,title,purpose])=>`| [${title}](docs/context/modules/${id}.md) | ${purpose} |`).join('\n')}\n\n## เอกสารส่วนกลาง — เปิดตามงาน\n\n- [Architecture / boundaries](docs/context/ARCHITECTURE.md)\n- [Change workflow / tests / update context](docs/context/WORKFLOW.md)\n- [Schema / migrations](docs/context/SCHEMA.md)\n- [Analysis and known limits](docs/context/ANALYSIS.md)\n- [เอกสารเดิม: specs, design, audit, releases](docs/README.md) — ใช้เป็นข้อมูลเฉพาะเรื่องตามวันที่ ไม่อ่านทั้งหมดตั้งแต่เริ่ม\n\n## ทางลัดปัญหาที่พบบ่อย\n\n- Copy Estimate → estimate-copy → POST copy handler + estimate-copy-plan\n- Assign แล้วไม่เห็น My Work → estimate-copy → assignments-read + estimate-assignment-queue\n- Labor ที่บันทึกไว้ → labor → LaborPackageMaster + labor-packages\n- ERP / Summary cost / Export Excel → estimate-erp → estimate-erp API + lib/erp-estimate-workbook.ts\n- เลือก Template ไม่ได้ → templates และ estimate → apply-template + tests/estimate-template-selection.test.mjs\n- Sign Drawing → signing และ planning → drawing-workflow + resource-tasks\n- Supplier PDF / upload / ราคา → pricing → supplier-quotations + pdf-parser/main.py\n\n## Contract\n\nNode API ที่ใช้อ้างอิงอยู่ backend-node/; backend/ (.NET), backend-php/ และ worker/ เป็นเส้นทางอีกชุด อย่าแก้โดยสมมติว่าเป็น runtime เดียวกัน. Permission, role, scope และสถานะงานต้องตรวจในโค้ดเส้นทางจริง; requirement ที่ผู้ใช้เคยขอไม่ได้ยืนยันว่า implemented แล้ว.\n\nGenerated inventory: ${modules.length} modules, ${routes.length} route files, ${endpointCount} literal HTTP operations. ไฟล์ที่ใช้ร่วมกันอาจปรากฏหลาย module; endpoint extraction ไม่ได้แทนการตรวจ runtime.\n`;
console.log(`Generated ${modules.length} module cards, ${routes.length} API cards, ${endpointCount} operations, schema and root index at ${sha}.`);

const startMarker = '<!-- PROJECT-CONTEXT:START -->';
const endMarker = '<!-- PROJECT-CONTEXT:END -->';
const rules = read(index);
const start = rules.indexOf(startMarker), end = rules.indexOf(endMarker);
if (start < 0 || end < start || rules.indexOf(startMarker, start + 1) !== -1 || rules.indexOf(endMarker, end + 1) !== -1) throw Error('Missing or duplicate context markers in AGENTS.md');
write(index, rules.slice(0, start) + startMarker + '\n' + indexContent + endMarker + rules.slice(end + endMarker.length));
write('PROJECT_CONTEXT.md', '# Project Context\n\nย้ายกฎและสารบัญทั้งหมดไปที่ [AGENTS.md](AGENTS.md) แล้ว อ่านไฟล์นั้นเป็นจุดเริ่มต้นเดียว ไฟล์นี้คงไว้เพื่อรองรับลิงก์เดิม\n');
