import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
assert.equal(process.platform,'darwin');
process.env.PATH='/opt/homebrew/bin:/usr/local/bin:'+process.env.PATH;
const dir='/Users/tomastc/iot-team-center/src';
assert.equal(fs.realpathSync(dir),dir);
const env=fs.readFileSync(dir+'/.env','utf8');
for(const line of env.split(/\r?\n/)) {
 const match=line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
 if(!match || !/NAS|SMB|STORAGE|DOCUMENT/i.test(match[1])) continue;
 console.log('STORAGE_SETTING '+match[1]+'='+(/PASS|SECRET|TOKEN|KEY|USER|CREDENTIAL/i.test(match[1])?'[configured]':match[2].replace(/\/\/[^/]*@/g,'//[redacted]@')));
}
function run(args){const r=spawnSync('docker',['--context','colima-iot',...args],{cwd:dir,encoding:'utf8',timeout:30000});assert.equal(r.status,0,'Docker inspection failed');return r.stdout;}
const containers=JSON.parse(run(['inspect','src-api-1']));
const c=containers[0];
console.log('API_MOUNTS '+JSON.stringify(c.Mounts.map(m=>({type:m.Type,name:m.Name,source:m.Source,destination:m.Destination,rw:m.RW}))));
console.log('API_STORAGE_ENV '+JSON.stringify(c.Config.Env.filter(v=>/^DocumentStorage__(Mode|RootPath)=/.test(v))));
for(const m of c.Mounts.filter(m=>m.Type==='volume')){const v=JSON.parse(run(['volume','inspect',m.Name]))[0];console.log('VOLUME '+JSON.stringify({name:v.Name,driver:v.Driver,optionsConfigured:!!v.Options,device:v.Options?.device,type:v.Options?.type}));}
const mount=spawnSync('/sbin/mount',[],{encoding:'utf8'});
console.log('NAS_HOST_MOUNTS '+mount.stdout.split('\n').filter(l=>/smbfs|100\.64\.0\.53/.test(l)).map(l=>l.replace(/\/\/[^/]*@/g,'//[redacted]@')).join('\n'));
const vm=spawnSync('colima',['ssh','-p','iot','--','sh','-c','cat /proc/mounts | grep -E "cifs|100.64.0.53" || true'],{encoding:'utf8',timeout:30000});
console.log('NAS_VM_MOUNTS '+(vm.stdout||'').replace(/username=[^, ]+/g,'username=[redacted]').replace(/password=[^, ]+/g,'password=[redacted]'));
console.log('NAS_HOST_ENTRIES '+JSON.stringify(fs.readdirSync('/Volumes')));
console.log('INSPECTION_COMPLETE');
