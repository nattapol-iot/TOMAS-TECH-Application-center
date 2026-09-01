import fs from 'node:fs';import ts from 'typescript';
const out=new Set();
for(const file of ['app/system/production/ReportScreens.tsx','app/system/production/ReportTemplateLibrary.tsx']) {
 let text=fs.readFileSync(file,'utf8');const source=ts.createSourceFile(file,text,99,true,ts.ScriptKind.TSX),edits=[];
 const wrap=(n)=>{out.add(n.text);edits.push([n.getStart(source),n.end,`t(${JSON.stringify(n.text)})`]);};
 const conditional=(n)=>{if(ts.isStringLiteral(n))wrap(n);else if(ts.isConditionalExpression(n)){conditional(n.whenTrue);conditional(n.whenFalse);}};
 function visit(n){
  if(ts.isJsxText(n)&&/[A-Za-z\u0E00-\u0E7F]/.test(n.text.trim())){let v=n.text.trim();out.add(v);edits.push([n.getStart(source),n.end,`{t(${JSON.stringify(v)})}`]);return;}
  if(ts.isJsxAttribute(n)&&['label','title','subtitle','placeholder','aria-label','message','eyebrow'].includes(n.name.getText(source))&&n.initializer&&ts.isStringLiteral(n.initializer)){let v=n.initializer.text;out.add(v);edits.push([n.initializer.getStart(source),n.initializer.end,`{t(${JSON.stringify(v)})}`]);return;}
  if(ts.isJsxExpression(n)&&n.expression){conditional(n.expression);}
  ts.forEachChild(n,visit);
 }
 visit(source);
 for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0]))text=text.slice(0,start)+value+text.slice(end);
 // Add UI hook once to each component which now calls t and has no local translator.
 const parsed=ts.createSourceFile(file,text,99,true,ts.ScriptKind.TSX),hooks=[];
 for(const n of parsed.statements)if(ts.isFunctionDeclaration(n)&&n.body&&n.name&&/^[A-Z]/.test(n.name.text)&&/\bt\(/.test(n.body.getText(parsed))&&!/const t =/.test(n.body.getText(parsed)))hooks.push(n.body.getStart(parsed)+1);
 for(const pos of hooks.reverse())text=text.slice(0,pos)+'\n  const t = useUiText();'+text.slice(pos);
 if(file.endsWith('ReportScreens.tsx'))text=text.replace('import { useT as useUiText } from "../i18n";','import { useReportUiText as useUiText } from "./report-ui-copy";');
 else text='import { useReportUiText as useUiText } from "./report-ui-copy";\n'+text;
 fs.writeFileSync(file,text);
}
fs.writeFileSync('tmp/report-ui-phrases.json',JSON.stringify([...out],null,2));
