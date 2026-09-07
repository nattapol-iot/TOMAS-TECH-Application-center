import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument,degrees } from "pdf-lib";
import { parsePlacement,loadSigningPdf,validatePage,imageTransform } from "../src/signing-pdf.js";

test("placement rejects non-finite, off-page, zero-sized and unknown pages",async()=>{
  const valid={page:1,x:.2,y:.3,width:.25,height:.1};
  assert.deepEqual(parsePlacement(valid),valid);
  for(const invalid of [{...valid,x:NaN},{...valid,width:0},{...valid,x:.9},{...valid,y:-.1},{...valid,page:1.5},{...valid,height:Infinity},{...valid,page:201}]) assert.throws(()=>parsePlacement(invalid));
  const pdf=await PDFDocument.create();pdf.addPage([400,600]);assert.throws(()=>validatePage(pdf,{...valid,page:2}));
});
test("display coordinates map to PDF CropBox for every right-angle rotation",()=>{
  const box={x:30,y:40,width:400,height:600};const rect={x:20,y:50,width:100,height:30};
  assert.deepEqual(imageTransform(box,0,rect),{x:50,y:560,rotate:degrees(0)});
  assert.deepEqual(imageTransform(box,90,rect),{x:110,y:60,rotate:degrees(90)});
  assert.deepEqual(imageTransform(box,180,rect),{x:410,y:120,rotate:degrees(180)});
  assert.deepEqual(imageTransform(box,270,rect),{x:350,y:620,rotate:degrees(270)});
});
test("PDF validation rejects changed source bytes and unsupported formats",async()=>{
  const doc=await PDFDocument.create();doc.addPage();const bytes=await doc.save();
  await assert.rejects(loadSigningPdf(bytes,"application/pdf","0".repeat(64)),/checksum/);
  await assert.rejects(loadSigningPdf(bytes,"text/html"),/PDF, PNG and JPG/);
  assert.equal((await loadSigningPdf(bytes,"application/pdf")).getPageCount(),1);
});
