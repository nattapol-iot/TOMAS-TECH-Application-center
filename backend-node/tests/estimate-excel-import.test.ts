import assert from 'node:assert/strict';
import test from 'node:test';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { strToU8, zipSync } from 'fflate';
import type { AppConfig } from '../src/config.js';
import type { Database } from '../src/db.js';
import { registerErrorHandler } from '../src/errors.js';
import { parseExcelImport, registerEstimateExcelImportRoutes, validateOriginalEstimateWorkbook } from '../src/routes/estimate-excel-import.js';
import type { CurrentUserService } from '../src/users.js';
const line={kind:'cost',categoryCode:'01',itemCode:'A',module:'Panel',quantity:2,unitCost:50,description:'Part',unit:'Each',source:'EE!10'};
const payload={sourceName:'Example.xlsx',sourceDate:'2026-01-21',sourceTotal:100,hoursPerDay:8,lines:[line]};
test('canonical digest prevents renamed file from creating a duplicate',()=>{const a=parseExcelImport(payload),b=parseExcelImport({...payload,sourceName:'Renamed.xlsx'});assert.equal(a.sourceHash,b.sourceHash);assert.equal(a.sourceHash.length,64);});
test('rejects totals, duplicates, reference costs and invalid precision',()=>{for(const p of [{...payload,sourceTotal:101},{...payload,sourceTotal:200,lines:[line,line]},{...payload,lines:[{...line,kind:'reference'}]},{...payload,lines:[{...line,quantity:2.00001}]},{...payload,hoursPerDay:25}])assert.throws(()=>parseExcelImport(p));});

function workbook(description = 'Item', totalRow = 10) {
  const cell = (reference: string, value: string | number, formula = '') => `<c r="${reference}"${typeof value === 'string' ? ' t="inlineStr"' : ''}>${formula ? `<f>${formula}</f>` : ''}${typeof value === 'string' ? `<is><t>${value}</t></is>` : `<v>${value}</v>`}</c>`;
  const sheet = `<worksheet><sheetData><row r="9">${cell('D9','Hardware')}${cell('E9',description)}${cell('J9',50)}${cell('K9',2)}${cell('L9',100)}</row><row r="${totalRow}">${cell(`L${totalRow}`,100,`SUM($L9:$L${totalRow-1})`)}</row></sheetData></worksheet>`;
  return zipSync({
    'xl/workbook.xml':strToU8('<workbook><sheets><sheet name="Summary cost" sheetId="1" r:id="r1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml':strToU8(sheet),
  });
}

test('uploaded XLSX bytes are parsed and reconciled with the submitted preview',()=>{
  const body={...payload,sourceName:'Example_R01.xlsx',sourceRevision:'R01',lines:[{...line,itemCode:'XL-Sum-9',module:'Item',description:'Item',unit:'Lot',source:'Summary cost!9',brand:'',model:'',supplierName:'',remark:'Summary row 9; Unit not stated; Lot retains quoted quantity'}]};
  const parsed=parseExcelImport(body);
  assert.doesNotThrow(()=>validateOriginalEstimateWorkbook(parsed,workbook(),body.sourceName));
  assert.throws(()=>validateOriginalEstimateWorkbook(parsed,Buffer.from('PK\x03\x04 invalid'),body.sourceName),/readable XLSX/);
  assert.throws(()=>validateOriginalEstimateWorkbook(parsed,workbook('Changed'),body.sourceName),/do not match/);
  assert.throws(()=>validateOriginalEstimateWorkbook(parsed,workbook('Item',9_999_999),body.sourceName),/row range is too large/);
});

test('Excel imports require one multipart original workbook before database access',async()=>{
  let databaseTouched=false;
  const database={query:async()=>{databaseTouched=true;throw new Error('unexpected database access');},transaction:async()=>{databaseTouched=true;throw new Error('unexpected transaction');}} as unknown as Database;
  const users={demandPermission:async()=>{},required:async()=>({id:1,name:'Admin',role:'Admin'})} as unknown as CurrentUserService;
  const config={documentStorage:{mode:'Local',rootPath:'tmp/test-estimate-import',maxFileSizeBytes:1_000_000}} as AppConfig;
  const app=Fastify(); registerErrorHandler(app); await app.register(multipart); registerEstimateExcelImportRoutes(app,database,users,config);
  try {
    const json=await app.inject({method:'POST',url:'/api/v1/estimates/1/excel-import',payload});
    assert.equal(json.statusCode,415,json.body); assert.equal(json.json().code,'multipart_required');
    const missingBoundary='----missing-file';
    const missing=await app.inject({method:'POST',url:'/api/v1/estimates/1/excel-import',headers:{'content-type':`multipart/form-data; boundary=${missingBoundary}`},payload:`--${missingBoundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify(payload)}\r\n--${missingBoundary}--\r\n`});
    assert.equal(missing.statusCode,400,missing.body); assert.equal(missing.json().code,'file_required');
    const malformed=await app.inject({method:'POST',url:'/api/v1/estimates/1/excel-import',headers:{'content-type':'multipart/form-data; boundary=broken'},payload:'--broken\r\ninvalid'});
    assert.equal(malformed.statusCode,400,malformed.body);
    assert.equal(databaseTouched,false);
  } finally { await app.close(); }
});
