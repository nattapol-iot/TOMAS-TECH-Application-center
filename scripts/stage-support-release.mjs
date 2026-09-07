import { readFileSync, readdirSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const repo=process.cwd();
const runtime=join(process.env.LOCALAPPDATA,'IoTTeamCenter','TeamTest');
const settings=JSON.parse(readFileSync(join(runtime,'settings.json'),'utf8').replace(/^\uFEFF/,''));
assert.equal(settings.ApiRuntime,'Node');assert.equal(settings.DatabaseName,'IoTTeamCenter_CodexTest_20260830_04');
const baseline=resolve(settings.ReleasePath),compiled=join(repo,'backend-node','dist');
const oldApp=readFileSync(join(baseline,'dist','src','app.js'),'utf8');
// Prior releases inserted import routes selectively. Preserve their exact order.
const anchor='    app.addHook("onClose", async () => database.close());';
assert.equal(oldApp.split(anchor).length,2,'Expected one known live registration anchor.');
assert.ok(!oldApp.includes('registerSupportRoutes'),'Support is already present in this baseline.');
const stage=join(repo,'backend-node','tmp',`support-stage-${Date.now()}`);mkdirSync(stage,{recursive:true});cpSync(join(baseline,'dist'),join(stage,'dist'),{recursive:true});
writeFileSync(join(stage,'package.json'),'{"type":"module"}\n');
const stems=['routes/health','support-rules','support-service','routes/support'];
for(const stem of stems)for(const suffix of ['.js','.js.map','.d.ts'])cpSync(join(compiled,'src',stem+suffix),join(stage,'dist','src',stem+suffix));
writeFileSync(join(stage,'dist','src','app.js'),'import { registerSupportRoutes } from "./routes/support.js";\n'+oldApp.replace(anchor,'    registerSupportRoutes(app, config, database, users);\n'+anchor).replace(/\/\/# sourceMappingURL=app.js.map\s*$/,''));
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const files=[];
function collect(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isDirectory())collect(file);else files.push({path:relative(stage,file).replaceAll('\\','/'),sha256:digest(file)});}}
collect(join(stage,'dist'));
const migration=join(repo,'database','migrations','034_support_center.sql');
writeFileSync(join(stage,'support-release.json'),JSON.stringify({baseline,files,migrationSha256:digest(migration)},null,2));
writeFileSync(join(repo,'tmp','support-stage.txt'),stage);
console.log(JSON.stringify({stage,artifacts:files.length,baseline}));
