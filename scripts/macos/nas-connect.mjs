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

// Bounded discovery only: never print file contents, credentials, or unrelated settings.
const home='/Users/tomastc';
const ignored=new Set(['node_modules','.git','.Trash','Library','Pictures','Movies','Music',
 '.ssh','.npm','.cache','.rustup','.cargo','dist','build','vendor','venv','.venv']);
const needles=['100.64.0.53','IoT Department','IoT Team Center'];
let examined=0,bytes=0,limited=false;
const hits=[];
function inspectConfig(file){
 if(examined>=12000 || bytes>64*1024*1024){limited=true;return;}
 try {
  const stat=fs.lstatSync(file);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>512*1024)return;
  examined++;bytes+=stat.size;
  const text=fs.readFileSync(file,'utf8');
  const targetMatch=needles.some(n=>text.includes(n));
  const envFile=/(^|\/)\.env(?:[.\-][^/]*)?$|\.env\.(input|example)$|\.nsmbrc$/.test(file);
  const keys=[...text.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map(m=>m[1]);
  const storageKeys=keys.filter(k=>/NAS|SMB|CIFS|DOCUMENT.?STORAGE|STORAGE.?ROOT|MOUNT/i.test(k));
  if(targetMatch || (envFile && storageKeys.length))hits.push({file,targetMatch,storageKeys});
 }catch(e){if(e.code==='EACCES')console.log('NAS_SEARCH_UNREADABLE '+file);}
}
function walk(root,depth){
 if(depth>6 || limited)return;
 let entries;try{entries=fs.readdirSync(root,{withFileTypes:true});}catch{return;}
 for(const e of entries){
  if(e.isSymbolicLink() || ignored.has(e.name))continue;
  const file=root+'/'+e.name;
  if(e.isDirectory())walk(file,depth+1);
  else if(e.isFile() && (/^\.env(?:[.\-].*)?$|\.env\.(input|example)$|\.nsmbrc$|\.(ya?ml|toml|ini|conf|cfg|sh|mjs|cjs)$/.test(e.name)))inspectConfig(file);
 }
}
walk(home,0);
for(const file of [home+'/.nsmbrc','/etc/nsmb.conf','/etc/fstab',home+'/.colima/iot/colima.yaml'])inspectConfig(file);
for(const root of ['/etc/iot-team-center',home+'/Library/LaunchAgents'])walk(root,0);
console.log('NAS_SEARCH '+JSON.stringify({examined,bytes,limited,hits}));
console.log('NAS_SEARCH_COMPLETE');
