import fs from 'node:fs';
const rows=fs.readFileSync('.codex-tmp/language-completion.tsv','utf8').trim().split(/\r?\n/).map(l=>l.split('|'));
const dict=Object.fromEntries(rows.map(([key,th,jp,en])=>[key,{th,jp,...(en?{en}:{})}]));
fs.writeFileSync('app/system/language-completion.ts','/** Reviewed interface copy. Never translate user-entered business values. */\nexport const LANGUAGE_COMPLETION: Record<string, {th:string;jp:string;en?:string}> = '+JSON.stringify(dict,null,2)+';\n');
