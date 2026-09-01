import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const entries=[];
for(const name of fs.readdirSync('app/system/production')){if(!name.endsWith('.tsx'))continue;const p='app/system/production/'+name;const source=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function walk(n){if(ts.isJsxAttribute(n)&&['placeholder','title','aria-label'].includes(n.name.getText())&&n.initializer&&ts.isStringLiteral(n.initializer)){const tag=n.parent.parent.tagName?.getText();if(tag&&/^[a-z]/.test(tag))entries.push({file:name,line:source.getLineAndCharacterOfPosition(n.getStart()).line+1,attribute:n.name.getText(),value:n.initializer.text});}ts.forEachChild(n,walk);}walk(source);
}
const keys=[...new Set(entries.map(e=>e.value))];fs.writeFileSync('tmp/input-hint-keys.json',JSON.stringify(keys));fs.writeFileSync('tmp/input-hint-entries.json',JSON.stringify(entries));keys.forEach((k,i)=>console.log(`${i}: ${k}`));
