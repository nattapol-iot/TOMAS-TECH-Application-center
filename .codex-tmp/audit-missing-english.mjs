import fs from 'node:fs';
const source=fs.readFileSync('.codex-tmp/missing-language.mjs','utf8');
fs.writeFileSync('.codex-tmp/audit-missing-english-run.mjs',source.slice(0,source.indexOf('const {translate}'))+`const {DICTIONARY}=load('app/system/i18n.ts');const keys=Object.entries(DICTIONARY).filter(([key,value])=>/[\\u0E00-\\u0E7F]/.test(key)&&!value.en).map(([key])=>key); console.log(JSON.stringify(keys));`);
