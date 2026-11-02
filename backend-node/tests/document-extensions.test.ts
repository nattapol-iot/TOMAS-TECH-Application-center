import assert from "node:assert/strict";
import test from "node:test";
import { contentTypeFor, DOCUMENT_EXTENSIONS, validateFileExtension } from "../src/document-storage.js";
import { ApiError } from "../src/errors.js";

test("customer e-mails, 3D models and other archives are accepted with their own content type (owner 2026-11-02)", () => {
  const added: Record<string, string> = {
    "RFQ from customer.msg": "application/vnd.ms-outlook",
    "Re: line 3.EML": "message/rfc822",
    "frame.step": "model/step",
    "frame.STP": "model/step",
    "frame.igs": "model/iges",
    "drawings.rar": "application/vnd.rar",
    "drawings.7z": "application/x-7z-compressed",
  };
  for (const [fileName, contentType] of Object.entries(added)) {
    assert.equal(validateFileExtension(fileName), fileName.slice(fileName.lastIndexOf(".")).toLowerCase(), fileName);
    assert.equal(contentTypeFor(fileName), contentType, fileName);
  }
  // Every accepted extension has a real content type, so nothing new is served as a bare octet stream.
  for (const extension of DOCUMENT_EXTENSIONS) assert.notEqual(contentTypeFor(`file${extension}`), "application/octet-stream", extension);
});

test("programs and web pages stay refused", () => {
  for (const fileName of ["setup.exe", "run.bat", "page.html", "image.svg", "macro.xlsm", "no-extension"]) {
    assert.throws(() => validateFileExtension(fileName), (error: unknown) => error instanceof ApiError && error.statusCode === 415, fileName);
  }
});
