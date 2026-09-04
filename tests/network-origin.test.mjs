import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../app/system/network-origin.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "network-origin.ts",
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { isPrivateLanIpv4Host, isTrustedWebProtocol } = await import(moduleUrl);

test("private LAN IPv4 detection accepts only RFC1918 boundaries", () => {
  for (const address of [
    "10.0.0.0",
    "10.255.255.255",
    "172.16.0.0",
    "172.31.255.255",
    "192.168.0.0",
    "192.168.255.255",
  ]) {
    assert.equal(isPrivateLanIpv4Host(address), true, address);
  }

  for (const address of [
    "9.255.255.255",
    "11.0.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "192.167.255.255",
    "192.169.0.0",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "224.0.0.1",
    "256.168.1.1",
    "192.168.1",
    "192.168.1.1.1",
    "private.example.com",
    "::1",
    "",
  ]) {
    assert.equal(isPrivateLanIpv4Host(address), false, address);
  }
});

test("private LAN HTTP requires the explicit Team Test exception", () => {
  assert.equal(isTrustedWebProtocol(new URL("https://example.tomastc.com"), false), true);
  assert.equal(isTrustedWebProtocol(new URL("http://localhost:3000"), false), true);
  assert.equal(isTrustedWebProtocol(new URL("http://127.0.0.1:3000"), false), true);
  assert.equal(isTrustedWebProtocol(new URL("http://[::1]:3000"), false), true);
  assert.equal(isTrustedWebProtocol(new URL("http://192.168.1.140:3000"), false), false);
  assert.equal(isTrustedWebProtocol(new URL("http://192.168.1.140:3000"), true), true);
  assert.equal(isTrustedWebProtocol(new URL("http://8.8.8.8:3000"), true), false);
  assert.equal(isTrustedWebProtocol(new URL("ws://192.168.1.140:3000"), true), false);
});
