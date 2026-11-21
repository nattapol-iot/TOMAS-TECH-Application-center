import assert from "node:assert/strict";
import test from "node:test";
import { encryptedTransport } from "../src/sql-transport.js";

test("a trusted certificate on an IP address gets a placeholder TLS server name; anything else keeps the address", () => {
  assert.deepEqual(encryptedTransport("202.0.113.10", true), { encrypt: true, trustServerCertificate: true, serverName: "sqlserver.invalid" });
  assert.deepEqual(encryptedTransport("::1", true), { encrypt: true, trustServerCertificate: true, serverName: "sqlserver.invalid" });
  assert.deepEqual(encryptedTransport("sql.example.test", true), { encrypt: true, trustServerCertificate: true });
  assert.deepEqual(encryptedTransport("202.0.113.10", false), { encrypt: true, trustServerCertificate: false });
});
