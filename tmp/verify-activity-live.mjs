import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const runtime=join(process.env.LOCALAPPDATA,'IoTTeamCenter','TeamTest');
const settings=JSON.parse(readFileSync(join(runtime,'settings.json'),'utf8').replace(/^\uFEFF/,''));
const stage=readFileSync('tmp/activity-stage.txt','utf8'),manifest=JSON.parse(readFileSync(join(stage,'activity-release.json'),'utf8'));
for(const artifact of manifest.files)assert.equal(digest(readFileSync(join(settings.ReleasePath,artifact.path))),artifact.sha256,artifact.path);
const ready=await (await fetch('http://127.0.0.1:5105/health/ready')).json();assert.equal(ready.status,'ready');assert.equal(ready.schemaVersion,35);
const origin='http://192.168.1.160:3000',response=await fetch(origin);assert.equal(response.status,200);const html=await response.text();
const assets=[...new Set([...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)].map(m=>m[1]).filter(s=>s.startsWith('/')))];assert.ok(assets.length>=2);
for(const asset of assets){const file=join('dist','client',asset.slice(1));assert.ok(existsSync(file),file);const res=await fetch(origin+asset);assert.equal(res.status,200,asset);assert.equal(digest(Buffer.from(await res.arrayBuffer())),digest(readFileSync(file)),asset);}
const result={release:settings.ReleasePath,artifacts:manifest.files.length,assets:assets.length,schemaVersion:ready.schemaVersion,status:ready.status,origin};
writeFileSync('tmp/activity-team-live-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
