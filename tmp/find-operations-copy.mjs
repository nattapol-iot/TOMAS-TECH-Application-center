import fs from 'node:fs';import ts from 'typescript';
const pending=JSON.parse(fs.readFileSync('.codex-tmp/root-language-pending.json','utf8'));
const selected=new Set();
for(const file of ['PlanningPricingScreens','KnowledgeScreens','AdminAnalyticsScreens','CoreScreens']){
 const path=`app/system/production/${file}.tsx`; const source=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function walk(n){if((ts.isStringLiteral(n)||ts.isJsxText(n))&&pending.includes(n.text.trim()))selected.add(n.text.trim());ts.forEachChild(n,walk);}walk(source);
}
const keys=[...selected];fs.writeFileSync('tmp/operations-workspace-keys.json',JSON.stringify(keys,null,2));console.log(keys.length);keys.forEach((key,i)=>console.log(`${i}: ${key}`));
