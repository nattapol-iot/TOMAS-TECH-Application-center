const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ReleasePath:baseline}=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'IoTTeamCenter/TeamTest/settings.json'),'utf8'));
const stage=path.resolve('backend-node/tmp/excel-import-stage-'+Date.now());fs.mkdirSync(stage,{recursive:true});fs.cpSync(path.join(baseline,'dist'),path.join(stage,'dist'),{recursive:true});fs.copyFileSync(path.join(baseline,'package.json'),path.join(stage,'package.json'));
const changed=[];
for(const route of ['estimate-excel-import','estimates','estimate-workspace-write'])for(const ext of ['.js','.js.map','.d.ts']){const rel='dist/src/routes/'+route+ext;fs.copyFileSync(path.join('backend-node',rel),path.join(stage,rel));changed.push(rel);}
// Registration and schema32 health already exist in this deployed baseline.
const files=[];function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else files.push({path:path.relative(stage,f),sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').toUpperCase()});}}walk(path.join(stage,'dist'));
fs.writeFileSync(path.join(stage,'hotfix.json'),JSON.stringify({baseline,changed,files},null,2));fs.writeFileSync('tmp/excel-import-stage.txt',stage);console.log(JSON.stringify({stage,changed,artifacts:files.length}));

