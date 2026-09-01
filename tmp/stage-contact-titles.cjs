const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const runtime=path.join(process.env.LOCALAPPDATA,'IoTTeamCenter','TeamTest');
const {ReleasePath:baseline}=JSON.parse(fs.readFileSync(path.join(runtime,'settings.json'),'utf8'));
const stage=path.resolve('backend-node/tmp/contact-titles-stage-'+Date.now());
fs.mkdirSync(stage,{recursive:true});fs.cpSync(path.join(baseline,'dist'),path.join(stage,'dist'),{recursive:true});
fs.copyFileSync(path.join(baseline,'package.json'),path.join(stage,'package.json'));
const changed=[];
for(const route of ['sales-customers','master','bootstrap'])for(const ext of ['.js','.js.map','.d.ts','.d.ts.map']){
 const rel='dist/src/routes/'+route+ext,from=path.join('backend-node',rel);
 if(fs.existsSync(from)){fs.copyFileSync(from,path.join(stage,rel));changed.push(rel);}
}
const files=[];
function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else files.push({path:path.relative(stage,f),sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').toUpperCase()});}}
walk(path.join(stage,'dist'));
fs.writeFileSync(path.join(stage,'hotfix.json'),JSON.stringify({baseline,changed,files},null,2));
const fresh=fs.readFileSync('database/scripts/020_deploy_fresh_database.sql','utf8').replace(/^:r database\/migrations\/029_sales_performance_reviews.sql\r?\n/m,'').replace('28, 29, 30, 31)) <> 31','28, 30, 31)) <> 30');
fs.writeFileSync('tmp/031_fresh_without_029.sql',fresh);
fs.writeFileSync('tmp/contact-titles-stage.txt',stage);
console.log(JSON.stringify({stage,artifacts:files.length,changed}));
