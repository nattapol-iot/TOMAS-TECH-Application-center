import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script=readFileSync(new URL("../scripts/macos/mount-nas.sh",import.meta.url),"utf8").replaceAll("\r\n","\n");
const bash=process.platform==="win32"?`${process.env.ProgramFiles}/Git/bin/bash.exe`:"bash";
test("NAS mount script parses without requiring host Node",()=>{
  assert.ok(!script.includes("node -e"));
  const result=spawnSync(bash,["-n"],{input:script,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr||String(result.error));
});
test("NAS credential URL encoding preserves reserved characters and UTF-8",()=>{
  assert.ok(process.platform!=="win32"||existsSync(bash),"Git Bash is required for this check");
  const helper=script.match(/url_encode\(\) \{[\s\S]*?\n\}/)?.[0];assert.ok(helper);
  for(const value of ["plain-user","space and @:/%","single' double\" $`","!()*\\","ผู้ใช้_日本","line\nbreak",""]){
    const result=spawnSync(bash,["-s"],{input:`${helper}\nurl_encode "$NAS_TEST_VALUE"\n`,env:{...process.env,NAS_TEST_VALUE:value},encoding:"utf8"});
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,encodeURIComponent(value).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`));
  }
});
