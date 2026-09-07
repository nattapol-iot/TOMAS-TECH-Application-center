import fs from'node:fs';import ts from'typescript';
const copyFile=ts.createSourceFile('copy.ts',fs.readFileSync('app/system/final-workspace-copy.ts','utf8'),ts.ScriptTarget.Latest,true);let known=new Set();function collect(n){if(ts.isPropertyAssignment(n)&&ts.isStringLiteral(n.name))known.add(n.name.text);ts.forEachChild(n,collect);}collect(copyFile);
// Additional already-translated conditional display fallbacks.
for(const key of ['Man-hour','ลูกค้าจัดหา','อ่านไฟล์ไม่ได้','บันทึก Template แล้ว','ไม่ระบุ'])known.add(key);
for(const name of ['ModuleTemplateEditor','ModuleTemplateScreens','EstimateExcelImport']){
 const file=`app/system/production/${name}.tsx`;let text=fs.readFileSync(file,'utf8');const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const changes=[];
 const fn=name==='ModuleTemplateScreens'?'uiText':'localizeCopy';
 function walk(n){
  if(ts.isJsxText(n)&&known.has(n.text.trim())){const raw=n.getText(source),left=raw.match(/^\s*/)[0],right=raw.match(/\s*$/)[0];changes.push([n.getStart(source),n.end,`${left}<LocalizedText text={${JSON.stringify(n.text.trim())}} />${right}`]);return;}
  if(ts.isStringLiteral(n)&&known.has(n.text.trim())){
   let eligible=false;
   if(ts.isConditionalExpression(n.parent)&&(n.parent.whenTrue===n||n.parent.whenFalse===n))eligible=true;
   if(ts.isBinaryExpression(n.parent)&&n.parent.right===n&&[ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(n.parent.operatorToken.kind))eligible=true;
   if(eligible){let p=n.parent;while(p&&!ts.isJsxExpression(p)&&!ts.isFunctionLike(p))p=p.parent;if(p&&ts.isJsxExpression(p)){const value=n.text.trim();const leading=n.text.slice(0,n.text.indexOf(value)),trailing=n.text.slice(n.text.indexOf(value)+value.length);changes.push([n.getStart(source),n.end,[leading?JSON.stringify(leading):'',`${fn}(${JSON.stringify(value)})`,trailing?JSON.stringify(trailing):''].filter(Boolean).join(' + ')]);return;}}
  }
  ts.forEachChild(n,walk);
 }
 walk(source);for(const[start,end,value]of changes.sort((a,b)=>b[0]-a[0]))text=text.slice(0,start)+value+text.slice(end);
 if(name==='EstimateExcelImport'){
  text=text.replace('export function EstimateImportHistory({ estimateId }: { estimateId: number }) {','export function EstimateImportHistory({ estimateId }: { estimateId: number }) {\n  const localizeCopy = useStaticCopy();');
  text=text.replace('`ยืนยันนำเข้า ${preview?.lines.length ?? 0} รายการ`','localizeCopy("ยืนยันนำเข้า {count} รายการ").replace("{count}", String(preview?.lines.length ?? 0))');
  text=text.replace('className="callout danger">{error}</div>','className="callout danger">{localizeCopy(error)}</div>');
 }
 if(name==='ModuleTemplateEditor'){
  text=text.replace('<span>{error}</span>','<span>{localizeCopy(error)}</span>');
  text=text.replace('aria-label={`รายการ ${index + 1}`}','aria-label={`${localizeCopy("รายการ")} ${index + 1}`}');
  text=text.replace('aria-label={`นำรายการ ${index + 1} ออก`}','aria-label={`${localizeCopy("นำรายการออก")} ${index + 1}`}');
 }
 if(name==='ModuleTemplateScreens')text=text.replace('notify(`${values.name} · บันทึก Template แล้ว`)','notify(`${values.name} · ${uiText("บันทึก Template แล้ว")}`)');
 fs.writeFileSync(file,text);console.log(name,changes.length);
}
