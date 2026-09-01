import fs from 'node:fs';import ts from 'typescript';
for(const file of ['app/system/production/ReportScreens.tsx','app/system/production/ReportTemplateLibrary.tsx']) {
 let text=fs.readFileSync(file,'utf8'),src=ts.createSourceFile(file,text,99,true,ts.ScriptKind.TSX),edits=[];
 function visit(n){if(ts.isJsxAttribute(n)&&!['label','title','subtitle','placeholder','aria-label','message','eyebrow'].includes(n.name.getText(src))){function undo(x){if(ts.isCallExpression(x)&&x.expression.getText(src)==='t'&&x.arguments.length===1){edits.push([x.getStart(src),x.end,x.arguments[0].getText(src)]);return;}ts.forEachChild(x,undo)};undo(n);return;}ts.forEachChild(n,visit)}visit(src);
 for(const [a,b,v] of edits.sort((a,b)=>b[0]-a[0]))text=text.slice(0,a)+v+text.slice(b);
 text=text.replaceAll('&apos;',"'").replaceAll('{t("· R")}',' · R').replaceAll('{t("· V")}',' · V').replaceAll('{t("R")}','R').replaceAll('{t("V")}','V');
 fs.writeFileSync(file,text);
}
