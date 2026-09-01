import ts from 'typescript';
import fs from 'node:fs';
const path='app/system/production/HistoricalPrPanel.tsx';
let source=fs.readFileSync(path,'utf8');
const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const changes=[]; const keys=new Set();
function replacement(node,value){changes.push([node.getStart(file),node.end,value]);}
function trans(value){keys.add(value);return `t(${JSON.stringify(value)})`;}
function walk(n){
 if(ts.isJsxText(n)&&n.text.trim()) {const value=n.text.trim(); replacement(n,`{${trans(value)}}`);return;}
 if(ts.isJsxAttribute(n)&&['title','subtitle','label','note','message','placeholder','aria-label'].includes(n.name.getText(file))&&n.initializer&&ts.isStringLiteral(n.initializer)){replacement(n.initializer,`{${trans(n.initializer.text)}}`);return;}
 if(ts.isStringLiteral(n)&&/[\u0e00-\u0e7f]/.test(n.text)) {
  let parent=n;while(parent&&!ts.isFunctionDeclaration(parent))parent=parent.parent;
  if(parent&&['HistoricalPrPanel','ImportModal','HistoryDetail','LinesTable'].includes(parent.name?.text))replacement(n,trans(n.text));
  else keys.add(n.text);
  return;
 }
 ts.forEachChild(n,walk);
}
walk(file);
for(const [start,end,value]of changes.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+value+source.slice(end);
source=source.replace('import { historicalPrComparison', 'import { useT, currentLocale } from "../i18n";\nimport { historicalPrComparison');
source=source.replaceAll('toLocaleString("th-TH"','toLocaleString(currentLocale()');
for(const name of ['Totals','HistoricalPrPanel','ImportModal','LinesTable','HistoryDetail','ErrorMessage']){
 const s=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const fn=s.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name);
 const pos=fn.body.getStart(s)+1; source=source.slice(0,pos)+'\n  const t = useT();'+source.slice(pos);
}
source=source.replace('<span>{message}</span>','<span>{t(message)}</span>');
fs.writeFileSync(path,source);fs.writeFileSync('tmp/historical-pr-copy-keys.json',JSON.stringify([...keys],null,2));
